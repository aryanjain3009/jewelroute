/* Test harness: migrates + seeds the TEST database, boots the compiled API on a spare port, and
 * offers small HTTP helpers. Uses TEST_DATABASE_URL (default: local jewelroute_test). */
import { ChildProcess, execSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { PrismaClient } from '../generated/prisma';

const root = join(__dirname, '..');
try {
  process.loadEnvFile?.(join(root, '.env'));
} catch {
  /* CI provides env */
}

export const PORT = Number(process.env.TEST_PORT ?? 4107);
export const BASE = `http://127.0.0.1:${PORT}`;
const DB = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/jewelroute_test';
export const ENV = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: DB,
  DATABASE_URL_DIRECT: DB,
  PORT: String(PORT),
  API_PUBLIC_URL: BASE,
  LOG_LEVEL: 'warn',
  BLOB_READ_WRITE_TOKEN: '',
  CRON_SECRET: process.env.CRON_SECRET ?? 'test-cron-secret-123',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-0123456789',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-0123456789',
  APP_SECRET: process.env.APP_SECRET ?? 'test-app-secret-0123456789',
  APP_ENCRYPTION_KEY: process.env.APP_ENCRYPTION_KEY ?? Buffer.alloc(32, 7).toString('base64'),
  // Test receivers listen on 127.0.0.1; the SSRF guard is exercised by test/egress.test.ts with this off.
  WEBHOOK_ALLOW_PRIVATE: 'true',
  TRUST_PROXY: '',
};
process.env.DATABASE_URL = DB;

export const db = new PrismaClient({ datasources: { db: { url: DB } } });
let server: ChildProcess | undefined;

/** Server stdout (request logs) when started with `{ captureLogs: true }`. */
export const serverLog: string[] = [];

/** `extra` overrides the server's environment for one test file (e.g. WEBHOOK_ALLOW_PRIVATE off). */
export async function start(extra: NodeJS.ProcessEnv = {}, opts: { captureLogs?: boolean } = {}) {
  execSync('npx prisma migrate deploy', { cwd: root, env: ENV, stdio: 'pipe' });
  execSync('npx tsx prisma/seed.ts', { cwd: root, env: ENV, stdio: 'pipe' });
  server = spawn(process.execPath, ['dist/main.js'], { cwd: root, env: { ...ENV, ...extra }, stdio: ['ignore', opts.captureLogs ? 'pipe' : 'ignore', 'inherit'] });
  server.stdout?.on('data', (c: Buffer) => serverLog.push(c.toString('utf8')));
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${BASE}/v1/health`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('API did not start');
}

export async function stop() {
  // Wait for the API to exit so the next test file's server never races a shutting-down one on the same port.
  if (server && server.exitCode === null) {
    const exited = new Promise((r) => server!.once('exit', r));
    server.kill('SIGTERM');
    await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
    if (server.exitCode === null) server.kill('SIGKILL');
  }
  await db.$disconnect();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type J = any;
export async function api(token: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as J;
  return { status: res.status, json, data: json.data as J, error: json.error as J };
}

export async function login(email: string, password: string): Promise<string> {
  const r = await api(null, 'POST', '/v1/auth/login', { email, password });
  if (r.status !== 200) throw new Error(`login ${email} failed: ${JSON.stringify(r.json)}`);
  return r.data.accessToken;
}

export const north = (lat: number, m: number) => lat + m / 111_320;
export const dispatch = () => api(null, 'POST', '/v1/internal/dispatch', {}, { 'x-cron-secret': ENV.CRON_SECRET! });

/** Arrival photo through the real direct-upload path (token → bytes → attach). Selling needs one. */
export async function uploadProof(token: string, visitId: string, lat: number, lng: number) {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`proof ${visitId} ${randomUUID()}`), Buffer.from([0xff, 0xd9])]);
  const sha = createHash('sha256').update(jpeg).digest('hex');
  const tok = await api(token, 'POST', '/v1/uploads/proof-token', { visitId, contentType: 'image/jpeg', sizeBytes: jpeg.length });
  if (tok.status !== 201) throw new Error(`proof-token ${tok.status}: ${JSON.stringify(tok.json)}`);
  const fd = new FormData();
  fd.append('pathname', tok.data.pathname);
  fd.append('file', new Blob([jpeg], { type: 'image/jpeg' }), 'p.jpg');
  const up = (await fetch(`${BASE}/v1/uploads/direct`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd }).then((r) => r.json())) as J;
  if (!up.ok) throw new Error(`direct upload: ${JSON.stringify(up)}`);
  const pr = await api(token, 'POST', `/v1/visits/${visitId}/proofs`, { objectKey: up.data.objectKey, url: up.data.url, contentType: 'image/jpeg', sizeBytes: jpeg.length, checksumSha256: sha, captureLat: lat, captureLng: lng }, { 'Idempotency-Key': randomUUID() });
  if (pr.status !== 201) throw new Error(`proof ${pr.status}: ${JSON.stringify(pr.json)}`);
  return pr.data;
}
