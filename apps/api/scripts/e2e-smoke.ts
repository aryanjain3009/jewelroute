/* End-to-end scenario — the brief's 28 steps with sample AJ-S-000123, plus the v3 credit flow
 * (normal order confirms directly; an over-limit order waits for approval, is approved and its
 * `order.approved` webhook delivered; settling reduces the outstanding) — over real HTTP.
 *   BASE_URL=http://localhost:4000 pnpm --filter @jewelroute/api e2e
 *   BASE_URL=https://api.example.com CRON_SECRET=... pnpm --filter @jewelroute/api e2e
 * Re-runnable: if Sharma's visit today was already completed by an earlier run, a fresh test shop
 * is created next to Sharma Jewellers and assigned instead.
 */
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { addDays, distanceM, istDate, orderTotals, priceDesign } from '@jewelroute/shared';

const BASE = (process.env.BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const API = BASE.endsWith('/api') ? BASE : BASE; // works against the API origin or the web origin's /api
const ADMIN = { email: process.env.ADMIN_EMAIL ?? 'admin@aurum.test', password: process.env.ADMIN_PASSWORD ?? 'Aurum@2026' };
const AGENT = { email: process.env.AGENT_EMAIL ?? 'rahul@aurum.test', password: process.env.AGENT_PASSWORD ?? 'Rahul@2026' };

type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any
let step = 0;
const ok = (msg: string) => console.log(`  ✓ ${String(++step).padStart(2)}. ${msg}`);
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function call(token: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body !== undefined && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json: J;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, data: json?.data as J, error: json?.error as J, headers: res.headers };
}
async function must(token: string | null, method: string, path: string, body?: unknown, headers?: Record<string, string>) {
  const r = await call(token, method, path, body, headers);
  if (r.status >= 300 || !r.json?.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.json).slice(0, 500)}`);
  return r.data;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const north = (lat: number, m: number) => lat + m / 111_320;


async function uploadProof(R: string, visitId: string, lat: number, lng: number) {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`JewelRoute e2e proof ${visitId} ${Date.now()} ${Math.random()}`), Buffer.from([0xff, 0xd9])]);
  const sha = createHash('sha256').update(jpeg).digest('hex');
  const tok = await must(R, 'POST', '/v1/uploads/proof-token', { visitId, contentType: 'image/jpeg', sizeBytes: jpeg.length });
  let url: string;
  let objectKey: string;
  if (tok.mode === 'blob') {
    const { put } = await import('@vercel/blob/client');
    const blob = await put(tok.pathname, jpeg, { access: 'public', token: tok.clientToken, contentType: 'image/jpeg' });
    url = blob.url;
    objectKey = tok.pathname;
  } else {
    const fd = new FormData();
    fd.append('pathname', tok.pathname);
    fd.append('file', new Blob([jpeg], { type: 'image/jpeg' }), 'arrival.jpg');
    const up = await must(R, 'POST', '/v1/uploads/direct', fd);
    assert(up.checksumSha256 === sha, 'server checksum matches');
    url = up.url;
    objectKey = up.objectKey;
  }
  const pr = await must(R, 'POST', `/v1/visits/${visitId}/proofs`, { objectKey, url, contentType: 'image/jpeg', sizeBytes: jpeg.length, checksumSha256: sha, capturedAt: new Date().toISOString(), captureLat: lat, captureLng: lng }, { 'Idempotency-Key': randomUUID() });
  return { mode: tok.mode as string, size: jpeg.length, sha, pr };
}

const SAMPLE = process.env.SAMPLE_TAG ?? 'AJ-S-000123';
const key = () => ({ 'Idempotency-Key': randomUUID() });

/** Re-runs: bring the scenario sample back into Rahul's bag whatever an earlier run did with it. */
async function ensureSampleWithAgent(A: string, R: string, agentId: string) {
  const [p] = await must(A, 'GET', `/v1/admin/pieces?q=${SAMPLE}`);
  assert(p, `${SAMPLE} exists`);
  if (p.custodian.type === 'AGENT' && p.custodian.agentId === agentId) return p;
  if (p.custodian.type === 'SHOP' && p.memo) await must(R, 'POST', `/v1/memos/${p.memo.id}/return`, { pieceIds: [p.id] }, key());
  else if (p.custodian.type === 'AGENT') await must(A, 'POST', '/v1/admin/pieces/return-to-vault', { pieceIds: [p.id] });
  const [now] = await must(A, 'GET', `/v1/admin/pieces?q=${SAMPLE}`);
  if (now.custodian.type === 'VAULT') await must(A, 'POST', '/v1/admin/pieces/issue', { pieceIds: [p.id], agentId });
  const [fin] = await must(A, 'GET', `/v1/admin/pieces?q=${SAMPLE}`);
  assert(fin.custodian.type === 'AGENT' && fin.custodian.agentId === agentId, `${SAMPLE} back in the agent's bag (${fin.status})`);
  return fin;
}

async function main() {
  console.log(`JewelRoute E2E (28-step brief scenario, sample ${SAMPLE}) against ${API}`);
  const today = istDate();
  const health = await must(null, 'GET', '/v1/health');
  assert(health.db === 'ok', 'db healthy');

  // ---- 1. Admin (Priya) sets the current 22K gold rate
  const adminLogin = await must(null, 'POST', '/v1/auth/login', ADMIN);
  const A = adminLogin.accessToken as string;
  assert(adminLogin.user.role === 'ADMIN', 'admin role');
  const rates = await must(A, 'GET', '/v1/admin/gold-rates');
  const cur22 = rates.current.find((r: J) => r.purity === 'K22');
  const newRate = (cur22 ? cur22.ratePaisePerGram : 10_540_00) + (Math.random() < 0.5 ? 500 : -500);
  const setRate = await must(A, 'POST', '/v1/admin/gold-rates', { purity: 'K22', ratePaisePerGram: newRate });
  assert(setRate.rate.ratePaisePerGram === newRate, 'rate set');
  ok(`${adminLogin.user.name} sets 22K to ₹${newRate / 100}/g (append-only row ${setRate.rate.goldRateId})`);

  // ---- 2. Rahul has Sharma Jewellers assigned today
  const agents = await must(A, 'GET', '/v1/admin/agents');
  const rahul = agents.find((a: J) => a.email === AGENT.email);
  assert(rahul, 'agent exists');
  const [sharma] = (await must(A, 'GET', '/v1/admin/shops?q=Sharma%20Jewellers')).filter((s: J) => s.name === 'Sharma Jewellers');
  assert(sharma, 'Sharma Jewellers exists');
  let shop = sharma;
  const todays = await must(A, 'GET', `/v1/admin/visits?date=${today}&agentId=${rahul.id}`);
  let assigned = todays.find((v: J) => v.shop.id === sharma.id);
  if (!assigned || assigned.status !== 'PLANNED') {
    // An earlier run already used Sharma today → twin shop next door so the scenario can repeat.
    const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '');
    // Same receivables as Sharma (limit + opening balance) so the credit steps behave the same.
    shop = (await must(A, 'POST', '/v1/admin/shops', { name: `Sharma Jewellers (E2E ${stamp})`, address: sharma.address, area: sharma.area, city: sharma.city, lat: north(sharma.lat, 5), lng: sharma.lng, geofenceRadiusM: 100, assignedAgentId: rahul.id, creditLimitPaise: sharma.creditLimitPaise || 25_00_000_00, openingOutstandingPaise: sharma.openingOutstandingPaise ?? 8_00_000_00 })).shop;
    assigned = (await must(A, 'POST', '/v1/admin/assignments', { agentId: rahul.id, shopId: shop.id, date: today, plannedTime: '10:30' })).visit;
  }
  const visitId: string = assigned.id;
  assert(assigned.plannedTime === '10:30', `planned 10:30 (${assigned.plannedTime})`);
  ok(`${shop.name} is on Rahul's route today at ${assigned.plannedTime} (visit ${visitId})`);

  // ---- 3. Rahul logs in
  const agentLogin = await must(null, 'POST', '/v1/auth/login', AGENT);
  const R = agentLogin.accessToken as string;
  ok(`Rahul logs in (${agentLogin.user.name}, ${agentLogin.user.role})`);
  const sample0 = await ensureSampleWithAgent(A, R, rahul.id);

  // Re-runs: close any visit an earlier run left open (one open visit per agent is enforced).
  const pre = await must(R, 'GET', '/v1/field/today');
  if (pre.openVisit && pre.openVisit.id !== visitId) {
    if (pre.openVisit.proofCount === 0) await uploadProof(R, pre.openVisit.id, pre.openVisit.shop.lat, pre.openVisit.shop.lng);
    await must(R, 'POST', `/v1/visits/${pre.openVisit.id}/complete`, { summary: 'closed by e2e re-run' });
  }

  // ---- 4. Today's page shows Sharma
  const route = await must(R, 'GET', '/v1/field/today');
  const mine = route.visits.find((v: J) => v.id === visitId);
  assert(mine && mine.status === 'PLANNED' && mine.shop.lat && route.user.id === rahul.id, 'visit on route');
  const completedBefore = route.progress.completed;
  ok(`Today shows ${route.visits.length} visits; ${shop.name} #${mine.sequence} at ${mine.plannedTime}; bag ${route.bag.pieceCount} pcs incl. ${SAMPLE}`);

  // ---- 5. Rahul opens the visit (resumable state)
  const opened = await must(R, 'GET', `/v1/visits/${visitId}`);
  assert(opened.resume.nextStep === 'CHECK_IN' && opened.resume.canCheckIn, `resume ${JSON.stringify(opened.resume)}`);
  assert(opened.bag.some((p: J) => p.id === sample0.id), 'sample in visit bag');
  ok(`Opens the visit: next step ${opened.resume.nextStep}, ${opened.bag.length} pieces in bag`);

  // ---- 6. GPS check-in validates against Sharma's coordinates
  const gps = { lat: north(shop.lat, 30), lng: shop.lng, accuracyM: 12 };
  const geo = await must(R, 'POST', `/v1/visits/${visitId}/geofence-check`, gps);
  assert(geo.inside === true && geo.verification === 'VERIFIED' && geo.radiusM === shop.geofenceRadiusM, 'inside fence');
  ok(`Geofence check against ${shop.lat},${shop.lng}: ${geo.distanceM} m ≤ ${geo.radiusM} m (${geo.verification})`);

  // ---- 7. Invalid location fails
  const far = await call(R, 'POST', `/v1/visits/${visitId}/check-in`, { lat: north(shop.lat, 900), lng: shop.lng, accuracyM: 10 }, key());
  assert(far.status === 409 && far.error.code === 'OUTSIDE_GEOFENCE', 'far check-in rejected');
  ok(`900 m away → ${far.status} ${far.error.code} (${far.error.details.distanceM} m)`);

  // ---- 8. Valid location creates exactly one check-in
  const ciKey = randomUUID();
  const [ci, ci2] = await Promise.all([
    must(R, 'POST', `/v1/visits/${visitId}/check-in`, gps, { 'Idempotency-Key': ciKey }),
    must(R, 'POST', `/v1/visits/${visitId}/check-in`, gps, { 'Idempotency-Key': ciKey }),
  ]);
  assert(ci.visit.status === 'CHECKED_IN' && ci.visit.verification === 'VERIFIED' && isDeepStrictEqual(ci2, ci), 'checked in once');
  const dup = await call(R, 'POST', `/v1/visits/${visitId}/check-in`, gps, key());
  assert(dup.status === 409 && dup.error.code === 'ALREADY_CHECKED_IN', 'duplicate check-in blocked');
  const checkInEvents = (await must(A, 'GET', `/v1/admin/visits/${visitId}`)).activity.filter((a: J) => a.type === 'visit.checked_in');
  assert(checkInEvents.length === 1, `one visit.checked_in event (${checkInEvents.length})`);
  ok(`Checks in once (${ci.visit.verification}, ${ci.visit.checkInDistanceM} m); concurrent replay identical; new key → ${dup.error.code}; 1 event`);

  // ---- 9. Uploads a visit photo
  const { mode, size, sha, pr } = await uploadProof(R, visitId, gps.lat, gps.lng);
  ok(`Uploads the arrival photo (${mode} mode, ${size} B, sha256 ${sha.slice(0, 12)}…)`);

  // ---- 10. Proof attaches to the correct visit
  const afterProof = await must(R, 'GET', `/v1/visits/${visitId}`);
  assert(pr.visit.id === visitId && pr.visit.status === 'ACTIVE' && afterProof.proofs.some((p: J) => p.id === pr.proof.id) && pr.proof.objectKey.includes(`/visits/${visitId}/`), 'proof on visit');
  assert(afterProof.resume.nextStep === 'SELL_OR_COMPLETE', 'resume after proof');
  ok(`Proof ${pr.proof.id} attached to visit ${visitId} (→ ${pr.visit.status}, ${pr.proof.distanceM ?? 0} m from check-in)`);

  // ---- 11. Opens the catalog
  const cat = await must(R, 'GET', `/v1/visits/${visitId}/catalog`);
  ok(`Opens the catalog: ${cat.designs.length} designs (${cat.facets.categories.join(', ')})`);

  // ---- 12. Prices reflect the current gold rate
  const r22 = cat.rates.find((r: J) => r.purity === 'K22');
  assert(r22.ratePaisePerGram === newRate && r22.goldRateId === setRate.rate.goldRateId, 'catalog uses the new 22K rate');
  const d22 = cat.designs.find((d: J) => d.purity === 'K22');
  const expect = priceDesign({ netWeightMg: d22.netWeightMg, ratePaisePerGram: newRate, makingChargeType: d22.makingChargeType, makingChargeValue: d22.makingChargeValue, stoneValuePaise: d22.stoneValuePaise, otherComponents: d22.otherComponents });
  assert(d22.price.unitPricePaise === expect.unitPricePaise, 'price recomputes with shared priceDesign');
  ok(`Prices use 22K ₹${newRate / 100}/g — ${d22.sku} = ₹${(d22.price.unitPricePaise / 100).toLocaleString('en-IN')} (+3% GST)`);

  // ---- 13. Creates an order (idempotent) — a normal order: the credit preview says no approval, and it confirms directly
  const oKey = randomUUID();
  const dOther = cat.designs.find((d: J) => d.purity !== 'K22');
  const items = [{ designId: d22.id, quantity: 2 }, { designId: dOther.id, quantity: 1 }];
  const expectTotal = orderTotals([d22.price.unitPricePaise * 2, dOther.price.unitPricePaise]).totalPaise;
  const preview = await must(R, 'GET', `/v1/visits/${visitId}/credit?amountPaise=${expectTotal}`);
  assert(preview.requiresApproval === false && preview.reasons.length === 0 && preview.availableCreditPaise >= expectTotal, `normal order fits (${JSON.stringify(preview)})`);
  const [o1, o2] = await Promise.all([
    must(R, 'POST', '/v1/orders', { visitId, items, notes: 'E2E order' }, { 'Idempotency-Key': oKey }),
    must(R, 'POST', '/v1/orders', { visitId, items, notes: 'E2E order' }, { 'Idempotency-Key': oKey }),
  ]);
  assert(o1.order.id === o2.order.id, 'concurrent same-key orders → one order');
  assert(o1.order.totalPaise === expectTotal, `total ${o1.order.totalPaise} = previewed ${expectTotal}`);
  assert(o1.order.status === 'CONFIRMED' && o1.order.approval.required === false && o1.order.approval.position.projectedExposurePaise === preview.projectedExposurePaise, `confirmed directly (${o1.order.status})`);
  ok(`Creates ${o1.order.number} ₹${(o1.order.totalPaise / 100).toLocaleString('en-IN')} → ${o1.order.status} (no approval: ₹${(preview.availableCreditPaise / 100).toLocaleString('en-IN')} available); 2 concurrent retries → 1 order`);

  // ---- 14. Order freezes the rate snapshot
  const snap = o1.order.goldRateSnapshot.find((s: J) => s.purity === 'K22');
  assert(snap.goldRateId === setRate.rate.goldRateId && snap.ratePaisePerGram === newRate, 'snapshot = current rate');
  assert(o1.order.items.filter((i: J) => i.purity === 'K22').every((i: J) => i.goldRateId === snap.goldRateId && i.ratePaisePerGram === newRate), 'lines frozen');
  ok(`Snapshot frozen: 22K ${snap.goldRateId} @ ₹${snap.ratePaisePerGram / 100}/g on every 22K line`);

  // ---- 15. Rahul chooses AJ-S-000123
  const inBag = afterProof.bag.find((p: J) => p.tagCode === SAMPLE);
  assert(inBag && inBag.purity === 'K22' && inBag.category === 'Bangles', `${SAMPLE} is a 22K bangle in the visit bag`);
  ok(`Chooses ${SAMPLE} — ${inBag.name} (${inBag.purity}, ${(inBag.netWeightMg / 1000).toFixed(3)} g net)`);

  // ---- 16. Backend verifies Rahul possesses it (and refuses a piece he does not hold)
  const notMine = (await must(A, 'GET', '/v1/admin/pieces?status=WITH_AGENT')).find((p: J) => p.custodian.agentId !== rahul.id);
  const due = addDays(today, 5);
  if (notMine) {
    const refused = await call(R, 'POST', '/v1/memos', { visitId, pieceIds: [notMine.id], dueDate: due }, key());
    assert(refused.status === 409 && refused.error.code === 'PIECE_NOT_IN_YOUR_CUSTODY', 'not held → 409');
  }
  const [held] = await must(A, 'GET', `/v1/admin/pieces?q=${SAMPLE}`);
  assert(held.custodian.type === 'AGENT' && held.custodian.agentId === rahul.id, 'custodian is Rahul');
  ok(`Custody verified server-side: ${SAMPLE} is with ${held.custodian.agentName}${notMine ? `; ${notMine.tagCode} (${notMine.custodian.agentName}) → PIECE_NOT_IN_YOUR_CUSTODY` : ''}`);

  // ---- 17. Creates the memo
  const mKey = randomUUID();
  const mm = await must(R, 'POST', '/v1/memos', { visitId, pieceIds: [held.id], dueDate: due, notes: 'E2E memo' }, { 'Idempotency-Key': mKey });
  const mmReplay = await must(R, 'POST', '/v1/memos', { visitId, pieceIds: [held.id], dueDate: due, notes: 'E2E memo' }, { 'Idempotency-Key': mKey });
  assert(mm.memo.dueDate === due && mm.memo.items.length === 1 && mmReplay.memo.id === mm.memo.id, 'memo created once');
  ok(`Creates ${mm.memo.number} due ${due} (₹${(mm.memo.totalValuePaise / 100).toLocaleString('en-IN')}); replay → same memo`);

  // ---- 18. Memo + custody transfer are one atomic write
  const pieceRec = await must(A, 'GET', `/v1/admin/pieces/${held.id}`);
  const handover = pieceRec.events[pieceRec.events.length - 1];
  assert(handover.reason === 'MEMO_HANDOVER' && handover.memo.id === mm.memo.id && handover.seq === held.custodySeq + 1, 'custody event with the memo');
  ok(`Memo and custody event #${handover.seq} committed together (${handover.from.label} → ${handover.to.label})`);

  // ---- 19. The sample now belongs to Sharma Jewellers
  assert(pieceRec.piece.custodian.type === 'SHOP' && pieceRec.piece.custodian.shopId === shop.id && pieceRec.piece.status === 'ON_MEMO' && pieceRec.piece.memo.id === mm.memo.id, 'custodian = shop');
  ok(`${SAMPLE} custodian = ${pieceRec.piece.custodian.shopName} (${pieceRec.piece.status} on ${pieceRec.piece.memo.number})`);

  // ---- 20. It disappears from Rahul's available samples
  const [visitAfter, catAfter, todayAfter, profile] = await Promise.all([
    must(R, 'GET', `/v1/visits/${visitId}`),
    must(R, 'GET', '/v1/field/catalog'),
    must(R, 'GET', '/v1/field/today'),
    must(R, 'GET', '/v1/field/profile'),
  ]);
  assert(!visitAfter.bag.some((p: J) => p.id === held.id), 'gone from visit bag');
  assert(!catAfter.designs.some((d: J) => (d.availablePieces ?? []).some((p: J) => p.id === held.id)), 'gone from catalog availablePieces');
  assert(!profile.bag.some((p: J) => p.id === held.id) && profile.activeMemos.some((m: J) => m.id === mm.memo.id), 'profile bag/memos');
  assert(todayAfter.bag.pieceCount === route.bag.pieceCount - 1, 'Today bag count −1');
  ok(`Gone from Rahul's bag (Today ${route.bag.pieceCount} → ${todayAfter.bag.pieceCount} pcs), catalog and profile; memo listed under his active memos`);

  // Retailer acknowledgement: public page code → agent enters it
  const ackToken = mm.ack.url.split('/ack/')[1];
  const pub = await must(null, 'GET', `/v1/public/memo-ack/${ackToken}`);
  assert(/^\d{6}$/.test(pub.code) && pub.items[0].tagCode === SAMPLE, 'ack page shows the sample');
  const acked = await must(R, 'POST', `/v1/memos/${mm.memo.id}/ack/verify`, { code: pub.code });
  assert(acked.memo.ackStatus === 'ACKNOWLEDGED', 'acknowledged');

  // ---- v3: an order over the credit limit waits for the manager, is approved, and settles
  const kada = cat.designs.find((d: J) => d.sku === 'AJ-BNG-2201') ?? d22;
  const before = await must(R, 'GET', `/v1/visits/${visitId}/credit`);
  const unitWithGst = orderTotals([kada.price.unitPricePaise]).totalPaise;
  const qty = Math.floor((before.availableCreditPaise ?? 0) / unitWithGst) + 1;
  const bigTotal = orderTotals([kada.price.unitPricePaise * qty]).totalPaise;
  const bigPreview = await must(R, 'GET', `/v1/visits/${visitId}/credit?amountPaise=${bigTotal}`);
  assert(bigPreview.requiresApproval && bigPreview.reasons.includes('CREDIT_LIMIT') && bigPreview.projectedExposurePaise > bigPreview.creditLimitPaise, `preview trips CREDIT_LIMIT (${JSON.stringify(bigPreview)})`);
  const big = (await must(R, 'POST', '/v1/orders', { visitId, items: [{ designId: kada.id, quantity: qty }], notes: 'E2E over-limit order' }, key())).order;
  assert(big.status === 'PENDING_APPROVAL' && big.approval.required && big.approval.reasons.includes('CREDIT_LIMIT'), `pending (${big.status} ${JSON.stringify(big.approval.reasons)})`);
  assert(big.approval.position.exposurePaise === before.exposurePaise && big.approval.position.projectedExposurePaise === bigPreview.projectedExposurePaise, 'credit snapshot frozen on the order');
  ok(`${qty}× ${kada.name} = ₹${(big.totalPaise / 100).toLocaleString('en-IN')} → ${big.status} (${big.approval.reasons.join(' + ')}; projected ₹${(big.approval.position.projectedExposurePaise / 100).toLocaleString('en-IN')} > limit ₹${(big.approval.position.creditLimitPaise / 100).toLocaleString('en-IN')})`);
  const queue = await must(A, 'GET', '/v1/admin/orders?status=PENDING_APPROVAL');
  assert(queue.some((o: J) => o.id === big.id) && !queue.some((o: J) => o.id === o1.order.id), 'approval queue has only the pending order');
  const approved = (await must(A, 'POST', `/v1/admin/orders/${big.id}/approve`)).order;
  assert(approved.status === 'APPROVED' && approved.decidedBy?.name, 'approved');
  const afterApprove = await must(A, 'GET', `/v1/admin/shops/${shop.id}/credit`);
  assert(afterApprove.outstandingPaise === before.outstandingPaise + big.totalPaise, 'approved order counts towards outstanding');
  ok(`${adminLogin.user.name} approves ${big.number}; outstanding ₹${(before.outstandingPaise / 100).toLocaleString('en-IN')} → ₹${(afterApprove.outstandingPaise / 100).toLocaleString('en-IN')}`);
  const settled = await must(A, 'POST', `/v1/admin/orders/${big.id}/settle`);
  assert(settled.order.settledAt && settled.credit.outstandingPaise === afterApprove.outstandingPaise - big.totalPaise, `settle reduces outstanding (${settled.credit.outstandingPaise})`);
  const again = await call(A, 'POST', `/v1/admin/orders/${big.id}/settle`);
  assert(again.status === 409 && again.error.code === 'ORDER_ALREADY_SETTLED', 'settle once');
  ok(`Settles ${big.number}: outstanding back to ₹${(settled.credit.outstandingPaise / 100).toLocaleString('en-IN')}; second settle → ${again.error.code}`);

  // ---- 21. Manager dashboard / Home updates
  const home = await must(A, 'GET', `/v1/admin/home?date=${today}`);
  const homeMemo = home.activity.find((a: J) => a.type === 'memo.created' && a.entity.id === mm.memo.id);
  const homeOrder = home.activity.find((a: J) => a.type === 'order.created' && a.entity.id === o1.order.id);
  const mapShop = home.map.shops.find((s: J) => s.id === shop.id);
  const agentCard = home.agents.find((a: J) => a.id === rahul.id);
  assert(homeMemo && homeOrder && mapShop.piecesHere >= 1 && agentCard.currentVisit === shop.name && home.metrics.ordersToday.count >= 1, 'home reflects order + memo');
  ok(`Home: “${homeMemo.title}”; ${home.metrics.samplesOutside.count} samples outside; Rahul at ${agentCard.currentVisit}`);

  // ---- 22. Shop record shows the memo
  const shopRec = await must(A, 'GET', `/v1/admin/shops/${shop.id}`);
  assert(shopRec.memos.some((m: J) => m.id === mm.memo.id) && shopRec.pieces.some((p: J) => p.id === held.id) && shopRec.shop.activeMemoCount >= 1, 'shop record');
  assert(shopRec.orders.some((o: J) => o.id === o1.order.id) && shopRec.visits.some((v: J) => v.id === visitId), 'shop record order + visit');
  ok(`Shop record: ${mm.memo.number} active (${shopRec.shop.activeMemoCount} memo, ${shopRec.shop.samplesHereCount} samples here, status ${shopRec.shop.status})`);

  // ---- 23. Sample record shows the custody transfer with visit, proof, location and event id
  assert(handover.visit?.id === visitId && handover.proof?.id === pr.proof.id && handover.location?.label === shop.name && handover.location.verification === 'VERIFIED' && /^evt_/.test(handover.eventId), `transfer context ${JSON.stringify(handover)}`);
  ok(`Sample record: ${handover.from.label} → ${handover.to.label} at ${handover.location.distanceM} m (${handover.location.verification}), proof ${handover.proof.id}, ${handover.eventId}`);

  const orderRec = await must(A, 'GET', `/v1/admin/orders/${big.id}`);
  const types = orderRec.activity.map((a: J) => a.type);
  assert(['order.created', 'order.pending_approval', 'order.approved', 'order.settled'].every((t) => types.includes(t)) && orderRec.activity.every((a: J) => a.refs.order?.id === big.id && a.refs.shop?.id === shop.id && a.kind === 'order'), `order activity ${types}`);

  // ---- 24. Visit record links order + memo + proof
  const visitRec = await must(A, 'GET', `/v1/admin/visits/${visitId}`);
  assert(visitRec.orders.some((o: J) => o.id === o1.order.id) && visitRec.memosCreated.some((m: J) => m.id === mm.memo.id) && visitRec.proofs.some((p: J) => p.id === pr.proof.id), 'visit links');
  assert(visitRec.row.outcome.orderCount >= 1 && visitRec.row.outcome.memoCount >= 1 && visitRec.custody.some((c: J) => c.pieceId === held.id) && visitRec.row.proofState === 'VERIFIED', 'visit row');
  ok(`Visit record: ${visitRec.orders.length} order, ${visitRec.memosCreated.length} memo, ${visitRec.proofs.length} proof, ${visitRec.custody.length} custody move (${visitRec.row.proofState})`);

  // ---- 25. Webhook event is created (the same evt_ id as the custody event)
  const cron = process.env.CRON_SECRET;
  const want = ['visit.checked_in', 'visit.proof_uploaded', 'order.created', 'order.confirmed', 'order.pending_approval', 'order.approved', 'order.settled', 'memo.created', 'memo.acknowledged', 'sample.custody_changed'];
  let ours: J[] = [];
  for (let i = 0; i < 30; i++) {
    if (cron && i % 3 === 0) await call(null, 'POST', '/v1/internal/dispatch', {}, { 'x-cron-secret': cron });
    const dl = await must(A, 'GET', '/v1/admin/webhooks/deliveries');
    ours = dl.filter((d: J) => new Date(d.createdAt).getTime() >= new Date(ci.visit.checkInAt).getTime() - 5000 && want.includes(d.eventType));
    if (want.every((t) => ours.some((d) => d.eventType === t && d.status === 'SUCCEEDED')) && ours.some((d) => d.eventId === handover.eventId)) break;
    await sleep(1000);
  }
  const custodyDelivery = ours.find((d) => d.eventId === handover.eventId);
  assert(custodyDelivery, `delivery for ${handover.eventId}`);
  // the approval webhook reached the receiver, signed, for this order
  const rcv = await must(A, 'GET', '/v1/admin/webhooks/received');
  const approvedHook = rcv.find((r: J) => r.eventType === 'order.approved' && r.body?.data?.orderId === big.id);
  assert(approvedHook && approvedHook.signatureOk && approvedHook.body.data.reasons.includes('CREDIT_LIMIT'), 'order.approved delivered + verified');
  ok(`Outbox events created: ${[...new Set(ours.map((d) => d.eventType))].join(', ')} (custody ${handover.eventId})`);

  // ---- 26. Worker delivers the webhook
  for (const t of want) assert(ours.some((d) => d.eventType === t && d.status === 'SUCCEEDED'), `SUCCEEDED ${t} (${JSON.stringify(ours.map((d) => [d.eventType, d.status, d.lastError]))})`);
  const received = await must(A, 'GET', '/v1/admin/webhooks/received');
  const verified = received.filter((r: J) => r.signatureOk && ours.some((d) => d.id === r.deliveryId));
  assert(verified.length >= want.length && received.some((r: J) => r.eventId === handover.eventId && r.signatureOk), `receiver verified (${verified.length})`);
  ok(`Delivered and signature-verified by the receiver: ${verified.length} deliveries incl. ${handover.eventId}`);

  // ---- 27. Integration delivery log updates
  const detail = await must(A, 'GET', `/v1/admin/webhooks/deliveries/${custodyDelivery.id}`);
  const lastAttempt = detail.attemptLog[detail.attemptLog.length - 1];
  assert(detail.status === 'SUCCEEDED' && lastAttempt.statusCode === 200 && /^sha256=/.test(lastAttempt.requestHeaders['X-JewelRoute-Signature']) && detail.payload.id === handover.eventId, 'delivery log');
  ok(`Delivery log: ${detail.eventType} ${detail.status}, attempt ${lastAttempt.attemptNo} HTTP ${lastAttempt.statusCode} in ${lastAttempt.latencyMs} ms, signed`);

  // ---- 28. Completing the visit updates Today and admin views
  const done = await must(R, 'POST', `/v1/visits/${visitId}/complete`, { lat: gps.lat, lng: gps.lng, summary: `E2E: order booked, ${SAMPLE} on memo, retailer acknowledged.` });
  assert(done.visit.status === 'COMPLETED', 'completed');
  const [todayDone, rows, homeDone, finalVisit] = await Promise.all([
    must(R, 'GET', '/v1/field/today'),
    must(A, 'GET', `/v1/admin/visits?date=${today}&agentId=${rahul.id}&status=COMPLETED`),
    must(A, 'GET', `/v1/admin/home?date=${today}`),
    must(R, 'GET', `/v1/visits/${visitId}`),
  ]);
  const row = rows.find((v: J) => v.id === visitId);
  assert(todayDone.progress.completed === completedBefore + 1 && !todayDone.openVisit && todayDone.visits.find((v: J) => v.id === visitId).status === 'COMPLETED', 'Today updated');
  assert(row && row.durationMin != null && homeDone.agents.find((a: J) => a.id === rahul.id).currentVisit == null && finalVisit.resume.nextStep === 'DONE', 'admin updated');
  ok(`Visit completed: Today ${todayDone.progress.completed}/${todayDone.progress.planned}, admin row COMPLETED in ${row.durationMin} min, Home shows Rahul free`);

  console.log(`\nE2E PASSED — ${step} checks against ${API}`);
}

main().catch((e) => {
  console.error(`\nE2E FAILED at step ${step + 1}: ${e.message}`);
  process.exit(1);
});
