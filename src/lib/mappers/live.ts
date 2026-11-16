import type { VrmDiagnosticRecord } from "../types";
import { newestTs, parseUnit, recordTs, type ChannelDef, type StateDef } from "./diagnostics";

/** One way to obtain a value: all records matching service + one of the paths are summed up */
interface LiveSource {
    service: string;
    paths: string[];
}

interface LiveDefinition {
    id: string;
    name: string;
    role: string;
    unit?: string;
    /** Alternatives in order of preference; the first one with at least one match wins */
    sources: LiveSource[];
    /** "sum" (default) adds up all matches, e.g. phases; "first" takes the first match, e.g. a temperature */
    aggregate?: "sum" | "first";
}

const PHASES = ["L1", "L2", "L3"];
const phasePaths = (prefix: string): string[] => PHASES.map(phase => `${prefix}/${phase}/Power`);

/**
 * Well-known values with fixed ids, taken from the Venus OS D-Bus paths that VRM
 * reports in the diagnostics (dbusServiceType / dbusPath).
 */
export const LIVE_DEFINITIONS: LiveDefinition[] = [
    {
        id: "soc",
        name: "Battery state of charge",
        role: "value.battery",
        unit: "%",
        sources: [
            { service: "system", paths: ["/Dc/Battery/Soc"] },
            { service: "battery", paths: ["/Soc"] },
        ],
    },
    {
        id: "batteryVoltage",
        name: "Battery voltage",
        role: "value.voltage",
        unit: "V",
        sources: [
            { service: "system", paths: ["/Dc/Battery/Voltage"] },
            { service: "battery", paths: ["/Dc/0/Voltage"] },
        ],
    },
    {
        id: "batteryCurrent",
        name: "Battery current",
        role: "value.current",
        unit: "A",
        sources: [
            { service: "system", paths: ["/Dc/Battery/Current"] },
            { service: "battery", paths: ["/Dc/0/Current"] },
        ],
    },
    {
        id: "batteryPower",
        name: "Battery power (positive = charging)",
        role: "value.power",
        unit: "W",
        sources: [
            { service: "system", paths: ["/Dc/Battery/Power"] },
            { service: "battery", paths: ["/Dc/0/Power"] },
        ],
    },
    {
        id: "pvDcPower",
        name: "PV power DC-coupled",
        role: "value.power",
        unit: "W",
        sources: [
            { service: "system", paths: ["/Dc/Pv/Power"] },
            { service: "solarcharger", paths: ["/Yield/Power"] },
        ],
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
                    ...phasePaths("/Ac/PvOnGenset"),
                ],
            },
        ],
    },
    {
        id: "gridPower",
        name: "Grid power (positive = import)",
        role: "value.power",
        unit: "W",
        sources: [{ service: "system", paths: phasePaths("/Ac/Grid") }],
    },
    {
        id: "consumption",
        name: "AC consumption",
        role: "value.power",
        unit: "W",
        sources: [{ service: "system", paths: phasePaths("/Ac/Consumption") }],
    },
    {
        id: "acOutPower",
        name: "AC output power (loads on AC-out of the inverter/charger)",
        role: "value.power",
        unit: "W",
        sources: [
            { service: "system", paths: phasePaths("/Ac/ConsumptionOnOutput") },
            { service: "vebus", paths: PHASES.map(phase => `/Ac/Out/${phase}/P`) },
        ],
    },
    {
        id: "gensetPower",
        name: "Generator power",
        role: "value.power",
        unit: "W",
        sources: [
            { service: "system", paths: phasePaths("/Ac/Genset") },
            { service: "genset", paths: ["/Ac/Power"] },
        ],
    },
    {
        id: "evChargerPower",
        name: "EV charger power (all chargers)",
        role: "value.power",
        unit: "W",
        sources: [{ service: "evcharger", paths: ["/Ac/Power"] }],
    },
    {
        id: "batteryTemperature",
        name: "Battery temperature",
        role: "value.temperature",
        unit: "°C",
        sources: [
            { service: "system", paths: ["/Dc/Battery/Temperature"] },
            { service: "battery", paths: ["/Dc/0/Temperature"] },
        ],
        aggregate: "first",
    },
];

/**
 * Sum of all matching records and the newest timestamp among them
 *
 * @param records - Diagnostics records
 * @param source - Service and D-Bus paths to add up
 * @param first - Take only the first match instead of the sum
 */
function sumSource(
    records: VrmDiagnosticRecord[],
    source: LiveSource,
    first = false,
): { sum: number; ts?: number } | undefined {
    let sum: number | undefined;
    let ts: number | undefined;
    for (const record of records) {
        if (record.dbusServiceType !== source.service || !record.dbusPath || !source.paths.includes(record.dbusPath)) {
            continue;
        }
        const value = typeof record.rawValue === "number" ? record.rawValue : Number(record.rawValue);
        if (record.rawValue === null || isNaN(value)) {
            continue;
        }
        sum = (sum ?? 0) + value;
        ts = newestTs([ts, recordTs(record)]);
        if (first) {
            break;
        }
    }
    return sum === undefined ? undefined : { sum, ts };
}

/** D-Bus paths of the time to go, in order of preference (one record, not summed up) */
const TIME_TO_GO_SOURCES: LiveSource[] = [
    { service: "system", paths: ["/Dc/Battery/TimeToGo"] },
    { service: "battery", paths: ["/TimeToGo"] },
];

/**
 * Remaining battery runtime in hours as calculated by the GX device / battery monitor.
 * The D-Bus value is in seconds; VRM may report it already converted, which its format ("%.2F h") tells.
 * Empty while charging, then null.
 *
 * @param records - Diagnostics records
 */
export function timeToGo(records: VrmDiagnosticRecord[]): { hours: number | null; ts?: number } | undefined {
    for (const source of TIME_TO_GO_SOURCES) {
        const record = records.find(
            r => r.dbusServiceType === source.service && r.dbusPath !== undefined && source.paths.includes(r.dbusPath),
        );
        if (!record) {
            continue;
        }
        const raw = typeof record.rawValue === "number" ? record.rawValue : Number(record.rawValue);
        if (record.rawValue === null || record.rawValue === "" || isNaN(raw)) {
            return { hours: null, ts: recordTs(record) };
        }
        const unit = (record.formatWithUnit ?? "").trim().split(/\s+/).pop() ?? "";
        const hours = unit === "h" ? raw : unit === "min" ? raw / 60 : raw / 3600;
        return { hours: Math.round(hours * 100) / 100, ts: recordTs(record) };
    }
    return undefined;
}

/**
 * Extracts the well-known values from the diagnostics.
 * Values that are not reported by the installation are omitted (no state is created).
 * `pvPower` is the sum of DC- and AC-coupled PV if at least one of them exists.
 *
 * @param records
 */
export function mapLive(records: VrmDiagnosticRecord[]): StateDef[] {
    const result: StateDef[] = [];
    const values: Record<string, { sum: number; ts?: number }> = {};

    for (const def of LIVE_DEFINITIONS) {
        let found: { sum: number; ts?: number } | undefined;
        for (const source of def.sources) {
            found = sumSource(records, source, def.aggregate === "first");
            if (found !== undefined) {
                break;
            }
        }
        if (found === undefined) {
            continue;
        }
        values[def.id] = found;
        result.push({
            id: `live.${def.id}`,
            common: { name: def.name, type: "number", role: def.role, unit: def.unit, read: true, write: false },
            value: Math.round(found.sum * 100) / 100,
            ts: found.ts,
        });
    }

    if (values.pvDcPower !== undefined || values.pvAcPower !== undefined) {
        result.push({
            id: "live.pvPower",
            common: {
                name: "PV power total",
                type: "number",
                role: "value.power",
                unit: "W",
                read: true,
                write: false,
            },
            value: Math.round(((values.pvDcPower?.sum ?? 0) + (values.pvAcPower?.sum ?? 0)) * 100) / 100,
            ts: newestTs([values.pvDcPower?.ts, values.pvAcPower?.ts]),
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
                write: false,
            },
            value: ttg.hours,
            ts: ttg.ts,
        });
    }

    return result;
}

/** Fluid types of the tank service (/FluidType), used when VRM sends no enum names */
const FLUID_TYPES: Record<number, string> = {
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
    11: "Raw water",
};

/** Folders and states of the tank sensors */
export interface MappedTanks {
    /** "live.tanks" and one folder per tank */
    channels: ChannelDef[];
    /** Level, remaining volume and fluid type per tank */
    states: StateDef[];
}

/**
 * Numeric value of a record, null if it is missing or empty
 *
 * @param record - Diagnostics record
 */
function numberOf(record: VrmDiagnosticRecord | undefined): number | null {
    if (!record || record.rawValue === null || record.rawValue === "") {
        return null;
    }
    const value = typeof record.rawValue === "number" ? record.rawValue : Number(record.rawValue);
    return isNaN(value) ? null : value;
}

/**
 * One folder per tank sensor: "live.tanks.tank_<instance>" with level, remaining and fluid type
 *
 * @param records - Diagnostics records
 */
export function mapTanks(records: VrmDiagnosticRecord[]): MappedTanks {
    const byInstance = new Map<number, Map<string, VrmDiagnosticRecord>>();
    for (const record of records) {
        if (record.dbusServiceType !== "tank" || !record.dbusPath) {
            continue;
        }
        const paths = byInstance.get(record.instance) ?? new Map<string, VrmDiagnosticRecord>();
        paths.set(record.dbusPath, record);
        byInstance.set(record.instance, paths);
    }

    const channels: ChannelDef[] = [];
    const states: StateDef[] = [];
    for (const [instance, paths] of [...byInstance].sort(([a], [b]) => a - b)) {
        const level = paths.get("/Level");
        const remaining = paths.get("/Remaining");
        const fluid = paths.get("/FluidType");
        if (!level && !remaining) {
            continue;
        }
        const fluidType = numberOf(fluid);
        const fluidNames: Record<number, string> = fluid?.dataAttributeEnumValues?.length
            ? Object.fromEntries(fluid.dataAttributeEnumValues.map(e => [e.valueEnum, e.nameEnum]))
            : FLUID_TYPES;
        const fluidName = fluidType !== null ? fluidNames[fluidType] : undefined;
        const folder = `live.tanks.tank_${instance}`;
        channels.push({ id: folder, name: fluidName ? `Tank ${instance} (${fluidName})` : `Tank ${instance}` });

        const common = (name: string, role: string, unit?: string): StateDef["common"] => ({
            name,
            type: "number",
            role,
            ...(unit ? { unit } : {}),
            read: true,
            write: false,
        });
        if (level) {
            states.push({
                id: `${folder}.level`,
                common: { ...common("Tank level", "value.fill", "%"), min: 0, max: 100 },
                value: numberOf(level),
                ts: recordTs(level),
            });
        }
        if (remaining) {
            // D-Bus reports m3; VRM may convert it, its format tells the unit
            states.push({
                id: `${folder}.remaining`,
                common: common("Remaining volume", "value.fill", parseUnit(remaining.formatWithUnit) ?? "m³"),
                value: numberOf(remaining),
                ts: recordTs(remaining),
            });
        }
        if (fluid) {
            states.push({
                id: `${folder}.fluidType`,
                common: { ...common("Fluid type", "value"), states: fluidNames },
                value: fluidType,
                ts: recordTs(fluid),
            });
        }
    }
    if (channels.length) {
        channels.unshift({ id: "live.tanks", name: "Tanks" });
    }
    return { channels, states };
}
