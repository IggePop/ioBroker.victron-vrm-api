/** Folders of an installation that only exist while the matching option is enabled */
export const OPTIONAL_FOLDERS = ["energy", "forecast", "alarms"] as const;

/** What should exist below one installation */
export interface SiteExpectation {
    /** Channel ids "devices.<key>" from the current device list, undefined if unknown */
    devices?: Set<string>;
    /** Channel ids "diagnostics.<key>" from the current diagnostics, undefined if unknown */
    diagnostics?: Set<string>;
    /** Whether the phase sums (diagnostics.<key>.sum) are enabled */
    phaseSums: boolean;
    /** Enabled state of the optional folders */
    folders: Record<(typeof OPTIONAL_FOLDERS)[number], boolean>;
}

/**
 * Finds the objects that are no longer needed. Returns only the topmost ids,
 * each of them has to be deleted recursively.
 *
 * @param ids - All object ids of the adapter instance, relative to the namespace
 * @param sites - Polled installations (idSite) and what should exist below them
 */
export function findObsolete(ids: string[], sites: Map<number, SiteExpectation>): string[] {
    const result: string[] = [];
    const add = (id: string): void => {
        if (!result.includes(id)) {
            result.push(id);
        }
    };

    for (const id of ids) {
        const parts = id.split(".");
        // installation folders are numeric (idSite), everything else (info.*) belongs to the adapter
        if (!/^\d+$/.test(parts[0])) {
            continue;
        }
        const site = sites.get(Number(parts[0]));
        if (!site) {
            add(parts[0]);
            continue;
        }
        const [, folder, key, sub] = parts;
        const folderEnabled = site.folders[folder as keyof SiteExpectation["folders"]];
        if (folderEnabled === false) {
            add(`${parts[0]}.${folder}`);
        } else if (key !== undefined && folder === "devices" && site.devices && !site.devices.has(`devices.${key}`)) {
            add(parts.slice(0, 3).join("."));
        } else if (key !== undefined && folder === "diagnostics") {
            if (site.diagnostics && !site.diagnostics.has(`diagnostics.${key}`)) {
                add(parts.slice(0, 3).join("."));
            } else if (sub === "sum" && !site.phaseSums) {
                add(parts.slice(0, 4).join("."));
            }
        }
    }
    return result;
}
