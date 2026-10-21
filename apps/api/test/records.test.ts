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
  test('R1. order, memo and piece records carry their own activity (older than the workspace feed)', async () => {
    // order: created (+ decision) events whose aggregate is the order
    const pending = (await api(ADMIN, 'GET', '/v1/admin/orders?status=SUBMITTED')).data[0];
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
    // make two more SUBMITTED orders through the API
    const t = (await api(RAHUL, 'GET', '/v1/field/today')).data;
    const v = t.visits.find((x: J) => x.status === 'PLANNED');
    const shop = await db.shop.findUniqueOrThrow({ where: { id: v.shop.id } });
    assert.equal((await api(RAHUL, 'POST', `/v1/visits/${v.id}/check-in`, { lat: shop.lat, lng: shop.lng, accuracyM: 5 }, { 'Idempotency-Key': randomUUID() })).status, 200);
    await uploadProof(RAHUL, v.id, shop.lat, shop.lng);
    const design = await db.jewelryDesign.findFirstOrThrow({ where: { tenantId: AURUM, active: true, purity: 'K22' } });
    const mk = async () => (await api(RAHUL, 'POST', '/v1/orders', { visitId: v.id, items: [{ designId: design.id, quantity: 1 }] }, { 'Idempotency-Key': randomUUID() })).data.order;
    const [o1, o2, o3] = [await mk(), await mk(), await mk()];
    // The already-decided fixture is this test's own order, approved here — never "some APPROVED order"
    // (that could be the one R1 approved seconds ago and carry a fresh audit row).
    assert.equal((await api(ADMIN, 'POST', `/v1/admin/orders/${o3.id}/approve`)).status, 200);
    const decided = await db.order.findUniqueOrThrow({ where: { id: o3.id } });
    assert.equal(decided.status, 'APPROVED');
    const auditBefore = await db.auditLog.count({ where: { entityId: decided.id } });
    const eventsBefore = await db.outboxEvent.count({ where: { aggregateId: decided.id } });
    const r = await api(ADMIN, 'POST', '/v1/admin/orders/approve', { orderIds: [o1.id, 'nope-not-an-order', decided.id, o2.id, o1.id] });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual(
      r.data.results.map((x: J) => [x.id, x.ok, x.error?.code]),
      [
        [o1.id, true, undefined],
        ['nope-not-an-order', false, 'NOT_FOUND'],
        [decided.id, false, 'ORDER_ALREADY_DECIDED'],
        [o2.id, true, undefined],
      ],
    );
    assert.equal(r.data.approved, 2);
    assert.equal(r.data.failed, 2);
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
});
