/* Request logs never carry bearer capabilities in the URL: the retailer ack token, the demo-receiver token and
 * any `token`/`code` query parameter are redacted by the pino-http serializer (audit review M2). */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { redactUrl } from '../src/common/redact';
import { api, login, serverLog, start, stop } from './harness';

before(async () => {
  await start({ LOG_LEVEL: 'info' }, { captureLogs: true });
});
after(stop);

describe('log redaction', () => {
  test('L1. serializer rules', () => {
    assert.equal(redactUrl('/v1/public/memo-ack/AbC_123-xyz0123456789'), '/v1/public/memo-ack/[redacted]');
    assert.equal(redactUrl('/v1/public/memo-ack/AbC_123-xyz0123456789?x=1'), '/v1/public/memo-ack/[redacted]?x=1');
    assert.equal(redactUrl('/v1/dev/webhook-receiver/demo-774c4d748ccb'), '/v1/dev/webhook-receiver/[redacted]');
    assert.equal(redactUrl('/ack/tok123'), '/ack/[redacted]');
    assert.equal(redactUrl('/v1/x?token=abc&y=2&code=123456'), '/v1/x?token=[redacted]&y=2&code=[redacted]');
    assert.equal(redactUrl('/v1/orders/abc'), '/v1/orders/abc');
  });

  test('L2. real request log lines contain no ack, receiver or query tokens', async () => {
    const ackTok = `ackSecret${Date.now()}AAAAAAAA`;
    const rcvTok = `rcvSecret${Date.now()}`;
    const qTok = `qSecret${Date.now()}`;
    const ADMIN = await login('admin@aurum.test', 'Aurum@2026');
    assert.equal((await api(null, 'GET', `/v1/public/memo-ack/${ackTok}`)).status, 404);
    assert.equal((await api(null, 'POST', `/v1/public/memo-ack/${ackTok}`, { confirm: true })).status, 404);
    assert.equal((await api(null, 'POST', `/v1/dev/webhook-receiver/${rcvTok}`, {})).status, 404);
    assert.equal((await api(ADMIN, 'GET', `/v1/admin/activity?token=${qTok}`)).status, 200);
    await new Promise((r) => setTimeout(r, 500));
    const log = serverLog.join('');
    assert.ok(log.includes('/v1/public/memo-ack/[redacted]'), 'request lines are logged, redacted');
    assert.ok(log.includes('/v1/dev/webhook-receiver/[redacted]'));
    for (const secret of [ackTok, rcvTok, qTok]) assert.ok(!log.includes(secret), `log leaks ${secret.slice(0, 9)}…`);
  });
});
