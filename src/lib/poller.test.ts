import { expect } from "chai";
import { Poller } from "./poller";
import { RequestQueue } from "./request-queue";

describe("Poller.backoffDelay()", () => {
    it("doubles the interval per failure up to the maximum", () => {
        expect(Poller.backoffDelay(60, 0, 900)).to.equal(60);
        expect(Poller.backoffDelay(60, 1, 900)).to.equal(120);
        expect(Poller.backoffDelay(60, 3, 900)).to.equal(480);
        expect(Poller.backoffDelay(60, 10, 900)).to.equal(900);
    });

    it("never goes below the interval", () => {
        expect(Poller.backoffDelay(1000, 2, 500)).to.equal(1000);
    });
});

describe("RequestQueue", () => {
    it("runs tasks sequentially with a minimum gap", async () => {
        const queue = new RequestQueue(30);
        const starts: number[] = [];
        let running = 0;
        let maxParallel = 0;
        const task = async (): Promise<number> => {
            starts.push(Date.now());
            running++;
            maxParallel = Math.max(maxParallel, running);
            await new Promise(resolve => setTimeout(resolve, 5));
            running--;
            return starts.length;
        };

        const results = await Promise.all([queue.add(task), queue.add(task), queue.add(task)]);
        expect(results).to.deep.equal([1, 2, 3]);
        expect(maxParallel).to.equal(1);
        expect(starts[1] - starts[0]).to.be.at.least(25);
        expect(starts[2] - starts[1]).to.be.at.least(25);
    });

    it("propagates errors without stopping the queue", async () => {
        const queue = new RequestQueue(0);
        const failing = queue.add(() => Promise.reject(new Error("boom")));
        const ok = queue.add(() => Promise.resolve("ok"));
        await expect(failing).to.be.rejectedWith("boom");
        expect(await ok).to.equal("ok");
    });

    it("rejects waiting tasks on clear()", async () => {
        const queue = new RequestQueue(1000);
        const first = queue.add(() => Promise.resolve(1));
        const second = queue.add(() => Promise.resolve(2));
        await first;
        queue.clear();
        await expect(second).to.be.rejectedWith("Request queue cleared");
    });
});
