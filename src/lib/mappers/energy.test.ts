import { expect } from "chai";
import type { VrmOverallStatsResponse } from "../types";
import { ENERGY_CODES, mapEnergy } from "./energy";

// real overallstats response (type=custom), shortened to two periods
const records: VrmOverallStatsResponse["records"] = {
    year: {
        totals: {
            Gc: 8083.2352226287185,
            Bc: 10248.051345106855,
            Gb: 563.3659245651215,
            Pc: 13444.929090552032,
            Pb: 10295.482329040766,
            Pg: 4146.812478765845,
            Bg: 55.307417600939516,
            gc: false,
            gb: false,
        },
    },
    today: {
        totals: {
            Gc: 55.00000035017729,
            Pc: 31.394043132662773,
            Pb: 2,
            Pg: 5.624269440770149,
            Bc: 0.11831126175820827,
            Bg: 0.18051686137914658,
            Gb: false,
            gc: false,
            gb: false,
        },
    },
};

describe("energy mapper", () => {
    const result = mapEnergy(records);
    const value = (id: string): ioBroker.StateValue | undefined => result.states.find(s => s.id === id)?.value;

    it("requests all flow codes", () => {
        expect(ENERGY_CODES).to.have.members(["Pc", "Pb", "Pg", "Gc", "Gb", "Bc", "Bg", "gc", "gb"]);
    });

    it("builds totals that match VRM's own totals", () => {
        // live_feed of the same installation: total_solar_yield 39.018, total_consumption 86.512,
        // grid_history_from 55.000, grid_history_to 5.805
        expect(value("energy.today.solarYield")).to.equal(39.018);
        expect(value("energy.today.consumption")).to.equal(86.512);
        expect(value("energy.today.gridImport")).to.equal(55);
        expect(value("energy.today.gridExport")).to.equal(5.805);
        expect(value("energy.today.batteryCharged")).to.equal(2);
        expect(value("energy.today.batteryDischarged")).to.equal(0.299);
        // year: grid_history_from 8646.601
        expect(value("energy.year.gridImport")).to.equal(8646.601);
    });

    it("treats false as 0 within a period", () => {
        expect(value("energy.today.flows.gridToBattery")).to.equal(0);
        expect(value("energy.year.flows.gridToBattery")).to.equal(563.366);
    });

    it("omits flows and the generator total without any data", () => {
        const ids = result.states.map(s => s.id);
        expect(ids).not.to.include("energy.today.flows.gensetToConsumers");
        expect(ids).not.to.include("energy.year.genset");
        expect(ids).to.include("energy.year.flows.pvToGrid");
    });

    it("creates channels in period order and kWh states", () => {
        expect(result.channels.map(c => c.id)).to.deep.equal([
            "energy.today",
            "energy.today.flows",
            "energy.year",
            "energy.year.flows",
        ]);
        const state = result.states.find(s => s.id === "energy.year.solarYield")!;
        expect(state.common).to.include({ unit: "kWh", role: "value.energy", type: "number", write: false });
    });

    it("includes the generator when it has data", () => {
        const withGenset = mapEnergy({ today: { totals: { Pc: 1, gc: 2.5, gb: false } } });
        const ids = withGenset.states.map(s => [s.id, s.value]);
        expect(ids).to.deep.include(["energy.today.genset", 2.5]);
        expect(ids).to.deep.include(["energy.today.consumption", 3.5]);
        expect(ids).to.deep.include(["energy.today.flows.gensetToConsumers", 2.5]);
    });

    it("returns nothing for an empty response", () => {
        expect(mapEnergy({}).states).to.be.empty;
    });
});
