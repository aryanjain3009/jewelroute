import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createServer, IncomingMessage } from 'node:http';
import { AddressInfo } from 'node:net';
import { addDays, istDate } from '@jewelroute/shared';
import bcrypt from 'bcryptjs';
import { api, db, dispatch, J, login, north, start, stop, uploadProof } from './harness';

const TODAY = istDate();
let ADMIN: string;
let RAHUL: string;
let rahulId: string;
let sharma: J;
let sharmaVisitId: string;

before(async () => {
  await start();
  ADMIN = await login('admin@aurum.test', 'Aurum@2026');
  RAHUL = await login('rahul@aurum.test', 'Rahul@2026');
  const today = await api(RAHUL, 'GET', '/v1/field/today');
  rahulId = today.data.agent.id;
  const v = today.data.visits.find((x: J) => x.shop.name === 'Sharma Jewellers');
  sharmaVisitId = v.id;
  sharma = v.shop;
});
after(stop);

const key = () => ({ 'Idempotency-Key': randomUUID() });

describe('field flow invariants', () => {
  test('1. concurrent double check-in → exactly one succeeds', async () => {
    const gps = { lat: north(sharma.lat, 20), lng: sharma.lng, accuracyM: 10 };
    const rs = await Promise.all(Array.from({ length: 5 }, () => api(RAHUL, 'POST', `/v1/visits/${sharmaVisitId}/check-in`, gps, key())));
    const okCount = rs.filter((r) => r.status === 200).length;
    assert.equal(okCount, 1, JSON.stringify(rs.map((r) => [r.status, r.error?.code])));
    for (const r of rs.filter((r) => r.status !== 200)) assert.equal(r.error.code, 'ALREADY_CHECKED_IN');
    const v = await db.visit.findUniqueOrThrow({ where: { id: sharmaVisitId } });
    assert.equal(v.status, 'CHECKED_IN');
    assert.equal(v.verification, 'VERIFIED');
  });

  test('1c. no selling before the arrival photo: order and memo → 409 PROOF_REQUIRED_BEFORE_SALE, nothing moves; resume agrees', async () => {
    // Sharma is CHECKED_IN (test 1) with no proof yet.
    const d = (await api(RAHUL, 'GET', `/v1/visits/${sharmaVisitId}`)).data;
    assert.equal(d.proofs.length, 0);
    assert.equal(d.resume.nextStep, 'UPLOAD_PROOF');
    assert.equal(d.resume.canSell, false, 'canSell must agree with nextStep');
    assert.equal(d.resume.canComplete, false);
    const design = await db.jewelryDesign.findFirstOrThrow({ where: { tenant: { slug: 'aurum' }, active: true, purity: 'K22' } });
    const ok = randomUUID();
    const o = await api(RAHUL, 'POST', '/v1/orders', { visitId: sharmaVisitId, items: [{ designId: design.id, quantity: 1 }] }, { 'Idempotency-Key': ok });
    assert.equal(o.status, 409, JSON.stringify(o.json));
    assert.equal(o.error.code, 'PROOF_REQUIRED_BEFORE_SALE');
    assert.equal(await db.order.count({ where: { visitId: sharmaVisitId } }), 0);
    assert.equal(await db.idempotencyKey.count({ where: { key: ok } }), 0, 'refusal rolls the key back');
    const piece = await db.samplePiece.findFirstOrThrow({ where: { custodianAgentId: rahulId } });
    const m = await api(RAHUL, 'POST', '/v1/memos', { visitId: sharmaVisitId, pieceIds: [piece.id], dueDate: addDays(TODAY, 3) }, key());
    assert.equal(m.status, 409, JSON.stringify(m.json));
    assert.equal(m.error.code, 'PROOF_REQUIRED_BEFORE_SALE');
    const after = await db.samplePiece.findUniqueOrThrow({ where: { id: piece.id } });
    assert.equal(after.custodianType, 'AGENT');
    assert.equal(after.custodySeq, piece.custodySeq, 'custody did not move');
    assert.equal(await db.memo.count({ where: { visitId: sharmaVisitId } }), 0);
    const noProof = await api(RAHUL, 'POST', `/v1/visits/${sharmaVisitId}/complete`, {});
    assert.equal(noProof.error.code, 'PROOF_REQUIRED');
    // the photo unlocks selling
    await uploadProof(RAHUL, sharmaVisitId, sharma.lat, sharma.lng);
    const d2 = (await api(RAHUL, 'GET', `/v1/visits/${sharmaVisitId}`)).data;
    assert.equal(d2.resume.nextStep, 'SELL_OR_COMPLETE');
    assert.equal(d2.resume.canSell, true);
  });

  test('1b. one open visit per agent: concurrent check-ins at two different shops → one wins (partial unique index)', async () => {
    const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: 'aurum' } });
    const agent = await db.user.create({ data: { tenantId: tenant.id, name: 'Race Agent', email: `race-${Date.now()}@aurum.test`, role: 'FIELD_AGENT', passwordHash: await bcrypt.hash('Race@2026x', 4) } });
    const shops = await db.shop.findMany({ where: { tenantId: tenant.id, name: { in: ['Royal Gems', 'Kapoor & Sons'] } } });
    const visits = await Promise.all(shops.map((s, i) => api(ADMIN, 'POST', '/v1/admin/assignments', { agentId: agent.id, shopId: s.id, date: TODAY, sequence: i + 1 })));
    const T = await login(agent.email, 'Race@2026x');
    const rs = await Promise.all(visits.map((v, i) => api(T, 'POST', `/v1/visits/${v.data.visit.id}/check-in`, { lat: shops[i].lat, lng: shops[i].lng, accuracyM: 5 }, key())));
    assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409]);
    assert.equal(rs.find((r) => r.status === 409)!.error.code, 'ANOTHER_VISIT_OPEN');
    assert.equal(await db.visit.count({ where: { agentId: agent.id, status: { in: ['CHECKED_IN', 'ACTIVE'] } } }), 1);
  });

  test('2. check-in outside the geofence is rejected server-side', async () => {
    const today = await api(RAHUL, 'GET', '/v1/field/today');
    const gupta = today.data.visits.find((x: J) => x.shop.name === 'Gupta Gold House');
    const r = await api(RAHUL, 'POST', `/v1/visits/${gupta.id}/check-in`, { lat: north(gupta.shop.lat, 450), lng: gupta.shop.lng, accuracyM: 500 }, key());
    assert.equal(r.status, 409);
    assert.equal(r.error.code, 'OUTSIDE_GEOFENCE');
    assert.ok(r.error.details.distanceM > 400 && r.error.details.radiusM === 100);
    // accuracy slack is capped at 50 m, so a terrible fix cannot widen the fence
    const geo = await api(RAHUL, 'POST', `/v1/visits/${gupta.id}/geofence-check`, { lat: north(gupta.shop.lat, 160), lng: gupta.shop.lng, accuracyM: 900 });
    assert.equal(geo.data.inside, false);
    // simulated check-ins are refused when the tenant is not in demo mode
    await db.tenant.update({ where: { slug: 'aurum' }, data: { demoMode: false } });
    const sim = await api(RAHUL, 'POST', `/v1/visits/${gupta.id}/check-in`, { lat: 0, lng: 0, accuracyM: 0, simulated: true }, key());
    await db.tenant.update({ where: { slug: 'aurum' }, data: { demoMode: true } });
    assert.equal(sim.status, 403);
    assert.equal(sim.error.code, 'SIMULATION_NOT_ALLOWED');
  });

  let orderId: string;
  test('3. concurrent POST /v1/orders with the same Idempotency-Key → one order, same response', async () => {
    const cat = await api(RAHUL, 'GET', `/v1/visits/${sharmaVisitId}/catalog?purity=K22`);
    const items = cat.data.designs.slice(0, 2).map((d: J) => ({ designId: d.id, quantity: 2 }));
    const k = randomUUID();
    const rs = await Promise.all(Array.from({ length: 6 }, () => api(RAHUL, 'POST', '/v1/orders', { visitId: sharmaVisitId, items }, { 'Idempotency-Key': k })));
    assert.ok(rs.every((r) => r.status === 201), JSON.stringify(rs.map((r) => [r.status, r.error])));
    const ids = new Set(rs.map((r) => r.data.order.id));
    assert.equal(ids.size, 1);
    for (const r of rs) assert.deepEqual(r.data, rs[0].data);
    assert.equal(await db.order.count({ where: { clientOpId: k } }), 1);
    orderId = rs[0].data.order.id;
    const reuse = await api(RAHUL, 'POST', '/v1/orders', { visitId: sharmaVisitId, items: items.slice(0, 1) }, { 'Idempotency-Key': k });
    assert.equal(reuse.status, 422);
    assert.equal(reuse.error.code, 'IDEMPOTENCY_KEY_REUSED');
  });

  test('4. two concurrent memos for the same piece → one succeeds, the other 409', async () => {
    const bag = await api(ADMIN, 'GET', `/v1/admin/pieces?custodianType=AGENT&agentId=${rahulId}`);
    const piece = bag.data[0];
    const body = { visitId: sharmaVisitId, pieceIds: [piece.id], dueDate: addDays(TODAY, 5) };
    const rs = await Promise.all([api(RAHUL, 'POST', '/v1/memos', body, key()), api(RAHUL, 'POST', '/v1/memos', body, key()), api(RAHUL, 'POST', '/v1/memos', body, key())]);
    const statuses = rs.map((r) => r.status).sort();
    assert.deepEqual(statuses, [201, 409, 409], JSON.stringify(rs.map((r) => [r.status, r.error?.code])));
    assert.ok(rs.filter((r) => r.status === 409).every((r) => ['PIECE_NOT_IN_YOUR_CUSTODY', 'PIECE_ALREADY_ON_MEMO'].includes(r.error.code)));
    assert.equal(await db.memoItem.count({ where: { pieceId: piece.id, status: 'OUT' } }), 1);
  });

  test('5. memo moves custody agent → shop with custody events; return moves it back', async () => {
    const bag = await api(ADMIN, 'GET', `/v1/admin/pieces?custodianType=AGENT&agentId=${rahulId}`);
    const [p1, p2] = bag.data;
    const seq0 = p1.custodySeq;
    const m = await api(RAHUL, 'POST', '/v1/memos', { visitId: sharmaVisitId, pieceIds: [p1.id, p2.id], dueDate: addDays(TODAY, 5) }, key());
    assert.equal(m.status, 201, JSON.stringify(m.json));
    const after1 = await db.samplePiece.findUniqueOrThrow({ where: { id: p1.id } });
    assert.equal(after1.custodianType, 'SHOP');
    assert.equal(after1.custodianShopId, sharma.id);
    assert.equal(after1.custodianAgentId, null);
    assert.equal(after1.custodySeq, seq0 + 1);
    const ev = await db.custodyEvent.findMany({ where: { pieceId: p1.id }, orderBy: { seq: 'asc' } });
    assert.deepEqual(ev.map((e) => e.seq), ev.map((_, i) => i + 1), 'gap-free seq');
    assert.equal(ev.at(-1)!.reason, 'MEMO_HANDOVER');
    assert.equal(await db.outboxEvent.count({ where: { type: 'sample.custody_changed', payload: { path: ['data', 'memoId'], equals: m.data.memo.id } } }), 1);
    // partial return → PARTIALLY_RETURNED, then full → RETURNED
    const r1 = await api(RAHUL, 'POST', `/v1/memos/${m.data.memo.id}/return`, { pieceIds: [p1.id] }, key());
    assert.equal(r1.status, 200, JSON.stringify(r1.json));
    assert.equal(r1.data.memo.status, 'PARTIALLY_RETURNED');
    const back = await db.samplePiece.findUniqueOrThrow({ where: { id: p1.id } });
    assert.equal(back.custodianType, 'AGENT');
    assert.equal(back.custodianAgentId, rahulId);
    assert.equal(back.custodySeq, seq0 + 2);
    const again = await api(RAHUL, 'POST', `/v1/memos/${m.data.memo.id}/return`, { pieceIds: [p1.id] }, key());
    assert.equal(again.error.code, 'PIECE_NOT_ON_MEMO');
    const r2 = await api(RAHUL, 'POST', `/v1/memos/${m.data.memo.id}/return`, { pieceIds: [p2.id] }, key());
    assert.equal(r2.data.memo.status, 'RETURNED');
    const hist = await api(ADMIN, 'GET', `/v1/admin/pieces/${p1.id}/history`);
    assert.deepEqual(hist.data.events.slice(-2).map((e: J) => e.reason), ['MEMO_HANDOVER', 'MEMO_RETURN']);
    // DB-level invariant: the custodian columns must match the custodian type
    await assert.rejects(db.$executeRaw`UPDATE "SamplePiece" SET "custodianType" = 'SHOP' WHERE id = ${p1.id}`);
  });

  test('6. cross-tenant access returns 404', async () => {
    const other = await db.tenant.upsert({ where: { slug: 'other' }, create: { slug: 'other', name: 'Other Co', demoMode: false }, update: {} });
    const email = `boss-${Date.now()}@other.test`;
    await db.user.create({ data: { tenantId: other.id, name: 'Other Boss', email, role: 'ADMIN', passwordHash: await bcrypt.hash('Other@2026x', 4) } });
    const OTHER = await login(email, 'Other@2026x');
    assert.equal((await api(OTHER, 'GET', `/v1/visits/${sharmaVisitId}`)).status, 404);
    assert.equal((await api(OTHER, 'GET', `/v1/admin/orders/${orderId}`)).status, 404);
    assert.equal((await api(OTHER, 'POST', `/v1/admin/orders/${orderId}/approve`)).status, 404);
    assert.equal((await api(OTHER, 'GET', `/v1/admin/pieces/${(await db.samplePiece.findFirstOrThrow()).id}/history`)).status, 404);
    const list = await api(OTHER, 'GET', '/v1/admin/orders');
    assert.equal(list.data.length, 0);
    // tenantId in the body is ignored — the token decides
    const rate = await api(OTHER, 'POST', '/v1/admin/gold-rates', { purity: 'K22', ratePaisePerGram: 999900, tenantId: (await db.tenant.findUniqueOrThrow({ where: { slug: 'aurum' } })).id });
    assert.equal(rate.status, 201);
    assert.equal((await db.goldRate.findUniqueOrThrow({ where: { id: rate.data.rate.goldRateId } })).tenantId, other.id);
    // an agent cannot read another agent's visit in the same tenant
    const arjunVisit = await db.visit.findFirstOrThrow({ where: { agent: { email: 'arjun@aurum.test' } } });
    assert.equal((await api(RAHUL, 'GET', `/v1/visits/${arjunVisit.id}`)).status, 404);
    // agents cannot use admin routes
    assert.equal((await api(RAHUL, 'GET', '/v1/admin/dashboard')).status, 403);
  });

  test('7. webhook signature verifies with the documented scheme; failing endpoint backs off FAILED→…→DEAD after 1 + 6 retries', async () => {
    const got: { headers: IncomingMessage['headers']; body: string }[] = [];
    const srv = createServer((req, res) => {
      let b = '';
      req.on('data', (c) => (b += c));
      req.on('end', () => {
        got.push({ headers: req.headers, body: b });
        res.writeHead(200).end('ok');
      });
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
    const port = (srv.address() as AddressInfo).port;
    try {
      const good = await api(ADMIN, 'POST', '/v1/admin/webhooks', { url: `http://127.0.0.1:${port}/hook`, events: ['memo.extended'] });
      const bad = await api(ADMIN, 'POST', '/v1/admin/webhooks', { url: `http://127.0.0.1:${process.env.TEST_PORT ?? 4107}/v1/dev/webhook-receiver/fail-${Date.now()}`, events: ['memo.extended'] });
      assert.match(good.data.secret, /^whsec_/);
      const memo = await db.memo.findFirstOrThrow({ where: { status: 'ACTIVE', tenant: { slug: 'aurum' } } });
      const ext = await api(ADMIN, 'POST', `/v1/admin/memos/${memo.id}/extend`, { dueDate: addDays(TODAY, 20), reason: 'test' });
      assert.equal(ext.status, 200, JSON.stringify(ext.json));
      for (let i = 0; i < 40 && got.length === 0; i++) {
        await dispatch();
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.equal(got.length, 1);
      const h = got[0].headers;
      const expected = `sha256=${createHmac('sha256', good.data.secret).update(`${h['x-jewelroute-timestamp']}.${got[0].body}`).digest('hex')}`;
      assert.equal(h['x-jewelroute-signature'], expected);
      assert.equal(h['x-jewelroute-event'], 'memo.extended');
      assert.equal(h['user-agent'], 'JewelRoute-Webhooks/1.0');
      const payload = JSON.parse(got[0].body);
      assert.match(payload.id, /^evt_/);
      assert.equal(payload.tenantId, 'aurum');
      assert.equal(payload.type, 'memo.extended');

      // Failing endpoint: walk the backoff ladder by fast-forwarding nextAttemptAt.
      const ladder = [30, 120, 600, 1800, 7200, 21600];
      const bid = bad.data.endpoint.id;
      let d = await db.webhookDelivery.findFirst({ where: { endpointId: bid } });
      for (let i = 0; i < 40 && (!d || d.attempts < 1); i++) {
        await dispatch();
        d = await db.webhookDelivery.findFirst({ where: { endpointId: bid } });
      }
      for (let attempt = 1; attempt <= 7; attempt++) {
        d = await db.webhookDelivery.findFirstOrThrow({ where: { endpointId: bid } });
        assert.equal(d.attempts, attempt);
        if (attempt < 7) {
          assert.equal(d.status, 'FAILED');
          assert.equal(d.lastStatusCode, 500);
          const last = await db.webhookAttempt.findFirstOrThrow({ where: { deliveryId: d.id, attemptNo: attempt } });
          const delay = (d.nextAttemptAt.getTime() - last.createdAt.getTime()) / 1000;
          assert.ok(Math.abs(delay - ladder[attempt - 1]) < 3, `attempt ${attempt}: delay ${delay}s`);
          await db.webhookDelivery.update({ where: { id: d.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
          await dispatch();
        } else {
          assert.equal(d.status, 'DEAD');
        }
      }
      assert.equal(await db.webhookAttempt.count({ where: { deliveryId: d!.id } }), 7);
      // A failing receiver accepted nothing, so it records nothing (never a "Signature verified" row for a failed delivery).
      assert.equal(await db.receivedWebhook.count({ where: { endpointId: bid } }), 0, 'failed deliveries leave no received rows');
      // manual retry from DEAD → attempts immediately again
      const retry = await api(ADMIN, 'POST', `/v1/admin/webhooks/deliveries/${d!.id}/retry`);
      assert.equal(retry.data.delivery.attempts, 8);
      const detail = await api(ADMIN, 'GET', `/v1/admin/webhooks/deliveries/${d!.id}`);
      const rh = detail.data.attemptLog[0].requestHeaders;
      assert.match(rh['X-JewelRoute-Signature'], /^sha256=[a-f0-9]{64}$/);
      assert.equal(rh['X-JewelRoute-Delivery'], d!.id);
      assert.ok(!JSON.stringify(detail.data).includes('whsec_'), 'secret never exposed');
      // test ping to the good endpoint is delivered synchronously
      const ping = await api(ADMIN, 'POST', `/v1/admin/webhooks/${good.data.endpoint.id}/test`);
      assert.equal(ping.data.delivery.status, 'SUCCEEDED');
      assert.equal(ping.data.delivery.eventType, 'ping');
    } finally {
      srv.close();
    }
  });

  test('7b. demo receiver is honest: bad signature → 401 + signatureOk:false; unknown token → 404, nothing stored; list filters by endpoint; gated by env/demo mode', async () => {
    const BASE_URL = `http://127.0.0.1:${process.env.TEST_PORT ?? 4107}`;
    const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: 'aurum' } });
    // the SEEDED receiver (token demo-…): test 7 adds a fail-… receiver to the same tenant, and an unordered lookup could pick it (→ 500)
    const builtIn = await db.webhookEndpoint.findFirstOrThrow({ where: { tenantId: tenant.id, url: { contains: '/v1/dev/webhook-receiver/demo-' } }, orderBy: { createdAt: 'asc' } });
    const token = builtIn.url.split('/').pop()!;
    const post = (tok: string, sig: string) =>
      fetch(`${BASE_URL}/v1/dev/webhook-receiver/${tok}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-jewelroute-timestamp': String(Math.floor(Date.now() / 1000)), 'x-jewelroute-signature': sig, 'x-jewelroute-event': 'ping', 'x-jewelroute-delivery': `dlv_test_${randomUUID()}` }, body: JSON.stringify({ id: `evt_${randomUUID()}`, type: 'ping' }) });
    const before = await db.receivedWebhook.count();
    const unknown = await post(`nope-${Date.now()}`, 'sha256=00');
    assert.equal(unknown.status, 404);
    assert.equal(await db.receivedWebhook.count(), before, 'unknown token stores nothing');
    const bad = await post(token, `sha256=${'0'.repeat(64)}`);
    assert.equal(bad.status, 401);
    const badRow = await db.receivedWebhook.findFirstOrThrow({ where: { endpointId: builtIn.id }, orderBy: { receivedAt: 'desc' } });
    assert.equal(badRow.signatureOk, false, 'invalid signature is recorded as invalid');
    // GET received?endpointId= only lists that endpoint's rows
    const other = await api(ADMIN, 'POST', '/v1/admin/webhooks', { url: `${BASE_URL}/v1/dev/webhook-receiver/other-${Date.now()}`, events: ['memo.extended'] });
    assert.equal((await api(ADMIN, 'POST', `/v1/admin/webhooks/${other.data.endpoint.id}/test`)).data.delivery.status, 'SUCCEEDED');
    const onlyBuiltIn = (await api(ADMIN, 'GET', `/v1/admin/webhooks/received?endpointId=${builtIn.id}`)).data;
    assert.ok(onlyBuiltIn.length >= 1 && onlyBuiltIn.every((r: J) => r.endpointId === builtIn.id));
    const onlyOther = (await api(ADMIN, 'GET', `/v1/admin/webhooks/received?endpointId=${other.data.endpoint.id}`)).data;
    assert.equal(onlyOther.length, 1);
    assert.equal(onlyOther[0].signatureOk, true);
    // gating: explicit flag wins; unset → on outside production, else only for demo-mode tenants
    const { demoReceiverEnabled } = await import('../src/webhooks/demo-receiver');
    assert.equal(demoReceiverEnabled({ flag: 'false', nodeEnv: 'development', demoMode: true }), false);
    assert.equal(demoReceiverEnabled({ flag: 'true', nodeEnv: 'production', demoMode: false }), true);
    assert.equal(demoReceiverEnabled({ flag: undefined, nodeEnv: 'development', demoMode: false }), true);
    assert.equal(demoReceiverEnabled({ flag: undefined, nodeEnv: 'production', demoMode: false }), false);
    assert.equal(demoReceiverEnabled({ flag: undefined, nodeEnv: 'production', demoMode: true }), true);
  });

  test('8. order pricing snapshot is unchanged after a gold-rate update (and is append-only in the DB)', async () => {
    const before = await api(RAHUL, 'GET', `/v1/orders/${orderId}`);
    const k22 = before.data.order.goldRateSnapshot.find((s: J) => s.purity === 'K22');
    const set = await api(ADMIN, 'POST', '/v1/admin/gold-rates', { purity: 'K22', ratePaisePerGram: k22.ratePaisePerGram + 25_000 });
    assert.equal(set.status, 201);
    const afterOrder = await api(RAHUL, 'GET', `/v1/orders/${orderId}`);
    assert.deepEqual(afterOrder.data.order.items, before.data.order.items);
    assert.equal(afterOrder.data.order.totalPaise, before.data.order.totalPaise);
    const cat = await api(RAHUL, 'GET', `/v1/visits/${sharmaVisitId}/catalog?purity=K22`);
    assert.equal(cat.data.rates.find((r: J) => r.purity === 'K22').ratePaisePerGram, k22.ratePaisePerGram + 25_000, 'new orders would use the new rate');
    await assert.rejects(db.$executeRaw`UPDATE "OrderItem" SET "unitPricePaise" = 1 WHERE "orderId" = ${orderId}`, /append-only/);
    await assert.rejects(db.$executeRaw`DELETE FROM "GoldRate" WHERE id = ${set.data.rate.goldRateId}`, /append-only/);
    await assert.rejects(db.$executeRaw`UPDATE "CustodyEvent" SET seq = seq + 100`, /append-only/);
  });

  test('9. order decisions are one-shot and audited; a loser sees the real current status and who decided', async () => {
    // v3: only PENDING_APPROVAL orders are decided. A normal (₹3–5L) order at Sharma is CONFIRMED and refuses a decision.
    const k22 = await db.jewelryDesign.findFirstOrThrow({ where: { tenant: { slug: 'aurum' }, active: true, sku: 'AJ-BNG-2201' } });
    const small = (await api(RAHUL, 'POST', '/v1/orders', { visitId: sharmaVisitId, items: [{ designId: k22.id, quantity: 1 }] }, key())).data.order;
    assert.equal(small.status, 'CONFIRMED', JSON.stringify(small.approval));
    const normal = await api(ADMIN, 'POST', `/v1/admin/orders/${small.id}/approve`);
    assert.equal(normal.status, 409);
    assert.equal(normal.error.code, 'ORDER_NOT_PENDING');
    // Threshold 1 paisa → every new order needs approval (restored to the seeded ₹10L at the end).
    assert.equal((await api(ADMIN, 'PATCH', '/v1/admin/settings', { approvalThresholdPaise: 1 })).status, 200);
    try {
      await decisions();
    } finally {
      await api(ADMIN, 'PATCH', '/v1/admin/settings', { approvalThresholdPaise: 100_000_000 });
    }
  });
});

async function decisions() {
  {
    const design0 = await db.jewelryDesign.findFirstOrThrow({ where: { tenant: { slug: 'aurum' }, active: true, purity: 'K22' } });
    const orderId = (await api(RAHUL, 'POST', '/v1/orders', { visitId: sharmaVisitId, items: [{ designId: design0.id, quantity: 1 }] }, key())).data.order.id;
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status, 'PENDING_APPROVAL');
    const a = await api(ADMIN, 'POST', `/v1/admin/orders/${orderId}/approve`);
    assert.equal(a.data.order.status, 'APPROVED');
    const twice = await Promise.all([api(ADMIN, 'POST', `/v1/admin/orders/${orderId}/approve`), api(ADMIN, 'POST', `/v1/admin/orders/${orderId}/reject`, { reason: 'x' })]);
    assert.ok(twice.every((r) => r.status === 409 && r.error.code === 'ORDER_ALREADY_DECIDED'));
    for (const r of twice) {
      assert.equal(r.error.details.status, 'APPROVED');
      assert.equal(r.error.details.decidedBy.name, 'Priya Mehta');
      assert.match(r.error.message, /already approved/i);
    }
    assert.equal(await db.auditLog.count({ where: { entityId: orderId, action: 'order.approve' } }), 1);
    // a real race: approve vs reject on a fresh PENDING_APPROVAL order, repeated. The loser always reports the winner's status.
    const design = await db.jewelryDesign.findFirstOrThrow({ where: { tenant: { slug: 'aurum' }, active: true, purity: 'K22' } });
    for (let i = 0; i < 5; i++) {
      const o = (await api(RAHUL, 'POST', '/v1/orders', { visitId: sharmaVisitId, items: [{ designId: design.id, quantity: 1 }] }, key())).data.order;
      const rs = await Promise.all([api(ADMIN, 'POST', `/v1/admin/orders/${o.id}/approve`), api(ADMIN, 'POST', `/v1/admin/orders/${o.id}/reject`, { reason: 'race' })]);
      const win = rs.find((r) => r.status === 200)!;
      const lose = rs.find((r) => r.status === 409)!;
      assert.ok(win && lose, JSON.stringify(rs.map((r) => r.status)));
      assert.equal(lose.error.details.status, win.data.order.status, `loser saw ${lose.error.details.status}, winner wrote ${win.data.order.status}`);
      assert.equal((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status, win.data.order.status);
    }
  }
}
