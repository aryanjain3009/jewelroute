import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../env';

export const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
export const hmacHex = (key: string, s: string) => createHmac('sha256', key).update(s).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** AES-256-GCM with APP_ENCRYPTION_KEY. Format: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function encryptSecret(plain: string): string {
  const key = Buffer.from(env().APP_ENCRYPTION_KEY, 'base64');
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, ct] = blob.split('.');
  if (v !== 'v1') throw new Error('Unknown secret format');
  const key = Buffer.from(env().APP_ENCRYPTION_KEY, 'base64');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}

export const newWebhookSecret = () => `whsec_${randomBytes(32).toString('base64url')}`;

/** Documented signature scheme: sha256=<hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)>. */
export const signWebhook = (secret: string, timestamp: number | string, rawBody: string) => `sha256=${hmacHex(secret, `${timestamp}.${rawBody}`)}`;

/** Retailer ack code: HMAC(APP_SECRET, memoId:token) mod 10^6, zero-padded. Never stored in plain text. */
export function ackCode(memoId: string, token: string): string {
  const h = createHmac('sha256', env().APP_SECRET).update(`${memoId}:${token}`).digest();
  return String(h.readUIntBE(0, 6) % 1_000_000).padStart(6, '0');
}
export const ackCodeHash = (memoId: string, code: string) => hmacHex(env().APP_SECRET, `ackcode:${memoId}:${code}`);
