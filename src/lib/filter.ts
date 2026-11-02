/** Decides which devices and diagnostics values are skipped */
export interface ValueFilter {
    /** True if the filter has no patterns */
    readonly empty: boolean;
    /**
     * Whole device excluded?
     *
     * @param key - Device key, e.g. "ve_bus_system_276"
     * @param label - Display name, e.g. "MultiPlus-II 48/5000"
     */
    excludesDevice(key: string, label?: string): boolean;
    /**
     * Single value excluded (also true if its device is excluded)?
     *
     * @param key - Device key, e.g. "ve_bus_system_276"
     * @param id - Id below the device, e.g. "vvp" or "sum.Input_power"
     * @param name - Name of the value, e.g. "VE.Bus product id"
     */
    excludesValue(key: string, id: string, name: string): boolean;
}

function toRegExp(pattern: string): RegExp {
    const source = pattern
        .split("")
        .map(char => (char === "*" ? ".*" : char === "?" ? "." : char.replace(/[.+^${}()|[\]\\]/g, "\\$&")))
        .join("");
    return new RegExp(`^${source}$`, "i");
}

/**
 * Creates the filter from the exclusion list of the configuration.
 * One pattern per line, "*" and "?" as wildcards, case insensitive, lines starting with "#" are comments.
 * A pattern matches the device key ("gateway_0"), device key and value id ("ve_bus_system_276.vvp")
 * or the name of the value ("*alarm*").
 *
 * @param text - Exclusion list
 */
export function createFilter(text: string | undefined): ValueFilter {
    const patterns = (text ?? "")
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line !== "" && !line.startsWith("#"))
        .map(toRegExp);
    const matches = (...candidates: (string | undefined)[]): boolean =>
        patterns.some(pattern => candidates.some(candidate => candidate !== undefined && pattern.test(candidate)));

    return {
        empty: patterns.length === 0,
        excludesDevice: (key, label) => matches(key, label),
        excludesValue: (key, id, name) => matches(key, `${key}.${id}`, name),
    };
}
