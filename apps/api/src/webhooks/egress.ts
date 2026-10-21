/* Webhook egress guard (SSRF). Endpoint URLs must be http(s) and must not reach loopback, private,
 * link-local, CGNAT, metadata, multicast or reserved addresses — checked when an endpoint is created or
 * updated (after DNS resolution) and again at connect time for every delivery (the custom `lookup` below),
 * so a hostname that later re-resolves to a private address (DNS rebinding) is never called.
 * Exceptions: the app's own built-in demo receiver (API_PUBLIC_URL + /v1/dev/webhook-receiver/…) while it is
 * enabled, and WEBHOOK_ALLOW_PRIVATE=true (local development and the test harness only). */
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { Logger } from '@nestjs/common';
import { AppError } from '../common/errors';

const V4_BLOCKED: [number, number][] = [
  [0x00000000, 8], // 0.0.0.0/8 "this network"
  [0x0a000000, 8], // 10/8
  [0x64400000, 10], // 100.64/10 CGNAT (also Alibaba metadata 100.100.100.200)
  [0x7f000000, 8], // loopback
  [0xa9fe0000, 16], // 169.254/16 link-local (cloud metadata)
  [0xac100000, 12], // 172.16/12
  [0xc0000000, 24], // 192.0.0/24 IETF protocol assignments
  [0xc0a80000, 16], // 192.168/16
  [0xc6120000, 15], // 198.18/15 benchmarking
  [0xe0000000, 4], // multicast
  [0xf0000000, 4], // reserved + broadcast
];

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((n, o) => (n * 256 + Number(o)) >>> 0, 0);
}
function v4Blocked(ip: string): boolean {
  const n = v4ToInt(ip);
  return V4_BLOCKED.some(([base, bits]) => (n & (bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0)) >>> 0 === base);
}

/** 8 hextets of an IPv6 address (handles `::` and a dotted IPv4 tail). */
function v6Hextets(ip: string): number[] {
  let s = ip.toLowerCase().split('%')[0];
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (dotted) {
    const n = v4ToInt(dotted[1]);
    s = s.slice(0, -dotted[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [head, tail] = s.split('::');
  const h = head ? head.split(':') : [];
  const t = tail !== undefined ? (tail ? tail.split(':') : []) : [];
  const fill = tail !== undefined ? Array(8 - h.length - t.length).fill('0') : [];
  return [...h, ...fill, ...t].map((x) => parseInt(x || '0', 16));
}

/** True for any address a webhook must never reach. Unknown formats are blocked. */
export function isForbiddenAddress(ip: string): boolean {
  const kind = isIP(ip.split('%')[0]);
  if (kind === 4) return v4Blocked(ip);
  if (kind !== 6) return true;
  const h = v6Hextets(ip);
  const embedded = () => `${h[6] >>> 8}.${h[6] & 255}.${h[7] >>> 8}.${h[7] & 255}`;
  if (h.slice(0, 6).every((x) => x === 0)) return h[6] === 0 && h[7] <= 1 ? true : v4Blocked(embedded()); // ::, ::1, ::a.b.c.d
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) return v4Blocked(embedded()); // ::ffff:a.b.c.d
  if (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every((x) => x === 0)) return v4Blocked(embedded()); // NAT64 64:ff9b::/96
  if (h[0] === 0x64 && h[1] === 0xff9b && h[2] === 0x0001) return true; // NAT64 local-use 64:ff9b:1::/48
  if (h[0] === 0x2002) return true; // 6to4 relays (deprecated; can tunnel to any embedded IPv4)
  if (h[0] === 0x2001 && h[1] === 0x0000) return true; // Teredo 2001::/32
  if (h[0] === 0x0100 && h.slice(1, 4).every((x) => x === 0)) return true; // discard-only 100::/64
  if ((h[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((h[0] & 0xffc0) === 0xfe80 || (h[0] & 0xffc0) === 0xfec0) return true; // link-local, site-local
  if ((h[0] & 0xff00) === 0xff00) return true; // multicast
  return false;
}

const log = new Logger('WebhookEgress');
/** One generic message (review m4): never echo resolved addresses or whether a host resolves — that would be an
 * internal-DNS oracle for any tenant admin. The detail goes to the server log only. */
const GENERIC = 'This URL cannot receive webhooks — use a public http(s) address';
const forbidden = (detail: string) => {
  log.warn({ detail }, 'webhook URL refused');
  return new AppError(422, 'WEBHOOK_URL_FORBIDDEN', GENERIC);
};
const hostOf = (u: URL) => u.hostname.replace(/^\[|\]$/g, '');
const RECEIVER_PATH = /^\/v1\/dev\/webhook-receiver\/[A-Za-z0-9_-]{1,100}$/;
const DNS_TIMEOUT_MS = 3_000;

/**
 * The app's own built-in receiver (review m1): the parsed URL must have exactly API_PUBLIC_URL's origin, no
 * credentials, query or fragment, and a normalised path matching RECEIVER_PATH — so `..`, `%2F` or extra
 * segments can never turn the exemption into "any path on the API's origin".
 */
export function isOwnReceiver(url: string, apiPublicUrl: string): boolean {
  let u: URL;
  let api: URL;
  try {
    u = new URL(url);
    api = new URL(apiPublicUrl);
  } catch {
    return false;
  }
  if (u.origin !== api.origin || u.username || u.password || u.search || u.hash) return false;
  // `new URL` resolves dot segments; also refuse anything that was not already in normal form.
  if (/(^|\/)\.\.?(\/|$)|%2e|%2f|%5c/i.test(url.slice(u.origin.length))) return false;
  return RECEIVER_PATH.test(u.pathname);
}

/** WEBHOOK_ALLOW_PRIVATE is a local/test switch: always ignored in production (review m3, re-review N1). The own demo
 *  receiver is allowed separately by isOwnReceiver, so production demo tenants never need private egress. */
export function allowPrivateFor(e: { WEBHOOK_ALLOW_PRIVATE?: string; NODE_ENV: string }, tenantDemoMode: boolean): boolean {
  void tenantDemoMode;
  return e.WEBHOOK_ALLOW_PRIVATE === 'true' && e.NODE_ENV !== 'production';
}

export interface EgressPolicy {
  /** WEBHOOK_ALLOW_PRIVATE=true (local / test only). */
  allowPrivate: boolean;
  /** The URL is the own demo receiver and the receiver is enabled for this tenant. */
  ownReceiver: boolean;
}
const exempt = (p: EgressPolicy) => p.allowPrivate || p.ownReceiver;

/** Create/update check: scheme, then every address the host resolves to. Throws 422 WEBHOOK_URL_FORBIDDEN. */
export async function assertWebhookUrl(url: string, policy: EgressPolicy): Promise<void> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw forbidden('Not a valid URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw forbidden(`scheme ${u.protocol}`);
  if (u.username || u.password) throw forbidden('credentials in URL');
  if (exempt(policy)) return;
  const host = hostOf(u);
  if (isIP(host)) {
    if (isForbiddenAddress(host)) throw forbidden(`literal ${host}`);
    return;
  }
  let addrs: dns.LookupAddress[];
  try {
    addrs = await Promise.race([
      dns.promises.lookup(host, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('DNS timeout')), DNS_TIMEOUT_MS)),
    ]);
  } catch (e) {
    throw forbidden(`${host}: ${(e as Error).message}`);
  }
  const bad = addrs.find((a) => isForbiddenAddress(a.address));
  if (bad) throw forbidden(`${host} → ${bad.address}`);
}

/** Stored on the attempt and shown to admins: generic, no addresses (review m4). */
const BLOCKED = 'Blocked: destination is not a public address (SSRF guard)';

/** `lookup` for http(s).request that refuses forbidden addresses at connect time (no TOCTOU window). */
const guardedLookup: LookupFunction = (hostname, options, cb) => {
  dns.lookup(hostname, { ...options, all: true, verbatim: true }, (err, addrs) => {
    if (err) return cb(err, '', 4);
    const list = addrs as unknown as dns.LookupAddress[];
    const bad = list.find((a) => isForbiddenAddress(a.address));
    if (bad) {
      log.warn({ host: hostname, address: bad.address }, 'webhook delivery blocked at connect time');
      return cb(Object.assign(new Error(BLOCKED), { code: 'EBLOCKED' }), '', 4);
    }
    if ((options as { all?: boolean }).all) return (cb as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    cb(null, list[0].address, list[0].family);
  });
};

/** One POST, no redirects, total timeout, response text capped. Guarded unless the policy exempts the URL. */
export function postWebhook(url: string, headers: Record<string, string>, body: string, opts: { timeoutMs: number; policy: EgressPolicy; maxResponseChars?: number }): Promise<{ status: number; text: string }> {
  const u = new URL(url);
  const guard = !exempt(opts.policy);
  const host = hostOf(u);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return Promise.reject(new Error(`Blocked: unsupported scheme ${u.protocol}`));
  if (guard && isIP(host) && isForbiddenAddress(host)) return Promise.reject(new Error(BLOCKED));
  const cap = opts.maxResponseChars ?? 2000;
  return new Promise((resolve, reject) => {
    const req = (u.protocol === 'https:' ? https : http).request(
      u,
      { method: 'POST', headers: { ...headers, 'Content-Length': String(Buffer.byteLength(body)) }, ...(guard ? { lookup: guardedLookup } : {}) },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => {
          if (text.length < cap) text += c.slice(0, cap - text.length);
        });
        res.on('end', () => {
          clearTimeout(timer);
          resolve({ status: res.statusCode ?? 0, text });
        });
        res.on('error', (e) => {
          clearTimeout(timer);
          reject(e);
        });
      },
    );
    const timer = setTimeout(() => req.destroy(Object.assign(new Error(`Timed out after ${opts.timeoutMs / 1000}s`), { name: 'TimeoutError' })), opts.timeoutMs);
    req.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    req.end(body);
  });
}

