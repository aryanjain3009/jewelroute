import { test, expect, type Page } from "@playwright/test";
import { RAHUL, PRIYA, WEB, api, formLogin, login, reseed } from "./helpers";

test.beforeAll(async ({ request }) => { await reseed(request); });

const signInWithForm = formLogin;

/** Id of Rahul's Sharma Jewellers visit today, read through the API as Rahul. */
async function sharmaVisitId(page: Page) {
  const today = await api<{ visits: { id: string; shop: { name: string } }[] }>(page, "/v1/field/today");
  return today.visits.find((v) => v.shop.name === "Sharma Jewellers")!.id;
}

test("unauthenticated deep link keeps ?next= and returns there after sign-in", async ({ page }) => {
  await page.goto("/admin/orders");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Forders$/);
  await signInWithForm(page, PRIYA);
  await expect(page).toHaveURL(/\/admin\/orders$/);
});

test("deep link keeps the query string (admin record tab) through sign-in", async ({ page }) => {
  await page.goto("/admin/visits?status=COMPLETED&view=table");
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/admin/visits?status=COMPLETED&view=table");
  await signInWithForm(page, PRIYA);
  await expect(page).toHaveURL(/\/admin\/visits\?status=COMPLETED&view=table$/);
});

test("field record deep link with a query returns to the same record", async ({ page, context }) => {
  await login(context, RAHUL);
  const id = await sharmaVisitId(page);
  await context.clearCookies();
  await page.goto(`/field/visits/${id}/sale?mode=memo`);
  expect(new URL(page.url()).searchParams.get("next")).toBe(`/field/visits/${id}/sale?mode=memo`);
  await signInWithForm(page, RAHUL);
  await expect(page).toHaveURL(new RegExp(`/field/visits/${id}/sale\\?mode=memo$`));
  await expect(page.getByRole("tab", { name: /memo/i })).toHaveAttribute("aria-selected", "true");
});

test("field agent lands on /field/today, manager on /admin", async ({ page, browser }) => {
  await page.goto("/login");
  await signInWithForm(page, RAHUL);
  await expect(page).toHaveURL(/\/field\/today$/);
  const p2 = await (await browser.newContext()).newPage();
  await p2.goto(`${WEB}/login`);
  await signInWithForm(p2, PRIYA);
  await expect(p2).toHaveURL(/\/admin$/);
  await p2.context().close();
});

test("next= into the other role's area or off-site is ignored", async ({ page, context }) => {
  // Through the real form: one cross-role and one off-site target.
  for (const next of ["/admin/orders", "//evil.example/x"]) {
    await context.clearCookies();
    await page.goto(`/login?next=${encodeURIComponent(next)}`);
    await signInWithForm(page, RAHUL);
    await expect(page, `next=${next}`).toHaveURL(/\/field\/today$/);
  }
  // Already signed in: /login?next= applies the same rule without another sign-in.
  for (const next of ["https://evil.example/x", "/\\evil.example", "/administrator", "/field-evil", "/admin"]) {
    await page.goto(`/login?next=${encodeURIComponent(next)}`);
    await expect(page, `next=${next}`).toHaveURL(/\/field\/today$/);
    expect(new URL(page.url()).host).toBe(new URL(WEB).host);
  }
  await page.goto(`/login?next=${encodeURIComponent("/field/catalog?x=1")}`);
  await expect(page).toHaveURL(/\/field\/catalog\?x=1$/);
});

test("a signed-in agent never sees /admin; a manager is sent out of /field", async ({ page, browser, context }) => {
  await login(context, RAHUL);
  const adminCalls: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/api/v1/admin/")) adminCalls.push(r.url()); });
  await page.goto("/admin/orders");
  await expect(page).toHaveURL(/\/field\/today$/);
  expect(adminCalls, "agent page must not call admin endpoints").toEqual([]);

  const ctx = await browser.newContext();
  await login(ctx, PRIYA);
  const p2 = await ctx.newPage();
  await p2.goto(`${WEB}/field/today`);
  await expect(p2).toHaveURL(/\/admin$/);
  await ctx.close();
});

test("signed-in user visiting /login goes to their home (or a valid next)", async ({ page, context }) => {
  await login(context, RAHUL);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/field\/today$/);
  await page.goto("/login?next=%2Ffield%2Fvisits");
  await expect(page).toHaveURL(/\/field\/visits$/);
  // Only a refresh cookie (access expired): still recognised.
  const rt = (await context.cookies()).find((c) => c.name === "jr_rt")!;
  await context.clearCookies();
  await context.addCookies([rt]);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/field\/today$/);
});

test("expired access token refreshes silently; dead refresh goes to /login?next=<current>", async ({ page, context }) => {
  await login(context, RAHUL);
  await page.goto("/field/visits?scope=upcoming");
  await expect(page.getByRole("tab", { name: "Upcoming" })).toHaveAttribute("aria-selected", "true");
  // Access token gone (expired), refresh cookie still good → the page keeps working, no bounce.
  const rt = (await context.cookies()).find((c) => c.name === "jr_rt")!;
  await context.clearCookies();
  await context.addCookies([rt]);
  await page.reload();
  await expect(page).toHaveURL(/\/field\/visits\?scope=upcoming$/);
  await expect(page.getByRole("heading", { name: "Visits" })).toBeVisible();
  await expect.poll(async () => (await context.cookies()).some((c) => c.name === "jr_at"), { message: "silent refresh set a new access token" }).toBeTruthy();

  // Both tokens invalid → back to sign-in with the full current location.
  await context.clearCookies();
  await context.addCookies([{ ...rt, value: "not-a-real-token" }]);
  await page.reload();
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/field/visits?scope=upcoming");
  await signInWithForm(page, RAHUL);
  await expect(page).toHaveURL(/\/field\/visits\?scope=upcoming$/);
});

test("sign out clears the session and Back cannot reopen protected screens", async ({ page, context }) => {
  await login(context, RAHUL);
  await page.goto("/field/today");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await page.goto("/field/profile");
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login/);
  // Session cookies are gone; only the long-lived device id (jr_dev, used for self-ack evidence) may remain.
  expect((await context.cookies()).filter((c) => c.name === "jr_at" || c.name === "jr_rt")).toEqual([]);
  await page.goBack();
  await expect(page).toHaveURL(/\/login\?next=/);
  const me = await page.request.get(`${WEB}/api/v1/auth/me`);
  expect(me.status()).toBe(401);
});

test("two tabs refreshing at once both stay signed in (one rotation, shared cookies)", async ({ context }) => {
  await login(context, PRIYA); // Priya: keeps Rahul under the per-account sign-in limit
  const a = await context.newPage();
  const b = await context.newPage();
  await a.goto("/admin");
  await b.goto("/admin/orders");
  await expect(b.getByRole("heading", { name: "Orders" }).first()).toBeVisible();
  const rt = (await context.cookies()).find((c) => c.name === "jr_rt")!;
  await context.clearCookies();
  await context.addCookies([rt]);
  const refreshes: number[] = [];
  context.on("response", (r) => { if (r.url().endsWith("/api/v1/auth/refresh")) refreshes.push(r.status()); });
  await Promise.all([a.reload(), b.reload()]);
  await expect(a.getByRole("heading", { name: "Home" }).first()).toBeVisible();
  await expect(b.getByRole("heading", { name: "Orders" }).first()).toBeVisible();
  await a.waitForTimeout(1_500);
  expect(a.url()).toMatch(/\/admin$/);
  expect(b.url()).toMatch(/\/admin\/orders$/);
  expect(refreshes.filter((s) => s !== 200), `refresh statuses ${refreshes}`).toEqual([]);
  expect((await api<{ metrics: unknown }>(a, "/v1/admin/home")).metrics).toBeTruthy();
});

test("a deactivated account (401 ACCOUNT_DISABLED) is signed out with a clear message", async ({ page, context }) => {
  await login(context, RAHUL);
  // Simulate the API's answer for a deactivated user: every call 401 ACCOUNT_DISABLED, refresh revoked.
  const disabled = { status: 401, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "ACCOUNT_DISABLED", message: "Account disabled" } }) };
  await page.route("**/api/v1/field/**", (r) => r.fulfill(disabled));
  await page.route("**/api/v1/auth/me", (r) => r.fulfill(disabled));
  await page.route("**/api/v1/auth/refresh", (r) => r.fulfill({ ...disabled, body: JSON.stringify({ ok: false, error: { code: "INVALID_REFRESH_TOKEN", message: "x" } }) }));
  await page.goto("/field/today?x=1");
  await expect(page).toHaveURL(/\/login\?/);
  const u = new URL(page.url());
  expect(u.searchParams.get("next")).toBe("/field/today?x=1");
  expect(u.searchParams.get("reason")).toBe("disabled");
  await expect(page.getByText(/no longer active/)).toBeVisible();
  // Cookies cleared, so the middleware does not bounce /login back into the app (no redirect loop).
  // Session cookies are gone; only the long-lived device id (jr_dev, used for self-ack evidence) may remain.
  expect((await context.cookies()).filter((c) => c.name === "jr_at" || c.name === "jr_rt")).toEqual([]);
  await page.waitForTimeout(1_000);
  await expect(page).toHaveURL(/\/login\?/);
});
