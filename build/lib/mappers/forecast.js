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
var forecast_exports = {};
__export(forecast_exports, {
  dayKeyFormatter: () => dayKeyFormatter,
  forecastWindow: () => forecastWindow,
  mapForecast: () => mapForecast
});
module.exports = __toCommonJS(forecast_exports);
const HOUR = 36e5;
const SERIES = [
  { code: "solar_yield_forecast", id: "solar", name: "PV yield" },
  { code: "vrm_consumption_fc", id: "consumption", name: "Consumption" },
  { code: "vrm_consum_hp_fc", id: "heatPump", name: "Heat pump consumption" },
  { code: "vrm_consum_evcs_fc", id: "evCharger", name: "EV charger consumption" }
];
function forecastWindow(now) {
  const hour = Math.floor(now / HOUR) * HOUR;
  return { start: hour - 24 * HOUR, end: hour + 48 * HOUR };
}
function dayKeyFormatter(timeZone) {
  let format;
  try {
    format = new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    format = new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit" });
  }
  return (ts) => format.format(new Date(ts));
}
function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
function mapForecast(records, now, timeZone) {
  var _a;
  const dayOf = dayKeyFormatter(timeZone);
  const today = dayOf(now);
  const tomorrow = dayOf(now + 24 * HOUR);
  const currentHour = Math.floor(now / HOUR) * HOUR;
  const remainingOfHour = 1 - (now - currentHour) / HOUR;
  const states = [];
  const hourly = /* @__PURE__ */ new Map();
  const energy = (name) => ({
    name,
    type: "number",
    role: "value.energy",
    unit: "kWh",
    read: true,
    write: false
  });
  const power = (name) => ({
    name,
    type: "number",
    role: "value.power",
    unit: "W",
    read: true,
    write: false
  });
  for (const series of SERIES) {
    const points = records == null ? void 0 : records[series.code];
    if (!Array.isArray(points) || points.length === 0) {
      continue;
    }
    let sumToday = 0;
    let sumTomorrow = 0;
    let remaining = 0;
    let currentWh = null;
    for (const [ts, raw] of points) {
      const wh = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
      const day = dayOf(ts);
      if (day === today) {
        sumToday += wh;
        if (ts > currentHour) {
          remaining += wh;
        } else if (ts === currentHour) {
          remaining += wh * remainingOfHour;
        }
      } else if (day === tomorrow) {
        sumTomorrow += wh;
      }
      if (ts === currentHour) {
        currentWh = wh;
      }
      if (day === today || day === tomorrow) {
        const entry = (_a = hourly.get(ts)) != null ? _a : { ts };
        entry[series.id] = Math.round(wh);
        hourly.set(ts, entry);
      }
    }
    states.push(
      {
        id: `forecast.${series.id}Today`,
        common: energy(`${series.name} today`),
        value: round(sumToday / 1e3, 3)
      },
      {
        id: `forecast.${series.id}RemainingToday`,
        common: energy(`${series.name} rest of today`),
        value: round(remaining / 1e3, 3)
      },
      {
        id: `forecast.${series.id}Tomorrow`,
        common: energy(`${series.name} tomorrow`),
        value: round(sumTomorrow / 1e3, 3)
      },
      {
        id: `forecast.${series.id}PowerNow`,
        // Wh within one hour = average power in W
        common: power(`${series.name}: average power in the current hour`),
        value: currentWh === null ? null : Math.round(currentWh)
      }
    );
  }
  if (!states.length) {
    return { channels: [], states: [] };
  }
  states.push({
    id: "forecast.hourly",
    common: {
      name: "Hourly forecast for today and tomorrow (Wh per hour, ts in ms)",
      type: "string",
      role: "json",
      read: true,
      write: false
    },
    value: JSON.stringify([...hourly.values()].sort((a, b) => a.ts - b.ts))
  });
  return { channels: [{ id: "forecast", name: "Forecast" }], states };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  dayKeyFormatter,
  forecastWindow,
  mapForecast
});
//# sourceMappingURL=forecast.js.map
