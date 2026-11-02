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
            /** Read energy totals (today, week, month, year) */
            energyStats: boolean;
            /** Polling interval for the energy totals in minutes */
            energyInterval: number;
            /** Read the solar yield and consumption forecast */
            forecast: boolean;
            /** How often the forecast is fetched from VRM, in minutes */
            forecastInterval: number;
            /** Read the alarm log (active alarms, newest alarm, history) */
            alarms: boolean;
            /** Polling interval for the alarm log in minutes */
            alarmsInterval: number;
            /** Create sums over L1-L3 for power, current and energy values */
            phaseSums: boolean;
            /** Delete objects of deselected installations, removed devices and disabled options at start */
            cleanupObjects: boolean;
            /** Exclusion list for devices and diagnostics values, one pattern per line */
            exclude: string;
            /** HTTP request timeout in seconds */
            requestTimeout: number;
        }

        /** Notification scope of this adapter, see "notifications" in io-package.json */
        interface NotificationScopes {
            "victron-vrm-api": "tokenInvalid";
        }
    }
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
