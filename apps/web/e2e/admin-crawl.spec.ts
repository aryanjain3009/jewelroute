/* Crawler: the reachable routes as the manager (laptop), the field agent (phone), a visitor and a brand-new
 * owner of an empty workspace, following same-origin links breadth first (at most 2 pages per route pattern,
 * 70 pages per role) and pressing up to 40 non-destructive controls per page (tabs, menus, dialogs, sheets,
 * toggles, filters). The retailer /ack/[token] pages are covered by public.spec.ts, not here. Fails on any 4xx/5xx from the API, any console error, any page that crashes or renders
 * Next's error page. Writes a receipt to docs/overnight/crawl-<who>.json.
 *   E2E_WEB=… E2E_API=… pnpm exec playwright test e2e/admin-crawl.spec.ts --project admin */
import { writeFileSync, mkdirSync } from "node:fs";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { PRIYA, RAHUL, WEB, login, reseed } from "./helpers";

// Never pressed: anything that writes, signs out or leaves the app. Dialog submit buttons are covered by
// the flow specs; here a dialog is opened, checked and closed.
const UNSAFE = /sign ?out|log ?out|delete|deactivate|reactivate|reject|approve|settle|cancel order|cancel visit|unassign|rotate|reveal|retry|resend|send test|confirm|complete|check in|simulate|save|create|issue|return|extend|book|place order|send for approval|leave .*memo|convert|upload|take .*photo|add to|remove|reset|set rate|submit|continue as|copy|mark|assign$|^assign |remind|enable|disable|archive|export|download|print/i;
const MAX_PER_PATTERN = 2;
const MAX_PAGES = 70;

interface Receipt { who: string; pages: string[]; controls: number; failures: string[] }

/** Pages that differ only by record id count as one pattern; a `?tab=` is its own page. */
const pattern = (path: string) => {
  const tab = /[?&]tab=([\w-]+)/.exec(path)?.[1];
  return path.replace(/\/(c[a-z0-9]{20,}|pc_[A-Za-z0-9]+|[0-9a-f-]{20,}|evt_[A-Za-z0-9]+)/g, "/:id").replace(/\?.*$/, "") + (tab ? `?tab=${tab}` : "");
};

async function crawl(page: Page, who: string, starts: string[], area: RegExp): Promise<Receipt> {
  const failures: string[] = [];
  let current = "";
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/font|glyph|\.pbf|tiles|maplibre|webgl/i.test(t)) return; // map tiles from the public tile server
    failures.push(`console on ${current}: ${t.slice(0, 300)}`);
  });
  page.on("pageerror", (e) => failures.push(`pageerror on ${current}: ${e.message.slice(0, 300)}`));
  page.on("response", (r) => {
    const u = r.url();
    if (!u.includes("/api/v1/") || r.status() < 400) return;
    // A visitor without a session may get 401 from the session probe; nothing else is allowed.
    if (who === "visitor" && r.status() === 401 && /\/auth\/(me|refresh)/.test(u)) return;
    failures.push(`${r.status()} ${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, "")} on ${current}`);
  });

  const queue = [...starts];
  const seen = new Set<string>();
  const perPattern = new Map<string, number>();
  const pages: string[] = [];
  let controls = 0;

  while (queue.length && pages.length < MAX_PAGES) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    const p = pattern(url);
    if ((perPattern.get(p) ?? 0) >= MAX_PER_PATTERN) continue;
    perPattern.set(p, (perPattern.get(p) ?? 0) + 1);
    current = url;
    const res = await page.goto(url, { waitUntil: "domcontentloaded" });
    if (!res || res.status() >= 400) failures.push(`HTTP ${res?.status()} for ${url}`);
    // Live screens poll, so "networkidle" may never come; give each page a short settle instead.
    await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => {});
    if (await page.getByText(/Application error|Unhandled Runtime Error|This page could not be found/i).count()) failures.push(`error page at ${url}`);
    pages.push(url);

    for (const href of await page.locator("a[href^='/']").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""))) {
      const clean = href.split("#")[0];
      if (clean && area.test(clean) && !seen.has(clean) && !/\.(png|jpg|svg|pdf)$/.test(clean) && !clean.startsWith("/api/")) queue.push(clean);
    }

    // Press every safe control once: tabs, menus, popovers, dialogs, sheets, toggles. Close and go on.
    const buttons = page.locator("main button:visible, main [role=tab]:visible, header button:visible, [role=combobox]:visible");
    const n = Math.min(await buttons.count(), 40);
    for (let i = 0; i < n; i++) {
      const b = buttons.nth(i);
      const label = ((await b.getAttribute("aria-label").catch(() => null)) ?? (await b.innerText().catch(() => "")) ?? "").trim().replace(/\s+/g, " ");
      if (!label || UNSAFE.test(label) || (await b.isDisabled().catch(() => true)) || (await b.getAttribute("type").catch(() => null)) === "submit") continue;
      const before = page.url();
      try {
        await b.click({ timeout: 2_000 });
        controls++;
        await page.waitForTimeout(150);
        await page.keyboard.press("Escape").catch(() => {});
        if (page.url() !== before) {
          const now = new URL(page.url());
          if (now.pathname !== new URL(before).pathname && area.test(now.pathname)) queue.push(now.pathname + now.search);
          await page.goto(before, { waitUntil: "domcontentloaded" });
          await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => {});
        }
      } catch {
        /* covered by an overlay or detached after a re-render: not a failure */
      }
    }
  }
  return { who, pages, controls, failures };
}

function write(r: Receipt) {
  mkdirSync("../../docs/overnight", { recursive: true });
  writeFileSync(`../../docs/overnight/crawl-${r.who}.json`, JSON.stringify({ ...r, at: new Date().toISOString() }, null, 2));
}

async function asUser(browser: Browser, who: { email: string; password: string }, mobile: boolean) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, geolocation: { latitude: 28.6519, longitude: 77.1907, accuracy: 12 }, permissions: ["geolocation"] } : { viewport: { width: 1440, height: 900 } });
  await login(ctx, who);
  return ctx;
}

test.describe.configure({ mode: "serial" });
test.setTimeout(1_500_000); // ~70 pages × up to 40 controls for the manager
test.beforeAll(async ({ request }) => { await reseed(request); });

test("crawl as the manager: every admin route and safe control, no errors", async ({ browser }) => {
  const ctx = await asUser(browser, PRIYA, false);
  const r = await crawl(await ctx.newPage(), "manager", ["/admin", "/admin/visits", "/admin/agents", "/admin/shops", "/admin/orders", "/admin/memos", "/admin/samples", "/admin/catalog", "/admin/integrations", "/admin/settings", "/admin/settings?tab=approvals", "/admin/settings?tab=workspace"], /^\/admin(\/|\?|$)/);
  write(r);
  expect(r.pages.length).toBeGreaterThan(15);
  expect(r.failures, r.failures.join("\n")).toEqual([]);
  await ctx.close();
});

test("crawl as a new owner: an empty workspace from signup, every admin route and empty state, no errors", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const run = Math.random().toString(36).slice(2, 8);
  const r0 = await ctx.request.post(`${WEB}/api/v1/auth/signup`, { data: { workspaceName: `Empty Crawl ${run}`, name: "New Owner", email: `owner-${run}@crawl.test`, password: "Owner@2026" } });
  expect(r0.status()).toBe(201);
  const r = await crawl(await ctx.newPage(), "owner-empty", ["/admin", "/admin/visits", "/admin/agents", "/admin/shops", "/admin/orders", "/admin/memos", "/admin/samples", "/admin/catalog", "/admin/integrations", "/admin/settings", "/admin/settings?tab=approvals", "/admin/settings?tab=workspace"], /^\/admin(\/|\?|$)/);
  write(r);
  expect(r.failures, r.failures.join("\n")).toEqual([]);

  // Their first agent, before any route or bag: every field screen in its empty state.
  const agent = { email: `agent-${run}@crawl.test`, password: "Agent@2026" };
  expect((await ctx.request.post(`${WEB}/api/v1/admin/agents`, { data: { name: "First Agent", ...agent } })).status()).toBe(201);
  const phone = await asUser(browser, agent, true);
  const f = await crawl(await phone.newPage(), "agent-empty", ["/field/today", "/field/visits", "/field/catalog", "/field/profile"], /^\/field(\/|\?|$)/);
  write(f);
  expect(f.failures, f.failures.join("\n")).toEqual([]);
  await phone.close();
  await ctx.close();
});

test("crawl as the field agent: every field route and safe control, no errors", async ({ browser }) => {
  const ctx = await asUser(browser, RAHUL, true);
  // Start at the sale workspace too (it is reached by a button, not a link).
  const today = (await (await ctx.request.get(`${WEB}/api/v1/field/today`)).json()).data;
  const sale = today.visits.map((v: { id: string }) => `/field/visits/${v.id}/sale`).slice(0, 1);
  const r = await crawl(await ctx.newPage(), "agent", ["/field/today", "/field/visits", "/field/catalog", "/field/profile", ...sale], /^\/field(\/|\?|$)/);
  write(r);
  expect(r.pages.length).toBeGreaterThan(5);
  expect(r.failures, r.failures.join("\n")).toEqual([]);
  await ctx.close();
});

test("crawl as a visitor: public pages and their controls, no errors", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const r = await crawl(await ctx.newPage(), "visitor", ["/", "/login", "/signup", "/developers"], /^\/(developers|login|signup)?(\?|$)/);
  write(r);
  expect(r.failures, r.failures.join("\n")).toEqual([]);
  await ctx.close();
});
