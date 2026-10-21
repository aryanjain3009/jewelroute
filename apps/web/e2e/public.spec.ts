/* Public pages other than the landing page: /developers, the /login demo choice, and the retailer's
 * /ack/[token] receipt. Runs in the `field` project (phone, 390 px) against a running stack; reseeds
 * the demo tenant, creates real memos through the API as Rahul, and checks state through the API.
 *   E2E_WEB=http://localhost:3301 E2E_API=http://localhost:4301 pnpm exec playwright test --project field public */
import { randomUUID } from "node:crypto";
import { test, expect, type APIRequestContext, type Browser } from "@playwright/test";
import { EVENT_DESCRIPTIONS, WEBHOOK_EVENT_TYPES } from "@jewelroute/shared";
import { sql } from "./admin-helpers";
import { RAHUL, WEB, login, reseed, watch } from "./helpers";

test.beforeAll(async ({ request }) => { await reseed(request); });

/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads in tests */
async function call(req: APIRequestContext, method: "GET" | "POST", path: string, data?: unknown, headers: Record<string, string> = {}): Promise<any> {
  const r = await req.fetch(`${WEB}/api${path}`, { method, data, headers });
  const json = await r.json().catch(() => null);
  expect(r.ok(), `${method} ${path} → ${r.status()} ${JSON.stringify(json)}`).toBeTruthy();
  return json.data;
}

/** A real memo of `n` pieces left by Rahul at Sharma Jewellers today; returns its retailer token. */
async function memoToken(browser: Browser, n: number) {
  const ctx = await browser.newContext();
  await login(ctx, RAHUL);
  const req = ctx.request;
  const today = await call(req, "GET", "/v1/field/today");
  const v = today.visits.find((x: any) => x.shop.name === "Sharma Jewellers");
  let visit = await call(req, "GET", `/v1/visits/${v.id}`);
  const shop = visit.visit.shop;
  const at = { lat: shop.lat + 30 / 111_320, lng: shop.lng, accuracyM: 12 };
  if (visit.visit.status === "PLANNED") await call(req, "POST", `/v1/visits/${v.id}/check-in`, at, { "Idempotency-Key": randomUUID() });
  visit = await call(req, "GET", `/v1/visits/${v.id}`);
  if (!visit.proofs.length) {
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`public spec ${randomUUID()}`), Buffer.from([0xff, 0xd9])]);
    const sha = (await import("node:crypto")).createHash("sha256").update(jpeg).digest("hex");
    const tok = await call(req, "POST", "/v1/uploads/proof-token", { visitId: v.id, contentType: "image/jpeg", sizeBytes: jpeg.length });
    const up = await req.post(`${WEB}/api/v1/uploads/direct`, { multipart: { pathname: tok.pathname, file: { name: "arrival.jpg", mimeType: "image/jpeg", buffer: jpeg } } });
    const u = (await up.json()).data;
    await call(req, "POST", `/v1/visits/${v.id}/proofs`, { objectKey: u.objectKey, url: u.url, contentType: "image/jpeg", sizeBytes: jpeg.length, checksumSha256: sha, capturedAt: new Date().toISOString(), captureLat: at.lat, captureLng: at.lng }, { "Idempotency-Key": randomUUID() });
    visit = await call(req, "GET", `/v1/visits/${v.id}`);
  }
  const pieces = visit.bag.slice(0, n);
  const due = new Date(Date.now() + 5 * 864e5 + 5.5 * 36e5).toISOString().slice(0, 10);
  const mm = await call(req, "POST", "/v1/memos", { visitId: v.id, pieceIds: pieces.map((p: any) => p.id), dueDate: due }, { "Idempotency-Key": randomUUID() });
  await ctx.close();
  return { token: mm.ack.url.split("/ack/")[1] as string, number: mm.memo.number as string, tags: pieces.map((p: any) => p.tagCode as string) };
}

test("public: /developers documents every webhook event, the retry ladder and working anchors", async ({ page, context, request }) => {
  const w = watch(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: WEB });
  await page.goto("/developers");
  await expect(page.getByRole("heading", { level: 1, name: "JewelRoute API and webhooks" })).toBeVisible();

  // Phone navigation: "On this page" opens the grouped list; picking a section closes it and scrolls there.
  await page.getByRole("button", { name: /On this page/ }).click();
  const menu = page.getByRole("dialog");
  for (const g of ["Overview", "Concepts", "Orders", "Webhooks", "Reference"]) await expect(menu.getByText(g, { exact: true })).toBeVisible();
  await menu.getByRole("link", { name: "Event catalogue" }).click();
  await expect(page).toHaveURL(/#events$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Every event from the shared catalogue, with its description; one opens to its real payload.
  const events = page.locator("#events");
  for (const t of [...WEBHOOK_EVENT_TYPES, "ping" as const]) {
    await expect(events.locator("button[data-state]").getByText(t, { exact: true })).toBeVisible();
    await expect(events.getByText(EVENT_DESCRIPTIONS[t], { exact: true })).toBeVisible();
  }
  await events.getByRole("button", { name: /order\.pending_approval/ }).click();
  await expect(events.getByText('"order.pending_approval"').first()).toBeVisible();
  await expect(events.getByText('"CREDIT_LIMIT"').first()).toBeVisible();

  // Retry ladder: 30 s, 2 min, 10 min, 30 min, 2 h, 6 h, then a dead letter.
  const retries = page.locator("#retries");
  for (const step of ["Immediately", "+30 s", "+2 min", "+10 min", "+30 min", "+2 h", "+6 h", "Dead letter"]) await expect(retries.getByText(step, { exact: true })).toBeVisible();

  // Copy buttons copy the code and say so.
  const copy = page.locator("#signatures").getByRole("button", { name: "Copy code" }).last();
  await copy.click();
  await expect(page.locator("#signatures").getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("X-JewelRoute-Signature");

  // Every in-page anchor has a target; every other link resolves.
  const hrefs = await page.evaluate(() => [...new Set([...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")!))]);
  for (const href of hrefs) {
    if (href.startsWith("#")) { await expect(page.locator(href), `anchor ${href}`).toHaveCount(1); continue; }
    const url = new URL(href, page.url());
    expect(url.origin, `${href} stays on site`).toBe(new URL(WEB).origin);
    const res = await request.get(url.pathname, { maxRedirects: 0 });
    expect([200, 307], `GET ${url.pathname} → ${res.status()}`).toContain(res.status());
  }
  w.assertClean();
});

test("public: /login makes the demo choice obvious — Rahul on a phone, Priya on a laptop", async ({ page, browser }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1, name: "Sign in to JewelRoute" })).toBeVisible();
  // The real form is still there, with the labels the auth specs use.
  await expect(page.getByLabel(/email/i)).toHaveCount(1);
  await expect(page.getByLabel(/password/i)).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
  // Phone: two clear rows, Rahul first.
  const rahul = page.getByRole("button", { name: "Continue as Rahul Verma, field agent" });
  await expect(rahul).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue as Priya Mehta, manager" })).toBeVisible();
  await rahul.click();
  await expect(page).toHaveURL(/\/field\/today$/, { timeout: 45_000 });

  // Laptop: two cards with live previews; Priya lands on the manager Home.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p2 = await ctx.newPage();
  await p2.goto(`${WEB}/login`);
  await expect(p2.getByRole("heading", { name: "Explore JewelRoute as Rahul or Priya." })).toBeVisible();
  await expect(p2.getByText("Built for a phone")).toBeVisible();
  await expect(p2.getByText("Built for a laptop")).toBeVisible();
  await p2.getByRole("button", { name: "Continue as Priya Mehta, manager" }).click();
  await expect(p2).toHaveURL(/\/admin$/, { timeout: 45_000 });
  await ctx.close();
});

test("public: /ack/[token] — pending receipt, one confirm, a lasting receipt; invalid and expired links explain themselves", async ({ browser }) => {
  test.setTimeout(120_000);
  const memo = await memoToken(browser, 2);
  const retailer = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  const w = watch(retailer);
  await retailer.goto(`${WEB}/ack/${memo.token}`);
  await expect(retailer.getByRole("heading", { level: 1, name: "Confirm you've received 2 pieces" })).toBeVisible();
  await expect(retailer.getByText(`Memo ${memo.number}`)).toBeVisible();
  for (const tag of memo.tags) await expect(retailer.getByText(tag, { exact: true })).toBeVisible();
  await expect(retailer.getByText(/^\d{3} \d{3}$/)).toBeVisible();
  await expect(retailer.getByText("Sharma Jewellers").first()).toBeVisible();

  const confirm = retailer.getByRole("button", { name: "Confirm receipt of 2 pieces" });
  await expect(confirm).toBeInViewport();
  await confirm.click();
  await expect(retailer.getByRole("heading", { level: 1, name: "Receipt confirmed" })).toBeVisible();
  const pub = await (await retailer.request.get(`${WEB}/api/v1/public/memo-ack/${memo.token}`)).json();
  expect(pub.data.ackStatus).toBe("ACKNOWLEDGED");

  // Already acknowledged: the link keeps showing the receipt, never the confirm button again.
  await retailer.reload();
  await expect(retailer.getByRole("heading", { level: 1, name: "Receipt confirmed" })).toBeVisible();
  await expect(retailer.getByRole("button", { name: /Confirm receipt/ })).toHaveCount(0);
  for (const tag of memo.tags) await expect(retailer.getByRole("region", { name: "Receipt" }).getByText(tag, { exact: true })).toBeVisible();

  // Invalid token.
  await retailer.goto(`${WEB}/ack/not-a-real-token-zzzzzzzz`);
  await expect(retailer.getByRole("heading", { level: 1, name: "This link isn't valid" })).toBeVisible();

  // Expired link (72 h): moved into the past on this disposable database.
  const old = await memoToken(browser, 1);
  sql(`update "Memo" set "ackTokenExpiresAt" = now() - interval '1 hour' where number = '${old.number}'`);
  await retailer.goto(`${WEB}/ack/${old.token}`);
  await expect(retailer.getByRole("heading", { level: 1, name: "This link has expired" })).toBeVisible();
  await expect(retailer.getByRole("button", { name: /Confirm receipt/ })).toHaveCount(0);

  // Only the expected 404/410 answers for the invalid and expired links.
  const unexpected = w.problems.filter((p) => !/status of 4(04|10)/.test(p));
  expect(unexpected, unexpected.join("\n")).toEqual([]);
});
