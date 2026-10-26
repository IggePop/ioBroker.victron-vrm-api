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
var phase_sums_exports = {};
__export(phase_sums_exports, {
  detectPhase: () => detectPhase,
  detectQuantity: () => detectQuantity,
  mapPhaseSums: () => mapPhaseSums,
  stripPhase: () => stripPhase
});
module.exports = __toCommonJS(phase_sums_exports);
var import_diagnostics = require("./diagnostics");
const QUANTITY_UNITS = {
  power: { units: ["W", "kW"], role: "value.power" },
  current: { units: ["A"], role: "value.current" },
  energy: { units: ["kWh", "Wh"], role: "value.energy" }
};
function detectPhase(record) {
  var _a, _b;
  const fromName = /\bL([123])\b/.exec((_a = record.description) != null ? _a : "");
  if (fromName) {
    return Number(fromName[1]);
  }
  const fromPath = /\/L([123])(?:\/|$)/.exec((_b = record.dbusPath) != null ? _b : "");
  return fromPath ? Number(fromPath[1]) : void 0;
}
function detectQuantity(record) {
  var _a;
  const unit = (0, import_diagnostics.parseUnit)(record.formatWithUnit);
  const fromName = /\b(power|current|energy)\b/i.exec((_a = record.description) != null ? _a : "");
  if (fromName) {
    const quantity = fromName[1].toLowerCase();
    return unit && QUANTITY_UNITS[quantity].units.includes(unit) ? quantity : void 0;
  }
  return Object.keys(QUANTITY_UNITS).find((q) => unit && QUANTITY_UNITS[q].units.includes(unit));
}
function stripPhase(name) {
  let result = name.replace(/\bL[123]\b/, " ");
  if (result === name) {
    result = name.replace(/\bphase\s*[123]\b/i, " ").replace(/\s[123]$/, " ");
  }
  return result.replace(/\s+/g, " ").replace(/^[\s:-]+|[\s:-]+$/g, "").trim();
}
function toNumber(raw) {
  if (raw === null || raw === void 0 || raw === "") {
    return void 0;
  }
  const value = typeof raw === "number" ? raw : Number(raw);
  return isNaN(value) ? void 0 : value;
}
function mapPhaseSums(records) {
  const groups = /* @__PURE__ */ new Map();
  for (const record of records) {
    if (!record || record.Device === void 0) {
      continue;
    }
    const phase = detectPhase(record);
    const quantity = phase && detectQuantity(record);
    if (!phase || !quantity) {
      continue;
    }
    const channel = (0, import_diagnostics.channelId)(record);
    const key = `${channel}|${record.dbusPath ? record.dbusPath.replace(/\/L[123](\/|$)/, "/Lx$1") : stripPhase(record.description)}`;
    let group = groups.get(key);
    if (!group) {
      group = { channel, quantity, unit: (0, import_diagnostics.parseUnit)(record.formatWithUnit), members: [] };
      groups.set(key, group);
    }
    if (!group.members.some((m) => m.phase === phase)) {
      group.members.push({ phase, record });
    }
  }
  const result = [];
  const usedIds = /* @__PURE__ */ new Set();
  for (const group of groups.values()) {
    if (group.members.length < 2) {
      continue;
    }
    group.members.sort((a, b) => a.phase - b.phase);
    const baseName = stripPhase(group.members[0].record.description) || group.quantity;
    let id = `${group.channel}.sum.${baseName.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || group.quantity}`;
    while (usedIds.has(id)) {
      id += "_";
    }
    usedIds.add(id);
    const values = group.members.map((m) => toNumber(m.record.rawValue)).filter((v) => v !== void 0);
    const sum = values.length ? Math.round(values.reduce((a, b) => a + b, 0) * 1e3) / 1e3 : null;
    const phases = group.members.map((m) => `L${m.phase}`).join("+");
    result.push({
      id,
      common: {
        name: `${baseName} total (${phases})`,
        type: "number",
        role: QUANTITY_UNITS[group.quantity].role,
        unit: group.unit,
        read: true,
        write: false
      },
      native: {
        phaseSum: true,
        sources: group.members.map((m) => m.record.code)
      },
      value: sum
    });
  }
  return result;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  detectPhase,
  detectQuantity,
  mapPhaseSums,
  stripPhase
});
//# sourceMappingURL=phase-sums.js.map
