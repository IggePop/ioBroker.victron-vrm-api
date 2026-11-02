/** Request from a script via sendTo("victron-vrm-api.0", "get", { path, params }) */
export interface ScriptRequest {
    path: string;
    params: Record<string, string | string[]>;
}

function single(item: unknown): string | undefined {
    return typeof item === "string" || typeof item === "number" || typeof item === "boolean" ? String(item) : undefined;
}

function toParam(value: unknown): string | string[] | undefined {
    if (Array.isArray(value)) {
        const items = value.map(single).filter(item => item !== undefined);
        return items.length === value.length ? items : undefined;
    }
    return single(value);
}

/**
 * Checks a request from a script. Only GET requests below the polled installations
 * and the own user are allowed, so scripts cannot read other data with the token.
 *
 * @param message - Message of sendTo, e.g. { path: "/installations/123/stats", params: { type: "kwh" } }
 * @param sites - Installations polled by the adapter
 * @param userId - Id of the VRM user of the token
 */
export function parseScriptRequest(
    message: unknown,
    sites: Set<number>,
    userId: number | undefined,
): ScriptRequest | { error: string } {
    const { path: rawPath, params: rawParams } = (message ?? {}) as { path?: unknown; params?: unknown };
    if (typeof rawPath !== "string" || rawPath.trim() === "") {
        return { error: 'Missing "path", e.g. { path: "/installations/<idSite>/stats" }' };
    }
    const path = `/${rawPath.trim().replace(/^\/+/, "").replace(/\/+$/, "")}`;
    if (!/^[A-Za-z0-9/_-]+$/.test(path)) {
        return { error: 'Invalid "path": only letters, digits, "/", "_" and "-", pass query parameters in "params"' };
    }

    const [, root, id] = path.split("/");
    const allowed =
        (root === "installations" && sites.has(Number(id))) ||
        (root === "users" && (id === "me" || (userId !== undefined && Number(id) === userId)));
    if (!allowed) {
        return {
            error: `Path not allowed: ${path}. Allowed are /installations/<idSite>/... of the polled installations and /users/me or /users/<own id>/...`,
        };
    }

    const params: Record<string, string | string[]> = {};
    if (rawParams !== undefined && rawParams !== null) {
        if (typeof rawParams !== "object" || Array.isArray(rawParams)) {
            return { error: '"params" must be an object, e.g. { type: "kwh", interval: "days" }' };
        }
        for (const [key, value] of Object.entries(rawParams)) {
            const param = toParam(value);
            if (param === undefined) {
                return { error: `Invalid value for parameter "${key}"` };
            }
            params[key] = param;
        }
    }
    return { path, params };
}

/** Allows at most `limit` calls within `window` milliseconds */
export class RateLimiter {
    private calls: number[] = [];

    /**
     * @param limit - Maximum number of calls
     * @param window - Time window in milliseconds
     */
    public constructor(
        private readonly limit: number,
        private readonly window: number,
    ) {}

    /**
     * Registers a call if the limit allows it
     *
     * @param now - Current time in milliseconds
     * @returns false if the limit is reached
     */
    public tryAcquire(now = Date.now()): boolean {
        this.calls = this.calls.filter(time => now - time < this.window);
        if (this.calls.length >= this.limit) {
            return false;
        }
        this.calls.push(now);
        return true;
    }
}
