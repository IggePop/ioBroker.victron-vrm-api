/**
 * Subset of the VRM API v2 response types used by the adapter.
 * Only the fields the adapter actually reads are typed; everything else is ignored.
 */

export interface VrmUserResponse {
    success: boolean;
    user: {
        id: number;
        name: string;
        email?: string;
    };
}

export interface VrmInstallation {
    idSite: number;
    name: string;
    identifier: string;
    timezone?: string;
    last_timestamp?: number;
}

export interface VrmInstallationsResponse {
    success: boolean;
    records: VrmInstallation[];
}

export interface VrmEnumValue {
    nameEnum: string;
    valueEnum: number;
}

export interface VrmDiagnosticRecord {
    idSite: number;
    /** Unix timestamp in seconds */
    timestamp: number;
    Device: string;
    instance: number;
    idDataAttribute: number;
    description: string;
    /** printf-like format, e.g. "%.2F V" */
    formatWithUnit?: string;
    dbusServiceType?: string;
    dbusPath?: string;
    code: string;
    formattedValue?: string;
    rawValue: number | string | null;
    dataAttributeEnumValues?: VrmEnumValue[];
}

export interface VrmDiagnosticsResponse {
    success: boolean;
    records: VrmDiagnosticRecord[];
    num_records?: number;
}

export interface VrmOverviewDevice {
    /** Device type, same as "Device" in the diagnostics, e.g. "PV Inverter" */
    name: string;
    customName?: string | null;
    productName?: string;
    productCode?: string;
    firmwareVersion?: string;
    /** Unix timestamp in seconds, false if unknown */
    lastConnection?: number | string | false;
    /** Missing for the gateway */
    instance?: number;
    /** Gateway only: expected seconds between logs */
    loggingInterval?: number | false;
    /** Gateway only: unix timestamp in seconds */
    lastPowerUpOrRestart?: number | string | false;
    /** Model of Fronius inverters, e.g. "Fronius Symo 5.0-3-M" */
    froniusDeviceType?: string;
}

export interface VrmSystemOverviewResponse {
    success: boolean;
    records: {
        devices: VrmOverviewDevice[];
    };
}

export interface VrmStatsTimeframe {
    /** kWh per attribute code, false if there is no data */
    totals: Record<string, number | false | null>;
    percentages?: Record<string, number>;
}

export interface VrmOverallStatsResponse {
    success: boolean;
    /** Keys: "today", "week", "month", "year" */
    records: Record<string, VrmStatsTimeframe>;
}
