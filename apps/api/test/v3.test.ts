/* v3 — credit-aware orders, receivables, one activity model (docs/CONTRACT.md § v3).
 * Every stateful rule is proven on real Postgres through HTTP, with DB rows asserted.
 * Each test builds its own shop/agents/visits so it does not depend on order or seed totals. */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addDays, istDate, orderTotals, WEBHOOK_EVENT_TYPES } from '@jewelroute/shared';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../generated/prisma';
import { backfillActivityRefs } from '../src/core/backfill-refs';
import { findSoldOrphans } from '../src/core/orphans';
import { api, db, dispatch, ENV, J, login, start, stop, uploadProof } from './harness';

const TODAY = istDate();
const SEED_THRESHOLD = 100_000_000; // ₹10L
let ADMIN: string;
let AURUM: string;
let n = 0;
const key = () => ({ 'Idempotency-Key': randomUUID() });

before(async () => {
  await start();
  ADMIN = await login('admin@aurum.test', 'Aurum@2026');
  AURUM = (await db.tenant.findUniqueOrThrow({ where: { slug: 'aurum' } })).id;
});
after(stop);

async function agent() {
  const email = `v3-${Date.now()}-${++n}@aurum.test`;
  const u = await db.user.create({ data: { tenantId: AURUM, name: `V3 Agent ${n}`, email, role: 'FIELD_AGENT', passwordHash: await bcrypt.hash('V3agent@2026', 4) } });
  return { id: u.id, name: u.name, token: await login(email, 'V3agent@2026') };
}
async function shop(creditLimitPaise: number, openingOutstandingPaise = 0) {
  const r = await api(ADMIN, 'POST', '/v1/admin/shops', { name: `V3 Shop ${Date.now()}-${++n}`, address: 'Test lane', area: 'Test', lat: 28.6 + n / 10_000, lng: 77.2, creditLimitPaise, openingOutstandingPaise });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.data.shop as J;
}
/** An agent checked in (with arrival photo) at `s` today — ready to sell. */
async function openVisit(s: J, a?: { id: string; token: string; name: string }) {
  const ag = a ?? (await agent());
  const v = await api(ADMIN, 'POST', '/v1/admin/assignments', { agentId: ag.id, shopId: s.id, date: TODAY });
  assert.equal(v.status, 201, JSON.stringify(v.json));
  const ci = await api(ag.token, 'POST', `/v1/visits/${v.data.visit.id}/check-in`, { lat: s.lat, lng: s.lng, accuracyM: 5 }, key());
  assert.equal(ci.status, 200, JSON.stringify(ci.json));
  await uploadProof(ag.token, v.data.visit.id, s.lat, s.lng);
  return { agent: ag, visitId: v.data.visit.id as string };
}
async function design(sku = 'AJ-RNG-2221') {
  return db.jewelryDesign.findFirstOrThrow({ where: { tenantId: AURUM, sku } });
}
/** Unit price at today's rate from the catalog (setup only — the rule under test is credit, not pricing). */
async function unitPrice(token: string, visitId: string, designId: string) {
  const cat = await api(token, 'GET', `/v1/visits/${visitId}/catalog`);
  return cat.data.designs.find((d: J) => d.id === designId).price.unitPricePaise as number;
}
const order = (token: string, visitId: string, designId: string, quantity = 1) => api(token, 'POST', '/v1/orders', { visitId, items: [{ designId, quantity }] }, key());
const setThreshold = (v: number | null) => api(ADMIN, 'PATCH', '/v1/admin/settings', { approvalThresholdPaise: v });

// ---- scratch databases for migration tests, migrated with the real `prisma migrate deploy` (review m7)
const apiRoot = join(__dirname, '..');
const ALL_MIGRATIONS = ['20261021000000_init', '20261021000100_webhook_attempt_request_headers', '20261021000200_v2_attio_ia'];
function scratch(name: string) {
  const base = new URL(ENV.DATABASE_URL!);
  const admin = new URL(base);
  admin.pathname = '/postgres';
  const url = new URL(base);
  url.pathname = `/${name}`;
  url.search = '';
  const psql = (u: URL, args: string) => execSync(`psql "${u}" -v ON_ERROR_STOP=1 -q ${args}`, { stdio: 'pipe' }).toString();
  const env = { ...process.env, DATABASE_URL: String(url), DATABASE_URL_DIRECT: String(url) };
  psql(admin, `-c "DROP DATABASE IF EXISTS ${name} WITH (FORCE)"`);
  psql(admin, `-c "CREATE DATABASE ${name}"`);
  return {
    url,
    psql: (args: string) => psql(url, args),
    /** Deploy only the pre-v3 migrations (a copy of the schema dir with the first three folders). */
    deployPreV3() {
      const dir = mkdtempSync(join(tmpdir(), 'jr-prev3-'));
      try {
        cpSync(join(apiRoot, 'prisma/schema.prisma'), join(dir, 'schema.prisma'));
        cpSync(join(apiRoot, 'prisma/migrations/migration_lock.toml'), join(dir, 'migrations/migration_lock.toml'));
        for (const f of ALL_MIGRATIONS) cpSync(join(apiRoot, 'prisma/migrations', f), join(dir, 'migrations', f), { recursive: true });
        execSync(`npx prisma migrate deploy --schema "${join(dir, 'schema.prisma')}"`, { cwd: apiRoot, env, stdio: 'pipe' });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    deployAll: () => execSync('npx prisma migrate deploy', { cwd: apiRoot, env, stdio: 'pipe' }).toString(),
    drop: () => psql(admin, `-c "DROP DATABASE IF EXISTS ${name} WITH (FORCE)"`),
  };
}

describe('v3 credit rule', () => {
  test('V1. boundaries: projected exactly at the limit confirms, one more order needs approval; threshold equality trips', async () => {
    const d = await design();
    const s = await shop(0, 0);
    const { agent: a, visitId } = await openVisit(s);
    const T = orderTotals([await unitPrice(a.token, visitId, d.id)]).totalPaise;
    // limit = exactly one order
    assert.equal((await api(ADMIN, 'PATCH', `/v1/admin/shops/${s.id}`, { creditLimitPaise: T })).status, 200);
    const pre = await api(a.token, 'GET', `/v1/visits/${visitId}/credit?amountPaise=${T}`);
    assert.equal(pre.status, 200, JSON.stringify(pre.json));
    assert.deepEqual([pre.data.projectedExposurePaise, pre.data.requiresApproval, pre.data.availableCreditPaise], [T, false, T]);
    const o1 = await order(a.token, visitId, d.id);
    assert.equal(o1.status, 201, JSON.stringify(o1.json));
    assert.equal(o1.data.order.status, 'CONFIRMED');
    assert.deepEqual(o1.data.order.approval.reasons, []);
    assert.equal(o1.data.order.approval.position.projectedExposurePaise, T);
    assert.equal(o1.data.order.approval.position.creditLimitPaise, T);
    const o2 = await order(a.token, visitId, d.id);
    assert.equal(o2.data.order.status, 'PENDING_APPROVAL');
    assert.deepEqual(o2.data.order.approval.reasons, ['CREDIT_LIMIT']);
    assert.equal(o2.data.order.approval.position.exposurePaise, T, 'the confirmed order now counts');
    assert.equal(o2.data.order.approval.position.projectedExposurePaise, 2 * T);
    const row = await db.order.findUniqueOrThrow({ where: { id: o2.data.order.id } });
    assert.deepEqual([row.status, row.approvalRequired, row.approvalReasons], ['PENDING_APPROVAL', true, ['CREDIT_LIMIT']]);
    assert.equal((row.creditSnapshot as J).projectedExposurePaise, 2 * T);
    assert.equal(await db.outboxEvent.count({ where: { orderId: o1.data.order.id, type: 'order.confirmed' } }), 1);
    assert.equal(await db.outboxEvent.count({ where: { orderId: o2.data.order.id, type: 'order.pending_approval' } }), 1);
    assert.equal(await db.outboxEvent.count({ where: { orderId: o2.data.order.id, type: 'order.created' } }), 1, 'order.created still fires');
    // the pending order does not count towards exposure
    const pos = await api(ADMIN, 'GET', `/v1/admin/shops/${s.id}/credit`);
    assert.deepEqual([pos.data.outstandingPaise, pos.data.availableCreditPaise, pos.data.overLimit], [T, 0, false]);

    // threshold equality (no credit limit)
    assert.equal((await api(ADMIN, 'PATCH', `/v1/admin/shops/${s.id}`, { creditLimitPaise: 0 })).status, 200);
    try {
      assert.equal((await setThreshold(T)).status, 200);
      const o3 = await order(a.token, visitId, d.id);
      assert.equal(o3.data.order.status, 'PENDING_APPROVAL');
      assert.deepEqual(o3.data.order.approval.reasons, ['ORDER_THRESHOLD']);
      assert.equal(o3.data.order.approval.position.availableCreditPaise, null, 'no limit → null, never 0');
      assert.equal((await setThreshold(T + 1)).status, 200);
      const o4 = await order(a.token, visitId, d.id);
      assert.equal(o4.data.order.status, 'CONFIRMED');
    } finally {
      await setThreshold(SEED_THRESHOLD);
    }
    // visit credit is the agent's own open visit only
    const other = await agent();
    assert.equal((await api(other.token, 'GET', `/v1/visits/${visitId}/credit`)).status, 404);
    assert.equal((await api(a.token, 'GET', `/v1/visits/${visitId}/credit?amountPaise=-1`)).status, 400);
  });

  test('V2. concurrent orders from two agents at one shop never both slip under the limit (shop row FOR UPDATE)', async () => {
    const d = await design();
    const s = await shop(0, 0);
    const A = await openVisit(s);
    const B = await openVisit(s);
    const T = orderTotals([await unitPrice(A.agent.token, A.visitId, d.id)]).totalPaise;
    // room for exactly one order (1.5 × T)
    assert.equal((await api(ADMIN, 'PATCH', `/v1/admin/shops/${s.id}`, { creditLimitPaise: T + Math.floor(T / 2) })).status, 200);
    for (let round = 0; round < 3; round++) {
      if (round > 0) {
        // reset: cancel what the previous round confirmed so there is room for one again
        const live = await db.order.findMany({ where: { shopId: s.id, status: 'CONFIRMED' } });
        for (const o of live) assert.equal((await api(ADMIN, 'POST', `/v1/admin/orders/${o.id}/cancel`, {})).status, 200);
      }
      const rs = await Promise.all([
        order(A.agent.token, A.visitId, d.id),
        order(B.agent.token, B.visitId, d.id),
        order(A.agent.token, A.visitId, d.id),
        order(B.agent.token, B.visitId, d.id),
      ]);
      assert.ok(rs.every((r) => r.status === 201), JSON.stringify(rs.map((r) => [r.status, r.error?.code])));
      const statuses = rs.map((r) => r.data.order.status).sort();
      assert.deepEqual(statuses, ['CONFIRMED', 'PENDING_APPROVAL', 'PENDING_APPROVAL', 'PENDING_APPROVAL'], `round ${round}`);
      for (const r of rs.filter((x) => x.data.order.status === 'PENDING_APPROVAL')) assert.deepEqual(r.data.order.approval.reasons, ['CREDIT_LIMIT']);
      const live = await db.order.aggregate({ where: { shopId: s.id, status: { in: ['CONFIRMED', 'APPROVED'] }, settledAt: null }, _sum: { totalPaise: true } });
      assert.ok(Number(live._sum.totalPaise) <= T + Math.floor(T / 2), 'live exposure never exceeds the limit');
    }
  });

  test('V3. memo convert-to-order goes through the same rule, net of the converted pieces (no double count)', async () => {
    const s = await shop(0, 0);
    const { agent: a, visitId } = await openVisit(s);
    const d = await design('AJ-PND-2241');
    const intake = await api(ADMIN, 'POST', `/v1/admin/designs/${d.id}/pieces`, { count: 2 });
    const ids = intake.data.pieces.map((p: J) => p.id);
    assert.equal((await api(ADMIN, 'POST', '/v1/admin/pieces/issue', { pieceIds: ids, agentId: a.id })).status, 200);
    const memo = await api(a.token, 'POST', '/v1/memos', { visitId, pieceIds: ids, dueDate: addDays(TODAY, 5) }, key());
    assert.equal(memo.status, 201, JSON.stringify(memo.json));
    const [v1, v2] = memo.data.memo.items.map((i: J) => i.valuePaise);
    // Limit = the other piece's memo value + one converted order total. Net: projected = v2 + T1 = limit → CONFIRMED.
    // Counting the converted piece twice would give v1 + v2 + T1 > limit.
    const T1 = orderTotals([v1]).totalPaise;
    assert.equal((await api(ADMIN, 'PATCH', `/v1/admin/shops/${s.id}`, { creditLimitPaise: v2 + T1 })).status, 200);
    const c1 = await api(a.token, 'POST', `/v1/memos/${memo.data.memo.id}/convert`, { pieceIds: [ids[0]] }, key());
    assert.equal(c1.status, 200, JSON.stringify(c1.json));
    assert.equal(c1.data.order.totalPaise, T1);
    assert.equal(c1.data.order.status, 'CONFIRMED');
    assert.equal(c1.data.order.approval.position.memoExposurePaise, v2);
    // Now exposure = T1 + v2 = limit; converting the second piece trips CREDIT_LIMIT.
    const c2 = await api(a.token, 'POST', `/v1/memos/${memo.data.memo.id}/convert`, { pieceIds: [ids[1]] }, key());
    assert.equal(c2.data.order.status, 'PENDING_APPROVAL');
    assert.deepEqual(c2.data.order.approval.reasons, ['CREDIT_LIMIT']);
    // a converted order cannot be cancelled (its pieces are sold)
    const cx = await api(ADMIN, 'POST', `/v1/admin/orders/${c2.data.order.id}/cancel`, {});
    assert.equal(cx.status, 409);
    assert.equal(cx.error.code, 'ORDER_NOT_CANCELLABLE');
    // custody ledger rows name the order a conversion created, and the hand-over ack
    const rec = (await api(ADMIN, 'GET', `/v1/admin/pieces/${ids[0]}`)).data;
    const sold = rec.events.find((e: J) => e.reason === 'CONVERTED_TO_SALE');
    assert.deepEqual(sold.order, { id: c1.data.order.id, number: c1.data.order.number });
    const handover = rec.events.find((e: J) => e.reason === 'MEMO_HANDOVER');
    assert.deepEqual(handover.ack, { status: 'PENDING', by: 'retailer' });
  });
});

describe('v3 order transitions', () => {
  test('V4. approve/reject only from PENDING_APPROVAL; settle and cancel transitions; SQL guards', async () => {
    const d = await design();
    const s = await shop(1_000_000_000, 5_000_000);
    const { agent: a, visitId } = await openVisit(s);
    const T = orderTotals([await unitPrice(a.token, visitId, d.id)]).totalPaise;
    const confirmed = (await order(a.token, visitId, d.id)).data.order;
    assert.equal(confirmed.status, 'CONFIRMED');
    // approve/reject a CONFIRMED order → ORDER_NOT_PENDING
    for (const [path, body] of [['approve', undefined], ['reject', { reason: 'x' }]] as const) {
      const r = await api(ADMIN, 'POST', `/v1/admin/orders/${confirmed.id}/${path}`, body);
      assert.equal(r.status, 409);
      assert.equal(r.error.code, 'ORDER_NOT_PENDING');
      assert.equal(r.error.details.status, 'CONFIRMED');
    }
    // settle CONFIRMED → outstanding drops by its total
    const before = (await api(ADMIN, 'GET', `/v1/admin/shops/${s.id}/credit`)).data;
    assert.equal(before.outstandingPaise, 5_000_000 + T);
    const st = await api(ADMIN, 'POST', `/v1/admin/orders/${confirmed.id}/settle`);
    assert.equal(st.status, 200, JSON.stringify(st.json));
    assert.ok(st.data.order.settledAt);
    assert.equal(st.data.credit.outstandingPaise, 5_000_000);
    assert.equal(st.data.order.status, 'CONFIRMED', 'settling does not change the status');
    const again = await api(ADMIN, 'POST', `/v1/admin/orders/${confirmed.id}/settle`);
    assert.deepEqual([again.status, again.error.code], [409, 'ORDER_ALREADY_SETTLED']);
    const cs = await api(ADMIN, 'POST', `/v1/admin/orders/${confirmed.id}/cancel`, {});
    assert.deepEqual([cs.status, cs.error.code], [409, 'ORDER_NOT_CANCELLABLE']);
    assert.equal(await db.auditLog.count({ where: { entityId: confirmed.id, action: 'order.settle' } }), 1);
    assert.equal(await db.outboxEvent.count({ where: { orderId: confirmed.id, type: 'order.settled' } }), 1);

    // pending orders (threshold = 1 paisa)
    let pending: J, toApprove: J, toReject: J;
    try {
      await setThreshold(1);
      [pending, toApprove, toReject] = [(await order(a.token, visitId, d.id)).data.order, (await order(a.token, visitId, d.id)).data.order, (await order(a.token, visitId, d.id)).data.order];
    } finally {
      await setThreshold(SEED_THRESHOLD);
    }
    assert.ok([pending, toApprove, toReject].every((o) => o.status === 'PENDING_APPROVAL' && o.approval.reasons[0] === 'ORDER_THRESHOLD'));
    const sp = await api(ADMIN, 'POST', `/v1/admin/orders/${pending.id}/settle`);
    assert.deepEqual([sp.status, sp.error.code, sp.error.details.status], [409, 'ORDER_NOT_SETTLEABLE', 'PENDING_APPROVAL']);
    const cp = await api(ADMIN, 'POST', `/v1/admin/orders/${pending.id}/cancel`, { reason: 'Retailer changed the design' });
    assert.equal(cp.status, 200, JSON.stringify(cp.json));
    assert.deepEqual([cp.data.order.status, cp.data.order.cancellationReason], ['CANCELLED', 'Retailer changed the design']);
    assert.ok(cp.data.order.cancelledAt);
    const ap = await api(ADMIN, 'POST', `/v1/admin/orders/${pending.id}/approve`);
    assert.deepEqual([ap.status, ap.error.code, ap.error.details.status], [409, 'ORDER_NOT_PENDING', 'CANCELLED']);
    // approve → counts towards outstanding; APPROVED cannot be cancelled but can be settled
    const outBefore = (await api(ADMIN, 'GET', `/v1/admin/shops/${s.id}/credit`)).data.outstandingPaise;
    assert.equal((await api(ADMIN, 'POST', `/v1/admin/orders/${toApprove.id}/approve`)).data.order.status, 'APPROVED');
    assert.equal((await api(ADMIN, 'GET', `/v1/admin/shops/${s.id}/credit`)).data.outstandingPaise, outBefore + T);
    const ca = await api(ADMIN, 'POST', `/v1/admin/orders/${toApprove.id}/cancel`, {});
    assert.deepEqual([ca.status, ca.error.code], [409, 'ORDER_NOT_CANCELLABLE']);
    assert.equal((await api(ADMIN, 'POST', `/v1/admin/orders/${toApprove.id}/settle`)).status, 200);
    // reject, then a second decision reports the committed one
    assert.equal((await api(ADMIN, 'POST', `/v1/admin/orders/${toReject.id}/reject`, { reason: 'No' })).data.order.status, 'REJECTED');
    const twice = await api(ADMIN, 'POST', `/v1/admin/orders/${toReject.id}/approve`);
    assert.deepEqual([twice.status, twice.error.code, twice.error.details.status], [409, 'ORDER_ALREADY_DECIDED', 'REJECTED']);
    // cancel a CONFIRMED order: leaves outstanding
    const c2 = (await order(a.token, visitId, d.id)).data.order;
    const o0 = (await api(ADMIN, 'GET', `/v1/admin/shops/${s.id}/credit`)).data.outstandingPaise;
    assert.equal((await api(ADMIN, 'POST', `/v1/admin/orders/${c2.id}/cancel`, {})).data.order.status, 'CANCELLED');
    assert.equal((await api(ADMIN, 'GET', `/v1/admin/shops/${s.id}/credit`)).data.outstandingPaise, o0 - T);
    assert.equal(await db.auditLog.count({ where: { entityId: c2.id, action: 'order.cancel' } }), 1);
    assert.equal(await db.outboxEvent.count({ where: { orderId: c2.id, type: 'order.cancelled' } }), 1);
    // agents cannot settle/cancel; other tenants get 404 (test V7 covers settings)
    assert.equal((await api(a.token, 'POST', `/v1/admin/orders/${c2.id}/settle`)).status, 403);

    // SQL guards (the invariants live in Postgres, not only in the service)
    await assert.rejects(db.$executeRaw`UPDATE "Order" SET "settledAt" = now() WHERE id = ${pending.id}`, /Order_settled_only_when_owed/);
    const fresh = (await order(a.token, visitId, d.id)).data.order;
    assert.equal(fresh.status, 'CONFIRMED');
    await assert.rejects(db.$executeRaw`UPDATE "Order" SET status = 'PENDING_APPROVAL' WHERE id = ${fresh.id}`, /Order_pending_has_reason/);
    await assert.rejects(db.$executeRaw`UPDATE "Order" SET "approvalReasons" = ARRAY['VIBES'] WHERE id = ${c2.id}`, /Order_approval_reasons_known/);
    await assert.rejects(db.$executeRaw`UPDATE "Order" SET status = 'CANCELLED' WHERE id = ${fresh.id}`, /Order_cancelled_at/);
    await assert.rejects(db.$executeRaw`UPDATE "Order" SET status = 'SUBMITTED' WHERE id = ${fresh.id}`, /Order_no_submitted/);
    await assert.rejects(db.$executeRaw`UPDATE "Tenant" SET "approvalThresholdPaise" = 0 WHERE id = ${AURUM}`, /Tenant_approval_threshold_positive/);
    await assert.rejects(db.$executeRaw`UPDATE "Shop" SET "openingOutstandingPaise" = -1 WHERE id = ${s.id}`, /Shop_credit_nonneg/);
  });

  test('V5. PATCH shop/design keeps omitted fields (no reset to create defaults)', async () => {
    const s = await shop(123_456_00, 7_000_00);
    const r = await api(ADMIN, 'PATCH', `/v1/admin/shops/${s.id}`, { ownerName: 'New Owner' });
    assert.equal(r.status, 200);
    assert.deepEqual([r.data.shop.creditLimitPaise, r.data.shop.openingOutstandingPaise, r.data.shop.city, r.data.shop.geofenceRadiusM], [123_456_00, 7_000_00, 'New Delhi', 100]);
    const d = await design('AJ-NCK-2212');
    const p = await api(ADMIN, 'PATCH', `/v1/admin/designs/${d.id}`, { description: 'Kundan choker, meenakari reverse.' });
    assert.equal(p.status, 200);
    const after = await db.jewelryDesign.findUniqueOrThrow({ where: { id: d.id } });
    assert.deepEqual([after.stoneValuePaise, after.makingChargeType, after.imageUrls.length > 0, (after.otherComponents as J[]).length], [d.stoneValuePaise, d.makingChargeType, true, 1]);
  });
});

describe('v3 rejected memo conversion un-sells', () => {
  test('V10. convert → pending → reject: piece back at the shop on memo, exposure back, memo return works; SQL guard', async () => {
    const s = await shop(0, 0);
    const { agent: a, visitId } = await openVisit(s);
    const d = await design('AJ-PND-2241');
    const ids: string[] = (await api(ADMIN, 'POST', `/v1/admin/designs/${d.id}/pieces`, { count: 2 })).data.pieces.map((p: J) => p.id);
    await api(ADMIN, 'POST', '/v1/admin/pieces/issue', { pieceIds: ids, agentId: a.id });
    const memo = (await api(a.token, 'POST', '/v1/memos', { visitId, pieceIds: ids, dueDate: addDays(TODAY, 5) }, key())).data.memo;
    const value = (pid: string) => memo.items.find((i: J) => i.piece.id === pid).valuePaise as number;
    assert.equal((await api(ADMIN, 'PATCH', `/v1/admin/shops/${s.id}`, { creditLimitPaise: 1 })).status, 200); // every conversion needs approval
    const conv = await api(a.token, 'POST', `/v1/memos/${memo.id}/convert`, { pieceIds: [ids[0]] }, key());
    assert.equal(conv.data.order.status, 'PENDING_APPROVAL');
    const orderId = conv.data.order.id;
    const sold = await db.samplePiece.findUniqueOrThrow({ where: { id: ids[0] } });
    assert.equal(sold.custodianType, 'SOLD');
    assert.equal((await api(ADMIN, 'GET', `/v1/admin/shops/${s.id}/credit`)).data.memoExposurePaise, value(ids[1]));
    // cancel stays blocked for conversions
    const cx = await api(ADMIN, 'POST', `/v1/admin/orders/${orderId}/cancel`, {});
    assert.deepEqual([cx.status, cx.error.code], [409, 'ORDER_NOT_CANCELLABLE']);
    // reject un-sells
    const rj = await api(ADMIN, 'POST', `/v1/admin/orders/${orderId}/reject`, { reason: 'Over limit — keep it on memo' });
    assert.equal(rj.status, 200, JSON.stringify(rj.json));
    assert.equal(rj.data.order.status, 'REJECTED');
    const back = await db.samplePiece.findUniqueOrThrow({ where: { id: ids[0] } });
    assert.deepEqual([back.custodianType, back.custodianShopId, back.custodySeq], ['SHOP', s.id, sold.custodySeq + 1]);
    const ev = await db.custodyEvent.findFirstOrThrow({ where: { pieceId: ids[0], seq: back.custodySeq } });
    assert.deepEqual([ev.reason, ev.fromType, ev.toType, ev.toShopId, ev.memoId], ['SALE_REJECTED', 'SOLD', 'SHOP', s.id, memo.id]);
    assert.ok(ev.outboxEventId && (await db.outboxEvent.count({ where: { id: ev.outboxEventId, type: 'sample.custody_changed' } })) === 1);
    const item = await db.memoItem.findFirstOrThrow({ where: { memoId: memo.id, pieceId: ids[0] } });
    assert.deepEqual([item.status, item.returnedAt], ['OUT', null]);
    const m = await db.memo.findUniqueOrThrow({ where: { id: memo.id } });
    assert.deepEqual([m.status, m.closedAt], ['ACTIVE', null]);
    assert.equal((await api(ADMIN, 'GET', `/v1/admin/shops/${s.id}/credit`)).data.memoExposurePaise, value(ids[0]) + value(ids[1]), 'exposure returns');
    assert.equal(await db.auditLog.count({ where: { entityId: memo.id, action: 'memo.sale_rejected' } }), 1);
    const rej = await db.outboxEvent.findFirstOrThrow({ where: { orderId, type: 'order.rejected' } });
    assert.deepEqual((rej.payload as J).data.unsold.pieceIds, [ids[0]]);
    const rec = (await api(ADMIN, 'GET', `/v1/admin/pieces/${ids[0]}`)).data;
    assert.deepEqual([rec.piece.status, rec.piece.memo.id], ['ON_MEMO', memo.id]);
    assert.equal(rec.events[rec.events.length - 1].reason, 'SALE_REJECTED');
    // the memo works again: return the piece to the agent
    const ret = await api(a.token, 'POST', `/v1/memos/${memo.id}/return`, { pieceIds: [ids[0]] }, key());
    assert.equal(ret.status, 200, JSON.stringify(ret.json));
    assert.equal((await db.samplePiece.findUniqueOrThrow({ where: { id: ids[0] } })).custodianType, 'AGENT');
    // SQL guard: a SOLD piece needs a live order — rejecting/cancelling behind the service, or marking a piece SOLD, cannot commit
    const conv2 = await api(a.token, 'POST', `/v1/memos/${memo.id}/convert`, { pieceIds: [ids[1]] }, key());
    assert.equal(conv2.data.order.status, 'PENDING_APPROVAL');
    await assert.rejects(db.$executeRaw`UPDATE "Order" SET status = 'REJECTED' WHERE id = ${conv2.data.order.id}`, /SamplePiece_sold_has_live_order/);
    await assert.rejects(db.$executeRaw`UPDATE "Order" SET status = 'CANCELLED', "cancelledAt" = now() WHERE id = ${conv2.data.order.id}`, /SamplePiece_sold_has_live_order/);
    await assert.rejects(db.$executeRaw`UPDATE "SamplePiece" SET "custodianType" = 'SOLD', "custodianAgentId" = NULL WHERE id = ${ids[0]}`, /SamplePiece_sold_has_live_order/);
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: conv2.data.order.id } })).status, 'PENDING_APPROVAL');
  });
});

describe('v3 lock order', () => {
  test('V13. reject of a memo conversion ‖ another conversion on the same memo: no deadlock, both succeed (lock order Memo → Pieces → Shop → Order)', async () => {
    const ROUNDS = 6;
    const s = await shop(0, 0);
    const { agent: a, visitId } = await openVisit(s);
    const d = await design('AJ-PND-2241');
    const ids: string[] = (await api(ADMIN, 'POST', `/v1/admin/designs/${d.id}/pieces`, { count: ROUNDS + 1 })).data.pieces.map((p: J) => p.id);
    await api(ADMIN, 'POST', '/v1/admin/pieces/issue', { pieceIds: ids, agentId: a.id });
    const memo = (await api(a.token, 'POST', '/v1/memos', { visitId, pieceIds: ids, dueDate: addDays(TODAY, 5) }, key())).data.memo;
    assert.equal((await api(ADMIN, 'PATCH', `/v1/admin/shops/${s.id}`, { creditLimitPaise: 1 })).status, 200); // every conversion is pending
    let pending = (await api(a.token, 'POST', `/v1/memos/${memo.id}/convert`, { pieceIds: [ids[0]] }, key())).data.order;
    assert.equal(pending.status, 'PENDING_APPROVAL');
    for (let r = 0; r < ROUNDS; r++) {
      const [rj, cv] = await Promise.all([
        api(ADMIN, 'POST', `/v1/admin/orders/${pending.id}/reject`, { reason: `race ${r}` }),
        api(a.token, 'POST', `/v1/memos/${memo.id}/convert`, { pieceIds: [ids[r + 1]] }, key()),
      ]);
      assert.deepEqual([rj.status, cv.status], [200, 200], `round ${r}: ${JSON.stringify([rj.error, cv.error])}`);
      assert.equal(rj.data.order.status, 'REJECTED');
      assert.equal((await db.samplePiece.findUniqueOrThrow({ where: { id: ids[r] } })).custodianType, 'SHOP');
      pending = cv.data.order;
    }
    const items = await db.memoItem.findMany({ where: { memoId: memo.id } });
    assert.equal(items.filter((i) => i.status === 'CONVERTED').length, 1, 'only the last conversion is still sold');
  });
});

describe('v3 integrity checks', () => {
  test('V14. db:check-orphans reports SOLD pieces with no live order (read-only, exit 1); guard lookups use the OrderItem indexes', async () => {
    const s = await shop(0, 0);
    const { agent: a, visitId } = await openVisit(s);
    const d = await design('AJ-PND-2241');
    const [pid] = (await api(ADMIN, 'POST', `/v1/admin/designs/${d.id}/pieces`, { count: 1 })).data.pieces.map((p: J) => p.id);
    await api(ADMIN, 'POST', '/v1/admin/pieces/issue', { pieceIds: [pid], agentId: a.id });
    const memo = (await api(a.token, 'POST', '/v1/memos', { visitId, pieceIds: [pid], dueDate: addDays(TODAY, 5) }, key())).data.memo;
    await api(ADMIN, 'PATCH', `/v1/admin/shops/${s.id}`, { creditLimitPaise: 1 });
    const o = (await api(a.token, 'POST', `/v1/memos/${memo.id}/convert`, { pieceIds: [pid] }, key())).data.order;
    assert.equal(o.status, 'PENDING_APPROVAL');
    assert.ok(!(await findSoldOrphans(db)).some((r) => r.pieceId === pid));
    // Simulate a pre-fix orphan: reject behind the service with triggers off (as a pre-v3 build would have).
    const bypass = (status: 'REJECTED' | 'PENDING_APPROVAL') =>
      db.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
        await tx.$executeRaw`UPDATE "Order" SET status = ${status}::"OrderStatus" WHERE id = ${o.id}`;
      }, { timeout: 30_000 });
    await bypass('REJECTED');
    try {
      const found = (await findSoldOrphans(db)).find((r) => r.pieceId === pid);
      assert.ok(found, 'orphan reported');
      assert.deepEqual([found!.tenantId, found!.lastOrderId, found!.lastOrderStatus], [AURUM, o.id, 'REJECTED']);
      const env = { ...process.env, DATABASE_URL: ENV.DATABASE_URL, DATABASE_URL_DIRECT: ENV.DATABASE_URL };
      let code = 0;
      let out = '';
      try {
        execSync('npx tsx scripts/check-orphans.ts', { cwd: apiRoot, env, stdio: 'pipe' });
      } catch (e) {
        code = (e as { status: number }).status;
        out = String((e as { stderr: Buffer }).stderr);
      }
      assert.equal(code, 1, 'non-zero exit when orphans exist');
      assert.match(out, new RegExp(found!.tagCode));
      assert.equal((await db.samplePiece.findUniqueOrThrow({ where: { id: pid } })).custodianType, 'SOLD', 'read-only: no repair');
    } finally {
      await bypass('PENDING_APPROVAL');
    }
    assert.ok(!(await findSoldOrphans(db)).some((r) => r.pieceId === pid));
    // n1: the trigger lookups can use the new indexes (seqscan off so the tiny test table does not hide it)
    const plans = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
      // the OrderItem access path of jr_check_sold_piece() (the join to "Order" is by its pkey)
      const byPiece = await tx.$queryRaw<{ 'QUERY PLAN': string }[]>`EXPLAIN SELECT oi."orderId" FROM "OrderItem" oi WHERE oi."pieceId" = ${pid}`;
      // the OrderItem access path of jr_order_dead_guard() (with "pieceId" IS NOT NULL the planner may also
      // pick OrderItem_pieceId_idx when few lines carry a piece — still an index scan; assert the orderId path)
      const byOrder = await tx.$queryRaw<{ 'QUERY PLAN': string }[]>`EXPLAIN SELECT "pieceId" FROM "OrderItem" WHERE "orderId" = ${o.id}`;
      return [byPiece, byOrder].map((p) => p.map((r) => r['QUERY PLAN']).join('\n'));
    }, { timeout: 30_000 });
    assert.match(plans[0], /OrderItem_pieceId_idx/, plans[0]);
    assert.match(plans[1], /OrderItem_orderId_idx/, plans[1]);
  });
});

describe('v3 one activity model', () => {
  test('V6. every event type carries its refs (live flow + seeded history), and ActivityItem exposes them', async () => {
    const s = await shop(10_000_000_000, 0);
    const { agent: a, visitId } = await openVisit(s);
    const d = await design('AJ-PND-2241');
    const intake = await api(ADMIN, 'POST', `/v1/admin/designs/${d.id}/pieces`, { count: 4 });
    const ids: string[] = intake.data.pieces.map((p: J) => p.id);
    await api(ADMIN, 'POST', '/v1/admin/pieces/issue', { pieceIds: ids, agentId: a.id });
    const m1 = (await api(a.token, 'POST', '/v1/memos', { visitId, pieceIds: ids.slice(0, 3), dueDate: addDays(TODAY, 5) }, key())).data;
    // QR acknowledgement (public page)
    const tok = m1.ack.url.split('/ack/')[1];
    assert.equal((await api(null, 'POST', `/v1/public/memo-ack/${tok}`, { confirm: true })).status, 200);
    assert.equal((await api(a.token, 'POST', `/v1/memos/${m1.memo.id}/extend`, { dueDate: addDays(TODAY, 9) })).status, 200);
    assert.equal((await api(a.token, 'POST', `/v1/memos/${m1.memo.id}/return`, { pieceIds: [ids[0]] }, key())).status, 200);
    assert.equal((await api(a.token, 'POST', `/v1/memos/${m1.memo.id}/convert`, { pieceIds: [ids[1]] }, key())).status, 200);
    // OTP acknowledgement + an overdue memo
    const m2 = (await api(a.token, 'POST', '/v1/memos', { visitId, pieceIds: [ids[3]], dueDate: addDays(TODAY, 1) }, key())).data;
    const code = (await api(null, 'GET', `/v1/public/memo-ack/${m2.ack.url.split('/ack/')[1]}`)).data.code;
    assert.equal((await api(a.token, 'POST', `/v1/memos/${m2.memo.id}/ack/verify`, { code })).status, 200);
    await db.memo.update({ where: { id: m2.memo.id }, data: { dueDate: new Date(`${addDays(TODAY, -1)}T00:00:00Z`) } });
    await dispatch();
    // orders: confirmed → settled, confirmed → cancelled, pending → approved, pending → rejected
    const d2 = await design();
    const o1 = (await order(a.token, visitId, d2.id)).data.order;
    const o2 = (await order(a.token, visitId, d2.id)).data.order;
    let o3: J, o4: J;
    try {
      await setThreshold(1);
      o3 = (await order(a.token, visitId, d2.id)).data.order;
      o4 = (await order(a.token, visitId, d2.id)).data.order;
    } finally {
      await setThreshold(SEED_THRESHOLD);
    }
    await api(ADMIN, 'POST', `/v1/admin/orders/${o1.id}/settle`);
    await api(ADMIN, 'POST', `/v1/admin/orders/${o2.id}/cancel`, {});
    await api(ADMIN, 'POST', `/v1/admin/orders/${o3.id}/approve`);
    await api(ADMIN, 'POST', `/v1/admin/orders/${o4.id}/reject`, { reason: 'No' });
    assert.equal((await api(a.token, 'POST', `/v1/visits/${visitId}/complete`, { summary: 'v3 refs flow' })).status, 200);

    const evs = await db.outboxEvent.findMany({ where: { tenantId: AURUM, OR: [{ shopId: s.id }, { agentId: a.id }] } });
    const types = new Set(evs.map((e) => e.type));
    for (const t of WEBHOOK_EVENT_TYPES) assert.ok(types.has(t), `flow produced ${t}`);
    const need: Record<string, ('shopId' | 'agentId' | 'visitId' | 'orderId' | 'memoId' | 'pieceIds')[]> = {
      'visit.': ['shopId', 'agentId', 'visitId'],
      'order.': ['shopId', 'agentId', 'visitId', 'orderId'],
      'memo.created': ['shopId', 'agentId', 'visitId', 'memoId', 'pieceIds'],
      'memo.returned': ['shopId', 'agentId', 'visitId', 'memoId', 'pieceIds'],
      'memo.converted': ['shopId', 'agentId', 'visitId', 'memoId', 'orderId', 'pieceIds'],
      'memo.acknowledged': ['shopId', 'agentId', 'visitId', 'memoId', 'pieceIds'],
      'memo.extended': ['shopId', 'agentId', 'visitId', 'memoId'],
      'memo.overdue': ['shopId', 'agentId', 'memoId'],
      'sample.custody_changed': ['pieceIds'], // + agent and/or shop, checked below (SHOP → SOLD names no agent)
    };
    for (const e of evs) {
      const k = need[e.type] ?? need[`${e.type.split('.')[0]}.`];
      assert.ok(k, `refs spec for ${e.type}`);
      for (const f of k) assert.ok(f === 'pieceIds' ? e.pieceIds.length > 0 : e[f], `${e.type} ${e.id} has ${f}`);
      if (e.type === 'sample.custody_changed') assert.ok(e.shopId || e.agentId, `${e.id} names a custodian`);
      if (e.shopId) assert.equal(e.shopId, s.id);
      if (e.type === 'sample.custody_changed' && (e.payload as J).data.to.type !== 'AGENT') assert.equal(e.shopId, s.id, 'hand-over/return/sale names the shop');
    }
    // converted order's events carry the source memo
    assert.ok(evs.some((e) => e.type === 'order.created' && e.memoId === m1.memo.id));
    // seeded history: every event names at least one record, and refs match the payload
    const seeded = await db.outboxEvent.findMany({ where: { tenantId: AURUM, type: { not: 'ping' } } });
    for (const e of seeded) assert.ok(e.shopId || e.agentId || e.orderId || e.memoId || e.visitId || e.pieceIds.length, `${e.type} ${e.id} has a ref`);
    // the projection exposes kind, refs and detail
    const items = (await api(ADMIN, 'GET', `/v1/admin/activity?shopId=${s.id}`)).data as J[];
    const proof = items.find((i) => i.type === 'visit.proof_uploaded');
    assert.equal(proof.kind, 'proof');
    assert.ok(proof.detail.photoUrl);
    const ack1 = items.find((i) => i.type === 'memo.acknowledged' && i.refs.memo.id === m1.memo.id);
    const ack2 = items.find((i) => i.type === 'memo.acknowledged' && i.refs.memo.id === m2.memo.id);
    assert.deepEqual([ack1.kind, ack1.refs.memo.number, ack1.detail.method, ack2.detail.method], ['ack', m1.memo.number, 'QR_CONFIRM', 'OTP']);
    const pend = items.find((i) => i.type === 'order.pending_approval');
    assert.deepEqual([pend.kind, pend.detail.reasons, pend.refs.order.id === o3.id || pend.refs.order.id === o4.id], ['order', ['ORDER_THRESHOLD'], true]);
    const custody = items.find((i) => i.type === 'sample.custody_changed' && i.detail.reason === 'MEMO_HANDOVER' && i.refs.memo?.id === m1.memo.id);
    assert.ok(custody.refs.pieces.length === 3 && custody.refs.pieces.every((p: J) => /^AJ-S-/.test(p.tagCode)) && custody.detail.fromLabel && custody.detail.toLabel);
    for (const i of items) assert.ok(i.refs.shop.id === s.id && i.refs.shop.name === s.name && i.kind && i.title);
  });

  test('V7. GET /admin/activity filters by every ref, pages by cursor, and record endpoints use the same projection', async () => {
    const sharma = await db.shop.findFirstOrThrow({ where: { tenantId: AURUM, name: 'Royal Gems' } });
    const ord = await db.order.findFirstOrThrow({ where: { tenantId: AURUM, shopId: sharma.id, status: 'PENDING_APPROVAL' } });
    const memo = await db.memo.findFirstOrThrow({ where: { tenantId: AURUM } });
    const piece = await db.memoItem.findFirstOrThrow({ where: { memoId: memo.id } });
    const cases: [string, string, (i: J) => boolean][] = [
      ['shopId', sharma.id, (i) => i.refs.shop?.id === sharma.id],
      ['agentId', ord.agentId, (i) => i.refs.agent?.id === ord.agentId],
      ['visitId', ord.visitId!, (i) => i.refs.visit?.id === ord.visitId],
      ['orderId', ord.id, (i) => i.refs.order?.id === ord.id],
      ['memoId', memo.id, (i) => i.refs.memo?.id === memo.id],
      ['pieceId', piece.pieceId, (i) => i.refs.pieces?.some((p: J) => p.id === piece.pieceId)],
    ];
    for (const [k, v, ok] of cases) {
      const r = await api(ADMIN, 'GET', `/v1/admin/activity?${k}=${v}`);
      assert.equal(r.status, 200);
      assert.ok(r.data.length > 0, `${k} has events`);
      assert.ok(r.data.every(ok), `${k}: every item references it`);
      const expected = await db.outboxEvent.count({ where: { tenantId: AURUM, type: { not: 'ping' }, ...(k === 'pieceId' ? { pieceIds: { has: v } } : { [k]: v }) } });
      assert.equal(r.data.length, Math.min(100, expected), `${k}: all of them`);
    }
    // the order record's activity is the same projection with the same filter
    const rec = (await api(ADMIN, 'GET', `/v1/admin/orders/${ord.id}`)).data;
    const feed = (await api(ADMIN, 'GET', `/v1/admin/activity?orderId=${ord.id}`)).data;
    assert.deepEqual(rec.activity, feed);
    assert.deepEqual((await api(ADMIN, 'GET', `/v1/admin/shops/${sharma.id}`)).data.activity, (await api(ADMIN, 'GET', `/v1/admin/activity?shopId=${sharma.id}&limit=40`)).data.items);
    assert.ok(rec.order.approval.reasons.includes('ORDER_THRESHOLD'));
    // cursor paging: no overlap, same order as the bare list
    const bare = (await api(ADMIN, 'GET', '/v1/admin/activity')).data as J[];
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const r = await api(ADMIN, 'GET', `/v1/admin/activity?limit=7${cursor ? `&before=${cursor}` : ''}`);
      assert.equal(r.status, 200);
      seen.push(...r.data.items.map((i: J) => i.id));
      cursor = r.data.nextCursor;
      pages++;
    } while (cursor && seen.length < bare.length);
    assert.deepEqual(seen.slice(0, bare.length), bare.map((i) => i.id));
    assert.equal(new Set(seen).size, seen.length);
    assert.ok(pages > 1);
    assert.equal((await api(ADMIN, 'GET', '/v1/admin/activity?before=bm9wZQ')).status, 400);
    assert.equal((await api(ADMIN, 'GET', '/v1/admin/activity?limit=500')).status, 400);
  });
});

describe('v3 settings + migration', () => {
  test('V8. tenant settings: GET/PATCH audited, validated, admin-only and tenant-isolated', async () => {
    const r = await api(ADMIN, 'GET', '/v1/admin/settings');
    assert.deepEqual(r.data, { approvalThresholdPaise: SEED_THRESHOLD, demoMode: true });
    const other = await db.tenant.create({ data: { slug: `v3-other-${Date.now()}`, name: 'V3 Other', demoMode: false } });
    const email = `boss-${Date.now()}@v3-other.test`;
    await db.user.create({ data: { tenantId: other.id, name: 'Other Boss', email, role: 'ADMIN', passwordHash: await bcrypt.hash('Other@2026x', 4) } });
    const OTHER = await login(email, 'Other@2026x');
    assert.deepEqual((await api(OTHER, 'GET', '/v1/admin/settings')).data, { approvalThresholdPaise: null, demoMode: false });
    const p = await api(OTHER, 'PATCH', '/v1/admin/settings', { approvalThresholdPaise: 5_000_000, tenantId: AURUM });
    assert.equal(p.status, 400, 'unknown keys (incl. tenantId) are refused');
    const ok = await api(OTHER, 'PATCH', '/v1/admin/settings', { approvalThresholdPaise: 5_000_000 });
    assert.deepEqual(ok.data, { approvalThresholdPaise: 5_000_000, demoMode: false });
    assert.equal(Number((await db.tenant.findUniqueOrThrow({ where: { id: AURUM } })).approvalThresholdPaise), SEED_THRESHOLD, 'aurum untouched');
    assert.deepEqual((await api(ADMIN, 'GET', '/v1/admin/settings')).data.approvalThresholdPaise, SEED_THRESHOLD);
    assert.equal(await db.auditLog.count({ where: { tenantId: other.id, action: 'tenant.settings' } }), 1);
    const audit = (await api(OTHER, 'GET', '/v1/admin/audit?entityType=Tenant')).data;
    assert.match(audit[0].summary, /approval threshold none → ₹50,000/);
    for (const bad of [{ approvalThresholdPaise: 0 }, { approvalThresholdPaise: -5 }, { approvalThresholdPaise: 10.5 }, { approvalThresholdPaise: '100' }, {}]) {
      assert.equal((await api(ADMIN, 'PATCH', '/v1/admin/settings', bad)).status, 400, JSON.stringify(bad));
    }
    const RAHUL = await login('rahul@aurum.test', 'Rahul@2026');
    assert.equal((await api(RAHUL, 'GET', '/v1/admin/settings')).status, 403);
    assert.equal((await api(RAHUL, 'PATCH', '/v1/admin/settings', { approvalThresholdPaise: null })).status, 403);
    // another tenant's shop/order ids → 404 on the v3 endpoints
    const aShop = await db.shop.findFirstOrThrow({ where: { tenantId: AURUM } });
    const aOrder = await db.order.findFirstOrThrow({ where: { tenantId: AURUM, status: 'CONFIRMED' } });
    assert.equal((await api(OTHER, 'GET', `/v1/admin/shops/${aShop.id}/credit`)).status, 404);
    assert.equal((await api(OTHER, 'POST', `/v1/admin/orders/${aOrder.id}/settle`)).status, 404);
    assert.equal((await api(OTHER, 'POST', `/v1/admin/orders/${aOrder.id}/cancel`, {})).status, 404);
    assert.deepEqual((await api(OTHER, 'GET', `/v1/admin/activity?shopId=${aShop.id}`)).data, []);
    // null clears
    assert.deepEqual((await api(OTHER, 'PATCH', '/v1/admin/settings', { approvalThresholdPaise: null })).data.approvalThresholdPaise, null);
  });

  test('V9. legacy migration: SUBMITTED re-evaluated by the credit rule per shop in time order; refs back-filled', async () => {
    const sc = scratch('jewelroute_migtest');
    const psql = (_u: unknown, args: string) => sc.psql(args);
    const mig = sc.url;
    const m = new PrismaClient({ datasources: { db: { url: String(mig) } } });
    try {
      sc.deployPreV3();
      // v2-era data: shop A limit ₹10,000 with an APPROVED ₹3,000 order and ₹1,000 out on memo;
      // SUBMITTED ₹5,000 (fits: 3k+1k+5k = 9k), ₹3,000 (9k+3k = 12k > 10k → pending), ₹500 (9k+0.5k → fits).
      // Shop B has no limit: any SUBMITTED → CONFIRMED.
      psql(mig, `-c "${`
        INSERT INTO \\"Tenant\\" (id, slug, name) VALUES ('t1','t1','T1');
        INSERT INTO \\"User\\" (id, \\"tenantId\\", email, name, role, \\"passwordHash\\") VALUES ('u1','t1','a@t1','Agent','FIELD_AGENT','x');
        INSERT INTO \\"Shop\\" (id, \\"tenantId\\", code, name, address, area, city, lat, lng, \\"creditLimitPaise\\") VALUES
          ('sa','t1','A','Shop A','x','x','x',28.6,77.2,1000000), ('sb','t1','B','Shop B','x','x','x',28.6,77.2,0);
        INSERT INTO \\"JewelryDesign\\" (id, \\"tenantId\\", sku, name, category, collection, purity, \\"grossWeightMg\\", \\"netWeightMg\\", \\"makingChargeValue\\") VALUES ('d1','t1','S','D','c','c','K22',1000,1000,0);
        INSERT INTO \\"SamplePiece\\" (id, \\"tenantId\\", \\"designId\\", \\"tagCode\\", \\"grossWeightMg\\", \\"netWeightMg\\", \\"custodianType\\", \\"custodianShopId\\", \\"updatedAt\\") VALUES ('p1','t1','d1','T1',1000,1000,'SHOP','sa',now());
        INSERT INTO \\"Memo\\" (id, \\"tenantId\\", number, \\"shopId\\", \\"agentId\\", \\"clientOpId\\", \\"dueDate\\", \\"totalValuePaise\\") VALUES ('m1','t1','M1','sa','u1','c-m1','2026-10-30',100000);
        INSERT INTO \\"MemoItem\\" (id, \\"tenantId\\", \\"memoId\\", \\"pieceId\\", \\"valuePaise\\") VALUES ('mi1','t1','m1','p1',100000);
        INSERT INTO \\"Order\\" (id, \\"tenantId\\", number, \\"shopId\\", \\"agentId\\", status, \\"clientOpId\\", \\"subtotalPaise\\", \\"gstPaise\\", \\"totalPaise\\", \\"goldRateSnapshot\\", \\"createdAt\\") VALUES
          ('o0','t1','O0','sa','u1','APPROVED','c0',300000,0,300000,'[]', now() - interval '5 hours'),
          ('o1','t1','O1','sa','u1','SUBMITTED','c1',500000,0,500000,'[]', now() - interval '4 hours'),
          ('o2','t1','O2','sa','u1','SUBMITTED','c2',300000,0,300000,'[]', now() - interval '3 hours'),
          ('o3','t1','O3','sa','u1','SUBMITTED','c3',50000,0,50000,'[]', now() - interval '2 hours'),
          ('o4','t1','O4','sa','u1','REJECTED','c4',900000,0,900000,'[]', now() - interval '1 hours'),
          ('o5','t1','O5','sb','u1','SUBMITTED','c5',999999900,0,999999900,'[]', now());
        INSERT INTO \\"OutboxEvent\\" (id, \\"tenantId\\", type, \\"aggregateType\\", \\"aggregateId\\", payload) VALUES
          ('evt_1','t1','order.approved','Order','o0','{\\"data\\":{\\"orderId\\":\\"o0\\",\\"shop\\":{\\"id\\":\\"sa\\"},\\"agentRef\\":{\\"id\\":\\"u1\\"}}}'),
          ('evt_2','t1','sample.custody_changed','SamplePiece','p1','{\\"data\\":{\\"pieces\\":[{\\"id\\":\\"p1\\"}],\\"from\\":{\\"type\\":\\"AGENT\\",\\"agentId\\":\\"u1\\"},\\"to\\":{\\"type\\":\\"SHOP\\",\\"shopId\\":\\"sa\\"},\\"memoId\\":\\"m1\\",\\"visitId\\":\\"v9\\"}}'),
          ('evt_3','t1','memo.converted','Memo','m1','{\\"data\\":{\\"memoId\\":\\"m1\\",\\"orderId\\":\\"o3\\",\\"shop\\":{\\"id\\":\\"sa\\"},\\"agent\\":{\\"id\\":\\"u1\\"},\\"pieces\\":[{\\"id\\":\\"p1\\"}]}}');
      `.replace(/\n\s*/g, ' ')}"`);
      sc.deployAll(); // the real deploy path: 0300 … 0600, each in Prisma's own transaction
      const rows = await m.order.findMany({ orderBy: { number: 'asc' } });
      const by = Object.fromEntries(rows.map((r) => [r.number, r]));
      assert.deepEqual(
        rows.map((r) => [r.number, r.status, r.approvalReasons]),
        [
          ['O0', 'APPROVED', []],
          ['O1', 'CONFIRMED', []],
          ['O2', 'PENDING_APPROVAL', ['CREDIT_LIMIT']],
          ['O3', 'CONFIRMED', []],
          ['O4', 'REJECTED', []],
          ['O5', 'CONFIRMED', []],
        ],
      );
      assert.deepEqual([by.O0.approvalRequired, by.O4.approvalRequired, by.O1.approvalRequired, by.O2.approvalRequired], [true, true, false, true]);
      const snap = by.O2.creditSnapshot as J;
      assert.deepEqual([snap.legacy, snap.exposurePaise, snap.projectedExposurePaise, snap.creditLimitPaise, snap.memoExposurePaise], [true, 900000, 1200000, 1000000, 100000]);
      assert.equal((by.O3.creditSnapshot as J).exposurePaise, 900000, 'pending O2 does not count');
      assert.equal(by.O0.creditSnapshot, null);
      const ev = Object.fromEntries((await m.outboxEvent.findMany()).map((e) => [e.id, e]));
      assert.deepEqual([ev.evt_1.shopId, ev.evt_1.agentId, ev.evt_1.orderId], ['sa', 'u1', 'o0']);
      assert.deepEqual([ev.evt_2.shopId, ev.evt_2.agentId, ev.evt_2.memoId, ev.evt_2.visitId, ev.evt_2.pieceIds], ['sa', 'u1', 'm1', 'v9', ['p1']]);
      assert.deepEqual([ev.evt_3.memoId, ev.evt_3.orderId, ev.evt_3.pieceIds], ['m1', 'o3', ['p1']]);
      // TS derivation and SQL back-fill agree
      const { eventRefs } = await import('../src/core/event-refs');
      for (const e of Object.values(ev)) {
        const r = eventRefs(e.aggregateType, e.aggregateId, (e.payload as J).data);
        assert.deepEqual(r, { shopId: e.shopId, agentId: e.agentId, visitId: e.visitId, orderId: e.orderId, memoId: e.memoId, pieceIds: e.pieceIds }, e.id);
      }
      // B2: SUBMITTED exists again (expand/contract) but no row may use it
      const labels = await m.$queryRaw<{ l: string }[]>`SELECT unnest(enum_range(NULL::"OrderStatus"))::text AS l`;
      assert.ok(labels.some((x) => x.l === 'SUBMITTED'));
      await assert.rejects(m.$executeRaw`UPDATE "Order" SET status = 'SUBMITTED' WHERE id = 'o1'`, /Order_no_submitted/);
    } finally {
      await m.$disconnect();
      sc.drop();
    }
  });

  test('V11. rollback: forward → down script → old enum + mapped statuses + history removed → forward again', async () => {
    const sc = scratch('jewelroute_rbtest');
    const m = new PrismaClient({ datasources: { db: { url: String(sc.url) } } });
    try {
      sc.deployAll();
      const sqlFile = join(mkdtempSync(join(tmpdir(), 'jr-rb-')), 'data.sql');
      writeFileSync(
        sqlFile,
        `INSERT INTO "Tenant" (id, slug, name, "approvalThresholdPaise") VALUES ('t1','t1','T1', 100);
         INSERT INTO "User" (id, "tenantId", email, name, role, "passwordHash") VALUES ('u1','t1','a@t1','Agent','FIELD_AGENT','x');
         INSERT INTO "Shop" (id, "tenantId", code, name, address, area, city, lat, lng, "creditLimitPaise", "openingOutstandingPaise") VALUES ('sa','t1','A','Shop A','x','x','x',28.6,77.2,1000,50);
         INSERT INTO "JewelryDesign" (id, "tenantId", sku, name, category, collection, purity, "grossWeightMg", "netWeightMg", "makingChargeValue") VALUES ('d1','t1','S','D','c','c','K22',1000,1000,0);
         INSERT INTO "SamplePiece" (id, "tenantId", "designId", "tagCode", "grossWeightMg", "netWeightMg", "custodianType", "custodianShopId", "custodySeq", "updatedAt") VALUES ('p1','t1','d1','T1',1000,1000,'SHOP','sa',2,now());
         INSERT INTO "CustodyEvent" (id, "tenantId", "pieceId", seq, "fromType", "toType", "toShopId", reason) VALUES ('ce1','t1','p1',2,'SOLD','SHOP','sa','SALE_REJECTED');
         INSERT INTO "Order" (id, "tenantId", number, "shopId", "agentId", status, "clientOpId", "subtotalPaise", "gstPaise", "totalPaise", "goldRateSnapshot", "approvalRequired", "approvalReasons", "settledAt", "cancelledAt", "cancellationReason") VALUES
           ('o1','t1','O1','sa','u1','CONFIRMED','c1',10,0,10,'[]', false, '{}', now(), NULL, NULL),
           ('o2','t1','O2','sa','u1','PENDING_APPROVAL','c2',200,0,200,'[]', true, '{ORDER_THRESHOLD}', NULL, NULL, NULL),
           ('o3','t1','O3','sa','u1','CANCELLED','c3',20,0,20,'[]', false, '{}', NULL, now(), 'Changed design'),
           ('o4','t1','O4','sa','u1','APPROVED','c4',300,0,300,'[]', true, '{ORDER_THRESHOLD}', NULL, NULL, NULL);`,
      );
      sc.psql(`-f "${sqlFile}"`);
      // Rollbacks run newest first: the final-audit migrations (0900, 1000) come off before v3.
      sc.psql(`-f "${join(apiRoot, 'prisma/rollback/20261021000900_audit_down.sql')}"`);
      sc.psql(`-f "${join(apiRoot, 'prisma/rollback/20261021000300_v3_down.sql')}"`);
      const one = async <T>(q: Promise<{ v: T }[]>) => (await q)[0].v;
      assert.equal(await one(m.$queryRaw<{ v: bigint }[]>`SELECT count(*) AS v FROM information_schema.columns WHERE table_schema = 'public' AND column_name IN ('rotatedAt', 'lastSeenAt', 'selfAckSuspected', 'ackViewSuspected', 'ackIp', 'successorId', 'graceUsedAt', 'deviceHash')`), 0n, 'audit columns removed');
      assert.equal(await one(m.$queryRaw<{ v: string }[]>`SELECT string_agg(l::text, ',' ORDER BY l) AS v FROM unnest(enum_range(NULL::"OrderStatus")) l`), 'DRAFT,SUBMITTED,APPROVED,REJECTED');
      assert.equal(await one(m.$queryRaw<{ v: string }[]>`SELECT string_agg(number || '=' || status::text, ',' ORDER BY number) AS v FROM "Order"`), 'O1=SUBMITTED,O2=SUBMITTED,O3=REJECTED,O4=APPROVED');
      assert.equal(await one(m.$queryRaw<{ v: string }[]>`SELECT "rejectionReason" AS v FROM "Order" WHERE id = 'o3'`), 'Cancelled: Changed design');
      assert.equal(await one(m.$queryRaw<{ v: string }[]>`SELECT reason::text AS v FROM "CustodyEvent" WHERE id = 'ce1'`), 'ADJUSTMENT');
      assert.equal(await one(m.$queryRaw<{ v: bigint }[]>`SELECT count(*) AS v FROM information_schema.columns WHERE table_schema = 'public' AND column_name IN ('settledAt', 'openingOutstandingPaise', 'approvalThresholdPaise', 'pieceIds', 'creditSnapshot')`), 0n);
      assert.equal(await one(m.$queryRaw<{ v: bigint }[]>`SELECT count(*) AS v FROM "_prisma_migrations" WHERE migration_name >= '20261021000300'`), 0n);
      assert.equal(await one(m.$queryRaw<{ v: string }[]>`SELECT column_default AS v FROM information_schema.columns WHERE table_name = 'Order' AND column_name = 'status'`), `'SUBMITTED'::"OrderStatus"`);
      // the old schema's guards still hold: the pre-v3 build can write SUBMITTED again
      await m.$executeRaw`UPDATE "Order" SET status = 'SUBMITTED' WHERE id = 'o4'`;
      await m.$executeRaw`UPDATE "Order" SET status = 'APPROVED' WHERE id = 'o4'`;
      // forward again: v3 re-applies on top of the rolled-back data
      sc.deployAll();
      const rows = await m.order.findMany({ orderBy: { number: 'asc' } });
      assert.deepEqual(rows.map((r) => r.status), ['CONFIRMED', 'CONFIRMED', 'REJECTED', 'APPROVED']);
    } finally {
      await m.$disconnect();
      sc.drop();
    }
  });

  test('V12. activity-refs back-fill is batched, uses eventRefs(), and is idempotent', async () => {
    const before = await db.outboxEvent.findMany({ where: { tenantId: AURUM, type: { not: 'ping' } }, orderBy: { id: 'asc' } });
    const victims = before.filter((_, i) => i % 3 === 0);
    assert.ok(victims.length > 10);
    await db.outboxEvent.updateMany({ where: { id: { in: victims.map((v) => v.id) } }, data: { shopId: null, agentId: null, visitId: null, orderId: null, memoId: null, pieceIds: [] } });
    const run1 = await backfillActivityRefs(db, { batch: 7 });
    assert.equal(run1.updated, victims.length);
    assert.ok(run1.batches >= Math.ceil(victims.length / 7));
    const after = await db.outboxEvent.findMany({ where: { id: { in: victims.map((v) => v.id) } } });
    const B = new Map(before.map((e) => [e.id, e]));
    for (const e of after) {
      const o = B.get(e.id)!;
      assert.deepEqual([e.shopId, e.agentId, e.visitId, e.orderId, e.memoId, e.pieceIds], [o.shopId, o.agentId, o.visitId, o.orderId, o.memoId, o.pieceIds], e.id);
    }
    const run2 = await backfillActivityRefs(db, { batch: 7 });
    assert.equal(run2.updated, 0, 'second run is a no-op');
  });
});
