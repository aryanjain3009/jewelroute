import { Injectable, Logger } from '@nestjs/common';
import { istDate } from '@jewelroute/shared';
import { waitUntil } from '@vercel/functions';
import { PrismaService } from '../prisma.service';
import { decryptSecret, signWebhook } from '../common/crypto';
import { OutboxService } from '../core/outbox';
import { dateOf } from '../core/views';

/** Delay before retry N (after attempt N fails). 1 immediate attempt + 6 retries = 7 attempts, then DEAD. */
export const BACKOFF_SECONDS = [30, 120, 600, 1800, 7200, 21600];
export const MAX_ATTEMPTS = BACKOFF_SECONDS.length + 1;
const LOCK_SECONDS = 30;
const TIMEOUT_MS = 10_000;

/**
 * Extension point. Today the queue is Postgres itself (outbox + FOR UPDATE SKIP LOCKED), triggered
 * post-commit, opportunistically and by cron — Vercel functions cannot host a long-lived worker.
 * A BullMQ implementation would enqueue `deliver(deliveryId)` jobs with the same backoff ladder and
 * call `Dispatcher.deliver` from a worker; nothing else changes.
 */
export interface DispatchQueue {
  kick(reason: string): void;
}

export interface RunStats {
  overdueEmitted: number;
  visitsMissed: number;
  fannedOut: number;
  deliveriesCreated: number;
  attempted: number;
  succeeded: number;
  failed: number;
}

@Injectable()
export class Dispatcher implements DispatchQueue {
  private readonly log = new Logger('Dispatcher');
  private running: Promise<RunStats> | null = null;
  private rerun = false;
  private lastOpportunistic = 0;
  private lastOverdueScan = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  /** Post-commit trigger: keeps the serverless invocation alive until delivery finishes. */
  kick(reason: string) {
    const p = this.runOnce().catch((e) => {
      this.log.error({ err: e, reason }, 'dispatch failed');
      return null;
    });
    try {
      waitUntil(p);
    } catch {
      /* not on Vercel: the promise simply runs in the background */
    }
  }

  /** At most once per 10 s per instance (used by dashboard / delivery-log reads). */
  maybeKick(reason: string) {
    if (Date.now() - this.lastOpportunistic < 10_000) return;
    this.lastOpportunistic = Date.now();
    this.kick(reason);
  }

  async runOnce(opts: { forceOverdue?: boolean; limit?: number } = {}): Promise<RunStats> {
    if (this.running) {
      this.rerun = true;
      return this.running;
    }
    this.running = (async () => {
      const total: RunStats = { overdueEmitted: 0, visitsMissed: 0, fannedOut: 0, deliveriesCreated: 0, attempted: 0, succeeded: 0, failed: 0 };
      try {
        let rounds = 0;
        do {
          this.rerun = false;
          const s = await this.cycle(opts);
          for (const k of Object.keys(total) as (keyof RunStats)[]) total[k] += s[k];
          opts = { ...opts, forceOverdue: false };
        } while (this.rerun && ++rounds < 5);
      } finally {
        this.running = null;
      }
      return total;
    })();
    return this.running;
  }

  private async cycle(opts: { forceOverdue?: boolean; limit?: number }): Promise<RunStats> {
    const s: RunStats = { overdueEmitted: 0, visitsMissed: 0, fannedOut: 0, deliveriesCreated: 0, attempted: 0, succeeded: 0, failed: 0 };
    if (opts.forceOverdue || Date.now() - this.lastOverdueScan > 60_000) {
      this.lastOverdueScan = Date.now();
      s.overdueEmitted = await this.emitOverdue();
      s.visitsMissed = await this.markMissed();
    }
    const f = await this.fanOut();
    s.fannedOut = f.events;
    s.deliveriesCreated = f.deliveries;
    const ids = await this.claim(opts.limit ?? 25);
    const results = await Promise.all(ids.map((id) => this.deliver(id)));
    s.attempted = results.length;
    s.succeeded = results.filter((r) => r === 'SUCCEEDED').length;
    s.failed = results.length - s.succeeded;
    return s;
  }

  /** Emit memo.overdue exactly once per memo (guarded by overdueNotifiedAt, reset on extension). */
  async emitOverdue(): Promise<number> {
    const today = dateOf(istDate());
    const memos = await this.prisma.db.memo.findMany({
      where: { status: { in: ['ACTIVE', 'PARTIALLY_RETURNED'] }, dueDate: { lt: today }, overdueNotifiedAt: null },
      include: { tenant: { select: { slug: true } }, shop: { select: { id: true, name: true } }, agent: { select: { id: true, name: true } }, items: { where: { status: 'OUT' } } },
      take: 50,
    });
    let n = 0;
    for (const m of memos) {
      await this.prisma.tx(async (tx) => {
        const r = await tx.memo.updateMany({ where: { id: m.id, overdueNotifiedAt: null }, data: { overdueNotifiedAt: new Date() } });
        if (r.count !== 1) return;
        n++;
        await this.outbox.emit(tx, {
          tenantId: m.tenantId,
          tenantSlug: m.tenant.slug,
          type: 'memo.overdue',
          aggregateType: 'Memo',
          aggregateId: m.id,
          data: {
            memoId: m.id,
            number: m.number,
            dueDate: m.dueDate.toISOString().slice(0, 10),
            shop: m.shop,
            agent: m.agent,
            pieceCount: m.items.length,
            totalValuePaise: m.items.reduce((a, i) => a + Number(i.valuePaise), 0),
          },
        });
      });
    }
    return n;
  }

  /**
   * A PLANNED visit whose IST business day has passed can never be checked in (VISIT_NOT_TODAY), so it
   * is MISSED. Persisting that keeps every surface (lists, filters, attention, exports) on one truth.
   */
  async markMissed(): Promise<number> {
    const r = await this.prisma.db.visit.updateMany({ where: { status: 'PLANNED', plannedDate: { lt: dateOf(istDate()) } }, data: { status: 'MISSED' } });
    return r.count;
  }

  /** Outbox → one WebhookDelivery per subscribed active endpoint (unique endpointId+eventId). */
  async fanOut(): Promise<{ events: number; deliveries: number }> {
    return this.prisma.tx(async (tx) => {
      const events = await tx.$queryRaw<{ id: string; tenantId: string; type: string; targetEndpointId: string | null }[]>`
        SELECT id, "tenantId", type, "targetEndpointId" FROM "OutboxEvent"
        WHERE "fannedOutAt" IS NULL ORDER BY "createdAt" LIMIT 200 FOR UPDATE SKIP LOCKED`;
      if (!events.length) return { events: 0, deliveries: 0 };
      const tenantIds = [...new Set(events.map((e) => e.tenantId))];
      const endpoints = await tx.webhookEndpoint.findMany({ where: { tenantId: { in: tenantIds }, active: true }, select: { id: true, tenantId: true, events: true } });
      const rows: { tenantId: string; endpointId: string; eventId: string }[] = [];
      for (const e of events) {
        const targets = e.targetEndpointId
          ? [{ id: e.targetEndpointId }]
          : endpoints.filter((ep) => ep.tenantId === e.tenantId && (ep.events.includes(e.type) || ep.events.includes('*')));
        for (const t of targets) rows.push({ tenantId: e.tenantId, endpointId: t.id, eventId: e.id });
      }
      const created = rows.length ? await tx.webhookDelivery.createMany({ data: rows, skipDuplicates: true }) : { count: 0 };
      await tx.outboxEvent.updateMany({ where: { id: { in: events.map((e) => e.id) } }, data: { fannedOutAt: new Date() } });
      return { events: events.length, deliveries: created.count };
    });
  }

  /** Claim due deliveries; SKIP LOCKED lets concurrent dispatchers (instances, cron) share the work safely. */
  async claim(limit: number, onlyId?: string): Promise<string[]> {
    const rows = onlyId
      ? await this.prisma.db.$queryRaw<{ id: string }[]>`
          UPDATE "WebhookDelivery" SET "lockedUntil" = now() + make_interval(secs => ${LOCK_SECONDS})
          WHERE id IN (SELECT id FROM "WebhookDelivery" WHERE id = ${onlyId} AND ("lockedUntil" IS NULL OR "lockedUntil" < now()) FOR UPDATE SKIP LOCKED)
          RETURNING id`
      : await this.prisma.db.$queryRaw<{ id: string }[]>`
          UPDATE "WebhookDelivery" SET "lockedUntil" = now() + make_interval(secs => ${LOCK_SECONDS})
          WHERE id IN (
            SELECT id FROM "WebhookDelivery"
            WHERE status IN ('PENDING', 'FAILED') AND "nextAttemptAt" <= now() AND ("lockedUntil" IS NULL OR "lockedUntil" < now())
            ORDER BY "nextAttemptAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED)
          RETURNING id`;
    return rows.map((r) => r.id);
  }

  /** One signed HTTP attempt for a claimed delivery; records a WebhookAttempt and advances the state. */
  async deliver(deliveryId: string): Promise<string> {
    const d = await this.prisma.db.webhookDelivery.findUnique({ where: { id: deliveryId }, include: { endpoint: true, event: true } });
    if (!d) return 'MISSING';
    const attemptNo = d.attempts + 1;
    const rawBody = JSON.stringify(d.event.payload);
    const ts = Math.floor(Date.now() / 1000);
    let statusCode: number | undefined;
    let error: string | undefined;
    let responseBody: string | undefined;
    let requestHeaders: Record<string, string> | undefined;
    const started = Date.now();
    if (!d.endpoint.active && d.event.type !== 'ping') {
      // Disabled endpoint: park it as DEAD without an HTTP attempt (manual retry still works once re-enabled).
      await this.prisma.db.webhookDelivery.update({ where: { id: d.id }, data: { status: 'DEAD', lastError: 'Endpoint is disabled', lockedUntil: null } });
      return 'DEAD';
    }
    try {
      const secret = decryptSecret(d.endpoint.secretEncrypted);
      // Exactly what goes on the wire (the signature, never the secret) — recorded per attempt.
      requestHeaders = {
        'Content-Type': 'application/json',
        'User-Agent': 'JewelRoute-Webhooks/1.0',
        'X-JewelRoute-Event': d.event.type,
        'X-JewelRoute-Delivery': d.id,
        'X-JewelRoute-Timestamp': String(ts),
        'X-JewelRoute-Signature': signWebhook(secret, ts, rawBody),
      };
      const res = await fetch(d.endpoint.url, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), headers: requestHeaders, body: rawBody });
      statusCode = res.status;
      responseBody = (await res.text().catch(() => '')).slice(0, 2000);
      if (res.status < 200 || res.status >= 300) error = `HTTP ${res.status}`;
    } catch (e) {
      error = (e as Error).name === 'TimeoutError' ? `Timed out after ${TIMEOUT_MS / 1000}s` : String((e as Error).message ?? e).slice(0, 500);
    }
    const latencyMs = Date.now() - started;
    const ok = !error;
    const status = ok ? 'SUCCEEDED' : attemptNo >= MAX_ATTEMPTS ? 'DEAD' : 'FAILED';
    const next = ok || status === 'DEAD' ? d.nextAttemptAt : new Date(Date.now() + BACKOFF_SECONDS[Math.min(attemptNo - 1, BACKOFF_SECONDS.length - 1)] * 1000);
    await this.prisma.db.$transaction([
      this.prisma.db.webhookAttempt.create({ data: { deliveryId: d.id, attemptNo, statusCode, latencyMs, error, responseBody, requestHeaders } }),
      this.prisma.db.webhookDelivery.update({
        where: { id: d.id },
        data: {
          attempts: attemptNo,
          status,
          lastStatusCode: statusCode ?? null,
          lastLatencyMs: latencyMs,
          lastError: error ?? null,
          nextAttemptAt: next,
          deliveredAt: ok ? new Date() : null,
          lockedUntil: null,
        },
      }),
    ]);
    return status;
  }

  /**
   * Manual retry: reset + claim in ONE statement, so a concurrent dispatcher can never grab the delivery
   * between the reset and our claim. If another worker is mid-attempt (row locked), wait for it to finish.
   */
  async retryNow(deliveryId: string) {
    const claimed = await this.prisma.db.$queryRaw<{ id: string }[]>`
      UPDATE "WebhookDelivery" SET status = 'PENDING', "nextAttemptAt" = now(), "lockedUntil" = now() + make_interval(secs => ${LOCK_SECONDS})
      WHERE id = ${deliveryId} AND ("lockedUntil" IS NULL OR "lockedUntil" < now())
      RETURNING id`;
    if (claimed.length) {
      await this.deliver(deliveryId);
      return;
    }
    for (let i = 0; i < 50; i++) {
      const d = await this.prisma.db.webhookDelivery.findUnique({ where: { id: deliveryId }, select: { lockedUntil: true } });
      if (!d?.lockedUntil || d.lockedUntil < new Date()) return;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}
