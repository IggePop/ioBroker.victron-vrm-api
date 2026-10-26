import type { VrmDiagnosticRecord } from "../types";
import { channelId, parseUnit, type StateDef } from "./diagnostics";

type Quantity = "power" | "current" | "energy";

const QUANTITY_UNITS: Record<Quantity, { units: string[]; role: string }> = {
    power: { units: ["W", "kW"], role: "value.power" },
    current: { units: ["A"], role: "value.current" },
    energy: { units: ["kWh", "Wh"], role: "value.energy" },
};

interface PhaseMember {
    phase: number;
    record: VrmDiagnosticRecord;
}

/**
 * Detects the phase of a record. VRM names are inconsistent ("Grid L1", "L1 Energy",
 * "Input power 1"), so the D-Bus path (".../L1/...") is used as fallback.
 */
export function detectPhase(record: VrmDiagnosticRecord): number | undefined {
    const fromName = /\bL([123])\b/.exec(record.description ?? "");
    if (fromName) {
        return Number(fromName[1]);
    }
    const fromPath = /\/L([123])(?:\/|$)/.exec(record.dbusPath ?? "");
    return fromPath ? Number(fromPath[1]) : undefined;
}

/** Detects power/current/energy by name, falling back to the unit (e.g. "Grid L1" in W) */
export function detectQuantity(record: VrmDiagnosticRecord): Quantity | undefined {
    const unit = parseUnit(record.formatWithUnit);
    const fromName = /\b(power|current|energy)\b/i.exec(record.description ?? "");
    if (fromName) {
        const quantity = fromName[1].toLowerCase() as Quantity;
        // the unit must fit, e.g. no "Power factor" or values without numeric unit
        return unit && QUANTITY_UNITS[quantity].units.includes(unit) ? quantity : undefined;
    }
    return (Object.keys(QUANTITY_UNITS) as Quantity[]).find(q => unit && QUANTITY_UNITS[q].units.includes(unit));
}

/** Removes the phase marker from a name: "Grid L1 - Power" → "Grid - Power", "Input power 1" → "Input power" */
export function stripPhase(name: string): string {
    let result = name.replace(/\bL[123]\b/, " ");
    if (result === name) {
        result = name.replace(/\bphase\s*[123]\b/i, " ").replace(/\s[123]$/, " ");
    }
    return result
        .replace(/\s+/g, " ")
        .replace(/^[\s:-]+|[\s:-]+$/g, "")
        .trim();
}

function toNumber(raw: VrmDiagnosticRecord["rawValue"]): number | undefined {
    if (raw === null || raw === undefined || raw === "") {
        return undefined;
    }
    const value = typeof raw === "number" ? raw : Number(raw);
    return isNaN(value) ? undefined : value;
}

/**
 * Builds sums over L1-L3 for power, current and energy values of the same device.
 * A sum is created when at least two phases of the same value exist.
 * The states are placed in a "sum" channel below the device, e.g. "diagnostics.grid_meter_40.sum.Grid_Power".
 */
export function mapPhaseSums(records: VrmDiagnosticRecord[]): StateDef[] {
    const groups = new Map<string, { channel: string; quantity: Quantity; unit?: string; members: PhaseMember[] }>();

    for (const record of records) {
        if (!record || record.Device === undefined) {
            continue;
        }
        const phase = detectPhase(record);
        const quantity = phase && detectQuantity(record);
        if (!phase || !quantity) {
            continue;
        }
        const channel = channelId(record);
        // the D-Bus path is the most reliable grouping key, the name the fallback
        const key = `${channel}|${
            record.dbusPath ? record.dbusPath.replace(/\/L[123](\/|$)/, "/Lx$1") : stripPhase(record.description)
        }`;
        let group = groups.get(key);
        if (!group) {
            group = { channel, quantity, unit: parseUnit(record.formatWithUnit), members: [] };
            groups.set(key, group);
        }
        if (!group.members.some(m => m.phase === phase)) {
            group.members.push({ phase, record });
        }
    }

    const result: StateDef[] = [];
    const usedIds = new Set<string>();

    for (const group of groups.values()) {
        if (group.members.length < 2) {
            continue;
        }
        group.members.sort((a, b) => a.phase - b.phase);

        const baseName = stripPhase(group.members[0].record.description) || group.quantity;
        let id = `${group.channel}.sum.${baseName.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || group.quantity}`;
        while (usedIds.has(id)) {
            id += "_";
        }
        usedIds.add(id);

        const values = group.members.map(m => toNumber(m.record.rawValue)).filter((v): v is number => v !== undefined);
        const sum = values.length ? Math.round(values.reduce((a, b) => a + b, 0) * 1000) / 1000 : null;
        const phases = group.members.map(m => `L${m.phase}`).join("+");

        result.push({
            id,
            common: {
                name: `${baseName} total (${phases})`,
                type: "number",
                role: QUANTITY_UNITS[group.quantity].role,
                unit: group.unit,
                read: true,
                write: false,
            },
            native: {
                phaseSum: true,
                sources: group.members.map(m => m.record.code),
            },
            value: sum,
        });
    }

    return result;
}
