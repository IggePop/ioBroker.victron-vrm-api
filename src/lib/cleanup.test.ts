import { expect } from "chai";
import { findObsolete, type SiteExpectation } from "./cleanup";

const IDS = [
    "info.connection",
    "info.user.id",
    "1",
    "1.info.name",
    "1.devices",
    "1.devices.gateway_0",
    "1.devices.gateway_0.name",
    "1.devices.solar_charger_288",
    "1.devices.solar_charger_288.name",
    "1.diagnostics",
    "1.diagnostics.grid_meter_40",
    "1.diagnostics.grid_meter_40.g1p",
    "1.diagnostics.grid_meter_40.sum",
    "1.diagnostics.grid_meter_40.sum.Grid",
    "1.diagnostics.old_meter_41",
    "1.diagnostics.old_meter_41.g1p",
    "1.energy",
    "1.energy.today.solarYield",
    "1.forecast",
    "1.forecast.solarToday",
    "1.alarms.count",
    "2",
    "2.info.name",
    "2.diagnostics.battery_monitor_279.bv",
];

function site(overrides: Partial<SiteExpectation> = {}): SiteExpectation {
    return {
        devices: new Set(["devices.gateway_0", "devices.solar_charger_288"]),
        diagnostics: new Set(["diagnostics.grid_meter_40", "diagnostics.old_meter_41"]),
        phaseSums: true,
        folders: { energy: true, forecast: true, alarms: true },
        ...overrides,
    };
}

describe("cleanup", () => {
    it("keeps everything that is still expected", () => {
        expect(
            findObsolete(
                IDS,
                new Map([
                    [1, site()],
                    [2, site({ diagnostics: undefined })],
                ]),
            ),
        ).to.deep.equal([]);
    });

    it("removes installations that are no longer polled, but never the info folder", () => {
        expect(findObsolete(IDS, new Map([[1, site()]]))).to.deep.equal(["2"]);
    });

    it("removes devices that VRM no longer reports", () => {
        const sites = new Map([
            [1, site({ devices: new Set(["devices.gateway_0"]), diagnostics: new Set(["diagnostics.grid_meter_40"]) })],
            [2, site({ diagnostics: undefined })],
        ]);
        expect(findObsolete(IDS, sites)).to.deep.equal(["1.devices.solar_charger_288", "1.diagnostics.old_meter_41"]);
    });

    it("keeps devices while the current list is unknown", () => {
        const sites = new Map([
            [1, site({ devices: undefined, diagnostics: undefined })],
            [2, site({ diagnostics: undefined })],
        ]);
        expect(findObsolete(IDS, sites)).to.deep.equal([]);
    });

    it("removes the sums when phase sums are disabled", () => {
        const sites = new Map([
            [1, site({ phaseSums: false })],
            [2, site({ diagnostics: undefined })],
        ]);
        expect(findObsolete(IDS, sites)).to.deep.equal(["1.diagnostics.grid_meter_40.sum"]);
    });

    it("removes values excluded by the filter", () => {
        const sites = new Map([
            [1, site()],
            [2, site({ diagnostics: undefined })],
        ]);
        const excluded = (id: string): boolean => id.endsWith(".g1p") || id === "1.diagnostics.grid_meter_40.sum.Grid";
        expect(findObsolete(IDS, sites, excluded)).to.deep.equal([
            "1.diagnostics.grid_meter_40.g1p",
            "1.diagnostics.grid_meter_40.sum.Grid",
            "1.diagnostics.old_meter_41.g1p",
        ]);
    });

    it("removes the folders of disabled options", () => {
        const sites = new Map([
            [1, site({ folders: { energy: false, forecast: true, alarms: false } })],
            [2, site({ diagnostics: undefined })],
        ]);
        expect(findObsolete(IDS, sites)).to.deep.equal(["1.energy", "1.alarms"]);
    });
});
