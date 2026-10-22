/* Sales-surface record gaps (docs/API_ISSUES.md #7–#10): per-record activity, where an agent-held
 * piece is, cursor-paged delivery log, batch order approval. Fresh seed for this file. */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { api, db, dispatch, J, login, start, stop, uploadProof } from './harness';

let ADMIN: string;
let RAHUL: string;
let AURUM: string;

before(async () => {
  await start();
  ADMIN = await login('admin@aurum.test', 'Aurum@2026');
  RAHUL = await login('rahul@aurum.test', 'Rahul@2026');
  AURUM = (await db.tenant.findUniqueOrThrow({ where: { slug: 'aurum' } })).id;
});
after(stop);

describe('record activity, piece location, delivery paging, batch approve', () => {
  test('R0. seeded orders are priced from a rate row that was already in force when they were booked', async () => {
    // Before 10:00 IST the seed's "today" rate used to be stamped with the seed time, after the morning's orders.
    const orders = await db.order.findMany({ where: { tenantId: AURUM }, include: { items: true } });
    const rates = new Map((await db.goldRate.findMany({ where: { tenantId: AURUM } })).map((r) => [r.id, r.effectiveFrom]));
    assert.ok(orders.length > 0, 'seed has orders');
    for (const o of orders) {
      for (const s of o.goldRateSnapshot as { effectiveFrom: string }[]) {
        assert.ok(new Date(s.effectiveFrom) <= o.createdAt, `${o.number}: snapshot rate effective ${s.effectiveFrom} after booking ${o.createdAt.toISOString()}`);
      }
      for (const it of o.items) assert.ok(rates.get(it.goldRateId)! <= o.createdAt, `${o.number}: line rate row effective after booking`);
    }
  });
  test('R0c. endpoint stats split "not delivered" into retrying and dead letter (same words as the delivery rows)', async () => {
    const ep = (await api(ADMIN, 'POST', '/v1/admin/webhooks', { url: 'http://127.0.0.1:9/r0c-hook', events: ['memo.extended'] })).data.endpoint;
    const d = (await api(ADMIN, 'POST', `/v1/admin/webhooks/${ep.id}/test`)).data.delivery;
    assert.equal(d.status, 'FAILED', 'unreachable endpoint → retrying');
    const stats = async () => (await api(ADMIN, 'GET', '/v1/admin/webhooks')).data.find((e: J) => e.id === ep.id).stats;
    let s = await stats();
    assert.deepEqual([s.succeeded24h, s.failed24h, s.retrying24h, s.dead24h], [0, 1, 1, 0]);
    await db.webhookDelivery.update({ where: { id: d.id }, data: { status: 'DEAD' } });
    s = await stats();
    assert.deepEqual([s.succeeded24h, s.failed24h, s.retrying24h, s.dead24h], [0, 1, 0, 1], 'failed24h stays the sum');
    assert.equal((await api(ADMIN, 'DELETE', `/v1/admin/webhooks/${ep.id}`)).status, 200);
  });
  test('R1. order, memo and piece records carry their own activity (older than the workspace feed)', async () => {
    // order: created (+ decision) events whose aggregate is the order
    const pending = (await api(ADMIN, 'GET', '/v1/admin/orders?status=PENDING_APPROVAL')).data[0];
    let rec = (await api(ADMIN, 'GET', `/v1/admin/orders/${pending.id}`)).data;
    assert.ok(Array.isArray(rec.activity));
    assert.ok(rec.activity.some((a: J) => a.type === 'order.created' && a.entity.id === pending.id), JSON.stringify(rec.activity));
    assert.ok(rec.activity.every((a: J) => /^evt_/.test(a.id) && a.title && a.createdAt));
    assert.equal((await api(ADMIN, 'POST', `/v1/admin/orders/${pending.id}/approve`)).status, 200);
    rec = (await api(ADMIN, 'GET', `/v1/admin/orders/${pending.id}`)).data;
    assert.ok(rec.activity.some((a: J) => a.type === 'order.approved'));
    const foreign = await db.outboxEvent.count({ where: { tenantId: AURUM, aggregateType: 'Order', aggregateId: pending.id } });
    assert.equal(rec.activity.length, foreign, 'only events of this order');

    // memo: created + custody handover (payload memoId)
    const memo = (await api(ADMIN, 'GET', '/v1/admin/memos?filter=active')).data[0];
    const mrec = (await api(ADMIN, 'GET', `/v1/admin/memos/${memo.id}`)).data;
    assert.ok(mrec.activity.some((a: J) => a.type === 'memo.created' && a.entity.id === memo.id));
    assert.ok(mrec.activity.some((a: J) => a.type === 'sample.custody_changed'), 'handover custody event references the memo');
    const ids = mrec.activity.map((a: J) => a.id);
    const rows = await db.outboxEvent.findMany({ where: { id: { in: ids } } });
    for (const r of rows) {
      const d = (r.payload as J).data;
      assert.ok(r.aggregateId === memo.id || d.memoId === memo.id || d.sourceMemoId === memo.id, `${r.type} does not reference the memo`);
    }

    // piece: every custody event of the piece is in its activity, newest first
    const piece = await db.samplePiece.findFirstOrThrow({ where: { tenantId: AURUM, tagCode: 'AJ-S-000123' } });
    const prec = (await api(ADMIN, 'GET', `/v1/admin/pieces/${piece.id}`)).data;
    const evIds = (await db.custodyEvent.findMany({ where: { pieceId: piece.id, outboxEventId: { not: null } } })).map((e) => e.outboxEventId);
    assert.ok(evIds.length >= 1);
    for (const e of evIds) assert.ok(prec.activity.some((a: J) => a.id === e), `custody event ${e} missing`);
    const times = prec.activity.map((a: J) => a.createdAt);
    assert.deepEqual(times, [...times].sort().reverse());
  });

  test('R2. a piece held by an agent says where it is: open visit → last check-in → field bag', async () => {
    const arjun = await db.user.findFirstOrThrow({ where: { email: 'arjun@aurum.test' } });
    const arjunBag = (await api(ADMIN, 'GET', `/v1/admin/pieces?agentId=${arjun.id}`)).data;
    assert.ok(arjunBag.length > 0);
    for (const p of arjunBag) {
      assert.equal(p.location.kind, 'IN_VISIT', JSON.stringify(p.location));
      assert.equal(p.location.shop.name, 'Royal Gems');
      assert.equal(typeof p.location.lat, 'number');
      assert.equal(typeof p.location.lng, 'number');
      assert.ok(p.location.visitId && p.location.label.includes('Royal Gems'));
    }
    // Rahul has no open visit at seed time, but has checked in before
    const rahul = await db.user.findFirstOrThrow({ where: { email: 'rahul@aurum.test' } });
    await db.visit.updateMany({ where: { agentId: rahul.id, status: { in: ['CHECKED_IN', 'ACTIVE'] } }, data: { status: 'COMPLETED', completedAt: new Date() } });
    const last = await db.visit.findFirstOrThrow({ where: { agentId: rahul.id, checkInAt: { not: null } }, orderBy: { checkInAt: 'desc' }, include: { shop: true } });
    const p123 = await db.samplePiece.findFirstOrThrow({ where: { tenantId: AURUM, tagCode: 'AJ-S-000123' } });
    const rec = (await api(ADMIN, 'GET', `/v1/admin/pieces/${p123.id}`)).data;
    assert.equal(rec.piece.status, 'WITH_AGENT');
    assert.equal(rec.piece.location.kind, 'LAST_CHECK_IN');
    assert.equal(rec.piece.location.shop.id, last.shopId);
    assert.match(rec.piece.location.label, new RegExp(`^With Rahul Verma · last check-in ${last.shop.name} \\d{1,2} [A-Z][a-z]{2}, \\d{1,2}:\\d{2} (am|pm)$`));
    // a brand-new agent who never checked in
    const stamp = Date.now();
    const agent = (await api(ADMIN, 'POST', '/v1/admin/agents', { name: 'Fresh Agent', email: `fresh-${stamp}@aurum.test`, password: 'FreshAgent@1' })).data.agent;
    const vault = (await api(ADMIN, 'GET', '/v1/admin/pieces?status=IN_VAULT')).data[0];
    assert.equal(vault.location, undefined, 'vault pieces have no field location');
    assert.equal((await api(ADMIN, 'POST', '/v1/admin/pieces/issue', { pieceIds: [vault.id], agentId: agent.id })).status, 200);
    const fresh = (await api(ADMIN, 'GET', `/v1/admin/pieces/${vault.id}`)).data.piece;
    assert.deepEqual(fresh.location, { kind: 'FIELD_BAG', label: 'In field bag' });
  });

  test('R3. delivery log: bare array without paging params; cursor pages with no gaps or overlap', async () => {
    await dispatch();
    const bare = await api(ADMIN, 'GET', '/v1/admin/webhooks/deliveries');
    assert.equal(bare.status, 200);
    assert.ok(Array.isArray(bare.data) && bare.data.length >= 3, `deliveries: ${bare.data?.length}`);
    const total = await db.webhookDelivery.count({ where: { tenantId: AURUM } });
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const r = await api(ADMIN, 'GET', `/v1/admin/webhooks/deliveries?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
      assert.equal(r.status, 200, JSON.stringify(r.json));
      assert.ok(Array.isArray(r.data.items) && r.data.items.length <= 2);
      seen.push(...r.data.items.map((d: J) => d.id));
      cursor = r.data.nextCursor;
      pages++;
    } while (cursor && pages < 500);
    assert.equal(seen.length, total);
    assert.equal(new Set(seen).size, total, 'no overlap');
    if (total <= 100) assert.deepEqual(seen, bare.data.map((d: J) => d.id), 'same order as the bare list');
    const first = await api(ADMIN, 'GET', '/v1/admin/webhooks/deliveries?limit=50');
    assert.ok(first.data.items.length <= 50);
    assert.equal((await api(ADMIN, 'GET', '/v1/admin/webhooks/deliveries?limit=201')).status, 400);
    assert.equal((await api(ADMIN, 'GET', '/v1/admin/webhooks/deliveries?cursor=bm9wZQ')).status, 400);
  });

  test('R4. batch approve: per-order results, each order its own transaction, audited, one order.approved each', async () => {
    // make three more orders through the API
    const t = (await api(RAHUL, 'GET', '/v1/field/today')).data;
    const v = t.visits.find((x: J) => x.status === 'PLANNED');
    const shop = await db.shop.findUniqueOrThrow({ where: { id: v.shop.id } });
    assert.equal((await api(RAHUL, 'POST', `/v1/visits/${v.id}/check-in`, { lat: shop.lat, lng: shop.lng, accuracyM: 5 }, { 'Idempotency-Key': randomUUID() })).status, 200);
    await uploadProof(RAHUL, v.id, shop.lat, shop.lng);
    const design = await db.jewelryDesign.findFirstOrThrow({ where: { tenantId: AURUM, active: true, purity: 'K22' } });
    const mk = async () => (await api(RAHUL, 'POST', '/v1/orders', { visitId: v.id, items: [{ designId: design.id, quantity: 1 }] }, { 'Idempotency-Key': randomUUID() })).data.order;
    // v3: make them PENDING_APPROVAL (threshold 1 paisa), plus one CONFIRMED that batch approve must refuse.
    const normal = await mk();
    assert.equal(normal.status, 'CONFIRMED');
    await api(ADMIN, 'PATCH', '/v1/admin/settings', { approvalThresholdPaise: 1 });
    let o1: J, o2: J, o3: J;
    try {
      [o1, o2, o3] = [await mk(), await mk(), await mk()];
    } finally {
      await api(ADMIN, 'PATCH', '/v1/admin/settings', { approvalThresholdPaise: 100_000_000 });
    }
    assert.ok([o1, o2, o3].every((o) => o.status === 'PENDING_APPROVAL'));
    // The already-decided fixture is this test's own order, approved here — never "some APPROVED order"
    // (that could be the one R1 approved seconds ago and carry a fresh audit row).
    assert.equal((await api(ADMIN, 'POST', `/v1/admin/orders/${o3.id}/approve`)).status, 200);
    const decided = await db.order.findUniqueOrThrow({ where: { id: o3.id } });
    assert.equal(decided.status, 'APPROVED');
    const auditBefore = await db.auditLog.count({ where: { entityId: decided.id } });
    const eventsBefore = await db.outboxEvent.count({ where: { aggregateId: decided.id } });
    const r = await api(ADMIN, 'POST', '/v1/admin/orders/approve', { orderIds: [o1.id, 'nope-not-an-order', decided.id, o2.id, o1.id, normal.id] });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual(
      r.data.results.map((x: J) => [x.id, x.ok, x.error?.code]),
      [
        [o1.id, true, undefined],
        ['nope-not-an-order', false, 'NOT_FOUND'],
        [decided.id, false, 'ORDER_ALREADY_DECIDED'],
        [o2.id, true, undefined],
        [normal.id, false, 'ORDER_NOT_PENDING'],
      ],
    );
    assert.equal(r.data.approved, 2);
    assert.equal(r.data.failed, 3);
    for (const o of [o1, o2]) {
      const row = await db.order.findUniqueOrThrow({ where: { id: o.id } });
      assert.equal(row.status, 'APPROVED');
      assert.ok(row.decidedById && row.decidedAt);
      assert.equal(await db.auditLog.count({ where: { entityId: o.id, action: 'order.approve' } }), 1);
      assert.equal(await db.outboxEvent.count({ where: { aggregateId: o.id, type: 'order.approved' } }), 1);
    }
    assert.equal(await db.auditLog.count({ where: { entityId: decided.id } }), auditBefore, 'failed rows leave no audit');
    assert.equal(await db.outboxEvent.count({ where: { aggregateId: decided.id } }), eventsBefore, 'failed rows emit no event');
    assert.match(r.data.results[2].error.message, /already approved/i, 'the failure names the real status');
    // validation + auth
    assert.equal((await api(ADMIN, 'POST', '/v1/admin/orders/approve', { orderIds: [] })).status, 400);
    assert.equal((await api(RAHUL, 'POST', '/v1/admin/orders/approve', { orderIds: [o1.id] })).status, 403);
  });
  test('R6. admin orders: bare list without paging params; limit/cursor pages with no gaps or overlap, filters kept', async () => {
    const bare = await api(ADMIN, 'GET', '/v1/admin/orders');
    assert.equal(bare.status, 200);
    assert.ok(Array.isArray(bare.data) && bare.data.length >= 3, `orders: ${bare.data?.length}`);
    const total = await db.order.count({ where: { tenantId: AURUM } });
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const r = await api(ADMIN, 'GET', `/v1/admin/orders?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
      assert.equal(r.status, 200, JSON.stringify(r.json));
      assert.ok(Array.isArray(r.data.items) && r.data.items.length <= 2);
      seen.push(...r.data.items.map((o: J) => o.id));
      cursor = r.data.nextCursor;
      pages++;
    } while (cursor && pages < 500);
    assert.equal(seen.length, total);
    assert.equal(new Set(seen).size, total, 'no overlap');
    assert.deepEqual(seen, bare.data.map((o: J) => o.id), 'same order as the bare list (createdAt, then id, newest first)');
    const pending = await api(ADMIN, 'GET', '/v1/admin/orders?status=PENDING_APPROVAL&limit=1');
    assert.ok(pending.data.items.every((o: J) => o.status === 'PENDING_APPROVAL'));
    assert.equal((await api(ADMIN, 'GET', '/v1/admin/orders?limit=201')).status, 400);
    assert.equal((await api(ADMIN, 'GET', '/v1/admin/orders?cursor=bm9wZQ')).status, 400);
  });

  test('R5. shop PATCH: null clears owner and phone, opening balance is editable, omitted fields are untouched', async () => {
    const shop = await db.shop.findFirstOrThrow({ where: { name: 'Sharma Jewellers' } });
    const r = await api(ADMIN, 'PATCH', `/v1/admin/shops/${shop.id}`, { ownerName: null, phone: null, openingOutstandingPaise: 12_345_00 });
    assert.equal(r.status, 200);
    const after = await db.shop.findUniqueOrThrow({ where: { id: shop.id } });
    assert.equal(after.ownerName, null);
    assert.equal(after.phone, null);
    assert.equal(after.openingOutstandingPaise, 1_234_500n);
    assert.equal(after.creditLimitPaise, shop.creditLimitPaise, 'omitted credit limit unchanged');
    assert.equal(after.city, shop.city, 'omitted city unchanged');
    assert.equal((await api(ADMIN, 'PATCH', `/v1/admin/shops/${shop.id}`, { openingOutstandingPaise: -1 })).status, 400);
  });
});

describe('hot-path indexes (docs/overnight/EXPLAIN.md)', () => {
  /** Plan with seq scans, sorts and bitmap scans priced out: any index the planner can use, it will — so a missing index shows up even on a small table. */
  const plan = (sql: (tx: J) => Promise<{ 'QUERY PLAN': string }[]>) =>
    db.$transaction(async (tx) => {
      // Fresh statistics: right after a reseed the planner can think Order has 1 row and pick any tenant index.
      await tx.$executeRaw`ANALYZE "Order", "MemoExtension"`;
      await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
      // On a few dozen rows a sort is cheaper than any index; price sorts and bitmap scans out too, so the plan
      // answers "can an index serve this?" (a missing index still shows up as a Sort).
      await tx.$executeRaw`SET LOCAL enable_sort = off`;
      await tx.$executeRaw`SET LOCAL enable_bitmapscan = off`;
      return (await sql(tx)).map((r) => r['QUERY PLAN']).join('\n');
    });

  test('X1. the admin order list (tenant, newest first) and memo extensions by memo read an index, not the whole table', async () => {
    const orders = await plan((tx) => tx.$queryRaw`EXPLAIN SELECT id FROM "Order" WHERE "tenantId" = ${AURUM} ORDER BY "createdAt" DESC LIMIT 500`);
    assert.match(orders, /Order_tenantId_createdAt_idx/, orders);
    assert.doesNotMatch(orders, /Sort/, 'newest-first comes from the index, not a sort of every order');
    const ext = await plan((tx) => tx.$queryRaw`EXPLAIN SELECT id FROM "MemoExtension" WHERE "memoId" = ANY(${['m1', 'm2']}::text[])`);
    assert.match(ext, /MemoExtension_memoId_idx/, ext);
  });

  test("X2. every shop row's lastOrder is that shop's newest order (createdAt, then id)", async () => {
    const rows = (await api(ADMIN, 'GET', '/v1/admin/shops')).data as J[];
    assert.ok(rows.length > 1);
    const orders = await db.order.findMany({ where: { tenantId: AURUM }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, shopId: true } });
    assert.ok(new Set(orders.map((o) => o.shopId)).size < orders.length, 'some shop has several orders');
    for (const r of rows) assert.equal(r.lastOrder?.id, orders.find((o) => o.shopId === r.id)?.id, r.name);
  });
});
