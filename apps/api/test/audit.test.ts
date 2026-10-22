/* Final backend audit (docs/AUDIT-SYNC.md) — edge cases proven over real HTTP against real Postgres
 * (jewelroute_test, fresh seed per file). Every test asserts persisted rows, not just status codes:
 * a refusal must leave the ledger, the outbox, the idempotency table and the record rows untouched.
 * Fixtures are built per test (fresh agents/shops/pieces) so the file does not depend on test order. */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { createServer, IncomingMessage } from 'node:http';
import { AddressInfo } from 'node:net';
import { addDays, istDate, orderTotals } from '@jewelroute/shared';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { fingerprintOf } from '../src/core/idempotency';
import { throttleTracker, trustProxyHops } from '../src/common/client-ip';
import { api, BASE, db, dispatch, ENV, J, login, north, start, stop, uploadProof } from './harness';

const TODAY = istDate();
const SEED_THRESHOLD = 100_000_000; // ₹10L
const BETA_SLUG = 'audit-beta';
let ADMIN: string;
let RAHUL: string;
let KAVYA: string;
let AURUM: string;
let rahulId: string;
let kavyaId: string;
let n = 0;

const key = () => ({ 'Idempotency-Key': randomUUID() });
const dateOf = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const big = (_k: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v);

before(async () => {
  await start();
  await purgeTenant(BETA_SLUG);
  ADMIN = await login('admin@aurum.test', 'Aurum@2026');
  RAHUL = await login('rahul@aurum.test', 'Rahul@2026');
  KAVYA = await login('kavya@aurum.test', 'Kavya@2026');
  AURUM = (await db.tenant.findUniqueOrThrow({ where: { slug: 'aurum' } })).id;
  rahulId = (await db.user.findFirstOrThrow({ where: { tenantId: AURUM, email: 'rahul@aurum.test' } })).id;
  kavyaId = (await db.user.findFirstOrThrow({ where: { tenantId: AURUM, email: 'kavya@aurum.test' } })).id;
});
after(async () => {
  await purgeTenant(BETA_SLUG);
  await stop();
});

// ------------------------------------------------------------------ fixtures
/** Remove a test tenant completely (the append-only triggers allow DELETE only under the purge flag, as the seed does). */
async function purgeTenant(slug: string) {
  const t = await db.tenant.findUnique({ where: { slug } });
  if (!t) return;
  const tenantId = t.id;
  await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT set_config('jewelroute.allow_purge', 'on', true)`;
      await tx.webhookAttempt.deleteMany({ where: { delivery: { tenantId } } });
      await tx.webhookDelivery.deleteMany({ where: { tenantId } });
      await tx.receivedWebhook.deleteMany({ where: { tenantId } });
      await tx.outboxEvent.deleteMany({ where: { tenantId } });
      await tx.webhookEndpoint.deleteMany({ where: { tenantId } });
      await tx.auditLog.deleteMany({ where: { tenantId } });
      await tx.idempotencyKey.deleteMany({ where: { tenantId } });
      await tx.storedFile.deleteMany({ where: { tenantId } });
      await tx.docSequence.deleteMany({ where: { tenantId } });
      await tx.memoExtension.deleteMany({ where: { tenantId } });
      await tx.memoItem.deleteMany({ where: { tenantId } });
      await tx.orderItem.deleteMany({ where: { tenantId } });
      await tx.order.deleteMany({ where: { tenantId } });
      await tx.memo.deleteMany({ where: { tenantId } });
      await tx.custodyEvent.deleteMany({ where: { tenantId } });
      await tx.visitProof.deleteMany({ where: { tenantId } });
      await tx.visitNote.deleteMany({ where: { tenantId } });
      await tx.visit.deleteMany({ where: { tenantId } });
      await tx.samplePiece.deleteMany({ where: { tenantId } });
      await tx.jewelryDesign.deleteMany({ where: { tenantId } });
      await tx.goldRate.deleteMany({ where: { tenantId } });
      await tx.shop.deleteMany({ where: { tenantId } });
      await tx.refreshToken.deleteMany({ where: { tenantId } });
      await tx.user.deleteMany({ where: { tenantId } });
      await tx.tenant.delete({ where: { id: tenantId } });
    },
    { timeout: 60_000 },
  );
}

type Agent = { id: string; name: string; email: string; token: string };
async function agent(tenantId = AURUM): Promise<Agent> {
  const email = `audit-${Date.now()}-${++n}@audit.test`;
  const u = await db.user.create({ data: { tenantId, name: `Audit Agent ${n}`, email, role: 'FIELD_AGENT', passwordHash: await bcrypt.hash('Audit@2026x', 4) } });
  return { id: u.id, name: u.name, email, token: await login(email, 'Audit@2026x') };
}
async function shop(creditLimitPaise = 0, openingOutstandingPaise = 0, token = ADMIN) {
  const r = await api(token, 'POST', '/v1/admin/shops', { name: `Audit Shop ${Date.now()}-${++n}`, address: 'Audit lane', area: 'Audit', lat: 28.5 + n / 1_000, lng: 77.1, creditLimitPaise, openingOutstandingPaise });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.data.shop as J;
}
async function assign(a: Agent, s: J, token = ADMIN): Promise<string> {
  const v = await api(token, 'POST', '/v1/admin/assignments', { agentId: a.id, shopId: s.id, date: TODAY });
  assert.equal(v.status, 201, JSON.stringify(v.json));
  return v.data.visit.id;
}
async function checkIn(a: Agent, visitId: string, s: J) {
  const ci = await api(a.token, 'POST', `/v1/visits/${visitId}/check-in`, { lat: s.lat, lng: s.lng, accuracyM: 5 }, key());
  assert.equal(ci.status, 200, JSON.stringify(ci.json));
}
/** Checked in with an arrival photo — ready to sell. */
async function openVisit(a: Agent, s: J, token = ADMIN) {
  const visitId = await assign(a, s, token);
  await checkIn(a, visitId, s);
  await uploadProof(a.token, visitId, s.lat, s.lng);
  return visitId;
}
async function design(sku = 'AJ-RNG-2221', tenantId = AURUM) {
  return db.jewelryDesign.findFirstOrThrow({ where: { tenantId, sku } });
}
/** Fresh VAULT pieces of a design (intake), issued to `a` when given. */
async function pieces(count: number, designId: string, a?: Agent, token = ADMIN): Promise<string[]> {
  const r = await api(token, 'POST', `/v1/admin/designs/${designId}/pieces`, { count });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const ids = (r.data.pieces as J[]).map((p) => p.id as string);
  if (a) {
    const is = await api(token, 'POST', '/v1/admin/pieces/issue', { pieceIds: ids, agentId: a.id });
    assert.equal(is.status, 200, JSON.stringify(is.json));
  }
  return ids;
}
async function unitPrice(token: string, visitId: string, designId: string) {
  const cat = await api(token, 'GET', `/v1/visits/${visitId}/catalog`);
  return cat.data.designs.find((d: J) => d.id === designId).price.unitPricePaise as number;
}
const setThreshold = (v: number | null, token = ADMIN) => api(token, 'PATCH', '/v1/admin/settings', { approvalThresholdPaise: v });
/** Wait for the post-commit dispatcher (fan-out of events written so far) before a row snapshot. */
async function settle() {
  for (let i = 0; i < 2; i++) await dispatch();
}
async function raw(token: string | null, method: string, path: string, body: string) {
  const r = await fetch(`${BASE}${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body });
  const json = (await r.json().catch(() => ({}))) as J;
  return { status: r.status, error: json.error as J };
}
/** Custody state of some pieces: custodian + seq per piece, and the ledger length. */
async function custody(ids: string[]) {
  const ps = await db.samplePiece.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' }, select: { id: true, custodianType: true, custodianAgentId: true, custodianShopId: true, custodySeq: true } });
  const events = await db.custodyEvent.count({ where: { pieceId: { in: ids } } });
  const out = await db.memoItem.count({ where: { pieceId: { in: ids }, status: 'OUT' } });
  return { ps, events, out };
}
/** Every business row of a tenant except the columns the background dispatcher owns (fan-out stamps, delivery state). */
async function tenantRows(tenantId: string) {
  const w = { where: { tenantId }, orderBy: { id: 'asc' as const } };
  const [visits, orders, items, memos, memoItems, ext, piecesRows, events, outbox, audit, notes, proofs, endpoints, deliveries, shops, designs, users, idem, rates, tenant] = await Promise.all([
    db.visit.findMany(w),
    db.order.findMany(w),
    db.orderItem.findMany(w),
    db.memo.findMany(w),
    db.memoItem.findMany(w),
    db.memoExtension.findMany(w),
    db.samplePiece.findMany(w),
    db.custodyEvent.findMany(w),
    db.outboxEvent.findMany({ ...w, select: { id: true, type: true, payload: true } }),
    db.auditLog.findMany(w),
    db.visitNote.findMany(w),
    db.visitProof.findMany(w),
    db.webhookEndpoint.findMany(w),
    db.webhookDelivery.findMany({ ...w, select: { id: true, endpointId: true, eventId: true } }),
    db.shop.findMany(w),
    db.jewelryDesign.findMany(w),
    db.user.findMany({ ...w, select: { id: true, name: true, active: true, passwordHash: true, phone: true } }),
    db.idempotencyKey.findMany({ where: { tenantId }, orderBy: { key: 'asc' } }),
    db.goldRate.findMany(w),
    db.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
  ]);
  return JSON.stringify({ visits, orders, items, memos, memoItems, ext, piecesRows, events, outbox, audit, notes, proofs, endpoints, deliveries, shops, designs, users, idem, rates, tenant }, big);
}

describe('final audit — edge cases on persisted state', () => {
  // ------------------------------------------------------------------ A1
  test('A1. duplicate check-in: same visit twice, a second visit while one is open, a concurrent storm → exactly one open visit', async () => {
    const [s1, s2] = [await shop(), await shop()];
    const a = await agent();
    const [v1, v2] = [await assign(a, s1), await assign(a, s2)];
    const gps = { lat: s1.lat, lng: s1.lng, accuracyM: 5 };
    const k = randomUUID();
    const first = await api(a.token, 'POST', `/v1/visits/${v1}/check-in`, gps, { 'Idempotency-Key': k });
    assert.equal(first.status, 200, JSON.stringify(first.json));
    const replay = await api(a.token, 'POST', `/v1/visits/${v1}/check-in`, gps, { 'Idempotency-Key': k });
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.data, first.data, 'same key → the original response');
    const again = await api(a.token, 'POST', `/v1/visits/${v1}/check-in`, gps, key());
    assert.equal(again.error?.code, 'ALREADY_CHECKED_IN');
    const keyless = await api(a.token, 'POST', `/v1/visits/${v1}/check-in`, gps);
    assert.equal(keyless.error?.code, 'ALREADY_CHECKED_IN');
    const other = await api(a.token, 'POST', `/v1/visits/${v2}/check-in`, { lat: s2.lat, lng: s2.lng, accuracyM: 5 }, key());
    assert.equal(other.status, 409);
    assert.equal(other.error.code, 'ANOTHER_VISIT_OPEN');
    assert.equal(other.error.details.visitId, v1);
    const open = await db.visit.findMany({ where: { agentId: a.id, status: { in: ['CHECKED_IN', 'ACTIVE'] } } });
    assert.deepEqual(open.map((v) => v.id), [v1]);
    const v2row = await db.visit.findUniqueOrThrow({ where: { id: v2 } });
    assert.deepEqual([v2row.status, v2row.checkInAt, v2row.verification], ['PLANNED', null, null]);
    assert.equal(await db.outboxEvent.count({ where: { type: 'visit.checked_in', visitId: v1 } }), 1, 'one event for one check-in');
    assert.equal(await db.outboxEvent.count({ where: { type: 'visit.checked_in', visitId: v2 } }), 0);
    assert.equal(await db.idempotencyKey.count({ where: { userId: a.id } }), 1, 'only the successful check-in keeps its key');

    // concurrent storm: 3 requests per visit, all with their own key
    const b = await agent();
    const [s3, s4] = [await shop(), await shop()];
    const [w1, w2] = [await assign(b, s3), await assign(b, s4)];
    const calls = [w1, w1, w1, w2, w2, w2].map((vid) => {
      const s = vid === w1 ? s3 : s4;
      return api(b.token, 'POST', `/v1/visits/${vid}/check-in`, { lat: s.lat, lng: s.lng, accuracyM: 5 }, key());
    });
    const rs = await Promise.all(calls);
    assert.equal(rs.filter((r) => r.status === 200).length, 1, JSON.stringify(rs.map((r) => [r.status, r.error?.code])));
    for (const r of rs.filter((x) => x.status !== 200)) assert.ok(['ALREADY_CHECKED_IN', 'ANOTHER_VISIT_OPEN'].includes(r.error.code), r.error.code);
    assert.equal(await db.visit.count({ where: { agentId: b.id, status: { in: ['CHECKED_IN', 'ACTIVE'] } } }), 1);
    assert.equal(await db.outboxEvent.count({ where: { type: 'visit.checked_in', agentId: b.id } }), 1);
  });

  // ------------------------------------------------------------------ A2
  test('A2. duplicate order/memo with one Idempotency-Key: same body → same result + one row; other body → 422; no key → 400; concurrent → one row; ack token never stored in plain text', async () => {
    const s = await shop();
    const a = await agent();
    const visitId = await openVisit(a, s);
    const d = await design();
    // ---- orders
    const body = { visitId, items: [{ designId: d.id, quantity: 2 }] };
    const K = randomUUID();
    const o1 = await api(a.token, 'POST', '/v1/orders', body, { 'Idempotency-Key': K });
    assert.equal(o1.status, 201, JSON.stringify(o1.json));
    const o2 = await api(a.token, 'POST', '/v1/orders', body, { 'Idempotency-Key': K });
    assert.equal(o2.status, 201);
    assert.deepEqual(o2.data, o1.data);
    const o3 = await api(a.token, 'POST', '/v1/orders', { ...body, items: [{ designId: d.id, quantity: 3 }] }, { 'Idempotency-Key': K });
    assert.equal(o3.status, 422);
    assert.equal(o3.error.code, 'IDEMPOTENCY_KEY_REUSED');
    const o4 = await api(a.token, 'POST', '/v1/orders', body);
    assert.equal(o4.status, 400);
    assert.equal(o4.error.code, 'IDEMPOTENCY_KEY_REQUIRED');
    assert.equal(await db.order.count({ where: { visitId } }), 1, 'one row after replay, reuse and keyless');
    assert.equal(await db.orderItem.count({ where: { orderId: o1.data.order.id } }), 1);
    assert.equal((await db.orderItem.findFirstOrThrow({ where: { orderId: o1.data.order.id } })).quantity, 2, 'the 422 did not touch the order');
    assert.equal(await db.outboxEvent.count({ where: { orderId: o1.data.order.id, type: 'order.created' } }), 1);
    const K2 = randomUUID();
    const burst = await Promise.all(Array.from({ length: 8 }, () => api(a.token, 'POST', '/v1/orders', body, { 'Idempotency-Key': K2 })));
    assert.ok(burst.every((r) => r.status === 201), JSON.stringify(burst.map((r) => [r.status, r.error?.code])));
    for (const r of burst) assert.deepEqual(r.data, burst[0].data);
    assert.equal(await db.order.count({ where: { clientOpId: K2 } }), 1);
    assert.equal(await db.order.count({ where: { visitId } }), 2);

    // ---- memos
    const [p1, p2] = await pieces(2, d.id, a);
    const before = await custody([p1, p2]);
    const mb = { visitId, pieceIds: [p1], dueDate: addDays(TODAY, 5) };
    const K3 = randomUUID();
    const m1 = await api(a.token, 'POST', '/v1/memos', mb, { 'Idempotency-Key': K3 });
    assert.equal(m1.status, 201, JSON.stringify(m1.json));
    const m2 = await api(a.token, 'POST', '/v1/memos', mb, { 'Idempotency-Key': K3 });
    assert.equal(m2.status, 201);
    assert.deepEqual(m2.data, m1.data, 'replay is the original response, ack link included');
    const m3 = await api(a.token, 'POST', '/v1/memos', { ...mb, pieceIds: [p2] }, { 'Idempotency-Key': K3 });
    assert.equal(m3.status, 422);
    const m4 = await api(a.token, 'POST', '/v1/memos', { ...mb, pieceIds: [p2] });
    assert.equal(m4.status, 400);
    assert.equal(m4.error.code, 'IDEMPOTENCY_KEY_REQUIRED');
    const mid = await custody([p1, p2]);
    assert.equal(await db.memo.count({ where: { visitId } }), 1);
    assert.equal(mid.events, before.events + 1, 'one handover for p1, none for p2');
    assert.equal(mid.ps.find((p) => p.id === p2)!.custodySeq, before.ps.find((p) => p.id === p2)!.custodySeq);
    assert.equal(mid.ps.find((p) => p.id === p2)!.custodianType, 'AGENT');
    // The ack token is a bearer capability (retailer page + code): only its hash may be stored (DECISIONS › Retailer ack).
    const token = String(m1.data.ack.url).split('/ack/')[1];
    assert.ok(token && token.length >= 16);
    const stored = await db.idempotencyKey.findFirstOrThrow({ where: { tenantId: AURUM, key: K3 } });
    assert.ok(!JSON.stringify(stored.responseBody).includes(token), 'IdempotencyKey.responseBody must not hold the plaintext ack token');
    const K4 = randomUUID();
    const mburst = await Promise.all(Array.from({ length: 6 }, () => api(a.token, 'POST', '/v1/memos', { ...mb, pieceIds: [p2] }, { 'Idempotency-Key': K4 })));
    assert.ok(mburst.every((r) => r.status === 201), JSON.stringify(mburst.map((r) => [r.status, r.error?.code])));
    for (const r of mburst) assert.deepEqual(r.data, mburst[0].data);
    assert.equal(await db.memo.count({ where: { clientOpId: K4 } }), 1);
    assert.equal(await db.custodyEvent.count({ where: { pieceId: p2, reason: 'MEMO_HANDOVER' } }), 1);
    // return / convert without a key: refused, nothing moves
    const memoId = m1.data.memo.id;
    const pre = await custody([p1]);
    assert.equal((await api(a.token, 'POST', `/v1/memos/${memoId}/return`, { pieceIds: [p1] })).error?.code, 'IDEMPOTENCY_KEY_REQUIRED');
    assert.equal((await api(a.token, 'POST', `/v1/memos/${memoId}/convert`, { pieceIds: [p1] })).error?.code, 'IDEMPOTENCY_KEY_REQUIRED');
    assert.deepEqual(await custody([p1]), pre);
    assert.equal(await db.order.count({ where: { sourceMemoId: memoId } }), 0);
  });

  // ------------------------------------------------------------------ A3
  test('A3. invalid GPS: outside the fence, accuracy beyond the slack cap, NaN/∞/out-of-range/missing coords, SIMULATED on a non-demo tenant → refused, nothing written', async () => {
    const s = await shop();
    const g = await agent();
    const v = await assign(g, s);
    const path = `/v1/visits/${v}/check-in`;
    const invalid: unknown[] = [
      { lat: 91, lng: s.lng, accuracyM: 5 },
      { lat: -90.0001, lng: s.lng },
      { lat: s.lat, lng: 180.5, accuracyM: 5 },
      { lat: String(s.lat), lng: s.lng },
      { lat: null, lng: s.lng },
      { lng: s.lng, accuracyM: 5 },
      { lat: s.lat },
      {},
      { lat: s.lat, lng: s.lng, accuracyM: -1 },
      { lat: s.lat, lng: s.lng, accuracyM: 'good' },
    ];
    for (const b of invalid) {
      const r = await api(g.token, 'POST', path, b, key());
      assert.equal(r.status, 400, `${JSON.stringify(b)} → ${r.status}`);
      assert.equal(r.error.code, 'VALIDATION_FAILED');
    }
    const nan = await raw(g.token, 'POST', path, `{"lat":NaN,"lng":${s.lng}}`);
    assert.equal(nan.status, 400);
    const inf = await raw(g.token, 'POST', path, `{"lat":1e999,"lng":${s.lng},"accuracyM":5}`);
    assert.equal(inf.status, 400, 'Infinity (1e999) is not a coordinate');
    assert.equal(inf.error.code, 'VALIDATION_FAILED');
    const far = await api(g.token, 'POST', path, { lat: north(s.lat, 450), lng: s.lng, accuracyM: 10 }, key());
    assert.equal(far.status, 409);
    assert.equal(far.error.code, 'OUTSIDE_GEOFENCE');
    assert.ok(far.error.details.distanceM >= 440 && far.error.details.radiusM === 100);
    // 160 m with a ±500 m fix: slack is capped at 50 m → 150 m fence → outside
    const sloppy = await api(g.token, 'POST', path, { lat: north(s.lat, 160), lng: s.lng, accuracyM: 500 }, key());
    assert.equal(sloppy.error?.code, 'OUTSIDE_GEOFENCE');
    // missing accuracy earns no slack: 120 m is outside a 100 m fence
    const noAcc = await api(g.token, 'POST', path, { lat: north(s.lat, 120), lng: s.lng }, key());
    assert.equal(noAcc.error?.code, 'OUTSIDE_GEOFENCE');
    // SIMULATED on a tenant that is not in demo mode
    assert.equal((await api(ADMIN, 'PATCH', '/v1/admin/settings', { demoMode: false })).status, 200);
    try {
      const sim = await api(g.token, 'POST', path, { lat: 0, lng: 0, accuracyM: 0, simulated: true }, key());
      assert.equal(sim.status, 403);
      assert.equal(sim.error.code, 'SIMULATION_NOT_ALLOWED');
    } finally {
      assert.equal((await api(ADMIN, 'PATCH', '/v1/admin/settings', { demoMode: true })).status, 200);
    }
    const row = await db.visit.findUniqueOrThrow({ where: { id: v } });
    assert.deepEqual([row.status, row.checkInAt, row.checkInLat, row.verification], ['PLANNED', null, null, null]);
    assert.equal(await db.outboxEvent.count({ where: { visitId: v } }), 0);
    assert.equal(await db.idempotencyKey.count({ where: { userId: g.id } }), 0, 'every refusal rolled its key back');
    // a real fix inside slack passes, and is honest about accuracy
    const ok = await api(g.token, 'POST', path, { lat: north(s.lat, 120), lng: s.lng, accuracyM: 500 }, key());
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    const after = await db.visit.findUniqueOrThrow({ where: { id: v } });
    assert.equal(after.verification, 'LOW_ACCURACY');
    assert.ok(Math.abs((after.checkInDistanceM ?? 0) - 120) < 2);
  });

  // ------------------------------------------------------------------ A4
  test('A4. no arrival photo: order / memo / return / convert / convert-preview on the visit → 409 PROOF_REQUIRED_BEFORE_SALE and nothing is written', async () => {
    const s = await shop();
    const a = await agent();
    const d = await design();
    const v1 = await openVisit(a, s);
    const [q1, q2, q3] = await pieces(3, d.id, a);
    const memo = await api(a.token, 'POST', '/v1/memos', { visitId: v1, pieceIds: [q1, q2], dueDate: addDays(TODAY, 4) }, key());
    assert.equal(memo.status, 201, JSON.stringify(memo.json));
    const memoId = memo.data.memo.id;
    assert.equal((await api(a.token, 'POST', `/v1/visits/${v1}/complete`, {})).status, 200);
    // A second visit at the same shop (the first is moved to yesterday so today's slot is free): checked in, no photo.
    await db.visit.update({ where: { id: v1 }, data: { plannedDate: dateOf(addDays(TODAY, -1)) } });
    const v2 = await assign(a, s);
    await checkIn(a, v2, s);
    const snap = async () => ({ c: await custody([q1, q2, q3]), rows: await tenantRows(AURUM) });
    await settle();
    const before = await snap();
    const attempts: [string, string, unknown][] = [
      ['POST', '/v1/orders', { visitId: v2, items: [{ designId: d.id, quantity: 1 }] }],
      ['POST', '/v1/memos', { visitId: v2, pieceIds: [q3], dueDate: addDays(TODAY, 4) }],
      ['POST', `/v1/memos/${memoId}/return`, { pieceIds: [q1] }],
      ['POST', `/v1/memos/${memoId}/return`, { pieceIds: [q1], visitId: v2 }],
      ['POST', `/v1/memos/${memoId}/convert`, { pieceIds: [q2] }],
      ['POST', `/v1/memos/${memoId}/convert`, { pieceIds: [q2], visitId: v2 }],
    ];
    for (const [m, p, b] of attempts) {
      const r = await api(a.token, m, p, b, key());
      assert.equal(r.status, 409, `${p} ${JSON.stringify(b)} → ${r.status} ${JSON.stringify(r.json)}`);
      assert.equal(r.error.code, 'PROOF_REQUIRED_BEFORE_SALE');
      assert.equal(r.error.details.visitId, v2);
    }
    const prev = await api(a.token, 'GET', `/v1/memos/${memoId}/convert-preview?pieceIds=${q2}&visitId=${v2}`);
    assert.equal(prev.error?.code, 'PROOF_REQUIRED_BEFORE_SALE');
    const after = await snap();
    assert.deepEqual(after.c, before.c, 'custody untouched');
    assert.equal(after.rows, before.rows, 'no row of the tenant changed (orders, memos, ledger, outbox, keys, audit)');
    // the photo unlocks it
    await uploadProof(a.token, v2, s.lat, s.lng);
    const ret = await api(a.token, 'POST', `/v1/memos/${memoId}/return`, { pieceIds: [q1] }, key());
    assert.equal(ret.status, 200, JSON.stringify(ret.json));
    assert.equal((await db.custodyEvent.findFirstOrThrow({ where: { pieceId: q1, reason: 'MEMO_RETURN' } })).visitId, v2);
  });

  // ------------------------------------------------------------------ A5
  test('A5. wrong sample custody: not in my bag, on another open memo, held by another agent, not on this memo, already returned, already out → refused; ledger and custodySeq unchanged', async () => {
    const s = await shop();
    const a = await agent();
    const d = await design();
    const visitId = await openVisit(a, s);
    const [c1, c2, c3] = await pieces(3, d.id, a);
    const [vaultPiece] = await pieces(1, d.id);
    const kavyaPiece = (await db.samplePiece.findFirstOrThrow({ where: { tenantId: AURUM, custodianType: 'AGENT', custodianAgentId: kavyaId } })).id;
    const arjunMemoPiece = (await db.memoItem.findFirstOrThrow({ where: { tenantId: AURUM, status: 'OUT', memo: { agent: { email: 'arjun@aurum.test' } } } })).pieceId;
    const M1 = (await api(a.token, 'POST', '/v1/memos', { visitId, pieceIds: [c1], dueDate: addDays(TODAY, 4) }, key())).data.memo.id;
    const M2 = (await api(a.token, 'POST', '/v1/memos', { visitId, pieceIds: [c2], dueDate: addDays(TODAY, 4) }, key())).data.memo.id;
    assert.ok(M1 && M2);
    const all = [c1, c2, c3, vaultPiece, kavyaPiece, arjunMemoPiece];
    const memoBody = (ids: string[]) => ({ visitId, pieceIds: ids, dueDate: addDays(TODAY, 4) });
    const refusals: [string, string, unknown, number, string, string?][] = [
      ['POST', '/v1/memos', memoBody([vaultPiece]), 409, 'PIECE_NOT_IN_YOUR_CUSTODY', 'not in my bag (vault)'],
      ['POST', '/v1/memos', memoBody([c1]), 409, 'PIECE_NOT_IN_YOUR_CUSTODY', 'on another open memo'],
      ['POST', '/v1/memos', memoBody([kavyaPiece]), 409, 'PIECE_NOT_IN_YOUR_CUSTODY', "in another agent's bag"],
      ['POST', '/v1/memos', memoBody([arjunMemoPiece]), 409, 'PIECE_NOT_IN_YOUR_CUSTODY', "on another agent's memo"],
      ['POST', '/v1/memos', memoBody([c3, kavyaPiece]), 409, 'PIECE_NOT_IN_YOUR_CUSTODY', 'one bad piece refuses the whole memo'],
      ['POST', `/v1/memos/${M1}/return`, { pieceIds: [c2] }, 409, 'PIECE_NOT_ON_MEMO', 'piece of another memo'],
      ['POST', `/v1/memos/${M1}/return`, { pieceIds: [c3] }, 409, 'PIECE_NOT_ON_MEMO', 'piece still in my bag'],
      ['POST', `/v1/memos/${M1}/convert`, { pieceIds: [kavyaPiece] }, 409, 'PIECE_NOT_ON_MEMO', 'foreign piece'],
      ['POST', `/v1/memos/${M1}/convert`, { pieceIds: [c1, c2] }, 409, 'PIECE_NOT_ON_MEMO', 'mixed'],
    ];
    const run = async (list: typeof refusals, token: string) => {
      for (const [m, p, b, st, code, why] of list) {
        const r = await api(token, m, p, b, key());
        assert.equal(r.status, st, `${why}: ${JSON.stringify(r.json)}`);
        assert.equal(r.error.code, code, why);
      }
    };
    await settle();
    const before = await custody(all);
    const rowsBefore = await tenantRows(AURUM);
    await run(refusals, a.token);
    await run(
      [
        ['POST', '/v1/admin/pieces/issue', { pieceIds: [c3], agentId: kavyaId }, 409, 'PIECE_NOT_IN_VAULT', 'issue a piece already with an agent'],
        ['POST', '/v1/admin/pieces/issue', { pieceIds: [c1], agentId: kavyaId }, 409, 'PIECE_NOT_IN_VAULT', 'issue a piece out on memo'],
        ['POST', '/v1/admin/pieces/issue', { pieceIds: [vaultPiece, c3], agentId: kavyaId }, 409, 'PIECE_NOT_IN_VAULT', 'mixed issue moves nothing'],
        ['POST', '/v1/admin/pieces/return-to-vault', { pieceIds: [c1] }, 409, 'PIECE_NOT_WITH_AGENT', 'vault return of a piece at a shop'],
        ['POST', '/v1/admin/pieces/return-to-vault', { pieceIds: [c3, kavyaPiece] }, 409, 'PIECE_NOT_WITH_AGENT', 'pieces with two agents'],
      ],
      ADMIN,
    );
    assert.deepEqual(await custody(all), before, 'custodians, custodySeq, ledger length and OUT items unchanged');
    assert.equal(await tenantRows(AURUM), rowsBefore, 'no memo, order, outbox, audit or key row written');
    // returned piece cannot be converted or returned again
    assert.equal((await api(a.token, 'POST', `/v1/memos/${M1}/return`, { pieceIds: [c1] }, key())).status, 200);
    const afterReturn = await custody(all);
    await run(
      [
        ['POST', `/v1/memos/${M1}/convert`, { pieceIds: [c1] }, 409, 'PIECE_NOT_ON_MEMO', 'convert of a returned piece'],
        ['POST', `/v1/memos/${M1}/return`, { pieceIds: [c1] }, 409, 'PIECE_NOT_ON_MEMO', 'second return of the same piece'],
      ],
      a.token,
    );
    assert.deepEqual(await custody(all), afterReturn);
    const seqs = (await db.custodyEvent.findMany({ where: { pieceId: c1 }, orderBy: { seq: 'asc' } })).map((e) => e.seq);
    assert.deepEqual(seqs, [1, 2, 3, 4], 'intake, issue, handover, return — gap-free');
  });

  // ------------------------------------------------------------------ A6
  test('A6. cross-tenant and cross-agent: every :id endpoint (reads and writes) → 404 and no row written', async () => {
    // ---- tenant B, built through its own admin
    const beta = await db.tenant.create({ data: { slug: BETA_SLUG, name: 'Audit Beta', demoMode: false } });
    const bossEmail = `boss-${Date.now()}@audit-beta.test`;
    await db.user.create({ data: { tenantId: beta.id, name: 'Beta Boss', email: bossEmail, role: 'ADMIN', passwordHash: await bcrypt.hash('Beta@2026x', 4) } });
    const B = await login(bossEmail, 'Beta@2026x');
    assert.equal((await api(B, 'POST', '/v1/admin/gold-rates', { purity: 'K22', ratePaisePerGram: 1_000_000 })).status, 201);
    const bs = await shop(0, 0, B);
    const ba = await agent(beta.id);
    const bd = (await api(B, 'POST', '/v1/admin/designs', { sku: `AB-${Date.now()}`, name: 'Beta Bangle', category: 'Bangles', collection: 'Beta', purity: 'K22', grossWeightMg: 10_000, netWeightMg: 9_000, makingChargeValue: 50_000 })).data.design;
    const [bp1, bp2, bp3] = await pieces(3, bd.id, ba, B);
    const bv = await openVisit(ba, bs, B);
    const bo1 = (await api(ba.token, 'POST', '/v1/orders', { visitId: bv, items: [{ designId: bd.id, quantity: 1 }] }, key())).data.order;
    assert.equal((await setThreshold(1, B)).status, 200);
    const bo2 = (await api(ba.token, 'POST', '/v1/orders', { visitId: bv, items: [{ designId: bd.id, quantity: 1 }] }, key())).data.order;
    assert.deepEqual([bo1.status, bo2.status], ['CONFIRMED', 'PENDING_APPROVAL']);
    const bm = (await api(ba.token, 'POST', '/v1/memos', { visitId: bv, pieceIds: [bp1, bp2], dueDate: addDays(TODAY, 3) }, key())).data.memo;
    const be = (await api(B, 'POST', '/v1/admin/webhooks', { url: 'http://127.0.0.1:9/beta-hook', events: ['memo.extended'] })).data.endpoint;
    const bdl = (await api(B, 'POST', `/v1/admin/webhooks/${be.id}/test`)).data.delivery;
    const bfile = String((await api(B, 'GET', `/v1/admin/visits/${bv}`)).data.proofs[0].url).split('/').pop();
    assert.ok(bm?.id && be?.id && bdl?.id && bfile);
    for (let i = 0; i < 5; i++) await dispatch(); // settle background fan-out before the snapshot

    const reads = [
      `/v1/visits/${bv}`, `/v1/visits/${bv}/catalog`, `/v1/visits/${bv}/credit`, `/v1/orders/${bo1.id}`, `/v1/memos/${bm.id}`,
      `/v1/memos/${bm.id}/convert-preview?pieceIds=${bp1}`, `/v1/files/${bfile}`,
      `/v1/admin/shops/${bs.id}`, `/v1/admin/shops/${bs.id}/credit`, `/v1/admin/visits/${bv}`, `/v1/admin/agents/${ba.id}`, `/v1/admin/orders/${bo1.id}`,
      `/v1/admin/memos/${bm.id}`, `/v1/admin/pieces/${bp1}`, `/v1/admin/pieces/${bp1}/history`, `/v1/admin/webhooks/deliveries/${bdl.id}`, `/v1/admin/webhooks/${be.id}/secret`,
    ];
    const fieldWrites: [string, string, unknown][] = [
      ['POST', `/v1/visits/${bv}/geofence-check`, { lat: bs.lat, lng: bs.lng, accuracyM: 5 }],
      ['POST', `/v1/visits/${bv}/check-in`, { lat: bs.lat, lng: bs.lng, accuracyM: 5 }],
      ['POST', `/v1/visits/${bv}/proofs`, { objectKey: `tenants/aurum/visits/${bv}/x.jpg`, url: '/x', contentType: 'image/jpeg', sizeBytes: 10, checksumSha256: 'a'.repeat(64) }],
      ['POST', `/v1/visits/${bv}/notes`, { body: 'hijack' }],
      ['POST', `/v1/visits/${bv}/complete`, {}],
      ['POST', '/v1/orders', { visitId: bv, items: [{ designId: bd.id, quantity: 1 }] }],
      ['POST', '/v1/memos', { visitId: bv, pieceIds: [bp3], dueDate: addDays(TODAY, 3) }],
      ['POST', `/v1/memos/${bm.id}/return`, { pieceIds: [bp1] }],
      ['POST', `/v1/memos/${bm.id}/convert`, { pieceIds: [bp1] }],
      ['POST', `/v1/memos/${bm.id}/extend`, { dueDate: addDays(TODAY, 9) }],
      ['POST', `/v1/memos/${bm.id}/ack/verify`, { code: '000000' }],
      ['POST', `/v1/memos/${bm.id}/ack/link`, undefined],
      ['POST', '/v1/uploads/proof-token', { visitId: bv, contentType: 'image/jpeg', sizeBytes: 100 }],
    ];
    const adminWrites: [string, string, unknown][] = [
      ['POST', `/v1/admin/orders/${bo2.id}/approve`, undefined],
      ['POST', `/v1/admin/orders/${bo2.id}/reject`, { reason: 'x' }],
      ['POST', `/v1/admin/orders/${bo1.id}/settle`, undefined],
      ['POST', `/v1/admin/orders/${bo1.id}/cancel`, {}],
      ['POST', `/v1/admin/memos/${bm.id}/extend`, { dueDate: addDays(TODAY, 9) }],
      ['DELETE', `/v1/admin/assignments/${bv}`, undefined],
      ['PATCH', `/v1/admin/shops/${bs.id}`, { name: 'hijacked' }],
      ['PATCH', `/v1/admin/designs/${bd.id}`, { name: 'hijacked' }],
      ['POST', `/v1/admin/designs/${bd.id}/pieces`, { count: 1 }],
      ['PATCH', `/v1/admin/agents/${ba.id}`, { active: false }],
      ['POST', '/v1/admin/pieces/issue', { pieceIds: [bp3], agentId: rahulId }],
      ['POST', '/v1/admin/pieces/issue', { pieceIds: [(await db.samplePiece.findFirstOrThrow({ where: { tenantId: AURUM, custodianType: 'VAULT' } })).id], agentId: ba.id }],
      ['POST', '/v1/admin/pieces/return-to-vault', { pieceIds: [bp3] }],
      ['POST', '/v1/admin/assignments', { agentId: ba.id, shopId: (await db.shop.findFirstOrThrow({ where: { tenantId: AURUM } })).id, date: TODAY }],
      ['POST', '/v1/admin/assignments', { agentId: rahulId, shopId: bs.id, date: TODAY }],
      ['PATCH', `/v1/admin/shops/${(await db.shop.findFirstOrThrow({ where: { tenantId: AURUM } })).id}`, { assignedAgentId: ba.id }],
      ['PATCH', `/v1/admin/webhooks/${be.id}`, { active: false }],
      ['DELETE', `/v1/admin/webhooks/${be.id}`, undefined],
      ['POST', `/v1/admin/webhooks/${be.id}/rotate-secret`, undefined],
      ['POST', `/v1/admin/webhooks/${be.id}/test`, undefined],
      ['POST', `/v1/admin/webhooks/deliveries/${bdl.id}/retry`, undefined],
    ];
    const betaBefore = await tenantRows(beta.id);
    const aurumBefore = await tenantRows(AURUM);
    for (const p of reads) assert.equal((await api(ADMIN, 'GET', p)).status, 404, `admin A GET ${p}`);
    for (const p of reads.slice(0, 7)) assert.equal((await api(RAHUL, 'GET', p)).status, 404, `agent A GET ${p}`);
    for (const [m, p, b] of [...fieldWrites, ...adminWrites]) {
      const r = await api(ADMIN, m, p, b, key());
      assert.equal(r.status, 404, `admin A ${m} ${p} → ${r.status} ${JSON.stringify(r.json)}`);
    }
    for (const [m, p, b] of fieldWrites) assert.equal((await api(RAHUL, m, p, b, key())).status, 404, `agent A ${m} ${p}`);
    const batch = await api(ADMIN, 'POST', '/v1/admin/orders/approve', { orderIds: [bo2.id] });
    assert.equal(batch.status, 200);
    assert.deepEqual([batch.data.approved, batch.data.results[0].error.code], [0, 'NOT_FOUND']);
    // filters with foreign ids return nothing, never the foreign rows
    for (const p of [`/v1/admin/activity?shopId=${bs.id}`, `/v1/admin/webhooks/received?endpointId=${be.id}`, `/v1/admin/webhooks/deliveries?endpointId=${be.id}`, `/v1/admin/pieces?shopId=${bs.id}`, `/v1/admin/orders?shopId=${bs.id}`, `/v1/admin/audit?entityId=${bo1.id}`]) {
      const r = await api(ADMIN, 'GET', p);
      assert.equal(r.status, 200, p);
      assert.equal((r.data as J[]).length, 0, `${p} leaks`);
    }
    // the public ack link is the only cross-tenant door, and it is scoped by the token, not an id
    assert.equal((await api(null, 'GET', `/v1/public/memo-ack/${bm.id}`)).status, 404);
    for (let i = 0; i < 3; i++) await dispatch();
    assert.equal(await tenantRows(beta.id), betaBefore, 'tenant B unchanged');
    assert.equal(await tenantRows(AURUM), aurumBefore, 'tenant A unchanged (no audit, outbox or key rows from refused calls)');

    // ---- cross-agent inside one tenant: Rahul on Kavya's visit, memo and order
    const kv = await db.visit.findFirstOrThrow({ where: { agentId: kavyaId, status: { in: ['CHECKED_IN', 'ACTIVE'] } }, include: { shop: true } });
    await uploadProof(KAVYA, kv.id, kv.shop.lat, kv.shop.lng);
    const aurumDesign = (await design()).id;
    const kp = (await db.samplePiece.findMany({ where: { custodianAgentId: kavyaId }, take: 2 })).map((p) => p.id);
    const km = await api(KAVYA, 'POST', '/v1/memos', { visitId: kv.id, pieceIds: [kp[0]], dueDate: addDays(TODAY, 3) }, key());
    assert.equal(km.status, 201, JSON.stringify(km.json));
    const ko = await db.order.findFirstOrThrow({ where: { agentId: kavyaId } });
    const kfile = (await db.storedFile.findFirstOrThrow({ where: { tenantId: AURUM, objectKey: { contains: kv.id } }, orderBy: { createdAt: 'desc' } })).id;
    const rahulPiece = (await db.samplePiece.findFirstOrThrow({ where: { custodianAgentId: rahulId } })).id;
    const kmid = km.data.memo.id;
    const agentCalls: [string, string, unknown][] = [
      ['GET', `/v1/visits/${kv.id}`, undefined],
      ['GET', `/v1/visits/${kv.id}/catalog`, undefined],
      ['GET', `/v1/visits/${kv.id}/credit`, undefined],
      ['GET', `/v1/orders/${ko.id}`, undefined],
      ['GET', `/v1/memos/${kmid}`, undefined],
      ['GET', `/v1/memos/${kmid}/convert-preview?pieceIds=${kp[0]}`, undefined],
      ['GET', `/v1/files/${kfile}`, undefined],
      ...fieldWrites.map(([m, p, b]): [string, string, unknown] => [
        m,
        p.replace(bv, kv.id).replace(bm.id, kmid),
        JSON.parse(JSON.stringify(b ?? null)?.replaceAll(bv, kv.id).replaceAll(bp1, kp[0]).replaceAll(bp3, rahulPiece).replaceAll(bd.id, aurumDesign) ?? 'null') ?? undefined,
      ]),
    ];
    await settle();
    const kBefore = await tenantRows(AURUM);
    for (const [m, p, b] of agentCalls) {
      const r = await api(RAHUL, m, p, b, key());
      assert.equal(r.status, 404, `Rahul ${m} ${p} → ${r.status} ${JSON.stringify(r.json)}`);
    }
    assert.equal(await tenantRows(AURUM), kBefore, "Kavya's records unchanged, nothing written for Rahul");
  });

  // ------------------------------------------------------------------ A7
  test('A7. auth: expired / forged / alg:none / tampered JWT → 401; refresh rotates and reuse revokes the family; logout kills the refresh; agents get 403 on every admin route and cron routes need the secret', async () => {
    const secret = ENV.JWT_ACCESS_SECRET!;
    const claims = { tid: AURUM, tslug: 'aurum', role: 'FIELD_AGENT', name: 'Rahul Verma' };
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const expired = jwt.sign(claims, secret, { subject: rahulId, issuer: 'jewelroute', expiresIn: -60 });
    const wrongKey = jwt.sign({ ...claims, role: 'ADMIN' }, 'not-the-secret-0123456789', { subject: rahulId, issuer: 'jewelroute', expiresIn: '5m' });
    const wrongIssuer = jwt.sign(claims, secret, { subject: rahulId, issuer: 'evil', expiresIn: '5m' });
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ ...claims, role: 'ADMIN', sub: rahulId, iss: 'jewelroute', exp: Math.floor(Date.now() / 1000) + 300 })}.`;
    const [h, , sig] = RAHUL.split('.');
    const tampered = `${h}.${b64({ ...JSON.parse(Buffer.from(RAHUL.split('.')[1], 'base64url').toString()), role: 'ADMIN' })}.${sig}`;
    const hs512 = jwt.sign({ ...claims, role: 'ADMIN' }, 'x'.repeat(64), { algorithm: 'HS512', subject: rahulId, issuer: 'jewelroute', expiresIn: '5m' });
    assert.equal((await api(expired, 'GET', '/v1/field/today')).error?.code, 'TOKEN_EXPIRED');
    for (const [name, t] of Object.entries({ wrongKey, wrongIssuer, none, tampered, hs512, garbage: 'abc.def.ghi' })) {
      const r = await api(t, 'GET', '/v1/admin/dashboard');
      assert.equal(r.status, 401, `${name} → ${r.status}`);
      assert.equal(r.error.code, 'INVALID_TOKEN', name);
    }
    assert.equal((await api(null, 'GET', '/v1/field/today')).error?.code, 'UNAUTHENTICATED');
    const cookie = await fetch(`${BASE}/v1/admin/dashboard`, { headers: { cookie: `jr_at=${tampered}` } });
    assert.equal(cookie.status, 401, 'forged cookie');

    // refresh rotation + reuse detection (fresh user so other tests keep their sessions)
    const u = await agent();
    const l1 = await api(null, 'POST', '/v1/auth/login', { email: u.email, password: 'Audit@2026x' });
    const r1 = l1.data.refreshToken as string;
    const rot = await api(null, 'POST', '/v1/auth/refresh', { refreshToken: r1 });
    assert.equal(rot.status, 200);
    const r2 = rot.data.refreshToken as string;
    assert.notEqual(r2, r1);
    assert.equal((await api(rot.data.accessToken, 'GET', '/v1/auth/me')).data.id, u.id);
    // past the 30 s grace window a second use of r1 is real reuse (theft signal)
    await db.refreshToken.updateMany({ where: { userId: u.id, rotatedAt: { not: null } }, data: { rotatedAt: new Date(Date.now() - 31_000) } });
    const reuse = await api(null, 'POST', '/v1/auth/refresh', { refreshToken: r1 });
    assert.equal(reuse.status, 401);
    assert.equal(reuse.error.code, 'INVALID_REFRESH_TOKEN');
    assert.equal((await api(null, 'POST', '/v1/auth/refresh', { refreshToken: r2 })).status, 401, 'reuse of a rotated token revokes the family');
    assert.equal(await db.refreshToken.count({ where: { userId: u.id, revokedAt: null } }), 0);
    // logout
    const l2 = await api(null, 'POST', '/v1/auth/login', { email: u.email, password: 'Audit@2026x' });
    assert.equal((await api(null, 'POST', '/v1/auth/logout', { refreshToken: l2.data.refreshToken })).status, 200);
    assert.equal((await api(null, 'POST', '/v1/auth/refresh', { refreshToken: l2.data.refreshToken })).status, 401);
    assert.ok((await db.refreshToken.findFirstOrThrow({ where: { userId: u.id }, orderBy: { createdAt: 'desc' } })).revokedAt);
    // a deactivated agent cannot log in or refresh
    const l3 = await api(null, 'POST', '/v1/auth/login', { email: u.email, password: 'Audit@2026x' });
    assert.equal((await api(ADMIN, 'PATCH', `/v1/admin/agents/${u.id}`, { active: false })).status, 200);
    assert.equal((await api(null, 'POST', '/v1/auth/refresh', { refreshToken: l3.data.refreshToken })).status, 401);
    assert.equal((await api(null, 'POST', '/v1/auth/login', { email: u.email, password: 'Audit@2026x' })).status, 401);

    // role escalation: an agent token on every admin route
    const anyId = (await db.order.findFirstOrThrow({ where: { tenantId: AURUM } })).id;
    const memoId = (await db.memo.findFirstOrThrow({ where: { tenantId: AURUM } })).id;
    const ep = (await db.webhookEndpoint.findFirstOrThrow({ where: { tenantId: AURUM } })).id;
    const shopId = (await db.shop.findFirstOrThrow({ where: { tenantId: AURUM } })).id;
    const pieceId = (await db.samplePiece.findFirstOrThrow({ where: { tenantId: AURUM } })).id;
    const designId = (await design()).id;
    const visitId = (await db.visit.findFirstOrThrow({ where: { tenantId: AURUM } })).id;
    const adminRoutes: [string, string, unknown?][] = [
      ['GET', '/v1/admin/dashboard'], ['GET', '/v1/admin/home'], ['GET', '/v1/admin/activity'], ['GET', '/v1/admin/settings'],
      ['PATCH', '/v1/admin/settings', { approvalThresholdPaise: 1 }], ['POST', '/v1/admin/assignments', { agentId: rahulId, shopId, date: TODAY }],
      ['DELETE', `/v1/admin/assignments/${visitId}`], ['GET', '/v1/admin/gold-rates'], ['POST', '/v1/admin/gold-rates', { purity: 'K22', ratePaisePerGram: 1 }],
      ['POST', '/v1/admin/shops', { name: 'x', address: 'x', area: 'x', lat: 1, lng: 1 }], ['PATCH', `/v1/admin/shops/${shopId}`, { name: 'x' }],
      ['GET', '/v1/admin/designs'], ['POST', '/v1/admin/designs', {}], ['PATCH', `/v1/admin/designs/${designId}`, { name: 'x' }],
      ['POST', `/v1/admin/designs/${designId}/pieces`, { count: 1 }], ['GET', `/v1/admin/pieces/${pieceId}/history`],
      ['POST', '/v1/admin/pieces/issue', { pieceIds: [pieceId], agentId: rahulId }], ['POST', '/v1/admin/pieces/return-to-vault', { pieceIds: [pieceId] }],
      ['GET', '/v1/admin/agents'], ['POST', '/v1/admin/agents', { name: 'x', email: 'x@x.test', password: 'xxxxxxxx' }], ['PATCH', `/v1/admin/agents/${rahulId}`, { active: false }],
      ['GET', '/v1/admin/audit'], ['GET', '/v1/admin/search?q=a'], ['GET', '/v1/admin/shops'], ['GET', `/v1/admin/shops/${shopId}`], ['GET', '/v1/admin/visits'],
      ['GET', `/v1/admin/visits/${visitId}`], ['GET', `/v1/admin/agents/${rahulId}`], ['GET', '/v1/admin/orders'], ['GET', `/v1/admin/orders/${anyId}`],
      ['GET', '/v1/admin/memos'], ['GET', `/v1/admin/memos/${memoId}`], ['GET', '/v1/admin/pieces'], ['GET', `/v1/admin/pieces/${pieceId}`],
      ['POST', '/v1/admin/orders/approve', { orderIds: [anyId] }], ['POST', `/v1/admin/orders/${anyId}/approve`], ['POST', `/v1/admin/orders/${anyId}/reject`, { reason: 'x' }],
      ['POST', `/v1/admin/orders/${anyId}/settle`], ['POST', `/v1/admin/orders/${anyId}/cancel`, {}], ['GET', `/v1/admin/shops/${shopId}/credit`],
      ['POST', `/v1/admin/memos/${memoId}/extend`, { dueDate: addDays(TODAY, 9) }], ['GET', '/v1/admin/webhooks/event-types'], ['GET', '/v1/admin/webhooks'],
      ['POST', '/v1/admin/webhooks', { url: 'http://127.0.0.1:9/x', events: ['*'] }], ['GET', '/v1/admin/webhooks/deliveries'], ['GET', '/v1/admin/webhooks/deliveries/x'],
      ['POST', '/v1/admin/webhooks/deliveries/x/retry'], ['GET', '/v1/admin/webhooks/received'], ['PATCH', `/v1/admin/webhooks/${ep}`, { active: false }],
      ['DELETE', `/v1/admin/webhooks/${ep}`], ['POST', `/v1/admin/webhooks/${ep}/rotate-secret`], ['GET', `/v1/admin/webhooks/${ep}/secret`], ['POST', `/v1/admin/webhooks/${ep}/test`],
    ];
    await settle();
    const before = await tenantRows(AURUM);
    for (const [m, p, b] of adminRoutes) {
      const r = await api(RAHUL, m, p, b, key());
      assert.equal(r.status, 403, `agent ${m} ${p} → ${r.status}`);
      assert.equal(r.error.code, 'FORBIDDEN');
    }
    for (const [m, p] of [['POST', '/v1/internal/dispatch'], ['GET', '/v1/internal/dispatch'], ['POST', '/v1/internal/seed']]) {
      assert.equal((await api(ADMIN, m, p, m === 'POST' ? {} : undefined)).status, 401, `${m} ${p} with an admin JWT but no cron secret`);
      assert.equal((await api(null, m, p, m === 'POST' ? {} : undefined, { 'x-cron-secret': 'wrong' })).status, 401);
    }
    assert.equal(await tenantRows(AURUM), before, 'no admin action, wipe or reseed happened');
  });

  // ------------------------------------------------------------------ A8
  test('A8. gold-rate snapshot: order lines keep rate + price after a rate change; GoldRate / OrderItem / CustodyEvent reject UPDATE and DELETE; history is append-only', async () => {
    const s = await shop();
    const a = await agent();
    const visitId = await openVisit(a, s);
    const d = await design('AJ-NCK-2211');
    const o = await api(a.token, 'POST', '/v1/orders', { visitId, items: [{ designId: d.id, quantity: 2 }] }, key());
    assert.equal(o.status, 201, JSON.stringify(o.json));
    const id = o.data.order.id;
    const itemsBefore = await db.orderItem.findMany({ where: { orderId: id } });
    const orderBefore = await db.order.findUniqueOrThrow({ where: { id } });
    const ratesBefore = await db.goldRate.findMany({ where: { tenantId: AURUM }, orderBy: { id: 'asc' } });
    const k22 = o.data.order.goldRateSnapshot.find((x: J) => x.purity === 'K22');
    const set = await api(ADMIN, 'POST', '/v1/admin/gold-rates', { purity: 'K22', ratePaisePerGram: k22.ratePaisePerGram + 55_000 });
    assert.equal(set.status, 201);
    const ratesAfter = await db.goldRate.findMany({ where: { tenantId: AURUM }, orderBy: { id: 'asc' } });
    assert.equal(ratesAfter.length, ratesBefore.length + 1, 'a rate change is an insert');
    for (const r of ratesBefore) assert.deepEqual(ratesAfter.find((x) => x.id === r.id), r, 'history rows unchanged');
    const gr = await api(ADMIN, 'GET', '/v1/admin/gold-rates');
    assert.equal(gr.data.current.find((c: J) => c.purity === 'K22').goldRateId, set.data.rate.goldRateId);
    assert.equal(gr.data.history[0].goldRateId, set.data.rate.goldRateId, 'newest first');
    assert.deepEqual(await db.orderItem.findMany({ where: { orderId: id } }), itemsBefore, 'order lines keep rate and price');
    const orderAfter = await db.order.findUniqueOrThrow({ where: { id } });
    assert.deepEqual([orderAfter.totalPaise, orderAfter.goldRateSnapshot], [orderBefore.totalPaise, orderBefore.goldRateSnapshot]);
    assert.deepEqual((await api(a.token, 'GET', `/v1/orders/${id}`)).data.order.items, o.data.order.items);
    // a new order freezes the new rate
    const o2 = await api(a.token, 'POST', '/v1/orders', { visitId, items: [{ designId: d.id, quantity: 2 }] }, key());
    assert.equal(o2.data.order.items[0].goldRateId, set.data.rate.goldRateId);
    assert.ok(o2.data.order.totalPaise > o.data.order.totalPaise);
    // append-only triggers
    const ev = await db.custodyEvent.findFirstOrThrow({ where: { tenantId: AURUM } });
    const blocked: [string, () => Promise<unknown>][] = [
      ['UPDATE GoldRate', () => db.$executeRaw`UPDATE "GoldRate" SET "ratePaisePerGram" = 1 WHERE id = ${ratesBefore[0].id}`],
      ['DELETE GoldRate', () => db.$executeRaw`DELETE FROM "GoldRate" WHERE id = ${ratesBefore[0].id}`],
      ['UPDATE OrderItem', () => db.$executeRaw`UPDATE "OrderItem" SET "unitPricePaise" = 1 WHERE id = ${itemsBefore[0].id}`],
      ['DELETE OrderItem', () => db.$executeRaw`DELETE FROM "OrderItem" WHERE id = ${itemsBefore[0].id}`],
      ['UPDATE CustodyEvent', () => db.$executeRaw`UPDATE "CustodyEvent" SET reason = 'ADJUSTMENT' WHERE id = ${ev.id}`],
      ['DELETE CustodyEvent', () => db.$executeRaw`DELETE FROM "CustodyEvent" WHERE id = ${ev.id}`],
      ['prisma update OrderItem', () => db.orderItem.update({ where: { id: itemsBefore[0].id }, data: { quantity: 9 } })],
    ];
    for (const [name, fn] of blocked) await assert.rejects(fn, /append-only/, name);
    assert.deepEqual(await db.orderItem.findMany({ where: { orderId: id } }), itemsBefore);
    assert.deepEqual(await db.custodyEvent.findUniqueOrThrow({ where: { id: ev.id } }), ev);
  });

  // ------------------------------------------------------------------ A9
  test('A9. memo custody transactions: create / ack / extend / return / convert / reject-unsell write exactly the expected ledger rows, items, custodians and outbox rows; a failure mid-transaction persists nothing', async () => {
    const s = await shop();
    const a = await agent();
    const visitId = await openVisit(a, s);
    const d = await design();
    const [x1, x2, x3] = await pieces(3, d.id, a);
    const ids = [x1, x2, x3];
    const seqOf = async () => new Map((await db.samplePiece.findMany({ where: { id: { in: ids } } })).map((p) => [p.id, p.custodySeq]));
    const seq0 = await seqOf();
    // 1. create
    const c = await api(a.token, 'POST', '/v1/memos', { visitId, pieceIds: ids, dueDate: addDays(TODAY, 6) }, key());
    assert.equal(c.status, 201, JSON.stringify(c.json));
    const memoId = c.data.memo.id;
    const hand = await db.custodyEvent.findMany({ where: { memoId, reason: 'MEMO_HANDOVER' }, orderBy: { pieceId: 'asc' } });
    assert.equal(hand.length, 3);
    for (const e of hand) {
      assert.equal(e.seq, seq0.get(e.pieceId)! + 1);
      assert.deepEqual([e.fromType, e.fromAgentId, e.toType, e.toShopId, e.visitId, e.actorId], ['AGENT', a.id, 'SHOP', s.id, visitId, a.id]);
    }
    const evtId = hand[0].outboxEventId!;
    assert.ok(hand.every((e) => e.outboxEventId === evtId), 'one custody event id for the move');
    const evt = await db.outboxEvent.findUniqueOrThrow({ where: { id: evtId } });
    assert.deepEqual([evt.type, evt.pieceIds], ['sample.custody_changed', [...ids].sort()]);
    assert.equal(await db.outboxEvent.count({ where: { memoId, type: 'memo.created' } }), 1);
    const items = await db.memoItem.findMany({ where: { memoId } });
    assert.ok(items.length === 3 && items.every((i) => i.status === 'OUT' && i.valuePaise > 0n));
    assert.equal((await db.memo.findUniqueOrThrow({ where: { id: memoId } })).totalValuePaise, items.reduce((t, i) => t + i.valuePaise, 0n));
    for (const p of await db.samplePiece.findMany({ where: { id: { in: ids } } })) assert.deepEqual([p.custodianType, p.custodianShopId, p.custodySeq], ['SHOP', s.id, seq0.get(p.id)! + 1]);
    const ledger = await db.custodyEvent.count({ where: { pieceId: { in: ids } } });
    // 2. ack (wrong code first, then the code from the retailer page) — no custody rows
    const token = String(c.data.ack.url).split('/ack/')[1];
    assert.equal((await api(a.token, 'POST', `/v1/memos/${memoId}/ack/verify`, { code: '000000' })).status, 422);
    const pub = await api(null, 'GET', `/v1/public/memo-ack/${token}`);
    assert.match(pub.data.code, /^\d{6}$/);
    const ack = await api(a.token, 'POST', `/v1/memos/${memoId}/ack/verify`, { code: pub.data.code });
    assert.equal(ack.status, 200, JSON.stringify(ack.json));
    const mrow = await db.memo.findUniqueOrThrow({ where: { id: memoId } });
    assert.deepEqual([mrow.ackStatus, mrow.ackMethod], ['ACKNOWLEDGED', 'OTP']);
    assert.equal(await db.outboxEvent.count({ where: { memoId, type: 'memo.acknowledged' } }), 1);
    // 3. extend — no custody rows
    assert.equal((await api(a.token, 'POST', `/v1/memos/${memoId}/extend`, { dueDate: addDays(TODAY, 8), reason: 'audit' })).status, 200);
    assert.equal(await db.memoExtension.count({ where: { memoId } }), 1);
    assert.equal(await db.outboxEvent.count({ where: { memoId, type: 'memo.extended' } }), 1);
    assert.equal(await db.custodyEvent.count({ where: { pieceId: { in: ids } } }), ledger, 'ack and extend move nothing');
    // 4. return x1
    assert.equal((await api(a.token, 'POST', `/v1/memos/${memoId}/return`, { pieceIds: [x1] }, key())).status, 200);
    const ret = await db.custodyEvent.findFirstOrThrow({ where: { pieceId: x1, reason: 'MEMO_RETURN' } });
    assert.deepEqual([ret.seq, ret.fromType, ret.fromShopId, ret.toType, ret.toAgentId, ret.memoId, ret.visitId], [seq0.get(x1)! + 2, 'SHOP', s.id, 'AGENT', a.id, memoId, visitId]);
    assert.equal((await db.memoItem.findFirstOrThrow({ where: { memoId, pieceId: x1 } })).status, 'RETURNED');
    assert.equal((await db.memo.findUniqueOrThrow({ where: { id: memoId } })).status, 'PARTIALLY_RETURNED');
    assert.equal(await db.outboxEvent.count({ where: { memoId, type: 'memo.returned' } }), 1);
    // 5. convert x2 into a pending order (threshold forces approval)
    assert.equal((await setThreshold(1)).status, 200);
    let orderId: string;
    try {
      const cv = await api(a.token, 'POST', `/v1/memos/${memoId}/convert`, { pieceIds: [x2] }, key());
      assert.equal(cv.status, 200, JSON.stringify(cv.json));
      orderId = cv.data.order.id;
      assert.equal(cv.data.order.status, 'PENDING_APPROVAL');
    } finally {
      await setThreshold(SEED_THRESHOLD);
    }
    const sold = await db.custodyEvent.findFirstOrThrow({ where: { pieceId: x2, reason: 'CONVERTED_TO_SALE' } });
    assert.deepEqual([sold.seq, sold.fromType, sold.toType], [seq0.get(x2)! + 2, 'SHOP', 'SOLD']);
    assert.equal((await db.samplePiece.findUniqueOrThrow({ where: { id: x2 } })).custodianType, 'SOLD');
    assert.equal((await db.memoItem.findFirstOrThrow({ where: { memoId, pieceId: x2 } })).status, 'CONVERTED');
    assert.equal((await db.orderItem.findFirstOrThrow({ where: { orderId: orderId! } })).pieceId, x2);
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: orderId! } })).sourceMemoId, memoId);
    assert.equal(await db.outboxEvent.count({ where: { memoId, type: 'memo.converted' } }), 1);
    // 6. reject → un-sell
    const rej = await api(ADMIN, 'POST', `/v1/admin/orders/${orderId!}/reject`, { reason: 'audit' });
    assert.equal(rej.status, 200, JSON.stringify(rej.json));
    const back = await db.custodyEvent.findFirstOrThrow({ where: { pieceId: x2, reason: 'SALE_REJECTED' } });
    assert.deepEqual([back.seq, back.fromType, back.toType, back.toShopId, back.memoId], [seq0.get(x2)! + 3, 'SOLD', 'SHOP', s.id, memoId]);
    assert.equal((await db.memoItem.findFirstOrThrow({ where: { memoId, pieceId: x2 } })).status, 'OUT');
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: orderId! } })).status, 'REJECTED');
    const rejected = await db.outboxEvent.findFirstOrThrow({ where: { orderId: orderId!, type: 'order.rejected' } });
    assert.deepEqual((rejected.payload as J).data.unsold.pieceIds, [x2]);
    // every piece's ledger is gap-free and ends at custodySeq
    for (const p of await db.samplePiece.findMany({ where: { id: { in: ids } } })) {
      const seqs = (await db.custodyEvent.findMany({ where: { pieceId: p.id }, orderBy: { seq: 'asc' } })).map((e) => e.seq);
      assert.deepEqual(seqs, Array.from({ length: p.custodySeq }, (_, i) => i + 1), `${p.tagCode} ledger`);
    }

    // 7. failure mid-transaction (memo create): custody moved, then pricing fails (no K14 rate) → everything rolls back
    const k14 = await api(ADMIN, 'POST', '/v1/admin/designs', { sku: `AUD-K14-${Date.now()}`, name: 'Audit 14K Stud', category: 'Earrings', collection: 'Audit', purity: 'K14', grossWeightMg: 2_000, netWeightMg: 1_900, makingChargeValue: 40_000 });
    assert.equal(k14.status, 201, JSON.stringify(k14.json));
    const [kp] = await pieces(1, k14.data.design.id, a);
    const [y1] = await pieces(1, d.id, a);
    await settle();
    const memoSeq = await db.docSequence.findFirst({ where: { tenantId: AURUM, kind: 'MEMO' } });
    const before = { c: await custody([kp, y1]), rows: await tenantRows(AURUM) };
    const fk = randomUUID();
    const fail = await api(a.token, 'POST', '/v1/memos', { visitId, pieceIds: [y1, kp], dueDate: addDays(TODAY, 3) }, { 'Idempotency-Key': fk });
    assert.equal(fail.status, 409, JSON.stringify(fail.json));
    assert.equal(fail.error.code, 'GOLD_RATE_MISSING');
    assert.deepEqual(await custody([kp, y1]), before.c, 'the custody move inside the failed transaction is gone');
    assert.equal(await tenantRows(AURUM), before.rows, 'no memo, ledger, outbox, audit or key row');
    assert.deepEqual(await db.docSequence.findFirst({ where: { tenantId: AURUM, kind: 'MEMO' } }), memoSeq, 'memo number not consumed');

    // 8. failure mid-transaction (convert): custody + memo items flipped, then the order cannot be priced → rollback
    const rate = await db.goldRate.create({ data: { tenantId: AURUM, purity: 'K14', ratePaisePerGram: 650_000n, source: 'MANUAL' } });
    const km = await api(a.token, 'POST', '/v1/memos', { visitId, pieceIds: [kp], dueDate: addDays(TODAY, 3) }, key());
    assert.equal(km.status, 201, JSON.stringify(km.json));
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('jewelroute.allow_purge', 'on', true)`;
      await tx.goldRate.delete({ where: { id: rate.id } });
    });
    await settle();
    const ordSeq = await db.docSequence.findFirst({ where: { tenantId: AURUM, kind: 'ORD' } });
    const before2 = { c: await custody([kp]), rows: await tenantRows(AURUM) };
    const cfail = await api(a.token, 'POST', `/v1/memos/${km.data.memo.id}/convert`, { pieceIds: [kp] }, key());
    assert.equal(cfail.status, 409, JSON.stringify(cfail.json));
    assert.equal(cfail.error.code, 'GOLD_RATE_MISSING');
    assert.deepEqual(await custody([kp]), before2.c, 'piece still at the shop, item still OUT, ledger unchanged');
    assert.equal(await tenantRows(AURUM), before2.rows);
    assert.deepEqual(await db.docSequence.findFirst({ where: { tenantId: AURUM, kind: 'ORD' } }), ordSeq);
    assert.equal((await api(a.token, 'POST', `/v1/memos/${km.data.memo.id}/return`, { pieceIds: [kp] }, key())).status, 200, 'the memo is still usable');
  });

  // ------------------------------------------------------------------ A10
  test('A10. approval rules: boundaries, threshold changed between preview and booking (server decides at write time), and the full approve/reject/settle/cancel state machine', async () => {
    const d = await design();
    const s = await shop(0, 0);
    const a = await agent();
    const visitId = await openVisit(a, s);
    const T = orderTotals([await unitPrice(a.token, visitId, d.id)]).totalPaise;
    const order = () => api(a.token, 'POST', '/v1/orders', { visitId, items: [{ designId: d.id, quantity: 1 }] }, key());
    // projected == limit → CONFIRMED; one more → PENDING (CREDIT_LIMIT)
    assert.equal((await api(ADMIN, 'PATCH', `/v1/admin/shops/${s.id}`, { creditLimitPaise: T })).status, 200);
    const c1 = await order();
    assert.deepEqual([c1.data.order.status, c1.data.order.approval.position.projectedExposurePaise], ['CONFIRMED', T]);
    const p1 = await order();
    assert.deepEqual([p1.data.order.status, p1.data.order.approval.reasons], ['PENDING_APPROVAL', ['CREDIT_LIMIT']]);
    assert.equal((await api(ADMIN, 'PATCH', `/v1/admin/shops/${s.id}`, { creditLimitPaise: 0 })).status, 200);
    // preview says fine, threshold drops to the order total before booking → the write decides
    let ids: Record<'c1' | 'c2' | 'p1' | 'p2', string> = { c1: '', c2: '', p1: '', p2: '' };
    let p3 = '';
    let p4 = '';
    try {
      const pre = await api(a.token, 'GET', `/v1/visits/${visitId}/credit?amountPaise=${T}`);
      assert.deepEqual([pre.data.requiresApproval, pre.data.approvalThresholdPaise], [false, SEED_THRESHOLD]);
      assert.equal((await setThreshold(T)).status, 200);
      const p2 = await order();
      assert.deepEqual([p2.data.order.status, p2.data.order.approval.reasons], ['PENDING_APPROVAL', ['ORDER_THRESHOLD']]);
      const row = await db.order.findUniqueOrThrow({ where: { id: p2.data.order.id } });
      assert.equal((row.creditSnapshot as J).approvalThresholdPaise, T, 'frozen with the threshold in force at write time');
      assert.equal((await setThreshold(T + 1)).status, 200);
      const c2 = await order();
      assert.equal(c2.data.order.status, 'CONFIRMED', 'one paisa below the threshold confirms');
      ids = { c1: c1.data.order.id, c2: c2.data.order.id, p1: p1.data.order.id, p2: p2.data.order.id };
      assert.equal((await setThreshold(1)).status, 200);
      p3 = (await order()).data.order.id;
      p4 = (await order()).data.order.id;
    } finally {
      await setThreshold(SEED_THRESHOLD);
    }
    const act = (id: string, verb: 'approve' | 'reject' | 'settle' | 'cancel') =>
      api(ADMIN, 'POST', `/v1/admin/orders/${id}/${verb}`, verb === 'reject' ? { reason: 'audit' } : verb === 'cancel' ? { reason: 'audit' } : undefined);
    const state = async (id: string) => {
      const o = await db.order.findUniqueOrThrow({ where: { id } });
      return { status: o.status, settledAt: o.settledAt?.toISOString() ?? null, decidedAt: o.decidedAt?.toISOString() ?? null, events: await db.outboxEvent.count({ where: { orderId: id } }), audit: await db.auditLog.count({ where: { entityId: id } }) };
    };
    const illegal = async (id: string, verb: 'approve' | 'reject' | 'settle' | 'cancel', code: string) => {
      const before = await state(id);
      const r = await act(id, verb);
      assert.equal(r.status, 409, `${verb} on ${before.status} → ${r.status}`);
      assert.equal(r.error.code, code, `${verb} on ${before.status}${before.settledAt ? ' (settled)' : ''}`);
      assert.deepEqual(await state(id), before, `${verb} refused → order row, events and audit unchanged`);
    };
    const legal = async (id: string, verb: 'approve' | 'reject' | 'settle' | 'cancel', status: string) => {
      const r = await act(id, verb);
      assert.equal(r.status, 200, `${verb}: ${JSON.stringify(r.json)}`);
      assert.equal((await db.order.findUniqueOrThrow({ where: { id } })).status, status);
    };
    // CONFIRMED
    await illegal(ids.c1, 'approve', 'ORDER_NOT_PENDING');
    await illegal(ids.c1, 'reject', 'ORDER_NOT_PENDING');
    await legal(ids.c1, 'settle', 'CONFIRMED');
    await illegal(ids.c1, 'settle', 'ORDER_ALREADY_SETTLED');
    await illegal(ids.c1, 'cancel', 'ORDER_NOT_CANCELLABLE');
    // PENDING → APPROVED
    await illegal(ids.p1, 'settle', 'ORDER_NOT_SETTLEABLE');
    await legal(ids.p1, 'approve', 'APPROVED');
    await illegal(ids.p1, 'approve', 'ORDER_ALREADY_DECIDED');
    await illegal(ids.p1, 'reject', 'ORDER_ALREADY_DECIDED');
    await illegal(ids.p1, 'cancel', 'ORDER_NOT_CANCELLABLE');
    await legal(ids.p1, 'settle', 'APPROVED');
    await illegal(ids.p1, 'settle', 'ORDER_ALREADY_SETTLED');
    // PENDING → REJECTED
    await legal(ids.p2, 'reject', 'REJECTED');
    await illegal(ids.p2, 'approve', 'ORDER_ALREADY_DECIDED');
    await illegal(ids.p2, 'settle', 'ORDER_NOT_SETTLEABLE');
    await illegal(ids.p2, 'cancel', 'ORDER_NOT_CANCELLABLE');
    // CONFIRMED → CANCELLED
    await legal(ids.c2, 'cancel', 'CANCELLED');
    await illegal(ids.c2, 'approve', 'ORDER_NOT_PENDING');
    await illegal(ids.c2, 'settle', 'ORDER_NOT_SETTLEABLE');
    await illegal(ids.c2, 'cancel', 'ORDER_NOT_CANCELLABLE');
    // PENDING → CANCELLED, and a race between approve and cancel on one pending order → exactly one wins
    await legal(p3, 'cancel', 'CANCELLED');
    await illegal(p3, 'reject', 'ORDER_NOT_PENDING');
    const race = await Promise.all([act(p4, 'approve'), act(p4, 'cancel'), act(p4, 'reject')]);
    assert.equal(race.filter((r) => r.status === 200).length, 1, JSON.stringify(race.map((r) => [r.status, r.error?.code])));
    const won = await db.order.findUniqueOrThrow({ where: { id: p4 } });
    assert.ok(['APPROVED', 'CANCELLED', 'REJECTED'].includes(won.status));
    assert.equal(await db.outboxEvent.count({ where: { orderId: p4, type: { in: ['order.approved', 'order.cancelled', 'order.rejected'] } } }), 1, 'one decision event');
    // exposure after all that: c1 settled, p1 approved+settled, c2/p3 cancelled, p2 rejected → outstanding 0 (+p4 if approved)
    const pos = await api(ADMIN, 'GET', `/v1/admin/shops/${s.id}/credit`);
    assert.equal(pos.data.outstandingPaise, won.status === 'APPROVED' ? T : 0);
  });

  // ------------------------------------------------------------------ A11
  test('A11. webhooks: failing endpoint walks 30s/2m/10m/30m/2h/6h then DEAD; manual retry; signature verifies; a disabled endpoint is never called; at-least-once with one event id', async () => {
    const got: { headers: IncomingMessage['headers']; body: string }[] = [];
    let mode: 'fail' | 'ok' = 'fail';
    const srv = createServer((req, res) => {
      let b = '';
      req.on('data', (c) => (b += c));
      req.on('end', () => {
        got.push({ headers: req.headers, body: b });
        res.writeHead(mode === 'ok' ? 200 : 500).end(mode);
      });
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
    const port = (srv.address() as AddressInfo).port;
    try {
      const created = await api(ADMIN, 'POST', '/v1/admin/webhooks', { url: `http://127.0.0.1:${port}/hook`, events: ['memo.extended'] });
      assert.equal(created.status, 201);
      const secret: string = created.data.secret;
      const epId: string = created.data.endpoint.id;
      const memo = await db.memo.findFirstOrThrow({ where: { tenantId: AURUM, status: { in: ['ACTIVE', 'PARTIALLY_RETURNED'] } } });
      const ext = await api(ADMIN, 'POST', `/v1/admin/memos/${memo.id}/extend`, { dueDate: addDays(TODAY, 30), reason: 'audit webhook' });
      assert.equal(ext.status, 200, JSON.stringify(ext.json));
      let dl = await db.webhookDelivery.findFirst({ where: { endpointId: epId } });
      for (let i = 0; i < 50 && (!dl || dl.attempts < 1); i++) {
        await dispatch();
        dl = await db.webhookDelivery.findFirst({ where: { endpointId: epId } });
      }
      assert.ok(dl && dl.attempts === 1, 'first attempt is immediate');
      const dlId: string = dl.id;
      const verify = (g: (typeof got)[number]) => {
        const ts = String(g.headers['x-jewelroute-timestamp']);
        return g.headers['x-jewelroute-signature'] === `sha256=${createHmac('sha256', secret).update(`${ts}.${g.body}`).digest('hex')}`;
      };
      const ladder = [30, 120, 600, 1800, 7200, 21600];
      for (let attempt = 1; attempt <= 7; attempt++) {
        const d = await db.webhookDelivery.findUniqueOrThrow({ where: { id: dlId } });
        assert.equal(d.attempts, attempt);
        assert.equal(got.length, attempt, 'one HTTP request per attempt');
        if (attempt < 7) {
          assert.equal(d.status, 'FAILED');
          const last = await db.webhookAttempt.findFirstOrThrow({ where: { deliveryId: d.id, attemptNo: attempt } });
          assert.ok(Math.abs((d.nextAttemptAt.getTime() - last.createdAt.getTime()) / 1000 - ladder[attempt - 1]) < 3, `retry ${attempt} delay`);
          // not due yet → a dispatch does nothing
          await dispatch();
          assert.equal((await db.webhookDelivery.findUniqueOrThrow({ where: { id: d.id } })).attempts, attempt, 'not retried before it is due');
          await db.webhookDelivery.update({ where: { id: d.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
          await dispatch();
        } else {
          assert.equal(d.status, 'DEAD');
        }
      }
      // DEAD is final for the scheduler, even when "due"
      await db.webhookDelivery.update({ where: { id: dlId }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
      await dispatch();
      assert.equal((await db.webhookDelivery.findUniqueOrThrow({ where: { id: dlId } })).attempts, 7);
      assert.equal(got.length, 7);
      // signatures: every request verifies; a tampered body does not
      assert.ok(got.every(verify));
      assert.ok(!verify({ headers: got[0].headers, body: got[0].body.replace('memo.extended', 'memo.returned') }));
      const ids = new Set(got.map((g) => JSON.parse(g.body).id));
      assert.equal(ids.size, 1, 'every attempt carries the same event id');
      // manual retry while still failing → one more attempt, stays DEAD; then fixed → SUCCEEDED; again → re-sent with the same id
      const r1 = await api(ADMIN, 'POST', `/v1/admin/webhooks/deliveries/${dlId}/retry`);
      assert.deepEqual([r1.data.delivery.attempts, r1.data.delivery.status], [8, 'DEAD']);
      mode = 'ok';
      const r2 = await api(ADMIN, 'POST', `/v1/admin/webhooks/deliveries/${dlId}/retry`);
      assert.deepEqual([r2.data.delivery.attempts, r2.data.delivery.status], [9, 'SUCCEEDED']);
      const r3 = await api(ADMIN, 'POST', `/v1/admin/webhooks/deliveries/${dlId}/retry`);
      assert.deepEqual([r3.data.delivery.attempts, r3.data.delivery.status], [10, 'SUCCEEDED']);
      assert.equal(got.length, 10);
      assert.equal(new Set(got.map((g) => JSON.parse(g.body).id)).size, 1, 'at-least-once: receivers dedupe on the event id');
      assert.equal(new Set(got.map((g) => g.headers['x-jewelroute-delivery'])).size, 1);
      assert.equal(await db.webhookAttempt.count({ where: { deliveryId: dlId } }), 10);

      // disabled endpoint: new events create no delivery and no request; a queued delivery is parked DEAD without an attempt
      assert.equal((await api(ADMIN, 'PATCH', `/v1/admin/webhooks/${epId}`, { active: false })).status, 200);
      const sent = got.length;
      assert.equal((await api(ADMIN, 'POST', `/v1/admin/memos/${memo.id}/extend`, { dueDate: addDays(TODAY, 31) })).status, 200);
      for (let i = 0; i < 5; i++) await dispatch();
      assert.equal(await db.webhookDelivery.count({ where: { endpointId: epId } }), 1, 'no delivery fanned out to a disabled endpoint');
      const ev = await db.outboxEvent.findFirstOrThrow({ where: { tenantId: AURUM, type: 'memo.extended' }, orderBy: { createdAt: 'desc' } });
      const queued = await db.webhookDelivery.create({ data: { tenantId: AURUM, endpointId: epId, eventId: ev.id } });
      for (let i = 0; i < 5; i++) await dispatch();
      const parked = await db.webhookDelivery.findUniqueOrThrow({ where: { id: queued.id } });
      assert.deepEqual([parked.status, parked.lastError, parked.attempts], ['DEAD', 'Endpoint is disabled', 0]);
      assert.equal(await db.webhookAttempt.count({ where: { deliveryId: queued.id } }), 0);
      assert.equal(got.length, sent, 'a disabled endpoint is never called');
    } finally {
      srv.close();
    }
  });

  // ------------------------------------------------------------------ A12
  test('A12. the retailer code stops working when the ack link expires (410 ACK_EXPIRED), like the public page', async () => {
    const s = await shop();
    const a = await agent();
    const visitId = await openVisit(a, s);
    const [p] = await pieces(1, (await design()).id, a);
    const m = await api(a.token, 'POST', '/v1/memos', { visitId, pieceIds: [p], dueDate: addDays(TODAY, 3) }, key());
    assert.equal(m.status, 201);
    const memoId = m.data.memo.id;
    const token = String(m.data.ack.url).split('/ack/')[1];
    const code = (await api(null, 'GET', `/v1/public/memo-ack/${token}`)).data.code as string;
    await db.memo.update({ where: { id: memoId }, data: { ackTokenExpiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await api(null, 'GET', `/v1/public/memo-ack/${token}`)).status, 410);
    const late = await api(a.token, 'POST', `/v1/memos/${memoId}/ack/verify`, { code });
    assert.equal(late.status, 410, JSON.stringify(late.json));
    assert.equal(late.error.code, 'ACK_EXPIRED');
    const row = await db.memo.findUniqueOrThrow({ where: { id: memoId } });
    assert.deepEqual([row.ackStatus, row.ackAt, row.ackAttempts], ['PENDING', null, 0]);
    assert.equal(await db.outboxEvent.count({ where: { memoId, type: 'memo.acknowledged' } }), 0);
    // a reissued link works again
    const link = await api(a.token, 'POST', `/v1/memos/${memoId}/ack/link`);
    const code2 = (await api(null, 'GET', `/v1/public/memo-ack/${String(link.data.ack.url).split('/ack/')[1]}`)).data.code;
    assert.equal((await api(a.token, 'POST', `/v1/memos/${memoId}/ack/verify`, { code: code2 })).status, 200);
  });

  // ------------------------------------------------------------------ A13
  test("A13. deactivating an agent ends their live access token at once (401 ACCOUNT_DISABLED) — no order is booked in the 15-minute window", async () => {
    const s = await shop();
    const a = await agent();
    const visitId = await openVisit(a, s);
    const d = await design();
    assert.equal((await api(ADMIN, 'PATCH', `/v1/admin/agents/${a.id}`, { active: false })).status, 200);
    await settle();
    const before = await tenantRows(AURUM);
    const o = await api(a.token, 'POST', '/v1/orders', { visitId, items: [{ designId: d.id, quantity: 1 }] }, key());
    assert.equal(o.status, 401, JSON.stringify(o.json));
    assert.equal(o.error.code, 'ACCOUNT_DISABLED');
    const r = await api(a.token, 'GET', '/v1/field/today');
    assert.equal(r.error?.code, 'ACCOUNT_DISABLED');
    assert.equal(await tenantRows(AURUM), before, 'nothing written with a deactivated account');
    assert.equal((await api(ADMIN, 'PATCH', `/v1/admin/agents/${a.id}`, { active: true })).status, 200);
    assert.equal((await api(a.token, 'GET', '/v1/field/today')).status, 200, 'reactivated → the same token works again');
    // a signed token for a user that no longer exists (e.g. after a reseed) is refused too
    const ghost = jwt.sign({ tid: AURUM, tslug: 'aurum', role: 'ADMIN', name: 'Ghost' }, ENV.JWT_ACCESS_SECRET!, { subject: 'no-such-user', issuer: 'jewelroute', expiresIn: '5m' });
    assert.equal((await api(ghost, 'GET', '/v1/admin/settings')).error?.code, 'ACCOUNT_DISABLED');
    // public routes are unaffected
    assert.equal((await api(null, 'GET', '/v1/health')).status, 200);
  });

  // ------------------------------------------------------------------ A14
  test('A14. piece intake, gold-rate set and shop create honour an Idempotency-Key: a retried submit creates no duplicate pieces, rate rows or shops', async () => {
    const d = await design();
    const k = randomUUID();
    const before = await db.samplePiece.count({ where: { designId: d.id } });
    const r1 = await api(ADMIN, 'POST', `/v1/admin/designs/${d.id}/pieces`, { count: 2 }, { 'Idempotency-Key': k });
    assert.equal(r1.status, 201, JSON.stringify(r1.json));
    const r2 = await api(ADMIN, 'POST', `/v1/admin/designs/${d.id}/pieces`, { count: 2 }, { 'Idempotency-Key': k });
    assert.equal(r2.status, 201);
    assert.deepEqual(r2.data, r1.data);
    const r3 = await api(ADMIN, 'POST', `/v1/admin/designs/${d.id}/pieces`, { count: 3 }, { 'Idempotency-Key': k });
    assert.equal(r3.status, 422);
    assert.equal(await db.samplePiece.count({ where: { designId: d.id } }), before + 2);
    const ids = (r1.data.pieces as J[]).map((p) => p.id);
    assert.equal(await db.custodyEvent.count({ where: { pieceId: { in: ids }, reason: 'INTAKE' } }), 2);
    const burst = await Promise.all(Array.from({ length: 4 }, () => api(ADMIN, 'POST', `/v1/admin/designs/${d.id}/pieces`, { count: 1 }, { 'Idempotency-Key': k + '-b' })));
    assert.ok(burst.every((r) => r.status === 201 && r.data.pieces[0].id === burst[0].data.pieces[0].id), JSON.stringify(burst.map((r) => r.status)));
    assert.equal(await db.samplePiece.count({ where: { designId: d.id } }), before + 3);
    // gold rate
    const rk = randomUUID();
    const rates = await db.goldRate.count({ where: { tenantId: AURUM } });
    const cur = (await api(ADMIN, 'GET', '/v1/admin/gold-rates')).data.current.find((c: J) => c.purity === 'K18').ratePaisePerGram as number;
    const g1 = await api(ADMIN, 'POST', '/v1/admin/gold-rates', { purity: 'K18', ratePaisePerGram: cur + 500 }, { 'Idempotency-Key': rk });
    const g2 = await api(ADMIN, 'POST', '/v1/admin/gold-rates', { purity: 'K18', ratePaisePerGram: cur + 500 }, { 'Idempotency-Key': rk });
    assert.equal(g1.status, 201, JSON.stringify(g1.json));
    assert.deepEqual(g2.data, g1.data);
    assert.equal((await api(ADMIN, 'POST', '/v1/admin/gold-rates', { purity: 'K18', ratePaisePerGram: cur + 900 }, { 'Idempotency-Key': rk })).status, 422);
    assert.equal(await db.goldRate.count({ where: { tenantId: AURUM } }), rates + 1);
    // shop create carries money (credit limit, opening balance): a retried submit must not create a twin
    const sk = randomUUID();
    const shopBody = { name: `Audit Twin ${Date.now()}`, address: 'x', area: 'Audit', lat: 28.61, lng: 77.11, creditLimitPaise: 5_000_000, openingOutstandingPaise: 1_000_000 };
    const sh1 = await api(ADMIN, 'POST', '/v1/admin/shops', shopBody, { 'Idempotency-Key': sk });
    const sh2 = await api(ADMIN, 'POST', '/v1/admin/shops', shopBody, { 'Idempotency-Key': sk });
    assert.equal(sh1.status, 201, JSON.stringify(sh1.json));
    assert.deepEqual(sh2.data, sh1.data);
    assert.equal(await db.shop.count({ where: { tenantId: AURUM, name: shopBody.name } }), 1);
    // without a key both still work as before (keys are optional on these admin creates)
    assert.equal((await api(ADMIN, 'POST', `/v1/admin/designs/${d.id}/pieces`, { count: 1 })).status, 201);
  });

  // ------------------------------------------------------------------ A15
  test('A15. refresh race: one locked grace reuse per rotated token returns the SAME successor; a 2nd reuse, another user agent or reuse after 30 s is theft; logout ends one session, logout-all every device', async () => {
    const u = await agent();
    const UA = { 'user-agent': 'TabBrowser/1.0' };
    const OTHER = { 'user-agent': 'OtherDevice/2.0' };
    const login1 = async (h = UA) => (await api(null, 'POST', '/v1/auth/login', { email: u.email, password: 'Audit@2026x' }, h)).data as { accessToken: string; refreshToken: string };
    const refresh = (t: string, h = UA) => api(null, 'POST', '/v1/auth/refresh', { refreshToken: t }, h);
    const live = () => db.refreshToken.count({ where: { userId: u.id, revokedAt: null } });
    const hash = (t: string) => createHash('sha256').update(t).digest('hex');
    // two tabs at once: both stay signed in, with the same successor (no extra session minted)
    const baseline = await live(); // agent() signed in once already
    const r1 = (await login1()).refreshToken;
    const tabs = await Promise.all([refresh(r1), refresh(r1)]);
    assert.deepEqual(tabs.map((t) => t.status), [200, 200], JSON.stringify(tabs.map((t) => t.error)));
    assert.equal(tabs[0].data.refreshToken, tabs[1].data.refreshToken, 'the same successor for both tabs');
    for (const t of tabs) assert.equal((await api(t.data.accessToken, 'GET', '/v1/auth/me')).data.id, u.id);
    assert.equal(await live(), baseline + 1, 'exactly one live session for the two tabs (no extra session minted)');
    const s1 = tabs[0].data.refreshToken as string;
    // another replay inside the window: the one grace use is spent → theft → the family is revoked
    // (refresh is throttled at 30/min per IP, so this file keeps its refresh calls under that budget)
    assert.equal((await refresh(r1)).status, 401);
    assert.equal(await live(), 0);
    assert.equal((await refresh(s1)).status, 401, 'the successor died with the family');
    // eight sequential replays of a just-rotated token: exactly one success (the same successor), then revocation
    const r2 = (await login1()).refreshToken;
    const s2 = (await refresh(r2)).data.refreshToken as string;
    const eight = [];
    for (let i = 0; i < 8; i++) eight.push(await refresh(r2));
    assert.deepEqual(eight.map((x) => x.status), [200, 401, 401, 401, 401, 401, 401, 401]);
    assert.equal(eight[0].data.refreshToken, s2);
    assert.equal(await live(), 0);
    const row2 = await db.refreshToken.findUniqueOrThrow({ where: { tokenHash: hash(r2) } });
    assert.ok(row2.graceUsedAt && row2.successorId, 'grace use recorded with the successor');
    // concurrent replays of a fresh token: one rotation + one grace use, both the same successor, then revoked
    const r3 = (await login1()).refreshToken;
    const burst = await Promise.all(Array.from({ length: 4 }, () => refresh(r3)));
    const ok3 = burst.filter((x) => x.status === 200);
    assert.ok(ok3.length >= 1 && ok3.length <= 2, `1–2 successes, got ${ok3.length}`);
    assert.equal(new Set(ok3.map((x) => x.data.refreshToken)).size, 1, 'never two different successors');
    assert.ok(burst.some((x) => x.status === 401));
    assert.equal(await live(), 0, 'family revocation won: nothing live');
    // another user agent inside the window → theft
    const r4 = (await login1()).refreshToken;
    const s4 = (await refresh(r4)).data.refreshToken as string;
    assert.equal((await refresh(r4, { 'user-agent': 'Attacker/9' })).status, 401);
    assert.ok((await db.refreshToken.findUniqueOrThrow({ where: { tokenHash: hash(s4) } })).revokedAt, 'family revoked');
    // after the window → theft
    const r5 = (await login1()).refreshToken;
    const s5 = (await refresh(r5)).data.refreshToken as string;
    await db.refreshToken.update({ where: { tokenHash: hash(r5) }, data: { rotatedAt: new Date(Date.now() - 31_000) } });
    assert.equal((await refresh(r5)).status, 401);
    assert.equal((await refresh(s5)).status, 401);
    // logout ends only this session; another device keeps working; logout-all ends every device
    const a = await login1();
    const b = await login1(OTHER);
    assert.equal((await api(null, 'POST', '/v1/auth/logout', { refreshToken: a.refreshToken })).status, 200);
    assert.ok((await db.refreshToken.findUniqueOrThrow({ where: { tokenHash: hash(a.refreshToken) } })).revokedAt);
    const b2 = await refresh(b.refreshToken, OTHER);
    assert.equal(b2.status, 200, 'the other device is not signed out');
    const c = await login1();
    assert.equal((await api(c.accessToken, 'POST', '/v1/auth/logout-all')).status, 200);
    assert.equal(await live(), 0);
    assert.equal((await api(null, 'POST', '/v1/auth/logout-all')).status, 401, 'logout-all needs a session');
  });

  // ------------------------------------------------------------------ A16
  test('A16. login throttle keys on the proxy-resolved client IP (TRUST_PROXY hops), never on a spoofed X-Forwarded-For', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await api(null, 'POST', '/v1/auth/login', { email: 'arjun@aurum.test', password: 'wrong' }, { 'x-forwarded-for': `10.9.${i}.${i}` })).status);
    assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401));
    assert.deepEqual(statuses.slice(10), [429, 429], `spoofed XFF must not reset the limit: ${statuses.join(',')}`);
    // the tracker uses req.ip (resolved by Express from the trusted hop count), not the raw header
    const req = { ip: '203.0.113.7', url: '/v1/auth/login', headers: { 'x-forwarded-for': '6.6.6.6' }, body: { email: 'A@x.test' } };
    assert.equal(throttleTracker(req), '203.0.113.7:a@x.test');
    assert.equal(throttleTracker({ ...req, url: '/v1/orders' }), '203.0.113.7');
    assert.equal(trustProxyHops({ TRUST_PROXY: undefined }, {}), 0, 'local / self-hosted default: no proxy is trusted');
    assert.equal(trustProxyHops({ TRUST_PROXY: undefined }, { VERCEL: '1' }), 1, 'Vercel: its edge is the one trusted hop');
    assert.equal(trustProxyHops({ TRUST_PROXY: 2 }, { VERCEL: '1' }), 2, 'explicit setting wins');
  });

  // ------------------------------------------------------------------ A17
  test("A17. self-acknowledgement evidence keys on the agent's session or jr_dev device cookie (never IP/UA); IP + UA are stored as evidence; flagged acks are surfaced", async () => {
    const s = await shop();
    const a = await agent();
    const visitId = await openVisit(a, s);
    const d = await design();
    // the agent signs in on their phone: an httpOnly, SameSite=Lax, long-lived device cookie
    const signIn = async (cookie?: string) => {
      const r = await fetch(`${BASE}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ email: a.email, password: 'Audit@2026x' }) });
      return r.headers.getSetCookie().find((c) => c.startsWith('jr_dev='));
    };
    const setDev = await signIn();
    assert.ok(setDev, 'jr_dev set at login');
    assert.match(setDev!, /HttpOnly/i);
    assert.match(setDev!, /SameSite=Lax/i);
    assert.ok(Number(/Max-Age=(\d+)/i.exec(setDev!)?.[1]) >= 180 * 86_400, 'long-lived');
    const dev = setDev!.split(';')[0];
    assert.equal((await signIn(dev))?.split(';')[0], dev, 'a known device keeps its id');
    const devValue = dev.split('=')[1];
    const devRows = await db.refreshToken.findMany({ where: { userId: a.id, deviceHash: { not: null } } });
    const devHash = createHash('sha256').update(devValue).digest('hex');
    assert.ok(devRows.filter((r) => r.deviceHash === devHash).length >= 2, 'both sessions on this phone carry its device hash');
    assert.ok(!devRows.some((r) => r.deviceHash === devValue || r.tokenHash === devValue), 'only the hash is stored');
    const memo = async () => {
      const [p] = await pieces(1, d.id, a);
      const m = await api(a.token, 'POST', '/v1/memos', { visitId, pieceIds: [p], dueDate: addDays(TODAY, 3) }, key());
      assert.equal(m.status, 201, JSON.stringify(m.json));
      return { id: m.data.memo.id as string, token: String(m.data.ack.url).split('/ack/')[1], pieceId: p };
    };
    // 1. QR confirm sent with the agent's own session
    const m1 = await memo();
    assert.equal((await api(a.token, 'POST', `/v1/public/memo-ack/${m1.token}`, { confirm: true })).status, 200);
    let row = await db.memo.findUniqueOrThrow({ where: { id: m1.id } });
    assert.deepEqual([row.ackStatus, row.selfAckSuspected, row.selfAckReason], ['ACKNOWLEDGED', true, 'AGENT_SESSION']);
    assert.ok(row.ackIp && row.ackUserAgent, 'ack IP and user agent stored as evidence');
    const ev = await db.outboxEvent.findFirstOrThrow({ where: { memoId: m1.id, type: 'memo.acknowledged' } });
    assert.equal((ev.payload as J).data.selfAckSuspected, true);
    assert.equal((await api(a.token, 'GET', `/v1/memos/${m1.id}`)).data.memo.selfAckSuspected, true);
    const rec = (await api(ADMIN, 'GET', `/v1/admin/memos/${m1.id}`)).data;
    const hand = rec.custody.find((c: J) => c.reason === 'MEMO_HANDOVER' && c.pieceId === m1.pieceId);
    assert.deepEqual([hand.ack.selfAckSuspected, hand.ack.note], [true, "Acknowledged from the agent's device"]);
    const att = (await api(ADMIN, 'GET', '/v1/admin/home')).data.attention.find((x: J) => x.kind === 'ACK_SELF_SUSPECTED' && x.entity.id === m1.id);
    assert.equal(att?.severity, 'medium');
    // 2. the agent's phone without a session (signed out / expired): the device cookie gives it away
    const m2 = await memo();
    assert.equal((await api(null, 'POST', `/v1/public/memo-ack/${m2.token}`, { confirm: true }, { cookie: dev })).status, 200);
    row = await db.memo.findUniqueOrThrow({ where: { id: m2.id } });
    assert.deepEqual([row.selfAckSuspected, row.selfAckReason], [true, 'AGENT_DEVICE']);
    // 3. a retailer behind the same proxy IP with the same user agent, no cookies → NOT flagged (IP/UA never trigger)
    const m3 = await memo();
    assert.equal((await api(null, 'GET', `/v1/public/memo-ack/${m3.token}`)).status, 200);
    assert.equal((await api(null, 'POST', `/v1/public/memo-ack/${m3.token}`, { confirm: true })).status, 200);
    row = await db.memo.findUniqueOrThrow({ where: { id: m3.id } });
    assert.deepEqual([row.ackStatus, row.selfAckSuspected, row.selfAckReason], ['ACKNOWLEDGED', false, null]);
    assert.ok(row.ackUserAgent, 'evidence still stored');
    assert.equal((await api(a.token, 'GET', `/v1/memos/${m3.id}`)).data.memo.selfAckSuspected, false);
    assert.ok(!(await api(ADMIN, 'GET', '/v1/admin/home')).data.attention.some((x: J) => x.entity.id === m3.id));
    // 3b. the retailer's own device cookie is not the agent's
    const m3b = await memo();
    assert.equal((await api(null, 'POST', `/v1/public/memo-ack/${m3b.token}`, { confirm: true }, { cookie: `jr_dev=${'r'.repeat(43)}` })).status, 200);
    assert.equal((await db.memo.findUniqueOrThrow({ where: { id: m3b.id } })).selfAckSuspected, false);
    // 4. OTP: the code page was opened on the agent's device → flagged at verify
    const m4 = await memo();
    const page = await api(null, 'GET', `/v1/public/memo-ack/${m4.token}`, undefined, { cookie: dev });
    assert.equal((await api(a.token, 'POST', `/v1/memos/${m4.id}/ack/verify`, { code: page.data.code })).status, 200);
    row = await db.memo.findUniqueOrThrow({ where: { id: m4.id } });
    assert.deepEqual([row.ackMethod, row.selfAckSuspected, row.selfAckReason], ['OTP', true, 'CODE_VIEWED_ON_AGENT_DEVICE']);
    // read model only: nothing was blocked; the retailer's UA is not copied into the audit trail
    assert.equal(await db.memo.count({ where: { id: { in: [m1.id, m2.id, m3.id, m3b.id, m4.id] }, ackStatus: 'ACKNOWLEDGED' } }), 5);
    const auditRow = await db.auditLog.findFirstOrThrow({ where: { entityId: m3.id, action: 'memo.ack' } });
    assert.ok(!JSON.stringify(auditRow.after).includes('userAgent'));
  });

  // ------------------------------------------------------------------ A18
  test('A18. a memo retry after IST midnight replays the stored response before the due date is re-validated', async () => {
    const s = await shop();
    const a = await agent();
    const visitId = await openVisit(a, s);
    // The original request succeeded "yesterday" with dueDate = yesterday's today; its key row holds the response.
    const body = { visitId, pieceIds: ['piece-from-yesterday'], dueDate: addDays(TODAY, -1) };
    const k = randomUUID();
    const stored = { memo: { id: 'memo-from-yesterday', number: 'MEMO-2026-99999' }, ack: null };
    await db.idempotencyKey.create({ data: { tenantId: AURUM, key: k, userId: a.id, fingerprint: fingerprintOf('POST', '/v1/memos', body), responseStatus: 200, responseBody: stored } });
    const replay = await api(a.token, 'POST', '/v1/memos', body, { 'Idempotency-Key': k });
    assert.equal(replay.status, 201, JSON.stringify(replay.json));
    assert.deepEqual(replay.data, stored);
    // a new request with that date is still refused, and leaves no key behind
    const k2 = randomUUID();
    const fresh = await api(a.token, 'POST', '/v1/memos', body, { 'Idempotency-Key': k2 });
    assert.equal(fresh.error?.code, 'INVALID_DUE_DATE');
    assert.equal(await db.idempotencyKey.count({ where: { key: k2 } }), 0);
  });

  // ------------------------------------------------------------------ A19
  test('A19. visit notes honour an optional Idempotency-Key: a retried save stores the note once', async () => {
    const s = await shop();
    const a = await agent();
    const visitId = await openVisit(a, s);
    const k = randomUUID();
    const n1 = await api(a.token, 'POST', `/v1/visits/${visitId}/notes`, { body: 'Retailer wants the kada in 18K' }, { 'Idempotency-Key': k });
    assert.equal(n1.status, 201, JSON.stringify(n1.json));
    const burst = await Promise.all(Array.from({ length: 3 }, () => api(a.token, 'POST', `/v1/visits/${visitId}/notes`, { body: 'Retailer wants the kada in 18K' }, { 'Idempotency-Key': k })));
    for (const r of burst) {
      assert.equal(r.status, 201);
      assert.deepEqual(r.data, n1.data);
    }
    assert.equal(await db.visitNote.count({ where: { visitId } }), 1, 'one note for one key');
    const other = await api(a.token, 'POST', `/v1/visits/${visitId}/notes`, { body: 'something else' }, { 'Idempotency-Key': k });
    assert.equal(other.status, 422);
    assert.equal(other.error.code, 'IDEMPOTENCY_KEY_REUSED');
    // other agent with the same key cannot read or write it; keyless saves still work
    const b = await agent();
    assert.equal((await api(b.token, 'POST', `/v1/visits/${visitId}/notes`, { body: 'x' }, key())).status, 404);
    assert.equal((await api(a.token, 'POST', `/v1/visits/${visitId}/notes`, { body: 'second note' })).status, 201);
    assert.equal(await db.visitNote.count({ where: { visitId } }), 2);
  });

  // ------------------------------------------------------------------ A20
  test('A20. retention sweep: refresh tokens expired or revoked > 30 days ago are purged; ack IP/UA and last-seen device data are cleared after 90 days', async () => {
    const u = await agent();
    const day = 86_400_000;
    const mk = (extra: { expiresAt: Date; revokedAt?: Date | null; createdAt?: Date }) =>
      db.refreshToken.create({ data: { tenantId: AURUM, userId: u.id, tokenHash: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''), ...extra } });
    const oldExpired = await mk({ expiresAt: new Date(Date.now() - 40 * day), createdAt: new Date(Date.now() - 70 * day) });
    const oldRevoked = await mk({ expiresAt: new Date(Date.now() + day), revokedAt: new Date(Date.now() - 31 * day), createdAt: new Date(Date.now() - 32 * day) });
    const recentRevoked = await mk({ expiresAt: new Date(Date.now() + 20 * day), revokedAt: new Date(Date.now() - day) });
    const liveTok = await mk({ expiresAt: new Date(Date.now() + 20 * day) });
    const s = await shop();
    const visitId = await openVisit(u, s);
    const [p1, p2] = await pieces(2, (await design()).id, u);
    const ack = async (p: string) => {
      const m = await api(u.token, 'POST', '/v1/memos', { visitId, pieceIds: [p], dueDate: addDays(TODAY, 3) }, key());
      assert.equal((await api(null, 'POST', `/v1/public/memo-ack/${String(m.data.ack.url).split('/ack/')[1]}`, { confirm: true }, { 'user-agent': 'RetailerPhone/9' })).status, 200);
      return m.data.memo.id as string;
    };
    const oldMemo = await ack(p1);
    const newMemo = await ack(p2);
    await db.memo.update({ where: { id: oldMemo }, data: { ackAt: new Date(Date.now() - 91 * day), selfAckSuspected: true, selfAckReason: 'AGENT_DEVICE' } });
    await db.user.update({ where: { id: u.id }, data: { lastSeenAt: new Date(Date.now() - 91 * day), lastSeenIp: '10.0.0.1', lastSeenUa: 'Old/1' } });
    await dispatch();
    const ids = new Set((await db.refreshToken.findMany({ where: { userId: u.id } })).map((r) => r.id));
    assert.ok(!ids.has(oldExpired.id) && !ids.has(oldRevoked.id), 'old expired / revoked tokens purged');
    assert.ok(ids.has(recentRevoked.id) && ids.has(liveTok.id), 'recent and live tokens kept');
    const o = await db.memo.findUniqueOrThrow({ where: { id: oldMemo } });
    assert.deepEqual([o.ackIp, o.ackUserAgent, o.selfAckSuspected, o.selfAckReason], [null, null, true, 'AGENT_DEVICE'], 'personal data cleared, the finding kept');
    const n = await db.memo.findUniqueOrThrow({ where: { id: newMemo } });
    assert.equal(n.ackUserAgent, 'RetailerPhone/9', 'recent evidence kept');
    const usr = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    assert.deepEqual([usr.lastSeenAt, usr.lastSeenIp, usr.lastSeenUa], [null, null, null]);
  });

  // ------------------------------------------------------------------ A21
  test('A21. shop owner / phone: empty or blank means none (null) on create and on PATCH', async () => {
    const r = await api(ADMIN, 'POST', '/v1/admin/shops', { name: `Audit Blank ${Date.now()}`, address: 'x', area: 'Audit', lat: 28.62, lng: 77.12, ownerName: '', phone: '   ' });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    let row = await db.shop.findUniqueOrThrow({ where: { id: r.data.shop.id } });
    assert.deepEqual([row.ownerName, row.phone], [null, null]);
    assert.equal((await api(ADMIN, 'PATCH', `/v1/admin/shops/${row.id}`, { ownerName: 'Ravi', phone: '+91 98' })).status, 200);
    assert.equal((await api(ADMIN, 'PATCH', `/v1/admin/shops/${row.id}`, { ownerName: '', phone: null })).status, 200);
    row = await db.shop.findUniqueOrThrow({ where: { id: row.id } });
    assert.deepEqual([row.ownerName, row.phone], [null, null]);
  });
});
