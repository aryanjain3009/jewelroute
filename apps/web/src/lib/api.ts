/** Typed fetch wrapper for the JewelRoute API (see docs/CONTRACT.md).
 *  The browser always calls same-origin `/api/v1/...`; next.config rewrites it to the Nest API,
 *  so httpOnly auth cookies are first-party. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown, public requestId?: string) {
    super(message);
  }
}

type Opts = { method?: string; body?: unknown; idempotencyKey?: string | true; signal?: AbortSignal; headers?: Record<string, string> };

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  refreshing ??= fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

export async function api<T = unknown>(path: string, opts: Opts = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(opts.body); }
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey === true ? crypto.randomUUID() : opts.idempotencyKey;

  const res = await fetch(`/api/v1${path.startsWith("/") ? path : `/${path}`}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers, body, credentials: "include", signal: opts.signal, cache: "no-store",
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON envelope
  let json: any = null;
  try { json = await res.json(); } catch { /* empty body */ }

  if (res.status === 401 && !retried && !path.startsWith("/auth/")) {
    if (await refresh()) return api<T>(path, opts, true);
    if (typeof window !== "undefined" && !location.pathname.startsWith("/login")) {
      location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
    }
  }
  if (!res.ok || json?.ok === false) {
    const e = json?.error ?? {};
    throw new ApiError(res.status, e.code ?? `HTTP_${res.status}`, e.message ?? res.statusText ?? "Request failed", e.details, json?.requestId);
  }
  return (json?.data ?? json) as T;
}

/** Stable idempotency key per logical user action: create once, reuse across retries. */
export function newOpKey() { return crypto.randomUUID(); }
