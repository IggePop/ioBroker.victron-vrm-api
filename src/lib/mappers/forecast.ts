import type { VrmStatsResponse } from "../types";
import type { ChannelDef, StateDef } from "./diagnostics";

const HOUR = 3_600_000;

/** Forecast series of VRM (Wh per hour) and the state id prefix used for them */
const SERIES = [
    { code: "solar_yield_forecast", id: "solar", name: "PV yield" },
    { code: "vrm_consumption_fc", id: "consumption", name: "Consumption" },
    { code: "vrm_consum_hp_fc", id: "heatPump", name: "Heat pump consumption" },
    { code: "vrm_consum_evcs_fc", id: "evCharger", name: "EV charger consumption" },
] as const;

/** Window to request: yesterday's hours are ignored, but make sure today and tomorrow are complete */
export function forecastWindow(now: number): { start: number; end: number } {
    const hour = Math.floor(now / HOUR) * HOUR;
    return { start: hour - 24 * HOUR, end: hour + 48 * HOUR };
}

/**
 * Returns a function that gives the calendar day ("YYYY-MM-DD") of a timestamp in the given time zone.
 * Falls back to the time zone of the host if the zone is unknown.
 *
 * @param timeZone - IANA time zone of the installation, e.g. "Europe/Berlin"
 */
export function dayKeyFormatter(timeZone?: string): (ts: number) => string {
    let format: Intl.DateTimeFormat;
    try {
        format = new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    } catch {
        format = new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit" });
    }
    return (ts: number) => format.format(new Date(ts));
}

function round(value: number, digits: number): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

/**
 * Converts the hourly forecast into day totals (kWh), the remaining energy of today,
 * the average power of the current hour (W) and an hourly JSON for scripts and charts.
 *
 * @param records - The "records" of the stats response with type=forecast
 * @param now - Current time in milliseconds
 * @param timeZone - Time zone of the installation, defines where a day starts
 */
export function mapForecast(
    records: VrmStatsResponse["records"],
    now: number,
    timeZone?: string,
): { channels: ChannelDef[]; states: StateDef[] } {
    const dayOf = dayKeyFormatter(timeZone);
    const today = dayOf(now);
    const tomorrow = dayOf(now + 24 * HOUR);
    const currentHour = Math.floor(now / HOUR) * HOUR;
    const remainingOfHour = 1 - (now - currentHour) / HOUR;

    const states: StateDef[] = [];
    const hourly = new Map<number, Record<string, number>>();
    const energy = (name: string): StateDef["common"] => ({
        name,
        type: "number",
        role: "value.energy",
        unit: "kWh",
        read: true,
        write: false,
    });
    const power = (name: string): StateDef["common"] => ({
        name,
        type: "number",
        role: "value.power",
        unit: "W",
        read: true,
        write: false,
    });

    for (const series of SERIES) {
        const points = records?.[series.code];
        if (!Array.isArray(points) || points.length === 0) {
            continue;
        }
        let sumToday = 0;
        let sumTomorrow = 0;
        let remaining = 0;
        let currentWh: number | null = null;

        for (const [ts, raw] of points) {
            const wh = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
            const day = dayOf(ts);
            if (day === today) {
                sumToday += wh;
                if (ts > currentHour) {
                    remaining += wh;
                } else if (ts === currentHour) {
                    // only the part of the current hour that is still ahead
                    remaining += wh * remainingOfHour;
                }
            } else if (day === tomorrow) {
                sumTomorrow += wh;
            }
            if (ts === currentHour) {
                currentWh = wh;
            }
            if (day === today || day === tomorrow) {
                const entry = hourly.get(ts) ?? { ts };
                entry[series.id] = Math.round(wh);
                hourly.set(ts, entry);
            }
        }

        states.push(
            {
                id: `forecast.${series.id}Today`,
                common: energy(`${series.name} today`),
                value: round(sumToday / 1000, 3),
            },
            {
                id: `forecast.${series.id}RemainingToday`,
                common: energy(`${series.name} rest of today`),
                value: round(remaining / 1000, 3),
            },
            {
                id: `forecast.${series.id}Tomorrow`,
                common: energy(`${series.name} tomorrow`),
                value: round(sumTomorrow / 1000, 3),
            },
            {
                id: `forecast.${series.id}PowerNow`,
                // Wh within one hour = average power in W
                common: power(`${series.name}: average power in the current hour`),
                value: currentWh === null ? null : Math.round(currentWh),
            },
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
            write: false,
        },
        value: JSON.stringify([...hourly.values()].sort((a, b) => a.ts - b.ts)),
    });

    return { channels: [{ id: "forecast", name: "Forecast" }], states };
}
