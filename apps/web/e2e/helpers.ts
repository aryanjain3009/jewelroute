/* Shared helpers for browser E2E. Persisted state is checked through the API with the same cookies
 * the page uses, never by trusting what the page shows. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

export const WEB = process.env.E2E_WEB ?? "http://localhost:3000";
export const API = process.env.E2E_API ?? "http://localhost:4000";
export const RAHUL = { email: "rahul@aurum.test", password: "Rahul@2026" };
export const PRIYA = { email: "admin@aurum.test", password: "Aurum@2026" };

function cronSecret(): string {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  const env = readFileSync(join(__dirname, "../../api/.env"), "utf8");
  const line = env.split("\n").find((l) => l.startsWith("CRON_SECRET="));
  if (!line) throw new Error("CRON_SECRET not set and not found in apps/api/.env");
  return line.slice("CRON_SECRET=".length).trim();
}

/** Fresh Aurum demo data. */
export async function reseed(request: APIRequestContext) {
  const r = await request.post(`${API}/v1/internal/seed`, { headers: { "x-cron-secret": cronSecret() } });
  expect(r.status(), "reseed").toBeLessThan(300);
}

/** Sign in through the web origin so the httpOnly cookies land on the page's context.
 *  The API caps sign-ins per IP + email (10/min); on 429 wait out Retry-After instead of failing. */
export async function login(ctx: BrowserContext, who: { email: string; password: string }) {
  for (let i = 0; ; i++) {
    const r = await ctx.request.post(`${WEB}/api/v1/auth/login`, { data: who });
    if (r.status() === 429 && i < 2) { await new Promise((res) => setTimeout(res, (Number(r.headers()["retry-after"] ?? 30) + 1) * 1000)); continue; }
    expect(r.status(), `login ${who.email}`).toBe(200);
    return;
  }
}

/** Sign in with the real form (fills, submits, waits to leave /login). Waits out the sign-in rate limit. */
export async function formLogin(page: Page, who: { email: string; password: string }) {
  for (let i = 0; ; i++) {
    await page.getByLabel(/email/i).fill(who.email);
    await page.getByLabel(/password/i).fill(who.password);
    const res = page.waitForResponse((r) => r.url().endsWith("/api/v1/auth/login"));
    await page.getByRole("button", { name: /^sign in$/i }).click();
    const r = await res;
    if (r.status() === 429 && i < 2) { await page.waitForTimeout((Number(r.headers()["retry-after"] ?? 30) + 1) * 1000); continue; }
    expect(r.status(), `form login ${who.email}`).toBe(200);
    await expect(page).not.toHaveURL(/\/login/);
    return;
  }
}

/** GET through the web proxy with the page's cookies; returns `data`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper: callers pick the shape
export async function api<T = any>(page: Page, path: string): Promise<T> {
  const r = await page.request.get(`${WEB}/api${path}`);
  expect(r.ok(), `GET ${path} → ${r.status()}`).toBeTruthy();
  return (await r.json()).data as T;
}

/** Collect console errors and 5xx responses; assert none at the end of a test. */
export function watch(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && !/font|glyph|\.pbf|tiles/i.test(m.text())) problems.push(`console: ${m.text()}`); });
  page.on("response", (r) => { if (r.status() >= 500) problems.push(`${r.status()} ${r.request().method()} ${r.url()}`); });
  return { problems, assertClean: () => expect(problems, problems.join("\n")).toEqual([]) };
}
