/* A business signs up, follows the onboarding checklist on Home, and its brand-new agent checks in at its
 * brand-new shop on a phone. Every tick and status is checked against the API, never trusted from the page. */
import { test, expect } from "@playwright/test";
import { WEB, api, login, watch } from "./helpers";

/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are asserted field by field */
type Any = any;

const RUN = Math.random().toString(36).slice(2, 8);
const OWNER = { email: `owner-${RUN}@signup.test`, password: "Owner@2026" };
const AGENT = { email: `agent-${RUN}@signup.test`, password: "Agent@2026" };
const SHOP = { latitude: 28.5355, longitude: 77.391 };

test("signup → onboarding checklist → the new agent checks in at the new shop", async ({ page, browser }) => {
  const w = watch(page);
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Create your workspace" })).toBeVisible();
  await page.getByLabel("Business name").fill(`Kundan House ${RUN}`);
  await page.getByLabel("Your name").fill("Meera Kapoor");
  await page.getByLabel("Work email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  const me = await api<Any>(page, "/v1/auth/me");
  expect(me.tenant.name).toBe(`Kundan House ${RUN}`);
  expect(me.tenant.demoMode).toBe(false);
  const checklist = page.getByRole("region", { name: "Set up your workspace" });
  await expect(checklist).toBeVisible();
  await expect(checklist.getByText("0 of 6 done")).toBeVisible();
  await page.screenshot({ path: "../../docs/overnight/shots/lead/onboarding-empty-1440.png" });

  // The first step's button is the primary one and leads to the gold-rate settings.
  await checklist.getByRole("link", { name: "Set rate" }).click();
  await expect(page).toHaveURL(/\/admin\/settings\?tab=gold-rate/);

  // Do the setup through the same API calls the screens make (the screens have their own specs).
  const post = async (path: string, data: unknown) => {
    const r = await page.request.post(`${WEB}/api${path}`, { data, headers: { "Idempotency-Key": crypto.randomUUID() } });
    expect(r.status(), `${path} ${await r.text()}`).toBeLessThan(300);
    return (await r.json()).data as Any;
  };
  await post("/v1/admin/gold-rates", { purity: "K22", ratePaisePerGram: 1_050_000 });
  const design = (await post("/v1/admin/designs", { sku: `KH-${RUN}`, name: "Kundan Bangle", category: "Bangles", collection: "Core", purity: "K22", grossWeightMg: 20_000, netWeightMg: 18_000, makingChargeType: "PER_GRAM", makingChargeValue: 65_000 })).design;
  const pieces = (await post(`/v1/admin/designs/${design.id}/pieces`, { count: 2 })).pieces;
  const shop = (await post("/v1/admin/shops", { name: `Noida Gold ${RUN}`, address: "Sector 18", area: "Noida", lat: SHOP.latitude, lng: SHOP.longitude })).shop;

  await page.goto("/admin");
  await expect(checklist.getByText("3 of 6 done")).toBeVisible();
  // The next open step (agent) is now the primary action.
  await checklist.getByRole("link", { name: "New agent" }).click();
  await expect(page).toHaveURL(/\/admin\/agents/);
  const agent = (await post("/v1/admin/agents", { name: "Arun Mehta", ...AGENT })).agent;
  await post("/v1/admin/pieces/issue", { pieceIds: pieces.map((p: Any) => p.id), agentId: agent.id });

  await page.goto("/admin");
  await expect(checklist.getByText("5 of 6 done")).toBeVisible();
  // The last step opens the Assign visit dialog right on Home.
  await checklist.getByRole("button", { name: "Assign visit" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const visit = (await post("/v1/admin/assignments", { agentId: agent.id, shopId: shop.id, date: today, plannedTime: "11:00" })).visit;
  await page.reload();
  await expect(page.getByRole("heading", { name: /^(Good|Hello)/ })).toBeVisible();
  await expect(checklist).toHaveCount(0);
  expect((await api<Any>(page, "/v1/admin/onboarding")).complete).toBe(true);
  w.assertClean();

  // The new agent, on a phone, at the new shop.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, geolocation: { ...SHOP, accuracy: 10 }, permissions: ["geolocation"] });
  await login(ctx, AGENT);
  const phone = await ctx.newPage();
  const pw = watch(phone);
  await phone.goto("/field/today");
  await expect(phone.getByText(`Noida Gold ${RUN}`).first()).toBeVisible();
  await phone.goto(`/field/visits/${visit.id}`);
  await phone.getByRole("button", { name: "Check in", exact: true }).click();
  await expect.poll(async () => (await api<Any>(phone, `/v1/visits/${visit.id}`)).visit.status, { timeout: 20_000 }).toBe("CHECKED_IN");
  expect((await api<Any>(phone, `/v1/visits/${visit.id}`)).visit.verification).toBe("VERIFIED");
  await phone.screenshot({ path: "../../docs/overnight/shots/lead/new-agent-checked-in-390.png" });
  pw.assertClean();
  await ctx.close();
});

test("signup refuses an email that already has an account and offers sign-in", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Business name").fill("Duplicate Jewels");
  await page.getByLabel("Your name").fill("Someone");
  await page.getByLabel("Work email").fill("admin@aurum.test");
  await page.getByLabel("Password").fill("Whatever@2026");
  await page.getByRole("button", { name: "Create workspace" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "An account with this email already exists." });
  await expect(alert).toBeVisible();
  await alert.getByRole("link", { name: "Sign in instead" }).click();
  await expect(page).toHaveURL(/\/login/);
});
