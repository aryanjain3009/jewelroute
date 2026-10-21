/* Client IP for throttling and audit. Express resolves `req.ip` from X-Forwarded-For only across the number
 * of proxy hops we trust (`app.set('trust proxy', trustProxyHops())`), so a client-supplied XFF entry is never
 * taken at face value. Never read the raw header for security decisions. */

/** Trusted proxy hops: TRUST_PROXY when set; else 1 on Vercel (its edge overwrites XFF), else 0 (local, Docker). */
export function trustProxyHops(e: { TRUST_PROXY?: number }, proc: NodeJS.ProcessEnv = process.env): number {
  return e.TRUST_PROXY ?? (proc.VERCEL ? 1 : 0);
}

/** Throttle key: the resolved client IP; login is keyed per IP + email so one NAT does not lock everyone out. */
export function throttleTracker(req: { ip?: string; url?: string; body?: unknown; headers?: unknown }): string {
  const ip = req.ip || 'unknown';
  const b = req.body as { email?: unknown } | undefined;
  const email = typeof b?.email === 'string' ? b.email.toLowerCase() : '';
  return String(req.url ?? '').includes('/auth/login') && email ? `${ip}:${email}` : ip;
}
