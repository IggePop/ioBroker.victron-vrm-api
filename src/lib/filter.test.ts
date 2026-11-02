import { expect } from "chai";
import { createFilter } from "./filter";

describe("filter", () => {
    it("excludes nothing without patterns", () => {
        const filter = createFilter("\n  \n# only a comment\n");
        expect(filter.empty).to.be.true;
        expect(filter.excludesDevice("gateway_0")).to.be.false;
        expect(filter.excludesValue("gateway_0", "bv", "Battery voltage")).to.be.false;
        expect(createFilter(undefined).empty).to.be.true;
    });

    it("excludes whole devices by key or display name", () => {
        const filter = createFilter("gateway_0\npv_inverter_*\nMultiPlus*");
        expect(filter.excludesDevice("gateway_0")).to.be.true;
        expect(filter.excludesDevice("pv_inverter_21")).to.be.true;
        expect(filter.excludesDevice("ve_bus_system_276", "MultiPlus-II 48/5000")).to.be.true;
        expect(filter.excludesDevice("battery_monitor_512", "SmartShunt")).to.be.false;
        // all values of an excluded device are excluded as well
        expect(filter.excludesValue("gateway_0", "bv", "Battery voltage")).to.be.true;
    });

    it("excludes single values by id or name", () => {
        const filter = createFilter("ve_bus_system_276.v*\n*alarm*\nve_bus_system_276.sum.*");
        expect(filter.excludesValue("ve_bus_system_276", "vvp", "VE.Bus product id")).to.be.true;
        expect(filter.excludesValue("ve_bus_system_276", "IV1", "Input voltage phase 1")).to.be.false;
        expect(filter.excludesValue("inverter_288", "aLBV", "Low battery voltage alarm")).to.be.true;
        expect(filter.excludesValue("ve_bus_system_276", "sum.Input_power", "Input power L1-L3")).to.be.true;
        expect(filter.excludesDevice("ve_bus_system_276")).to.be.false;
    });

    it("matches case insensitively and the whole text only", () => {
        const filter = createFilter("  GATEWAY_?  \nbattery");
        expect(filter.excludesDevice("gateway_0")).to.be.true;
        expect(filter.excludesDevice("gateway_10")).to.be.false;
        expect(filter.excludesValue("battery_monitor_512", "bv", "Battery voltage")).to.be.false;
    });

    it("treats regex characters literally", () => {
        const filter = createFilter("VE.Bus (custom) name");
        expect(filter.excludesValue("ve_bus_system_276", "x", "VE.Bus (custom) name")).to.be.true;
        expect(filter.excludesValue("ve_bus_system_276", "x", "VExBus (custom) name")).to.be.false;
    });
});
