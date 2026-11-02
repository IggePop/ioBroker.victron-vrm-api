import { expect } from "chai";
import { parseScriptRequest, RateLimiter } from "./script-request";

const SITES = new Set([123]);

describe("script requests", () => {
    it("accepts paths of polled installations and normalizes them", () => {
        expect(
            parseScriptRequest(
                { path: "installations/123/stats/", params: { type: "kwh", start: 1, end: 2, show: true } },
                SITES,
                42,
            ),
        ).to.deep.equal({
            path: "/installations/123/stats",
            params: { type: "kwh", start: "1", end: "2", show: "true" },
        });
    });

    it("passes arrays as repeated parameters", () => {
        const request = parseScriptRequest(
            { path: "/installations/123/overallstats", params: { "attributeCodes[]": ["Pc", "Pb"] } },
            SITES,
            42,
        );
        expect(request).to.deep.include({ params: { "attributeCodes[]": ["Pc", "Pb"] } });
    });

    it("allows the own user only", () => {
        expect(parseScriptRequest({ path: "/users/me" }, SITES, 42)).to.deep.equal({ path: "/users/me", params: {} });
        expect(parseScriptRequest({ path: "/users/42/installations" }, SITES, 42)).to.have.property("path");
        expect(parseScriptRequest({ path: "/users/43/installations" }, SITES, 42)).to.have.property("error");
        expect(parseScriptRequest({ path: "/users/42" }, SITES, undefined)).to.have.property("error");
    });

    it("rejects other installations and other paths", () => {
        for (const path of ["/installations/999/stats", "/installations", "/admin/users", "/auth/logout", "/"]) {
            expect(parseScriptRequest({ path }, SITES, 42), path).to.have.property("error");
        }
    });

    it("rejects invalid input", () => {
        for (const message of [
            undefined,
            {},
            { path: 1 },
            { path: "/installations/123/stats?type=kwh" },
            { path: "/installations/123/../../users/43" },
            { path: "https://example.com/installations/123" },
            { path: "/installations/123/stats", params: "type=kwh" },
            { path: "/installations/123/stats", params: { type: { nested: true } } },
            { path: "/installations/123/stats", params: { codes: ["a", {}] } },
        ]) {
            expect(parseScriptRequest(message, SITES, 42), JSON.stringify(message)).to.have.property("error");
        }
    });

    it("limits the number of calls per time window", () => {
        const limiter = new RateLimiter(2, 60_000);
        expect(limiter.tryAcquire(0)).to.be.true;
        expect(limiter.tryAcquire(1_000)).to.be.true;
        expect(limiter.tryAcquire(2_000)).to.be.false;
        expect(limiter.tryAcquire(60_000)).to.be.true;
    });
});
