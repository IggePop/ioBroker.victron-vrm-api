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
var alarms_exports = {};
__export(alarms_exports, {
  ALARM_LOG_COUNT: () => ALARM_LOG_COUNT,
  mapAlarms: () => mapAlarms
});
module.exports = __toCommonJS(alarms_exports);
const ALARM_LOG_COUNT = 25;
function toEntry(record) {
  var _a, _b, _c;
  const device = ((_a = record.customName) == null ? void 0 : _a.trim()) || record.device || "Unknown device";
  const description = (_b = record.description) != null ? _b : "";
  const level = ((_c = record.nameEnum) == null ? void 0 : _c.trim()) || null;
  const text = (level == null ? void 0 : level.startsWith(description)) ? level : level ? `${description} (${level})` : description;
  const cleared = record.cleared ? record.cleared * 1e3 : null;
  return {
    device,
    instance: record.instance,
    text,
    level,
    active: record.isActive === 1 || cleared === null,
    started: record.started * 1e3,
    cleared
  };
}
function describe(entry) {
  return `${entry.device}: ${entry.text}`;
}
function mapAlarms(records) {
  var _a, _b;
  const entries = records.map(toEntry).sort((a, b) => b.started - a.started);
  const active = entries.filter((entry) => entry.active);
  const last = entries[0];
  const state = (id, value, common) => ({ id: `alarms.${id}`, common: { ...common, read: true, write: false }, value });
  return {
    channels: [{ id: "alarms", name: "Alarms" }],
    states: [
      state("count", active.length, { name: "Number of active alarms", type: "number", role: "value" }),
      state("active", active.length > 0, {
        name: "At least one alarm is active",
        type: "boolean",
        role: "indicator.alarm"
      }),
      state("activeText", active.map(describe).join(", "), {
        name: "Active alarms as text",
        type: "string",
        role: "text"
      }),
      state("activeList", JSON.stringify(active), {
        name: "Active alarms (JSON)",
        type: "string",
        role: "json"
      }),
      state("lastText", last ? describe(last) : "", {
        name: "Newest alarm",
        type: "string",
        role: "text"
      }),
      state("lastStarted", (_a = last == null ? void 0 : last.started) != null ? _a : null, {
        name: "Start of the newest alarm",
        type: "number",
        role: "date"
      }),
      state("lastCleared", (_b = last == null ? void 0 : last.cleared) != null ? _b : null, {
        name: "End of the newest alarm (empty while active)",
        type: "number",
        role: "date"
      }),
      state("history", JSON.stringify(entries.slice(0, ALARM_LOG_COUNT)), {
        name: `Last ${ALARM_LOG_COUNT} alarms (JSON)`,
        type: "string",
        role: "json"
      })
    ]
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ALARM_LOG_COUNT,
  mapAlarms
});
//# sourceMappingURL=alarms.js.map
