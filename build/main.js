"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_diagnostics = require("./lib/mappers/diagnostics");
var import_live = require("./lib/mappers/live");
var import_phase_sums = require("./lib/mappers/phase-sums");
var import_poller = require("./lib/poller");
var import_state_manager = require("./lib/state-manager");
var import_vrm_client = require("./lib/vrm-client");
const MINUTE = 6e4;
const INIT_RETRY_DELAY = MINUTE;
const INIT_MAX_RETRY_DELAY = 15 * MINUTE;
function clamp(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.min(Math.max(num, min), max);
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
class VictronVrmApi extends utils.Adapter {
  client;
  states;
  installations = [];
  diagnosticsPoller;
  initTimer;
  initFailures = 0;
  /** Last error message per installation, used to avoid log spam */
  siteErrors = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super({
      ...options,
      name: "victron-vrm-api"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("message", this.onMessage.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  /**
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {
    var _a;
    this.states = new import_state_manager.StateManager(this);
    await this.setState("info.connection", false, true);
    const token = ((_a = this.config.token) != null ? _a : "").trim();
    if (!token) {
      this.log.warn("No VRM access token configured. Please create one in VRM (Preferences \u2192 Integrations).");
      return;
    }
    this.client = new import_vrm_client.VrmClient(token, {
      timeout: clamp(this.config.requestTimeout, 5, 120, 30) * 1e3
    });
    await this.initialize();
  }
  /**
   * Reads the user and its installations, creates the device objects and starts polling.
   * Retries with increasing delay on network errors; gives up on authentication errors.
   */
  async initialize() {
    if (!this.client) {
      return;
    }
    try {
      const user = await this.client.getMe();
      await this.states.setValue("info.user.id", user.id, {
        name: "VRM user id",
        type: "number",
        role: "value"
      });
      await this.states.setValue("info.user.name", user.name, {
        name: "VRM user name",
        type: "string",
        role: "text"
      });
      const all = await this.client.getInstallations(user.id);
      this.installations = this.filterInstallations(all);
      this.log.info(
        `Found ${all.length} installation(s), polling ${this.installations.length}: ${this.installations.map((site) => `${site.name} (${site.idSite})`).join(", ")}`
      );
      for (const site of this.installations) {
        await this.createInstallationObjects(site);
      }
      await this.setState("info.connection", true, true);
      this.initFailures = 0;
      this.startPolling();
    } catch (error) {
      await this.setState("info.connection", false, true);
      if (error instanceof import_vrm_client.VrmApiError && error.isAuthError) {
        this.log.error(`VRM rejected the access token: ${error.message}. Please check the configuration.`);
        return;
      }
      this.initFailures++;
      const delay = import_poller.Poller.backoffDelay(INIT_RETRY_DELAY, this.initFailures - 1, INIT_MAX_RETRY_DELAY);
      this.log.warn(`Initialization failed: ${errorMessage(error)} - retrying in ${Math.round(delay / 1e3)}s`);
      this.initTimer = this.setTimeout(() => {
        this.initTimer = void 0;
        void this.initialize();
      }, delay);
    }
  }
  filterInstallations(all) {
    var _a;
    const selected = ((_a = this.config.sites) != null ? _a : []).map(String).filter((id) => id !== "");
    if (selected.length === 0) {
      return all;
    }
    const found = all.filter((site) => selected.includes(String(site.idSite)));
    const missing = selected.filter((id) => !all.some((site) => String(site.idSite) === id));
    if (missing.length) {
      this.log.warn(`Configured installation(s) not found or no access: ${missing.join(", ")}`);
    }
    return found;
  }
  async createInstallationObjects(site) {
    var _a;
    const prefix = String(site.idSite);
    await this.states.ensureDevice(prefix, site.name, { idSite: site.idSite, identifier: site.identifier });
    await this.states.ensureChannel(`${prefix}.info`, "Information");
    await this.states.setValue(`${prefix}.info.name`, site.name, { name: "Name", type: "string", role: "text" });
    await this.states.setValue(`${prefix}.info.identifier`, site.identifier, {
      name: "Portal id (VRM identifier)",
      type: "string",
      role: "text"
    });
    await this.states.setValue(`${prefix}.info.timezone`, (_a = site.timezone) != null ? _a : null, {
      name: "Timezone",
      type: "string",
      role: "text"
    });
  }
  startPolling() {
    const interval = clamp(this.config.diagnosticsInterval, 1, 1440, 1) * MINUTE;
    this.diagnosticsPoller = new import_poller.Poller({
      interval,
      run: () => this.pollDiagnostics(),
      onError: (error, nextDelay) => this.log.warn(
        `Polling diagnostics failed: ${errorMessage(error)} - next try in ${Math.round(nextDelay / 1e3)}s`
      )
    });
    this.diagnosticsPoller.start();
  }
  stopPolling() {
    var _a;
    (_a = this.diagnosticsPoller) == null ? void 0 : _a.stop();
  }
  /**
   * Fetches the diagnostics of all installations.
   * Throws only if every installation failed, so the poller backs off.
   */
  async pollDiagnostics() {
    if (!this.client) {
      return;
    }
    let firstError;
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
        if (error instanceof import_vrm_client.VrmApiError && error.status === 401) {
          this.stopPolling();
          await this.setState("info.connection", false, true);
          this.log.error(`VRM rejected the access token: ${error.message}. Polling stopped.`);
          return;
        }
        firstError != null ? firstError : firstError = error instanceof Error ? error : new Error(errorMessage(error));
        this.logSiteError(site, error);
      }
    }
    await this.setState("info.connection", successCount > 0 || this.installations.length === 0, true);
    if (successCount > 0) {
      await this.states.setValue("info.lastUpdate", Date.now(), {
        name: "Last successful update",
        type: "number",
        role: "value.time"
      });
    } else if (firstError) {
      throw firstError;
    }
  }
  logSiteError(site, error) {
    const message = errorMessage(error);
    const text = `Installation ${site.name} (${site.idSite}): ${message}`;
    if (this.siteErrors.get(site.idSite) === message) {
      this.log.debug(text);
    } else {
      this.log.warn(text);
    }
    this.siteErrors.set(site.idSite, message);
  }
  async processDiagnostics(site, records) {
    var _a;
    const prefix = String(site.idSite);
    const mapped = (0, import_diagnostics.mapDiagnostics)(records);
    await this.states.ensureChannel(`${prefix}.diagnostics`, "Diagnostics (all values reported by VRM)");
    for (const channel of mapped.channels) {
      await this.states.ensureChannel(`${prefix}.${channel.id}`, channel.name);
    }
    for (const state of mapped.states) {
      await this.states.setState(prefix, state);
    }
    if (this.config.phaseSums !== false) {
      const sums = (0, import_phase_sums.mapPhaseSums)(records);
      for (const channel of new Set(sums.map((sum) => sum.id.slice(0, sum.id.lastIndexOf("."))))) {
        await this.states.ensureChannel(`${prefix}.${channel}`, "Sums over L1-L3");
      }
      for (const state of sums) {
        await this.states.setState(prefix, state);
      }
    }
    const live = (0, import_live.mapLive)(records);
    if (live.length) {
      await this.states.ensureChannel(`${prefix}.live`, "Live values");
      for (const state of live) {
        await this.states.setState(prefix, state);
      }
    }
    const lastTimestamp = (_a = mapped.lastTimestamp) != null ? _a : site.last_timestamp ? site.last_timestamp * 1e3 : null;
    await this.states.setValue(`${prefix}.info.lastTimestamp`, lastTimestamp, {
      name: "Timestamp of the newest data in VRM",
      type: "number",
      role: "value.time"
    });
    const staleAfter = clamp(this.config.staleMinutes, 1, 10080, 30) * MINUTE;
    await this.states.setValue(
      `${prefix}.info.dataStale`,
      lastTimestamp === null || Date.now() - lastTimestamp > staleAfter,
      {
        name: "No new data from the GX device for longer than configured",
        type: "boolean",
        role: "indicator.maintenance"
      }
    );
  }
  /**
   * Handles messages from the admin UI (selectSendTo "getInstallations").
   *
   * @param obj
   */
  async onMessage(obj) {
    var _a;
    if (!obj || obj.command !== "getInstallations") {
      return;
    }
    const message = (_a = obj.message) != null ? _a : {};
    const token = (message.token || this.config.token || "").trim();
    let result;
    if (!token) {
      result = [{ label: "Please enter an access token first", value: "" }];
    } else {
      try {
        const client = new import_vrm_client.VrmClient(token, { timeout: 3e4 });
        const user = await client.getMe();
        const sites = await client.getInstallations(user.id);
        result = sites.map((site) => ({ label: `${site.name} (${site.idSite})`, value: String(site.idSite) }));
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
  onUnload(callback) {
    var _a;
    try {
      this.stopPolling();
      if (this.initTimer) {
        this.clearTimeout(this.initTimer);
      }
      (_a = this.client) == null ? void 0 : _a.abortAll();
      callback();
    } catch (error) {
      this.log.error(`Error during unloading: ${error.message}`);
      callback();
    }
  }
}
if (require.main !== module) {
  module.exports = (options) => new VictronVrmApi(options);
} else {
  (() => new VictronVrmApi())();
}
//# sourceMappingURL=main.js.map
