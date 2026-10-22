/* Screenshot sweep (not a test of behaviour): every public, manager and field page at 390, 768 and 1440,
 * on fresh demo data with one real visit in progress (checked in, arrival photo) and one pending memo ack.
 * Opt-in: SCREENS=1 [SCREENS_DIR=…] pnpm exec playwright test e2e/admin-screens.spec.ts --project admin */
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { test, expect, type APIRequestContext, type Browser } from "@playwright/test";
import { PRIYA, RAHUL, WEB, login, reseed } from "./helpers";

/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads */
type Any = any;
const DIR = process.env.SCREENS_DIR ?? "../../docs/overnight/screens";
const WIDTHS = [390, 768, 1440] as const;
const HEIGHT: Record<number, number> = { 390: 844, 768: 1024, 1440: 900 };
const SHOP_JPEG = "/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAoKADAAQAAAABAAAAeAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAeACgAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQACv/aAAwDAQACEQMRAD8A+hKKKK/hs/cAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD/9D6Eooor+Gz9wCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/0foSiiiv4bP3AKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//S+hKKKK/hs/cAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD/9P6Eooor+Gz9wCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/1PoSiiiv4bP3AKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//V+hKKKK/hs/cAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD/9b6Eooor+Gz9wCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/2Q==";

async function call(req: APIRequestContext, method: "GET" | "POST", path: string, data?: unknown): Promise<Any> {
  const r = await req.fetch(`${WEB}/api${path}`, { method, data, headers: method === "POST" ? { "Idempotency-Key": randomUUID() } : {} });
  const json = await r.json().catch(() => null);
  expect(r.ok(), `${method} ${path} → ${r.status()} ${JSON.stringify(json)}`).toBeTruthy();
  return json.data;
}

/** Rahul checks in at Sharma with a photo and leaves one piece on memo; returns ids for the record pages. */
async function stage(browser: Browser) {
  const ctx = await browser.newContext();
  await login(ctx, RAHUL);
  const req = ctx.request;
  const v = (await call(req, "GET", "/v1/field/today")).visits.find((x: Any) => x.shop.name === "Sharma Jewellers");
  let visit = await call(req, "GET", `/v1/visits/${v.id}`);
  const shop = visit.visit.shop;
  const at = { lat: shop.lat + 20 / 111_320, lng: shop.lng, accuracyM: 12 };
  await call(req, "POST", `/v1/visits/${v.id}/check-in`, at);
  const jpeg = Buffer.from(SHOP_JPEG, "base64"); // a real (tiny) JPEG, so photo thumbnails render
  const tok = await call(req, "POST", "/v1/uploads/proof-token", { visitId: v.id, contentType: "image/jpeg", sizeBytes: jpeg.length });
  const u = (await (await req.post(`${WEB}/api/v1/uploads/direct`, { multipart: { pathname: tok.pathname, file: { name: "arrival.jpg", mimeType: "image/jpeg", buffer: jpeg } } })).json()).data;
  await call(req, "POST", `/v1/visits/${v.id}/proofs`, { objectKey: u.objectKey, url: u.url, contentType: "image/jpeg", sizeBytes: jpeg.length, checksumSha256: createHash("sha256").update(jpeg).digest("hex"), capturedAt: new Date().toISOString(), captureLat: at.lat, captureLng: at.lng });
  visit = await call(req, "GET", `/v1/visits/${v.id}`);
  const due = new Date(Date.now() + 5 * 864e5 + 5.5 * 36e5).toISOString().slice(0, 10);
  const mm = await call(req, "POST", "/v1/memos", { visitId: v.id, pieceIds: [visit.bag[0].id], dueDate: due });
  await ctx.close();
  return { visitId: v.id as string, ackToken: mm.ack.url.split("/ack/")[1] as string };
}

test.skip(!process.env.SCREENS, "screenshot sweep runs only with SCREENS=1");
test.setTimeout(900_000);

test("screens at 390, 768 and 1440", async ({ browser, request }) => {
  await reseed(request);
  const { visitId, ackToken } = await stage(browser);
  const admin = await browser.newContext();
  await login(admin, PRIYA);
  const a = admin.request;
  const first = async (path: string) => { const d = await call(a, "GET", path); return (Array.isArray(d) ? d : d.items)[0]; };
  const sharma = (await call(a, "GET", "/v1/admin/shops?q=Sharma")).find((s: Any) => s.name === "Sharma Jewellers");
  const pending = await first("/v1/admin/orders?status=PENDING_APPROVAL");
  const memo = await first("/v1/admin/memos");
  const piece = await first("/v1/admin/pieces?q=AJ-S-000123");
  const rahul = (await call(a, "GET", "/v1/admin/agents")).find((x: Any) => x.name === "Rahul Verma");
  await admin.close();

  const pages: { name: string; path: string; who: "public" | "admin" | "field" }[] = [
    { name: "landing", path: "/", who: "public" },
    { name: "login", path: "/login", who: "public" },
    { name: "signup", path: "/signup", who: "public" },
    { name: "developers", path: "/developers", who: "public" },
    { name: "ack-pending", path: `/ack/${ackToken}`, who: "public" },
    { name: "admin-home", path: "/admin", who: "admin" },
    { name: "admin-visits", path: "/admin/visits", who: "admin" },
    { name: "admin-visit-record", path: `/admin/visits/${visitId}`, who: "admin" },
    { name: "admin-agents", path: "/admin/agents", who: "admin" },
    { name: "admin-agent-record", path: `/admin/agents/${rahul.id}`, who: "admin" },
    { name: "admin-shops", path: "/admin/shops", who: "admin" },
    { name: "admin-shop-record", path: `/admin/shops/${sharma.id}`, who: "admin" },
    { name: "admin-orders", path: "/admin/orders", who: "admin" },
    { name: "admin-order-record", path: `/admin/orders/${pending.id}`, who: "admin" },
    { name: "admin-memos", path: "/admin/memos", who: "admin" },
    { name: "admin-memo-record", path: `/admin/memos/${memo.id}`, who: "admin" },
    { name: "admin-samples", path: "/admin/samples", who: "admin" },
    { name: "admin-sample-record", path: `/admin/samples/${piece.id}`, who: "admin" },
    { name: "admin-catalog", path: "/admin/catalog", who: "admin" },
    { name: "admin-integrations", path: "/admin/integrations", who: "admin" },
    { name: "admin-settings", path: "/admin/settings", who: "admin" },
    { name: "field-today", path: "/field/today", who: "field" },
    { name: "field-visits", path: "/field/visits", who: "field" },
    { name: "field-active-visit", path: `/field/visits/${visitId}`, who: "field" },
    { name: "field-sale", path: `/field/visits/${visitId}/sale`, who: "field" },
    { name: "field-catalog", path: "/field/catalog", who: "field" },
    { name: "field-profile", path: "/field/profile", who: "field" },
  ];

  for (const w of WIDTHS) {
    mkdirSync(`${DIR}/${w}`, { recursive: true });
    const ctxs = {
      public: await browser.newContext({ viewport: { width: w, height: HEIGHT[w] } }),
      admin: await browser.newContext({ viewport: { width: w, height: HEIGHT[w] } }),
      field: await browser.newContext({ viewport: { width: w, height: HEIGHT[w] }, isMobile: w < 1000, hasTouch: w < 1000, geolocation: { latitude: 28.6519, longitude: 77.1907, accuracy: 12 }, permissions: ["geolocation"] }),
    };
    await login(ctxs.admin, PRIYA);
    await login(ctxs.field, RAHUL);
    for (const p of pages) {
      const page = await ctxs[p.who].newPage();
      await page.goto(p.path, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
      await page.waitForTimeout(700); // map tiles, fonts, entrance motion
      await page.screenshot({ path: `${DIR}/${w}/${p.name}.png` });
      await page.close();
    }
    for (const c of Object.values(ctxs)) await c.close();
  }
});
