import type { Metadata } from "next";
import Link from "next/link";
import { formatINR, formatRate, orderTotals, priceDesign } from "@jewelroute/shared";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { CodePanel, CopyButton } from "@/components/public/docs/code-panel";
import { DocsNav, type DocsGroup } from "@/components/public/docs/docs-nav";
import { EventCatalogue } from "@/components/public/docs/event-catalogue";
import { EVENTS } from "@/components/public/docs/examples";
import { B, C, DocSection, H3, Li, MONO, P, PROSE, Ul } from "@/components/public/docs/prose";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Developers: API and webhooks",
  description: "Authenticate, call the JewelRoute REST API, verify signed webhooks and see every event JewelRoute sends: visits, orders, memos and sample custody.",
  openGraph: { title: "JewelRoute for developers", description: "REST API, signed webhooks, integer-paise money, idempotency keys and the full event catalogue." },
};

/* Everything on this page is taken from the code: packages/shared (events, pricing), apps/api
 * (auth cookies, error envelope, idempotency, webhook dispatcher BACKOFF_SECONDS, EXAMPLES) and
 * docs/CONTRACT.md. When those change, change this page. */

const GROUPS: DocsGroup[] = [
  { title: "Overview", items: [{ id: "introduction", label: "Introduction" }] },
  { title: "Concepts", items: [{ id: "auth", label: "Authentication and cookies" }, { id: "tenancy", label: "Tenancy and roles" }, { id: "idempotency", label: "Idempotency keys" }, { id: "money", label: "Money in paise" }, { id: "errors", label: "Errors" }, { id: "paging", label: "Pagination" }] },
  { title: "Orders", items: [{ id: "approval", label: "Approval rules" }] },
  { title: "Webhooks", items: [{ id: "webhooks", label: "How delivery works" }, { id: "signatures", label: "Verifying signatures" }, { id: "retries", label: "Retries and dead letters" }, { id: "events", label: "Event catalogue" }, { id: "testing", label: "Testing" }] },
  { title: "Reference", items: [{ id: "endpoints", label: "Key endpoints" }, { id: "outbox", label: "Event outbox" }, { id: "architecture", label: "Architecture" }] },
];

/** Real payloads captured from the outbox (see components/public/docs/examples.ts). */
const CREATED = EVENTS["order.created"];
const PENDING = EVENTS["order.pending_approval"];

const ENDPOINTS: [string, string, string][] = [
  ["POST", "/v1/auth/login", "Email + password. Sets the session cookies and returns the tokens."],
  ["POST", "/v1/auth/refresh", "Rotate the refresh token (cookie or body) for a new access token."],
  ["GET", "/v1/field/today", "The agent's route for a day, bag value, open memos and any visit left open."],
  ["GET", "/v1/visits/:id", "One visit with its resumable state, orders, memos and the bag."],
  ["POST", "/v1/visits/:id/check-in", "Geofenced check-in, verified on the server."],
  ["POST", "/v1/visits/:id/proofs", "Attach an uploaded arrival photo (SHA-256 checked)."],
  ["GET", "/v1/visits/:id/credit?amountPaise=", "The shop's credit position for a prospective order."],
  ["POST", "/v1/orders", "Book an order at today's rates. Confirms, or waits for approval if a rule trips."],
  ["POST", "/v1/memos", "Leave exact pieces with a retailer; moves custody."],
  ["POST", "/v1/memos/:id/return", "Pieces come back to the agent's bag."],
  ["POST", "/v1/memos/:id/convert", "Pieces the retailer keeps become one order at today's rate."],
  ["GET", "/v1/admin/home", "Today's metrics, the attention list and live activity."],
  ["GET", "/v1/admin/shops", "Every shop with its agent, credit position, memos and samples."],
  ["POST", "/v1/admin/orders/approve", "Approve up to 200 pending orders, each in its own transaction."],
  ["POST", "/v1/admin/orders/:id/settle", "Mark an order paid; it stops counting towards outstanding."],
  ["GET", "/v1/admin/pieces/:id", "One sample: where it is now and its full custody ledger."],
  ["POST", "/v1/admin/gold-rates", "Append a new rate for a purity. Existing orders never change."],
  ["PATCH", "/v1/admin/settings", "Set the approval threshold (or null for none)."],
  ["GET", "/v1/admin/webhooks/deliveries", "Delivery log, newest first; cursor-paged."],
];

const ERRORS: [number, string, string][] = [
  [400, "VALIDATION_FAILED", "The body or query failed validation; details list each field."],
  [400, "IDEMPOTENCY_KEY_REQUIRED", "A create call was sent without an Idempotency-Key."],
  [401, "TOKEN_EXPIRED", "The access token expired. Refresh once, then retry."],
  [401, "INVALID_CREDENTIALS", "Email or password is incorrect."],
  [401, "ACCOUNT_DISABLED", "The user was deactivated; refreshing fails too."],
  [403, "SIMULATION_NOT_ALLOWED", "Simulated check-in on a tenant that is not in demo mode."],
  [404, "NOT_FOUND", "Missing, or belongs to another tenant or agent (never 403)."],
  [409, "OUTSIDE_GEOFENCE", "Check-in from outside the shop's fence; details carry the distance."],
  [409, "PROOF_REQUIRED_BEFORE_SALE", "Orders and memos need an arrival photo on the visit first."],
  [409, "PIECE_NOT_IN_YOUR_CUSTODY", "A memo named a piece the agent does not hold."],
  [409, "ORDER_ALREADY_DECIDED", "Someone approved or rejected it first; details name who."],
  [410, "ACK_EXPIRED", "The retailer's acknowledgement link is older than 72 hours."],
  [422, "IDEMPOTENCY_KEY_REUSED", "Same key, different body."],
  [429, "RATE_LIMITED", "Too many requests (sign-in is limited to 10 a minute)."],
];

const LADDER: { at: string; wait: string }[] = [
  { at: "0 s", wait: "Immediately" }, { at: "30 s", wait: "+30 s" }, { at: "2 m 30 s", wait: "+2 min" }, { at: "12 m 30 s", wait: "+10 min" },
  { at: "42 m 30 s", wait: "+30 min" }, { at: "2 h 43 m", wait: "+2 h" }, { at: "8 h 43 m", wait: "+6 h" },
];

const RATE = 1052500;
const KADA = priceDesign({ netWeightMg: 31930, ratePaisePerGram: RATE, makingChargeType: "PER_GRAM", makingChargeValue: 65000, stoneValuePaise: 0 });
const KADA_ORDER = orderTotals([KADA.unitPricePaise]);

const CREDIT_JSON = JSON.stringify((PENDING.data as { credit: unknown }).credit, null, 2);

const NODE = `import crypto from "node:crypto";
import express from "express";

const app = express();
const SECRET = process.env.JEWELROUTE_WEBHOOK_SECRET; // whsec_…
const raw = express.raw({ type: "application/json" }); // sign the exact bytes

app.post("/hooks/jewelroute", raw, (req, res) => {
  const ts = req.get("X-JewelRoute-Timestamp");
  const sig = req.get("X-JewelRoute-Signature") ?? "";
  const body = req.body.toString("utf8");

  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (age > 300) return res.status(400).send("stale");

  const expected = "sha256=" + crypto
    .createHmac("sha256", SECRET)
    .update(\`\${ts}.\${body}\`)
    .digest("hex");
  const ok = sig.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!ok) return res.status(401).send("bad signature");

  const event = JSON.parse(body);
  queue.add(event.type, event); // dedupe on event.id
  res.sendStatus(200);          // answer fast
});`;

const PY = `import hashlib, hmac, os, time
from flask import Flask, request, abort

app = Flask(__name__)
SECRET = os.environ["JEWELROUTE_WEBHOOK_SECRET"].encode()  # whsec_…

@app.post("/hooks/jewelroute")
def jewelroute():
    ts = request.headers.get("X-JewelRoute-Timestamp", "")
    sig = request.headers.get("X-JewelRoute-Signature", "")
    body = request.get_data()  # raw bytes, before parsing

    if abs(time.time() - int(ts or 0)) > 300:
        abort(400)
    mac = hmac.new(SECRET, ts.encode() + b"." + body, hashlib.sha256)
    if not hmac.compare_digest(sig, "sha256=" + mac.hexdigest()):
        abort(401)

    event = request.get_json()  # dedupe on event["id"]
    return "", 200`;

const HEADERS_T = () => `POST /hooks/jewelroute HTTP/1.1
Content-Type: application/json
User-Agent: JewelRoute-Webhooks/1.0
X-JewelRoute-Event: order.created
X-JewelRoute-Delivery: cmvij9f2k009c7de7x1q0dlv4
X-JewelRoute-Timestamp: ${Math.floor(Date.parse(CREATED.createdAt) / 1000)}
X-JewelRoute-Signature: sha256=5b0e…c41d`;

const PAYLOAD = JSON.stringify(CREATED, null, 2);

const ARCH: [string, React.ReactNode][] = [
  ["Web", "Next.js (App Router) for the field app, the manager app and this site. The browser only calls /api/v1 on its own origin, proxied to the API, so session cookies stay first-party."],
  ["API", "NestJS on Node. Request bodies are validated with zod; errors use one envelope with a stable code."],
  ["Database", "PostgreSQL through Prisma. Invariants live in SQL: one custodian per piece, a piece out on at most one memo, one open visit per agent, append-only rate, order-line and custody tables (triggers refuse UPDATE and DELETE), CHECKs on totals."],
  ["Custody", "One service moves pieces: it locks them in id order, checks the expected custodian, appends a gap-free ledger row, and writes one outbox event and one audit row in the caller's transaction."],
  ["Files", "Arrival photos upload straight to object storage with a scoped token; the server stores a SHA-256 for each."],
  ["Time", "Business dates are India time (IST). Check-in is only allowed on the visit's planned date."],
];

const METHOD = { GET: "text-info", POST: "text-verified", PATCH: "text-warn", DELETE: "text-danger" } as Record<string, string>;

function Facts() {
  const facts: [string, React.ReactNode, string?][] = [
    ["Base URL", <span key="b" className={MONO}>https://&lt;api-host&gt;/v1</span>],
    ["Format", <span key="f">JSON · <span className={MONO}>{"{ ok, data }"}</span></span>],
    ["Auth", "Session cookies or a Bearer JWT"],
    ["Reference", <span key="r" className={MONO}>&lt;api-host&gt;/docs</span>, "https://<api-host>/docs"],
  ];
  return (
    <dl className="mt-8 grid overflow-hidden rounded-[12px] border border-line sm:grid-cols-2 xl:grid-cols-4">
      {facts.map(([k, v, copy], i) => (
        <div key={k} className={cn("min-w-0 border-line px-4 py-3.5", i > 0 && "max-sm:border-t", i % 2 === 1 && "sm:border-l", i >= 2 && "sm:max-xl:border-t", i === 2 && "xl:border-l")}>
          <dt className="text-[12.5px] text-ink-3">{k}</dt>
          <dd className="mt-1 flex items-center gap-1 text-[14px] text-ink">{v}{copy && <CopyButton text={copy} tone="light" label="Copy the Swagger address" className="-my-1 ml-auto" />}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function Developers() {
  return (
    <div className="min-h-dvh bg-white text-ink">
      <SiteHeader current="developers" />
      <div className="mx-auto max-w-[1440px] lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
        <DocsNav
          groups={GROUPS}
          footer={
            <div className="rounded-[10px] border border-line px-3 py-3 text-[12.5px] leading-relaxed text-ink-2">
              <div className="font-medium text-ink">Full API reference</div>
              <p className="mt-1">Swagger UI and the OpenAPI JSON are served by the API host:</p>
              <div className={cn("mt-2 space-y-1 text-[12px] text-ink", MONO)}><div>&lt;api-host&gt;/docs</div><div>&lt;api-host&gt;/docs-json</div></div>
            </div>
          }
        />
        <main className="min-w-0">
          <header className="px-5 pt-10 pb-12 sm:px-8 lg:px-12 lg:pt-14 lg:pb-14">
            <p className="text-[14px] font-medium text-ink-2">Developers</p>
            <h1 className="mt-2 text-balance text-[32px] leading-[1.12] font-semibold tracking-[-0.022em] text-ink sm:text-[38px]">JewelRoute API and webhooks</h1>
            <p className="mt-4 max-w-[640px] text-pretty text-[17px] leading-[1.55] text-[#45464b]">
              Build on the same REST API the field app and the manager app use, and receive a signed webhook for every visit, order, memo and custody move.
            </p>
            <Facts />
          </header>

          <DocSection
            id="introduction" title="Introduction"
            code={<CodePanel title="Every response" snippets={[{ label: "Success", lang: "json", code: `{\n  "ok": true,\n  "data": { "id": "clo…", "number": "ORD-2026-00042" }\n}` }, { label: "Error", lang: "json", code: `{\n  "ok": false,\n  "error": { "code": "NOT_FOUND", "message": "Order not found" },\n  "requestId": "req_8f2c1a"\n}` }]} />}
          >
            <P>Everything lives under <C>/v1</C> and speaks JSON. Every response carries <C>ok</C>; success puts the result in <C>data</C>, failure puts a stable machine code in <C>error</C>. In the browser, the web app calls <C>/api/v1/…</C> on its own origin and a rewrite forwards it, so cookies stay first-party.</P>
            <Ul>
              <Li>Money is integer paise (<C>…Paise</C>), weight integer milligrams (<C>…Mg</C>), distances metres (<C>…M</C>).</Li>
              <Li>Timestamps are ISO-8601 UTC; business dates are <C>YYYY-MM-DD</C> in India time.</Li>
              <Li>Every response has an <C>x-request-id</C> header; errors repeat it as <C>requestId</C>.</Li>
            </Ul>
            <P>The complete, always-current reference is Swagger UI at <C>&lt;api-host&gt;/docs</C> (OpenAPI JSON at <C>/docs-json</C>) on the API host. This page explains the parts that need more than a schema.</P>
          </DocSection>

          <DocSection
            id="auth" title="Authentication and cookies" eyebrow="Concepts"
            code={<>
              <CodePanel title="Sign in" snippets={[{ label: "cURL", lang: "bash", code: `curl -X POST https://<api-host>/v1/auth/login \\\n  -H "Content-Type: application/json" \\\n  -d '{"email":"admin@aurum.test","password":"…"}'` }]} />
              <CodePanel title="Call with a bearer token" snippets={[{ label: "cURL", lang: "bash", code: `curl https://<api-host>/v1/admin/home \\\n  -H "Authorization: Bearer $ACCESS_TOKEN"\n\n# 401 TOKEN_EXPIRED → refresh once, then retry\ncurl -X POST https://<api-host>/v1/auth/refresh \\\n  -H "Content-Type: application/json" \\\n  -d '{"refreshToken":"…"}'` }]} />
            </>}
          >
            <P><C>POST /v1/auth/login</C> with an email and password sets two httpOnly cookies and also returns both tokens, so server-to-server clients can use a bearer header instead.</P>
            <div className="mt-5 overflow-hidden rounded-[10px] border border-line text-[13.5px]">
              {([["jr_at", "Access token (JWT)", "15 minutes"], ["jr_rt", "Refresh token, rotated on every use", "30 days"], ["jr_dev", "Device id, kept across sign-ins", "365 days"]] as const).map(([n, d, t], i) => (
                <div key={n} className={cn("grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-2.5", i > 0 && "border-t border-line")}>
                  <span className={cn("text-[13px] text-ink", MONO)}>{n}</span><span className="text-ink-2">{d}</span><span className="num text-ink-3">{t}</span>
                </div>
              ))}
            </div>
            <P>All three are <C>HttpOnly</C>, <C>SameSite=Lax</C>, path <C>/</C>, and <C>Secure</C> in production. On <C>401 TOKEN_EXPIRED</C>, call <C>POST /v1/auth/refresh</C> once and retry. A refresh token presented again after rotation is treated as theft and revokes every session of that user (one immediate retry from the same browser is tolerated). <C>POST /v1/auth/logout</C> ends this session; <C>/v1/auth/logout-all</C> ends all of them.</P>
          </DocSection>

          <DocSection
            id="tenancy" title="Tenancy and roles"
            code={<CodePanel title="Access token, decoded" snippets={[{ label: "JWT payload", lang: "json", code: `{\n  "sub": "usr_…",\n  "tid": "tnt_…",\n  "tslug": "aurum",\n  "role": "ADMIN",\n  "name": "Priya Mehta",\n  "iss": "jewelroute",\n  "iat": 1792561964,\n  "exp": 1792562864\n}` }]} />}
          >
            <P>The tenant always comes from the verified token (<C>tid</C>), never from the request. Every query is scoped to it on the server, so there is no way to name another company&apos;s data.</P>
            <Ul>
              <Li>An id that belongs to another tenant, or to another agent&apos;s visit, returns <C>404 NOT_FOUND</C>, not <C>403</C>, so existence never leaks.</Li>
              <Li><B>Roles:</B> <C>FIELD_AGENT</C> uses <C>/v1/field/*</C>, <C>/v1/visits/*</C>, <C>/v1/orders</C> and <C>/v1/memos</C>; <C>ADMIN</C> uses <C>/v1/admin/*</C> and may read field routes.</Li>
              <Li>Demo tenants (<C>demoMode</C>) may record a check-in as <C>SIMULATED</C>. It is labelled simulated everywhere and is never counted as verified.</Li>
            </Ul>
          </DocSection>

          <DocSection
            id="idempotency" title="Idempotency keys"
            code={<CodePanel title="Book an order, safely retried" snippets={[{ label: "cURL", lang: "bash", code: `curl -X POST https://<api-host>/v1/orders \\\n  -H "Authorization: Bearer $ACCESS_TOKEN" \\\n  -H "Idempotency-Key: 6f1c2a8e-7d1b-4c5e-9a0f-2b7e3c9d4a11" \\\n  -H "Content-Type: application/json" \\\n  -d '{"visitId":"clx…","items":[{"designId":"cld…","quantity":1}]}'\n\n# Same key + same body  → the original response, nothing new is written\n# Same key + other body → 422 IDEMPOTENCY_KEY_REUSED` }]} />}
          >
            <P>Field calls that create something take an <C>Idempotency-Key</C> header. Generate one UUID per user action and reuse it on every retry, so a weak mobile connection can never book an order twice.</P>
            <Ul>
              <Li><B>Required</B> on <C>POST /v1/orders</C>, <C>/v1/memos</C>, <C>/v1/memos/:id/return</C> and <C>/v1/memos/:id/convert</C>. Without it: <C>400 IDEMPOTENCY_KEY_REQUIRED</C>.</Li>
              <Li><B>Accepted</B> on check-in, proofs, visit notes, gold rates, new shops and piece intake; they also deduplicate on their own.</Li>
              <Li>The key is stored inside the same database transaction as the order or memo, so a crash between the two is impossible.</Li>
            </Ul>
          </DocSection>

          <DocSection
            id="money" title="Money in paise"
            code={<CodePanel title="An order line, as the API returns it" snippets={[{ label: "JSON", lang: "json", code: `{\n  "sku": "AJ-BNG-2201",\n  "purity": "K22",\n  "netWeightMg": 31930,\n  "ratePaisePerGram": ${RATE},\n  "goldValuePaise": ${KADA.goldValuePaise},\n  "makingPaise": ${KADA.makingPaise},\n  "unitPricePaise": ${KADA.unitPricePaise}\n}` }]} />}
            wide={
              <div className="overflow-hidden rounded-[12px] border border-line">
                <div className="border-b border-line bg-sunken px-4 py-2.5 text-[13px] text-ink-2">Worked example: one 22K kada, 31,930 mg net, {formatRate(RATE)}, making ₹650/g</div>
                <dl className="divide-y divide-line text-[13.5px]">
                  {([
                    ["Gold value", `31930 × ${RATE} ÷ 1000`, KADA.goldValuePaise],
                    ["Making", "31930 × 65000 ÷ 1000", KADA.makingPaise],
                    ["Unit price", "gold + making + stones", KADA.unitPricePaise],
                    ["GST 3%", "subtotal × 300 ÷ 10000", KADA_ORDER.gstPaise],
                    ["Order total", "subtotal + GST", KADA_ORDER.totalPaise],
                  ] as const).map(([l, f, v]) => (
                    <div key={l} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] sm:items-center sm:gap-4">
                      <dt className={cn("text-ink", l === "Order total" && "font-medium")}>{l}</dt>
                      <dd className={cn("text-[12.5px] text-ink-3", MONO)}>{f}</dd>
                      <dd className="num flex items-baseline justify-between gap-3 sm:justify-end"><span className={cn("text-[12.5px] text-ink-3", MONO)}>{v}</span><span className={cn("w-[112px] text-right text-ink", l === "Order total" && "font-medium text-gold-ink")}>{formatINR(v)}</span></dd>
                    </div>
                  ))}
                </dl>
              </div>
            }
          >
            <P>Every amount is an integer number of paise and every weight an integer number of milligrams — in the database (<C>BIGINT</C>), in JSON and in webhooks. No floats touch money, so a total never drifts by a paisa between the phone, the order and your ledger.</P>
            <Ul>
              <Li>One pricing function, shared by the API (authoritative) and the web app (display only).</Li>
              <Li>Rounding is half-up to whole paise, once per component. GST (3%) is computed once on the order subtotal, not per line.</Li>
              <Li>Rates are append-only. Each order keeps a <C>goldRateSnapshot</C> per purity, so a new rate never touches an existing order.</Li>
            </Ul>
          </DocSection>

          <DocSection
            id="errors" title="Errors"
            code={<CodePanel title="409 Conflict" snippets={[{ label: "JSON", lang: "json", code: `{\n  "ok": false,\n  "error": {\n    "code": "OUTSIDE_GEOFENCE",\n    "message": "You are 214 m from Sharma Jewellers; check-in requires 100 m",\n    "details": { "distanceM": 214, "radiusM": 100 }\n  },\n  "requestId": "req_8f2c1a"\n}` }]} />}
            wide={
              <div className="overflow-x-auto rounded-[12px] border border-line">
                <table className="w-full min-w-[620px] text-[13.5px]">
                  <thead><tr className="h-9 border-b border-line bg-sunken text-left text-[12.5px] text-ink-3"><th className="w-16 px-4 font-medium">Status</th><th className="px-4 font-medium">Code</th><th className="px-4 font-medium">When</th></tr></thead>
                  <tbody>
                    {ERRORS.map(([st, code, when]) => (
                      <tr key={code} className="border-b border-line last:border-0">
                        <td className="num px-4 py-2.5 text-ink-2">{st}</td>
                        <td className={cn("px-4 py-2.5 text-[12.5px] text-ink", MONO)}>{code}</td>
                        <td className="px-4 py-2.5 text-ink-2">{when}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            }
          >
            <P>Branch on <C>error.code</C>, never on the message: codes are stable, messages are written for people and may change. <C>details</C> carries what you need to explain the problem, like the distance from the shop.</P>
          </DocSection>

          <DocSection
            id="paging" title="Pagination"
            code={<CodePanel title="Walk the delivery log" snippets={[{ label: "cURL", lang: "bash", code: `curl "https://<api-host>/v1/admin/webhooks/deliveries?limit=50" \\\n  -H "Authorization: Bearer $ACCESS_TOKEN"\n# → { "items": [ … ], "nextCursor": "MjAyNi0xMC0yMVQw…" }\n\ncurl "https://<api-host>/v1/admin/webhooks/deliveries?limit=50&cursor=MjAyNi0xMC0yMVQw…" \\\n  -H "Authorization: Bearer $ACCESS_TOKEN"` }]} />}
          >
            <P>Long lists (the delivery log, activity) are cursor-paged. Pass <C>limit</C> (1 to 200) and, for the next page, the <C>nextCursor</C> from the previous one. The response is <C>{"{ items, nextCursor }"}</C>; <C>nextCursor</C> is absent on the last page.</P>
            <P>Batch writes report per item. <C>POST /v1/admin/orders/approve</C> approves each order in its own transaction, so one that was already decided never blocks the rest; results come back in request order.</P>
          </DocSection>

          <DocSection
            id="approval" title="Approval rules" eyebrow="Orders"
            code={<CodePanel title={`credit · ${(PENDING.data as { number: string }).number}, from order.pending_approval`} snippets={[{ label: "JSON", lang: "json", code: CREDIT_JSON }]} />}
          >
            <P>Approval is a rule, not a default. A normal order is written as <C>CONFIRMED</C>. It becomes <C>PENDING_APPROVAL</C> only when a rule trips, evaluated on the server inside the create transaction with the shop row locked:</P>
            <Ul>
              <Li><C>CREDIT_LIMIT</C>: projected exposure is over the shop&apos;s credit limit. Exactly at the limit passes; a limit of 0 means no limit.</Li>
              <Li><C>ORDER_THRESHOLD</C>: the order total is at or above the tenant&apos;s <C>approvalThresholdPaise</C>, when one is set.</Li>
            </Ul>
            <P>Exposure is outstanding (opening balance plus unsettled confirmed and approved orders) plus the value of pieces out on memo at the shop. The agent sees the position before placing the order; the server decides again when it is written.</P>
          </DocSection>

          <DocSection
            id="webhooks" title="How delivery works" eyebrow="Webhooks"
            code={<CodePanel title="A delivery" snippets={[{ label: "Headers", lang: "http", code: HEADERS_T() }, { label: "Body", lang: "json", code: PAYLOAD }]} />}
          >
            <P>Add an endpoint on the Integrations page, choose events (or <C>*</C> for all) and keep the <C>whsec_…</C> secret: it is shown once, and every later reveal or rotation is audited. Each delivery is a <C>POST</C> with a JSON body.</P>
            <Ul>
              <Li><B>At least once.</B> Any 2xx within 10 seconds counts as delivered. Retries and manual resends reuse the event <C>id</C>, so deduplicate on it.</Li>
              <Li><B>Not ordered.</B> A retry can arrive after a newer event; order by <C>createdAt</C>.</Li>
              <Li><B>Same envelope for every event.</B> <C>data</C> carries the objects involved; treat unknown fields as additive.</Li>
            </Ul>
            <H3 id="payload">Payload</H3>
            <P><C>id</C> (the <C>evt_…</C> id, also on the activity feed and the custody ledger), <C>type</C>, <C>tenantId</C> (the tenant&apos;s slug), <C>createdAt</C> and <C>data</C>.</P>
          </DocSection>

          <DocSection
            id="signatures" title="Verifying signatures"
            code={<>
              <CodePanel title="Signature" numbers={false} wrap snippets={[{ label: "Formula", lang: "text", code: `X-JewelRoute-Signature: sha256=hex(HMAC_SHA256(secret, timestamp + "." + rawBody))` }]} />
              <CodePanel title="Verify a delivery" snippets={[{ label: "Node.js", lang: "js", code: NODE }, { label: "Python", lang: "py", code: PY }]} />
            </>}
          >
            <P>Each endpoint has its own secret. The signature is an HMAC-SHA256 of the timestamp, a full stop and the raw request body, keyed with the whole secret string including <C>whsec_</C>.</P>
            <Ul>
              <Li>Compute it over the raw bytes, before any JSON parsing or re-serialising.</Li>
              <Li>Reject timestamps more than 5 minutes from your clock to stop replays.</Li>
              <Li>Compare in constant time. After rotating a secret, update your receiver at once: the old one stops working immediately.</Li>
            </Ul>
          </DocSection>

          <DocSection
            id="retries" title="Retries and dead letters"
            wide={
              <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-line bg-line sm:grid-cols-4 xl:grid-cols-8">
                {LADDER.map((s, i) => (
                  <li key={s.at} className="relative bg-white px-3.5 py-3">
                    <div className="text-[12px] text-ink-3">Attempt <span className="num">{i + 1}</span></div>
                    <div className="mt-0.5 text-[14px] font-medium text-ink">{s.wait}</div>
                    <div className="num mt-0.5 text-[12px] text-ink-3">at {s.at}</div>
                  </li>
                ))}
                <li className="bg-danger-soft px-3.5 py-3">
                  <div className="text-[12px] text-danger/80">After attempt 7</div>
                  <div className="mt-0.5 text-[14px] font-medium text-danger">Dead letter</div>
                  <div className="mt-0.5 text-[12px] text-danger/80">Retry by hand</div>
                </li>
              </ol>
            }
          >
            <P>A non-2xx answer, a timeout or a connection error schedules the next attempt on this ladder: one immediate attempt and six retries, 30 s, 2 min, 10 min, 30 min, 2 h and 6 h apart. Each retry reuses the same event <C>id</C>.</P>
            <P>After the seventh failure (about 8 h 43 min after the first try) the delivery is marked <C>DEAD</C>. It stays in the dead-letter filter on the Integrations page with its payload and every attempt, and one click retries it once your receiver is fixed. Deliveries queued for a disabled endpoint are parked as dead without a request.</P>
          </DocSection>

          <section id="events" aria-labelledby="events-h" className="scroll-mt-28 border-t border-line px-5 py-14 sm:px-8 lg:scroll-mt-20 lg:px-12 lg:py-16">
            <div className="max-w-[640px]">
              <h2 id="events-h" className="text-[24px] leading-[1.25] font-semibold tracking-[-0.015em] text-ink">
                <a href="#events" className="group/h rounded-[4px] outline-none focus-visible:ring-[3px] focus-visible:ring-blue/30">Event catalogue<span className="ml-2 text-ink-3 opacity-0 transition-opacity duration-150 group-hover/h:opacity-100" aria-hidden>#</span></a>
              </h2>
              <P className="mt-4">Every event JewelRoute sends, with an example payload. Subscribe to the ones you need, or <C>*</C> for all of them.</P>
            </div>
            <div className="mt-8"><EventCatalogue /></div>
          </section>

          <DocSection id="testing" title="Testing">
            <P>Use <B>Send test event</B> on an endpoint to deliver a signed <C>ping</C> right away and see the status code and latency inline. Demo workspaces also have a built-in receiver at <C>/v1/dev/webhook-receiver/:token</C> that verifies each signature and lists what it received, so you can watch delivery work end to end before pointing JewelRoute at your own system.</P>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link href="/admin/integrations" className="inline-flex h-9 items-center rounded-[10px] bg-ink px-3.5 text-[14px] font-medium text-white transition-[scale,background-color] duration-150 ease-out hover:bg-[#2c2d30] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-blue/30 active:scale-[0.97]">Open Integrations</Link>
              <Link href="/login" className="inline-flex h-9 items-center rounded-[10px] border border-line-strong bg-white px-3.5 text-[14px] font-medium text-ink transition-[scale,background-color] duration-150 ease-out hover:bg-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-blue/30 active:scale-[0.97]">Sign in to the demo</Link>
            </div>
          </DocSection>

          <DocSection id="endpoints" title="Key endpoints" eyebrow="Reference"
            wide={
              <div className="overflow-x-auto rounded-[12px] border border-line">
                <table className="w-full min-w-[680px] text-[13.5px]">
                  <thead><tr className="h-9 border-b border-line bg-sunken text-left text-[12.5px] text-ink-3"><th className="w-20 px-4 font-medium">Method</th><th className="px-4 font-medium">Path</th><th className="px-4 font-medium">What it does</th></tr></thead>
                  <tbody>
                    {ENDPOINTS.map(([m, p, d]) => (
                      <tr key={m + p} className="border-b border-line last:border-0">
                        <td className="px-4 py-2.5"><span className={cn("text-[12px] font-semibold", METHOD[m], MONO)}>{m}</span></td>
                        <td className={cn("px-4 py-2.5 text-[12.5px] whitespace-nowrap text-ink", MONO)}>{p}</td>
                        <td className="px-4 py-2.5 text-ink-2">{d}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            }
          >
            <P>The most used calls. Every endpoint, with request and response schemas, is in Swagger UI at <C>&lt;api-host&gt;/docs</C>.</P>
          </DocSection>

          <DocSection id="outbox" title="Event outbox">
            <P>Every business change writes its event to an outbox table in the same database transaction as the change. If the order, memo or custody move commits, its event exists; if it rolls back, the event never did. The same rows drive the activity feeds in the app, so the feed and your webhooks can never disagree.</P>
            <Ul>
              <Li>A dispatcher claims due deliveries with <C>FOR UPDATE SKIP LOCKED</C> and a 30-second lease, so several instances can send safely. It runs right after a commit and on a schedule.</Li>
              <Li>Custody ledger rows store the <C>evt_…</C> id that announced them, so a piece&apos;s ledger entry, the webhook and the activity item share one id.</Li>
            </Ul>
          </DocSection>

          <DocSection id="architecture" title="Architecture">
            <P>Small on purpose: one database is the source of truth and every rule that protects money or custody is enforced inside it.</P>
            <dl className="mt-6 divide-y divide-line overflow-hidden rounded-[12px] border border-line">
              {ARCH.map(([t, d]) => (
                <div key={t} className="grid gap-1 px-4 py-3 sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-4">
                  <dt className="text-[14px] font-medium text-ink">{t}</dt>
                  <dd className={cn(PROSE, "text-[14px]")}>{d}</dd>
                </div>
              ))}
            </dl>
          </DocSection>
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}
