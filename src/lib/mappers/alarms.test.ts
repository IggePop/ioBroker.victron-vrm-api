import { expect } from "chai";
import type { VrmAlarmLogRecord } from "../types";
import { mapAlarms } from "./alarms";

function record(overrides: Partial<VrmAlarmLogRecord>): VrmAlarmLogRecord {
    return {
        idAlarm: 1,
        idSite: 1,
        instance: 276,
        type: "alarm monitor",
        description: "Low battery",
        started: 1_000,
        cleared: 1_100,
        idDataAttribute: 43,
        isActive: 0,
        device: "VE.Bus System",
        customName: "",
        nameEnum: "Warning",
        ...overrides,
    };
}

describe("alarms mapper", () => {
    const value = (states: { id: string; value: ioBroker.StateValue }[], id: string): ioBroker.StateValue | undefined =>
        states.find(s => s.id === id)?.value;

    it("counts and lists the active alarms", () => {
        const { states } = mapAlarms([
            record({ idAlarm: 3, started: 3_000, cleared: null, isActive: 1, description: "Overload L1" }),
            record({ idAlarm: 2, started: 2_000, cleared: null, isActive: 1, customName: "Batterie", device: "BMV" }),
            record({ idAlarm: 1 }),
        ]);
        expect(value(states, "alarms.count")).to.equal(2);
        expect(value(states, "alarms.active")).to.equal(true);
        expect(value(states, "alarms.activeText")).to.equal(
            "VE.Bus System: Overload L1 (Warning), Batterie: Low battery (Warning)",
        );
        const list = JSON.parse(value(states, "alarms.activeList") as string) as { started: number }[];
        expect(list.map(entry => entry.started)).to.deep.equal([3_000_000, 2_000_000]);
    });

    it("reports the newest alarm, also when it is already cleared", () => {
        const { states } = mapAlarms([
            record({ started: 1_000, cleared: null, isActive: 1 }),
            record({ started: 5_000, cleared: 5_030, nameEnum: "Alarm", description: "BMS lost" }),
        ]);
        expect(value(states, "alarms.lastText")).to.equal("VE.Bus System: BMS lost (Alarm)");
        expect(value(states, "alarms.lastStarted")).to.equal(5_000_000);
        expect(value(states, "alarms.lastCleared")).to.equal(5_030_000);
    });

    it("does not repeat the description if the level already contains it", () => {
        const { states } = mapAlarms([
            record({ description: "VE.Bus Error", nameEnum: "VE.Bus Error 10: System time synchronisation problem" }),
        ]);
        expect(value(states, "alarms.lastText")).to.equal(
            "VE.Bus System: VE.Bus Error 10: System time synchronisation problem",
        );
    });

    it("returns empty values for an empty log", () => {
        const { states } = mapAlarms([]);
        expect(value(states, "alarms.count")).to.equal(0);
        expect(value(states, "alarms.active")).to.equal(false);
        expect(value(states, "alarms.activeText")).to.equal("");
        expect(value(states, "alarms.lastText")).to.equal("");
        expect(value(states, "alarms.lastStarted")).to.equal(null);
        expect(value(states, "alarms.history")).to.equal("[]");
    });
});
