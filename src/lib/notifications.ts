import type { AlarmEntry } from "./mappers/alarms";

/**
 * Identity of an alarm: the same alarm keeps device, instance, text and start time across polls
 *
 * @param entry - Alarm entry
 */
function alarmKey(entry: Pick<AlarmEntry, "device" | "instance" | "text" | "started">): string {
    return `${entry.device}|${entry.instance}|${entry.text}|${entry.started}`;
}

/**
 * Active alarms that were not active at the previous poll.
 * The previous list is the stored value of `alarms.activeList`, so a restart of the adapter does not
 * notify again. Without a previous value (first poll ever) all active alarms are new.
 *
 * @param previousJson - Previous value of `alarms.activeList`
 * @param active - Alarms active now
 */
export function newAlarms(previousJson: ioBroker.StateValue | undefined, active: AlarmEntry[]): AlarmEntry[] {
    let previous: AlarmEntry[] = [];
    if (typeof previousJson === "string" && previousJson) {
        try {
            const parsed: unknown = JSON.parse(previousJson);
            previous = Array.isArray(parsed) ? (parsed as AlarmEntry[]) : [];
        } catch {
            previous = [];
        }
    }
    const known = new Set(previous.map(alarmKey));
    return active.filter(entry => !known.has(alarmKey(entry)));
}

/**
 * True when an installation has just become stale (was not stale at the previous poll)
 *
 * @param previous - Previous value of `info.dataStale`
 * @param stale - Stale now
 */
export function becameStale(previous: ioBroker.StateValue | undefined, stale: boolean): boolean {
    return stale && previous !== true;
}
