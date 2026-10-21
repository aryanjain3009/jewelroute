/* Rahul's whole visit at phone width, clicking through the real UI, with every mutation checked against
 * persisted state through the API (Rahul's own reads, and Priya's admin reads in a second context). */
import { test, expect, type Browser, type Page } from "@playwright/test";
import { PRIYA, RAHUL, WEB, api, login, reseed, watch } from "./helpers";

const SHARMA = { latitude: 28.6519, longitude: 77.1907 };
const FAR = { latitude: 28.6600, longitude: 77.2100 }; // ~2 km away
// 8×8 PNG; decoded, re-encoded to JPEG and hashed by the page like a camera photo.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4scAGK2IYWhIAKi9pAXvb6WcAAAAASUVORK5CYII=", "base64");

/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are asserted field by field */
type Any = any;

async function rahulContext(browser: Browser, geo: { latitude: number; longitude: number } | null = SHARMA, perms = true) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    ...(geo ? { geolocation: { ...geo, accuracy: 12 } } : {}),
    permissions: perms ? ["geolocation"] : [],
  });
  await login(ctx, RAHUL);
  return ctx;
}
async function priyaPage(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(ctx, PRIYA);
  return ctx.newPage();
}
const today = (p: Page) => api<Any>(p, "/v1/field/today");
const visit = (p: Page, id: string) => api<Any>(p, `/v1/visits/${id}`);
async function sharma(p: Page) { return (await today(p)).visits.find((v: Any) => v.shop.name === "Sharma Jewellers"); }

/** Opens Sharma's visit from Today by clicking, like Rahul does. */
async function openSharmaFromToday(page: Page) {
  await page.goto("/field/today");
  // Sharma is the next stop: its row carries the primary "Open visit" / "Continue visit" button.
  await page.getByRole("link", { name: /^(Open|Continue) visit$/ }).first().click();
  await expect(page).toHaveURL(/\/field\/visits\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 2, name: "Sharma Jewellers" })).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => { await reseed(request); });

test("check-in: refused outside the fence, verified inside; nothing written on refusal", async ({ browser }) => {
  const ctx = await rahulContext(browser, FAR);
  const page = await ctx.newPage();
  const w = watch(page);
  await openSharmaFromToday(page);
  const v0 = await sharma(page);
  await expect(page.getByText("Outside the zone")).toBeVisible();
  await expect(page.getByRole("button", { name: "Check in", exact: true })).toBeDisabled();
  // Server refuses even if the client tried (direct call with the far position).
  const r = await page.request.post(`${WEB}/api/v1/visits/${v0.id}/check-in`, { data: { lat: FAR.latitude, lng: FAR.longitude, accuracyM: 12 }, headers: { "Idempotency-Key": crypto.randomUUID() } });
  expect(r.status()).toBe(409);
  expect((await r.json()).error.code).toBe("OUTSIDE_GEOFENCE");
  expect((await visit(page, v0.id)).visit.status).toBe("PLANNED");

  // Walk into the fence: the server verdict flips and Check in unlocks.
  await ctx.setGeolocation({ ...SHARMA, accuracy: 12 });
  await expect(page.getByText(/You.re at Sharma Jewellers/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Check in", exact: true }).click();
  await expect(page.getByText("Take or upload the arrival photo")).toBeVisible();
  const v1 = await visit(page, v0.id);
  expect(v1.visit.status).toBe("CHECKED_IN");
  expect(v1.visit.verification).toBe("VERIFIED");
  expect(v1.visit.checkInDistanceM).toBeLessThan(100);
  expect((await today(page)).openVisit?.id).toBe(v0.id);
  w.assertClean();
  await ctx.close();
});

test("check-in: denied location offers only the labelled simulated arrival", async ({ browser }) => {
  const ctx = await rahulContext(browser, null, false);
  const page = await ctx.newPage();
  await openSharmaFromToday(page);
  await expect(page.getByText("Location is blocked for JewelRoute")).toBeVisible();
  await page.getByRole("button", { name: /Simulate arrival \(demo\)/ }).first().click();
  await expect(page.getByText("Take or upload the arrival photo")).toBeVisible();
  const v = await sharma(page);
  expect(v.status).toBe("CHECKED_IN");
  expect(v.verification).toBe("SIMULATED");
  await page.reload();
  await expect(page.getByText(/simulated/i).first()).toBeVisible();
  await expect(page.getByText("Location verified")).toHaveCount(0);
  await ctx.close();
});

test("full visit: check-in → photo → order → memo → ack (link and code) → complete, every write persisted and fanned out", async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await rahulContext(browser);
  const page = await ctx.newPage();
  const w = watch(page);
  const priya = await priyaPage(browser);
  const pw = watch(priya);
  await priya.goto(`${WEB}/admin`);
  const metric = (label: string) => priya.locator("a", { has: priya.getByText(label, { exact: true }) });
  const home0 = await api<Any>(priya, "/v1/admin/home");
  const m0 = home0.metrics;
  await expect(metric("Visits completed")).toContainText(`${m0.visits.completed} / ${m0.visits.planned}`);

  // ---- check-in (real, verified)
  await openSharmaFromToday(page);
  const id: string = (await sharma(page)).id;
  await expect(page.getByText(/You.re at Sharma Jewellers/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Check in", exact: true }).click();
  await expect(page.getByText("Take or upload the arrival photo")).toBeVisible();
  expect((await visit(page, id)).visit.status).toBe("CHECKED_IN");
  await expect(metric("Visits completed")).toContainText(`${m0.visits.inProgress + 1} in progress`, { timeout: 15_000 }); // Home polls 10 s

  // ---- arrival photo: the attach fails once (500) → clear error, nothing written; Retry sends the same photo
  let attachKeys: string[] = [];
  await page.route("**/api/v1/visits/*/proofs", async (route) => {
    attachKeys.push(route.request().headers()["idempotency-key"]);
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "INTERNAL", message: "boom" } }) });
  });
  await page.getByTestId("proof-file").setInputFiles({ name: "shop.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("alert").filter({ hasText: /Retry sends the same file/ })).toBeVisible();
  expect((await visit(page, id)).proofs).toHaveLength(0);
  await page.unroute("**/api/v1/visits/*/proofs");
  w.problems.splice(0); // only the injected 500 so far
  page.on("request", (r) => { if (r.method() === "POST" && /\/visits\/[^/]+\/proofs$/.test(r.url())) attachKeys.push(r.headers()["idempotency-key"]); });
  await page.getByRole("button", { name: "Retry upload" }).click();
  await expect(page.getByRole("heading", { name: "Actions" }).or(page.getByText("Arrival photo", { exact: true }).first())).toBeVisible();
  await expect(page.getByRole("link", { name: /Create order/ })).toBeVisible();
  expect(new Set(attachKeys).size, "retry reuses the Idempotency-Key").toBe(1);
  const v2 = await visit(page, id);
  expect(v2.proofs).toHaveLength(1);
  expect(v2.visit.status).toBe("ACTIVE");
  attachKeys = [];
  await page.reload();
  await expect(page.getByRole("link", { name: /Create order/ })).toBeVisible();

  // ---- order: three lost responses → "couldn't confirm", nothing booked; Retry (same key) books exactly one
  await page.getByRole("link", { name: /Create order/ }).click();
  await expect(page).toHaveURL(new RegExp(`/field/visits/${id}/sale\\?mode=order`));
  await page.getByRole("button", { name: /to order$/ }).first().click();
  await page.getByRole("button", { name: "Review order" }).click();
  const orderKeys: string[] = [];
  await page.route("**/api/v1/orders", async (route) => {
    orderKeys.push(route.request().headers()["idempotency-key"]);
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "UNAVAILABLE", message: "down" } }) });
  });
  await page.getByRole("button", { name: /Place order|Send for approval/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "couldn't confirm the order" })).toBeVisible({ timeout: 15_000 });
  expect((await visit(page, id)).orders).toHaveLength(0);
  await page.unroute("**/api/v1/orders");
  w.problems.splice(0); // only the injected 503s so far
  page.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith("/api/v1/orders")) orderKeys.push(r.headers()["idempotency-key"]); });
  await page.getByRole("button", { name: /^Retry/ }).click();
  await expect(page.getByText(/Order confirmed|Sent to your manager for approval/).first()).toBeVisible();
  expect(new Set(orderKeys).size, "every order attempt carried the same key").toBe(1);
  const v3 = await visit(page, id);
  expect(v3.orders).toHaveLength(1);
  const order = v3.orders[0];
  // Admin record of the same order, and Home's order count, from Priya's session.
  const adminOrder = await api<Any>(priya, `/v1/admin/orders/${order.id}`);
  expect(adminOrder.order.totalPaise).toBe(order.totalPaise);
  expect(adminOrder.order.visitId ?? adminOrder.visit?.id).toBe(id);
  await expect(metric("Orders today")).toContainText(`${m0.ordersToday.count + 1} order`, { timeout: 15_000 });

  // Back to the visit it came from, with the order on the timeline (no reload).
  await page.getByRole("main").getByRole("link", { name: "Back to visit" }).click();
  await expect(page).toHaveURL(new RegExp(`/field/visits/${id}$`));
  await expect(page.getByText(`Order ${order.number} booked`)).toBeVisible();

  // ---- memo #1 → retailer confirms on their own phone (public link)
  const bag0 = v3.bag.length;
  await page.getByRole("link", { name: /Leave on memo/ }).click();
  await expect(page).toHaveURL(new RegExp(`/field/visits/${id}/sale\\?mode=memo`));
  await page.getByRole("checkbox").first().click();
  await page.getByRole("button", { name: "Review memo" }).click();
  await page.getByRole("button", { name: /Leave 1 piece on memo/ }).click();
  await expect(page.getByText("Ask the retailer to scan and confirm")).toBeVisible();
  const v4 = await visit(page, id);
  expect(v4.memosCreated).toHaveLength(1);
  const memo1 = v4.memosCreated[0];
  expect(v4.bag).toHaveLength(bag0 - 1);
  const piece1 = memo1.items[0].piece.id;
  const adminPiece = await api<Any>(priya, `/v1/admin/pieces/${piece1}`);
  expect(adminPiece.piece.custodianType).toBe("SHOP");
  const last = adminPiece.events.at(-1);
  expect(last.reason).toBe("MEMO_HANDOVER");
  expect(last.memo.number).toBe(memo1.number);
  expect(last.visit.id).toBe(id);
  expect(last.to.label).toBe("Sharma Jewellers");
  const ackUrl = await page.getByRole("link", { name: "Retailer page" }).getAttribute("href");
  expect(ackUrl).toMatch(/\/ack\//);
  const retailer = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await retailer.goto(new URL(new URL(ackUrl!).pathname, WEB).toString());
  await retailer.getByRole("button", { name: "Confirm receipt" }).click();
  await expect(retailer.getByText(/received|confirmed/i).first()).toBeVisible();
  await expect(page.getByText("Custody confirmed")).toBeVisible({ timeout: 15_000 }); // agent screen polls 3 s
  expect((await api<Any>(priya, `/v1/admin/memos/${memo1.id}`)).memo.ackStatus).toBe("ACKNOWLEDGED");
  await page.getByRole("main").getByRole("link", { name: "Back to visit" }).click();
  await expect(page).toHaveURL(new RegExp(`/field/visits/${id}$`));
  await expect(page.getByText(/Acknowledged/).first()).toBeVisible();

  // ---- memo #2 → the agent types the 6-digit code the retailer reads out
  await page.getByRole("link", { name: /Leave on memo/ }).click();
  await page.getByRole("checkbox").first().click();
  await page.getByRole("button", { name: "Review memo" }).click();
  await page.getByRole("button", { name: /Leave 1 piece on memo/ }).click();
  await expect(page.getByText("Ask the retailer to scan and confirm")).toBeVisible();
  const ack2 = await page.getByRole("link", { name: "Retailer page" }).getAttribute("href");
  const token = new URL(ack2!).pathname.split("/").pop();
  const pub = await (await page.request.get(`${WEB}/api/v1/public/memo-ack/${token}`)).json();
  const code: string = pub.data.code;
  expect(code).toMatch(/^\d{6}$/);
  await page.getByRole("textbox", { name: "Retailer code" }).fill(code);
  await expect(page.getByText("Custody confirmed")).toBeVisible();
  await expect(page.getByText(/code verified by you/)).toBeVisible();
  const v5 = await visit(page, id);
  expect(v5.memosCreated).toHaveLength(2);
  expect(v5.memosCreated.every((m: Any) => m.ackStatus === "ACKNOWLEDGED")).toBeTruthy();
  await page.getByRole("main").getByRole("link", { name: "Back to visit" }).click();

  // ---- complete → back on Today, which shows the visit done without a reload
  await page.getByRole("button", { name: "Complete visit" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Complete visit" }).click();
  await expect(page).toHaveURL(/\/field\/today$/);
  await expect(page.getByText(/1 of 4 visits completed/)).toBeVisible();
  const v6 = await visit(page, id);
  expect(v6.visit.status).toBe("COMPLETED");
  expect((await today(page)).openVisit ?? null).toBeNull();
  await expect(metric("Visits completed")).toContainText(`${m0.visits.completed + 1} / ${m0.visits.planned}`, { timeout: 15_000 });
  const adminVisit = await api<Any>(priya, `/v1/admin/visits/${id}`);
  expect(adminVisit.row.proofState ?? adminVisit.row.proof).toBe("VERIFIED");
  expect(adminVisit.orders).toHaveLength(1);
  expect(adminVisit.memosCreated).toHaveLength(2);

  // Hard refresh on the closed visit shows the same persisted state.
  await page.goto(`/field/visits/${id}`);
  await page.reload();
  await expect(page.getByText(/^Completed/).first()).toBeVisible();
  await expect(page.getByText(`Order ${order.number} booked`)).toBeVisible();
  w.assertClean();
  pw.assertClean();
  await ctx.close();
  await priya.context().close();
  await retailer.context().close();
});

/** Checks in at Sharma (real GPS) and attaches the arrival photo through the UI; returns the visit id. */
async function readyVisit(page: Page) {
  await openSharmaFromToday(page);
  const id: string = (await sharma(page)).id;
  await expect(page.getByText(/You.re at Sharma Jewellers/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Check in", exact: true }).click();
  await page.getByTestId("proof-file").setInputFiles({ name: "shop.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("link", { name: /Create order/ })).toBeVisible();
  return id;
}
const countPosts = (page: Page, re: RegExp) => {
  const keys: string[] = [];
  page.on("request", (r) => { if (r.method() === "POST" && re.test(new URL(r.url()).pathname)) keys.push(r.headers()["idempotency-key"] ?? ""); });
  return keys;
};

test("check-in: double tap sends one request; a 500 shows an error and no success; a lost answer never double-checks-in", async ({ browser }) => {
  const ctx = await rahulContext(browser);
  const page = await ctx.newPage();
  await openSharmaFromToday(page);
  const id: string = (await sharma(page)).id;
  await expect(page.getByText(/You.re at Sharma Jewellers/)).toBeVisible({ timeout: 20_000 });
  const btn = page.getByRole("button", { name: "Check in", exact: true });

  // 1. The server is down: an error, still on the check-in step, nothing written.
  await page.route("**/check-in", (r) => r.fulfill({ status: 500, contentType: "application/json", body: '{"ok":false,"error":{"code":"INTERNAL","message":"boom"}}' }));
  await btn.click();
  await expect(page.getByText("We couldn't confirm the check-in")).toBeVisible();
  await expect(btn).toBeVisible();
  await expect(page.getByText("Take or upload the arrival photo")).toHaveCount(0);
  expect((await visit(page, id)).visit.status).toBe("PLANNED");
  await page.unroute("**/check-in");

  // 2. The check-in commits but the answer is lost: the screen re-reads and moves on; one check-in.
  await page.route("**/check-in", async (r) => { await r.fetch(); await r.fulfill({ status: 502, body: "" }); });
  const posts = countPosts(page, /\/check-in$/);
  await btn.dblclick();
  await expect(page.getByText("Take or upload the arrival photo")).toBeVisible();
  expect(posts.length, "double tap → one request").toBe(1);
  await page.unroute("**/check-in");
  const v = await visit(page, id);
  expect(v.visit.status).toBe("CHECKED_IN");
  const priya = await priyaPage(browser);
  const adminV = await api<Any>(priya, `/v1/admin/visits/${id}`);
  expect(adminV.activity.filter((a: Any) => /check/i.test(`${a.type ?? ""} ${a.title ?? a.text ?? ""}`)).length).toBeLessThanOrEqual(1);
  await priya.context().close();
  await ctx.close();
});

test("order and memo: double tap books one; a memo that can't be confirmed keeps the draft and moves no custody", async ({ browser }) => {
  const ctx = await rahulContext(browser);
  const page = await ctx.newPage();
  const id = await readyVisit(page);

  // Order: double tap → one POST, one order.
  await page.getByRole("link", { name: /Create order/ }).click();
  await page.getByRole("button", { name: /to order$/ }).first().click();
  await page.getByRole("button", { name: "Review order" }).click();
  await expect(page).toHaveURL(/step=review/);
  const orderPosts = countPosts(page, /\/api\/v1\/orders$/);
  await page.getByRole("button", { name: /Place order|Send for approval/ }).dblclick();
  await expect(page.getByText(/Order confirmed|Sent to your manager for approval/).first()).toBeVisible();
  expect(orderPosts.length).toBe(1);
  expect((await visit(page, id)).orders).toHaveLength(1);
  await page.getByRole("main").getByRole("link", { name: "Back to visit" }).click();

  // Memo: the server never answers → "couldn't confirm", draft kept, piece still in Rahul's bag.
  const bag0 = (await visit(page, id)).bag;
  await page.getByRole("link", { name: /Leave on memo/ }).click();
  await page.getByRole("checkbox").first().click();
  await page.getByRole("button", { name: "Review memo" }).click();
  await page.route("**/api/v1/memos", (r) => r.fulfill({ status: 500, contentType: "application/json", body: '{"ok":false,"error":{"code":"INTERNAL","message":"boom"}}' }));
  await page.getByRole("button", { name: /Leave 1 piece on memo/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "couldn't confirm the memo" })).toBeVisible({ timeout: 15_000 });
  const v1 = await visit(page, id);
  expect(v1.memosCreated).toHaveLength(0);
  expect(v1.bag.map((p: Any) => p.id).sort()).toEqual(bag0.map((p: Any) => p.id).sort());
  // A refresh keeps the unconfirmed draft on its review with Retry.
  await page.reload();
  await expect(page.getByRole("button", { name: /^Retry/ })).toBeVisible();
  await page.unroute("**/api/v1/memos");
  const memoPosts = countPosts(page, /\/api\/v1\/memos$/);
  await page.getByRole("button", { name: /^Retry/ }).dblclick();
  await expect(page.getByText("Ask the retailer to scan and confirm")).toBeVisible();
  expect(memoPosts.length).toBe(1);
  const v2 = await visit(page, id);
  expect(v2.memosCreated).toHaveLength(1);
  expect(v2.bag).toHaveLength(bag0.length - 1);
  await ctx.close();
});

test("two tabs: a piece memo'd in one tab is refused in the other, which drops it and converges", async ({ browser }) => {
  const ctx = await rahulContext(browser);
  const a = await ctx.newPage();
  const id = await readyVisit(a);
  const b = await ctx.newPage();
  // Both tabs pick the same first piece of the bag.
  for (const p of [a, b]) {
    await p.goto(`/field/visits/${id}/sale?mode=memo`);
    await p.getByRole("checkbox").first().click();
    await p.getByRole("button", { name: "Review memo" }).click();
  }
  // Tab B keeps its stale bag (its re-reads fail), so the submit reaches the server, which refuses it.
  await b.route(`**/api/v1/visits/${id}`, (r) => r.abort());
  await a.getByRole("button", { name: /Leave 1 piece on memo/ }).click();
  await expect(a.getByText("Ask the retailer to scan and confirm")).toBeVisible();
  await b.bringToFront();
  await b.getByRole("button", { name: /Leave 1 piece on memo/ }).click();
  await expect(b.getByText(/1 piece is no longer in your bag and was removed\. Nothing was left on memo/).first()).toBeVisible();
  await b.unroute(`**/api/v1/visits/${id}`);
  // Once B can read again it shows the truth: the piece is gone from the draft and the bag.
  await b.reload();
  await expect(b).toHaveURL(/mode=memo$/);
  await expect(b.getByRole("checkbox", { checked: true })).toHaveCount(0);
  const v = await visit(b, id);
  expect(v.memosCreated).toHaveLength(1);
  // Tab B's visit screen converges on focus (no reload).
  await b.goto(`/field/visits/${id}`);
  await expect(b.getByText(/Memo .* left with retailer/)).toHaveCount(1);
  await a.bringToFront();
  await a.getByRole("main").getByRole("link", { name: /back to visit/i }).click();
  await b.bringToFront();
  await a.getByRole("button", { name: "Add note" }).click();
  await a.getByRole("textbox").fill("Owner asked for lighter bangles.");
  await a.getByRole("button", { name: "Save note" }).click();
  await expect(a.getByText("Owner asked for lighter bangles.")).toBeVisible();
  await b.waitForTimeout(10_500); // past staleTime
  await b.evaluate(() => document.dispatchEvent(new Event("visibilitychange", { bubbles: true }))); // what a tab switch fires
  await expect(b.getByText("Owner asked for lighter bangles.")).toBeVisible();
  await ctx.close();
});

test("sale steps follow the URL: refresh, Back and Forward keep the step; a finished order never reappears", async ({ browser }) => {
  const ctx = await rahulContext(browser);
  const page = await ctx.newPage();
  const id = await readyVisit(page);
  await page.getByRole("link", { name: /Create order/ }).click();
  await page.getByRole("button", { name: /to order$/ }).first().click();
  await page.getByRole("button", { name: "Review order" }).click();
  await expect(page).toHaveURL(/mode=order&step=review/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Review order" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/mode=order$/);
  await expect(page.getByRole("button", { name: "Review order" })).toBeVisible(); // cart kept
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Review order" })).toBeVisible();
  await page.getByRole("button", { name: "Back to Catalog" }).click();
  await expect(page).toHaveURL(/mode=order$/);
  await page.getByRole("button", { name: "Review order" }).click();
  await page.getByRole("button", { name: /Place order|Send for approval/ }).click();
  await expect(page).toHaveURL(/step=done/);
  await page.reload();
  await expect(page.getByText(/Order confirmed|Sent to your manager for approval/).first()).toBeVisible();
  // Back from the receipt goes to the (now empty) catalog, not to a review that could resubmit.
  await page.goBack();
  await expect(page).toHaveURL(/mode=order$/);
  await expect(page.getByRole("button", { name: "Review order" })).toHaveCount(0);
  await page.getByRole("link", { name: "Back to Visit" }).click();
  await expect(page).toHaveURL(new RegExp(`/field/visits/${id}$`));
  await page.getByRole("link", { name: /Create order/ }).click();
  await expect(page.getByText(/Order confirmed|Sent to your manager/)).toHaveCount(0);
  expect((await visit(page, id)).orders).toHaveLength(1);
  await ctx.close();
});

test("session expiry mid-order: silent refresh, then a dead session returns to the same review with the cart", async ({ browser }) => {
  const ctx = await rahulContext(browser);
  const page = await ctx.newPage();
  const id = await readyVisit(page);
  await page.getByRole("link", { name: /Create order/ }).click();
  await page.getByRole("button", { name: /to order$/ }).first().click();
  await page.getByRole("button", { name: "Review order" }).click();
  // Both cookies dead → the submit sends Rahul to sign in and back to this exact step.
  const cookies = await ctx.cookies();
  await ctx.clearCookies();
  await ctx.addCookies(cookies.filter((c) => c.name === "jr_rt").map((c) => ({ ...c, value: "expired" })));
  // The submit (or any background re-read that gets there first) sends Rahul to sign in.
  await page.getByRole("button", { name: /Place order|Send for approval/ }).click({ timeout: 3_000 }).catch(() => {});
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(new URL(page.url()).searchParams.get("next")).toBe(`/field/visits/${id}/sale?mode=order&step=review`);
  expect((await (await page.request.get(`${WEB}/api/v1/auth/me`)).status())).toBe(401);
  await login(ctx, RAHUL);
  await page.goto(new URL(page.url()).searchParams.get("next")!);
  await expect(page.getByRole("heading", { name: "Review order" })).toBeVisible();
  // Access token expired only → the submit refreshes silently and books once.
  const rt = (await ctx.cookies()).find((c) => c.name === "jr_rt")!;
  await ctx.clearCookies();
  await ctx.addCookies([rt]);
  await page.getByRole("button", { name: /Place order|Send for approval/ }).click();
  await expect(page.getByText(/Order confirmed|Sent to your manager for approval/).first()).toBeVisible();
  expect((await visit(page, id)).orders).toHaveLength(1);
  await ctx.close();
});

test("selling before the arrival photo is refused by the server and the UI says why", async ({ browser }) => {
  const ctx = await rahulContext(browser);
  const page = await ctx.newPage();
  await openSharmaFromToday(page);
  const id: string = (await sharma(page)).id;
  await expect(page.getByText(/You.re at Sharma Jewellers/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Check in", exact: true }).click();
  await expect(page.getByText("Take or upload the arrival photo")).toBeVisible();
  await page.goto(`/field/visits/${id}/sale?mode=order`);
  await expect(page.getByText("Add the arrival photo on the visit first.")).toBeVisible();
  await expect(page.getByRole("button", { name: /to order$/ })).toHaveCount(0);
  const designId = (await api<Any>(page, `/v1/visits/${id}/catalog`)).designs.find((d: Any) => d.price).id;
  const r = await page.request.post(`${WEB}/api/v1/orders`, { data: { visitId: id, items: [{ designId, quantity: 1 }] }, headers: { "Idempotency-Key": crypto.randomUUID() } });
  expect(r.status()).toBe(409);
  expect((await r.json()).error.code).toBe("PROOF_REQUIRED_BEFORE_SALE");
  await page.goto(`/field/visits/${id}`);
  await expect(page.getByText("Take or upload the arrival photo")).toBeVisible();
  await expect(page.getByRole("button", { name: "Complete visit" })).toHaveCount(0);
  expect((await visit(page, id)).orders).toHaveLength(0);
  await ctx.close();
});
