import type { VrmDiagnosticRecord } from "../types";

export interface ChannelDef {
    /** Relative id below the installation, e.g. "diagnostics.battery_monitor_279" */
    id: string;
    name: string;
}

export interface StateDef {
    /** Relative id below the installation */
    id: string;
    common: Partial<ioBroker.StateCommon> & Pick<ioBroker.StateCommon, "name" | "type" | "role">;
    native?: Record<string, unknown>;
    value: ioBroker.StateValue;
}

export interface MappedDiagnostics {
    channels: ChannelDef[];
    states: StateDef[];
    /** Newest record timestamp in milliseconds */
    lastTimestamp?: number;
}

/**
 * Replaces everything that is not safe in an object id segment
 *
 * @param value
 */
export function sanitizeId(value: string): string {
    return (
        String(value)
            .trim()
            .replace(/[^a-zA-Z0-9_-]+/g, "_")
            .replace(/^_+|_+$/g, "") || "unknown"
    );
}

/**
 * Extracts the unit from a VRM printf-like format, e.g. "%.2F V" → "V", "%.0F %%" → "%".
 *
 * @param formatWithUnit
 */
export function parseUnit(formatWithUnit: string | undefined): string | undefined {
    if (!formatWithUnit) {
        return undefined;
    }
    const unit = formatWithUnit
        .replace(/%[-+ 0#]*\d*(?:\.\d+)?[a-zA-Z]/g, "")
        .replace(/%%/g, "%")
        .trim();
    return unit || undefined;
}

const UNIT_ROLES: Record<string, string> = {
    V: "value.voltage",
    A: "value.current",
    W: "value.power",
    kW: "value.power",
    VA: "value.power",
    kWh: "value.energy",
    Wh: "value.energy",
    Hz: "value.frequency",
    "°C": "value.temperature",
    "°F": "value.temperature",
    C: "value.temperature",
};

/**
 * Picks an ioBroker role from unit and description
 *
 * @param unit
 * @param description
 * @param type
 */
export function guessRole(unit: string | undefined, description: string, type: ioBroker.CommonType): string {
    if (type !== "number") {
        return "text";
    }
    if (unit === "%" && /soc|state of charge|ladezustand/i.test(description)) {
        return "value.battery";
    }
    return (unit && UNIT_ROLES[unit]) || "value";
}

function stateType(record: VrmDiagnosticRecord): ioBroker.CommonType {
    if (typeof record.rawValue === "number") {
        return "number";
    }
    if (record.dataAttributeEnumValues?.length) {
        return "number";
    }
    if (typeof record.rawValue === "string") {
        return record.rawValue.trim() !== "" &&
            !isNaN(Number(record.rawValue)) &&
            !/%s/.test(record.formatWithUnit ?? "")
            ? "number"
            : "string";
    }
    // null: decide by format
    return /%s/.test(record.formatWithUnit ?? "") ? "string" : "number";
}

function convertValue(raw: VrmDiagnosticRecord["rawValue"], type: ioBroker.CommonType): ioBroker.StateValue {
    if (raw === null || raw === undefined) {
        return null;
    }
    if (type === "number") {
        const num = typeof raw === "number" ? raw : Number(raw);
        return isNaN(num) ? null : num;
    }
    return String(raw);
}

/**
 * Channel id for a device of the diagnostics response
 *
 * @param record
 */
export function channelId(record: Pick<VrmDiagnosticRecord, "Device" | "instance">): string {
    return `diagnostics.${deviceKey(record.Device, record.instance)}`;
}

/**
 * Stable id part of a device, e.g. "pv_inverter_20"
 *
 * @param device - Device type as reported by VRM
 * @param instance - Device instance, the gateway has none
 */
export function deviceKey(device: string, instance: number | undefined): string {
    return `${sanitizeId(device).toLowerCase()}_${instance ?? 0}`;
}

/**
 * Converts the flat VRM diagnostics list into channels (one per device/instance)
 * and states (one per data attribute, id = attribute code).
 *
 * @param records
 */
export function mapDiagnostics(records: VrmDiagnosticRecord[]): MappedDiagnostics {
    const channels = new Map<string, ChannelDef>();
    const states: StateDef[] = [];
    const usedIds = new Set<string>();
    let lastTimestamp: number | undefined;

    for (const record of records) {
        if (!record || record.code === undefined || record.Device === undefined) {
            continue;
        }

        const chId = channelId(record);
        if (!channels.has(chId)) {
            channels.set(chId, { id: chId, name: `${record.Device} (${record.instance})` });
        }

        let id = `${chId}.${sanitizeId(record.code)}`;
        if (usedIds.has(id)) {
            id = `${id}_${record.idDataAttribute}`;
        }
        usedIds.add(id);

        const type = stateType(record);
        const unit = parseUnit(record.formatWithUnit);
        const common: StateDef["common"] = {
            name: record.description || record.code,
            type,
            role: guessRole(unit, record.description ?? "", type),
            read: true,
            write: false,
        };
        if (unit && type === "number") {
            common.unit = unit;
        }
        if (record.dataAttributeEnumValues?.length) {
            common.states = Object.fromEntries(record.dataAttributeEnumValues.map(e => [e.valueEnum, e.nameEnum]));
        }

        states.push({
            id,
            common,
            native: {
                idDataAttribute: record.idDataAttribute,
                code: record.code,
                dbusServiceType: record.dbusServiceType,
                dbusPath: record.dbusPath,
                formatWithUnit: record.formatWithUnit,
            },
            value: convertValue(record.rawValue, type),
        });

        if (typeof record.timestamp === "number") {
            const ts = record.timestamp * 1000;
            lastTimestamp = lastTimestamp === undefined ? ts : Math.max(lastTimestamp, ts);
        }
    }

    return { channels: [...channels.values()], states, lastTimestamp };
}
