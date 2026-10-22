/* Concurrency suite (BACKLOG #4): nine races, ×20 parallel HTTP requests each, against the real server and
 * Postgres. After every scenario the whole workspace is checked from the DB: one custodian per piece, a
 * contiguous custody ledger, no duplicate orders/memos, totals and credit that recompute from rows, and
 * exactly one outbox event per change. Everything lives in a fresh signup workspace (random suffix), so the
 * file is rerunnable and never depends on the seed's numbers. */
import { after, before, describe, test, TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer, Server } from 'node:http';
import { join } from 'node:path';
import { addDays, creditPosition, istDate, orderTotals, priceDesign } from '@jewelroute/shared';
import { findSoldOrphans } from '../src/core/orphans';
import { api, BASE, db, ENV, J, login, PORT, start, stop, uploadProof } from './harness';

const TODAY = istDate();
const RUN = randomUUID().slice(0, 8);
const N = 20;
const key = () => ({ 'Idempotency-Key': randomUUID() });
let OWNER: string;
let TID: string;
let K22: J; // design, 22K
let K18: J; // design, 18K
interface Agent {
  id: string;
  token: string;
  refreshToken: string;
}
const AG: Agent[] = [];
let shopN = 0;

/** "201" / "409 PIECE_NOT_IN_YOUR_CUSTODY" → count. */
function tally(rs: { status: number; error?: J }[]) {
  const out: Record<string, number> = {};
  for (const r of rs) {
    const k = `${r.status}${r.error?.code ? ` ${r.error.code}` : ''}`;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
function report(t: TestContext, label: string, rs: { status: number; error?: J }[]) {
  t.diagnostic(`${label}: ${JSON.stringify(tally(rs))}`);
  assert.ok(rs.every((r) => r.status < 500), `${label}: no 5xx ${JSON.stringify(tally(rs))}`);
}

before(async () => {
  // A bounded pool (8) still runs 8 racing transactions at once, and keeps this file within a Postgres
  // shared with other test runs (max_connections 100).
  await start({ DATABASE_URL: `${ENV.DATABASE_URL}?connection_limit=8` });
  const s = await api(null, 'POST', '/v1/auth/signup', { workspaceName: `Conc ${RUN} Jewels`, name: 'Conc Owner', email: `owner-${RUN}@conc.test`, password: 'Owner@2026' });
  assert.equal(s.status, 201, JSON.stringify(s.json));
  OWNER = s.data.accessToken;
  TID = s.data.user.tenant.id;
  for (const [purity, ratePaisePerGram] of [['K22', 10_500_00], ['K18', 8_600_00]] as const) {
    assert.equal((await api(OWNER, 'POST', '/v1/admin/gold-rates', { purity, ratePaisePerGram })).status, 201);
  }
  const mk = async (purity: string, extra: J) => {
    const r = await api(OWNER, 'POST', '/v1/admin/designs', { sku: `C-${purity}-${RUN}`, name: `Conc ${purity}`, category: 'Rings', collection: 'Core', purity, grossWeightMg: 6_123, netWeightMg: 5_457, ...extra });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return r.data.design;
  };
  K22 = await mk('K22', { makingChargeType: 'PER_GRAM', makingChargeValue: 650_00, stoneValuePaise: 1_234_50 });
  K18 = await mk('K18', { makingChargeType: 'PERCENT', makingChargeValue: 1_250, otherComponents: [{ label: 'Hallmark', valuePaise: 45_00 }] });
  // 8 agents, logged in once (login is limited to 10/min per IP).
  for (let i = 0; i < 8; i++) {
    const email = `agent${i}-${RUN}@conc.test`;
    const a = await api(OWNER, 'POST', '/v1/admin/agents', { name: `Conc Agent ${i}`, email, password: 'Agent@2026' });
    assert.equal(a.status, 201, JSON.stringify(a.json));
    const l = await api(null, 'POST', '/v1/auth/login', { email, password: 'Agent@2026' });
    assert.equal(l.status, 200, JSON.stringify(l.json));
    AG.push({ id: a.data.agent.id, token: l.data.accessToken, refreshToken: l.data.refreshToken });
  }
});
after(stop);

// ---------------------------------------------------------------- builders
async function shop(creditLimitPaise = 0) {
  const n = ++shopN;
  const r = await api(OWNER, 'POST', '/v1/admin/shops', { name: `Conc Shop ${RUN}-${n}`, address: `${n} Race Road`, area: 'Race', lat: 19 + n / 100, lng: 72.8, geofenceRadiusM: 100, creditLimitPaise });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.data.shop as J;
}
/** Complete whatever visit the agent has open, so the agent can check in somewhere else. */
async function closeOpen(a: Agent) {
  const open = await db.visit.findFirst({ where: { tenantId: TID, agentId: a.id, status: { in: ['CHECKED_IN', 'ACTIVE'] } } });
  if (!open) return;
  if (!(await db.visitProof.count({ where: { visitId: open.id } }))) await uploadProof(a.token, open.id, 19, 72.8);
  assert.equal((await api(a.token, 'POST', `/v1/visits/${open.id}/complete`, {})).status, 200);
}
async function plan(a: Agent, s: J) {
  const v = await api(OWNER, 'POST', '/v1/admin/assignments', { agentId: a.id, shopId: s.id, date: TODAY });
  assert.equal(v.status, 201, JSON.stringify(v.json));
  return v.data.visit.id as string;
}
/** Checked in with an arrival photo: ready to sell. */
async function openVisit(a: Agent, s: J) {
  await closeOpen(a);
  const id = await plan(a, s);
  const ci = await api(a.token, 'POST', `/v1/visits/${id}/check-in`, { lat: s.lat, lng: s.lng, accuracyM: 5 }, key());
  assert.equal(ci.status, 200, JSON.stringify(ci.json));
  await uploadProof(a.token, id, s.lat, s.lng);
  return id;
}
/** `count` fresh pieces in the vault, issued to `a` when given. */
async function pieces(count: number, a?: Agent, design: J = K22): Promise<string[]> {
  const r = await api(OWNER, 'POST', `/v1/admin/designs/${design.id}/pieces`, { count });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const ids = r.data.pieces.map((p: J) => p.id as string);
  if (a) assert.equal((await api(OWNER, 'POST', '/v1/admin/pieces/issue', { pieceIds: ids, agentId: a.id })).status, 200);
  return ids;
}
const order = (a: Agent, visitId: string, items: J[] = [{ designId: K22.id, quantity: 1 }], h = key()) => api(a.token, 'POST', '/v1/orders', { visitId, items }, h);
const memo = (a: Agent, visitId: string, pieceIds: string[], h = key()) => api(a.token, 'POST', '/v1/memos', { visitId, pieceIds, dueDate: addDays(TODAY, 5) }, h);
const convert = (a: Agent, memoId: string, pieceIds: string[]) => api(a.token, 'POST', `/v1/memos/${memoId}/convert`, { pieceIds }, key());
const decide = (orderId: string, what: 'approve' | 'reject' | 'cancel' | 'settle') =>
  api(OWNER, 'POST', `/v1/admin/orders/${orderId}/${what}`, what === 'approve' || what === 'settle' ? {} : { reason: `race ${what}` });
/** Start `f` after `ms` — spreads a burst so the racing writes interleave instead of all queueing behind the first lock. */
const later = <T>(ms: number, f: () => Promise<T>) => new Promise((r) => setTimeout(r, ms)).then(f);
const jitter = () => Math.floor(Math.random() * 60);
const count = (type: string, where: J = {}) => db.outboxEvent.count({ where: { tenantId: TID, type, ...where } });

// ---------------------------------------------------------------- the invariants, from the DB
const num = (v: bigint | number | null | undefined) => Number(v ?? 0);

async function invariants() {
  // 1. One custodian per piece: the type matches the custodian columns.
  const ps = await db.samplePiece.findMany({ where: { tenantId: TID } });
  for (const p of ps) {
    const ok =
      p.custodianType === 'AGENT' ? !!p.custodianAgentId && !p.custodianShopId : p.custodianType === 'SHOP' ? !!p.custodianShopId && !p.custodianAgentId : !p.custodianAgentId && !p.custodianShopId;
    assert.ok(ok, `piece ${p.tagCode} custodian columns disagree with ${p.custodianType}`);
  }
  // 2. Custody seq contiguous per piece (1..custodySeq) and the last event lands where the piece is.
  const evs = await db.custodyEvent.findMany({ where: { tenantId: TID }, orderBy: [{ pieceId: 'asc' }, { seq: 'asc' }] });
  const byPiece = new Map<string, typeof evs>();
  for (const e of evs) byPiece.set(e.pieceId, [...(byPiece.get(e.pieceId) ?? []), e]);
  for (const p of ps) {
    const list = byPiece.get(p.id) ?? [];
    assert.deepEqual(list.map((e) => e.seq), Array.from({ length: p.custodySeq }, (_, i) => i + 1), `piece ${p.tagCode} ledger is not 1..${p.custodySeq}`);
    const last = list[list.length - 1];
    assert.deepEqual([last.toType, last.toAgentId, last.toShopId], [p.custodianType, p.custodianAgentId, p.custodianShopId], `piece ${p.tagCode} last event ≠ custodian`);
    for (let i = 1; i < list.length; i++) {
      assert.deepEqual([list[i].fromType, list[i].fromAgentId, list[i].fromShopId], [list[i - 1].toType, list[i - 1].toAgentId, list[i - 1].toShopId], `piece ${p.tagCode} seq ${list[i].seq} does not start where ${list[i - 1].seq} ended`);
    }
  }
  // 3. At most one OUT memo item per piece; an OUT item's piece is at that memo's shop; SOLD ⇒ a live order.
  const items = await db.memoItem.findMany({ where: { tenantId: TID }, include: { memo: { select: { shopId: true } } } });
  const outs = items.filter((i) => i.status === 'OUT');
  assert.equal(new Set(outs.map((i) => i.pieceId)).size, outs.length, 'a piece is OUT on two memos');
  const pById = new Map(ps.map((p) => [p.id, p]));
  for (const i of outs) assert.deepEqual([pById.get(i.pieceId)!.custodianType, pById.get(i.pieceId)!.custodianShopId], ['SHOP', i.memo.shopId], 'OUT memo item but the piece is not at the memo shop');
  assert.deepEqual((await findSoldOrphans(db)).filter((o) => o.tenantId === TID), [], 'SOLD piece without a live order');
  // 4. No duplicate orders or memos: clientOpId distinct, one key row per order.
  const orders = await db.order.findMany({ where: { tenantId: TID }, include: { items: true } });
  const memos = await db.memo.findMany({ where: { tenantId: TID } });
  assert.equal(new Set(orders.map((o) => o.clientOpId)).size, orders.length, 'duplicate order clientOpId');
  assert.equal(new Set(memos.map((m) => m.clientOpId)).size, memos.length, 'duplicate memo clientOpId');
  // 5. Totals recompute from the frozen lines with the shared helpers; each line's rate is its GoldRate row.
  const rates = new Map((await db.goldRate.findMany({ where: { tenantId: TID } })).map((r) => [r.id, r]));
  const designs = new Map((await db.jewelryDesign.findMany({ where: { tenantId: TID } })).map((d) => [d.id, d]));
  for (const o of orders) {
    for (const it of o.items) {
      const r = rates.get(it.goldRateId)!;
      assert.ok(r && r.purity === it.purity && r.ratePaisePerGram === it.ratePaisePerGram, `${o.number}: line rate is not its GoldRate row`);
      const d = designs.get(it.designId)!;
      const p = priceDesign({ netWeightMg: it.netWeightMg, ratePaisePerGram: num(it.ratePaisePerGram), makingChargeType: d.makingChargeType, makingChargeValue: num(d.makingChargeValue), stoneValuePaise: num(d.stoneValuePaise), otherComponents: d.otherComponents as J });
      assert.deepEqual([num(it.goldValuePaise), num(it.makingPaise), num(it.stonePaise), num(it.otherPaise), num(it.unitPricePaise), num(it.lineTotalPaise)], [p.goldValuePaise, p.makingPaise, p.stonePaise, p.otherPaise, p.unitPricePaise, p.unitPricePaise * it.quantity], `${o.number}: line does not reprice`);
    }
    const t = orderTotals(o.items.map((i) => num(i.lineTotalPaise)));
    assert.deepEqual([num(o.subtotalPaise), num(o.gstPaise), num(o.totalPaise)], [t.subtotalPaise, t.gstPaise, t.totalPaise], `${o.number}: totals`);
    const snap = o.goldRateSnapshot as J[];
    assert.equal(snap.length, new Set(o.items.map((i) => i.purity)).size, `${o.number}: one frozen rate per purity`);
    for (const s of snap) assert.ok(o.items.filter((i) => i.purity === s.purity).every((i) => i.goldRateId === s.goldRateId), `${o.number}: snapshot rate ≠ line rate`);
    // The frozen credit decision recomputes with the shared rule and agrees with the order status.
    const c = o.creditSnapshot as J;
    const again = creditPosition({ creditLimitPaise: c.creditLimitPaise, openingOutstandingPaise: c.openingOutstandingPaise, unsettledOrdersPaise: c.unsettledOrdersPaise, memoExposurePaise: c.memoExposurePaise, approvalThresholdPaise: c.approvalThresholdPaise, orderAmountPaise: c.orderAmountPaise });
    assert.deepEqual([again.requiresApproval, again.reasons, again.projectedExposurePaise, c.orderAmountPaise], [o.approvalRequired, o.approvalReasons, c.projectedExposurePaise, num(o.totalPaise)], `${o.number}: credit snapshot`);
    if (o.status === 'CONFIRMED') assert.equal(o.approvalRequired, false);
    if (['PENDING_APPROVAL', 'APPROVED', 'REJECTED'].includes(o.status)) assert.equal(o.approvalRequired, true, `${o.number} ${o.status}`);
  }
  // 6. Credit: the API's position for every shop = the rows, summed here.
  for (const s of await db.shop.findMany({ where: { tenantId: TID } })) {
    const unsettled = orders.filter((o) => o.shopId === s.id && ['CONFIRMED', 'APPROVED'].includes(o.status) && !o.settledAt).reduce((a, o) => a + num(o.totalPaise), 0);
    const memoIds = new Set(memos.filter((m) => m.shopId === s.id).map((m) => m.id));
    const memoExp = outs.filter((i) => memoIds.has(i.memoId)).reduce((a, i) => a + num(i.valuePaise), 0);
    const pos = await api(OWNER, 'GET', `/v1/admin/shops/${s.id}/credit`);
    assert.equal(pos.status, 200);
    assert.deepEqual([pos.data.unsettledOrdersPaise, pos.data.memoExposurePaise, pos.data.exposurePaise], [unsettled, memoExp, num(s.openingOutstandingPaise) + unsettled + memoExp], `shop ${s.name} credit`);
  }
  // 7. Outbox exactly once per change.
  const ob = await db.outboxEvent.findMany({ where: { tenantId: TID }, select: { id: true, type: true, aggregateId: true, payload: true } });
  const n = (type: string, id: string) => ob.filter((e) => e.type === type && e.aggregateId === id).length;
  for (const o of orders) {
    assert.equal(n('order.created', o.id), 1, `${o.number} order.created`);
    assert.equal(n('order.confirmed', o.id) + n('order.pending_approval', o.id), 1, `${o.number} confirmed|pending`);
    assert.equal(n(o.approvalRequired ? 'order.pending_approval' : 'order.confirmed', o.id), 1);
    const decided = { APPROVED: 'order.approved', REJECTED: 'order.rejected', CANCELLED: 'order.cancelled' } as Record<string, string>;
    for (const [st, type] of Object.entries(decided)) assert.equal(n(type, o.id), o.status === st ? 1 : 0, `${o.number} ${type}`);
    assert.equal(n('order.settled', o.id), o.settledAt ? 1 : 0);
  }
  for (const m of memos) {
    assert.equal(n('memo.created', m.id), 1, `${m.number} memo.created`);
    assert.equal(n('memo.acknowledged', m.id), m.ackStatus === 'ACKNOWLEDGED' ? 1 : 0, `${m.number} memo.acknowledged`);
  }
  for (const v of await db.visit.findMany({ where: { tenantId: TID } })) {
    assert.equal(n('visit.checked_in', v.id), v.checkInAt ? 1 : 0, `visit ${v.id} checked_in`);
    assert.equal(n('visit.completed', v.id), v.status === 'COMPLETED' ? 1 : 0, `visit ${v.id} completed`);
  }
  // One sample.custody_changed per move, carrying exactly the ledger rows stamped with its id.
  const moves = ob.filter((e) => e.type === 'sample.custody_changed');
  const stamped = evs.filter((e) => e.reason !== 'INTAKE');
  assert.ok(stamped.every((e) => e.outboxEventId), 'every move is stamped with its outbox id');
  assert.equal(new Set(stamped.map((e) => e.outboxEventId)).size, moves.length, 'one custody event per move');
  for (const m of moves) {
    const rows = stamped.filter((e) => e.outboxEventId === m.id).map((e) => `${e.pieceId}:${e.seq}`).sort();
    const sent = ((m.payload as J).data.pieces as J[]).map((p) => `${p.id}:${p.seq}`).sort();
    assert.deepEqual(sent, rows, `${m.id} payload ≠ ledger`);
  }
}

// ---------------------------------------------------------------- scenarios
describe('concurrency ×20', () => {
  test('C1. two tabs of one agent and a second agent memo the same piece at once', async (t) => {
    const [A, B] = AG;
    const s = await shop();
    const otherShop = await shop();
    const va = await openVisit(A, s);
    const vb = await openVisit(B, otherShop);
    const [P] = await pieces(1, A);
    await pieces(1, B);
    const K1 = key();
    const reqs = Array.from({ length: N }, (_, i) => (i % 5 === 4 ? memo(B, vb, [P]) : i % 2 ? memo(A, va, [P], K1) : memo(A, va, [P])));
    const rs = await Promise.all(reqs);
    report(t, 'C1 memo same piece', rs);
    const ok = rs.filter((r) => r.status === 201);
    assert.ok(ok.length >= 1, JSON.stringify(tally(rs)));
    assert.equal(new Set(ok.map((r) => r.data.memo.id)).size, 1, 'every 201 is the same memo');
    assert.ok(rs.filter((r) => r.status !== 201).every((r) => r.status === 409 && ['PIECE_NOT_IN_YOUR_CUSTODY', 'PIECE_ALREADY_ON_MEMO'].includes(r.error.code)), JSON.stringify(tally(rs)));
    for (const [i, r] of rs.entries()) if (i % 5 === 4) assert.equal(r.status, 409, 'agent B never holds the piece');
    assert.equal(await db.memoItem.count({ where: { tenantId: TID, pieceId: P } }), 1, 'one memo item for the piece');
    const p = await db.samplePiece.findUniqueOrThrow({ where: { id: P } });
    assert.deepEqual([p.custodianType, p.custodianShopId, p.custodySeq], ['SHOP', s.id, 3]);
    await invariants();
  });

  test('C2a. check-in ×20 on two visits of one agent (same key, new keys): exactly one open visit', async (t) => {
    const C = AG[2];
    await closeOpen(C);
    const [s1, s2] = [await shop(), await shop()];
    const [v1, v2] = [await plan(C, s1), await plan(C, s2)];
    const K = key();
    const ci = (v: string, s: J, h: Record<string, string>) => api(C.token, 'POST', `/v1/visits/${v}/check-in`, { lat: s.lat, lng: s.lng, accuracyM: 5 }, h);
    const rs = await Promise.all(Array.from({ length: N }, (_, i) => (i % 3 === 0 ? ci(v1, s1, K) : i % 3 === 1 ? ci(v1, s1, key()) : ci(v2, s2, key()))));
    report(t, 'C2a check-in', rs);
    const ok = rs.filter((r) => r.status === 200);
    assert.ok(ok.length >= 1);
    assert.equal(new Set(ok.map((r) => r.data.visit.id)).size, 1, 'every 200 is the same visit');
    assert.ok(rs.filter((r) => r.status !== 200).every((r) => r.status === 409 && ['ALREADY_CHECKED_IN', 'ANOTHER_VISIT_OPEN'].includes(r.error.code)), JSON.stringify(tally(rs)));
    assert.equal(await db.visit.count({ where: { tenantId: TID, agentId: C.id, status: { in: ['CHECKED_IN', 'ACTIVE'] } } }), 1);
    assert.equal(await count('visit.checked_in', { aggregateId: { in: [v1, v2] } }), 1);
    await invariants();
  });

  test('C2b. complete-visit races 9 orders and 10 memos on the same visit', async (t) => {
    const D = AG[3];
    const s = await shop();
    const v = await openVisit(D, s);
    const ps = await pieces(10, D);
    const reqs: Promise<J>[] = [];
    for (let i = 0; i < N; i++) {
      if (i === 10) reqs.push(later(40, () => api(D.token, 'POST', `/v1/visits/${v}/complete`, { summary: 'race' })));
      else if (i % 2 === 0) reqs.push(later(i * 4, () => order(D, v)));
      else {
        const p = ps.pop()!;
        reqs.push(later(i * 4, () => memo(D, v, [p])));
      }
    }
    const rs = await Promise.all(reqs);
    report(t, 'C2b complete vs sell', rs);
    assert.equal(rs[10].status, 200, JSON.stringify(rs[10].json));
    assert.ok(rs.every((r, i) => i === 10 || r.status === 201 || (r.status === 409 && r.error.code === 'VISIT_NOT_OPEN')), JSON.stringify(tally(rs)));
    const visit = await db.visit.findUniqueOrThrow({ where: { id: v } });
    assert.equal(visit.status, 'COMPLETED');
    const [orders, memos] = [await db.order.findMany({ where: { visitId: v } }), await db.memo.findMany({ where: { visitId: v } })];
    assert.equal(orders.length, rs.filter((r, i) => i !== 10 && i % 2 === 0 && r.status === 201).length);
    assert.equal(memos.length, rs.filter((r, i) => i !== 10 && i % 2 === 1 && r.status === 201).length);
    // Nothing was sold on the visit after it closed: the completion summary counts every order and memo on it.
    const done = await db.outboxEvent.findFirstOrThrow({ where: { tenantId: TID, type: 'visit.completed', aggregateId: v } });
    const d = (done.payload as J).data;
    assert.deepEqual([d.orderCount, d.memoCount, d.ordersValuePaise], [orders.length, memos.length, orders.reduce((a, o) => a + num(o.totalPaise), 0)]);
    await invariants();
  });

  test('C3. approve vs reject vs cancel vs settle ×20 on one PENDING_APPROVAL order, then on a memo-converted one', async (t) => {
    const E = AG[4];
    const s = await shop(1); // limit 1 paise: every order needs approval
    const v = await openVisit(E, s);
    const what = ['approve', 'reject', 'cancel', 'settle'] as const;
    const DECIDE = ['ORDER_ALREADY_DECIDED', 'ORDER_NOT_PENDING', 'ORDER_NOT_CANCELLABLE', 'ORDER_NOT_SETTLEABLE', 'ORDER_ALREADY_SETTLED'];
    /** Exactly one decision; a settle can only follow an approve, once; the settled event tells the real status. */
    const check = async (label: string, orderId: string) => {
      const rs = await Promise.all(Array.from({ length: N }, (_, i) => decide(orderId, what[i % 4])));
      report(t, label, rs);
      const final = await db.order.findUniqueOrThrow({ where: { id: orderId } });
      const settles = rs.filter((_, i) => i % 4 === 3 && rs[i].status === 200).length;
      assert.equal(settles, final.settledAt ? 1 : 0);
      if (settles) assert.equal(final.status, 'APPROVED');
      assert.equal(rs.filter((r) => r.status === 200).length, 1 + settles, JSON.stringify(tally(rs)));
      assert.ok(rs.filter((r) => r.status !== 200).every((r) => r.status === 409 && DECIDE.includes(r.error.code)), JSON.stringify(tally(rs)));
      const n = await count('order.approved', { aggregateId: orderId }) + (await count('order.rejected', { aggregateId: orderId })) + (await count('order.cancelled', { aggregateId: orderId }));
      assert.equal(n, 1, 'one decision event');
      const settled = await db.outboxEvent.findFirst({ where: { tenantId: TID, type: 'order.settled', aggregateId: orderId } });
      if (settled) assert.equal((settled.payload as J).data.status, final.status, 'order.settled carries the status the order had when it was settled');
      const audit = await db.auditLog.findFirst({ where: { tenantId: TID, action: 'order.settle', entityId: orderId } });
      if (audit) assert.equal((audit.before as J).status, 'APPROVED', 'settle audit before-image');
      return final;
    };
    const o = await order(E, v);
    assert.equal(o.data.order.status, 'PENDING_APPROVAL');
    await check('C3 plain order', o.data.order.id);

    // memo-converted: cancel is always refused; approve ‖ reject — reject un-sells exactly once.
    const [P] = await pieces(1, E);
    const m = await memo(E, v, [P]);
    assert.equal(m.status, 201, JSON.stringify(m.json));
    const c = await convert(E, m.data.memo.id, [P]);
    assert.equal(c.data.order.status, 'PENDING_APPROVAL', JSON.stringify(c.json));
    const final = await check('C3 converted order', c.data.order.id);
    const piece = await db.samplePiece.findUniqueOrThrow({ where: { id: P } });
    assert.equal(await db.custodyEvent.count({ where: { pieceId: P, reason: 'SALE_REJECTED' } }), final.status === 'REJECTED' ? 1 : 0);
    assert.equal(piece.custodianType, final.status === 'REJECTED' ? 'SHOP' : 'SOLD');
    await invariants();
  });

  test('C4. reject of a memo-converted pending order races converts of the same memo', async (t) => {
    const F = AG[5];
    const s = await shop(1);
    const v = await openVisit(F, s);
    const [A, B] = await pieces(2, F, K18);
    const m = await memo(F, v, [A, B]);
    assert.equal(m.status, 201, JSON.stringify(m.json));
    const memoId = m.data.memo.id;
    const o1 = await convert(F, memoId, [A]);
    assert.equal(o1.data.order.status, 'PENDING_APPROVAL', JSON.stringify(o1.json));
    const reqs = Array.from({ length: N }, (_, i) => (i === 7 ? decide(o1.data.order.id, 'reject') : i % 2 ? convert(F, memoId, [A]) : convert(F, memoId, [B])));
    const rs = await Promise.all(reqs);
    report(t, 'C4 reject vs convert', rs);
    assert.equal(rs[7].status, 200, JSON.stringify(rs[7].json));
    const convA = rs.filter((r, i) => i !== 7 && i % 2 === 1);
    const convB = rs.filter((r, i) => i !== 7 && i % 2 === 0);
    assert.equal(convB.filter((r) => r.status === 200).length, 1, 'B converts exactly once');
    assert.ok(convA.filter((r) => r.status === 200).length <= 1, 'A is re-sold at most once (only after the reject)');
    assert.ok([...convA, ...convB].every((r) => r.status === 200 || (r.status === 409 && ['PIECE_NOT_ON_MEMO', 'PIECE_NOT_AT_SHOP'].includes(r.error.code))), JSON.stringify(tally(rs)));
    const resold = convA.find((r) => r.status === 200);
    const pa = await db.samplePiece.findUniqueOrThrow({ where: { id: A } });
    const itemA = await db.memoItem.findFirstOrThrow({ where: { memoId, pieceId: A } });
    assert.deepEqual([pa.custodianType, itemA.status], resold ? ['SOLD', 'CONVERTED'] : ['SHOP', 'OUT']);
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: o1.data.order.id } })).status, 'REJECTED');
    await invariants();
  });

  test('C5. gold-rate changes during order booking: each order freezes exactly one rate per purity', async (t) => {
    const G = AG[6];
    const s = await shop();
    const vg = await openVisit(G, s);
    const items = [{ designId: K22.id, quantity: 2 }, { designId: K18.id, quantity: 1 }];
    const before = new Set((await db.goldRate.findMany({ where: { tenantId: TID } })).map((r) => r.id));
    const reqs = Array.from({ length: N }, (_, i) =>
      i % 5 === 2 || i % 5 === 4
        ? later(jitter(), () => api(OWNER, 'POST', '/v1/admin/gold-rates', { purity: i % 2 ? 'K18' : 'K22', ratePaisePerGram: (i % 2 ? 8_600_00 : 10_500_00) + i * 1_01 }))
        : later(jitter(), () => order(G, vg, items)),
    );
    const rs = await Promise.all(reqs);
    report(t, 'C5 rate vs booking', rs);
    assert.ok(rs.every((r) => r.status === 201), JSON.stringify(tally(rs)));
    const all = await db.goldRate.findMany({ where: { tenantId: TID } });
    assert.equal(all.length, before.size + 8, 'every rate change is one new row (append-only)');
    const ids = rs.filter((_, i) => !(i % 5 === 2 || i % 5 === 4)).map((r) => r.data.order.id);
    const used = new Set<string>();
    for (const id of ids) {
      const o = await db.order.findUniqueOrThrow({ where: { id } });
      const snap = o.goldRateSnapshot as J[];
      assert.deepEqual(snap.map((x) => x.purity).sort(), ['K18', 'K22']);
      for (const x of snap) used.add(x.goldRateId);
      const ev = await db.outboxEvent.findFirstOrThrow({ where: { tenantId: TID, type: 'order.created', aggregateId: id } });
      assert.deepEqual((ev.payload as J).data.goldRateSnapshot, snap, 'webhook carries the frozen snapshot');
    }
    t.diagnostic(`C5 distinct rates frozen across 12 orders: ${used.size}`);
    await invariants(); // lines reprice at their own frozen rate; totals via orderTotals
  });

  test('C6. credit-limit PATCHes during booking: every decision used one limit in force under the shop lock', async (t) => {
    const A = AG[1];
    const s = await shop(0);
    const va = await openVisit(A, s);
    const T = orderTotals([priceDesign({ netWeightMg: K22.netWeightMg, ratePaisePerGram: Number((await db.goldRate.findFirstOrThrow({ where: { tenantId: TID, purity: 'K22' }, orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }] })).ratePaisePerGram), makingChargeType: 'PER_GRAM', makingChargeValue: 650_00, stoneValuePaise: 1_234_50 }).unitPricePaise]).totalPaise;
    const limits = Array.from({ length: 8 }, (_, i) => T * (2 + i) + 7 * i + 1); // distinct
    assert.equal((await api(OWNER, 'PATCH', `/v1/admin/shops/${s.id}`, { creditLimitPaise: T * 3 })).status, 200);
    let li = 0;
    const reqs = Array.from({ length: N }, (_, i) => {
      if (i % 5 === 1 || i % 5 === 3) {
        const creditLimitPaise = limits[li++];
        return later(jitter(), () => api(OWNER, 'PATCH', `/v1/admin/shops/${s.id}`, { creditLimitPaise }));
      }
      return later(jitter(), () => order(A, va));
    });
    const rs = await Promise.all(reqs);
    report(t, 'C6 limit vs booking', rs);
    assert.ok(rs.every((r) => r.status === 200 || r.status === 201), JSON.stringify(tally(rs)));
    const inForce = new Set([T * 3, ...limits]);
    // Replay in shop-lock order (the ORD number is drawn under the shop lock): each decision saw every earlier one.
    const orders = await db.order.findMany({ where: { shopId: s.id }, orderBy: { number: 'asc' } });
    assert.equal(orders.length, 12);
    let live = 0;
    for (const o of orders) {
      const c = o.creditSnapshot as J;
      assert.ok(inForce.has(c.creditLimitPaise), `${o.number} used a limit that was never set: ${c.creditLimitPaise}`);
      assert.equal(c.unsettledOrdersPaise, live, `${o.number} did not see the orders committed before it`);
      if (o.status === 'CONFIRMED') {
        assert.ok(c.projectedExposurePaise <= c.creditLimitPaise, `${o.number} confirmed over its limit`);
        live += num(o.totalPaise);
      }
    }
    t.diagnostic(`C6 orders: ${orders.filter((o) => o.status === 'CONFIRMED').length} confirmed / ${orders.filter((o) => o.status === 'PENDING_APPROVAL').length} pending, ${new Set(orders.map((o) => (o.creditSnapshot as J).creditLimitPaise)).size} distinct limits seen`);
    // The shop's audit trail is a chain: each limit change starts from the value the previous one left.
    const audits = await db.auditLog.findMany({ where: { tenantId: TID, action: 'shop.update', entityId: s.id } });
    const befores = audits.map((a) => (a.before as J).creditLimitPaise);
    const afters = audits.map((a) => (a.after as J).creditLimitPaise);
    t.diagnostic(`C6 audit before-images: ${befores.length} rows, ${new Set(befores).size} distinct`);
    assert.equal(new Set(befores).size, befores.length, 'two limit changes claim the same before-value (stale audit read)');
    for (const b of befores) assert.ok(b === 0 || afters.includes(b), 'audit before-value was never an after-value');
    await invariants();
  });

  test('C7. the retailer QR confirm ×10 and the agent OTP verify ×10 acknowledge one memo once', async (t) => {
    const C = AG[2];
    const s = await shop();
    const v = await openVisit(C, s);
    const ps = await pieces(2, C);
    const m = await memo(C, v, ps);
    assert.equal(m.status, 201, JSON.stringify(m.json));
    const token = String(m.data.ack.url).split('/ack/')[1];
    const view = await api(null, 'GET', `/v1/public/memo-ack/${token}`);
    assert.equal(view.status, 200, JSON.stringify(view.json));
    const code = view.data.code;
    const rs = await Promise.all(
      Array.from({ length: N }, (_, i) => (i % 2 ? api(null, 'POST', `/v1/public/memo-ack/${token}`, { confirm: true }) : api(C.token, 'POST', `/v1/memos/${m.data.memo.id}/ack/verify`, { code }))),
    );
    report(t, 'C7 ack', rs);
    assert.ok(rs.every((r) => r.status === 200), JSON.stringify(tally(rs)));
    const row = await db.memo.findUniqueOrThrow({ where: { id: m.data.memo.id } });
    assert.equal(row.ackStatus, 'ACKNOWLEDGED');
    assert.equal(await count('memo.acknowledged', { aggregateId: row.id }), 1);
    assert.equal(await db.auditLog.count({ where: { tenantId: TID, action: 'memo.ack', entityId: row.id } }), 1);
    t.diagnostic(`C7 winner: ${row.ackMethod}`);
    await invariants();
  });

  test('C8. one refresh token presented ×20 at once: one successor, grace once, then the family is revoked', async (t) => {
    const R = AG[7];
    const before = await db.refreshToken.count({ where: { userId: R.id } });
    const rs = await Promise.all(Array.from({ length: N }, () => api(null, 'POST', '/v1/auth/refresh', { refreshToken: R.refreshToken })));
    report(t, 'C8 refresh', rs);
    assert.deepEqual(tally(rs), { '200': 2, '401 INVALID_REFRESH_TOKEN': 18 });
    const ok = rs.filter((r) => r.status === 200);
    assert.equal(ok[0].data.refreshToken, ok[1].data.refreshToken, 'grace returns the SAME successor');
    assert.equal(await db.refreshToken.count({ where: { userId: R.id } }), before + 1, 'exactly one successor minted');
    const rows = await db.refreshToken.findMany({ where: { userId: R.id } });
    assert.equal(rows.filter((r) => r.graceUsedAt).length, 1, 'grace spent once');
    assert.equal(rows.filter((r) => !r.revokedAt).length, 0, 'theft revoked every live token of the user');
    assert.equal((await api(null, 'POST', '/v1/auth/refresh', { refreshToken: ok[0].data.refreshToken })).status, 401);
  });

  test('C9. webhook dispatch ×20 across two API instances: each due delivery attempted once per due time', async (t) => {
    // Receiver: counts sends per delivery id and the most concurrent sends of one id.
    let mode: 'fail' | 'ok' = 'fail';
    const hits = new Map<string, number>();
    const inflight = new Map<string, number>();
    let maxInflight = 0;
    const srv: Server = createServer((req, res) => {
      const id = String(req.headers['x-jewelroute-delivery']);
      req.resume();
      req.on('end', () => {
        if (mode === 'fail') {
          res.writeHead(500).end('nope');
          return;
        }
        hits.set(id, (hits.get(id) ?? 0) + 1);
        inflight.set(id, (inflight.get(id) ?? 0) + 1);
        maxInflight = Math.max(maxInflight, inflight.get(id)!);
        setTimeout(() => {
          inflight.set(id, inflight.get(id)! - 1);
          res.writeHead(200).end('ok');
        }, 250);
      });
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    const port = (srv.address() as { port: number }).port;
    const PORT2 = PORT + 1000;
    let second: ChildProcess | undefined;
    try {
      const ep = await api(OWNER, 'POST', '/v1/admin/webhooks', { url: `http://127.0.0.1:${port}/hook`, events: ['sample.custody_changed'] });
      assert.equal(ep.status, 201, JSON.stringify(ep.json));
      const endpointId = ep.data.endpoint.id;
      const ids = await pieces(10);
      for (const id of ids) assert.equal((await api(OWNER, 'POST', '/v1/admin/pieces/issue', { pieceIds: [id], agentId: AG[6].id })).status, 200);
      // Attempt 1 happens post-commit and fails (500) → FAILED, next attempt in 30 s.
      const where = { endpointId };
      for (let i = 0; i < 100; i++) {
        const ds = await db.webhookDelivery.findMany({ where });
        if (ds.length === 10 && ds.every((d) => d.attempts === 1 && !d.lockedUntil)) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      const first = await db.webhookDelivery.findMany({ where });
      assert.equal(first.length, 10);
      assert.ok(first.every((d) => d.status === 'FAILED' && d.attempts === 1), JSON.stringify(first.map((d) => [d.status, d.attempts])));
      // A second API process on the same database (another serverless instance).
      second = spawn(process.execPath, ['dist/main.js'], { cwd: join(__dirname, '..'), env: { ...ENV, PORT: String(PORT2), DATABASE_URL: `${ENV.DATABASE_URL}?connection_limit=4` }, stdio: ['ignore', 'ignore', 'inherit'] });
      for (let i = 0; i < 100; i++) {
        if (await fetch(`http://127.0.0.1:${PORT2}/v1/health`).then((r) => r.ok).catch(() => false)) break;
        await new Promise((r) => setTimeout(r, 150));
      }
      mode = 'ok';
      await db.webhookDelivery.updateMany({ where, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
      const fire = (base: string) => fetch(`${base}/v1/internal/dispatch`, { method: 'POST', headers: { 'x-cron-secret': ENV.CRON_SECRET!, 'content-type': 'application/json' }, body: '{}' }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
      const rs = await Promise.all(Array.from({ length: N }, (_, i) => fire(i % 2 ? `http://127.0.0.1:${PORT2}` : BASE)));
      report(t, 'C9 dispatch', rs as J);
      assert.ok(rs.every((r) => r.status === 200), JSON.stringify(rs.map((r) => r.status)));
      const after = await db.webhookDelivery.findMany({ where });
      for (const d of after) {
        assert.deepEqual([d.status, d.attempts], ['SUCCEEDED', 2], `delivery ${d.id}`);
        assert.equal(await db.webhookAttempt.count({ where: { deliveryId: d.id } }), d.attempts, 'attempts == WebhookAttempt rows');
        assert.equal(hits.get(d.id), 1, `delivery ${d.id} sent ${hits.get(d.id)}× in one due window`);
      }
      t.diagnostic(`C9 receiver: ${[...hits.values()].reduce((a, b) => a + b, 0)} sends for ${after.length} due deliveries, max concurrent per delivery ${maxInflight}`);
      assert.equal(maxInflight, 1, 'no duplicate concurrent sends');
    } finally {
      srv.close();
      if (second && second.exitCode === null) {
        const exited = new Promise((r) => second!.once('exit', r));
        second.kill('SIGTERM');
        await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
      }
    }
    await invariants();
  });
});
