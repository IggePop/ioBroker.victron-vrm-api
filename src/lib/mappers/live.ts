import type { VrmDiagnosticRecord } from "../types";
import { newestTs, recordTs, type StateDef } from "./diagnostics";

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
];

/**
 * Sum of all matching records and the newest timestamp among them
 *
 * @param records - Diagnostics records
 * @param source - Service and D-Bus paths to add up
 */
function sumSource(records: VrmDiagnosticRecord[], source: LiveSource): { sum: number; ts?: number } | undefined {
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
            found = sumSource(records, source);
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
