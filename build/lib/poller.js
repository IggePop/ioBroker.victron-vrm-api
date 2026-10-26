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
var poller_exports = {};
__export(poller_exports, {
  Poller: () => Poller
});
module.exports = __toCommonJS(poller_exports);
class Poller {
  constructor(options) {
    this.options = options;
  }
  timer;
  failures = 0;
  stopped = true;
  start(initialDelay = 0) {
    this.stop();
    this.stopped = false;
    this.schedule(initialDelay);
  }
  stop() {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = void 0;
    }
  }
  /**
   * Delay to wait after the given number of consecutive failures
   *
   * @param interval
   * @param failures
   * @param maxBackoff
   */
  static backoffDelay(interval, failures, maxBackoff) {
    if (failures <= 0) {
      return interval;
    }
    return Math.min(interval * 2 ** failures, Math.max(maxBackoff, interval));
  }
  schedule(delay) {
    this.timer = setTimeout(() => void this.tick(), delay);
  }
  async tick() {
    var _a, _b;
    this.timer = void 0;
    try {
      await this.options.run();
      this.failures = 0;
    } catch (error) {
      this.failures++;
      if (!this.stopped) {
        (_b = (_a = this.options).onError) == null ? void 0 : _b.call(_a, error, this.nextDelay());
      }
    }
    if (!this.stopped) {
      this.schedule(this.nextDelay());
    }
  }
  nextDelay() {
    const { interval, maxBackoff = 15 * 6e4 } = this.options;
    return Poller.backoffDelay(interval, this.failures, maxBackoff);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Poller
});
//# sourceMappingURL=poller.js.map
