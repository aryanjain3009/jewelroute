/* P7 walkthrough fixes (docs/VERIFY-P7.md): what the field app needs from the API to show a decision
 * and to preview a memo-to-sale with the same credit rule as the conversion. Real Postgres, through HTTP. */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { addDays, istDate, orderTotals } from '@jewelroute/shared';
import bcrypt from 'bcryptjs';
import { api, db, J, login, start, stop, uploadProof } from './harness';

const TODAY = istDate();
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
  const email = `p7-${Date.now()}-${++n}@aurum.test`;
  const u = await db.user.create({ data: { tenantId: AURUM, name: `P7 Agent ${n}`, email, role: 'FIELD_AGENT', passwordHash: await bcrypt.hash('P7agent@2026', 4) } });
  return { id: u.id, name: u.name, token: await login(email, 'P7agent@2026') };
}
async function shop(creditLimitPaise: number) {
  const r = await api(ADMIN, 'POST', '/v1/admin/shops', { name: `P7 Shop ${Date.now()}-${++n}`, address: 'Test lane', area: 'Test', lat: 28.5 + n / 10_000, lng: 77.1, creditLimitPaise });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.data.shop as J;
}
async function openVisit(s: J, a?: Awaited<ReturnType<typeof agent>>, proof = true) {
  const ag = a ?? (await agent());
  const v = await api(ADMIN, 'POST', '/v1/admin/assignments', { agentId: ag.id, shopId: s.id, date: TODAY });
  assert.equal(v.status, 201, JSON.stringify(v.json));
  const ci = await api(ag.token, 'POST', `/v1/visits/${v.data.visit.id}/check-in`, { lat: s.lat, lng: s.lng, accuracyM: 5 }, key());
  assert.equal(ci.status, 200, JSON.stringify(ci.json));
  if (proof) await uploadProof(ag.token, v.data.visit.id, s.lat, s.lng);
  return { agent: ag, visitId: v.data.visit.id as string };
}
/** Memo of `count` fresh pieces of one design, handed over on `visitId`. */
async function memoOf(a: { id: string; token: string }, visitId: string, count: number) {
  const d = await db.jewelryDesign.findFirstOrThrow({ where: { tenantId: AURUM, sku: 'AJ-PND-2241' } });
  const ids: string[] = (await api(ADMIN, 'POST', `/v1/admin/designs/${d.id}/pieces`, { count })).data.pieces.map((p: J) => p.id);
  assert.equal((await api(ADMIN, 'POST', '/v1/admin/pieces/issue', { pieceIds: ids, agentId: a.id })).status, 200);
  const m = await api(a.token, 'POST', '/v1/memos', { visitId, pieceIds: ids, dueDate: addDays(TODAY, 5) }, key());
  assert.equal(m.status, 201, JSON.stringify(m.json));
  return { memo: m.data.memo as J, ids };
}

describe('P7 field decision note', () => {
  test('P1. the field visit payload carries the rejection reason, who decided and when (M1)', async () => {
    const s = await shop(1); // every order trips CREDIT_LIMIT
    const { agent: a, visitId } = await openVisit(s);
    const d = await db.jewelryDesign.findFirstOrThrow({ where: { tenantId: AURUM, sku: 'AJ-RNG-2221' } });
    const o = await api(a.token, 'POST', '/v1/orders', { visitId, items: [{ designId: d.id, quantity: 1 }] }, key());
    assert.equal(o.data.order.status, 'PENDING_APPROVAL');
    const rj = await api(ADMIN, 'POST', `/v1/admin/orders/${o.data.order.id}/reject`, { reason: 'Clear last month first' });
    assert.equal(rj.status, 200, JSON.stringify(rj.json));
    const v = await api(a.token, 'GET', `/v1/visits/${visitId}`);
    const row = v.data.orders.find((x: J) => x.id === o.data.order.id);
    assert.equal(row.status, 'REJECTED');
    assert.equal(row.rejectionReason, 'Clear last month first');
    assert.equal(row.decidedBy.name, 'Priya Mehta');
    assert.ok(Date.parse(row.decidedAt) > 0);
    const one = await api(a.token, 'GET', `/v1/orders/${o.data.order.id}`);
    assert.deepEqual([one.data.order.rejectionReason, one.data.order.decidedBy.name], ['Clear last month first', 'Priya Mehta']);
  });
});

describe('P7 memo convert preview', () => {
  test('P2. GET /memos/:id/convert-preview prices at today\'s rate and runs the shared credit rule net of the pieces sold — the convert then agrees', async () => {
    const s = await shop(0);
    const { agent: a, visitId } = await openVisit(s);
    const { memo, ids } = await memoOf(a, visitId, 2);
    const [v1, v2] = ids.map((id) => memo.items.find((i: J) => i.piece.id === id).valuePaise as number);
    const T1 = orderTotals([v1]);
    const p = await api(a.token, 'GET', `/v1/memos/${memo.id}/convert-preview?pieceIds=${ids[0]}&visitId=${visitId}`);
    assert.equal(p.status, 200, JSON.stringify(p.json));
    const pv = p.data;
    assert.equal(pv.memoId, memo.id);
    assert.equal(pv.lines.length, 1);
    assert.deepEqual([pv.lines[0].pieceId, pv.lines[0].unitPricePaise, pv.lines[0].lineTotalPaise, pv.lines[0].memoValuePaise], [ids[0], v1, v1, v1]);
    assert.ok(pv.lines[0].ratePaisePerGram > 0 && pv.lines[0].goldRateId && pv.lines[0].tagCode);
    assert.deepEqual([pv.subtotalPaise, pv.gstPaise, pv.totalPaise], [T1.subtotalPaise, T1.gstPaise, T1.totalPaise]);
    assert.equal(pv.goldRateSnapshot.length, 1);
    // credit: the converted piece leaves memo exposure first (same as the convert), the order amount is the total
    assert.equal(pv.credit.shopId, s.id);
    assert.equal(pv.credit.memoExposurePaise, v2);
    assert.equal(pv.credit.orderAmountPaise, T1.totalPaise);
    assert.equal(pv.credit.projectedExposurePaise, v2 + T1.totalPaise);
    assert.equal(pv.credit.requiresApproval, false);
    // read-only: nothing moved, nothing booked
    assert.equal((await db.samplePiece.findUniqueOrThrow({ where: { id: ids[0] } })).custodianType, 'SHOP');
    assert.equal((await db.memoItem.findFirstOrThrow({ where: { memoId: memo.id, pieceId: ids[0] } })).status, 'OUT');
    assert.equal(await db.order.count({ where: { tenantId: AURUM, shopId: s.id } }), 0);

    // one paisa under: preview says approval (CREDIT_LIMIT) and the convert lands PENDING_APPROVAL with the same position
    assert.equal((await api(ADMIN, 'PATCH', `/v1/admin/shops/${s.id}`, { creditLimitPaise: v2 + T1.totalPaise - 1 })).status, 200);
    const p2 = (await api(a.token, 'GET', `/v1/memos/${memo.id}/convert-preview?pieceIds=${ids[0]}&visitId=${visitId}`)).data;
    assert.equal(p2.credit.requiresApproval, true);
    assert.deepEqual(p2.credit.reasons, ['CREDIT_LIMIT']);
    const c = await api(a.token, 'POST', `/v1/memos/${memo.id}/convert`, { pieceIds: [ids[0]], visitId }, key());
    assert.equal(c.status, 200, JSON.stringify(c.json));
    assert.equal(c.data.order.status, 'PENDING_APPROVAL');
    assert.equal(c.data.order.totalPaise, p2.totalPaise);
    const frozen = c.data.order.approval.position;
    for (const k of ['creditLimitPaise', 'outstandingPaise', 'memoExposurePaise', 'exposurePaise', 'availableCreditPaise', 'orderAmountPaise', 'projectedExposurePaise', 'requiresApproval', 'reasons']) {
      assert.deepEqual(frozen[k], p2.credit[k], `credit.${k} preview = frozen at convert`);
    }
  });

  test('P3. preview errors: validation, pieces not out, another agent, a visit that is not open', async () => {
    const s = await shop(0);
    const { agent: a, visitId } = await openVisit(s);
    const { memo, ids } = await memoOf(a, visitId, 1);
    const pre = (q: string, tok = a.token) => api(tok, 'GET', `/v1/memos/${memo.id}/convert-preview${q}`);
    assert.equal((await pre('')).status, 400);
    const notOut = await pre(`?pieceIds=${ids[0]},nope`);
    assert.deepEqual([notOut.status, notOut.error.code], [409, 'PIECE_NOT_ON_MEMO']);
    const other = await agent();
    assert.equal((await pre(`?pieceIds=${ids[0]}`, other.token)).status, 404, 'another agent never sees the memo');
    // a visit that is not open (tomorrow's, still PLANNED) → the same 409 the convert gives
    assert.equal((await api(a.token, 'POST', `/v1/visits/${visitId}/complete`, {})).status, 200);
    const v4 = await api(ADMIN, 'POST', '/v1/admin/assignments', { agentId: a.id, shopId: s.id, date: addDays(TODAY, 1) });
    assert.equal(v4.status, 201);
    const notOpen = await pre(`?pieceIds=${ids[0]}&visitId=${v4.data.visit.id}`);
    assert.deepEqual([notOpen.status, notOpen.error.code], [409, 'VISIT_NOT_OPEN']);
    // without a visit (the memo can still be previewed, e.g. for the office) it answers
    assert.equal((await pre(`?pieceIds=${ids[0]}`)).status, 200);
  });
});

describe('P7 attention timing', () => {
  test('P4. VISIT_MISSED is timed at the planned slot (IST) and worded from the stored status (m3, m4)', async () => {
    const s = await shop(0);
    const a = await agent();
    const y = addDays(TODAY, -1);
    const v = await db.visit.create({ data: { tenantId: AURUM, agentId: a.id, shopId: s.id, plannedDate: new Date(`${y}T00:00:00Z`), plannedTime: '14:30', sequence: 1, status: 'MISSED' } });
    const home = (await api(ADMIN, 'GET', '/v1/admin/home')).data;
    const it = home.attention.find((x: J) => x.entity.id === v.id);
    assert.ok(it, 'listed');
    assert.equal(it.at, new Date(`${y}T14:30:00+05:30`).toISOString());
    assert.match(it.title, /missed/);
  });
});
