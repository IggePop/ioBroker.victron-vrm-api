import { expect } from "chai";
import { QUALITY_STALE, StateManager } from "./state-manager";

function fakeAdapter(): { adapter: ioBroker.Adapter; written: Array<{ id: string; state: ioBroker.SettableState }> } {
    const written: Array<{ id: string; state: ioBroker.SettableState }> = [];
    const adapter = {
        extendObjectAsync: () => Promise.resolve({ id: "" }),
        setStateChangedAsync: (id: string, state: ioBroker.SettableState) => {
            written.push({ id, state });
            return Promise.resolve({ id, notChanged: false });
        },
    } as unknown as ioBroker.Adapter;
    return { adapter, written };
}

const def = {
    id: "live.soc",
    common: { name: "SOC", type: "number" as const, role: "value.battery" },
    value: 80,
    ts: 1793530800000,
};

describe("StateManager.setState()", () => {
    it("writes the quality when given", async () => {
        const { adapter, written } = fakeAdapter();
        await new StateManager(adapter).setState("123", def, QUALITY_STALE);
        expect(written).to.deep.equal([
            { id: "123.live.soc", state: { val: 80, ack: true, ts: 1793530800000, q: 0x42 } },
        ]);
    });

    it("leaves the quality out when not given", async () => {
        const { adapter, written } = fakeAdapter();
        await new StateManager(adapter).setState("123", def);
        expect(written[0].state).to.not.have.property("q");
    });
});
