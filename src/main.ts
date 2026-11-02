/*
 * Created with @iobroker/create-adapter v3.1.5
 */

import * as utils from "@iobroker/adapter-core";
import { findObsolete, type SiteExpectation } from "./lib/cleanup";
import { parseScriptRequest, RateLimiter } from "./lib/script-request";
import { createFilter, type ValueFilter } from "./lib/filter";
import { ALARM_LOG_COUNT, mapAlarms } from "./lib/mappers/alarms";
import { mapDiagnostics, type StateDef } from "./lib/mappers/diagnostics";
import { ENERGY_CODES, ENERGY_PERIODS, mapEnergy } from "./lib/mappers/energy";
import { forecastWindow, mapForecast } from "./lib/mappers/forecast";
import { mapLive } from "./lib/mappers/live";
import { mapOverview } from "./lib/mappers/overview";
import { mapPhaseSums } from "./lib/mappers/phase-sums";
import { Poller } from "./lib/poller";
import { StateManager } from "./lib/state-manager";
import type { VrmInstallation } from "./lib/types";
import { VrmApiError, VrmClient } from "./lib/vrm-client";

const MINUTE = 60_000;
/** Delay before retrying the initialization after a (non-auth) failure */
const INIT_RETRY_DELAY = MINUTE;
const INIT_MAX_RETRY_DELAY = 15 * MINUTE;
/** Device list and names change rarely */
const OVERVIEW_INTERVAL = 60 * MINUTE;
/** How often "rest of today" and "current hour" of the forecast are recalculated */
const FORECAST_TICK = 5 * MINUTE;
/** Maximum number of sendTo("get") requests from scripts per minute, VRM limits the requests per token */
const SCRIPT_REQUESTS_PER_MINUTE = 30;

function clamp(value: unknown, min: number, max: number, fallback: number): number {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        return fallback;
    }
    return Math.min(Math.max(num, min), max);
}

/**
 * Splits a channel or state id like "diagnostics.<key>.<id>" into the device key and the id below the device
 *
 * @param id - Id relative to the installation
 */
function splitDeviceId(id: string): { key: string; rest: string } {
    const [, key, ...rest] = id.split(".");
    return { key, rest: rest.join(".") };
}

function textOf(name: ioBroker.StringOrTranslated | undefined): string {
    return typeof name === "string" ? name : (name?.en ?? "");
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

class VictronVrmApi extends utils.Adapter {
    private client: VrmClient | undefined;
    private states!: StateManager;
    private installations: VrmInstallation[] = [];
    private userId: number | undefined;
    private scriptLimiter = new RateLimiter(SCRIPT_REQUESTS_PER_MINUTE, MINUTE);
    private diagnosticsPoller: Poller | undefined;
    private overviewPoller: Poller | undefined;
    private energyPoller: Poller | undefined;
    private forecastPoller: Poller | undefined;
    private alarmsPoller: Poller | undefined;
    /** Last forecast per installation and when it was fetched */
    private forecastCache = new Map<number, { records: Parameters<typeof mapForecast>[0]; fetched: number }>();
    /** Display names of the diagnostics channels per installation, from the system overview */
    private deviceLabels = new Map<number, Map<string, string>>();
    /** Channel ids of the devices VRM currently reports, per installation (for the cleanup) */
    private currentDevices = new Map<number, Set<string>>();
    private currentDiagnostics = new Map<number, Set<string>>();
    private currentSums = new Map<number, Set<string>>();
    private cleanupDone = false;
    /** Exclusion list for devices and diagnostics values */
    private filter: ValueFilter = createFilter("");
    private initTimer: ioBroker.Timeout | undefined;
    private initFailures = 0;
    /** Last error message per installation, used to avoid log spam */
    private siteErrors = new Map<number, string>();
    private energyErrors = new Map<number, string>();
    private forecastErrors = new Map<number, string>();
    private alarmErrors = new Map<number, string>();

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: "victron-vrm-api",
        });
        this.on("ready", this.onReady.bind(this));
        this.on("message", this.onMessage.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        this.states = new StateManager(this);
        this.filter = createFilter(this.config.exclude);
        await this.setState("info.connection", false, true);

        const token = (this.config.token ?? "").trim();
        if (!token) {
            this.log.warn("No VRM access token configured. Please create one in VRM (Preferences → Integrations).");
            return;
        }

        this.client = new VrmClient(token, {
            timeout: clamp(this.config.requestTimeout, 5, 120, 30) * 1000,
        });

        await this.initialize();
    }

    /**
     * Reads the user and its installations, creates the device objects and starts polling.
     * Retries with increasing delay on network errors; gives up on authentication errors.
     */
    private async initialize(): Promise<void> {
        if (!this.client) {
            return;
        }
        try {
            const user = await this.client.getMe();
            this.userId = user.id;
            await this.states.setValue("info.user.id", user.id, {
                name: "VRM user id",
                type: "number",
                role: "value",
            });
            await this.states.setValue("info.user.name", user.name, {
                name: "VRM user name",
                type: "string",
                role: "text",
            });

            const all = await this.client.getInstallations(user.id);
            this.installations = this.filterInstallations(all);
            this.log.info(
                `Found ${all.length} installation(s), polling ${this.installations.length}: ${this.installations
                    .map(site => `${site.name} (${site.idSite})`)
                    .join(", ")}`,
            );

            for (const site of this.installations) {
                await this.createInstallationObjects(site);
            }

            await this.setState("info.connection", true, true);
            this.initFailures = 0;
            await this.startPolling();
        } catch (error) {
            await this.setState("info.connection", false, true);
            if (error instanceof VrmApiError && error.isAuthError) {
                this.log.error(`VRM rejected the access token: ${error.message}. Please check the configuration.`);
                return;
            }
            this.initFailures++;
            const delay = Poller.backoffDelay(INIT_RETRY_DELAY, this.initFailures - 1, INIT_MAX_RETRY_DELAY);
            this.log.warn(`Initialization failed: ${errorMessage(error)} - retrying in ${Math.round(delay / 1000)}s`);
            this.initTimer = this.setTimeout(() => {
                this.initTimer = undefined;
                void this.initialize();
            }, delay);
        }
    }

    private filterInstallations(all: VrmInstallation[]): VrmInstallation[] {
        const selected = (this.config.sites ?? []).map(String).filter(id => id !== "");
        if (selected.length === 0) {
            return all;
        }
        const found = all.filter(site => selected.includes(String(site.idSite)));
        const missing = selected.filter(id => !all.some(site => String(site.idSite) === id));
        if (missing.length) {
            this.log.warn(`Configured installation(s) not found or no access: ${missing.join(", ")}`);
        }
        return found;
    }

    private async createInstallationObjects(site: VrmInstallation): Promise<void> {
        const prefix = String(site.idSite);
        await this.states.ensureDevice(prefix, site.name, { idSite: site.idSite, identifier: site.identifier });
        await this.states.ensureChannel(`${prefix}.info`, "Information");
        await this.states.setValue(`${prefix}.info.name`, site.name, { name: "Name", type: "string", role: "text" });
        await this.states.setValue(`${prefix}.info.identifier`, site.identifier, {
            name: "Portal id (VRM identifier)",
            type: "string",
            role: "text",
        });
        await this.states.setValue(`${prefix}.info.timezone`, site.timezone ?? null, {
            name: "Timezone",
            type: "string",
            role: "text",
        });
    }

    private async startPolling(): Promise<void> {
        // read the device names first, so the diagnostics channels get them right away
        await this.pollOverview();
        this.overviewPoller = new Poller({ interval: OVERVIEW_INTERVAL, run: () => this.pollOverview() });
        this.overviewPoller.start(OVERVIEW_INTERVAL);

        // default on, also for instances created before the option existed
        if (this.config.energyStats !== false) {
            this.energyPoller = new Poller({
                interval: clamp(this.config.energyInterval, 1, 1440, 15) * MINUTE,
                run: () => this.pollEnergy(),
            });
            this.energyPoller.start();
        }

        if (this.config.forecast !== false) {
            // ticks every few minutes to keep "rest of today" current; VRM is only asked once per forecastInterval
            this.forecastPoller = new Poller({ interval: FORECAST_TICK, run: () => this.pollForecast() });
            this.forecastPoller.start();
        }

        if (this.config.alarms !== false) {
            this.alarmsPoller = new Poller({
                interval: clamp(this.config.alarmsInterval, 1, 1440, 5) * MINUTE,
                run: () => this.pollAlarms(),
            });
            this.alarmsPoller.start();
        }

        const interval = clamp(this.config.diagnosticsInterval, 1, 1440, 1) * MINUTE;
        this.diagnosticsPoller = new Poller({
            interval,
            run: () => this.pollDiagnostics(),
            onError: (error, nextDelay) =>
                this.log.warn(
                    `Polling diagnostics failed: ${errorMessage(error)} - next try in ${Math.round(nextDelay / 1000)}s`,
                ),
        });
        this.diagnosticsPoller.start();
    }

    private stopPolling(): void {
        this.diagnosticsPoller?.stop();
        this.overviewPoller?.stop();
        this.energyPoller?.stop();
        this.forecastPoller?.stop();
        this.alarmsPoller?.stop();
    }

    /**
     * Fetches the diagnostics of all installations.
     * Throws only if every installation failed, so the poller backs off.
     */
    private async pollDiagnostics(): Promise<void> {
        if (!this.client) {
            return;
        }
        let firstError: Error | undefined;
        let successCount = 0;

        for (const site of this.installations) {
            try {
                const records = await this.client.getDiagnostics(site.idSite);
                await this.processDiagnostics(site, records);
                successCount++;
                if (this.siteErrors.delete(site.idSite)) {
                    this.log.info(`Installation ${site.name} (${site.idSite}) is reachable again`);
                }
            } catch (error) {
                // 401 = token invalid (affects all installations); 403 only concerns this installation
                if (error instanceof VrmApiError && error.status === 401) {
                    this.stopPolling();
                    await this.setState("info.connection", false, true);
                    this.log.error(`VRM rejected the access token: ${error.message}. Polling stopped.`);
                    return;
                }
                firstError ??= error instanceof Error ? error : new Error(errorMessage(error));
                this.logSiteError(site, error);
            }
        }

        await this.setState("info.connection", successCount > 0 || this.installations.length === 0, true);
        if (successCount > 0) {
            await this.states.setValue("info.lastUpdate", Date.now(), {
                name: "Last successful update",
                type: "number",
                role: "value.time",
            });
        } else if (firstError) {
            throw firstError;
        }

        // once per start, after the first successful round, so the current device lists are known
        if (successCount > 0 && !this.cleanupDone && this.config.cleanupObjects) {
            this.cleanupDone = true;
            await this.cleanupObjects();
        }
    }

    /**
     * Deletes objects of installations that are no longer polled, of devices that VRM no longer reports,
     * of disabled options and the phase sums when they are disabled.
     */
    private async cleanupObjects(): Promise<void> {
        try {
            const prefix = `${this.namespace}.`;
            const objects = await this.getAdapterObjectsAsync();
            const ids = Object.keys(objects)
                .filter(id => id.startsWith(prefix))
                .map(id => id.slice(prefix.length));
            // diagnostics.<key>.<id> below an installation, compared like in processDiagnostics
            const excluded = (id: string): boolean => {
                const obj = objects[`${prefix}${id}`];
                if (obj?.type !== "state") {
                    return false;
                }
                const { key, rest } = splitDeviceId(id.slice(id.indexOf(".") + 1));
                return this.filter.excludesValue(key, rest, textOf(obj.common.name));
            };
            const sites = new Map<number, SiteExpectation>();
            for (const site of this.installations) {
                sites.set(site.idSite, {
                    devices: this.currentDevices.get(site.idSite),
                    diagnostics: this.currentDiagnostics.get(site.idSite),
                    phaseSums: this.config.phaseSums !== false,
                    sums: this.currentSums.get(site.idSite),
                    folders: {
                        energy: this.config.energyStats !== false,
                        forecast: this.config.forecast !== false,
                        alarms: this.config.alarms !== false,
                    },
                });
            }
            for (const id of findObsolete(ids, sites, this.filter.empty ? undefined : excluded)) {
                this.log.info(`Deleting obsolete object ${id}`);
                await this.delObjectAsync(id, { recursive: true });
                this.states.forget(id);
            }
        } catch (error) {
            this.log.warn(`Cleanup of obsolete objects failed: ${errorMessage(error)}`);
        }
    }

    /**
     * Fetches the device list of all installations. Errors are only logged,
     * the device list is not essential for the diagnostics.
     */
    private async pollOverview(): Promise<void> {
        if (!this.client) {
            return;
        }
        for (const site of this.installations) {
            try {
                const devices = await this.client.getSystemOverview(site.idSite);
                await this.processOverview(site, devices);
            } catch (error) {
                this.log.warn(
                    `Installation ${site.name} (${site.idSite}): reading the device list failed: ${errorMessage(error)}`,
                );
            }
        }
    }

    private async processOverview(site: VrmInstallation, devices: Parameters<typeof mapOverview>[0]): Promise<void> {
        const prefix = String(site.idSite);
        const mapped = mapOverview(devices);
        this.deviceLabels.set(site.idSite, mapped.labels);
        const channels = mapped.channels.filter(
            channel => !this.filter.excludesDevice(splitDeviceId(channel.id).key, channel.name),
        );
        const keys = new Set(channels.map(channel => splitDeviceId(channel.id).key));
        // an empty list is more likely a hiccup than an installation without devices
        if (mapped.channels.length) {
            this.currentDevices.set(site.idSite, new Set(channels.map(channel => channel.id)));
        }

        await this.states.ensureChannel(`${prefix}.devices`, "Devices");
        for (const channel of channels) {
            await this.states.ensureChannel(`${prefix}.${channel.id}`, channel.name);
        }
        for (const state of mapped.states) {
            if (keys.has(splitDeviceId(state.id).key)) {
                await this.states.setState(prefix, state);
            }
        }
    }

    /**
     * Fetches the energy totals (today, week, month, year) of all installations.
     * Errors are logged once per installation, the diagnostics are not affected.
     */
    private async pollEnergy(): Promise<void> {
        if (!this.client) {
            return;
        }
        for (const site of this.installations) {
            try {
                const records = await this.client.getOverallStats(site.idSite, ENERGY_CODES);
                await this.processEnergy(site, records);
                if (this.energyErrors.delete(site.idSite)) {
                    this.log.info(`Installation ${site.name} (${site.idSite}): energy statistics available again`);
                }
            } catch (error) {
                this.logSiteError(site, error, this.energyErrors, "reading energy statistics failed: ");
            }
        }
    }

    /**
     * Fetches the forecast when the cached one is older than the configured interval,
     * then recalculates the time dependent values (rest of today, current hour) from the cache.
     */
    private async pollForecast(): Promise<void> {
        if (!this.client) {
            return;
        }
        const maxAge = clamp(this.config.forecastInterval, 15, 1440, 60) * MINUTE;
        for (const site of this.installations) {
            const now = Date.now();
            let cached = this.forecastCache.get(site.idSite);
            if (!cached || now - cached.fetched >= maxAge) {
                try {
                    const { start, end } = forecastWindow(now);
                    cached = { records: await this.client.getForecast(site.idSite, start, end), fetched: now };
                    this.forecastCache.set(site.idSite, cached);
                    if (this.forecastErrors.delete(site.idSite)) {
                        this.log.info(`Installation ${site.name} (${site.idSite}): forecast available again`);
                    }
                } catch (error) {
                    this.logSiteError(site, error, this.forecastErrors, "reading the forecast failed: ");
                }
            }
            if (cached) {
                await this.processForecast(site, cached.records, now);
            }
        }
    }

    /**
     * Fetches the newest entries of the alarm log of all installations.
     * Errors are logged once per installation, the diagnostics are not affected.
     */
    private async pollAlarms(): Promise<void> {
        if (!this.client) {
            return;
        }
        for (const site of this.installations) {
            try {
                const records = await this.client.getAlarmLog(site.idSite, ALARM_LOG_COUNT);
                await this.processAlarms(site, records);
                if (this.alarmErrors.delete(site.idSite)) {
                    this.log.info(`Installation ${site.name} (${site.idSite}): alarm log available again`);
                }
            } catch (error) {
                this.logSiteError(site, error, this.alarmErrors, "reading the alarm log failed: ");
            }
        }
    }

    private async processAlarms(site: VrmInstallation, records: Parameters<typeof mapAlarms>[0]): Promise<void> {
        const prefix = String(site.idSite);
        const mapped = mapAlarms(records);
        for (const channel of mapped.channels) {
            await this.states.ensureChannel(`${prefix}.${channel.id}`, channel.name);
        }
        for (const state of mapped.states) {
            await this.states.setState(prefix, state);
        }
    }

    private async processForecast(
        site: VrmInstallation,
        records: Parameters<typeof mapForecast>[0],
        now: number,
    ): Promise<void> {
        const prefix = String(site.idSite);
        const mapped = mapForecast(records, now, site.timezone);
        for (const channel of mapped.channels) {
            await this.states.ensureChannel(`${prefix}.${channel.id}`, channel.name);
        }
        for (const state of mapped.states) {
            await this.states.setState(prefix, state);
        }
    }

    private async processEnergy(site: VrmInstallation, records: Parameters<typeof mapEnergy>[0]): Promise<void> {
        const prefix = String(site.idSite);
        const mapped = mapEnergy(records);
        if (!mapped.states.length) {
            this.log.debug(
                `Installation ${site.name} (${site.idSite}): no energy statistics (${Object.keys(ENERGY_PERIODS).join(", ")})`,
            );
            return;
        }
        await this.states.ensureChannel(`${prefix}.energy`, "Energy statistics (kWh)");
        for (const channel of mapped.channels) {
            await this.states.ensureChannel(`${prefix}.${channel.id}`, channel.name);
        }
        for (const state of mapped.states) {
            await this.states.setState(prefix, state);
        }
    }

    private logSiteError(site: VrmInstallation, error: unknown, errors = this.siteErrors, context = ""): void {
        const message = errorMessage(error);
        const text = `Installation ${site.name} (${site.idSite}): ${context}${message}`;
        // log the first occurrence as warning, repetitions only as debug
        if (errors.get(site.idSite) === message) {
            this.log.debug(text);
        } else {
            this.log.warn(text);
        }
        errors.set(site.idSite, message);
    }

    private async processDiagnostics(
        site: VrmInstallation,
        records: Parameters<typeof mapDiagnostics>[0],
    ): Promise<void> {
        const prefix = String(site.idSite);
        const mapped = mapDiagnostics(records);
        const labels = this.deviceLabels.get(site.idSite);
        const channels = mapped.channels.filter(
            channel => !this.filter.excludesDevice(splitDeviceId(channel.id).key, labels?.get(channel.id)),
        );
        if (mapped.channels.length) {
            this.currentDiagnostics.set(site.idSite, new Set(channels.map(channel => channel.id)));
        }
        const included = (state: StateDef): boolean => {
            const { key, rest } = splitDeviceId(state.id);
            return (
                !this.filter.excludesDevice(key, labels?.get(`diagnostics.${key}`)) &&
                !this.filter.excludesValue(key, rest, textOf(state.common.name))
            );
        };

        await this.states.ensureChannel(`${prefix}.diagnostics`, "Diagnostics (all values reported by VRM)");
        for (const channel of channels) {
            await this.states.ensureChannel(`${prefix}.${channel.id}`, labels?.get(channel.id) ?? channel.name);
        }
        for (const state of mapped.states.filter(included)) {
            await this.states.setState(prefix, state);
        }

        // default on, also for instances created before the option existed
        if (this.config.phaseSums !== false) {
            const sums = mapPhaseSums(records).filter(included);
            if (mapped.channels.length) {
                this.currentSums.set(site.idSite, new Set(sums.map(sum => sum.id)));
            }
            for (const channel of new Set(sums.map(sum => sum.id.slice(0, sum.id.lastIndexOf("."))))) {
                await this.states.ensureChannel(`${prefix}.${channel}`, "Sums over L1-L3");
            }
            for (const state of sums) {
                await this.states.setState(prefix, state);
            }
        }

        const live = mapLive(records);
        if (live.length) {
            await this.states.ensureChannel(`${prefix}.live`, "Live values");
            for (const state of live) {
                await this.states.setState(prefix, state);
            }
        }

        const lastTimestamp = mapped.lastTimestamp ?? (site.last_timestamp ? site.last_timestamp * 1000 : null);
        await this.states.setValue(`${prefix}.info.lastTimestamp`, lastTimestamp, {
            name: "Timestamp of the newest data in VRM",
            type: "number",
            role: "value.time",
        });
        const staleAfter = clamp(this.config.staleMinutes, 1, 10_080, 30) * MINUTE;
        await this.states.setValue(
            `${prefix}.info.dataStale`,
            lastTimestamp === null || Date.now() - lastTimestamp > staleAfter,
            {
                name: "No new data from the GX device for longer than configured",
                type: "boolean",
                role: "indicator.maintenance",
            },
        );
    }

    /**
     * Handles messages from the admin UI (selectSendTo "getInstallations") and from scripts ("get").
     *
     * @param obj - Message with command, payload and callback
     */
    private async onMessage(obj: ioBroker.Message): Promise<void> {
        if (obj?.command === "getInstallations") {
            await this.handleGetInstallations(obj);
        } else if (obj?.command === "get") {
            const result = await this.handleScriptRequest(obj.message);
            if (obj.callback) {
                this.sendTo(obj.from, obj.command, result, obj.callback);
            }
        }
    }

    /**
     * GET request of a script to the VRM API, e.g.
     * sendTo("victron-vrm-api.0", "get", { path: "/installations/123/stats", params: { type: "kwh" } }, cb)
     *
     * @param message - { path, params }
     */
    private async handleScriptRequest(
        message: unknown,
    ): Promise<{ data: unknown } | { error: string; status?: number }> {
        if (!this.client || !this.installations.length) {
            return { error: "Adapter is not connected to VRM yet" };
        }
        const request = parseScriptRequest(message, new Set(this.installations.map(site => site.idSite)), this.userId);
        if ("error" in request) {
            return request;
        }
        if (!this.scriptLimiter.tryAcquire()) {
            return { error: `Too many requests from scripts (max. ${SCRIPT_REQUESTS_PER_MINUTE} per minute)` };
        }
        try {
            this.log.debug(`Script request ${request.path} ${JSON.stringify(request.params)}`);
            return { data: await this.client.get(request.path, request.params) };
        } catch (error) {
            return {
                error: errorMessage(error),
                ...(error instanceof VrmApiError && error.status ? { status: error.status } : {}),
            };
        }
    }

    private async handleGetInstallations(obj: ioBroker.Message): Promise<void> {
        const message = (obj.message ?? {}) as { token?: string };
        const token = (message.token || this.config.token || "").trim();
        let result: { label: string; value: string }[];

        if (!token) {
            result = [{ label: "Please enter an access token first", value: "" }];
        } else {
            try {
                const client = new VrmClient(token, { timeout: 30_000 });
                const user = await client.getMe();
                const sites = await client.getInstallations(user.id);
                result = sites.map(site => ({ label: `${site.name} (${site.idSite})`, value: String(site.idSite) }));
            } catch (error) {
                this.log.warn(`Could not load installations: ${errorMessage(error)}`);
                result = [{ label: `Error: ${errorMessage(error)}`, value: "" }];
            }
        }

        if (obj.callback) {
            this.sendTo(obj.from, obj.command, result, obj.callback);
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback - Callback function
     */
    private onUnload(callback: () => void): void {
        try {
            this.stopPolling();
            if (this.initTimer) {
                this.clearTimeout(this.initTimer);
            }
            this.client?.abortAll();
            callback();
        } catch (error) {
            this.log.error(`Error during unloading: ${(error as Error).message}`);
            callback();
        }
    }
}
if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new VictronVrmApi(options);
} else {
    // otherwise start the instance directly
    (() => new VictronVrmApi())();
}
