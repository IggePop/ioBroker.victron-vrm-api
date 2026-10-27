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
var energy_exports = {};
__export(energy_exports, {
  ENERGY_CODES: () => ENERGY_CODES,
  ENERGY_PERIODS: () => ENERGY_PERIODS,
  mapEnergy: () => mapEnergy
});
module.exports = __toCommonJS(energy_exports);
const FLOWS = {
  pvToConsumers: { code: "Pc", name: "PV to consumers" },
  pvToBattery: { code: "Pb", name: "PV to battery" },
  pvToGrid: { code: "Pg", name: "PV to grid" },
  gridToConsumers: { code: "Gc", name: "Grid to consumers" },
  gridToBattery: { code: "Gb", name: "Grid to battery" },
  batteryToConsumers: { code: "Bc", name: "Battery to consumers" },
  batteryToGrid: { code: "Bg", name: "Battery to grid" },
  gensetToConsumers: { code: "gc", name: "Generator to consumers" },
  gensetToBattery: { code: "gb", name: "Generator to battery" }
};
const TOTALS = [
  { id: "solarYield", name: "PV yield", flows: ["pvToConsumers", "pvToBattery", "pvToGrid"] },
  {
    id: "consumption",
    name: "Consumption",
    flows: ["pvToConsumers", "gridToConsumers", "batteryToConsumers", "gensetToConsumers"]
  },
  { id: "gridImport", name: "Grid import", flows: ["gridToConsumers", "gridToBattery"] },
  { id: "gridExport", name: "Grid export", flows: ["pvToGrid", "batteryToGrid"] },
  { id: "batteryCharged", name: "Battery charged", flows: ["pvToBattery", "gridToBattery", "gensetToBattery"] },
  { id: "batteryDischarged", name: "Battery discharged", flows: ["batteryToConsumers", "batteryToGrid"] },
  { id: "genset", name: "Generator", flows: ["gensetToConsumers", "gensetToBattery"], optional: true }
];
const ENERGY_PERIODS = {
  today: "Today",
  week: "Week",
  month: "Month",
  year: "Year"
};
const ENERGY_CODES = Object.values(FLOWS).map((flow) => flow.code);
function round(value) {
  return Math.round(value * 1e3) / 1e3;
}
function mapEnergy(records) {
  var _a;
  const periods = Object.keys(ENERGY_PERIODS).filter((p) => {
    var _a2;
    return (_a2 = records == null ? void 0 : records[p]) == null ? void 0 : _a2.totals;
  });
  const valueOf = (period, flow) => {
    const raw = records[period].totals[FLOWS[flow].code];
    return typeof raw === "number" && Number.isFinite(raw) ? raw : void 0;
  };
  const existing = new Set(
    Object.keys(FLOWS).filter((flow) => periods.some((p) => valueOf(p, flow) !== void 0))
  );
  const channels = [];
  const states = [];
  const common = (name) => ({
    name,
    type: "number",
    role: "value.energy",
    unit: "kWh",
    read: true,
    write: false
  });
  for (const period of periods) {
    channels.push({ id: `energy.${period}`, name: ENERGY_PERIODS[period] });
    for (const total of TOTALS) {
      if (total.optional && !total.flows.some((flow) => existing.has(flow))) {
        continue;
      }
      const sum = total.flows.reduce((acc, flow) => {
        var _a2;
        return acc + ((_a2 = valueOf(period, flow)) != null ? _a2 : 0);
      }, 0);
      states.push({ id: `energy.${period}.${total.id}`, common: common(total.name), value: round(sum) });
    }
    for (const flow of existing) {
      states.push({
        id: `energy.${period}.flows.${flow}`,
        common: common(FLOWS[flow].name),
        native: { code: FLOWS[flow].code },
        value: round((_a = valueOf(period, flow)) != null ? _a : 0)
      });
    }
    if (existing.size) {
      channels.push({ id: `energy.${period}.flows`, name: `${ENERGY_PERIODS[period]}: energy flows` });
    }
  }
  return { channels, states };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ENERGY_CODES,
  ENERGY_PERIODS,
  mapEnergy
});
//# sourceMappingURL=energy.js.map
