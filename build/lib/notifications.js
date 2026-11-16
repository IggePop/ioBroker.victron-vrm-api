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
var notifications_exports = {};
__export(notifications_exports, {
  becameStale: () => becameStale,
  newAlarms: () => newAlarms
});
module.exports = __toCommonJS(notifications_exports);
function alarmKey(entry) {
  return `${entry.device}|${entry.instance}|${entry.text}|${entry.started}`;
}
function newAlarms(previousJson, active) {
  let previous = [];
  if (typeof previousJson === "string" && previousJson) {
    try {
      const parsed = JSON.parse(previousJson);
      previous = Array.isArray(parsed) ? parsed : [];
    } catch {
      previous = [];
    }
  }
  const known = new Set(previous.map(alarmKey));
  return active.filter((entry) => !known.has(alarmKey(entry)));
}
function becameStale(previous, stale) {
  return stale && previous !== true;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  becameStale,
  newAlarms
});
//# sourceMappingURL=notifications.js.map
