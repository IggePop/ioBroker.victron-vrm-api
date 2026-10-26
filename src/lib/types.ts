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
