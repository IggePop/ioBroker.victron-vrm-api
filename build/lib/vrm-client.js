"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var vrm_client_exports = {};
__export(vrm_client_exports, {
  VRM_BASE_URL: () => VRM_BASE_URL,
  VrmApiError: () => VrmApiError,
  VrmClient: () => VrmClient
});
module.exports = __toCommonJS(vrm_client_exports);
var import_request_queue = require("./request-queue");
const VRM_BASE_URL = "https://vrmapi.victronenergy.com/v2";
class VrmApiError extends Error {
  /**
   * @param message - Error text including the request path
   * @param status - HTTP status
   * @param retryAfter - Seconds from the Retry-After header
   */
  constructor(message, status, retryAfter) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
    this.name = "VrmApiError";
  }
  /** Token invalid or no access - retrying makes no sense */
  get isAuthError() {
    return this.status === 401 || this.status === 403;
  }
  /** HTTP 429 - too many requests */
  get isRateLimit() {
    return this.status === 429;
  }
}
class VrmClient {
  /**
   * @param token - VRM access token
   * @param options - Base URL, timeout and request queue
   */
  constructor(token, options = {}) {
    this.token = token;
    var _a, _b, _c;
    this.baseUrl = ((_a = options.baseUrl) != null ? _a : VRM_BASE_URL).replace(/\/+$/, "");
    this.timeout = (_b = options.timeout) != null ? _b : 3e4;
    this.queue = (_c = options.queue) != null ? _c : new import_request_queue.RequestQueue();
  }
  baseUrl;
  timeout;
  queue;
  controllers = /* @__PURE__ */ new Set();
  /** The user the token belongs to */
  async getMe() {
    const res = await this.get("/users/me");
    return res.user;
  }
  /**
   * All installations the user has access to
   *
   * @param idUser - User id from {@link getMe}
   */
  async getInstallations(idUser) {
    var _a;
    const res = await this.get(`/users/${idUser}/installations`);
    return (_a = res.records) != null ? _a : [];
  }
  /**
   * Latest values of all data attributes of an installation
   *
   * @param idSite - Installation id
   */
  async getDiagnostics(idSite) {
    var _a;
    const res = await this.get(`/installations/${idSite}/diagnostics`, {
      count: "1000"
    });
    return (_a = res.records) != null ? _a : [];
  }
  /**
   * Energy totals for today, week, month and year
   *
   * @param idSite - Installation id
   * @param attributeCodes - VRM attribute codes, e.g. "Pc" (PV to consumers)
   */
  async getOverallStats(idSite, attributeCodes) {
    var _a;
    const res = await this.get(`/installations/${idSite}/overallstats`, {
      type: "custom",
      "attributeCodes[]": attributeCodes
    });
    return (_a = res.records) != null ? _a : {};
  }
  /**
   * Devices of an installation with product name and firmware
   *
   * @param idSite - Installation id
   */
  async getSystemOverview(idSite) {
    var _a, _b;
    const res = await this.get(`/installations/${idSite}/system-overview`);
    return (_b = (_a = res.records) == null ? void 0 : _a.devices) != null ? _b : [];
  }
  /**
   * Generic GET request, `path` is relative to the base URL
   *
   * @param path
   * @param params
   */
  get(path, params) {
    const url = new URL(this.baseUrl + (path.startsWith("/") ? path : `/${path}`));
    for (const [key, value] of Object.entries(params != null ? params : {})) {
      for (const item of Array.isArray(value) ? value : [value]) {
        url.searchParams.append(key, item);
      }
    }
    return this.queue.add(() => this.request(url));
  }
  /** Aborts all running requests (used on unload) */
  abortAll() {
    for (const controller of this.controllers) {
      controller.abort();
    }
    this.controllers.clear();
    this.queue.clear();
  }
  async request(url) {
    var _a, _b;
    const controller = new AbortController();
    this.controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), this.timeout);
    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          "X-Authorization": `Token ${this.token}`,
          Accept: "application/json"
        },
        signal: controller.signal
      });
    } catch (error) {
      const message = controller.signal.aborted ? "Request timed out or aborted" : error.message;
      throw new VrmApiError(`${url.pathname}: ${message}`);
    } finally {
      clearTimeout(timer);
      this.controllers.delete(controller);
    }
    if (!response.ok) {
      const retryAfter = Number(response.headers.get("retry-after")) || void 0;
      if (retryAfter && response.status === 429) {
        this.queue.pause(retryAfter * 1e3);
      }
      const body = await response.text().catch(() => "");
      throw new VrmApiError(
        `${url.pathname}: HTTP ${response.status} ${(_a = extractErrorText(body)) != null ? _a : response.statusText}`,
        response.status,
        retryAfter
      );
    }
    const data = await response.json();
    if (data.success === false) {
      throw new VrmApiError(`${url.pathname}: ${JSON.stringify((_b = data.errors) != null ? _b : "request not successful")}`);
    }
    return data;
  }
}
function extractErrorText(body) {
  try {
    const json = JSON.parse(body);
    if (json.errors) {
      return typeof json.errors === "string" ? json.errors : JSON.stringify(json.errors);
    }
    return json.error_code;
  } catch {
    return void 0;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  VRM_BASE_URL,
  VrmApiError,
  VrmClient
});
//# sourceMappingURL=vrm-client.js.map
