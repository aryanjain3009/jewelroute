/* Self-serve workspaces: signup, onboarding, a brand-new agent and shop working end to end, and isolation
 * between three workspaces created through signup (lists, search, records, activity, webhooks, ack, files). */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { addDays, istDate } from '@jewelroute/shared';
import { api, BASE, db, dispatch, J, login, start, stop, uploadProof } from './harness';

const TODAY = istDate();
const key = () => ({ 'Idempotency-Key': randomUUID() });
/** Signup workspaces outlive the demo reseed, so every run uses fresh names and emails. */
const RUN = randomUUID().slice(0, 6);

before(() => start());
after(stop);

interface Ws {
  n: number;
  owner: string;
  agentToken: string;
  agentId: string;
  shop: J;
  design: J;
  pieceIds: string[];
  visitId: string;
  orderId: string;
  memoId: string;
  ackUrl: string;
  fileId: string;
  endpointId: string;
  tag: string;
}

async function signup(workspaceName: string, email: string, password = 'Owner@2026') {
  return api(null, 'POST', '/v1/auth/signup', { workspaceName, name: `Owner of ${workspaceName}`, email, password });
}

/** A workspace from nothing, through the same API calls the onboarding checklist sends the owner to. */
async function buildWorkspace(n: number): Promise<Ws> {
  const tag = `T${n}${randomUUID().slice(0, 6)}`;
  const s = await signup(`Isolation ${tag} Jewels`, `owner-${tag.toLowerCase()}@ws.test`);
  assert.equal(s.status, 201, JSON.stringify(s.json));
  const owner: string = s.data.accessToken;

  assert.equal((await api(owner, 'POST', '/v1/admin/gold-rates', { purity: 'K22', ratePaisePerGram: 10_500_00 })).status, 201);
  const design = (await api(owner, 'POST', '/v1/admin/designs', { sku: `SKU-${tag}`, name: `Bangle ${tag}`, category: 'Bangles', collection: 'Core', purity: 'K22', grossWeightMg: 20_000, netWeightMg: 18_000, makingChargeType: 'PER_GRAM', makingChargeValue: 650_00 })).data.design;
  assert.ok(design?.id);
  const intake = await api(owner, 'POST', `/v1/admin/designs/${design.id}/pieces`, { count: 2 });
  assert.equal(intake.status, 201, JSON.stringify(intake.json));
  const pieceIds: string[] = intake.data.pieces.map((p: J) => p.id);

  const shop = (await api(owner, 'POST', '/v1/admin/shops', { name: `Shop ${tag}`, address: '1 Test Road', area: `Area ${tag}`, lat: 28.6 + n / 100, lng: 77.2, geofenceRadiusM: 100, creditLimitPaise: 50_00_000_00 })).data.shop;
  assert.ok(shop?.id);
  const agentEmail = `agent-${tag.toLowerCase()}@ws.test`;
  const agent = await api(owner, 'POST', '/v1/admin/agents', { name: `Agent ${tag}`, email: agentEmail, password: 'Agent@2026' });
  assert.equal(agent.status, 201, JSON.stringify(agent.json));
  const agentId: string = agent.data.agent.id;
  assert.equal((await api(owner, 'POST', '/v1/admin/pieces/issue', { pieceIds, agentId })).status, 200);
  const visit = await api(owner, 'POST', '/v1/admin/assignments', { agentId, shopId: shop.id, date: TODAY, plannedTime: '10:30' });
  assert.equal(visit.status, 201, JSON.stringify(visit.json));
  const visitId: string = visit.data.visit.id;

  const ep = await api(owner, 'POST', '/v1/admin/webhooks', { url: `http://127.0.0.1:${process.env.TEST_PORT ?? 4107}/v1/dev/webhook-receiver/ws-${tag}`, events: ['*'] });
  assert.equal(ep.status, 201, JSON.stringify(ep.json));

  // The new agent works the new shop in the field app: route → real GPS check-in → photo → order → memo → complete.
  const agentToken = await login(agentEmail, 'Agent@2026');
  const today = (await api(agentToken, 'GET', '/v1/field/today')).data;
  assert.ok(JSON.stringify(today).includes(visitId), 'the planned visit is on the new agent’s route');
  const ci = await api(agentToken, 'POST', `/v1/visits/${visitId}/check-in`, { lat: shop.lat, lng: shop.lng, accuracyM: 10 }, key());
  assert.equal(ci.status, 200, JSON.stringify(ci.json));
  assert.equal(ci.data.visit.verification, 'VERIFIED');
  const proof = await uploadProof(agentToken, visitId, shop.lat, shop.lng);
  const fileId = String(proof.proof?.url ?? proof.url ?? '').split('/').pop()!;
  assert.ok(fileId, JSON.stringify(proof));
  const order = await api(agentToken, 'POST', '/v1/orders', { visitId, items: [{ designId: design.id, quantity: 1 }] }, key());
  assert.equal(order.status, 201, JSON.stringify(order.json));
  const memo = await api(agentToken, 'POST', '/v1/memos', { visitId, pieceIds: [pieceIds[0]], dueDate: addDays(TODAY, 5) }, key());
  assert.equal(memo.status, 201, JSON.stringify(memo.json));
  const done = await api(agentToken, 'POST', `/v1/visits/${visitId}/complete`, { lat: shop.lat, lng: shop.lng, summary: 'first visit' });
  assert.equal(done.status, 200, JSON.stringify(done.json));

  return { n, owner, agentToken, agentId, shop, design, pieceIds, visitId, orderId: order.data.order.id, memoId: memo.data.memo.id, ackUrl: memo.data.ack.url, fileId, endpointId: ep.data.endpoint.id, tag };
}

describe('self-serve workspaces', () => {
  test('S1. signup creates a workspace and its owner, signs them in, and the workspace starts real (not demo)', async () => {
    const r = await signup(`Mehra Gold House ${RUN}`, `neha-${RUN}@mehragold.test`);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.data.user.role, 'ADMIN');
    assert.equal(r.data.user.tenant.name, `Mehra Gold House ${RUN}`);
    assert.equal(r.data.user.tenant.slug, `mehra-gold-house-${RUN}`);
    assert.equal(r.data.user.tenant.demoMode, false, 'simulated GPS is for the demo tenant only');
    const me = await api(r.data.accessToken, 'GET', '/v1/auth/me');
    assert.equal(me.data.email, `neha-${RUN}@mehragold.test`);
    const t = await db.tenant.findUniqueOrThrow({ where: { slug: `mehra-gold-house-${RUN}` }, include: { users: true } });
    assert.equal(t.users.length, 1);
    assert.equal(await db.auditLog.count({ where: { tenantId: t.id, action: 'tenant.signup' } }), 1);
    // The new owner can sign in with the same credentials.
    assert.ok(await login(`neha-${RUN}@mehragold.test`, 'Owner@2026'));
    // Same name again → its own workspace with its own slug.
    const twin = await signup(`Mehra Gold House ${RUN}`, `raj-${RUN}@mehragold.test`);
    assert.equal(twin.status, 201);
    assert.notEqual(twin.data.user.tenant.id, r.data.user.tenant.id);
    assert.equal(twin.data.user.tenant.slug, `mehra-gold-house-${RUN}-2`);
  });

  test('S2. signup refuses bad input and an email that already signs in anywhere', async () => {
    assert.equal((await signup('X', 'short@pw.test', 'short')).status, 400);
    assert.equal((await api(null, 'POST', '/v1/auth/signup', { workspaceName: 'No email' })).status, 400);
    const taken = await signup('Another Aurum', 'admin@aurum.test');
    assert.equal(taken.status, 409);
    assert.equal(taken.error.code, 'EMAIL_TAKEN');
    // An admin cannot create an agent whose email signs in to another workspace either (login stays unambiguous).
    const owner = (await signup('Agent Clash Co', `owner-${RUN}@clash.test`)).data.accessToken;
    const clash = await api(owner, 'POST', '/v1/admin/agents', { name: 'Clash', email: 'rahul@aurum.test', password: 'Agent@2026' });
    assert.equal(clash.status, 409);
    assert.equal(clash.error.code, 'EMAIL_TAKEN');
  });

  test('S3. ten concurrent signups with one email create exactly one workspace', async () => {
    const email = `race-${randomUUID().slice(0, 8)}@ws.test`;
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => signup(`Race ${i} Jewels`, email)));
    assert.equal(rs.filter((r) => r.status === 201).length, 1, rs.map((r) => r.status).join(','));
    assert.ok(rs.filter((r) => r.status !== 201).every((r) => r.status === 409));
    assert.equal(await db.user.count({ where: { email } }), 1);
  });

  test('S4. onboarding: an empty workspace lists six steps; each completes from real data', async () => {
    const owner = (await signup('Onboarding Jewels', `owner-${RUN}@onboarding.test`)).data.accessToken;
    let ob = (await api(owner, 'GET', '/v1/admin/onboarding')).data;
    assert.deepEqual(ob.steps.map((s: J) => s.key), ['gold_rate', 'catalog', 'shop', 'agent', 'issue', 'visit']);
    assert.ok(ob.steps.every((s: J) => s.done === false));
    assert.equal(ob.complete, false);
    // Home of an empty workspace answers (no 500 on zero shops, zero rates, zero agents).
    const home = await api(owner, 'GET', `/v1/admin/home?date=${TODAY}`);
    assert.equal(home.status, 200, JSON.stringify(home.json));

    await api(owner, 'POST', '/v1/admin/gold-rates', { purity: 'K22', ratePaisePerGram: 10_500_00 });
    const design = (await api(owner, 'POST', '/v1/admin/designs', { sku: 'OB-1', name: 'Onboarding Bangle', category: 'Bangles', collection: 'Core', purity: 'K22', grossWeightMg: 20_000, netWeightMg: 18_000, makingChargeType: 'PER_GRAM', makingChargeValue: 650_00 })).data.design;
    ob = (await api(owner, 'GET', '/v1/admin/onboarding')).data;
    assert.deepEqual(ob.steps.filter((s: J) => s.done).map((s: J) => s.key), ['gold_rate'], 'a design without a tagged piece is not a catalog yet');
    const pieces = (await api(owner, 'POST', `/v1/admin/designs/${design.id}/pieces`, { count: 1 })).data.pieces;
    const shop = (await api(owner, 'POST', '/v1/admin/shops', { name: 'Onboarding Shop', address: 'Road', area: 'Area', lat: 28.5, lng: 77.1 })).data.shop;
    const agent = (await api(owner, 'POST', '/v1/admin/agents', { name: 'Onboarding Agent', email: `agent-${RUN}@onboarding.test`, password: 'Agent@2026' })).data.agent;
    await api(owner, 'POST', '/v1/admin/pieces/issue', { pieceIds: [pieces[0].id], agentId: agent.id });
    ob = (await api(owner, 'GET', '/v1/admin/onboarding')).data;
    assert.deepEqual(ob.steps.filter((s: J) => !s.done).map((s: J) => s.key), ['visit']);
    await api(owner, 'POST', '/v1/admin/assignments', { agentId: agent.id, shopId: shop.id, date: TODAY });
    ob = (await api(owner, 'GET', '/v1/admin/onboarding')).data;
    assert.equal(ob.complete, true);
    // Agents have no onboarding.
    const agentToken = await login(`agent-${RUN}@onboarding.test`, 'Agent@2026');
    assert.equal((await api(agentToken, 'GET', '/v1/admin/onboarding')).status, 403);
  });

  test('S5. three workspaces built from signup see nothing of each other', async () => {
    const ws: Ws[] = [];
    for (const n of [1, 2, 3]) ws.push(await buildWorkspace(n));
    for (let i = 0; i < 6; i++) await dispatch();

    for (const me of ws) {
      const others = ws.filter((w) => w !== me);
      const theirIds = new Set(others.flatMap((o) => [o.agentId, o.shop.id, o.design.id, o.visitId, o.orderId, o.memoId, o.fileId, o.endpointId, ...o.pieceIds]));
      const lists = ['/v1/admin/shops', '/v1/admin/agents', '/v1/admin/designs', '/v1/admin/pieces', `/v1/admin/visits?date=${TODAY}`, '/v1/admin/orders', '/v1/admin/memos', '/v1/admin/activity', '/v1/admin/webhooks', '/v1/admin/webhooks/deliveries', '/v1/admin/webhooks/received', '/v1/admin/audit', `/v1/admin/home?date=${TODAY}`];
      for (const path of lists) {
        const r = await api(me.owner, 'GET', path);
        assert.equal(r.status, 200, `${path} ${JSON.stringify(r.json)}`);
        const body = JSON.stringify(r.data);
        for (const id of theirIds) assert.ok(!body.includes(id), `workspace ${me.n} ${path} leaks ${id}`);
        for (const o of others) assert.ok(!body.includes(o.tag), `workspace ${me.n} ${path} leaks names of workspace ${o.n}`);
      }
      // My own photo URL works for me, so the foreign 404s below are about tenancy, not a malformed id.
      assert.equal((await fetch(`${BASE}/v1/files/${me.fileId}`, { headers: { authorization: `Bearer ${me.owner}` } })).status, 200);
      // My own data is there (the lists are not just empty).
      assert.ok(JSON.stringify((await api(me.owner, 'GET', '/v1/admin/shops')).data).includes(me.shop.id));
      assert.ok(JSON.stringify((await api(me.owner, 'GET', '/v1/admin/activity')).data).includes(me.orderId));

      for (const o of others) {
        // ⌘K search by the other workspace's unique tag finds nothing.
        const s = await api(me.owner, 'GET', `/v1/admin/search?q=${o.tag}`);
        assert.equal(s.status, 200);
        assert.ok(!JSON.stringify(s.data).includes(o.tag), `search in ${me.n} finds ${o.n}`);
        // Records, mutations and files by foreign id → 404.
        for (const path of [`/v1/admin/shops/${o.shop.id}`, `/v1/admin/agents/${o.agentId}`, `/v1/admin/visits/${o.visitId}`, `/v1/admin/orders/${o.orderId}`, `/v1/admin/memos/${o.memoId}`, `/v1/admin/pieces/${o.pieceIds[1]}`, `/v1/admin/shops/${o.shop.id}/credit`, `/v1/admin/activity?shopId=${o.shop.id}`, `/v1/files/${o.fileId}`, `/v1/visits/${o.visitId}`, `/v1/orders/${o.orderId}`, `/v1/memos/${o.memoId}`]) {
          const r = await api(me.owner, 'GET', path);
          const leaked = r.status === 200 && JSON.stringify(r.data ?? r.json).includes(o.tag);
          assert.ok(r.status === 404 || (path.includes('activity?') && !leaked && (r.data ?? []).length === 0), `${me.n} GET ${path} → ${r.status}`);
        }
        const agentFile = await api(me.agentToken, 'GET', `/v1/files/${o.fileId}`);
        assert.equal(agentFile.status, 404, 'a photo URL from another workspace');
        assert.equal((await api(me.owner, 'PATCH', `/v1/admin/shops/${o.shop.id}`, { name: 'hijack' })).status, 404);
        assert.equal((await api(me.owner, 'PATCH', `/v1/admin/agents/${o.agentId}`, { active: false })).status, 404);
        assert.equal((await api(me.owner, 'POST', '/v1/admin/assignments', { agentId: o.agentId, shopId: me.shop.id, date: TODAY })).status, 404);
        assert.equal((await api(me.owner, 'POST', '/v1/admin/assignments', { agentId: me.agentId, shopId: o.shop.id, date: TODAY })).status, 404);
        assert.equal((await api(me.owner, 'POST', '/v1/admin/pieces/issue', { pieceIds: [o.pieceIds[1]], agentId: me.agentId })).status, 404);
        assert.equal((await api(me.owner, 'POST', `/v1/admin/orders/${o.orderId}/cancel`, {})).status, 404);
        assert.equal((await api(me.owner, 'POST', `/v1/admin/memos/${o.memoId}/extend`, { dueDate: addDays(TODAY, 9), reason: 'x' })).status, 404);
        assert.equal((await api(me.agentToken, 'POST', `/v1/memos/${o.memoId}/ack/link`)).status, 404);
        assert.equal((await api(me.agentToken, 'POST', `/v1/memos/${o.memoId}/ack/verify`, { code: '000000' })).status, 404);
        assert.equal((await api(me.agentToken, 'POST', `/v1/memos/${o.memoId}/return`, { pieceIds: [o.pieceIds[0]] }, key())).status, 404);
      }
      // The public ack page shows only its own memo's workspace and pieces.
      const token = me.ackUrl.split('/').pop()!;
      const pub = await api(null, 'GET', `/v1/public/memo-ack/${token}`);
      assert.equal(pub.status, 200, JSON.stringify(pub.json));
      for (const o of others) assert.ok(!JSON.stringify(pub.data).includes(o.tag));
    }

    // Webhooks: every delivery of an endpoint carries only its own workspace's events.
    for (const w of ws) {
      const t = await db.webhookEndpoint.findUniqueOrThrow({ where: { id: w.endpointId } });
      const deliveries = await db.webhookDelivery.findMany({ where: { endpointId: w.endpointId }, include: { event: true } });
      assert.ok(deliveries.length >= 5, `workspace ${w.n} got its own events (${deliveries.length})`);
      assert.ok(deliveries.every((d) => d.event.tenantId === t.tenantId), `workspace ${w.n} received a foreign event`);
      const received = await db.receivedWebhook.findMany({ where: { endpointId: w.endpointId } });
      for (const r of received) for (const o of ws.filter((x) => x !== w)) assert.ok(!JSON.stringify(r.body).includes(o.tag));
    }
  });
  test('S6. deactivating an agent cancels their planned visits, blocks sign-in, and flags the pieces they still hold', async () => {
    const w = await buildWorkspace(4);
    const later = await api(w.owner, 'POST', '/v1/admin/assignments', { agentId: w.agentId, shopId: w.shop.id, date: addDays(TODAY, 1), plannedTime: '11:00' });
    assert.equal(later.status, 201);
    // pieceIds[1] is still in the agent's bag (pieceIds[0] went on memo).
    const off = await api(w.owner, 'PATCH', `/v1/admin/agents/${w.agentId}`, { active: false });
    assert.equal(off.status, 200, JSON.stringify(off.json));
    assert.equal(off.data.agent.active, false);
    assert.equal(off.data.cancelledVisits, 1);
    assert.equal((await db.visit.findUniqueOrThrow({ where: { id: later.data.visit.id } })).status, 'CANCELLED');
    // The cancelled visit carries its own audit row (who, why, before → after), like an unassign does.
    const trail = await db.auditLog.findMany({ where: { entityType: 'Visit', entityId: later.data.visit.id, action: 'visit.cancel_on_deactivate' } });
    assert.equal(trail.length, 1);
    assert.deepEqual([trail[0].before, (trail[0].after as J).status], [{ status: 'PLANNED' }, 'CANCELLED']);
    assert.equal((await db.visit.findUniqueOrThrow({ where: { id: w.visitId } })).status, 'COMPLETED', 'history is untouched');
    assert.equal((await api(w.agentToken, 'GET', '/v1/field/today')).error.code, 'ACCOUNT_DISABLED');

    let home = (await api(w.owner, 'GET', `/v1/admin/home?date=${TODAY}`)).data;
    const flag = home.attention.find((a: J) => a.kind === 'AGENT_INACTIVE_CUSTODY');
    assert.ok(flag, JSON.stringify(home.attention));
    assert.equal(flag.severity, 'high');
    assert.deepEqual(flag.entity, { type: 'agent', id: w.agentId });
    assert.match(flag.title, /deactivated and still holds 1 piece/);
    assert.ok(!home.attention.some((a: J) => a.kind === 'VISIT_MISSED' && a.entity.id === later.data.visit.id));

    // Pieces back to the vault → nothing left to flag.
    assert.equal((await api(w.owner, 'POST', '/v1/admin/pieces/return-to-vault', { pieceIds: [w.pieceIds[1]] })).status, 200);
    home = (await api(w.owner, 'GET', `/v1/admin/home?date=${TODAY}`)).data;
    assert.ok(!home.attention.some((a: J) => a.kind === 'AGENT_INACTIVE_CUSTODY'));

    // Reactivate: they can sign in again; cancelled visits stay cancelled (plan them again on purpose).
    const on = await api(w.owner, 'PATCH', `/v1/admin/agents/${w.agentId}`, { active: true });
    assert.equal(on.status, 200);
    assert.equal(on.data.cancelledVisits, 0);
    const email = (await db.user.findUniqueOrThrow({ where: { id: w.agentId } })).email;
    assert.ok(await login(email, 'Agent@2026'));
    assert.equal((await db.visit.findUniqueOrThrow({ where: { id: later.data.visit.id } })).status, 'CANCELLED');
  });
  test('S7. deactivation racing ten assignments never leaves a planned visit for an inactive agent', async () => {
    const w = await buildWorkspace(5);
    const days = Array.from({ length: 10 }, (_, i) => addDays(TODAY, i + 1));
    const [off, ...assigned] = await Promise.all([
      api(w.owner, 'PATCH', `/v1/admin/agents/${w.agentId}`, { active: false }),
      ...days.map((date) => api(w.owner, 'POST', '/v1/admin/assignments', { agentId: w.agentId, shopId: w.shop.id, date })),
    ]);
    assert.equal(off.status, 200);
    assert.ok(assigned.every((r) => r.status === 201 || (r.status === 409 && r.error.code === 'AGENT_INACTIVE')), assigned.map((r) => r.status).join(','));
    assert.equal(await db.visit.count({ where: { agentId: w.agentId, status: 'PLANNED' } }), 0);
    assert.equal(off.data.cancelledVisits, assigned.filter((r) => r.status === 201).length, 'every assignment that won the race was cancelled');
  });
});
