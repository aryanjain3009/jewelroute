import type { Metadata } from "next";
import Link from "next/link";
import { EVENT_DESCRIPTIONS, WEBHOOK_EVENT_TYPES } from "@jewelroute/shared";
import { Logo } from "@/components/jr/logo";
import { DocsNav } from "@/components/marketing/docs-nav";

export const metadata: Metadata = {
  title: "API & webhooks",
  description: "Authenticate, call the JewelRoute REST API, and verify signed webhooks for visits, orders, memos and sample custody.",
};

const mono = "font-[ui-monospace,SFMono-Regular,Menlo,monospace]";

function Code({ children, title }: { children: string; title?: string }) {
  return (
    <figure className="overflow-hidden rounded-xl border border-[#2c2925] bg-[#1f1d1a]">
      {title && <figcaption className="border-b border-[#2c2925] px-4 py-2 text-xs text-[#a59f92]">{title}</figcaption>}
      <pre className={`overflow-x-auto p-4 text-[12.5px] leading-[1.65] text-[#ece7dc] ${mono}`}><code className={mono}>{children}</code></pre>
    </figure>
  );
}
const C = ({ children }: { children: React.ReactNode }) => <code className={`rounded bg-sunken px-1.5 py-0.5 text-[0.88em] text-ink ${mono}`}>{children}</code>;

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="scroll-mt-24 pt-14 font-display text-[30px] leading-tight tracking-[-0.02em] text-ink first:pt-0">{children}</h2>;
}
const P = ({ children }: { children: React.ReactNode }) => <p className="mt-3 max-w-[68ch] text-[15px] leading-relaxed text-ink-2">{children}</p>;

const ENDPOINTS: [string, string, string][] = [
  ["POST", "/v1/auth/login", "Email + password. Sets session cookies and returns an access token."],
  ["GET", "/v1/field/today", "The agent's route for a day, bag value, open memos and any visit left open."],
  ["GET", "/v1/field/visits?scope=recent", "Today's whole route plus the last 14 days (upcoming = next 7 days)."],
  ["GET", "/v1/visits/:id", "One visit with a resumable state, orders, memos and the samples returned during it."],
  ["POST", "/v1/visits/:id/check-in", "Geofenced check-in, verified on the server. Key recommended."],
  ["POST", "/v1/visits/:id/proofs", "Attach an uploaded arrival photo. Key recommended."],
  ["POST", "/v1/orders", "Book an order from an open visit at today's rates. Key required."],
  ["POST", "/v1/memos", "Leave exact pieces with a retailer; moves custody. Key required."],
  ["POST", "/v1/memos/:id/return", "Pieces come back to the agent's bag. Key required."],
  ["POST", "/v1/memos/:id/convert", "Pieces the retailer keeps become one order at today's rate. Key required."],
  ["POST", "/v1/memos/:id/extend", "Move a memo's due date (today to today + 90 days)."],
  ["GET", "/v1/admin/home", "Today's metrics, map, attention list and live activity."],
  ["GET", "/v1/admin/shops", "Every shop with its agent, last visit, open orders, memos and samples here."],
  ["GET", "/v1/admin/agents", "One row per agent: route progress, current visit, bag, memos, orders today."],
  ["GET", "/v1/admin/orders/:id", "Order record with its visit, audit history and activity."],
  ["POST", "/v1/admin/orders/approve", "Approve up to 200 submitted orders, each in its own transaction."],
  ["GET", "/v1/admin/pieces/:id", "One sample: where it is now, its full custody ledger and activity."],
  ["POST", "/v1/admin/gold-rates", "Append a new rate for a purity. Existing orders never change."],
  ["POST", "/v1/admin/assignments", "Put a shop on an agent's route for a date."],
  ["GET", "/v1/admin/webhooks/deliveries", "Delivery log, newest first; cursor-paged with limit and cursor."],
];

const PAYLOAD = `{
  "id": "evt_01JB8Q4W2N3K6V9X",
  "type": "order.created",
  "tenantId": "aurum",
  "createdAt": "2026-10-21T06:12:44.120Z",
  "data": {
    "order": {
      "number": "ORD-2026-00042",
      "status": "SUBMITTED",
      "totalPaise": 149000000,
      "goldRateSnapshot": [{ "purity": "K22", "ratePaisePerGram": 1052500 }]
    },
    "shop": { "id": "shp_…", "name": "Sharma Jewellers", "area": "Karol Bagh" },
    "agent": { "id": "usr_…", "name": "Rahul Verma" }
  }
}`;

const NODE = `import crypto from "node:crypto";
import express from "express";

const app = express();
const SECRET = process.env.JEWELROUTE_WEBHOOK_SECRET; // whsec_…

// Keep the raw body: the signature covers the exact bytes we sent.
app.post("/hooks/jewelroute", express.raw({ type: "application/json" }), (req, res) => {
  const ts = req.get("X-JewelRoute-Timestamp");
  const sig = req.get("X-JewelRoute-Signature") ?? "";
  const body = req.body.toString("utf8");

  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return res.status(400).send("stale");
  const expected = "sha256=" + crypto.createHmac("sha256", SECRET).update(\`\${ts}.\${body}\`).digest("hex");
  const ok = sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!ok) return res.status(401).send("bad signature");

  const event = JSON.parse(body);
  // Deduplicate on event.id: retries reuse the same id.
  queue.add(event.type, event);
  res.sendStatus(200); // answer fast; do heavy work async
});`;

const PY = `import hashlib, hmac, os, time
from flask import Flask, request, abort

app = Flask(__name__)
SECRET = os.environ["JEWELROUTE_WEBHOOK_SECRET"].encode()  # whsec_…

@app.post("/hooks/jewelroute")
def jewelroute():
    ts = request.headers.get("X-JewelRoute-Timestamp", "")
    sig = request.headers.get("X-JewelRoute-Signature", "")
    body = request.get_data()  # raw bytes, before JSON parsing

    if abs(time.time() - int(ts or 0)) > 300:
        abort(400)
    expected = "sha256=" + hmac.new(SECRET, ts.encode() + b"." + body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        abort(401)

    event = request.get_json()
    # Deduplicate on event["id"]; retries reuse it.
    return "", 200`;

const LADDER: [string, string][] = [["1", "Immediately"], ["2", "30 seconds later"], ["3", "2 minutes later"], ["4", "10 minutes later"], ["5", "30 minutes later"], ["6", "2 hours later"], ["7", "6 hours later"]];

export default function Developers() {
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-warm">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-4 px-5 sm:px-8">
          <Link href="/" aria-label="JewelRoute home"><Logo /></Link>
          <span className="hidden text-[14px] text-ink-3 sm:inline">Developers</span>
          <div className="ml-auto flex items-center gap-2">
            <a href="/api/docs" className="hidden h-8 items-center rounded-lg border border-line bg-surface px-3 text-[13px] text-ink-2 hover:text-ink sm:inline-flex">OpenAPI reference</a>
            <Link href="/admin/integrations" className="inline-flex h-8 items-center whitespace-nowrap rounded-lg bg-ink px-3 text-[13px] font-medium text-paper hover:bg-ink/85">Manage webhooks</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[200px_minmax(0,1fr)] lg:py-14">
        <DocsNav />
        <article className="min-w-0 pb-24">
          <h1 className="font-display text-[40px] leading-[1.05] tracking-[-0.025em] sm:text-[52px]">API and webhooks</h1>
          <P>A JSON REST API under <C>/v1</C> and signed webhooks for everything that happens in the field. Money is always integer paise (<C>…Paise</C>), weight is integer milligrams (<C>…Mg</C>), distances are metres, and business dates are <C>YYYY-MM-DD</C> in India time.</P>
          <div className="mt-6 flex flex-wrap gap-3 text-[14px]">
            <a href="/api/docs" className="inline-flex h-10 items-center rounded-[10px] bg-ink px-4 font-medium text-paper hover:bg-ink/85">Open the live Swagger UI</a>
            <a href="/api/docs-json" className="inline-flex h-10 items-center rounded-[10px] border border-line-strong bg-surface px-4 font-medium text-ink hover:border-ink/40">Download OpenAPI JSON</a>
          </div>

          <H2 id="auth">Authentication</H2>
          <P><C>POST /v1/auth/login</C> with an email and password. The response sets two httpOnly cookies, <C>jr_at</C> (access, 15 minutes) and <C>jr_rt</C> (refresh, 30 days, rotated on use), and also returns the access token so server-to-server clients can send it as a bearer token.</P>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <Code title="Sign in">{`curl -X POST https://<your-host>/api/v1/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"admin@aurum.test","password":"…"}'`}</Code>
            <Code title="Call the API with a bearer token">{`curl https://<your-host>/api/v1/admin/home \\
  -H "Authorization: Bearer $ACCESS_TOKEN"`}</Code>
          </div>
          <P>When a call returns <C>401 TOKEN_EXPIRED</C>, call <C>POST /v1/auth/refresh</C> once and retry. The tenant always comes from the token, never from the request, so every query is scoped to your company. Field routes need a field agent; <C>/v1/admin/*</C> needs an admin.</P>

          <H2 id="idempotency">Idempotency keys</H2>
          <P>Calls that create something in the field take an <C>Idempotency-Key</C> header. Generate one UUID per user action and reuse it on every retry, so a weak mobile connection can never book an order twice.</P>
          <ul className="mt-4 max-w-[68ch] space-y-2 text-[15px] text-ink-2">
            <li className="flex gap-3"><span className="mt-[11px] h-px w-3 shrink-0 bg-ink-3" /><span><strong className="font-medium text-ink">Required</strong> on <C>POST /v1/orders</C>, <C>/v1/memos</C>, <C>/v1/memos/:id/return</C> and <C>/v1/memos/:id/convert</C>. Without it: <C>400 IDEMPOTENCY_KEY_REQUIRED</C>.</span></li>
            <li className="flex gap-3"><span className="mt-[11px] h-px w-3 shrink-0 bg-ink-3" /><span><strong className="font-medium text-ink">Recommended</strong> on check-in and proofs; they also deduplicate on their own (one open visit per agent, one proof per checksum).</span></li>
            <li className="flex gap-3"><span className="mt-[11px] h-px w-3 shrink-0 bg-ink-3" />Same key, same body: you get the original response again.</li>
            <li className="flex gap-3"><span className="mt-[11px] h-px w-3 shrink-0 bg-ink-3" />Same key, different body: <C>422 IDEMPOTENCY_KEY_REUSED</C>.</li>
          </ul>

          <H2 id="errors">Errors</H2>
          <P>Every response uses one envelope. Success is <C>{"{ ok: true, data }"}</C>. Errors carry a stable machine code, a message you can show, optional details and the request id (also in the <C>x-request-id</C> header).</P>
          <div className="mt-5"><Code title="409 Conflict">{`{
  "ok": false,
  "error": {
    "code": "OUTSIDE_GEOFENCE",
    "message": "You're 214 m from Sharma Jewellers. Check-in opens within 100 m.",
    "details": { "distanceM": 214, "radiusM": 100 }
  },
  "requestId": "req_8f2c1a"
}`}</Code></div>

          <H2 id="endpoints">Key endpoints</H2>
          <P>The full, always-current list is in the <a href="/api/docs" className="text-ink underline underline-offset-2">Swagger UI</a>.</P>
          <div className="mt-5 overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[640px] text-[13.5px]">
              <thead><tr className="border-b border-line bg-paper text-left text-xs text-ink-3"><th className="px-4 py-2.5 font-medium">Method</th><th className="px-4 py-2.5 font-medium">Path</th><th className="px-4 py-2.5 font-medium">What it does</th></tr></thead>
              <tbody>
                {ENDPOINTS.map(([m, p, d]) => (
                  <tr key={p + m} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5"><span className={`text-xs font-semibold ${m === "GET" ? "text-info" : "text-verified"} ${mono}`}>{m}</span></td>
                    <td className={`px-4 py-2.5 text-[12.5px] text-ink ${mono}`}>{p}</td>
                    <td className="px-4 py-2.5 text-ink-2">{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <H2 id="paging">Paging and batches</H2>
          <P>The delivery log is cursor-paged. Pass <C>limit</C> (1 to 200, default 50) and, for the next page, the <C>nextCursor</C> from the previous one. With either parameter the response is <C>{"{ items, nextCursor }"}</C>; <C>nextCursor</C> is absent on the last page. Without them you get the latest 100 as a plain array, as before. Filter with <C>endpointId</C>, <C>status</C> and <C>eventType</C>.</P>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <Code title="Walk the delivery log">{`curl "https://<your-host>/api/v1/admin/webhooks/deliveries?limit=50" \\
  -H "Authorization: Bearer $ACCESS_TOKEN"
# → { "items": [ … 50 … ], "nextCursor": "MjAyNi0xMC0yMVQw…" }

curl "https://<your-host>/api/v1/admin/webhooks/deliveries?limit=50&cursor=MjAyNi0xMC0yMVQw…" \\
  -H "Authorization: Bearer $ACCESS_TOKEN"`}</Code>
            <Code title="Approve several orders">{`curl -X POST https://<your-host>/api/v1/admin/orders/approve \\
  -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"orderIds":["clo_a…","clo_b…"]}'
# → { "approved": 1, "failed": 1, "results": [
#      { "id": "clo_a…", "ok": true, "number": "ORD-2026-00042", "status": "APPROVED" },
#      { "id": "clo_b…", "ok": false,
#        "error": { "code": "ORDER_ALREADY_DECIDED", "message": "…" } } ] }`}</Code>
          </div>
          <P>Each order in a batch is approved in its own transaction, with its own audit entry and <C>order.approved</C> event, so one order that was already decided never blocks the rest. Results come back in request order.</P>

          <H2 id="events">Webhook events</H2>
          <P>Add an endpoint on the Integrations page and choose which of these to receive. Each delivery is a <C>POST</C> with a JSON body.</P>
          <dl className="mt-5 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {[...WEBHOOK_EVENT_TYPES, "ping" as const].map((t) => (
              <div key={t} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-4">
                <dt className={`text-[13px] text-ink ${mono}`}>{t}</dt>
                <dd className="text-[13.5px] text-ink-2">{EVENT_DESCRIPTIONS[t]}</dd>
              </div>
            ))}
          </dl>

          <H2 id="payload">Payload</H2>
          <P>The envelope is the same for every event; <C>data</C> carries the objects involved. Treat unknown fields as additive.</P>
          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <Code title="Headers">{`POST /hooks/jewelroute HTTP/1.1
Content-Type: application/json
User-Agent: JewelRoute-Webhooks/1.0
X-JewelRoute-Event: order.created
X-JewelRoute-Delivery: whd_01JB8Q4X…
X-JewelRoute-Timestamp: 1792561964
X-JewelRoute-Signature: sha256=5b0e…c41d`}</Code>
            <Code title="Body">{PAYLOAD}</Code>
          </div>

          <H2 id="signatures">Verifying signatures</H2>
          <P>Each endpoint has its own secret starting with <C>whsec_</C>. The signature is an HMAC-SHA256 of the timestamp, a full stop, and the raw request body, keyed with the whole secret string:</P>
          <div className="mt-4"><Code>{`X-JewelRoute-Signature: sha256=hex( HMAC_SHA256( secret, timestamp + "." + rawBody ) )`}</Code></div>
          <ul className="mt-4 max-w-[68ch] space-y-2 text-[15px] text-ink-2">
            <li className="flex gap-3"><span className="mt-[11px] h-px w-3 shrink-0 bg-ink-3" />Compute it over the raw bytes, before any JSON parsing or re-serialising.</li>
            <li className="flex gap-3"><span className="mt-[11px] h-px w-3 shrink-0 bg-ink-3" />Reject timestamps more than 5 minutes from your clock to stop replays.</li>
            <li className="flex gap-3"><span className="mt-[11px] h-px w-3 shrink-0 bg-ink-3" />Compare in constant time. After rotating a secret, update your receiver immediately: the old one stops working at once.</li>
          </ul>
          <div className="mt-5 space-y-4">
            <Code title="Node.js (Express)">{NODE}</Code>
            <Code title="Python (Flask)">{PY}</Code>
          </div>

          <H2 id="retries">Retries and dead letters</H2>
          <P>Any 2xx response within 10 seconds counts as delivered. Anything else (non-2xx, timeout, connection error) is retried on this ladder, reusing the same event <C>id</C>:</P>
          <ol className="mt-5 grid max-w-[560px] grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
            {LADDER.map(([n, w]) => (
              <li key={n} className="bg-surface px-4 py-3"><div className="text-xs text-ink-3">Attempt {n}</div><div className="text-[14px] font-medium text-ink">{w}</div></li>
            ))}
          </ol>
          <P>After the seventh failed attempt (about 8 hours 42 minutes after the first) the delivery is marked <C>DEAD</C> and appears in the dead letter filter on the Integrations page, where you can inspect the payload and attempt log and retry it with one click once your receiver is fixed. Because retries can arrive after newer events, order by <C>createdAt</C> and deduplicate on <C>id</C>.</P>

          <H2 id="testing">Testing</H2>
          <P>Use <strong className="font-medium text-ink">Send test event</strong> on an endpoint to deliver a signed <C>ping</C> right away and see the status code and latency inline. The demo tenant also has a built-in receiver at <C>/v1/dev/webhook-receiver/:token</C> that verifies each signature and lists what it received, so you can watch delivery work end to end before pointing JewelRoute at your own system.</P>
        </article>
      </div>
    </div>
  );
}
