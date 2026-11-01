import type { VrmAlarmLogRecord } from "../types";
import type { ChannelDef, StateDef } from "./diagnostics";

/** Number of log entries requested from VRM and shown in alarms.history */
export const ALARM_LOG_COUNT = 25;

/** Simplified alarm entry for the JSON states */
export interface AlarmEntry {
    device: string;
    instance: number;
    text: string;
    level: string | null;
    active: boolean;
    /** Start in milliseconds */
    started: number;
    /** End in milliseconds, null while active */
    cleared: number | null;
}

function toEntry(record: VrmAlarmLogRecord): AlarmEntry {
    const device = record.customName?.trim() || record.device || "Unknown device";
    const description = record.description ?? "";
    const level = record.nameEnum?.trim() || null;
    // "VE.Bus Error" + "VE.Bus Error 10: ..." -> only the detailed text
    const text = level?.startsWith(description) ? level : level ? `${description} (${level})` : description;
    const cleared = record.cleared ? record.cleared * 1000 : null;
    return {
        device,
        instance: record.instance,
        text,
        level,
        active: record.isActive === 1 || cleared === null,
        started: record.started * 1000,
        cleared,
    };
}

function describe(entry: AlarmEntry): string {
    return `${entry.device}: ${entry.text}`;
}

/**
 * Converts the alarm log into the number and list of active alarms, the newest alarm and a history.
 *
 * @param records - Entries of the alarm log, in any order
 */
export function mapAlarms(records: VrmAlarmLogRecord[]): { channels: ChannelDef[]; states: StateDef[] } {
    const entries = records.map(toEntry).sort((a, b) => b.started - a.started);
    const active = entries.filter(entry => entry.active);
    const last = entries[0];

    const state = (
        id: string,
        value: ioBroker.StateValue,
        common: Pick<ioBroker.StateCommon, "name" | "type" | "role">,
    ): StateDef => ({ id: `alarms.${id}`, common: { ...common, read: true, write: false }, value });

    return {
        channels: [{ id: "alarms", name: "Alarms" }],
        states: [
            state("count", active.length, { name: "Number of active alarms", type: "number", role: "value" }),
            state("active", active.length > 0, {
                name: "At least one alarm is active",
                type: "boolean",
                role: "indicator.alarm",
            }),
            state("activeText", active.map(describe).join(", "), {
                name: "Active alarms as text",
                type: "string",
                role: "text",
            }),
            state("activeList", JSON.stringify(active), {
                name: "Active alarms (JSON)",
                type: "string",
                role: "json",
            }),
            state("lastText", last ? describe(last) : "", {
                name: "Newest alarm",
                type: "string",
                role: "text",
            }),
            state("lastStarted", last?.started ?? null, {
                name: "Start of the newest alarm",
                type: "number",
                role: "date",
            }),
            state("lastCleared", last?.cleared ?? null, {
                name: "End of the newest alarm (empty while active)",
                type: "number",
                role: "date",
            }),
            state("history", JSON.stringify(entries.slice(0, ALARM_LOG_COUNT)), {
                name: `Last ${ALARM_LOG_COUNT} alarms (JSON)`,
                type: "string",
                role: "json",
            }),
        ],
    };
}
