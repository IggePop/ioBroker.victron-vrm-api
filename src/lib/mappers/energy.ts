import type { VrmOverallStatsResponse } from "../types";
import type { ChannelDef, StateDef } from "./diagnostics";

/** Energy flows as VRM attribute codes (kWh) */
const FLOWS = {
    pvToConsumers: { code: "Pc", name: "PV to consumers" },
    pvToBattery: { code: "Pb", name: "PV to battery" },
    pvToGrid: { code: "Pg", name: "PV to grid" },
    gridToConsumers: { code: "Gc", name: "Grid to consumers" },
    gridToBattery: { code: "Gb", name: "Grid to battery" },
    batteryToConsumers: { code: "Bc", name: "Battery to consumers" },
    batteryToGrid: { code: "Bg", name: "Battery to grid" },
    gensetToConsumers: { code: "gc", name: "Generator to consumers" },
    gensetToBattery: { code: "gb", name: "Generator to battery" },
} as const;

type Flow = keyof typeof FLOWS;

/** Totals built from the flows; matches VRM's own totals (e.g. total_solar_yield, grid_history_from) */
const TOTALS: { id: string; name: string; flows: Flow[]; optional?: boolean }[] = [
    { id: "solarYield", name: "PV yield", flows: ["pvToConsumers", "pvToBattery", "pvToGrid"] },
    {
        id: "consumption",
        name: "Consumption",
        flows: ["pvToConsumers", "gridToConsumers", "batteryToConsumers", "gensetToConsumers"],
    },
    { id: "gridImport", name: "Grid import", flows: ["gridToConsumers", "gridToBattery"] },
    { id: "gridExport", name: "Grid export", flows: ["pvToGrid", "batteryToGrid"] },
    { id: "batteryCharged", name: "Battery charged", flows: ["pvToBattery", "gridToBattery", "gensetToBattery"] },
    { id: "batteryDischarged", name: "Battery discharged", flows: ["batteryToConsumers", "batteryToGrid"] },
    { id: "genset", name: "Generator", flows: ["gensetToConsumers", "gensetToBattery"], optional: true },
];

export const ENERGY_PERIODS = {
    today: "Today",
    week: "Week",
    month: "Month",
    year: "Year",
} as const;

/** Attribute codes to request from /overallstats */
export const ENERGY_CODES: string[] = Object.values(FLOWS).map(flow => flow.code);

export interface MappedEnergy {
    channels: ChannelDef[];
    states: StateDef[];
}

function round(value: number): number {
    return Math.round(value * 1000) / 1000;
}

/**
 * Converts the overallstats response into "energy.<period>.<value>" states in kWh.
 * Flows that never have data (e.g. no generator) are omitted; VRM reports them as false.
 *
 * @param records - The "records" of the overallstats response
 */
export function mapEnergy(records: VrmOverallStatsResponse["records"]): MappedEnergy {
    const periods = (Object.keys(ENERGY_PERIODS) as (keyof typeof ENERGY_PERIODS)[]).filter(p => records?.[p]?.totals);
    const valueOf = (period: string, flow: Flow): number | undefined => {
        const raw = records[period].totals[FLOWS[flow].code];
        return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
    };
    // a flow exists if any period has a number for it
    const existing = new Set(
        (Object.keys(FLOWS) as Flow[]).filter(flow => periods.some(p => valueOf(p, flow) !== undefined)),
    );

    const channels: ChannelDef[] = [];
    const states: StateDef[] = [];
    const common = (name: string): StateDef["common"] => ({
        name,
        type: "number",
        role: "value.energy",
        unit: "kWh",
        read: true,
        write: false,
    });

    for (const period of periods) {
        channels.push({ id: `energy.${period}`, name: ENERGY_PERIODS[period] });

        for (const total of TOTALS) {
            if (total.optional && !total.flows.some(flow => existing.has(flow))) {
                continue;
            }
            const sum = total.flows.reduce((acc, flow) => acc + (valueOf(period, flow) ?? 0), 0);
            states.push({ id: `energy.${period}.${total.id}`, common: common(total.name), value: round(sum) });
        }

        for (const flow of existing) {
            states.push({
                id: `energy.${period}.flows.${flow}`,
                common: common(FLOWS[flow].name),
                native: { code: FLOWS[flow].code },
                value: round(valueOf(period, flow) ?? 0),
            });
        }
        if (existing.size) {
            channels.push({ id: `energy.${period}.flows`, name: `${ENERGY_PERIODS[period]}: energy flows` });
        }
    }

    return { channels, states };
}
