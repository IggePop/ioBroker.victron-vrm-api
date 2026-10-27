import type {
    VrmDiagnosticRecord,
    VrmDiagnosticsResponse,
    VrmInstallation,
    VrmInstallationsResponse,
    VrmOverallStatsResponse,
    VrmOverviewDevice,
    VrmSystemOverviewResponse,
    VrmUserResponse,
} from "./types";
import { RequestQueue } from "./request-queue";

export const VRM_BASE_URL = "https://vrmapi.victronenergy.com/v2";

/** Thrown for every non-successful VRM response or network failure */
export class VrmApiError extends Error {
    /**
     * @param message - Error text including the request path
     * @param status - HTTP status
     * @param retryAfter - Seconds from the Retry-After header
     */
    public constructor(
        message: string,
        /** HTTP status, undefined for network errors and timeouts */
        public readonly status?: number,
        /** Seconds to wait before the next request (HTTP 429) */
        public readonly retryAfter?: number,
    ) {
        super(message);
        this.name = "VrmApiError";
    }

    /** Token invalid or no access - retrying makes no sense */
    public get isAuthError(): boolean {
        return this.status === 401 || this.status === 403;
    }

    /** HTTP 429 - too many requests */
    public get isRateLimit(): boolean {
        return this.status === 429;
    }
}

/** Options for {@link VrmClient} */
export interface VrmClientOptions {
    /** API base URL, defaults to {@link VRM_BASE_URL} */
    baseUrl?: string;
    /** Request timeout in milliseconds */
    timeout?: number;
    /** Shared queue; a private one is created if omitted */
    queue?: RequestQueue;
}

/**
 * Thin read-only client for the VRM API v2.
 * All requests go through a queue so multiple installations do not hammer the API.
 */
export class VrmClient {
    private readonly baseUrl: string;
    private readonly timeout: number;
    private readonly queue: RequestQueue;
    private readonly controllers = new Set<AbortController>();

    /**
     * @param token - VRM access token
     * @param options - Base URL, timeout and request queue
     */
    public constructor(
        private readonly token: string,
        options: VrmClientOptions = {},
    ) {
        this.baseUrl = (options.baseUrl ?? VRM_BASE_URL).replace(/\/+$/, "");
        this.timeout = options.timeout ?? 30_000;
        this.queue = options.queue ?? new RequestQueue();
    }

    /** The user the token belongs to */
    public async getMe(): Promise<VrmUserResponse["user"]> {
        const res = await this.get<VrmUserResponse>("/users/me");
        return res.user;
    }

    /**
     * All installations the user has access to
     *
     * @param idUser - User id from {@link getMe}
     */
    public async getInstallations(idUser: number): Promise<VrmInstallation[]> {
        const res = await this.get<VrmInstallationsResponse>(`/users/${idUser}/installations`);
        return res.records ?? [];
    }

    /**
     * Latest values of all data attributes of an installation
     *
     * @param idSite - Installation id
     */
    public async getDiagnostics(idSite: number): Promise<VrmDiagnosticRecord[]> {
        const res = await this.get<VrmDiagnosticsResponse>(`/installations/${idSite}/diagnostics`, {
            count: "1000",
        });
        return res.records ?? [];
    }

    /**
     * Energy totals for today, week, month and year
     *
     * @param idSite - Installation id
     * @param attributeCodes - VRM attribute codes, e.g. "Pc" (PV to consumers)
     */
    public async getOverallStats(
        idSite: number,
        attributeCodes: string[],
    ): Promise<VrmOverallStatsResponse["records"]> {
        const res = await this.get<VrmOverallStatsResponse>(`/installations/${idSite}/overallstats`, {
            type: "custom",
            "attributeCodes[]": attributeCodes,
        });
        return res.records ?? {};
    }

    /**
     * Devices of an installation with product name and firmware
     *
     * @param idSite - Installation id
     */
    public async getSystemOverview(idSite: number): Promise<VrmOverviewDevice[]> {
        const res = await this.get<VrmSystemOverviewResponse>(`/installations/${idSite}/system-overview`);
        return res.records?.devices ?? [];
    }

    /**
     * Generic GET request, `path` is relative to the base URL
     *
     * @param path
     * @param params
     */
    public get<T>(path: string, params?: Record<string, string | string[]>): Promise<T> {
        const url = new URL(this.baseUrl + (path.startsWith("/") ? path : `/${path}`));
        for (const [key, value] of Object.entries(params ?? {})) {
            // arrays become repeated parameters, e.g. attributeCodes[]=Pc&attributeCodes[]=Pb
            for (const item of Array.isArray(value) ? value : [value]) {
                url.searchParams.append(key, item);
            }
        }
        return this.queue.add(() => this.request<T>(url));
    }

    /** Aborts all running requests (used on unload) */
    public abortAll(): void {
        for (const controller of this.controllers) {
            controller.abort();
        }
        this.controllers.clear();
        this.queue.clear();
    }

    private async request<T>(url: URL): Promise<T> {
        const controller = new AbortController();
        this.controllers.add(controller);
        const timer = setTimeout(() => controller.abort(), this.timeout);

        let response: Response;
        try {
            response = await fetch(url, {
                method: "GET",
                headers: {
                    "X-Authorization": `Token ${this.token}`,
                    Accept: "application/json",
                },
                signal: controller.signal,
            });
        } catch (error) {
            const message = controller.signal.aborted ? "Request timed out or aborted" : (error as Error).message;
            throw new VrmApiError(`${url.pathname}: ${message}`);
        } finally {
            clearTimeout(timer);
            this.controllers.delete(controller);
        }

        if (!response.ok) {
            const retryAfter = Number(response.headers.get("retry-after")) || undefined;
            if (retryAfter && response.status === 429) {
                this.queue.pause(retryAfter * 1000);
            }
            const body = await response.text().catch(() => "");
            throw new VrmApiError(
                `${url.pathname}: HTTP ${response.status} ${extractErrorText(body) ?? response.statusText}`,
                response.status,
                retryAfter,
            );
        }

        const data = (await response.json()) as T & { success?: boolean; errors?: unknown };
        if (data.success === false) {
            throw new VrmApiError(`${url.pathname}: ${JSON.stringify(data.errors ?? "request not successful")}`);
        }
        return data;
    }
}

function extractErrorText(body: string): string | undefined {
    try {
        const json = JSON.parse(body) as { errors?: unknown; error_code?: string };
        if (json.errors) {
            return typeof json.errors === "string" ? json.errors : JSON.stringify(json.errors);
        }
        return json.error_code;
    } catch {
        return undefined;
    }
}
