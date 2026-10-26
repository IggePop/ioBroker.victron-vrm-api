import { expect } from "chai";
import type { VrmDiagnosticRecord } from "../types";
import { detectPhase, detectQuantity, mapPhaseSums, stripPhase } from "./phase-sums";

function record(
    Device: string,
    instance: number,
    code: string,
    description: string,
    formatWithUnit: string,
    dbusPath: string | undefined,
    rawValue: number | string | null,
): VrmDiagnosticRecord {
    return {
        idSite: 1,
        timestamp: 1_700_000_000,
        Device,
        instance,
        idDataAttribute: 1,
        description,
        formatWithUnit,
        code,
        dbusPath,
        rawValue,
    };
}

// names as reported by a real installation
const grid = (n: number, desc: string, fmt: string, path: string, v: number): VrmDiagnosticRecord =>
    record("Grid meter", 40, `g${n}${desc}`, `Grid L${n} - ${desc}`, fmt, `/Ac/L${n}/${path}`, v);

describe("phase sums mapper", () => {
    describe("detectPhase()", () => {
        it("reads the phase from the name or the D-Bus path", () => {
            expect(detectPhase(record("x", 0, "a", "Grid L2", "%.0F W", undefined, 1))).to.equal(2);
            expect(detectPhase(record("x", 0, "a", "Input power 3", "%.0F W", "/Ac/ActiveIn/L3/P", 1))).to.equal(3);
            expect(detectPhase(record("x", 0, "a", "Output frequency", "%.1F Hz", "/Ac/Out/F", 1))).to.be.undefined;
        });
    });

    describe("detectQuantity()", () => {
        it("uses the name and falls back to the unit", () => {
            expect(detectQuantity(record("x", 0, "a", "L1 Energy", "%.2F kWh", undefined, 1))).to.equal("energy");
            expect(detectQuantity(record("x", 0, "a", "Grid L1", "%.0F W", undefined, 1))).to.equal("power");
            expect(detectQuantity(record("x", 0, "a", "Grid meter current L1", "%.1F A", undefined, 1))).to.equal(
                "current",
            );
            expect(detectQuantity(record("x", 0, "a", "L1 Voltage", "%.1F V", undefined, 1))).to.be.undefined;
            expect(detectQuantity(record("x", 0, "a", "Temperature L1", "%s", undefined, 1))).to.be.undefined;
        });
    });

    describe("stripPhase()", () => {
        it("removes the phase marker", () => {
            expect(stripPhase("Grid L1 - Power")).to.equal("Grid - Power");
            expect(stripPhase("L1 Energy")).to.equal("Energy");
            expect(stripPhase("AC Consumption L1")).to.equal("AC Consumption");
            expect(stripPhase("Input power 1")).to.equal("Input power");
            expect(stripPhase("Output current phase 1")).to.equal("Output current");
        });
    });

    describe("mapPhaseSums()", () => {
        it("sums power, current and energy per device", () => {
            const sums = mapPhaseSums([
                grid(1, "Power", "%.0F W", "Power", 100),
                grid(2, "Power", "%.0F W", "Power", 200),
                grid(3, "Power", "%.0F W", "Power", -50.5),
                grid(1, "Energy from net", "%.2F kWh", "Energy/Forward", 1.1),
                grid(2, "Energy from net", "%.2F kWh", "Energy/Forward", 2.2),
                grid(3, "Energy from net", "%.2F kWh", "Energy/Forward", 3.3),
                record("Grid meter", 40, "g1v", "Grid meter voltage L1", "%.1F V", "/Ac/L1/Voltage", 230),
                record("Grid meter", 40, "g2v", "Grid meter voltage L2", "%.1F V", "/Ac/L2/Voltage", 231),
            ]);

            expect(sums.map(s => [s.id, s.value])).to.deep.equal([
                ["diagnostics.grid_meter_40.sum.Grid_Power", 249.5],
                ["diagnostics.grid_meter_40.sum.Grid_Energy_from_net", 6.6],
            ]);
            expect(sums[0].common).to.include({
                name: "Grid - Power total (L1+L2+L3)",
                unit: "W",
                role: "value.power",
                write: false,
            });
            expect(sums[1].common).to.include({ unit: "kWh", role: "value.energy" });
        });

        it("groups VE.Bus values without phase in the name via the D-Bus path", () => {
            const sums = mapPhaseSums([
                record("VE.Bus System", 276, "IP1", "Input power 1", "%.0F W", "/Ac/ActiveIn/L1/P", 10),
                record("VE.Bus System", 276, "IP2", "Input power 2", "%.0F W", "/Ac/ActiveIn/L2/P", 20),
                record("VE.Bus System", 276, "IP3", "Input power 3", "%.0F W", "/Ac/ActiveIn/L3/P", 30),
                record("VE.Bus System", 276, "OI1", "Output current phase 1", "%.1F A", "/Ac/Out/L1/I", 1.5),
                record("VE.Bus System", 276, "OI2", "Output current phase 2", "%.1F A", "/Ac/Out/L2/I", 2.5),
            ]);
            expect(sums.map(s => [s.id, s.value, s.common.name])).to.deep.equal([
                ["diagnostics.ve_bus_system_276.sum.Input_power", 60, "Input power total (L1+L2+L3)"],
                ["diagnostics.ve_bus_system_276.sum.Output_current", 4, "Output current total (L1+L2)"],
            ]);
        });

        it("keeps devices apart and ignores single phases", () => {
            const sums = mapPhaseSums([
                record("PV Inverter", 20, "pP1", "L1 Power", "%.0F W", "/Ac/L1/Power", 100),
                record("PV Inverter", 20, "pP2", "L2 Power", "%.0F W", "/Ac/L2/Power", 100),
                record("PV Inverter", 21, "pP1", "L1 Power", "%.0F W", "/Ac/L1/Power", 7),
                record("PV Inverter", 21, "pP2", "L2 Power", "%.0F W", "/Ac/L2/Power", null),
                record("Solar Charger", 0, "x1", "PV power L1", "%.0F W", undefined, 5),
            ]);
            expect(sums.map(s => [s.id, s.value])).to.deep.equal([
                ["diagnostics.pv_inverter_20.sum.Power", 200],
                ["diagnostics.pv_inverter_21.sum.Power", 7],
            ]);
        });
    });
});
