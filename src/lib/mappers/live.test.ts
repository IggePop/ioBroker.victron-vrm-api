import { expect } from "chai";
import type { VrmDiagnosticRecord } from "../types";
import { mapLive } from "./live";

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

    it("omits values that are not reported or null", () => {
        const values = valuesOf([record("system", "/Dc/Battery/Soc", null)]);
        expect(values).to.deep.equal({});
    });
});
