import { expect } from "chai";
import type { VrmDiagnosticRecord } from "../types";
import { guessRole, mapDiagnostics, parseUnit, sanitizeId } from "./diagnostics";

function record(overrides: Partial<VrmDiagnosticRecord>): VrmDiagnosticRecord {
    return {
        idSite: 1,
        timestamp: 1_700_000_000,
        Device: "Battery Monitor",
        instance: 279,
        idDataAttribute: 47,
        description: "Voltage",
        formatWithUnit: "%.2F V",
        code: "V",
        rawValue: 53.2,
        ...overrides,
    };
}

describe("diagnostics mapper", () => {
    describe("parseUnit()", () => {
        it("extracts units from printf formats", () => {
            expect(parseUnit("%.2F V")).to.equal("V");
            expect(parseUnit("%.0F %%")).to.equal("%");
            expect(parseUnit("%.1F°C")).to.equal("°C");
            expect(parseUnit("%d kWh")).to.equal("kWh");
        });

        it("returns undefined without unit", () => {
            expect(parseUnit("%s")).to.be.undefined;
            expect(parseUnit("")).to.be.undefined;
            expect(parseUnit(undefined)).to.be.undefined;
        });
    });

    describe("sanitizeId()", () => {
        it("replaces unsafe characters", () => {
            expect(sanitizeId("VE.Bus System")).to.equal("VE_Bus_System");
            expect(sanitizeId("  ")).to.equal("unknown");
        });
    });

    describe("guessRole()", () => {
        it("maps units and SoC", () => {
            expect(guessRole("W", "PV power", "number")).to.equal("value.power");
            expect(guessRole("%", "State of charge", "number")).to.equal("value.battery");
            expect(guessRole("%", "Relative humidity", "number")).to.equal("value");
            expect(guessRole(undefined, "Firmware", "string")).to.equal("text");
        });
    });

    describe("mapDiagnostics()", () => {
        it("creates one channel per device/instance and one state per attribute", () => {
            const result = mapDiagnostics([
                record({}),
                record({ code: "SOC", description: "State of charge", formatWithUnit: "%.1F %%", rawValue: 87.5 }),
                record({
                    Device: "Solar Charger",
                    instance: 0,
                    code: "ScW",
                    description: "PV power",
                    formatWithUnit: "%.0F W",
                    rawValue: "1200",
                }),
            ]);

            expect(result.channels.map(c => c.id)).to.deep.equal([
                "diagnostics.battery_monitor_279",
                "diagnostics.solar_charger_0",
            ]);
            const soc = result.states.find(s => s.id === "diagnostics.battery_monitor_279.SOC")!;
            expect(soc.common).to.include({ type: "number", unit: "%", role: "value.battery", write: false });
            expect(soc.value).to.equal(87.5);

            const pv = result.states.find(s => s.id === "diagnostics.solar_charger_0.ScW")!;
            expect(pv.value).to.equal(1200);
            expect(pv.common.role).to.equal("value.power");
        });

        it("maps enums to common.states and strings to text", () => {
            const result = mapDiagnostics([
                record({
                    code: "S",
                    description: "State",
                    formatWithUnit: "%s",
                    rawValue: 3,
                    dataAttributeEnumValues: [
                        { nameEnum: "Bulk", valueEnum: 3 },
                        { nameEnum: "Float", valueEnum: 5 },
                    ],
                }),
                record({ code: "fw", description: "Firmware", formatWithUnit: "%s", rawValue: "v3.10" }),
            ]);
            expect(result.states[0].common.states).to.deep.equal({ 3: "Bulk", 5: "Float" });
            expect(result.states[0].common.type).to.equal("number");
            expect(result.states[1].common).to.include({ type: "string", role: "text" });
            expect(result.states[1].value).to.equal("v3.10");
        });

        it("makes duplicate codes unique and reports the newest timestamp", () => {
            const result = mapDiagnostics([
                record({ timestamp: 100 }),
                record({ idDataAttribute: 99, timestamp: 200 }),
            ]);
            expect(result.states.map(s => s.id)).to.deep.equal([
                "diagnostics.battery_monitor_279.V",
                "diagnostics.battery_monitor_279.V_99",
            ]);
            expect(result.lastTimestamp).to.equal(200_000);
        });
    });
});
