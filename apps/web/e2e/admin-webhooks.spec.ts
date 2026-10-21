/* Webhooks as the manager sees them (Integrations, 1440×900): a failing endpoint walks the whole retry
 * ladder (30 s, 2 min, 10 min, 30 min, 2 h, 6 h) into the dead letter list, then is retried by hand.
 * Time is travelled in SQL (nextAttemptAt → the past) and the dispatcher is triggered by the UI's own
 * delivery-log poll once and by the cron endpoint after that. Persisted state is read from the API and
 * the database, never from the page alone. Reseeds the demo tenant first. */
import { test, expect, type Page } from "@playwright/test";
import { API, PRIYA, api, login, reseed, watch } from "./helpers";
import { dispatch, sql } from "./admin-helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- API JSON in tests
type J = any;
const BACKOFF = [30, 120, 600, 1800, 7200, 21600];
const toast = (page: Page, text: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: text }).first();
const delivery = (id: string) => {
  const [r] = sql(`select status, attempts, extract(epoch from ("nextAttemptAt" - now()))::int, "lastStatusCode" from "WebhookDelivery" where id='${id}'`);
  return { status: r[0], attempts: Number(r[1]), nextInS: r[2] === "" ? null : Number(r[2]), code: r[3] };
};

test("failing endpoint: retrying on the backoff ladder → dead letter → manual retry; payload, headers, rotate, events, disable", async ({ page, context }) => {
  test.setTimeout(240_000);
  await reseed(page.request);
  await login(context, PRIYA);
  const w = watch(page);
  const token = `fail-e2e-${Date.now().toString(36)}`;
  const failUrl = `${API}/v1/dev/webhook-receiver/${token}`;

  // Add the endpoint; the signing secret is shown once.
  await page.goto("/admin/integrations");
  await page.getByRole("button", { name: "Add endpoint" }).first().click();
  const add = page.getByRole("dialog");
  await add.getByPlaceholder("https://erp.example.in/hooks/jewelroute").fill(failUrl);
  await add.getByPlaceholder(/Tally sync/).fill("Failing receiver (E2E)");
  await add.getByRole("button", { name: "Add endpoint" }).click();
  await expect(toast(page, "Endpoint added")).toBeVisible();
  const secret = (await page.getByRole("dialog").locator("code").textContent())!.trim();
  expect(secret).toMatch(/^whsec_/);
  await page.getByRole("button", { name: "I've saved it" }).click();
  const eps: J[] = await api(page, "/v1/admin/webhooks");
  const ep = eps.find((e) => e.url === failUrl);
  expect(ep).toBeTruthy();
  expect(ep.active).toBe(true);
  expect(ep.secretLast4).toBe(secret.slice(-4));
  await expect(page).toHaveURL(new RegExp(`endpoint=${ep.id}`));
  expect(sql(`select url, active from "WebhookEndpoint" where id='${ep.id}'`)).toEqual([[failUrl, "t"]]);

  // Test event → the receiver answers 500 → Retrying, next attempt in 30 s.
  await page.getByRole("button", { name: "Send test event" }).click();
  await expect(page.getByText("HTTP 500").first()).toBeVisible();
  const list: J[] = await api(page, `/v1/admin/webhooks/deliveries?endpointId=${ep.id}`);
  const ping = list.find((d) => d.eventType === "ping");
  let d = delivery(ping.id);
  expect(d).toMatchObject({ status: "FAILED", attempts: 1, code: "500" });
  expect(Math.abs(d.nextInS! - BACKOFF[0])).toBeLessThanOrEqual(10);
  const row = page.locator("tbody tr").filter({ hasText: "ping" });
  await expect(row.getByText("Retrying")).toBeVisible();
  await expect(row.getByText(/next in/)).toBeVisible();
  await expect(row.getByText("1 / 7")).toBeVisible();
  // Failing deliveries raise a Home attention item.
  await page.goto("/admin");
  await expect(page.getByRole("button", { name: new RegExp(`Webhook endpoint failing.*${token}`) })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`endpoint=${ep.id}`));

  // Attempt 2 is due: the open delivery log's own poll triggers the dispatcher (no cron call).
  sql(`update "WebhookDelivery" set "nextAttemptAt" = now() - interval '1 second' where id='${ping.id}'`);
  await expect(row.getByText("2 / 7")).toBeVisible({ timeout: 40_000 });
  d = delivery(ping.id);
  expect(d).toMatchObject({ status: "FAILED", attempts: 2 });
  expect(Math.abs(d.nextInS! - BACKOFF[1])).toBeLessThanOrEqual(15);

  // Attempts 3…7 via the cron endpoint; each failure schedules the next rung, the 7th is the dead letter.
  for (let n = 3; n <= 7; n++) {
    sql(`update "WebhookDelivery" set "nextAttemptAt" = now() - interval '1 second' where id='${ping.id}'`);
    await dispatch(page.request);
    d = delivery(ping.id);
    expect(d.attempts, `attempt ${n}`).toBe(n);
    if (n < 7) {
      expect(d.status).toBe("FAILED");
      expect(Math.abs(d.nextInS! - BACKOFF[n - 1]), `backoff after attempt ${n}`).toBeLessThanOrEqual(15);
    } else expect(d.status).toBe("DEAD");
  }
  expect(sql(`select count(*) from "WebhookAttempt" where "deliveryId"='${ping.id}'`)).toEqual([["7"]]);
  await expect(row.getByText("Dead letter")).toBeVisible({ timeout: 15_000 });
  await expect(row.getByText("after 7")).toBeVisible();
  await page.getByRole("button", { name: /^Dead letter\s*\d+$/ }).click();
  await expect(page).toHaveURL(/status=DEAD/);
  await expect(page.locator("tbody tr").filter({ hasText: "ping" })).toHaveCount(1);

  // Payload inspector: exact signed headers of the last attempt, the payload, all 7 attempts.
  await page.locator("tbody tr").filter({ hasText: "ping" }).click();
  await expect(page).toHaveURL(new RegExp(`delivery=${ping.id}`));
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("7 of 7")).toBeVisible();
  await expect(sheet.getByText("Exactly as sent on attempt 7")).toBeVisible();
  await expect(sheet.getByText(/^sha256=[0-9a-f]{64}$/)).toBeVisible();
  await expect(sheet.locator("pre")).toContainText(`"type": "ping"`);
  await expect(sheet.locator("ol > li")).toHaveCount(7);
  await page.reload();
  await expect(page.getByRole("dialog").getByText("7 of 7")).toBeVisible();

  // Manual retry while still failing: one more immediate attempt, still a dead letter.
  await page.getByRole("dialog").getByRole("button", { name: "Retry now" }).click();
  await expect(toast(page, "Retry sent")).toBeVisible();
  await expect.poll(() => delivery(ping.id).attempts).toBe(8);
  expect(delivery(ping.id).status).toBe("DEAD");
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/delivery=/);

  // Fix the URL, retry by hand → delivered, and the built-in receiver verified the signature.
  const okUrl = `${API}/v1/dev/webhook-receiver/ok-e2e-${Date.now().toString(36)}`;
  await page.getByRole("button", { name: "Edit URL" }).click();
  await page.locator("form input").first().fill(okUrl);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(toast(page, "Endpoint URL saved")).toBeVisible();
  expect(sql(`select url from "WebhookEndpoint" where id='${ep.id}'`)).toEqual([[okUrl]]);
  await page.locator("tbody tr").filter({ hasText: "ping" }).getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => delivery(ping.id).status).toBe("SUCCEEDED");
  expect(delivery(ping.id)).toMatchObject({ attempts: 9, code: "200" });
  await page.getByRole("button", { name: /^All\s*\d+$/ }).first().click();
  await expect(page.locator("tbody tr").filter({ hasText: "ping" }).getByText("Delivered")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /Test receiver/ }).click();
  await expect(page).toHaveURL(/tab=receiver/);
  await expect(page.getByText("Signature verified").first()).toBeVisible();
  const received: J[] = await api(page, `/v1/admin/webhooks/received?endpointId=${ep.id}`);
  expect(received.find((r) => r.deliveryId === ping.id)?.signatureOk).toBe(true);
  await page.getByRole("button", { name: /Verify signatures/ }).click();
  await expect(page.getByText(/createHmac\("sha256", secret\)/)).toBeVisible();

  // Rotate: the old secret stops, the new one is shown once and signs the next delivery.
  await page.getByRole("button", { name: "Rotate" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Rotate secret" }).click();
  await expect(toast(page, /Secret rotated/)).toBeVisible();
  const fresh = (await page.getByRole("dialog").locator("code").textContent())!.trim();
  expect(fresh).toMatch(/^whsec_/);
  expect(fresh).not.toBe(secret);
  await page.getByRole("button", { name: "I've saved it" }).click();
  expect((await api(page, "/v1/admin/webhooks")).find((e: J) => e.id === ep.id).secretLast4).toBe(fresh.slice(-4));
  await page.getByRole("button", { name: "Send test event" }).click();
  await expect(page.getByText("HTTP 200").first()).toBeVisible();
  await expect.poll(async () => (await api(page, `/v1/admin/webhooks/received?endpointId=${ep.id}`)).filter((r: J) => r.signatureOk).length).toBe(2);

  // Events: subscribe to one event only.
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const ev = page.getByRole("dialog");
  await ev.getByText(/^All \d+ events$/).click();
  await ev.getByText("order.approved", { exact: true }).click();
  await ev.getByRole("button", { name: "Save events" }).click();
  await expect(toast(page, "Event subscriptions saved")).toBeVisible();
  expect((await api(page, "/v1/admin/webhooks")).find((e: J) => e.id === ep.id).events).toEqual(["order.approved"]);
  await expect(page.getByText(/^1 of \d+$/)).toBeVisible();

  // Disable: new deliveries are parked, test sends are off.
  await page.getByRole("switch", { name: "Endpoint enabled" }).click();
  await expect(toast(page, /Endpoint disabled/)).toBeVisible();
  expect(sql(`select active from "WebhookEndpoint" where id='${ep.id}'`)).toEqual([["f"]]);
  await expect(page.getByRole("button", { name: "Send test event" })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("switch", { name: "Endpoint enabled" })).not.toBeChecked();
  w.assertClean();
});
