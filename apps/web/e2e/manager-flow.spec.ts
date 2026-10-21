/* Manager (Priya, 1440×900) end-to-end against a running stack. Every action is checked three ways:
 * the persisted state (API with the page's cookies, plus SQL on the stack's database), the screen the
 * action was taken on (updated without a reload), and the screens that depend on it (after navigation
 * and after a hard refresh). Field-side state (Rahul's memo sales) is created through the API with an
 * Idempotency-Key, exactly as the field app does. Each test reseeds the demo tenant first. */
import { test, expect, type Page } from "@playwright/test";
import { formatINR, formatRate } from "@jewelroute/shared";
import { PRIYA, RAHUL, api, login, reseed, watch } from "./helpers";
import { get, previewRow, sql, write } from "./admin-helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- API JSON in tests
type J = any;
const toast = (page: Page, text: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: text }).first();

test("approve from the list's side sheet: stays on the list, persists, and every dependent screen follows", async ({ page, context }) => {
  await reseed(page.request);
  await login(context, PRIYA);
  const w = watch(page);
  const pending: J[] = await api(page, "/v1/admin/orders?status=PENDING_APPROVAL");
  expect(pending.length).toBe(2);
  const o = pending.find((x) => x.shop.name === "Royal Gems");
  const before: J = (await api(page, `/v1/admin/shops/${o.shop.id}`)).shop.credit;

  await page.goto("/admin/orders?view=pending");
  await expect(page.getByRole("button", { name: /^Pending approval\s*2$/ })).toBeVisible();
  const panel = await previewRow(page, o.number);
  await expect(page).toHaveURL(new RegExp(`preview=${o.id}`));
  await expect(panel.getByText(/Why it needs approval/)).toBeVisible();
  await panel.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(toast(page, `${o.number} approved`)).toBeVisible();
  // Still on the list, preview still open, now showing the server's answer.
  await expect(page).toHaveURL(/\/admin\/orders\?.*view=pending/);
  await expect(panel.getByText("Approved", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Pending approval\s*1$/ })).toBeVisible();

  // Persisted: order, audit row, outbox event; outstanding grew by the order total.
  const after: J = (await api(page, `/v1/admin/orders/${o.id}`)).order;
  expect(after.status).toBe("APPROVED");
  expect(after.decidedBy.name).toBe("Priya Mehta");
  expect(sql(`select status, "decidedById" is not null from "Order" where id='${o.id}'`)).toEqual([["APPROVED", "t"]]);
  expect(sql(`select count(*) from "AuditLog" where "entityId"='${o.id}' and action='order.approve'`)).toEqual([["1"]]);
  expect(sql(`select count(*) from "OutboxEvent" where "orderId"='${o.id}' and type='order.approved'`)).toEqual([["1"]]);
  const credit: J = (await api(page, `/v1/admin/shops/${o.shop.id}`)).shop.credit;
  expect(credit.outstandingPaise).toBe(before.outstandingPaise + o.totalPaise);

  // Reject the other one from its side sheet: the dialog opens over the list, which stays put.
  const jain = pending.find((x) => x.shop.name === "Jain Ornaments");
  const jain0: J = (await api(page, `/v1/admin/shops/${jain.shop.id}`)).shop.credit;
  const panel2 = await previewRow(page, jain.number);
  await panel2.getByRole("button", { name: "Reject…" }).click();
  await page.getByRole("dialog").getByLabel("Reason").fill("Over the credit limit; collect payment first");
  await page.getByRole("dialog").getByRole("button", { name: "Reject order" }).click();
  await expect(toast(page, `${jain.number} rejected`)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/admin/orders\\?.*preview=${jain.id}`));
  await expect(panel2.getByText("Rejected", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Pending approval\s*0$/ })).toBeVisible();
  expect(sql(`select status, "rejectionReason" from "Order" where id='${jain.id}'`)).toEqual([["REJECTED", "Over the credit limit; collect payment first"]]);
  // A rejected order never counts towards outstanding.
  expect((await api(page, `/v1/admin/shops/${jain.shop.id}`)).shop.credit.outstandingPaise).toBe(jain0.outstandingPaise);

  // Hard refresh keeps the view and the preview.
  await page.reload();
  await expect(page.getByRole("complementary", { name: "Record preview" }).getByText("Rejected", { exact: true })).toBeVisible();
  await expect(page.getByText("No orders match")).toBeVisible();

  // Dependents: Home metric + attention, shop record credit, order record.
  await page.goto("/admin");
  await expect(page.getByRole("link", { name: /Pending approvals.*All decided/ })).toBeVisible();
  await expect(page.getByText(`${o.number} awaiting approval`)).toHaveCount(0);
  await page.goto(`/admin/shops/${o.shop.id}`);
  await expect(page.getByText(formatINR(credit.outstandingPaise), { exact: true }).first()).toBeVisible();
  await page.goto(`/admin/orders/${o.id}`);
  await expect(page.getByText(/Approved by Priya Mehta/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark as settled" })).toBeVisible();
  w.assertClean();
});

test("list state lives in the URL: filters, sort, search and Back from a record", async ({ page, context }) => {
  await reseed(page.request);
  await login(context, PRIYA);
  const w = watch(page);
  const target: J = (await api(page, "/v1/admin/orders")).find((o: J) => o.shop.name === "Gupta Gold House");
  await page.goto("/admin/orders");
  await page.getByLabel("Agent").selectOption({ label: target.agent.name });
  await page.getByPlaceholder("Search order, shop, agent").fill("Gupta");
  await page.locator("thead th").filter({ hasText: "Amount" }).getByRole("button").click();
  await expect(page).toHaveURL(/agent=.+&?/);
  await expect(page).toHaveURL(/q=Gupta/);
  await expect(page).toHaveURL(/sort=amount\.(asc|desc)/);
  const listUrl = page.url();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.locator("tbody tr").first().click();
  await expect(page).toHaveURL(/\/admin\/orders\/[^?]+$/);
  await page.goBack();
  await expect(page).toHaveURL(listUrl);
  await expect(page.getByPlaceholder("Search order, shop, agent")).toHaveValue("Gupta");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.reload();
  await expect(page.getByPlaceholder("Search order, shop, agent")).toHaveValue("Gupta");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  // Keyboard: the table is focusable; ↓ then Space previews, Esc closes, Enter opens.
  await page.getByPlaceholder("Search order, shop, agent").fill("");
  await page.locator('[aria-label="orders table"]').focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await expect(page.getByRole("complementary", { name: "Record preview" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Record preview" })).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/orders\/[^?]+$/);
  // The record's "← Orders" link returns to the filtered list.
  await page.getByRole("link", { name: "Orders", exact: true }).last().click();
  await expect(page).toHaveURL(/\/admin\/orders\?/);
  // ⌘K: search across objects and jump to the record.
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/Search shops, tag codes/).fill("Gupta");
  await page.getByRole("option").filter({ hasText: "Gupta Gold House" }).first().click();
  await expect(page).toHaveURL(/\/admin\/shops\/[^?]+$/);
  w.assertClean();
});

test("approval rules at the boundary; threshold changes apply to new orders only; rejecting a memo sale puts the pieces back on memo", async ({ page, context, browser }) => {
  await reseed(page.request);
  await login(context, PRIYA);
  const field = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await login(field, RAHUL);
  const w = watch(page);
  const profile: J = await get(field.request, "/v1/field/profile");
  const memo = profile.activeMemos.find((m: J) => m.shop.name === "Mehta Jewellers");
  // The cheaper piece keeps every order in this test well below the seeded ₹10L threshold.
  const small = [...memo.items].sort((a: J, b: J) => a.valuePaise - b.valuePaise)[0].piece;
  const preview = async (pieceId: string): Promise<J> => get(field.request, `/v1/memos/${memo.id}/convert-preview?pieceIds=${pieceId}`);
  const convert = (pieceId: string): Promise<J> => write(field.request, "POST", `/v1/memos/${memo.id}/convert`, { pieceIds: [pieceId] }, { idempotent: true });

  // 1) Threshold equal to the order total trips the rule (amount ≥ threshold). Set through Settings.
  const p1 = await preview(small.id);
  await page.goto("/admin/settings?tab=approvals");
  const input = page.getByLabel("Approval threshold in rupees");
  await input.fill(`${Math.floor(p1.totalPaise / 100)}.${String(p1.totalPaise % 100).padStart(2, "0")}`);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(toast(page, /now need approval/)).toBeVisible();
  expect(sql(`select "approvalThresholdPaise" from "Tenant" where slug='aurum'`)).toEqual([[String(p1.totalPaise)]]);
  expect((await api(page, "/v1/admin/settings")).approvalThresholdPaise).toBe(p1.totalPaise);
  const c1 = await convert(small.id);
  expect(c1.order.status).toBe("PENDING_APPROVAL");
  expect(c1.order.approval.reasons).toEqual(["ORDER_THRESHOLD"]);
  expect(c1.order.totalPaise).toBe(p1.totalPaise);

  // 2) Raising the threshold applies to new orders only: the pending one keeps its frozen evaluation.
  await page.reload();
  await page.getByLabel("Approval threshold in rupees").fill("10,00,000");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(toast(page, /₹10L or more now need approval/)).toBeVisible();
  const still: J = (await api(page, `/v1/admin/orders/${c1.order.id}`)).order;
  expect(still.status).toBe("PENDING_APPROVAL");
  expect(still.approval.position.approvalThresholdPaise).toBe(p1.totalPaise);

  // 3) Reject the memo sale from its record: pieces go back to the shop on that memo.
  await page.goto(`/admin/orders/${c1.order.id}`);
  await expect(page.getByText("Waiting for your approval")).toBeVisible();
  await page.getByRole("button", { name: "Reject" }).click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByText(new RegExp(`back on ${memo.number} at Mehta Jewellers`))).toBeVisible();
  await dlg.getByLabel("Reason").fill("Retailer wants to keep it on memo for now");
  await dlg.getByRole("button", { name: "Reject and put pieces back on memo" }).click();
  await expect(toast(page, `${c1.order.number} rejected`)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/admin/orders/${c1.order.id}$`));
  await expect(page.getByText(/Rejected by Priya Mehta/)).toBeVisible();
  expect(sql(`select status from "MemoItem" where "memoId"='${memo.id}' and "pieceId"='${small.id}'`)).toEqual([["OUT"]]);
  expect(sql(`select "custodianType", "custodianShopId" from "SamplePiece" where id='${small.id}'`)).toEqual([["SHOP", memo.shop.id]]);
  expect(sql(`select reason from "CustodyEvent" where "pieceId"='${small.id}' order by seq desc limit 1`)).toEqual([["SALE_REJECTED"]]);
  const memoAfter: J = (await api(page, `/v1/admin/memos/${memo.id}`)).memo;
  expect(memoAfter.status).toBe("ACTIVE");
  expect(memoAfter.items.find((i: J) => i.piece.id === small.id).status).toBe("OUT");
  // Dependent screens: memo record and sample record show the piece back on memo.
  await page.goto(`/admin/memos/${memo.id}`);
  await expect(page.locator("tr").filter({ hasText: small.tagCode }).getByText("Out", { exact: true })).toBeVisible();
  await page.goto(`/admin/samples/${small.id}`);
  await expect(page.getByText(/At Mehta Jewellers/).first()).toBeVisible();
  await expect(page.getByText(memo.number).first()).toBeVisible();

  // 4) Credit limit boundary through the shop's edit sheet: projected == limit passes, one paisa less needs approval.
  const p2 = await preview(small.id);
  const setLimit = async (paise: number) => {
    await page.goto(`/admin/shops/${memo.shop.id}`);
    await page.getByRole("button", { name: "Edit shop" }).click();
    await page.getByLabel("Credit limit (₹)").fill(`${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`);
    await page.getByRole("button", { name: "Save shop" }).click();
    await expect(toast(page, /Mehta Jewellers saved/)).toBeVisible();
    expect(sql(`select "creditLimitPaise" from "Shop" where id='${memo.shop.id}'`)).toEqual([[String(paise)]]);
    await expect(page.getByText(formatINR(paise), { exact: true })).toBeVisible();
  };
  await setLimit(p2.credit.projectedExposurePaise - 1);
  const c2 = await convert(small.id);
  expect(c2.order.status).toBe("PENDING_APPROVAL");
  expect(c2.order.approval.reasons).toEqual(["CREDIT_LIMIT"]);
  await page.goto(`/admin/orders/${c2.order.id}`);
  await page.getByRole("button", { name: "Reject" }).click();
  await page.getByRole("dialog").getByLabel("Reason").fill("Over the limit by a paisa");
  await page.getByRole("dialog").getByRole("button", { name: "Reject and put pieces back on memo" }).click();
  await expect(toast(page, `${c2.order.number} rejected`)).toBeVisible();
  const p3 = await preview(small.id);
  await setLimit(p3.credit.projectedExposurePaise);
  const c3 = await convert(small.id);
  expect(c3.order.status).toBe("CONFIRMED");
  expect(c3.order.approval.required).toBe(false);
  expect(c3.order.approval.position.projectedExposurePaise).toBe(c3.order.approval.position.creditLimitPaise);
  // A confirmed memo sale cannot be cancelled (its pieces are sold): the record offers no Cancel.
  await page.goto(`/admin/orders/${c3.order.id}`);
  await expect(page.getByText("Confirmed without approval")).toBeVisible();
  await expect(page.getByRole("button", { name: /Cancel/ })).toHaveCount(0);
  await field.close();
  w.assertClean();
});

test("settle and cancel move outstanding and available credit on every screen", async ({ page, context }) => {
  await reseed(page.request);
  await login(context, PRIYA);
  const w = watch(page);
  const orders: J[] = await api(page, "/v1/admin/orders");
  const unsettled = orders.filter((o) => o.status === "CONFIRMED" && !o.settledAt && !o.sourceMemoId);
  const toSettle = unsettled.find((o) => o.shop.name === "Gupta Gold House");
  const toCancel = unsettled.find((o) => o.shop.name === "Bansal Jewellers");
  const g0: J = (await api(page, `/v1/admin/shops/${toSettle.shop.id}`)).shop.credit;
  const b0: J = (await api(page, `/v1/admin/shops/${toCancel.shop.id}`)).shop.credit;

  await page.goto("/admin/orders?view=unsettled");
  const unsettledTab = page.getByRole("button", { name: /^Unsettled\s*\d+$/ });
  const n0 = Number((await unsettledTab.textContent())!.replace(/\D/g, ""));

  // Settle from the record: stays on the record, payment shows settled.
  await page.goto(`/admin/orders/${toSettle.id}`);
  await page.getByRole("button", { name: "Mark as settled" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Mark as settled" }).click();
  await expect(toast(page, `${toSettle.number} marked as settled`)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/admin/orders/${toSettle.id}$`));
  await expect(page.getByText(/^Settled/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark as settled" })).toHaveCount(0);
  expect(sql(`select "settledAt" is not null from "Order" where id='${toSettle.id}'`)).toEqual([["t"]]);
  expect(sql(`select count(*) from "AuditLog" where "entityId"='${toSettle.id}' and action='order.settle'`)).toEqual([["1"]]);
  const g1: J = (await api(page, `/v1/admin/shops/${toSettle.shop.id}`)).shop.credit;
  expect(g1.outstandingPaise).toBe(g0.outstandingPaise - toSettle.totalPaise);
  expect(g1.availableCreditPaise).toBe(Math.max(0, g1.creditLimitPaise - g1.exposurePaise));
  expect(g1.availableCreditPaise).toBe(g0.availableCreditPaise + toSettle.totalPaise);
  // Settling again is refused by the server; the UI no longer offers it.
  await write(page.request, "POST", `/v1/admin/orders/${toSettle.id}/settle`, undefined, { expectStatus: 409 });

  // Cancel from the record.
  await page.goto(`/admin/orders/${toCancel.id}`);
  await page.getByRole("button", { name: "Cancel order" }).click();
  await page.getByRole("dialog").getByLabel(/Reason/).fill("Retailer dropped the order");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel order" }).click();
  await expect(toast(page, `${toCancel.number} cancelled`)).toBeVisible();
  await expect(page.getByText("Retailer dropped the order")).toBeVisible();
  expect(sql(`select status, "cancellationReason" from "Order" where id='${toCancel.id}'`)).toEqual([["CANCELLED", "Retailer dropped the order"]]);
  const b1: J = (await api(page, `/v1/admin/shops/${toCancel.shop.id}`)).shop.credit;
  expect(b1.outstandingPaise).toBe(b0.outstandingPaise - toCancel.totalPaise);

  // Every dependent screen shows the new figures.
  await page.goto(`/admin/shops/${toSettle.shop.id}`);
  await expect(page.getByText(formatINR(g1.outstandingPaise), { exact: true })).toBeVisible();
  await expect(page.getByText(formatINR(g1.availableCreditPaise!), { exact: true })).toBeVisible();
  await page.goto(`/admin/shops/${toCancel.shop.id}?tab=orders`);
  await expect(page.locator("a").filter({ hasText: toCancel.number }).getByText("Cancelled")).toBeVisible();
  await page.goto("/admin/shops");
  const rows: J[] = await api(page, "/v1/admin/shops");
  expect(rows.find((r) => r.id === toSettle.shop.id).credit.outstandingPaise).toBe(g1.outstandingPaise);
  await page.goto("/admin/orders?view=unsettled");
  await expect(page.getByRole("button", { name: new RegExp(`^Unsettled\\s*${n0 - 2}$`) })).toBeVisible();
  await expect(page.locator("tbody tr").filter({ hasText: toSettle.number })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: new RegExp(`^Unsettled\\s*${n0 - 2}$`) })).toBeVisible();
  w.assertClean();
});

test("gold-rate change re-prices the catalog and pieces, never a booked order; the sidebar follows", async ({ page, context }) => {
  await reseed(page.request);
  await login(context, PRIYA);
  const w = watch(page);
  const rates: J = await api(page, "/v1/admin/gold-rates");
  const k22 = rates.current.find((r: J) => r.purity === "K22");
  const order: J = (await api(page, "/v1/admin/orders")).find((o: J) => o.goldRateSnapshot.some((s: J) => s.purity === "K22"));
  const design: J = (await api(page, "/v1/admin/designs")).find((d: J) => d.purity === "K22" && d.price);
  const next = k22.ratePaisePerGram + 12_550; // +₹125.50/g

  await page.goto("/admin/orders/" + order.id);
  await expect(page.getByText(formatRate(k22.ratePaisePerGram)).first()).toBeVisible();
  await page.goto("/admin/settings");
  await expect(page.getByRole("link", { name: /22K today/ })).toContainText(formatRate(k22.ratePaisePerGram));
  await page.getByRole("button", { name: "Set rate" }).nth(1).click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByText("Set today's 22K rate")).toBeVisible();
  await dlg.getByLabel("Rate per gram (₹)").fill(`${Math.floor(next / 100)}.${String(next % 100).padStart(2, "0")}`);
  await dlg.getByRole("button", { name: `Set 22K to ${formatRate(next)}` }).click();
  await expect(toast(page, `22K set to ${formatRate(next)}`)).toBeVisible();
  // Same screen and the sidebar update without a reload.
  await expect(page.getByRole("link", { name: /22K today/ })).toContainText(formatRate(next));
  await expect(page.getByRole("cell", { name: formatRate(next) }).first()).toBeVisible();

  const after: J = await api(page, "/v1/admin/gold-rates");
  expect(after.current.find((r: J) => r.purity === "K22").ratePaisePerGram).toBe(next);
  expect(sql(`select count(*) from "GoldRate" where purity='K22' and "ratePaisePerGram"=${next}`)).toEqual([["1"]]);
  // Booked order: totals and snapshot unchanged.
  const o2: J = (await api(page, `/v1/admin/orders/${order.id}`)).order;
  expect([o2.totalPaise, o2.subtotalPaise, o2.goldRateSnapshot]).toEqual([order.totalPaise, order.subtotalPaise, order.goldRateSnapshot]);
  // Catalog re-prices.
  const d2: J = (await api(page, "/v1/admin/designs")).find((d: J) => d.id === design.id);
  expect(d2.price.ratePaisePerGram).toBe(next);
  expect(d2.price.unitPricePaise).toBeGreaterThan(design.price.unitPricePaise);

  await page.goto("/admin/catalog");
  await expect(page.getByText(`22K ${formatRate(next)}`)).toBeVisible();
  await expect(page.locator("tbody tr").filter({ hasText: design.sku }).getByText(formatINR(d2.price.unitPricePaise))).toBeVisible();
  await page.goto("/admin/orders/" + order.id);
  await expect(page.getByText(formatINR(order.totalPaise)).first()).toBeVisible();
  await expect(page.getByText(new RegExp(`Today's 22K rate is ${formatRate(next).replace(/[.]/g, "\\.")}`))).toBeVisible();
  await expect(page.getByText("This order's totals never change.").first()).toBeVisible();
  w.assertClean();
});

test("a stale tab converges, a failed write shows an error and no success, an expired session returns to the record", async ({ page, context, browser }) => {
  await reseed(page.request);
  await login(context, PRIYA);
  const pending: J[] = await api(page, "/v1/admin/orders?status=PENDING_APPROVAL");
  const [a, b] = pending;

  // Tab B shows the pending list; tab A approves; B converges on focus / poll without a reload.
  const tabB = await context.newPage();
  await tabB.goto("/admin/orders?view=pending");
  await expect(tabB.getByRole("button", { name: /^Pending approval\s*2$/ })).toBeVisible();
  await page.goto(`/admin/orders/${a.id}`);
  await page.getByRole("button", { name: "Approve order" }).click();
  await expect(toast(page, `${a.number} approved`)).toBeVisible();
  await tabB.bringToFront();
  await tabB.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(tabB.getByRole("button", { name: /^Pending approval\s*1$/ })).toBeVisible({ timeout: 25_000 });
  await tabB.close();

  // A 500 from the API: error toast, the order stays pending on screen and in the database.
  await page.goto(`/admin/orders/${b.id}`);
  await page.route(`**/api/v1/admin/orders/${b.id}/approve`, (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "INTERNAL", message: "Something broke on our side" } }) }));
  await page.getByRole("button", { name: "Approve order" }).click();
  await expect(toast(page, "Something broke on our side")).toBeVisible();
  await expect(toast(page, `${b.number} approved`)).toHaveCount(0);
  await expect(page.getByText("Waiting for your approval")).toBeVisible();
  expect(sql(`select status from "Order" where id='${b.id}'`)).toEqual([["PENDING_APPROVAL"]]);
  await page.unroute(`**/api/v1/admin/orders/${b.id}/approve`);

  // Session expires mid-action: the write gets 401, refresh fails, login with ?next= brings Priya back here.
  await context.clearCookies();
  await page.getByRole("button", { name: "Approve order" }).click();
  await expect(page).toHaveURL(new RegExp(`/login\\?next=%2Fadmin%2Forders%2F${b.id}`));
  expect(sql(`select status from "Order" where id='${b.id}'`)).toEqual([["PENDING_APPROVAL"]]);
  await page.getByLabel(/email/i).fill(PRIYA.email);
  await page.getByLabel(/password/i).fill(PRIYA.password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/orders/${b.id}$`));
  await expect(page.getByText("Waiting for your approval")).toBeVisible();
  void browser;
});
