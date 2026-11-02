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
var script_request_exports = {};
__export(script_request_exports, {
  RateLimiter: () => RateLimiter,
  parseScriptRequest: () => parseScriptRequest
});
module.exports = __toCommonJS(script_request_exports);
function single(item) {
  return typeof item === "string" || typeof item === "number" || typeof item === "boolean" ? String(item) : void 0;
}
function toParam(value) {
  if (Array.isArray(value)) {
    const items = value.map(single).filter((item) => item !== void 0);
    return items.length === value.length ? items : void 0;
  }
  return single(value);
}
function parseScriptRequest(message, sites, userId) {
  const { path: rawPath, params: rawParams } = message != null ? message : {};
  if (typeof rawPath !== "string" || rawPath.trim() === "") {
    return { error: 'Missing "path", e.g. { path: "/installations/<idSite>/stats" }' };
  }
  const path = `/${rawPath.trim().replace(/^\/+/, "").replace(/\/+$/, "")}`;
  if (!/^[A-Za-z0-9/_-]+$/.test(path)) {
    return { error: 'Invalid "path": only letters, digits, "/", "_" and "-", pass query parameters in "params"' };
  }
  const [, root, id] = path.split("/");
  const allowed = root === "installations" && sites.has(Number(id)) || root === "users" && (id === "me" || userId !== void 0 && Number(id) === userId);
  if (!allowed) {
    return {
      error: `Path not allowed: ${path}. Allowed are /installations/<idSite>/... of the polled installations and /users/me or /users/<own id>/...`
    };
  }
  const params = {};
  if (rawParams !== void 0 && rawParams !== null) {
    if (typeof rawParams !== "object" || Array.isArray(rawParams)) {
      return { error: '"params" must be an object, e.g. { type: "kwh", interval: "days" }' };
    }
    for (const [key, value] of Object.entries(rawParams)) {
      const param = toParam(value);
      if (param === void 0) {
        return { error: `Invalid value for parameter "${key}"` };
      }
      params[key] = param;
    }
  }
  return { path, params };
}
class RateLimiter {
  /**
   * @param limit - Maximum number of calls
   * @param window - Time window in milliseconds
   */
  constructor(limit, window) {
    this.limit = limit;
    this.window = window;
  }
  calls = [];
  /**
   * Registers a call if the limit allows it
   *
   * @param now - Current time in milliseconds
   * @returns false if the limit is reached
   */
  tryAcquire(now = Date.now()) {
    this.calls = this.calls.filter((time) => now - time < this.window);
    if (this.calls.length >= this.limit) {
      return false;
    }
    this.calls.push(now);
    return true;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  RateLimiter,
  parseScriptRequest
});
//# sourceMappingURL=script-request.js.map
