/* Manager-side E2E helpers: writes through the web proxy with the page's cookies, field-agent writes
 * with an Idempotency-Key, the dispatcher cron, and read-only/time-travel SQL against the stack's own
 * database (DATABASE_URL from apps/api/.env — run only against a disposable local database). */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { API, WEB } from "./helpers";

function envVar(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const env = readFileSync(join(__dirname, "../../api/.env"), "utf8");
  const line = env.split("\n").find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} not set and not found in apps/api/.env`);
  return line.slice(name.length + 1).trim();
}

/** psql against the stack's database; returns rows as arrays of strings ('|'-separated columns). */
export function sql(query: string): string[][] {
  const url = process.env.E2E_DATABASE_URL ?? envVar("DATABASE_URL");
  const out = execFileSync("psql", [url, "-At", "-F", "|", "-c", query], { encoding: "utf8" });
  return out.split("\n").filter(Boolean).map((l) => l.split("|"));
}

/** Run the dispatcher now (fan-out + due deliveries), exactly as Vercel Cron does. */
export async function dispatch(request: APIRequestContext) {
  const r = await request.post(`${API}/v1/internal/dispatch`, { headers: { "x-cron-secret": envVar("CRON_SECRET") } });
  expect(r.status(), "dispatch").toBeLessThan(300);
  return (await r.json()).data;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper: callers pick the shape
export async function write<T = any>(req: APIRequestContext, method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown, opts: { idempotent?: boolean; expectStatus?: number } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.idempotent) headers["Idempotency-Key"] = randomUUID();
  const r = await req.fetch(`${WEB}/api${path}`, { method, data: body, headers });
  const json = await r.json().catch(() => null);
  if (opts.expectStatus) expect(r.status(), `${method} ${path}: ${JSON.stringify(json)}`).toBe(opts.expectStatus);
  else expect(r.ok(), `${method} ${path} → ${r.status()} ${JSON.stringify(json)}`).toBeTruthy();
  return json?.data as T;
}

/** Same as helpers.api but for any context's request (e.g. a field agent's). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
export async function get<T = any>(req: APIRequestContext, path: string): Promise<T> {
  const r = await req.get(`${WEB}/api${path}`);
  expect(r.ok(), `GET ${path} → ${r.status()}`).toBeTruthy();
  return (await r.json()).data as T;
}

/** Hover a DataTable row containing `text` and open its side-sheet preview. */
export async function previewRow(page: Page, text: string | RegExp) {
  const row = page.locator("tbody tr").filter({ hasText: text }).first();
  // Hover the sticky first cell (where the preview icon lives): an open preview panel covers the right side.
  await row.locator("td").first().hover();
  await row.getByRole("button", { name: "Preview record" }).click();
  return page.getByRole("complementary", { name: "Record preview" });
}
