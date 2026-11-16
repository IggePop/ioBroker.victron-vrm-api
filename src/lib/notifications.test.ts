import { expect } from "chai";
import type { AlarmEntry } from "./mappers/alarms";
import { becameStale, newAlarms } from "./notifications";

function alarm(text: string, started: number): AlarmEntry {
    return { device: "VE.Bus System", instance: 276, text, level: "Warning", active: true, started, cleared: null };
}

describe("newAlarms()", () => {
    const overload = alarm("Overload L1 (Warning)", 1_000);
    const lowBattery = alarm("Low battery (Warning)", 2_000);

    it("returns only alarms that were not active before", () => {
        expect(newAlarms(JSON.stringify([overload]), [lowBattery, overload])).to.deep.equal([lowBattery]);
    });

    it("returns nothing when the same alarms are still active", () => {
        expect(newAlarms(JSON.stringify([overload]), [overload])).to.deep.equal([]);
    });

    it("treats the same alarm with a new start time as new", () => {
        const again = alarm("Overload L1 (Warning)", 5_000);
        expect(newAlarms(JSON.stringify([overload]), [again])).to.deep.equal([again]);
    });

    it("treats all alarms as new without a valid previous list", () => {
        expect(newAlarms(undefined, [overload])).to.deep.equal([overload]);
        expect(newAlarms(null, [overload])).to.deep.equal([overload]);
        expect(newAlarms("not json", [overload])).to.deep.equal([overload]);
        expect(newAlarms("{}", [overload])).to.deep.equal([overload]);
    });
});

describe("becameStale()", () => {
    it("is true only on the change to stale", () => {
        expect(becameStale(false, true)).to.equal(true);
        expect(becameStale(undefined, true)).to.equal(true);
        expect(becameStale(true, true)).to.equal(false);
        expect(becameStale(false, false)).to.equal(false);
        expect(becameStale(true, false)).to.equal(false);
    });
});
