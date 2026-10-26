import type { VrmDiagnosticRecord } from "../types";
import type { StateDef } from "./diagnostics";

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

function sumSource(records: VrmDiagnosticRecord[], source: LiveSource): number | undefined {
    let sum: number | undefined;
    for (const record of records) {
        if (record.dbusServiceType !== source.service || !record.dbusPath || !source.paths.includes(record.dbusPath)) {
            continue;
        }
        const value = typeof record.rawValue === "number" ? record.rawValue : Number(record.rawValue);
        if (record.rawValue === null || isNaN(value)) {
            continue;
        }
        sum = (sum ?? 0) + value;
    }
    return sum;
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
    const values: Record<string, number> = {};

    for (const def of LIVE_DEFINITIONS) {
        let value: number | undefined;
        for (const source of def.sources) {
            value = sumSource(records, source);
            if (value !== undefined) {
                break;
            }
        }
        if (value === undefined) {
            continue;
        }
        values[def.id] = value;
        result.push({
            id: `live.${def.id}`,
            common: { name: def.name, type: "number", role: def.role, unit: def.unit, read: true, write: false },
            value: Math.round(value * 100) / 100,
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
            value: Math.round(((values.pvDcPower ?? 0) + (values.pvAcPower ?? 0)) * 100) / 100,
        });
    }

    return result;
}
