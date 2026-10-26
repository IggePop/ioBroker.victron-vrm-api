// This file extends the AdapterConfig type from "@iobroker/types"

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
    namespace ioBroker {
        interface AdapterConfig {
            /** VRM access token (encrypted in the instance object) */
            token: string;
            /** Selected installation ids (idSite as string); empty = all installations */
            sites: string[];
            /** Polling interval for diagnostics in minutes */
            diagnosticsInterval: number;
            /** Minutes without new data after which an installation is flagged as stale */
            staleMinutes: number;
            /** Create sums over L1-L3 for power, current and energy values */
            phaseSums: boolean;
            /** HTTP request timeout in seconds */
            requestTimeout: number;
        }
    }
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
