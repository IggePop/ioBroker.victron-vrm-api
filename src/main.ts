/*
 * Created with @iobroker/create-adapter v3.1.5
 */

import * as utils from "@iobroker/adapter-core";
import { mapDiagnostics } from "./lib/mappers/diagnostics";
import { ENERGY_CODES, ENERGY_PERIODS, mapEnergy } from "./lib/mappers/energy";
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

function clamp(value: unknown, min: number, max: number, fallback: number): number {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        return fallback;
    }
    return Math.min(Math.max(num, min), max);
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

class VictronVrmApi extends utils.Adapter {
    private client: VrmClient | undefined;
    private states!: StateManager;
    private installations: VrmInstallation[] = [];
    private diagnosticsPoller: Poller | undefined;
    private overviewPoller: Poller | undefined;
    private energyPoller: Poller | undefined;
    /** Display names of the diagnostics channels per installation, from the system overview */
    private deviceLabels = new Map<number, Map<string, string>>();
    private initTimer: ioBroker.Timeout | undefined;
    private initFailures = 0;
    /** Last error message per installation, used to avoid log spam */
    private siteErrors = new Map<number, string>();
    private energyErrors = new Map<number, string>();

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

        await this.states.ensureChannel(`${prefix}.devices`, "Devices");
        for (const channel of mapped.channels) {
            await this.states.ensureChannel(`${prefix}.${channel.id}`, channel.name);
        }
        for (const state of mapped.states) {
            await this.states.setState(prefix, state);
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

        await this.states.ensureChannel(`${prefix}.diagnostics`, "Diagnostics (all values reported by VRM)");
        const labels = this.deviceLabels.get(site.idSite);
        for (const channel of mapped.channels) {
            await this.states.ensureChannel(`${prefix}.${channel.id}`, labels?.get(channel.id) ?? channel.name);
        }
        for (const state of mapped.states) {
            await this.states.setState(prefix, state);
        }

        // default on, also for instances created before the option existed
        if (this.config.phaseSums !== false) {
            const sums = mapPhaseSums(records);
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
     * Handles messages from the admin UI (selectSendTo "getInstallations").
     *
     * @param obj
     */
    private async onMessage(obj: ioBroker.Message): Promise<void> {
        if (!obj || obj.command !== "getInstallations") {
            return;
        }
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
