import { expect } from "chai";
import type { VrmDiagnosticRecord } from "../types";
import { mapLive, mapTanks } from "./live";

function record(service: string, path: string, rawValue: number | string | null, instance = 0): VrmDiagnosticRecord {
    return {
        idSite: 1,
        timestamp: 1_700_000_000,
        Device: service,
        instance,
        idDataAttribute: 1,
        description: path,
        code: path,
        dbusServiceType: service,
        dbusPath: path,
        rawValue,
    };
}

function valuesOf(records: VrmDiagnosticRecord[]): Record<string, ioBroker.StateValue> {
    return Object.fromEntries(mapLive(records).map(s => [s.id, s.value]));
}

describe("live mapper", () => {
    it("prefers the system service and sums phases", () => {
        const values = valuesOf([
            record("system", "/Dc/Battery/Soc", 80),
            record("battery", "/Soc", 79),
            record("system", "/Ac/Grid/L1/Power", 100),
            record("system", "/Ac/Grid/L2/Power", "50"),
            record("system", "/Ac/Grid/L3/Power", -20),
            record("system", "/Ac/Consumption/L1/Power", 300),
        ]);
        expect(values).to.include({ "live.soc": 80, "live.gridPower": 130, "live.consumption": 300 });
    });

    it("falls back to device services", () => {
        const values = valuesOf([
            record("battery", "/Soc", 79),
            record("solarcharger", "/Yield/Power", 400, 0),
            record("solarcharger", "/Yield/Power", 250, 1),
        ]);
        expect(values).to.include({ "live.soc": 79, "live.pvDcPower": 650, "live.pvPower": 650 });
    });

    it("adds AC- and DC-coupled PV to the total", () => {
        const values = valuesOf([
            record("system", "/Dc/Pv/Power", 1000),
            record("system", "/Ac/PvOnGrid/L1/Power", 500),
        ]);
        expect(values).to.include({ "live.pvDcPower": 1000, "live.pvAcPower": 500, "live.pvPower": 1500 });
    });

    it("uses the newest timestamp of the summed values", () => {
        const l1 = { ...record("system", "/Ac/Grid/L1/Power", 100), timestamp: 1_700_000_100 };
        const l2 = { ...record("system", "/Ac/Grid/L2/Power", 50), timestamp: 1_700_000_000 };
        const dc = { ...record("system", "/Dc/Pv/Power", 10), timestamp: 1_700_000_200 };
        const ac = { ...record("system", "/Ac/PvOnGrid/L1/Power", 5), timestamp: 1_700_000_050 };
        const states = mapLive([l1, l2, dc, ac]);
        const ts = (id: string): number | undefined => states.find(s => s.id === id)?.ts;
        expect(ts("live.gridPower")).to.equal(1_700_000_100_000);
        expect(ts("live.pvPower")).to.equal(1_700_000_200_000);
    });

    it("omits values that are not reported or null", () => {
        const values = valuesOf([record("system", "/Dc/Battery/Soc", null)]);
        expect(values).to.deep.equal({});
    });

    describe("batteryTimeToGo", () => {
        const ttg = (r: VrmDiagnosticRecord): ioBroker.StateValue | undefined => valuesOf([r])["live.batteryTimeToGo"];

        it("converts seconds (D-Bus) to hours", () => {
            expect(ttg(record("system", "/Dc/Battery/TimeToGo", 9000))).to.equal(2.5);
        });

        it("keeps hours when VRM reports hours", () => {
            expect(ttg({ ...record("battery", "/TimeToGo", 12.345), formatWithUnit: "%.2F h" })).to.equal(12.35);
        });

        it("is null while charging (no value)", () => {
            expect(ttg(record("system", "/Dc/Battery/TimeToGo", ""))).to.equal(null);
            expect(ttg(record("system", "/Dc/Battery/TimeToGo", null))).to.equal(null);
        });

        it("is not created without a battery monitor", () => {
            expect(valuesOf([record("system", "/Dc/Battery/Soc", 80)])).to.not.have.property("live.batteryTimeToGo");
        });
    });

    it("reads AC output, generator and EV charger power", () => {
        const values = valuesOf([
            record("system", "/Ac/ConsumptionOnOutput/L1/Power", 120),
            record("system", "/Ac/ConsumptionOnOutput/L2/Power", 80),
            record("system", "/Ac/Genset/L1/Power", 1500),
            record("evcharger", "/Ac/Power", 3700, 40),
            record("evcharger", "/Ac/Power", 1400, 41),
        ]);
        expect(values).to.include({ "live.acOutPower": 200, "live.gensetPower": 1500, "live.evChargerPower": 5100 });
    });

    it("falls back to the VE.Bus AC output", () => {
        const values = valuesOf([record("vebus", "/Ac/Out/L1/P", 300, 276), record("vebus", "/Ac/Out/L2/P", 50, 276)]);
        expect(values).to.include({ "live.acOutPower": 350 });
    });

    it("takes the battery temperature of one battery, not the sum", () => {
        const values = valuesOf([
            record("battery", "/Dc/0/Temperature", 21.5, 279),
            record("battery", "/Dc/0/Temperature", 23, 280),
        ]);
        expect(values).to.include({ "live.batteryTemperature": 21.5 });
        expect(valuesOf([record("system", "/Dc/Battery/Temperature", 19)])).to.include({
            "live.batteryTemperature": 19,
        });
    });
});

describe("tank mapper", () => {
    it("creates one folder per tank with level, remaining and fluid type", () => {
        const result = mapTanks([
            record("tank", "/Level", 64, 21),
            { ...record("tank", "/Remaining", 0.128, 21), formatWithUnit: "%.3F m3" },
            record("tank", "/FluidType", 1, 21),
            record("tank", "/Level", 30, 20),
            record("tank", "/FluidType", 7, 20),
        ]);
        expect(result.channels).to.deep.equal([
            { id: "live.tanks", name: "Tanks" },
            { id: "live.tanks.tank_20", name: "Tank 20 (Diesel)" },
            { id: "live.tanks.tank_21", name: "Tank 21 (Fresh water)" },
        ]);
        expect(result.states.map(s => [s.id, s.value, s.common.unit])).to.deep.equal([
            ["live.tanks.tank_20.level", 30, "%"],
            ["live.tanks.tank_20.fluidType", 7, undefined],
            ["live.tanks.tank_21.level", 64, "%"],
            ["live.tanks.tank_21.remaining", 0.128, "m3"],
            ["live.tanks.tank_21.fluidType", 1, undefined],
        ]);
    });

    it("prefers the fluid names sent by VRM", () => {
        const fluid = {
            ...record("tank", "/FluidType", 1, 21),
            dataAttributeEnumValues: [{ nameEnum: "Frischwasser", valueEnum: 1 }],
        };
        const result = mapTanks([record("tank", "/Level", 64, 21), fluid]);
        expect(result.channels[1].name).to.equal("Tank 21 (Frischwasser)");
        expect(result.states[1].common.states).to.deep.equal({ 1: "Frischwasser" });
    });

    it("returns nothing without tank sensors", () => {
        expect(mapTanks([record("system", "/Dc/Battery/Soc", 80)])).to.deep.equal({ channels: [], states: [] });
    });
});
