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
var live_exports = {};
__export(live_exports, {
  LIVE_DEFINITIONS: () => LIVE_DEFINITIONS,
  mapLive: () => mapLive,
  mapTanks: () => mapTanks,
  timeToGo: () => timeToGo
});
module.exports = __toCommonJS(live_exports);
var import_diagnostics = require("./diagnostics");
const PHASES = ["L1", "L2", "L3"];
const phasePaths = (prefix) => PHASES.map((phase) => `${prefix}/${phase}/Power`);
const LIVE_DEFINITIONS = [
  {
    id: "soc",
    name: "Battery state of charge",
    role: "value.battery",
    unit: "%",
    sources: [
      { service: "system", paths: ["/Dc/Battery/Soc"] },
      { service: "battery", paths: ["/Soc"] }
    ],
    aggregate: "first"
  },
  {
    id: "batteryVoltage",
    name: "Battery voltage",
    role: "value.voltage",
    unit: "V",
    sources: [
      { service: "system", paths: ["/Dc/Battery/Voltage"] },
      { service: "battery", paths: ["/Dc/0/Voltage"] }
    ],
    aggregate: "first"
  },
  {
    id: "batteryCurrent",
    name: "Battery current",
    role: "value.current",
    unit: "A",
    sources: [
      { service: "system", paths: ["/Dc/Battery/Current"] },
      { service: "battery", paths: ["/Dc/0/Current"] }
    ],
    aggregate: "first"
  },
  {
    id: "batteryPower",
    name: "Battery power (positive = charging)",
    role: "value.power",
    unit: "W",
    sources: [
      { service: "system", paths: ["/Dc/Battery/Power"] },
      { service: "battery", paths: ["/Dc/0/Power"] }
    ],
    aggregate: "first"
  },
  {
    id: "pvDcPower",
    name: "PV power DC-coupled",
    role: "value.power",
    unit: "W",
    sources: [
      { service: "system", paths: ["/Dc/Pv/Power"] },
      { service: "solarcharger", paths: ["/Yield/Power"] }
    ]
  },
  {
    id: "pvAcPower",
    name: "PV power AC-coupled",
    role: "value.power",
    unit: "W",
    sources: [
      {
        service: "system",
        paths: [
          ...phasePaths("/Ac/PvOnGrid"),
          ...phasePaths("/Ac/PvOnOutput"),
          ...phasePaths("/Ac/PvOnGenset")
        ]
      }
    ]
  },
  {
    id: "gridPower",
    name: "Grid power (positive = import)",
    role: "value.power",
    unit: "W",
    sources: [{ service: "system", paths: phasePaths("/Ac/Grid") }]
  },
  {
    id: "consumption",
    name: "AC consumption",
    role: "value.power",
    unit: "W",
    sources: [{ service: "system", paths: phasePaths("/Ac/Consumption") }]
  },
  {
    id: "acOutPower",
    name: "AC output power (loads on AC-out of the inverter/charger)",
    role: "value.power",
    unit: "W",
    sources: [
      { service: "system", paths: phasePaths("/Ac/ConsumptionOnOutput") },
      { service: "vebus", paths: PHASES.map((phase) => `/Ac/Out/${phase}/P`) }
    ]
  },
  {
    id: "gensetPower",
    name: "Generator power",
    role: "value.power",
    unit: "W",
    sources: [
      { service: "system", paths: phasePaths("/Ac/Genset") },
      { service: "genset", paths: ["/Ac/Power"] }
    ]
  },
  {
    id: "evChargerPower",
    name: "EV charger power (all chargers)",
    role: "value.power",
    unit: "W",
    sources: [{ service: "evcharger", paths: ["/Ac/Power"] }]
  },
  {
    id: "batteryTemperature",
    name: "Battery temperature",
    role: "value.temperature",
    unit: "\xB0C",
    sources: [
      { service: "system", paths: ["/Dc/Battery/Temperature"] },
      { service: "battery", paths: ["/Dc/0/Temperature"] }
    ],
    aggregate: "first"
  }
];
function sumSource(records, source, first = false) {
  const matches = [];
  for (const record of records) {
    if (record.dbusServiceType !== source.service || !record.dbusPath || !source.paths.includes(record.dbusPath)) {
      continue;
    }
    const value = typeof record.rawValue === "number" ? record.rawValue : Number(record.rawValue);
    if (record.rawValue === null || isNaN(value)) {
      continue;
    }
    matches.push({ value, record });
  }
  if (!matches.length) {
    return void 0;
  }
  const used = first ? matches.filter((m) => m.record.instance === Math.min(...matches.map((x) => x.record.instance))) : matches;
  return {
    sum: used.reduce((acc, m) => acc + m.value, 0),
    ts: (0, import_diagnostics.newestTs)(used.map((m) => (0, import_diagnostics.recordTs)(m.record)))
  };
}
const TIME_TO_GO_SOURCES = [
  { service: "system", paths: ["/Dc/Battery/TimeToGo"] },
  { service: "battery", paths: ["/TimeToGo"] }
];
function timeToGo(records) {
  var _a, _b;
  for (const source of TIME_TO_GO_SOURCES) {
    const record = records.find(
      (r) => r.dbusServiceType === source.service && r.dbusPath !== void 0 && source.paths.includes(r.dbusPath)
    );
    if (!record) {
      continue;
    }
    const raw = typeof record.rawValue === "number" ? record.rawValue : Number(record.rawValue);
    if (record.rawValue === null || record.rawValue === "" || isNaN(raw)) {
      return { hours: null, ts: (0, import_diagnostics.recordTs)(record) };
    }
    const unit = (_b = ((_a = record.formatWithUnit) != null ? _a : "").trim().split(/\s+/).pop()) != null ? _b : "";
    const hours = unit === "h" ? raw : unit === "min" ? raw / 60 : raw / 3600;
    return { hours: Math.round(hours * 100) / 100, ts: (0, import_diagnostics.recordTs)(record) };
  }
  return void 0;
}
function mapLive(records) {
  var _a, _b, _c, _d, _e, _f;
  const result = [];
  const values = {};
  for (const def of LIVE_DEFINITIONS) {
    let found;
    for (const source of def.sources) {
      found = sumSource(records, source, def.aggregate === "first");
      if (found !== void 0) {
        break;
      }
    }
    if (found === void 0) {
      continue;
    }
    values[def.id] = found;
    result.push({
      id: `live.${def.id}`,
      common: { name: def.name, type: "number", role: def.role, unit: def.unit, read: true, write: false },
      value: Math.round(found.sum * 100) / 100,
      ts: found.ts
    });
  }
  if (values.pvDcPower !== void 0 || values.pvAcPower !== void 0) {
    result.push({
      id: "live.pvPower",
      common: {
        name: "PV power total",
        type: "number",
        role: "value.power",
        unit: "W",
        read: true,
        write: false
      },
      value: Math.round((((_b = (_a = values.pvDcPower) == null ? void 0 : _a.sum) != null ? _b : 0) + ((_d = (_c = values.pvAcPower) == null ? void 0 : _c.sum) != null ? _d : 0)) * 100) / 100,
      ts: (0, import_diagnostics.newestTs)([(_e = values.pvDcPower) == null ? void 0 : _e.ts, (_f = values.pvAcPower) == null ? void 0 : _f.ts])
    });
  }
  const ttg = timeToGo(records);
  if (ttg) {
    result.push({
      id: "live.batteryTimeToGo",
      common: {
        name: "Battery time to go (empty while charging)",
        type: "number",
        role: "value",
        unit: "h",
        read: true,
        write: false
      },
      value: ttg.hours,
      ts: ttg.ts
    });
  }
  return result;
}
const FLUID_TYPES = {
  0: "Fuel",
  1: "Fresh water",
  2: "Waste water",
  3: "Live well",
  4: "Oil",
  5: "Black water (sewage)",
  6: "Gasoline",
  7: "Diesel",
  8: "LPG",
  9: "LNG",
  10: "Hydraulic oil",
  11: "Raw water"
};
function numberOf(record) {
  if (!record || record.rawValue === null || record.rawValue === "") {
    return null;
  }
  const value = typeof record.rawValue === "number" ? record.rawValue : Number(record.rawValue);
  return isNaN(value) ? null : value;
}
function mapTanks(records) {
  var _a, _b, _c;
  const byInstance = /* @__PURE__ */ new Map();
  for (const record of records) {
    if (record.dbusServiceType !== "tank" || !record.dbusPath) {
      continue;
    }
    const paths = (_a = byInstance.get(record.instance)) != null ? _a : /* @__PURE__ */ new Map();
    paths.set(record.dbusPath, record);
    byInstance.set(record.instance, paths);
  }
  const channels = [];
  const states = [];
  for (const [instance, paths] of [...byInstance].sort(([a], [b]) => a - b)) {
    const level = paths.get("/Level");
    const remaining = paths.get("/Remaining");
    const fluid = paths.get("/FluidType");
    if (!level && !remaining) {
      continue;
    }
    const fluidType = numberOf(fluid);
    const fluidNames = ((_b = fluid == null ? void 0 : fluid.dataAttributeEnumValues) == null ? void 0 : _b.length) ? Object.fromEntries(fluid.dataAttributeEnumValues.map((e) => [e.valueEnum, e.nameEnum])) : FLUID_TYPES;
    const fluidName = fluidType !== null ? fluidNames[fluidType] : void 0;
    const folder = `live.tanks.tank_${instance}`;
    channels.push({ id: folder, name: fluidName ? `Tank ${instance} (${fluidName})` : `Tank ${instance}` });
    const common = (name, role, unit) => ({
      name,
      type: "number",
      role,
      ...unit ? { unit } : {},
      read: true,
      write: false
    });
    if (level) {
      states.push({
        id: `${folder}.level`,
        common: { ...common("Tank level", "value.fill", "%"), min: 0, max: 100 },
        value: numberOf(level),
        ts: (0, import_diagnostics.recordTs)(level)
      });
    }
    if (remaining) {
      states.push({
        id: `${folder}.remaining`,
        common: common("Remaining volume", "value.fill", (_c = (0, import_diagnostics.parseUnit)(remaining.formatWithUnit)) != null ? _c : "m\xB3"),
        value: numberOf(remaining),
        ts: (0, import_diagnostics.recordTs)(remaining)
      });
    }
    if (fluid) {
      states.push({
        id: `${folder}.fluidType`,
        common: { ...common("Fluid type", "value"), states: fluidNames },
        value: fluidType,
        ts: (0, import_diagnostics.recordTs)(fluid)
      });
    }
  }
  if (channels.length) {
    channels.unshift({ id: "live.tanks", name: "Tanks" });
  }
  return { channels, states };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  LIVE_DEFINITIONS,
  mapLive,
  mapTanks,
  timeToGo
});
//# sourceMappingURL=live.js.map
