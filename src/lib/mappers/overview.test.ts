import { expect } from "chai";
import type { VrmOverviewDevice } from "../types";
import { channelLabel, deviceLabel, mapOverview } from "./overview";

// shaped like a real system-overview response (identifiers removed)
const devices: VrmOverviewDevice[] = [
    {
        name: "Gateway",
        customName: null,
        productCode: "C00A",
        productName: "Cerbo GX",
        firmwareVersion: "v3.79",
        lastConnection: 1793135246,
        loggingInterval: 60,
        lastPowerUpOrRestart: 1792157568,
    },
    {
        name: "Solar Charger",
        customName: "MPPT roof",
        productCode: "a111",
        productName: "SmartSolar MPPT RS 450/200",
        firmwareVersion: "v1.16",
        lastConnection: "1793135246",
        instance: 0,
    },
    {
        name: "PV Inverter",
        customName: "",
        productCode: "a142",
        productName: "Fronius PV Inverter",
        firmwareVersion: "0.3.30.2",
        lastConnection: false,
        froniusDeviceType: "Fronius Symo 5.0-3-M",
        instance: 20,
    },
    {
        name: "Grid meter",
        customName: "",
        productCode: "b017",
        productName: "CG EM24 Ethernet Energy Meter",
        firmwareVersion: "1.7.3",
        lastConnection: 1793135246,
        instance: 40,
    },
];

describe("overview mapper", () => {
    describe("deviceLabel()", () => {
        it("prefers custom name, then Fronius model, then product name", () => {
            expect(devices.map(deviceLabel)).to.deep.equal([
                "Cerbo GX",
                "MPPT roof",
                "Fronius Symo 5.0-3-M",
                "CG EM24 Ethernet Energy Meter",
            ]);
        });

        it("falls back to the device type", () => {
            expect(deviceLabel({ name: "Inverter", customName: " ", productName: "" })).to.equal("Inverter");
        });
    });

    it("builds channel labels with type and instance", () => {
        expect(channelLabel(devices[2])).to.equal("Fronius Symo 5.0-3-M (PV Inverter 20)");
        expect(channelLabel(devices[0])).to.equal("Cerbo GX (Gateway 0)");
    });

    describe("mapOverview()", () => {
        const result = mapOverview(devices);
        const value = (id: string): ioBroker.StateValue | undefined => result.states.find(s => s.id === id)?.value;

        it("creates one channel per device with stable ids", () => {
            expect(result.channels.map(c => c.id)).to.deep.equal([
                "devices.gateway_0",
                "devices.solar_charger_0",
                "devices.pv_inverter_20",
                "devices.grid_meter_40",
            ]);
        });

        it("provides labels for the matching diagnostics channels", () => {
            expect(result.labels.get("diagnostics.pv_inverter_20")).to.equal("Fronius Symo 5.0-3-M (PV Inverter 20)");
            expect(result.labels.get("diagnostics.gateway_0")).to.equal("Cerbo GX (Gateway 0)");
        });

        it("maps product, firmware and timestamps", () => {
            expect(value("devices.gateway_0.productName")).to.equal("Cerbo GX");
            expect(value("devices.gateway_0.firmwareVersion")).to.equal("v3.79");
            expect(value("devices.gateway_0.lastConnection")).to.equal(1793135246000);
            expect(value("devices.gateway_0.loggingInterval")).to.equal(60);
            expect(value("devices.gateway_0.lastPowerUpOrRestart")).to.equal(1792157568000);
            expect(value("devices.solar_charger_0.lastConnection")).to.equal(1793135246000);
            expect(value("devices.pv_inverter_20.lastConnection")).to.be.null;
            expect(value("devices.pv_inverter_20.customName")).to.be.null;
            expect(value("devices.pv_inverter_20.model")).to.equal("Fronius Symo 5.0-3-M");
        });

        it("only creates gateway and Fronius specific states where they exist", () => {
            const ids = result.states.map(s => s.id);
            expect(ids).not.to.include("devices.grid_meter_40.loggingInterval");
            expect(ids).not.to.include("devices.grid_meter_40.model");
        });

        it("creates read-only states with roles", () => {
            const fw = result.states.find(s => s.id === "devices.grid_meter_40.firmwareVersion")!;
            expect(fw.common).to.include({ type: "string", role: "info.firmware", write: false });
        });
    });
});
