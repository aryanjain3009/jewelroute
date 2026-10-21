import { Body, Controller, Delete, Get, Global, HttpCode, Injectable, Module, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { EVENT_DESCRIPTIONS, WEBHOOK_EVENT_TYPES } from '@jewelroute/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { DeliveryStatus, Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma.service';
import { Public, Requires } from '../common/auth';
import { Ctx, ReqCtx } from '../common/context';
import { decryptSecret, encryptSecret, newWebhookSecret, safeEqual, signWebhook } from '../common/crypto';
import { AppError, badRequest, notFound } from '../common/errors';
import { parse } from '../common/http';
import { AuditService } from '../core/audit';
import { OutboxService } from '../core/outbox';
import { env, isProd } from '../env';
import { demoReceiverEnabled } from './demo-receiver';
import { Dispatcher } from './dispatcher';
import { allowPrivateFor, assertWebhookUrl, EgressPolicy, isOwnReceiver } from './egress';
import { runSeed } from '../seed/seed';

const EventList = z.array(z.enum([...WEBHOOK_EVENT_TYPES, '*'] as [string, ...string[]])).min(1);
const UrlSchema = z
  .string()
  .url()
  .max(500)
  .refine((u) => !isProd() || u.startsWith('https://'), 'Webhook URLs must use https in production');
const ReceivedQuery = z.object({ endpointId: z.string().min(1).max(64).optional() });
const CreateBody = z.object({ url: UrlSchema, description: z.string().max(500).optional(), events: EventList });
const PatchBody = z.object({ url: UrlSchema.optional(), description: z.string().max(500).optional(), events: EventList.optional(), active: z.boolean().optional() });

const DeliveriesQuery = z.object({
  endpointId: z.string().max(64).optional(),
  status: z.enum(['PENDING', 'SUCCEEDED', 'FAILED', 'DEAD']).optional(),
  eventType: z.string().max(64).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
const encodeCursor = (at: Date, id: string) => Buffer.from(`${at.toISOString()}|${id}`, 'utf8').toString('base64url');
function decodeCursor(cursor: string): { at: Date; id: string } {
  const [ts, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const at = new Date(ts ?? '');
  if (!id || Number.isNaN(at.getTime())) throw badRequest('VALIDATION_FAILED', 'Invalid cursor', [{ path: 'cursor', message: 'use nextCursor from the previous page' }]);
  return { at, id };
}

const EXAMPLES: Record<string, unknown> = {
  'visit.checked_in': { visitId: 'clx…', agent: { id: 'u_1', name: 'Rahul Verma' }, shop: { id: 's_1', name: 'Sharma Jewellers' }, lat: 28.6519, lng: 77.1907, accuracyM: 12, distanceM: 31, radiusM: 100, verification: 'VERIFIED' },
  'visit.completed': { visitId: 'clx…', agent: { id: 'u_1', name: 'Rahul Verma' }, shop: { id: 's_1', name: 'Sharma Jewellers' }, proofCount: 1, orderCount: 1, ordersValuePaise: 54321000, memoCount: 1 },
  'visit.proof_uploaded': { visitId: 'clx…', proofId: 'clp…', url: 'https://…/proof.jpg', checksumSha256: 'e3b0…', distanceFromCheckInM: 4 },
  'order.created': { orderId: 'clo…', number: 'ORD-2026-00042', totalPaise: 54321000, goldRateSnapshot: [{ purity: 'K22', ratePaisePerGram: 1054000 }], items: [{ sku: 'AJ-BNG-2201', quantity: 2 }] },
  'order.confirmed': { orderId: 'clo…', number: 'ORD-2026-00042', status: 'CONFIRMED', totalPaise: 36651726, reasons: [], credit: { creditLimitPaise: 250000000, outstandingPaise: 80000000, memoExposurePaise: 0, exposurePaise: 80000000, availableCreditPaise: 170000000, orderAmountPaise: 36651726, projectedExposurePaise: 116651726, requiresApproval: false, reasons: [] } },
  'order.pending_approval': { orderId: 'clo…', number: 'ORD-2026-00043', status: 'PENDING_APPROVAL', totalPaise: 620000000, reasons: ['CREDIT_LIMIT', 'ORDER_THRESHOLD'], credit: { creditLimitPaise: 250000000, exposurePaise: 116651726, orderAmountPaise: 620000000, projectedExposurePaise: 736651726, approvalThresholdPaise: 100000000, requiresApproval: true } },
  'order.approved': { orderId: 'clo…', number: 'ORD-2026-00042', status: 'APPROVED', totalPaise: 54321000, reasons: ['ORDER_THRESHOLD'] },
  'order.settled': { orderId: 'clo…', number: 'ORD-2026-00042', status: 'CONFIRMED', totalPaise: 36651726, settledAt: '2026-10-21T10:30:00.000Z' },
  'order.cancelled': { orderId: 'clo…', number: 'ORD-2026-00042', status: 'CANCELLED', fromStatus: 'CONFIRMED', totalPaise: 36651726, cancellationReason: 'Retailer changed the design' },
  'memo.acknowledged': { memoId: 'clm…', number: 'MEMO-2026-00017', method: 'QR_CONFIRM', ackAt: '2026-10-21T06:20:00.000Z', by: 'retailer', pieceCount: 1, pieces: [{ id: 'clp…', tagCode: 'AJ-S-000123' }] },
  'order.rejected': { orderId: 'clo…', number: 'ORD-2026-00042', status: 'REJECTED', rejectionReason: 'Credit limit' },
  'memo.created': { memoId: 'clm…', number: 'MEMO-2026-00017', dueDate: '2026-10-26', pieceCount: 2, totalValuePaise: 31250000 },
  'memo.extended': { memoId: 'clm…', number: 'MEMO-2026-00017', fromDueDate: '2026-10-26', dueDate: '2026-10-30' },
  'memo.returned': { memoId: 'clm…', number: 'MEMO-2026-00017', status: 'PARTIALLY_RETURNED', pieceCount: 1 },
  'memo.converted': { memoId: 'clm…', number: 'MEMO-2026-00017', status: 'CONVERTED_TO_ORDER', orderId: 'clo…', orderNumber: 'ORD-2026-00043', pieceCount: 1, totalPaise: 18800000, visitId: 'clx…' },
  'memo.overdue': { memoId: 'clm…', number: 'MEMO-2026-00011', dueDate: '2026-10-18', totalValuePaise: 18800000 },
  'sample.custody_changed': { pieces: [{ id: 'clp…', tagCode: 'AJ-S-000123', seq: 3 }], from: { type: 'AGENT' }, to: { type: 'SHOP' }, fromLabel: 'Rahul Verma', toLabel: 'Sharma Jewellers', reason: 'MEMO_HANDOVER' },
};

function toEndpoint(e: Prisma.WebhookEndpointGetPayload<object>, stats?: { succeeded24h: number; failed24h: number }) {
  return { id: e.id, url: e.url, description: e.description ?? undefined, events: e.events, active: e.active, secretLast4: e.secretLast4, createdAt: e.createdAt.toISOString(), updatedAt: e.updatedAt.toISOString(), stats: stats ?? { succeeded24h: 0, failed24h: 0 } };
}

type DeliveryRow = Prisma.WebhookDeliveryGetPayload<{ include: { event: { select: { type: true; payload: true } }; endpoint: { select: { url: true } } } }>;
function toDelivery(d: DeliveryRow) {
  return {
    id: d.id,
    endpointId: d.endpointId,
    endpointUrl: d.endpoint.url,
    eventId: d.eventId,
    eventType: d.event.type,
    status: d.status,
    attempts: d.attempts,
    lastStatusCode: d.lastStatusCode ?? undefined,
    lastLatencyMs: d.lastLatencyMs ?? undefined,
    lastError: d.lastError ?? undefined,
    nextAttemptAt: d.status === 'FAILED' || d.status === 'PENDING' ? d.nextAttemptAt.toISOString() : undefined,
    deliveredAt: d.deliveredAt?.toISOString(),
    createdAt: d.createdAt.toISOString(),
  };
}
const deliveryInclude = { event: { select: { type: true, payload: true } }, endpoint: { select: { url: true } } } as const;

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly dispatcher: Dispatcher,
  ) {}

  /** SSRF policy for a URL of this tenant: WEBHOOK_ALLOW_PRIVATE (local/test) or the own demo receiver while enabled. */
  private async policy(tenantId: string, url: string): Promise<EgressPolicy> {
    const t = await this.prisma.db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { demoMode: true } });
    const e = env();
    return { allowPrivate: allowPrivateFor(e, t.demoMode), ownReceiver: isOwnReceiver(url, e.API_PUBLIC_URL) && demoReceiverEnabled({ flag: e.ENABLE_DEMO_RECEIVER, nodeEnv: e.NODE_ENV, demoMode: t.demoMode }) };
  }

  private async endpoint(ctx: ReqCtx, id: string) {
    const e = await this.prisma.db.webhookEndpoint.findFirst({ where: { id, tenantId: ctx.user.tid } });
    if (!e) throw notFound('Webhook endpoint');
    return e;
  }

  eventTypes() {
    return WEBHOOK_EVENT_TYPES.map((type) => ({ type, description: EVENT_DESCRIPTIONS[type], example: { id: 'evt_01JABCDEF…', type, tenantId: 'aurum', createdAt: new Date().toISOString(), data: EXAMPLES[type] ?? {} } }));
  }

  async list(ctx: ReqCtx) {
    const tid = ctx.user.tid;
    const eps = await this.prisma.db.webhookEndpoint.findMany({ where: { tenantId: tid }, orderBy: { createdAt: 'asc' } });
    const since = new Date(Date.now() - 86400000);
    const stats = await this.prisma.db.webhookDelivery.groupBy({ by: ['endpointId', 'status'], where: { tenantId: tid, createdAt: { gte: since } }, _count: true });
    return eps.map((e) =>
      toEndpoint(e, {
        succeeded24h: stats.filter((s) => s.endpointId === e.id && s.status === 'SUCCEEDED').reduce((a, s) => a + s._count, 0),
        failed24h: stats.filter((s) => s.endpointId === e.id && (s.status === 'FAILED' || s.status === 'DEAD')).reduce((a, s) => a + s._count, 0),
      }),
    );
  }

  async create(ctx: ReqCtx, body: z.infer<typeof CreateBody>) {
    await assertWebhookUrl(body.url, await this.policy(ctx.user.tid, body.url));
    const secret = newWebhookSecret();
    return this.prisma.tx(async (tx) => {
      const e = await tx.webhookEndpoint.create({ data: { tenantId: ctx.user.tid, url: body.url, description: body.description, events: body.events, secretEncrypted: encryptSecret(secret), secretLast4: secret.slice(-4) } });
      await this.audit.log(tx, ctx, 'webhook.create', 'WebhookEndpoint', e.id, null, { url: e.url, events: e.events });
      return { endpoint: toEndpoint(e), secret };
    });
  }

  async patch(ctx: ReqCtx, id: string, body: z.infer<typeof PatchBody>) {
    const before = await this.endpoint(ctx, id);
    if (body.url) await assertWebhookUrl(body.url, await this.policy(ctx.user.tid, body.url));
    return this.prisma.tx(async (tx) => {
      const e = await tx.webhookEndpoint.update({ where: { id }, data: body });
      await this.audit.log(tx, ctx, 'webhook.update', 'WebhookEndpoint', id, { url: before.url, events: before.events, active: before.active }, { url: e.url, events: e.events, active: e.active });
      return { endpoint: toEndpoint(e) };
    });
  }

  /** Soft delete: deactivate (deliveries/attempt history are kept for audit). */
  async remove(ctx: ReqCtx, id: string) {
    await this.endpoint(ctx, id);
    await this.prisma.tx(async (tx) => {
      await tx.webhookEndpoint.update({ where: { id }, data: { active: false, url: (await tx.webhookEndpoint.findUniqueOrThrow({ where: { id } })).url } });
      await tx.webhookDelivery.updateMany({ where: { endpointId: id, status: { in: ['PENDING', 'FAILED'] } }, data: { status: 'DEAD', lastError: 'Endpoint deleted' } });
      await this.audit.log(tx, ctx, 'webhook.delete', 'WebhookEndpoint', id);
    });
    return {};
  }

  async rotate(ctx: ReqCtx, id: string) {
    await this.endpoint(ctx, id);
    const secret = newWebhookSecret();
    await this.prisma.tx(async (tx) => {
      await tx.webhookEndpoint.update({ where: { id }, data: { secretEncrypted: encryptSecret(secret), secretLast4: secret.slice(-4) } });
      await this.audit.log(tx, ctx, 'webhook.rotate_secret', 'WebhookEndpoint', id);
    });
    return { secret };
  }

  async reveal(ctx: ReqCtx, id: string) {
    const e = await this.endpoint(ctx, id);
    await this.prisma.tx((tx) => this.audit.log(tx, ctx, 'webhook.reveal_secret', 'WebhookEndpoint', id));
    return { secret: decryptSecret(e.secretEncrypted) };
  }

  /** Signed `ping` to this endpoint only, delivered synchronously. */
  async test(ctx: ReqCtx, id: string) {
    const e = await this.endpoint(ctx, id);
    const deliveryId = await this.prisma.tx(async (tx) => {
      const eventId = await this.outbox.emit(tx, {
        tenantId: ctx.user.tid,
        tenantSlug: ctx.user.tslug,
        type: 'ping',
        aggregateType: 'WebhookEndpoint',
        aggregateId: e.id,
        actorId: ctx.user.sub,
        targetEndpointId: e.id,
        data: { message: 'Hello from JewelRoute 👋', endpointId: e.id, actor: { id: ctx.user.sub, name: ctx.user.name ?? '' } },
      });
      await tx.outboxEvent.update({ where: { id: eventId }, data: { fannedOutAt: new Date() } });
      const d = await tx.webhookDelivery.create({ data: { tenantId: ctx.user.tid, endpointId: e.id, eventId } });
      return d.id;
    });
    const [claimed] = await this.dispatcher.claim(1, deliveryId);
    if (claimed) await this.dispatcher.deliver(claimed);
    return { delivery: await this.delivery(ctx, deliveryId) };
  }

  /**
   * Newest first. Without `cursor`/`limit` → the latest 100 as a bare array (v1 shape, kept for
   * compatibility). With either → `{ items, nextCursor }` keyset pages on (createdAt, id) desc;
   * `nextCursor` is opaque and absent on the last page.
   */
  async deliveries(ctx: ReqCtx, raw: unknown) {
    const q = parse(DeliveriesQuery, raw);
    const paged = q.cursor !== undefined || q.limit !== undefined;
    const where: Prisma.WebhookDeliveryWhereInput = {
      tenantId: ctx.user.tid,
      ...(q.endpointId ? { endpointId: q.endpointId } : {}),
      ...(q.status ? { status: q.status as DeliveryStatus } : {}),
      ...(q.eventType ? { event: { type: q.eventType } } : {}),
    };
    if (!paged) {
      const rows = await this.prisma.db.webhookDelivery.findMany({ where, include: deliveryInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100 });
      return rows.map(toDelivery);
    }
    const limit = q.limit ?? 50;
    const c = q.cursor ? decodeCursor(q.cursor) : undefined;
    const rows = await this.prisma.db.webhookDelivery.findMany({
      where: c ? { AND: [where, { OR: [{ createdAt: { lt: c.at } }, { createdAt: c.at, id: { lt: c.id } }] }] } : where,
      include: deliveryInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return { items: page.map(toDelivery), nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : undefined };
  }

  async delivery(ctx: ReqCtx, id: string) {
    const d = await this.prisma.db.webhookDelivery.findFirst({ where: { id, tenantId: ctx.user.tid }, include: { ...deliveryInclude, attemptLog: { orderBy: { attemptNo: 'asc' } } } });
    if (!d) throw notFound('Delivery');
    return {
      ...toDelivery(d),
      payload: d.event.payload,
      attemptLog: d.attemptLog.map((a) => ({ attemptNo: a.attemptNo, requestHeaders: a.requestHeaders ?? undefined, statusCode: a.statusCode ?? undefined, latencyMs: a.latencyMs ?? undefined, error: a.error ?? undefined, responseBody: a.responseBody ?? undefined, createdAt: a.createdAt.toISOString() })),
    };
  }

  async retry(ctx: ReqCtx, id: string) {
    await this.delivery(ctx, id);
    await this.dispatcher.retryNow(id);
    return { delivery: await this.delivery(ctx, id) };
  }

  async received(ctx: ReqCtx, endpointId?: string) {
    const rows = await this.prisma.db.receivedWebhook.findMany({ where: { tenantId: ctx.user.tid, ...(endpointId ? { endpointId } : {}) }, orderBy: { receivedAt: 'desc' }, take: 50 });
    return rows.map((r) => ({ id: r.id, endpointId: r.endpointId, deliveryId: r.deliveryId, eventId: r.eventId, eventType: r.eventType, signatureOk: r.signatureOk, headers: r.headers, body: r.body, receivedAt: r.receivedAt.toISOString() }));
  }

  /**
   * Built-in receiver: verifies the signature exactly as a customer would. It records only what it
   * actually processed: unknown tokens (and a disabled receiver) are a plain 404, a `fail-` token is a
   * simulated outage (500, nothing stored), a bad signature is stored with `signatureOk:false` and 401.
   * So every `signatureOk:true` row is a 200 the dispatcher saw as delivered.
   */
  async receive(token: string, req: Request & { rawBody?: Buffer }) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(token)) throw notFound('Receiver');
    const ep = await this.prisma.db.webhookEndpoint.findFirst({ where: { url: { endsWith: `/v1/dev/webhook-receiver/${token}` } }, include: { tenant: { select: { demoMode: true } } } });
    if (!ep || !demoReceiverEnabled({ flag: env().ENABLE_DEMO_RECEIVER, nodeEnv: env().NODE_ENV, demoMode: ep.tenant.demoMode })) throw notFound('Receiver');
    if (token.startsWith('fail-')) throw new AppError(500, 'SIMULATED_FAILURE', 'This demo receiver always fails (token starts with fail-)');
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(req.body ?? {});
    const ts = String(req.headers['x-jewelroute-timestamp'] ?? '');
    const sig = String(req.headers['x-jewelroute-signature'] ?? '');
    let ok = false;
    if (ts && sig) {
      const fresh = Math.abs(Date.now() / 1000 - Number(ts)) < 300;
      ok = fresh && safeEqual(sig, signWebhook(decryptSecret(ep.secretEncrypted), ts, raw));
    }
    let body: Prisma.InputJsonValue = {};
    try {
      body = JSON.parse(raw);
    } catch {
      body = { raw: raw.slice(0, 2000) };
    }
    const pick = (h: string) => (req.headers[h] ? String(req.headers[h]) : undefined);
    await this.prisma.db.receivedWebhook.create({
      data: {
        tenantId: ep.tenantId,
        endpointId: ep.id,
        endpointToken: token,
        deliveryId: pick('x-jewelroute-delivery'),
        eventId: (body as { id?: string }).id,
        eventType: pick('x-jewelroute-event'),
        signatureOk: ok,
        headers: { 'x-jewelroute-event': pick('x-jewelroute-event'), 'x-jewelroute-delivery': pick('x-jewelroute-delivery'), 'x-jewelroute-timestamp': pick('x-jewelroute-timestamp'), 'x-jewelroute-signature': pick('x-jewelroute-signature'), 'user-agent': pick('user-agent') },
        body,
      },
    });
    if (!ok) throw new AppError(401, 'INVALID_SIGNATURE', 'Signature verification failed');
    return { received: true, signatureOk: ok };
  }
}

@ApiTags('webhooks')
@Requires('admin')
@Controller('v1/admin/webhooks')
export class WebhooksController {
  constructor(
    private readonly hooks: WebhooksService,
    private readonly dispatcher: Dispatcher,
  ) {}

  @Get('event-types')
  eventTypes() {
    return this.hooks.eventTypes();
  }
  @Get()
  list(@Ctx() ctx: ReqCtx) {
    return this.hooks.list(ctx);
  }
  @Post()
  create(@Ctx() ctx: ReqCtx, @Body() body: unknown) {
    return this.hooks.create(ctx, parse(CreateBody, body));
  }
  @Get('deliveries')
  deliveries(@Ctx() ctx: ReqCtx, @Query() q: unknown) {
    this.dispatcher.maybeKick('deliveries');
    return this.hooks.deliveries(ctx, q);
  }
  @Get('deliveries/:id')
  delivery(@Ctx() ctx: ReqCtx, @Param('id') id: string) {
    return this.hooks.delivery(ctx, id);
  }
  @Post('deliveries/:id/retry')
  @HttpCode(200)
  retry(@Ctx() ctx: ReqCtx, @Param('id') id: string) {
    return this.hooks.retry(ctx, id);
  }
  @Get('received')
  received(@Ctx() ctx: ReqCtx, @Query() q: unknown) {
    return this.hooks.received(ctx, parse(ReceivedQuery, q).endpointId);
  }
  @Patch(':id')
  patch(@Ctx() ctx: ReqCtx, @Param('id') id: string, @Body() body: unknown) {
    return this.hooks.patch(ctx, id, parse(PatchBody, body));
  }
  @Delete(':id')
  remove(@Ctx() ctx: ReqCtx, @Param('id') id: string) {
    return this.hooks.remove(ctx, id);
  }
  @Post(':id/rotate-secret')
  @HttpCode(200)
  rotate(@Ctx() ctx: ReqCtx, @Param('id') id: string) {
    return this.hooks.rotate(ctx, id);
  }
  @Get(':id/secret')
  reveal(@Ctx() ctx: ReqCtx, @Param('id') id: string) {
    return this.hooks.reveal(ctx, id);
  }
  @Post(':id/test')
  @HttpCode(200)
  test(@Ctx() ctx: ReqCtx, @Param('id') id: string) {
    return this.hooks.test(ctx, id);
  }
}

@ApiTags('ops')
@Controller('v1')
export class OpsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: Dispatcher,
    private readonly hooks: WebhooksService,
  ) {}

  @Public()
  @SkipThrottle()
  @Get('health')
  async health() {
    let db = 'ok';
    try {
      await this.prisma.db.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    if (db !== 'ok') throw new AppError(503, 'UNHEALTHY', 'Database unreachable', { db });
    return { status: 'ok', db, time: new Date().toISOString(), version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev' };
  }

  private checkCron(req: Request) {
    const secret = env().CRON_SECRET;
    const header = String(req.headers['x-cron-secret'] ?? '');
    const bearer = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    if (!(header && safeEqual(header, secret)) && !(bearer && safeEqual(bearer, secret))) throw new AppError(401, 'INVALID_CRON_SECRET', 'Missing or invalid cron secret');
  }

  @Public()
  @SkipThrottle()
  @Post('internal/dispatch')
  @HttpCode(200)
  @ApiOperation({ summary: 'Fan out outbox → deliveries, send due deliveries, emit memo.overdue (x-cron-secret or Bearer CRON_SECRET)' })
  async dispatch(@Req() req: Request) {
    this.checkCron(req);
    return this.dispatcher.runOnce({ forceOverdue: true, limit: 50 });
  }

  @Public()
  @SkipThrottle()
  @Get('internal/dispatch')
  async dispatchGet(@Req() req: Request) {
    this.checkCron(req);
    return this.dispatcher.runOnce({ forceOverdue: true, limit: 50 });
  }

  @Public()
  @SkipThrottle()
  @Post('internal/seed')
  @HttpCode(200)
  @ApiOperation({ summary: 'Idempotently wipe + recreate the demo tenant `aurum` (x-cron-secret or Bearer CRON_SECRET)' })
  async seed(@Req() req: Request) {
    this.checkCron(req);
    return runSeed(this.prisma.db, { apiPublicUrl: env().API_PUBLIC_URL, encryptionKeyB64: env().APP_ENCRYPTION_KEY });
  }

  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post('dev/webhook-receiver/:token')
  @HttpCode(200)
  @ApiOperation({ summary: 'Demo receiver: verifies the JewelRoute signature and stores the event (404 when disabled or unknown; token starting with fail- returns 500 and stores nothing)' })
  receive(@Param('token') token: string, @Req() req: Request & { rawBody?: Buffer }, @Res({ passthrough: true }) _res: Response) {
    return this.hooks.receive(token, req);
  }
}

@Global()
@Module({ controllers: [WebhooksController, OpsController], providers: [WebhooksService], exports: [WebhooksService] })
export class WebhooksModule {}

export { badRequest };
