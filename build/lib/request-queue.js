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
var request_queue_exports = {};
__export(request_queue_exports, {
  RequestQueue: () => RequestQueue
});
module.exports = __toCommonJS(request_queue_exports);
class RequestQueue {
  /**
   * @param minInterval - Minimum time in milliseconds between the start of two tasks
   */
  constructor(minInterval = 500) {
    this.minInterval = minInterval;
  }
  entries = [];
  running = false;
  lastStart = 0;
  pausedUntil = 0;
  timer;
  add(task) {
    return new Promise((resolve, reject) => {
      this.entries.push({ task, resolve, reject });
      void this.next();
    });
  }
  /**
   * Delays the next task, e.g. after HTTP 429
   *
   * @param ms
   */
  pause(ms) {
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + ms);
  }
  /** Rejects all waiting tasks and stops processing */
  clear() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = void 0;
    }
    for (const entry of this.entries.splice(0)) {
      entry.reject(new Error("Request queue cleared"));
    }
  }
  get size() {
    return this.entries.length;
  }
  async next() {
    if (this.running || this.timer || this.entries.length === 0) {
      return;
    }
    const wait = Math.max(this.lastStart + this.minInterval, this.pausedUntil) - Date.now();
    if (wait > 0) {
      this.timer = setTimeout(() => {
        this.timer = void 0;
        void this.next();
      }, wait);
      return;
    }
    const entry = this.entries.shift();
    this.running = true;
    this.lastStart = Date.now();
    try {
      entry.resolve(await entry.task());
    } catch (error) {
      entry.reject(error);
    } finally {
      this.running = false;
      void this.next();
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  RequestQueue
});
//# sourceMappingURL=request-queue.js.map
