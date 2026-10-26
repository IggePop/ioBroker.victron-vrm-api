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
var diagnostics_exports = {};
__export(diagnostics_exports, {
  channelId: () => channelId,
  guessRole: () => guessRole,
  mapDiagnostics: () => mapDiagnostics,
  parseUnit: () => parseUnit,
  sanitizeId: () => sanitizeId
});
module.exports = __toCommonJS(diagnostics_exports);
function sanitizeId(value) {
  return String(value).trim().replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}
function parseUnit(formatWithUnit) {
  if (!formatWithUnit) {
    return void 0;
  }
  const unit = formatWithUnit.replace(/%[-+ 0#]*\d*(?:\.\d+)?[a-zA-Z]/g, "").replace(/%%/g, "%").trim();
  return unit || void 0;
}
const UNIT_ROLES = {
  V: "value.voltage",
  A: "value.current",
  W: "value.power",
  kW: "value.power",
  VA: "value.power",
  kWh: "value.energy",
  Wh: "value.energy",
  Hz: "value.frequency",
  "\xB0C": "value.temperature",
  "\xB0F": "value.temperature",
  C: "value.temperature"
};
function guessRole(unit, description, type) {
  if (type !== "number") {
    return "text";
  }
  if (unit === "%" && /soc|state of charge|ladezustand/i.test(description)) {
    return "value.battery";
  }
  return unit && UNIT_ROLES[unit] || "value";
}
function stateType(record) {
  var _a, _b, _c;
  if (typeof record.rawValue === "number") {
    return "number";
  }
  if ((_a = record.dataAttributeEnumValues) == null ? void 0 : _a.length) {
    return "number";
  }
  if (typeof record.rawValue === "string") {
    return record.rawValue.trim() !== "" && !isNaN(Number(record.rawValue)) && !/%s/.test((_b = record.formatWithUnit) != null ? _b : "") ? "number" : "string";
  }
  return /%s/.test((_c = record.formatWithUnit) != null ? _c : "") ? "string" : "number";
}
function convertValue(raw, type) {
  if (raw === null || raw === void 0) {
    return null;
  }
  if (type === "number") {
    const num = typeof raw === "number" ? raw : Number(raw);
    return isNaN(num) ? null : num;
  }
  return String(raw);
}
function channelId(record) {
  return `diagnostics.${sanitizeId(record.Device).toLowerCase()}_${record.instance}`;
}
function mapDiagnostics(records) {
  var _a, _b;
  const channels = /* @__PURE__ */ new Map();
  const states = [];
  const usedIds = /* @__PURE__ */ new Set();
  let lastTimestamp;
  for (const record of records) {
    if (!record || record.code === void 0 || record.Device === void 0) {
      continue;
    }
    const chId = channelId(record);
    if (!channels.has(chId)) {
      channels.set(chId, { id: chId, name: `${record.Device} (${record.instance})` });
    }
    let id = `${chId}.${sanitizeId(record.code)}`;
    if (usedIds.has(id)) {
      id = `${id}_${record.idDataAttribute}`;
    }
    usedIds.add(id);
    const type = stateType(record);
    const unit = parseUnit(record.formatWithUnit);
    const common = {
      name: record.description || record.code,
      type,
      role: guessRole(unit, (_a = record.description) != null ? _a : "", type),
      read: true,
      write: false
    };
    if (unit && type === "number") {
      common.unit = unit;
    }
    if ((_b = record.dataAttributeEnumValues) == null ? void 0 : _b.length) {
      common.states = Object.fromEntries(record.dataAttributeEnumValues.map((e) => [e.valueEnum, e.nameEnum]));
    }
    states.push({
      id,
      common,
      native: {
        idDataAttribute: record.idDataAttribute,
        code: record.code,
        dbusServiceType: record.dbusServiceType,
        dbusPath: record.dbusPath,
        formatWithUnit: record.formatWithUnit
      },
      value: convertValue(record.rawValue, type)
    });
    if (typeof record.timestamp === "number") {
      const ts = record.timestamp * 1e3;
      lastTimestamp = lastTimestamp === void 0 ? ts : Math.max(lastTimestamp, ts);
    }
  }
  return { channels: [...channels.values()], states, lastTimestamp };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  channelId,
  guessRole,
  mapDiagnostics,
  parseUnit,
  sanitizeId
});
//# sourceMappingURL=diagnostics.js.map
