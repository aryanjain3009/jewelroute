/** Typed fetch wrapper for the JewelRoute API (see docs/CONTRACT.md).
 *  The browser always calls same-origin `/api/v1/...`; next.config rewrites it to the Nest API,
 *  so httpOnly auth cookies are first-party. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown, public requestId?: string) {
    super(message);
  }
}

type Opts = { method?: string; body?: unknown; idempotencyKey?: string | true; signal?: AbortSignal; headers?: Record<string, string> };

/** Run `fn` while holding a browser-wide lock, so two tabs never rotate the same refresh token at once
 *  (the loser would present a token the winner just rotated, which revokes the whole session family). */
function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  return locks ? (locks.request(name, fn) as Promise<T>) : fn();
}

let refreshing: Promise<boolean> | null = null;
/** One refresh per tab at a time (single flight), serialized across tabs. Inside the lock, first check
 *  whether another tab already refreshed (the cookies are shared); only then rotate. */
function refresh(): Promise<boolean> {
  refreshing ??= withLock("jr-session-refresh", async () => {
    const opts: RequestInit = { credentials: "include", cache: "no-store" };
    const me = await fetch("/api/v1/auth/me", opts).catch(() => null);
    if (me?.ok) return true;
    const r = await fetch("/api/v1/auth/refresh", { ...opts, method: "POST" }).catch(() => null);
    return !!r?.ok;
  }).finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

let signingOut = false;
/** The session is gone: clear both cookies (so the middleware can't bounce /login back into the app on a
 *  still-unexpired access token) and go to sign-in, returning here afterwards. */
function toSignIn(reason?: string) {
  if (typeof window === "undefined" || signingOut || location.pathname.startsWith("/login")) return;
  signingOut = true;
  const q = new URLSearchParams({ next: location.pathname + location.search });
  if (reason) q.set("reason", reason);
  const go = () => location.assign(`/login?${q}`);
  fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" }).then(go, go);
}

const HANDSHAKE = /^\/auth\/(login|refresh|logout)\b/;

export async function api<T = unknown>(path: string, opts: Opts = {}, attempt = 0): Promise<T> {
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

  // 401: refresh once and retry (the same Idempotency-Key, so a create can't double). If the refresh fails,
  // retry once more anyway — another tab may have rotated the shared cookies meanwhile — then sign in.
  // Every call does this, including /auth/me; only the session handshake itself does not.
  if (res.status === 401 && !HANDSHAKE.test(path)) {
    if (attempt === 0) { await refresh(); return api<T>(path, opts, 1); }
    toSignIn(json?.error?.code === "ACCOUNT_DISABLED" ? "disabled" : undefined);
  }
  if (!res.ok || json?.ok === false) {
    const e = json?.error ?? {};
    throw new ApiError(res.status, e.code ?? `HTTP_${res.status}`, e.message ?? res.statusText ?? "Request failed", e.details, json?.requestId);
  }
  return (json?.data ?? json) as T;
}

/** Stable idempotency key per logical user action: create once, reuse across retries. */
export function newOpKey() { return crypto.randomUUID(); }
