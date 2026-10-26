type Task<T> = () => Promise<T>;

interface QueueEntry {
    task: Task<unknown>;
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
}

/**
 * Runs async tasks strictly one after another with a minimum gap between their starts.
 * Used to stay well below the VRM API rate limit when polling several installations.
 */
export class RequestQueue {
    private readonly entries: QueueEntry[] = [];
    private running = false;
    private lastStart = 0;
    private pausedUntil = 0;
    private timer: NodeJS.Timeout | undefined;

    /**
     * @param minInterval - Minimum time in milliseconds between the start of two tasks
     */
    public constructor(private readonly minInterval = 500) {}

    public add<T>(task: Task<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.entries.push({ task, resolve: resolve as (value: unknown) => void, reject });
            void this.next();
        });
    }

    /**
     * Delays the next task, e.g. after HTTP 429
     *
     * @param ms
     */
    public pause(ms: number): void {
        this.pausedUntil = Math.max(this.pausedUntil, Date.now() + ms);
    }

    /** Rejects all waiting tasks and stops processing */
    public clear(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
        for (const entry of this.entries.splice(0)) {
            entry.reject(new Error("Request queue cleared"));
        }
    }

    public get size(): number {
        return this.entries.length;
    }

    private async next(): Promise<void> {
        if (this.running || this.timer || this.entries.length === 0) {
            return;
        }

        const wait = Math.max(this.lastStart + this.minInterval, this.pausedUntil) - Date.now();
        if (wait > 0) {
            this.timer = setTimeout(() => {
                this.timer = undefined;
                void this.next();
            }, wait);
            return;
        }

        const entry = this.entries.shift()!;
        this.running = true;
        this.lastStart = Date.now();
        try {
            entry.resolve(await entry.task());
        } catch (error) {
            entry.reject(error);
        } finally {
            this.running = false;
            void this.next();
        }
    }
}
