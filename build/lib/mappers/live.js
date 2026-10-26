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
  mapLive: () => mapLive
});
module.exports = __toCommonJS(live_exports);
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
    ]
  },
  {
    id: "batteryVoltage",
    name: "Battery voltage",
    role: "value.voltage",
    unit: "V",
    sources: [
      { service: "system", paths: ["/Dc/Battery/Voltage"] },
      { service: "battery", paths: ["/Dc/0/Voltage"] }
    ]
  },
  {
    id: "batteryCurrent",
    name: "Battery current",
    role: "value.current",
    unit: "A",
    sources: [
      { service: "system", paths: ["/Dc/Battery/Current"] },
      { service: "battery", paths: ["/Dc/0/Current"] }
    ]
  },
  {
    id: "batteryPower",
    name: "Battery power (positive = charging)",
    role: "value.power",
    unit: "W",
    sources: [
      { service: "system", paths: ["/Dc/Battery/Power"] },
      { service: "battery", paths: ["/Dc/0/Power"] }
    ]
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
  }
];
function sumSource(records, source) {
  let sum;
  for (const record of records) {
    if (record.dbusServiceType !== source.service || !record.dbusPath || !source.paths.includes(record.dbusPath)) {
      continue;
    }
    const value = typeof record.rawValue === "number" ? record.rawValue : Number(record.rawValue);
    if (record.rawValue === null || isNaN(value)) {
      continue;
    }
    sum = (sum != null ? sum : 0) + value;
  }
  return sum;
}
function mapLive(records) {
  var _a, _b;
  const result = [];
  const values = {};
  for (const def of LIVE_DEFINITIONS) {
    let value;
    for (const source of def.sources) {
      value = sumSource(records, source);
      if (value !== void 0) {
        break;
      }
    }
    if (value === void 0) {
      continue;
    }
    values[def.id] = value;
    result.push({
      id: `live.${def.id}`,
      common: { name: def.name, type: "number", role: def.role, unit: def.unit, read: true, write: false },
      value: Math.round(value * 100) / 100
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
      value: Math.round((((_a = values.pvDcPower) != null ? _a : 0) + ((_b = values.pvAcPower) != null ? _b : 0)) * 100) / 100
    });
  }
  return result;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  LIVE_DEFINITIONS,
  mapLive
});
//# sourceMappingURL=live.js.map
