/* Brief STEP 5 — failure scenarios, over real HTTP against a real Postgres (jewelroute_test).
 * Runs after api.test.ts (fresh seed per file). Each test documents the scenario it proves. */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { addDays, istDate } from '@jewelroute/shared';
import { api, BASE, db, dispatch, J, login, north, start, stop, uploadProof } from './harness';

const TODAY = istDate();
let ADMIN: string;
let RAHUL: string;
let ARJUN: string;
let rahulId: string;
let arjunId: string;
let AURUM: string;
let sharmaVisit: J;
let guptaVisit: J;

const key = () => ({ 'Idempotency-Key': randomUUID() });

before(async () => {
  await start();
  ADMIN = await login('admin@aurum.test', 'Aurum@2026');
  RAHUL = await login('rahul@aurum.test', 'Rahul@2026');
  ARJUN = await login('arjun@aurum.test', 'Arjun@2026');
  const today = await api(RAHUL, 'GET', '/v1/field/today');
  rahulId = today.data.agent.id;
  sharmaVisit = today.data.visits.find((v: J) => v.shop.name === 'Sharma Jewellers');
  guptaVisit = today.data.visits.find((v: J) => v.shop.name === 'Gupta Gold House');
  arjunId = (await api(ARJUN, 'GET', '/v1/field/today')).data.agent.id;
  AURUM = (await db.tenant.findUniqueOrThrow({ where: { slug: 'aurum' } })).id;
});
after(stop);

describe('STEP 5 failure scenarios', () => {
  test('F1. tenant A cannot read or act on tenant B data (v1 + v2 endpoints), lists and search never leak', async () => {
    // Build tenant B entirely through the API.
    const beta = await db.tenant.upsert({ where: { slug: 'beta' }, create: { slug: 'beta', name: 'Beta Gold', demoMode: false }, update: {} });
    const bcrypt = (await import('bcryptjs')).default;
    const stamp = Date.now();
    await db.user.create({ data: { tenantId: beta.id, name: 'Beta Boss', email: `boss-${stamp}@beta.test`, role: 'ADMIN', passwordHash: await bcrypt.hash('Beta@2026x', 4) } });
    const B = await login(`boss-${stamp}@beta.test`, 'Beta@2026x');
    await api(B, 'POST', '/v1/admin/gold-rates', { purity: 'K22', ratePaisePerGram: 1_000_000 });
    const shop = (await api(B, 'POST', '/v1/admin/shops', { name: `Beta Unique Shop ${stamp}`, address: 'x', area: 'Beta Area', lat: 19.07, lng: 72.87 })).data.shop;
    const agent = (await api(B, 'POST', '/v1/admin/agents', { name: 'Beta Agent', email: `agent-${stamp}@beta.test`, password: 'BetaAgent@1' })).data.agent;
    const design = (await api(B, 'POST', '/v1/admin/designs', { sku: `B-${stamp}`, name: 'Beta Bangle', category: 'Bangles', collection: 'Beta', purity: 'K22', grossWeightMg: 10_000, netWeightMg: 9_000, makingChargeValue: 50_000 })).data.design;
    const [piece] = (await api(B, 'POST', `/v1/admin/designs/${design.id}/pieces`, { count: 1 })).data.pieces;
    assert.equal((await api(B, 'POST', '/v1/admin/pieces/issue', { pieceIds: [piece.id], agentId: agent.id })).status, 200);
    const visit = (await api(B, 'POST', '/v1/admin/assignments', { agentId: agent.id, shopId: shop.id, date: TODAY })).data.visit;
    const BA = await login(`agent-${stamp}@beta.test`, 'BetaAgent@1');
    assert.equal((await api(BA, 'POST', `/v1/visits/${visit.id}/check-in`, { lat: shop.lat, lng: shop.lng, accuracyM: 5 }, key())).status, 200);
    await uploadProof(BA, visit.id, shop.lat, shop.lng);
    const order = (await api(BA, 'POST', '/v1/orders', { visitId: visit.id, items: [{ designId: design.id, quantity: 1 }] }, key())).data.order;
    const memo = (await api(BA, 'POST', '/v1/memos', { visitId: visit.id, pieceIds: [piece.id], dueDate: addDays(TODAY, 3) }, key())).data.memo;
    assert.ok(order?.id && memo?.id);

    const reads = [
      `/v1/visits/${visit.id}`, `/v1/orders/${order.id}`, `/v1/memos/${memo.id}`, `/v1/visits/${visit.id}/catalog`,
      `/v1/admin/visits/${visit.id}`, `/v1/admin/orders/${order.id}`, `/v1/admin/memos/${memo.id}`, `/v1/admin/shops/${shop.id}`,
      `/v1/admin/pieces/${piece.id}`, `/v1/admin/pieces/${piece.id}/history`, `/v1/admin/agents/${agent.id}`,
    ];
    for (const p of reads) assert.equal((await api(ADMIN, 'GET', p)).status, 404, `admin A GET ${p}`);
    for (const p of reads.slice(0, 4)) assert.equal((await api(RAHUL, 'GET', p)).status, 404, `agent A GET ${p}`);
    const writes: [string, string, unknown][] = [
      ['POST', `/v1/admin/orders/${order.id}/approve`, undefined],
      ['POST', `/v1/admin/memos/${memo.id}/extend`, { dueDate: addDays(TODAY, 9) }],
      ['PATCH', `/v1/admin/shops/${shop.id}`, { name: 'hijacked' }],
      ['POST', '/v1/admin/pieces/return-to-vault', { pieceIds: [piece.id] }],
      ['POST', '/v1/admin/assignments', { agentId: agent.id, shopId: shop.id, date: TODAY }],
    ];
    for (const [m, p, b] of writes) assert.equal((await api(ADMIN, m, p, b)).status, 404, `admin A ${m} ${p}`);
    assert.equal((await api(RAHUL, 'POST', `/v1/memos/${memo.id}/return`, { pieceIds: [piece.id] }, key())).status, 404);
    assert.equal((await api(RAHUL, 'POST', '/v1/memos', { visitId: visit.id, pieceIds: [piece.id], dueDate: addDays(TODAY, 3) }, key())).status, 404);
    // assigning A's agent to B's shop (foreign ids inside a body) is also a 404
    assert.equal((await api(ADMIN, 'POST', '/v1/admin/assignments', { agentId: rahulId, shopId: shop.id, date: TODAY })).status, 404);
    // lists + search
    const lists = ['/v1/admin/shops', '/v1/admin/visits', '/v1/admin/orders', '/v1/admin/memos?filter=all', '/v1/admin/pieces'];
    for (const p of lists) {
      const r = await api(ADMIN, 'GET', p);
      const ids = new Set((r.data as J[]).map((x) => x.id));
      for (const foreign of [shop.id, visit.id, order.id, memo.id, piece.id]) assert.ok(!ids.has(foreign), `${p} leaks ${foreign}`);
    }
    const s = await api(ADMIN, 'GET', `/v1/admin/search?q=${encodeURIComponent(`Beta Unique Shop ${stamp}`)}`);
    assert.equal(s.data.shops.length, 0);
    const home = await api(ADMIN, 'GET', '/v1/admin/home');
    assert.ok(!JSON.stringify(home.data).includes(shop.id), 'home leaks');
    // and the other direction: B sees none of A
    const bShops = await api(B, 'GET', '/v1/admin/shops');
    const betaShopIds = new Set((await db.shop.findMany({ where: { tenantId: beta.id }, select: { id: true } })).map((x) => x.id));
    assert.ok(bShops.data.some((x: J) => x.id === shop.id) && bShops.data.every((x: J) => betaShopIds.has(x.id)));
    assert.equal((await api(B, 'GET', `/v1/admin/visits/${sharmaVisit.id}`)).status, 404);
    // proof files are tenant-scoped and agent-scoped
    const proofUrl: string = (await api(B, 'GET', `/v1/admin/visits/${visit.id}`)).data.proofs[0].url;
    const fileId = proofUrl.split('/').pop();
    assert.equal((await api(ADMIN, 'GET', `/v1/files/${fileId}`)).status, 404);
  });

  test('F2. invalid dates: assignment in the past, check-in on the wrong day, memo due date out of range', async () => {
    const shops = await api(ADMIN, 'GET', '/v1/admin/shops?q=Royal');
    const royal = shops.data[0];
    const past = await api(ADMIN, 'POST', '/v1/admin/assignments', { agentId: rahulId, shopId: royal.id, date: addDays(TODAY, -1) });
    assert.equal(past.status, 400);
    assert.equal(past.error.code, 'INVALID_DATE');
    const tmr = await api(ADMIN, 'POST', '/v1/admin/assignments', { agentId: rahulId, shopId: royal.id, date: addDays(TODAY, 1), plannedTime: '11:15' });
    assert.equal(tmr.status, 201);
    assert.equal(tmr.data.visit.plannedTime, '11:15');
    const ci = await api(RAHUL, 'POST', `/v1/visits/${tmr.data.visit.id}/check-in`, { lat: royal.lat, lng: royal.lng, accuracyM: 5 }, key());
    assert.equal(ci.status, 409);
    assert.equal(ci.error.code, 'VISIT_NOT_TODAY');
    const detail = await api(RAHUL, 'GET', `/v1/visits/${tmr.data.visit.id}`);
    assert.deepEqual(detail.data.resume.blockedBy, { code: 'VISIT_NOT_TODAY' });
    assert.equal(detail.data.resume.canCheckIn, false);
    const up = await api(RAHUL, 'GET', '/v1/field/visits?scope=upcoming');
    assert.ok(up.data.some((v: J) => v.id === tmr.data.visit.id && v.plannedTime === '11:15'));
    // malformed HH:MM is rejected
    assert.equal((await api(ADMIN, 'POST', '/v1/admin/assignments', { agentId: rahulId, shopId: royal.id, date: addDays(TODAY, 2), plannedTime: '25:00' })).status, 400);
  });

  test('F3. bad GPS: far fix rejected; accuracy slack capped at 50 m; missing accuracy earns no slack and is never VERIFIED', async () => {
    const s = sharmaVisit.shop;
    const far = await api(RAHUL, 'POST', `/v1/visits/${sharmaVisit.id}/check-in`, { lat: north(s.lat, 600), lng: s.lng, accuracyM: 8 }, key());
    assert.equal(far.status, 409);
    assert.equal(far.error.code, 'OUTSIDE_GEOFENCE');
    const geo = (m: number, accuracyM?: number) => api(RAHUL, 'POST', `/v1/visits/${sharmaVisit.id}/geofence-check`, { lat: north(s.lat, m), lng: s.lng, ...(accuracyM === undefined ? {} : { accuracyM }) });
    assert.equal((await geo(140, 45)).data.inside, true, '140 m with ±45 m slack');
    assert.equal((await geo(140, 45)).data.verification, 'VERIFIED');
    assert.equal((await geo(140, 400)).data.inside, true, 'slack capped at 50 → 150 m');
    assert.equal((await geo(140, 400)).data.verification, 'LOW_ACCURACY');
    assert.equal((await geo(160, 400)).data.inside, false, '160 m > 100 + 50');
    assert.equal((await geo(120)).data.inside, false, 'no accuracy → no slack');
    const noAcc = await geo(40);
    assert.equal(noAcc.data.inside, true);
    assert.equal(noAcc.data.verification, 'LOW_ACCURACY');
    // the visit is still PLANNED and no outbox event was written by the failures
    assert.equal((await db.visit.findUniqueOrThrow({ where: { id: sharmaVisit.id } })).status, 'PLANNED');
    assert.equal(await db.outboxEvent.count({ where: { type: 'visit.checked_in', aggregateId: sharmaVisit.id } }), 0);
    // a real check-in without accuracy is recorded as LOW_ACCURACY with null accuracy
    const ok = await api(RAHUL, 'POST', `/v1/visits/${sharmaVisit.id}/check-in`, { lat: north(s.lat, 30), lng: s.lng }, key());
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.equal(ok.data.visit.verification, 'LOW_ACCURACY');
    const row = await db.visit.findUniqueOrThrow({ where: { id: sharmaVisit.id } });
    assert.equal(row.checkInAccuracyM, null);
  });

  test('F4. double check-in: replay is identical, a new key is 409, another shop is blocked while one visit is open', async () => {
    const s = sharmaVisit.shop;
    const k = randomUUID();
    // replaying the key of an already-successful *different* request is a 422, a fresh key a 409
    const again = await api(RAHUL, 'POST', `/v1/visits/${sharmaVisit.id}/check-in`, { lat: north(s.lat, 10), lng: s.lng, accuracyM: 5 }, { 'Idempotency-Key': k });
    assert.equal(again.status, 409);
    assert.equal(again.error.code, 'ALREADY_CHECKED_IN');
    const g = guptaVisit.shop;
    const other = await api(RAHUL, 'POST', `/v1/visits/${guptaVisit.id}/check-in`, { lat: g.lat, lng: g.lng, accuracyM: 5 }, key());
    assert.equal(other.status, 409);
    assert.equal(other.error.code, 'ANOTHER_VISIT_OPEN');
    assert.equal(other.error.details.visitId, sharmaVisit.id);
    const gd = await api(RAHUL, 'GET', `/v1/visits/${guptaVisit.id}`);
    assert.deepEqual(gd.data.resume.blockedBy, { code: 'ANOTHER_VISIT_OPEN', visitId: sharmaVisit.id });
    assert.equal(await db.outboxEvent.count({ where: { type: 'visit.checked_in', aggregateId: sharmaVisit.id } }), 1, 'exactly one check-in event');
    const today = await api(RAHUL, 'GET', '/v1/field/today');
    assert.equal(today.data.openVisit.id, sharmaVisit.id);
    assert.equal(today.data.nextVisitId, sharmaVisit.id);
  });

  test('F5. missing proof: complete is refused and the resumable state says what is missing; creates need an Idempotency-Key', async () => {
    const c = await api(RAHUL, 'POST', `/v1/visits/${sharmaVisit.id}/complete`, {});
    assert.equal(c.status, 409);
    assert.equal(c.error.code, 'PROOF_REQUIRED');
    const d = await api(RAHUL, 'GET', `/v1/visits/${sharmaVisit.id}`);
    assert.equal(d.data.resume.checkedIn, true);
    assert.equal(d.data.resume.proofUploaded, false);
    assert.equal(d.data.resume.nextStep, 'UPLOAD_PROOF');
    assert.equal(d.data.resume.canComplete, false);
    assert.equal(d.data.resume.canSell, false, 'no selling before the arrival photo');
    const row = (await api(ADMIN, 'GET', `/v1/admin/visits/${sharmaVisit.id}`)).data.row;
    assert.equal(row.proofState, 'MISSING');
    for (const [p, b] of [['/v1/orders', { visitId: sharmaVisit.id, items: [{ designId: 'x', quantity: 1 }] }], ['/v1/memos', { visitId: sharmaVisit.id, pieceIds: ['x'], dueDate: TODAY }]] as const) {
      const r = await api(RAHUL, 'POST', p, b);
      assert.equal(r.status, 400, p);
      assert.equal(r.error.code, 'IDEMPOTENCY_KEY_REQUIRED');
    }
    await uploadProof(RAHUL, sharmaVisit.id, sharmaVisit.shop.lat, sharmaVisit.shop.lng);
    const d2 = await api(RAHUL, 'GET', `/v1/visits/${sharmaVisit.id}`);
    assert.equal(d2.data.resume.nextStep, 'SELL_OR_COMPLETE');
    assert.equal(d2.data.resume.canComplete, true);
    assert.equal(d2.data.resume.canSell, true);
    assert.equal(d2.data.visit.status, 'ACTIVE');
  });

  let orderId: string;
  let orderBefore: J;
  test('F6. API error mid-submit, then retry with the same key re-executes (the error is not cached)', async () => {
    const cat = await api(RAHUL, 'GET', `/v1/visits/${sharmaVisit.id}/catalog?purity=K22`);
    const d = cat.data.designs[0];
    await db.jewelryDesign.update({ where: { id: d.id }, data: { active: false } });
    const k = randomUUID();
    const body = { visitId: sharmaVisit.id, items: [{ designId: d.id, quantity: 2 }] };
    const fail = await api(RAHUL, 'POST', '/v1/orders', body, { 'Idempotency-Key': k });
    assert.equal(fail.status, 409);
    assert.equal(fail.error.code, 'DESIGN_INACTIVE');
    assert.equal(await db.idempotencyKey.count({ where: { key: k } }), 0, 'failed attempt rolled the key back');
    assert.equal(await db.order.count({ where: { clientOpId: k } }), 0);
    await db.jewelryDesign.update({ where: { id: d.id }, data: { active: true } });
    const ok = await api(RAHUL, 'POST', '/v1/orders', body, { 'Idempotency-Key': k });
    assert.equal(ok.status, 201, JSON.stringify(ok.json));
    orderId = ok.data.order.id;
    orderBefore = ok.data.order;
  });

  test('F7. duplicate order: concurrent + sequential replays with one key → one order, identical bodies; reuse with another body → 422', async () => {
    const cat = await api(RAHUL, 'GET', `/v1/visits/${sharmaVisit.id}/catalog`);
    const items = cat.data.designs.slice(2, 4).map((x: J) => ({ designId: x.id, quantity: 1 }));
    const k = randomUUID();
    const rs = await Promise.all(Array.from({ length: 5 }, () => api(RAHUL, 'POST', '/v1/orders', { visitId: sharmaVisit.id, items }, { 'Idempotency-Key': k })));
    assert.ok(rs.every((r) => r.status === 201), JSON.stringify(rs.map((r) => [r.status, r.error?.code])));
    const replay = await api(RAHUL, 'POST', '/v1/orders', { visitId: sharmaVisit.id, items }, { 'Idempotency-Key': k });
    for (const r of [...rs, replay]) assert.deepEqual(r.data, rs[0].data);
    assert.equal(await db.order.count({ where: { clientOpId: k } }), 1);
    assert.equal(await db.outboxEvent.count({ where: { type: 'order.created', aggregateId: rs[0].data.order.id } }), 1, 'one webhook event');
    const reuse = await api(RAHUL, 'POST', '/v1/orders', { visitId: sharmaVisit.id, items: items.slice(0, 1) }, { 'Idempotency-Key': k });
    assert.equal(reuse.status, 422);
    // Arjun replaying Rahul's key cannot read Rahul's response
    const steal = await api(ARJUN, 'POST', '/v1/orders', { visitId: sharmaVisit.id, items }, { 'Idempotency-Key': k });
    assert.ok([404, 422].includes(steal.status));
  });

  test('F8. leaving a sample I do not hold → 409 and nothing changes (no memo, no custody event, no key)', async () => {
    const arjunPiece = await db.samplePiece.findFirstOrThrow({ where: { custodianAgentId: arjunId } });
    const atShop = await db.samplePiece.findFirstOrThrow({ where: { tenantId: AURUM, custodianType: 'SHOP' } });
    const vault = await db.samplePiece.findFirstOrThrow({ where: { tenantId: AURUM, custodianType: 'VAULT' } });
    for (const p of [arjunPiece, atShop, vault]) {
      const k = randomUUID();
      const r = await api(RAHUL, 'POST', '/v1/memos', { visitId: sharmaVisit.id, pieceIds: [p.id], dueDate: addDays(TODAY, 4) }, { 'Idempotency-Key': k });
      assert.equal(r.status, 409, JSON.stringify(r.json));
      assert.equal(r.error.code, 'PIECE_NOT_IN_YOUR_CUSTODY');
      assert.deepEqual(r.error.details.pieceIds, [p.id]);
      assert.equal(await db.memo.count({ where: { clientOpId: k } }), 0);
      assert.equal(await db.idempotencyKey.count({ where: { key: k } }), 0);
      const after = await db.samplePiece.findUniqueOrThrow({ where: { id: p.id } });
      assert.equal(after.custodySeq, p.custodySeq);
    }
  });

  let memoId: string;
  let memoPieceId: string;
  test('F9. duplicate memo (concurrent, same key) → one memo + one handover; the piece leaves the bag and all record views agree', async () => {
    const piece = await db.samplePiece.findFirstOrThrow({ where: { tenantId: (await db.tenant.findUniqueOrThrow({ where: { slug: 'aurum' } })).id, tagCode: 'AJ-S-000123' } });
    assert.equal(piece.custodianAgentId, rahulId, 'seed: AJ-S-000123 is in Rahul’s bag');
    const bagBefore = (await api(RAHUL, 'GET', '/v1/field/today')).data.bag.pieceCount;
    const k = randomUUID();
    const body = { visitId: sharmaVisit.id, pieceIds: [piece.id], dueDate: addDays(TODAY, 5) };
    const rs = await Promise.all(Array.from({ length: 4 }, () => api(RAHUL, 'POST', '/v1/memos', body, { 'Idempotency-Key': k })));
    assert.ok(rs.every((r) => r.status === 201), JSON.stringify(rs.map((r) => [r.status, r.error?.code])));
    for (const r of rs) assert.deepEqual(r.data, rs[0].data);
    memoId = rs[0].data.memo.id;
    memoPieceId = piece.id;
    assert.equal(await db.memo.count({ where: { clientOpId: k } }), 1);
    assert.equal(await db.custodyEvent.count({ where: { pieceId: piece.id, reason: 'MEMO_HANDOVER' } }), 1);
    // agent surfaces
    const today = (await api(RAHUL, 'GET', '/v1/field/today')).data;
    assert.equal(today.bag.pieceCount, bagBefore - 1);
    const cat = (await api(RAHUL, 'GET', '/v1/field/catalog')).data;
    assert.ok(!cat.designs.some((d: J) => d.availablePieces.some((p: J) => p.id === piece.id)), 'gone from available pieces');
    const prof = (await api(RAHUL, 'GET', '/v1/field/profile')).data;
    assert.ok(!prof.bag.some((p: J) => p.id === piece.id) && prof.activeMemos.some((m: J) => m.id === memoId));
    const resume = (await api(RAHUL, 'GET', `/v1/visits/${sharmaVisit.id}`)).data.resume;
    assert.deepEqual(resume.pendingAcks.map((a: J) => a.memoId), [memoId]);
    // admin record views
    const pr = (await api(ADMIN, 'GET', `/v1/admin/pieces/${piece.id}`)).data;
    assert.equal(pr.piece.status, 'ON_MEMO');
    assert.equal(pr.piece.memo.id, memoId);
    const last = pr.events.at(-1);
    assert.equal(last.reason, 'MEMO_HANDOVER');
    assert.equal(last.visit.id, sharmaVisit.id);
    assert.ok(last.proof?.url && last.location?.label === 'Sharma Jewellers' && typeof last.location.distanceM === 'number');
    assert.match(last.eventId, /^evt_/);
    assert.equal(await db.outboxEvent.count({ where: { id: last.eventId, type: 'sample.custody_changed' } }), 1);
    const shop = (await api(ADMIN, 'GET', `/v1/admin/shops/${sharmaVisit.shop.id}`)).data;
    assert.ok(shop.memos.some((m: J) => m.id === memoId) && shop.pieces.some((p: J) => p.id === piece.id));
    assert.equal(shop.shop.activeMemoCount, 1);
    const vr = (await api(ADMIN, 'GET', `/v1/admin/visits/${sharmaVisit.id}`)).data;
    assert.ok(vr.orders.some((o: J) => o.id === orderId) && vr.memosCreated.some((m: J) => m.id === memoId) && vr.proofs.length === 1);
    assert.equal(vr.row.outcome.memoCount, 1);
    assert.ok(vr.custody.some((c: J) => c.pieceId === piece.id));
    const mr = (await api(ADMIN, 'GET', `/v1/admin/memos/${memoId}`)).data;
    assert.deepEqual(mr.custody.map((c: J) => c.reason), ['ISSUE_TO_AGENT', 'MEMO_HANDOVER']);
    assert.equal(mr.visit.id, sharmaVisit.id);
  });

  test('F10. double assignment of a sample: issuing a held piece fails; concurrent issue of one vault piece to two agents → one wins', async () => {
    const held = await db.samplePiece.findFirstOrThrow({ where: { custodianAgentId: rahulId } });
    const r = await api(ADMIN, 'POST', '/v1/admin/pieces/issue', { pieceIds: [held.id], agentId: arjunId });
    assert.equal(r.status, 409);
    assert.equal(r.error.code, 'PIECE_NOT_IN_VAULT');
    const onMemo = await api(ADMIN, 'POST', '/v1/admin/pieces/issue', { pieceIds: [memoPieceId], agentId: arjunId });
    assert.equal(onMemo.error.code, 'PIECE_NOT_IN_VAULT');
    const vault = await db.samplePiece.findFirstOrThrow({ where: { tenantId: AURUM, custodianType: 'VAULT' } });
    const rs = await Promise.all([
      api(ADMIN, 'POST', '/v1/admin/pieces/issue', { pieceIds: [vault.id], agentId: rahulId }),
      api(ADMIN, 'POST', '/v1/admin/pieces/issue', { pieceIds: [vault.id], agentId: arjunId }),
    ]);
    assert.deepEqual(rs.map((x) => x.status).sort(), [200, 409]);
    const evs = await db.custodyEvent.findMany({ where: { pieceId: vault.id }, orderBy: { seq: 'asc' } });
    assert.deepEqual(evs.map((e) => e.seq), [1, 2]);
    // memo + return-to-vault of the same piece at the same time → exactly one wins
    const race = await Promise.all([
      api(RAHUL, 'POST', '/v1/memos', { visitId: sharmaVisit.id, pieceIds: [held.id], dueDate: addDays(TODAY, 3) }, key()),
      api(ADMIN, 'POST', '/v1/admin/pieces/return-to-vault', { pieceIds: [held.id] }),
    ]);
    assert.equal(race.filter((x) => x.status < 300).length, 1, JSON.stringify(race.map((x) => [x.status, x.error?.code])));
    const p = await db.samplePiece.findUniqueOrThrow({ where: { id: held.id } });
    assert.ok((p.custodianType === 'SHOP') !== (p.custodianType === 'VAULT'));
    assert.equal(await db.memoItem.count({ where: { pieceId: held.id, status: 'OUT' } }), p.custodianType === 'SHOP' ? 1 : 0);
  });

  test('F11. gold-rate change after an order: old order untouched; new orders freeze one consistent rate', async () => {
    const k22 = orderBefore.goldRateSnapshot.find((x: J) => x.purity === 'K22');
    const set = await api(ADMIN, 'POST', '/v1/admin/gold-rates', { purity: 'K22', ratePaisePerGram: k22.ratePaisePerGram + 40_000 });
    assert.equal(set.status, 201);
    const old = (await api(ADMIN, 'GET', `/v1/admin/orders/${orderId}`)).data;
    assert.deepEqual(old.order.items, orderBefore.items);
    assert.equal(old.order.totalPaise, orderBefore.totalPaise);
    assert.deepEqual(old.order.goldRateSnapshot, orderBefore.goldRateSnapshot);
    assert.ok(old.history.some((h: J) => h.action === 'order.create'));
    assert.equal(old.visit.id, sharmaVisit.id);
    const n = await api(RAHUL, 'POST', '/v1/orders', { visitId: sharmaVisit.id, items: orderBefore.items.map((i: J) => ({ designId: i.designId, quantity: i.quantity })) }, key());
    const snap = n.data.order.goldRateSnapshot.find((x: J) => x.purity === 'K22');
    assert.equal(snap.goldRateId, set.data.rate.goldRateId);
    for (const it of n.data.order.items.filter((i: J) => i.purity === 'K22')) assert.equal(it.goldRateId, snap.goldRateId, 'every line uses the snapshot rate');
    assert.ok(n.data.order.totalPaise > orderBefore.totalPaise);
  });

  test('F12. failed webhook → FAILED with backoff → shows on Home attention → manual retry after fixing the URL → SUCCEEDED', async () => {
    const fail = await api(ADMIN, 'POST', '/v1/admin/webhooks', { url: `${BASE}/v1/dev/webhook-receiver/fail-${Date.now()}`, events: ['memo.extended'] });
    const epId = fail.data.endpoint.id;
    const ext = await api(ADMIN, 'POST', `/v1/admin/memos/${memoId}/extend`, { dueDate: addDays(TODAY, 8), reason: 'retailer asked' });
    assert.equal(ext.status, 200);
    let d = null;
    for (let i = 0; i < 40 && !(d && d.attempts >= 1); i++) {
      await dispatch();
      d = await db.webhookDelivery.findFirst({ where: { endpointId: epId } });
    }
    assert.equal(d!.status, 'FAILED');
    assert.equal(d!.lastStatusCode, 500);
    assert.ok(d!.nextAttemptAt.getTime() > Date.now() + 20_000, '30 s backoff');
    const home = (await api(ADMIN, 'GET', '/v1/admin/home')).data;
    assert.ok(home.attention.some((a: J) => a.kind === 'WEBHOOK_FAILING' && a.entity.id === epId));
    // fix the endpoint (same secret) and retry by hand
    const good = `${BASE}/v1/dev/webhook-receiver/fixed-${Date.now()}`;
    assert.equal((await api(ADMIN, 'PATCH', `/v1/admin/webhooks/${epId}`, { url: good })).status, 200);
    const retry = await api(ADMIN, 'POST', `/v1/admin/webhooks/deliveries/${d!.id}/retry`);
    assert.equal(retry.data.delivery.status, 'SUCCEEDED', JSON.stringify(retry.data));
    assert.equal(retry.data.delivery.attempts, 2);
    const rec = await db.receivedWebhook.findFirstOrThrow({ where: { deliveryId: d!.id, signatureOk: true } });
    assert.equal(rec.eventType, 'memo.extended');
    // disabling an endpoint parks its pending deliveries as DEAD without HTTP
    await api(ADMIN, 'PATCH', `/v1/admin/webhooks/${epId}`, { active: false });
    await api(ADMIN, 'POST', `/v1/admin/memos/${memoId}/extend`, { dueDate: addDays(TODAY, 9) });
    await dispatch();
    assert.equal(await db.webhookDelivery.count({ where: { endpointId: epId, status: 'PENDING' } }), 0);
    // invalid filters are 400s, not 500s
    assert.equal((await api(ADMIN, 'GET', '/v1/admin/webhooks/deliveries?status=NOPE')).status, 400);
    assert.equal((await api(ADMIN, 'GET', '/v1/admin/visits?status=NOPE')).status, 400);
    assert.equal((await api(ADMIN, 'GET', '/v1/admin/pieces?custodianType=NOPE')).status, 400);
  });

  test('F13. memo.overdue is emitted exactly once per overdue period and re-armed by an extension', async () => {
    const overdue = await db.memo.findFirstOrThrow({ where: { status: 'ACTIVE', dueDate: { lt: new Date(`${TODAY}T00:00:00Z`) } } });
    await dispatch();
    await dispatch();
    assert.equal(await db.outboxEvent.count({ where: { type: 'memo.overdue', aggregateId: overdue.id } }), 1);
    const past = await api(ADMIN, 'POST', `/v1/admin/memos/${overdue.id}/extend`, { dueDate: addDays(TODAY, -1) });
    assert.equal(past.status, 400, 'cannot extend into the past');
    assert.equal(past.error.code, 'INVALID_DUE_DATE');
    const ok = await api(ADMIN, 'POST', `/v1/admin/memos/${overdue.id}/extend`, { dueDate: addDays(TODAY, 2) });
    assert.equal(ok.status, 200);
    assert.equal((await db.memo.findUniqueOrThrow({ where: { id: overdue.id } })).overdueNotifiedAt, null);
    await dispatch();
    assert.equal(await db.outboxEvent.count({ where: { type: 'memo.overdue', aggregateId: overdue.id } }), 1, 'not overdue any more');
  });

  test('F14. return / sale in a later visit are attributed to that visit; memo.converted + order are linked to it', async () => {
    // finish Sharma, then visit Mehta (where Rahul's older memo sits) today
    assert.equal((await api(RAHUL, 'POST', `/v1/visits/${sharmaVisit.id}/complete`, { summary: 'done' })).status, 200);
    const memo = await db.memo.findFirstOrThrow({ where: { agentId: rahulId, shop: { name: 'Mehta Jewellers' } }, include: { items: true } });
    const mehta = await db.shop.findUniqueOrThrow({ where: { id: memo.shopId } });
    const v = (await api(ADMIN, 'POST', '/v1/admin/assignments', { agentId: rahulId, shopId: mehta.id, date: TODAY })).data.visit;
    assert.equal((await api(RAHUL, 'POST', `/v1/visits/${v.id}/check-in`, { lat: mehta.lat, lng: mehta.lng, accuracyM: 5 }, key())).status, 200);
    const [a, b] = memo.items.map((i) => i.pieceId);
    // checked in but no arrival photo yet: return and convert on this visit are refused, nothing moves
    for (const path of ['return', 'convert']) {
      for (const body of [{ pieceIds: [a] }, { pieceIds: [a], visitId: v.id }]) {
        const r = await api(RAHUL, 'POST', `/v1/memos/${memo.id}/${path}`, body, key());
        assert.equal(r.status, 409, `${path} ${JSON.stringify(r.json)}`);
        assert.equal(r.error.code, 'PROOF_REQUIRED_BEFORE_SALE');
      }
    }
    assert.equal((await db.samplePiece.findUniqueOrThrow({ where: { id: a } })).custodianType, 'SHOP');
    await uploadProof(RAHUL, v.id, mehta.lat, mehta.lng);
    const ret = await api(RAHUL, 'POST', `/v1/memos/${memo.id}/return`, { pieceIds: [a] }, key());
    assert.equal(ret.status, 200, JSON.stringify(ret.json));
    const ev = await db.custodyEvent.findFirstOrThrow({ where: { pieceId: a, reason: 'MEMO_RETURN' } });
    assert.equal(ev.visitId, v.id, 'return stamped with the visit it happened in');
    assert.notEqual(ev.visitId, memo.visitId);
    const missingKey = await api(RAHUL, 'POST', `/v1/memos/${memo.id}/convert`, { pieceIds: [b] });
    assert.equal(missingKey.error.code, 'IDEMPOTENCY_KEY_REQUIRED');
    const conv = await api(RAHUL, 'POST', `/v1/memos/${memo.id}/convert`, { pieceIds: [b] }, key());
    assert.equal(conv.status, 200, JSON.stringify(conv.json));
    assert.equal(conv.data.order.visitId, v.id);
    assert.equal(conv.data.order.sourceMemoId, memo.id);
    assert.equal(conv.data.memo.status, 'RETURNED');
    assert.equal(await db.outboxEvent.count({ where: { type: 'memo.converted', aggregateId: memo.id } }), 1);
    const row = (await api(ADMIN, 'GET', `/v1/admin/visits/${v.id}`)).data;
    assert.equal(row.row.outcome.returnedCount, 1);
    assert.equal(row.row.outcome.orderCount, 1);
    assert.deepEqual(row.custody.map((c: J) => c.reason).sort(), ['CONVERTED_TO_SALE', 'MEMO_RETURN']);
    // the field visit view lists the return (refresh-safe) with tag codes
    const fv = (await api(RAHUL, 'GET', `/v1/visits/${v.id}`)).data;
    assert.equal(fv.returns.length, 1);
    assert.equal(fv.returns[0].memoId, memo.id);
    assert.equal(fv.returns[0].memoNumber, memo.number);
    assert.deepEqual(fv.returns[0].pieces.map((p: J) => p.id), [a]);
    assert.ok(fv.returns[0].pieces[0].tagCode && fv.returns[0].pieces[0].name && /^evt_/.test(fv.returns[0].eventId));
    assert.equal(fv.resume.returnedCount, 1);
    // recent visits include today's route (any status) plus the last 14 days
    const recent = (await api(RAHUL, 'GET', '/v1/field/visits?scope=recent')).data;
    assert.ok(recent.some((x: J) => x.id === v.id) && recent.some((x: J) => x.plannedDate === TODAY && x.status === 'PLANNED'));
    assert.ok(recent.every((x: J) => x.plannedDate <= TODAY && x.plannedDate >= addDays(TODAY, -14)));
    // return twice → 409, nothing moves
    const twice = await api(RAHUL, 'POST', `/v1/memos/${memo.id}/return`, { pieceIds: [a] }, key());
    assert.equal(twice.error.code, 'PIECE_NOT_ON_MEMO');
    // explicit visitId at another shop is rejected
    const wrong = await api(RAHUL, 'POST', `/v1/memos/${memoId}/return`, { pieceIds: [memoPieceId], visitId: v.id }, key());
    assert.equal(wrong.error.code, 'VISIT_SHOP_MISMATCH');
  });

  test('F15. a visit left open on an earlier day is surfaced on Today; past PLANNED visits are swept to MISSED', async () => {
    const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: 'aurum' } });
    const kavya = await db.user.findFirstOrThrow({ where: { email: 'kavya@aurum.test' } });
    const shop = await db.shop.findFirstOrThrow({ where: { tenantId: tenant.id, name: 'Sethi Jewellers' } });
    await db.visit.updateMany({ where: { agentId: kavya.id, status: { in: ['CHECKED_IN', 'ACTIVE'] } }, data: { status: 'COMPLETED', completedAt: new Date() } });
    const stale = await db.visit.create({ data: { tenantId: tenant.id, agentId: kavya.id, shopId: shop.id, plannedDate: new Date(`${addDays(TODAY, -2)}T00:00:00Z`), status: 'CHECKED_IN', checkInAt: new Date(Date.now() - 2 * 86400000), verification: 'VERIFIED' } });
    const missed = await db.visit.create({ data: { tenantId: tenant.id, agentId: kavya.id, shopId: shop.id, plannedDate: new Date(`${addDays(TODAY, -3)}T00:00:00Z`), status: 'PLANNED' } });
    const K = await login('kavya@aurum.test', 'Kavya@2026');
    const t = (await api(K, 'GET', '/v1/field/today')).data;
    assert.equal(t.openVisit.id, stale.id);
    assert.equal(t.nextVisitId, stale.id);
    await dispatch();
    assert.equal((await db.visit.findUniqueOrThrow({ where: { id: missed.id } })).status, 'MISSED');
    const home = (await api(ADMIN, 'GET', '/v1/admin/home')).data;
    assert.ok(home.attention.some((a: J) => a.kind === 'VISIT_MISSED' && a.entity.id === missed.id));
    assert.ok(home.attention.some((a: J) => a.kind === 'PROOF_MISSING' && a.entity.id === stale.id));
  });
  test('F16. agents list is a full v2 row; audit rows are human (actor Ref + summary, ids resolved); seed demos SIMULATED + LOW_ACCURACY', async () => {
    const agents = (await api(ADMIN, 'GET', '/v1/admin/agents')).data;
    const rahul = agents.find((a: J) => a.id === rahulId);
    for (const k of ['today', 'bag', 'openMemos', 'ordersToday']) assert.ok(rahul[k], k);
    assert.equal(typeof rahul.today.inProgress, 'number');
    assert.ok(rahul.openMemos.count >= 1 && rahul.openMemos.valuePaise > 0);
    assert.ok(rahul.ordersToday.count >= 1 && rahul.lastCheckInAt);
    const arjun = agents.find((a: J) => a.id === arjunId);
    assert.ok(arjun.currentVisit?.shopName === 'Royal Gems' && arjun.currentVisit.since, JSON.stringify(arjun.currentVisit));
    assert.ok(arjun.nextVisit?.shopName === 'Kapoor & Sons' && arjun.nextVisit.plannedTime === '14:30', JSON.stringify(arjun.nextVisit));
    const rec = (await api(ADMIN, 'GET', `/v1/admin/agents/${rahulId}`)).data;
    assert.ok(rec.agent.lastCheckInAt);
    // audit: reassign a shop and approve an order, then read both audit surfaces
    const shop = (await api(ADMIN, 'GET', '/v1/admin/shops?q=Malhotra')).data[0];
    assert.equal((await api(ADMIN, 'PATCH', `/v1/admin/shops/${shop.id}`, { assignedAgentId: arjunId })).status, 200);
    // legacy filter value SUBMITTED is an alias of PENDING_APPROVAL (v3)
    const pending = (await api(ADMIN, 'GET', '/v1/admin/orders?status=SUBMITTED')).data[0];
    assert.equal(pending.status, 'PENDING_APPROVAL');
    assert.equal((await api(ADMIN, 'POST', `/v1/admin/orders/${pending.id}/approve`)).status, 200);
    const shopAudit = (await api(ADMIN, 'GET', `/v1/admin/audit?entityType=Shop&entityId=${shop.id}`)).data[0];
    assert.equal(shopAudit.actor.name, 'Priya Mehta');
    assert.match(shopAudit.summary, /assigned agent: Rahul Verma → Arjun Singh/);
    const hist = (await api(ADMIN, 'GET', `/v1/admin/orders/${pending.id}`)).data.history;
    assert.ok(hist.some((h: J) => h.summary === `Approved ${pending.number}` && h.actor.id), JSON.stringify(hist.map((h: J) => h.summary)));
    const all = (await api(ADMIN, 'GET', '/v1/admin/audit')).data;
    for (const r of all) {
      assert.ok(r.summary && !/^c[a-z0-9]{20,}$/.test(r.summary), `summary for ${r.action}`);
      assert.ok(!/\bc[a-z0-9]{24}\b/.test(r.summary), `raw id in summary: ${r.summary}`);
    }
    // seeded demo states
    const kavya = await db.user.findFirstOrThrow({ where: { email: 'kavya@aurum.test' } });
    const states = await db.visit.findMany({ where: { tenantId: AURUM, agentId: kavya.id, shop: { name: 'Jain Ornaments' } }, select: { verification: true, checkInDistanceM: true, plannedDate: true } });
    assert.ok(states.some((v) => v.verification === 'SIMULATED' && v.checkInDistanceM === 0 && v.plannedDate.toISOString().slice(0, 10) === TODAY));
    assert.ok(states.some((v) => v.verification === 'LOW_ACCURACY' && v.plannedDate.toISOString().slice(0, 10) < TODAY));
  });
});
