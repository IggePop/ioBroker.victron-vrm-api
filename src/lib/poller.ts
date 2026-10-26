export interface PollerOptions {
    /** Regular interval in milliseconds */
    interval: number;
    /** Upper limit for the delay after repeated failures */
    maxBackoff?: number;
    /** The job; a rejected promise counts as failure and triggers the backoff */
    run: () => Promise<void>;
    /** Called after a failed run with the delay until the next attempt */
    onError?: (error: unknown, nextDelay: number) => void;
}

/**
 * Runs a job periodically using setTimeout, so runs never overlap.
 * After failures the delay doubles until `maxBackoff` and resets after the next success.
 */
export class Poller {
    private timer: NodeJS.Timeout | undefined;
    private failures = 0;
    private stopped = true;

    public constructor(private readonly options: PollerOptions) {}

    public start(initialDelay = 0): void {
        this.stop();
        this.stopped = false;
        this.schedule(initialDelay);
    }

    public stop(): void {
        this.stopped = true;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
    }

    /**
     * Delay to wait after the given number of consecutive failures
     *
     * @param interval
     * @param failures
     * @param maxBackoff
     */
    public static backoffDelay(interval: number, failures: number, maxBackoff: number): number {
        if (failures <= 0) {
            return interval;
        }
        return Math.min(interval * 2 ** failures, Math.max(maxBackoff, interval));
    }

    private schedule(delay: number): void {
        this.timer = setTimeout(() => void this.tick(), delay);
    }

    private async tick(): Promise<void> {
        this.timer = undefined;
        try {
            await this.options.run();
            this.failures = 0;
        } catch (error) {
            this.failures++;
            if (!this.stopped) {
                this.options.onError?.(error, this.nextDelay());
            }
        }
        if (!this.stopped) {
            this.schedule(this.nextDelay());
        }
    }

    private nextDelay(): number {
        const { interval, maxBackoff = 15 * 60_000 } = this.options;
        return Poller.backoffDelay(interval, this.failures, maxBackoff);
    }
}
