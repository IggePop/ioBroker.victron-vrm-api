import { expect } from "chai";
import type { VrmStatsPoint } from "../types";
import { dayKeyFormatter, forecastWindow, mapForecast } from "./forecast";

const HOUR = 3_600_000;
// 31.10.2026 00:00 in Europe/Berlin (CET, UTC+1)
const MIDNIGHT = Date.UTC(2026, 9, 30, 23, 0, 0);
const at = (hour: number, minute = 0): number => MIDNIGHT + hour * HOUR + minute * 60_000;

/** 48 hourly points from today 00:00; PV 1000 Wh from 10:00 to 14:59, consumption 500 Wh every hour */
function series(value: (localHour: number) => number): VrmStatsPoint[] {
    return Array.from({ length: 48 }, (_, i) => [at(i), value(i % 24)] as VrmStatsPoint);
}
const records = {
    solar_yield_forecast: series(h => (h >= 10 && h < 15 ? 1000 : 0)),
    vrm_consumption_fc: series(() => 500),
    vrm_consum_hp_fc: false as const,
};

describe("forecast mapper", () => {
    const value = (states: { id: string; value: ioBroker.StateValue }[], id: string): ioBroker.StateValue | undefined =>
        states.find(s => s.id === id)?.value;

    it("sums today and tomorrow in the time zone of the installation", () => {
        const { states } = mapForecast(records, at(12, 30), "Europe/Berlin");
        expect(value(states, "forecast.solarToday")).to.equal(5);
        expect(value(states, "forecast.solarTomorrow")).to.equal(5);
        expect(value(states, "forecast.consumptionToday")).to.equal(12);
        expect(value(states, "forecast.consumptionTomorrow")).to.equal(12);
    });

    it("counts only the rest of the current hour for the remaining energy", () => {
        const { states } = mapForecast(records, at(12, 30), "Europe/Berlin");
        // half of 12:00 (500) + 13:00 + 14:00
        expect(value(states, "forecast.solarRemainingToday")).to.equal(2.5);
        // half of 12:00 + 11 full hours until midnight
        expect(value(states, "forecast.consumptionRemainingToday")).to.equal(5.75);
    });

    it("reports the average power of the current hour", () => {
        const { states } = mapForecast(records, at(12, 30), "Europe/Berlin");
        expect(value(states, "forecast.solarPowerNow")).to.equal(1000);
        expect(value(states, "forecast.consumptionPowerNow")).to.equal(500);
        const night = mapForecast(records, at(22, 10), "Europe/Berlin").states;
        expect(value(night, "forecast.solarPowerNow")).to.equal(0);
        expect(value(night, "forecast.solarRemainingToday")).to.equal(0);
    });

    it("provides the hourly forecast as JSON", () => {
        const { states } = mapForecast(records, at(12, 30), "Europe/Berlin");
        const hourly = JSON.parse(value(states, "forecast.hourly") as string) as Record<string, number>[];
        expect(hourly).to.have.length(48);
        expect(hourly[10]).to.deep.equal({ ts: at(10), solar: 1000, consumption: 500 });
        expect(hourly.map(h => h.ts)).to.deep.equal([...hourly.map(h => h.ts)].sort((a, b) => a - b));
    });

    it("omits series without data and returns nothing for an empty response", () => {
        const { states, channels } = mapForecast(records, at(12), "Europe/Berlin");
        expect(states.map(s => s.id)).not.to.include("forecast.heatPumpToday");
        expect(channels).to.deep.equal([{ id: "forecast", name: "Forecast" }]);
        expect(mapForecast({}, at(12), "Europe/Berlin")).to.deep.equal({ channels: [], states: [] });
    });

    it("uses the day boundaries of the given time zone", () => {
        // in UTC the local hour 00:00 still belongs to the previous day
        const dayOf = dayKeyFormatter("UTC");
        expect(dayOf(at(0))).to.equal("2026-10-30");
        expect(dayKeyFormatter("Europe/Berlin")(at(0))).to.equal("2026-10-31");
        // unknown zone falls back to the host zone instead of throwing
        expect(() => dayKeyFormatter("Not/AZone")(at(0))).not.to.throw();
    });

    it("requests 24 h back and 48 h ahead from the current hour", () => {
        expect(forecastWindow(at(12, 30))).to.deep.equal({ start: at(-12), end: at(60) });
    });
});
