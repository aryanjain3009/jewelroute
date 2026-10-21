/* Webhook egress (SSRF) guard — the server runs with WEBHOOK_ALLOW_PRIVATE off, as in production.
 * Endpoint URLs that are not http(s) or resolve to loopback / private / link-local / metadata ranges are
 * refused at create and update, and every delivery re-checks at connect time (DNS rebinding). The app's own
 * built-in demo receiver (API_PUBLIC_URL + /v1/dev/webhook-receiver/…) stays allowed while it is enabled. */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { allowPrivateFor, isForbiddenAddress, isOwnReceiver } from '../src/webhooks/egress';
import { api, BASE, db, login, start, stop } from './harness';

let ADMIN: string;
before(async () => {
  await start({ WEBHOOK_ALLOW_PRIVATE: 'false' });
  ADMIN = await login('admin@aurum.test', 'Aurum@2026');
});
after(stop);

describe('webhook egress guard', () => {
  test('E1. address classification (IPv4, IPv6, mapped, NAT64)', () => {
    const blocked = ['127.0.0.1', '127.9.9.9', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '100.100.100.200', '0.0.0.0', '192.0.0.10', '198.18.0.1', '224.0.0.1', '255.255.255.255',
      '::', '::1', 'fc00::1', 'fd00:ec2::254', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '64:ff9b::a9fe:a9fe', '::127.0.0.1',
      '2002:7f00:1::', '2002:a9fe:a9fe::', '2002:808:808::' /* 6to4 */, '64:ff9b:1::a9fe:a9fe', '64:ff9b:1::808:808' /* NAT64 local-use */,
      '2001:0:4136:e378:8000:63bf:3fff:fdd2', '2001::1' /* Teredo */, '100::1' /* discard */];
    const allowed = ['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '203.0.113.9', '2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8'];
    for (const ip of blocked) assert.equal(isForbiddenAddress(ip), true, ip);
    for (const ip of allowed) assert.equal(isForbiddenAddress(ip), false, ip);
    // own-receiver exemption: exact origin + exact path pattern only
    const api = 'http://127.0.0.1:4107';
    assert.equal(isOwnReceiver(`${api}/v1/dev/webhook-receiver/demo-abc_1`, api), true);
    for (const u of [`${api}/v1/dev/webhook-receiver/../../internal/dispatch`, `${api}/v1/dev/webhook-receiver/a%2F..%2Finternal`, `${api}/v1/dev/webhook-receiver/a/b`, `${api}/v1/dev/webhook-receiver/a?x=1`,
      `${api}/v1/dev/webhook-receiver/`, 'http://127.0.0.2:4107/v1/dev/webhook-receiver/a', 'http://user:pw@127.0.0.1:4107/v1/dev/webhook-receiver/a', `${api}/v1/dev/webhook-receiver/a#f`]) assert.equal(isOwnReceiver(u, api), false, u);
    // WEBHOOK_ALLOW_PRIVATE is ignored in production except for a demo-mode tenant
    assert.equal(allowPrivateFor({ WEBHOOK_ALLOW_PRIVATE: 'true', NODE_ENV: 'development' }, false), true);
    assert.equal(allowPrivateFor({ WEBHOOK_ALLOW_PRIVATE: 'true', NODE_ENV: 'production' }, false), false);
    // Never in production, not even for the public demo tenant (re-review N1): its login is on the sign-in page.
    assert.equal(allowPrivateFor({ WEBHOOK_ALLOW_PRIVATE: 'true', NODE_ENV: 'production' }, true), false);
    assert.equal(allowPrivateFor({ WEBHOOK_ALLOW_PRIVATE: undefined, NODE_ENV: 'development' }, true), false);
  });

  test('E2. create / update refuse private, loopback, link-local, metadata and non-http(s) targets; the own demo receiver is allowed', async () => {
    const before = await db.webhookEndpoint.count();
    const refused = ['http://127.0.0.1:9/hook', 'http://localhost:9/hook', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]:9/', 'http://10.1.2.3/x', 'http://[::ffff:127.0.0.1]/x', 'http://0.0.0.0/x', 'http://192.168.0.10/x',
      'http://127.0.0.2:4107/v1/dev/webhook-receiver/x' /* the own-receiver path on another host */,
      `${BASE}/v1/dev/webhook-receiver/../../internal/dispatch` /* traversal out of the exempt path */, `${BASE}/v1/dev/webhook-receiver/a%2F..%2F..%2Finternal`];
    for (const url of refused) {
      const r = await api(ADMIN, 'POST', '/v1/admin/webhooks', { url, events: ['memo.extended'] });
      assert.equal(r.status, 422, `${url} → ${r.status} ${JSON.stringify(r.json)}`);
      assert.equal(r.error.code, 'WEBHOOK_URL_FORBIDDEN', url);
      assert.ok(!/\d+\.\d+\.\d+\.\d+|::|resolve/i.test(r.error.message), `no address / DNS oracle in the message: ${r.error.message}`);
    }
    for (const url of ['ftp://example.com/hook', 'file:///etc/passwd', 'gopher://example.com/']) {
      const r = await api(ADMIN, 'POST', '/v1/admin/webhooks', { url, events: ['memo.extended'] });
      assert.ok([400, 422].includes(r.status), `${url} → ${r.status}`);
    }
    assert.equal(await db.webhookEndpoint.count(), before, 'nothing stored');
    const own = await api(ADMIN, 'POST', '/v1/admin/webhooks', { url: `${BASE}/v1/dev/webhook-receiver/own-${Date.now()}`, events: ['memo.extended'] });
    assert.equal(own.status, 201, JSON.stringify(own.json));
    const ping = await api(ADMIN, 'POST', `/v1/admin/webhooks/${own.data.endpoint.id}/test`);
    assert.equal(ping.data.delivery.status, 'SUCCEEDED', 'the built-in receiver still works');
    const patch = await api(ADMIN, 'PATCH', `/v1/admin/webhooks/${own.data.endpoint.id}`, { url: 'http://169.254.169.254/latest/' });
    assert.equal(patch.status, 422);
    assert.equal((await db.webhookEndpoint.findUniqueOrThrow({ where: { id: own.data.endpoint.id } })).url, own.data.endpoint.url, 'url unchanged');
  });

  test('E3. delivery re-checks at connect time: an endpoint whose host now resolves to a private address (DNS rebinding) is never called', async () => {
    let hits = 0;
    const srv = createServer((_req, res) => {
      hits++;
      res.writeHead(200).end('ok');
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
    const port = (srv.address() as AddressInfo).port;
    try {
      const own = await api(ADMIN, 'POST', '/v1/admin/webhooks', { url: `${BASE}/v1/dev/webhook-receiver/rebind-${Date.now()}`, events: ['memo.extended'] });
      assert.equal(own.status, 201);
      for (const url of [`http://localhost:${port}/hook`, `http://127.0.0.1:${port}/hook`]) {
        // simulate the record pointing somewhere private after it passed validation
        await db.webhookEndpoint.update({ where: { id: own.data.endpoint.id }, data: { url } });
        const ping = await api(ADMIN, 'POST', `/v1/admin/webhooks/${own.data.endpoint.id}/test`);
        assert.equal(ping.status, 200);
        assert.equal(ping.data.delivery.status, 'FAILED', url);
        assert.match(ping.data.delivery.lastError, /Blocked/, url);
      }
      assert.equal(hits, 0, 'no request reached the private address');
    } finally {
      srv.close();
    }
  });
});
