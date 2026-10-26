import { expect } from "chai";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { RequestQueue } from "./request-queue";
import { VrmApiError, VrmClient } from "./vrm-client";

describe("VrmClient", () => {
    let server: http.Server;
    let baseUrl: string;
    let lastHeaders: http.IncomingHttpHeaders = {};
    let lastUrl = "";

    before(async () => {
        server = http.createServer((req, res) => {
            lastHeaders = req.headers;
            lastUrl = req.url ?? "";
            res.setHeader("Content-Type", "application/json");
            if (req.headers["x-authorization"] !== "Token secret") {
                res.statusCode = 401;
                res.end(JSON.stringify({ success: false, errors: "Invalid token", error_code: "invalid_token" }));
            } else if (lastUrl.startsWith("/users/me")) {
                res.end(JSON.stringify({ success: true, user: { id: 42, name: "Test" } }));
            } else if (lastUrl.startsWith("/installations/1/diagnostics")) {
                res.end(JSON.stringify({ success: true, records: [{ code: "bs" }] }));
            } else if (lastUrl.startsWith("/limited")) {
                res.statusCode = 429;
                res.setHeader("Retry-After", "1");
                res.end("{}");
            } else {
                res.end(JSON.stringify({ success: false, errors: "nope" }));
            }
        });
        await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    after(() => {
        server.close();
    });

    it("sends the token header and parses responses", async () => {
        const client = new VrmClient("secret", { baseUrl, queue: new RequestQueue(0) });
        expect(await client.getMe()).to.deep.equal({ id: 42, name: "Test" });
        expect(lastHeaders["x-authorization"]).to.equal("Token secret");

        expect(await client.getDiagnostics(1)).to.deep.equal([{ code: "bs" }]);
        expect(lastUrl).to.equal("/installations/1/diagnostics?count=1000");
    });

    it("reports authentication errors", async () => {
        const client = new VrmClient("wrong", { baseUrl, queue: new RequestQueue(0) });
        const error = (await client.getMe().catch(e => e)) as VrmApiError;
        expect(error).to.be.instanceOf(VrmApiError);
        expect(error.status).to.equal(401);
        expect(error.isAuthError).to.be.true;
        expect(error.message).to.contain("Invalid token");
    });

    it("pauses the queue on HTTP 429", async () => {
        const queue = new RequestQueue(0);
        const client = new VrmClient("secret", { baseUrl, queue });
        const error = (await client.get("/limited").catch(e => e)) as VrmApiError;
        expect(error.isRateLimit).to.be.true;
        expect(error.retryAfter).to.equal(1);

        const start = Date.now();
        await client.getMe();
        expect(Date.now() - start).to.be.at.least(900);
    });

    it("treats success=false as error", async () => {
        const client = new VrmClient("secret", { baseUrl, queue: new RequestQueue(0) });
        await expect(client.get("/other")).to.be.rejectedWith(VrmApiError, "nope");
    });
});
