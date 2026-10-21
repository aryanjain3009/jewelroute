import { Body, Controller, Get, HttpCode, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { addDays, istDate } from '@jewelroute/shared';
import { z } from 'zod';
import type { MemoItemStatus, MemoStatus } from '../../generated/prisma';
import { PrismaService, Tx } from '../prisma.service';
import { Public, Requires } from '../common/auth';
import { Ctx, ReqCtx } from '../common/context';
import { ackCode, ackCodeHash, randomToken, safeEqual, sha256 } from '../common/crypto';
import { AppError, badRequest, conflict, isUniqueViolation, notFound } from '../common/errors';
import { parse, ymd } from '../common/http';
import { AuditService } from '../core/audit';
import { CustodyService, fmtDoc, nextDocNumber } from '../core/custody';
import { IdempotencyService } from '../core/idempotency';
import { OutboxService } from '../core/outbox';
import { price, RatesService } from '../core/rates';
import { dateOf, ViewsService, ymdOf } from '../core/views';
import { env } from '../env';
import { OrdersModule, OrdersService } from './orders';
import { VisitsModule, VisitsService } from './visits';

const ACK_TTL_MS = 72 * 3600 * 1000;
const MAX_ACK_ATTEMPTS = 5;
const MAX_MEMO_DAYS = 90;

const CreateMemo = z.object({ visitId: z.string().min(1), pieceIds: z.array(z.string().min(1)).min(1).max(100), dueDate: ymd, notes: z.string().max(2000).optional() });
/** `visitId` is optional: when omitted the caller's open visit at the memo's shop (if any) is used, so returns/sales are attributed to the visit they happened in. */
const PiecesBody = z.object({ pieceIds: z.array(z.string().min(1)).min(1).max(100), visitId: z.string().min(1).max(64).optional() });
const ExtendBody = z.object({ dueDate: ymd, reason: z.string().max(1000).optional() });
const CodeBody = z.object({ code: z.string().regex(/^\d{6}$/, '6 digits') });
const ConfirmBody = z.object({ confirm: z.literal(true) });

interface LockedMemo {
  id: string;
  number: string;
  status: MemoStatus;
  shopId: string;
  agentId: string;
  visitId: string | null;
  dueDate: Date;
  ackStatus: string;
  ackAttempts: number;
  ackCodeHash: string | null;
}

export function nextMemoStatus(items: { status: MemoItemStatus }[]): MemoStatus {
  const out = items.filter((i) => i.status === 'OUT').length;
  if (out === items.length) return 'ACTIVE';
  if (out > 0) return 'PARTIALLY_RETURNED';
  return items.every((i) => i.status === 'CONVERTED') ? 'CONVERTED_TO_ORDER' : 'RETURNED';
}

@Injectable()
export class MemosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly views: ViewsService,
    private readonly rates: RatesService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly custody: CustodyService,
    private readonly idem: IdempotencyService,
    private readonly visits: VisitsService,
    private readonly orders: OrdersService,
  ) {}

  private async newAck(tx: Tx, memoId: string) {
    const token = randomToken(24);
    const expiresAt = new Date(Date.now() + ACK_TTL_MS);
    await tx.memo.update({
      where: { id: memoId },
      data: { ackTokenHash: sha256(token), ackCodeHash: ackCodeHash(memoId, ackCode(memoId, token)), ackTokenExpiresAt: expiresAt, ackAttempts: 0 },
    });
    return { url: `${env().APP_PUBLIC_URL}/ack/${token}`, token, expiresAt: expiresAt.toISOString() };
  }

  private async lock(tx: Tx, ctx: ReqCtx, id: string): Promise<LockedMemo> {
    const [m] = await tx.$queryRaw<LockedMemo[]>`
      SELECT id, number, status, "shopId", "agentId", "visitId", "dueDate", "ackStatus"::text AS "ackStatus", "ackAttempts", "ackCodeHash"
      FROM "Memo" WHERE id = ${id} AND "tenantId" = ${ctx.user.tid} FOR UPDATE`;
    if (!m || (ctx.user.role !== 'ADMIN' && m.agentId !== ctx.user.sub)) throw notFound('Memo');
    return m;
  }

  private shopRef(tx: Tx, id: string) {
    return tx.shop.findUniqueOrThrow({ where: { id }, select: { id: true, name: true } });
  }
  private agentRef(tx: Tx, id: string) {
    return tx.user.findUniqueOrThrow({ where: { id }, select: { id: true, name: true } });
  }

  /**
   * The visit a return/conversion belongs to: an explicit open visit of the caller at this shop, else the
   * caller's open visit there, else none. A return/conversion ON a visit needs that visit's arrival photo.
   */
  private async visitFor(tx: Tx, ctx: ReqCtx, shopId: string, explicit?: string): Promise<string | undefined> {
    if (explicit) {
      const v = await this.visits.lock(tx, ctx, explicit);
      this.visits.requireOpen(v);
      if (v.shopId !== shopId) throw conflict('VISIT_SHOP_MISMATCH', 'That visit is at a different shop than the memo');
      await this.visits.requireProof(tx, ctx, v.id);
      return v.id;
    }
    const open = await tx.visit.findFirst({ where: { tenantId: ctx.user.tid, agentId: ctx.user.sub, shopId, status: { in: ['CHECKED_IN', 'ACTIVE'] } }, select: { id: true } });
    if (open) await this.visits.requireProof(tx, ctx, open.id);
    return open?.id;
  }

  async create(ctx: ReqCtx, body: z.infer<typeof CreateMemo>) {
    this.idem.require(ctx);
    const tid = ctx.user.tid;
    const today = istDate();
    if (body.dueDate < today || body.dueDate > addDays(today, MAX_MEMO_DAYS)) throw badRequest('INVALID_DUE_DATE', `Due date must be between ${today} and ${addDays(today, MAX_MEMO_DAYS)}`);
    try {
      return await this.idem.run(ctx, async (tx, clientOpId) => {
        const v = await this.visits.lock(tx, ctx, body.visitId);
        this.visits.requireOpen(v);
        await this.visits.requireProof(tx, ctx, v.id);
        const year = new Date().getUTCFullYear();
        const number = fmtDoc('MEMO', year, await nextDocNumber(tx, tid, 'MEMO', year));
        const memo = await tx.memo.create({
          data: { tenantId: tid, number, shopId: v.shopId, agentId: ctx.user.sub, visitId: v.id, clientOpId, dueDate: dateOf(body.dueDate), notes: body.notes, totalValuePaise: 0n },
        });
        await this.custody.move(tx, ctx, {
          pieceIds: body.pieceIds,
          from: { type: 'AGENT', agentId: ctx.user.sub },
          to: { type: 'SHOP', shopId: v.shopId },
          reason: 'MEMO_HANDOVER',
          memoId: memo.id,
          memoNumber: number,
          visitId: v.id,
        });
        const rates = await this.rates.current(tid, tx);
        const pieces = await tx.samplePiece.findMany({ where: { tenantId: tid, id: { in: body.pieceIds } }, include: { design: true } });
        // Exposure at handover. A purity without a gold rate is an error, never a silent ₹0 memo.
        const valued = pieces.map((p) => ({ p, value: price(p.design, rates, p.netWeightMg).unitPricePaise }));
        const total = valued.reduce((s, x) => s + x.value, 0);
        await tx.memoItem.createMany({ data: valued.map((x) => ({ tenantId: tid, memoId: memo.id, pieceId: x.p.id, valuePaise: BigInt(x.value), status: 'OUT' as const })) });
        await tx.memo.update({ where: { id: memo.id }, data: { totalValuePaise: BigInt(total) } });
        const ack = await this.newAck(tx, memo.id);
        await this.audit.log(tx, ctx, 'memo.create', 'Memo', memo.id, null, { number, shopId: v.shopId, pieceIds: body.pieceIds, dueDate: body.dueDate, totalValuePaise: total });
        const shop = await this.shopRef(tx, v.shopId);
        await this.outbox.emit(tx, {
          tenantId: tid,
          tenantSlug: ctx.user.tslug,
          type: 'memo.created',
          aggregateType: 'Memo',
          aggregateId: memo.id,
          actorId: ctx.user.sub,
          data: {
            memoId: memo.id,
            number,
            visitId: v.id,
            dueDate: body.dueDate,
            agent: { id: ctx.user.sub, name: ctx.user.name ?? '' },
            shop,
            pieceCount: pieces.length,
            totalValuePaise: total,
            pieces: valued.map((x) => ({ id: x.p.id, tagCode: x.p.tagCode, sku: x.p.design.sku, name: x.p.design.name, purity: x.p.design.purity, netWeightMg: x.p.netWeightMg, valuePaise: x.value })),
          },
        });
        return { memo: await this.views.memo(tid, memo.id, tx), ack: { url: ack.url, expiresAt: ack.expiresAt } };
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        if (ctx.idempotencyKey) {
          const existing = await this.prisma.db.memo.findFirst({ where: { tenantId: tid, clientOpId: ctx.idempotencyKey } });
          if (existing) return { memo: await this.views.memo(tid, existing.id), ack: null };
        }
        throw conflict('PIECE_ALREADY_ON_MEMO', 'One or more pieces are already out on another memo');
      }
      throw e;
    }
  }

  async returnPieces(ctx: ReqCtx, id: string, body: z.infer<typeof PiecesBody>) {
    this.idem.require(ctx);
    const tid = ctx.user.tid;
    return this.idem.run(ctx, async (tx) => {
      const m = await this.lock(tx, ctx, id);
      const visitId = await this.visitFor(tx, ctx, m.shopId, body.visitId);
      const items = await tx.memoItem.findMany({ where: { memoId: id }, include: { piece: { select: { tagCode: true } } } });
      const out = new Set(items.filter((i) => i.status === 'OUT').map((i) => i.pieceId));
      const bad = body.pieceIds.filter((p) => !out.has(p));
      if (bad.length) throw conflict('PIECE_NOT_ON_MEMO', 'Some pieces are not outstanding on this memo', { pieceIds: bad });
      await this.custody.move(tx, ctx, {
        pieceIds: body.pieceIds,
        from: { type: 'SHOP', shopId: m.shopId },
        to: { type: 'AGENT', agentId: m.agentId },
        reason: 'MEMO_RETURN',
        memoId: id,
        memoNumber: m.number,
        visitId,
        notHeldCode: 'PIECE_NOT_AT_SHOP',
      });
      const now = new Date();
      await tx.memoItem.updateMany({ where: { memoId: id, pieceId: { in: body.pieceIds }, status: 'OUT' }, data: { status: 'RETURNED', returnedAt: now } });
      const after = await tx.memoItem.findMany({ where: { memoId: id } });
      const status = nextMemoStatus(after);
      await tx.memo.update({ where: { id }, data: { status, closedAt: ['RETURNED', 'CONVERTED_TO_ORDER'].includes(status) ? now : null } });
      await this.audit.log(tx, ctx, 'memo.return', 'Memo', id, { status: m.status }, { status, pieceIds: body.pieceIds });
      const returned = after.filter((i) => body.pieceIds.includes(i.pieceId));
      await this.outbox.emit(tx, {
        tenantId: tid,
        tenantSlug: ctx.user.tslug,
        type: 'memo.returned',
        aggregateType: 'Memo',
        aggregateId: id,
        actorId: ctx.user.sub,
        data: {
          memoId: id,
          number: m.number,
          status,
          shop: await this.shopRef(tx, m.shopId),
          agent: await this.agentRef(tx, m.agentId),
          pieceCount: returned.length,
          totalValuePaise: returned.reduce((s, i) => s + Number(i.valuePaise), 0),
          pieces: returned.map((i) => ({ id: i.pieceId, tagCode: items.find((x) => x.pieceId === i.pieceId)?.piece.tagCode })),
          outstandingCount: after.filter((i) => i.status === 'OUT').length,
          visitId,
        },
      });
      return { memo: await this.views.memo(tid, id, tx) };
    });
  }

  async extend(ctx: ReqCtx, id: string, body: z.infer<typeof ExtendBody>) {
    const tid = ctx.user.tid;
    return this.prisma.tx(async (tx) => {
      const m = await this.lock(tx, ctx, id);
      if (!['ACTIVE', 'PARTIALLY_RETURNED'].includes(m.status)) throw conflict('MEMO_CLOSED', `Memo is ${m.status}`);
      const from = ymdOf(m.dueDate)!;
      if (body.dueDate <= from) throw badRequest('INVALID_DUE_DATE', 'New due date must be after the current due date');
      if (body.dueDate < istDate()) throw badRequest('INVALID_DUE_DATE', 'New due date cannot be in the past');
      if (body.dueDate > addDays(istDate(), MAX_MEMO_DAYS)) throw badRequest('INVALID_DUE_DATE', `Max ${MAX_MEMO_DAYS} days ahead`);
      await tx.memoExtension.create({ data: { tenantId: tid, memoId: id, fromDueDate: m.dueDate, toDueDate: dateOf(body.dueDate), reason: body.reason, actorId: ctx.user.sub } });
      await tx.memo.update({ where: { id }, data: { dueDate: dateOf(body.dueDate), overdueNotifiedAt: null } });
      await this.audit.log(tx, ctx, 'memo.extend', 'Memo', id, { dueDate: from }, { dueDate: body.dueDate, reason: body.reason });
      await this.outbox.emit(tx, {
        tenantId: tid,
        tenantSlug: ctx.user.tslug,
        type: 'memo.extended',
        aggregateType: 'Memo',
        aggregateId: id,
        actorId: ctx.user.sub,
        data: { memoId: id, number: m.number, fromDueDate: from, dueDate: body.dueDate, reason: body.reason, shop: await this.shopRef(tx, m.shopId), actor: { id: ctx.user.sub, name: ctx.user.name ?? '' } },
      });
      return { memo: await this.views.memo(tid, id, tx) };
    });
  }

  async convert(ctx: ReqCtx, id: string, body: z.infer<typeof PiecesBody>) {
    this.idem.require(ctx);
    const tid = ctx.user.tid;
    return this.idem.run(ctx, async (tx, clientOpId) => {
      const m = await this.lock(tx, ctx, id);
      const visitId = await this.visitFor(tx, ctx, m.shopId, body.visitId);
      const items = await tx.memoItem.findMany({ where: { memoId: id } });
      const out = new Set(items.filter((i) => i.status === 'OUT').map((i) => i.pieceId));
      const bad = body.pieceIds.filter((p) => !out.has(p));
      if (bad.length) throw conflict('PIECE_NOT_ON_MEMO', 'Some pieces are not outstanding on this memo', { pieceIds: bad });
      await this.custody.move(tx, ctx, {
        pieceIds: body.pieceIds,
        from: { type: 'SHOP', shopId: m.shopId },
        to: { type: 'SOLD' },
        reason: 'CONVERTED_TO_SALE',
        memoId: id,
        memoNumber: m.number,
        visitId,
        notHeldCode: 'PIECE_NOT_AT_SHOP',
      });
      const pieces = await tx.samplePiece.findMany({ where: { tenantId: tid, id: { in: body.pieceIds } }, include: { design: true }, orderBy: { tagCode: 'asc' } });
      const order = await this.orders.createInTx(tx, ctx, {
        shop: await this.shopRef(tx, m.shopId),
        agent: await this.agentRef(tx, m.agentId),
        visitId,
        lines: pieces.map((p) => ({ design: p.design, quantity: 1, pieceId: p.id, netWeightMg: p.netWeightMg })),
        clientOpId: `convert:${clientOpId}`,
        notes: `Converted from ${m.number}`,
        sourceMemoId: id,
      });
      const now = new Date();
      await tx.memoItem.updateMany({ where: { memoId: id, pieceId: { in: body.pieceIds }, status: 'OUT' }, data: { status: 'CONVERTED', returnedAt: now } });
      const after = await tx.memoItem.findMany({ where: { memoId: id } });
      const status = nextMemoStatus(after);
      await tx.memo.update({ where: { id }, data: { status, closedAt: ['RETURNED', 'CONVERTED_TO_ORDER'].includes(status) ? now : null } });
      await this.audit.log(tx, ctx, 'memo.convert', 'Memo', id, { status: m.status }, { status, pieceIds: body.pieceIds, orderId: order.id });
      await this.outbox.emit(tx, {
        tenantId: tid,
        tenantSlug: ctx.user.tslug,
        type: 'memo.converted',
        aggregateType: 'Memo',
        aggregateId: id,
        actorId: ctx.user.sub,
        data: {
          memoId: id,
          number: m.number,
          status,
          orderId: order.id,
          orderNumber: order.number,
          visitId,
          shop: order.shop,
          agent: order.agent,
          pieceCount: pieces.length,
          pieces: pieces.map((p) => ({ id: p.id, tagCode: p.tagCode })),
          totalPaise: order.totalPaise,
          outstandingCount: after.filter((i) => i.status === 'OUT').length,
        },
      });
      return { memo: await this.views.memo(tid, id, tx), order };
    });
  }

  async verifyCode(ctx: ReqCtx, id: string, code: string) {
    const tid = ctx.user.tid;
    const result = await this.prisma.tx(async (tx) => {
      const m = await this.lock(tx, ctx, id);
      if (m.ackStatus === 'ACKNOWLEDGED') return 'ok' as const;
      if (m.ackAttempts >= MAX_ACK_ATTEMPTS) return 'locked' as const;
      if (m.ackCodeHash && safeEqual(m.ackCodeHash, ackCodeHash(id, code))) {
        await tx.memo.update({ where: { id }, data: { ackStatus: 'ACKNOWLEDGED', ackAt: new Date(), ackMethod: 'OTP' } });
        await this.audit.log(tx, ctx, 'memo.ack', 'Memo', id, { ackStatus: 'PENDING' }, { ackStatus: 'ACKNOWLEDGED', method: 'OTP' });
        return 'ok' as const;
      }
      await tx.memo.update({ where: { id }, data: { ackAttempts: { increment: 1 } } });
      return m.ackAttempts + 1 >= MAX_ACK_ATTEMPTS ? ('locked' as const) : ('wrong' as const);
    });
    if (result === 'locked') throw new AppError(423, 'ACK_LOCKED', 'Too many wrong codes — ask the retailer to tap “Confirm receipt”, or reissue the link');
    if (result === 'wrong') throw new AppError(422, 'ACK_CODE_INVALID', 'That code is not correct');
    return { memo: await this.views.memo(tid, id) };
  }

  async reissueAck(ctx: ReqCtx, id: string) {
    return this.prisma.tx(async (tx) => {
      const m = await this.lock(tx, ctx, id);
      if (m.ackStatus === 'ACKNOWLEDGED') throw conflict('ALREADY_ACKNOWLEDGED', 'Memo already acknowledged');
      const ack = await this.newAck(tx, id);
      return { ack: { url: ack.url, expiresAt: ack.expiresAt } };
    });
  }

  async get(ctx: ReqCtx, id: string) {
    const m = await this.views.memo(ctx.user.tid, id);
    if (!m || (ctx.user.role !== 'ADMIN' && m.agent.id !== ctx.user.sub)) throw notFound('Memo');
    return { memo: m };
  }

  // ---- public retailer acknowledgement (no auth; token is the capability) ----
  private async byToken(token: string) {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) throw notFound('Acknowledgement link');
    const m = await this.prisma.db.memo.findUnique({ where: { ackTokenHash: sha256(token) }, include: { tenant: true } });
    if (!m) throw notFound('Acknowledgement link');
    if (m.ackStatus === 'PENDING' && m.ackTokenExpiresAt && m.ackTokenExpiresAt < new Date()) throw new AppError(410, 'ACK_EXPIRED', 'This acknowledgement link has expired');
    return m;
  }

  async publicView(token: string) {
    const m = await this.byToken(token);
    const v = (await this.views.memo(m.tenantId, m.id))!;
    return {
      tenantName: m.tenant.name,
      shopName: v.shop.name,
      agentName: v.agent.name,
      memoNumber: v.number,
      dueDate: v.dueDate,
      items: v.items.map((i) => ({ tagCode: i.piece.tagCode, name: i.piece.name, sku: i.piece.sku, imageUrl: i.piece.imageUrl, purity: i.piece.purity, grossWeightMg: i.piece.grossWeightMg, netWeightMg: i.piece.netWeightMg, valuePaise: i.valuePaise, status: i.status })),
      totalValuePaise: v.totalValuePaise,
      ackStatus: v.ackStatus,
      ackAt: v.ackAt,
      expiresAt: m.ackTokenExpiresAt?.toISOString(),
      code: v.ackStatus === 'PENDING' ? ackCode(m.id, token) : undefined,
    };
  }

  async publicConfirm(token: string, ip: string) {
    const m = await this.byToken(token);
    if (m.ackStatus === 'ACKNOWLEDGED') return { ackStatus: 'ACKNOWLEDGED', ackAt: m.ackAt?.toISOString() };
    const now = new Date();
    await this.prisma.tx(async (tx) => {
      const r = await tx.memo.updateMany({ where: { id: m.id, ackStatus: 'PENDING' }, data: { ackStatus: 'ACKNOWLEDGED', ackAt: now, ackMethod: 'QR_CONFIRM' } });
      if (r.count === 1) {
        await tx.auditLog.create({ data: { tenantId: m.tenantId, actorId: null, action: 'memo.ack', entityType: 'Memo', entityId: m.id, before: { ackStatus: 'PENDING' }, after: { ackStatus: 'ACKNOWLEDGED', method: 'QR_CONFIRM' }, ip } });
      }
    });
    const fresh = await this.prisma.db.memo.findUniqueOrThrow({ where: { id: m.id } });
    return { ackStatus: fresh.ackStatus, ackAt: fresh.ackAt?.toISOString() };
  }
}

@ApiTags('memos')
@Controller('v1')
export class MemosController {
  constructor(private readonly memos: MemosService) {}

  @Requires('field')
  @Post('memos')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  create(@Ctx() ctx: ReqCtx, @Body() body: unknown) {
    return this.memos.create(ctx, parse(CreateMemo, body));
  }

  @Requires('field')
  @Get('memos/:id')
  get(@Ctx() ctx: ReqCtx, @Param('id') id: string) {
    return this.memos.get(ctx, id);
  }

  @Requires('field')
  @Post('memos/:id/return')
  @HttpCode(200)
  ret(@Ctx() ctx: ReqCtx, @Param('id') id: string, @Body() body: unknown) {
    return this.memos.returnPieces(ctx, id, parse(PiecesBody, body));
  }

  @Requires('field')
  @Post('memos/:id/extend')
  @HttpCode(200)
  extend(@Ctx() ctx: ReqCtx, @Param('id') id: string, @Body() body: unknown) {
    return this.memos.extend(ctx, id, parse(ExtendBody, body));
  }

  @Requires('field')
  @Post('memos/:id/convert')
  @HttpCode(200)
  convert(@Ctx() ctx: ReqCtx, @Param('id') id: string, @Body() body: unknown) {
    return this.memos.convert(ctx, id, parse(PiecesBody, body));
  }

  @Requires('field')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('memos/:id/ack/verify')
  @HttpCode(200)
  verify(@Ctx() ctx: ReqCtx, @Param('id') id: string, @Body() body: unknown) {
    return this.memos.verifyCode(ctx, id, parse(CodeBody, body).code);
  }

  @Requires('field')
  @Post('memos/:id/ack/link')
  @HttpCode(200)
  reissue(@Ctx() ctx: ReqCtx, @Param('id') id: string) {
    return this.memos.reissueAck(ctx, id);
  }

  @Requires('admin')
  @Post('admin/memos/:id/extend')
  @HttpCode(200)
  adminExtend(@Ctx() ctx: ReqCtx, @Param('id') id: string, @Body() body: unknown) {
    return this.memos.extend(ctx, id, parse(ExtendBody, body));
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('public/memo-ack/:token')
  publicView(@Param('token') token: string) {
    return this.memos.publicView(token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('public/memo-ack/:token')
  @HttpCode(200)
  publicConfirm(@Param('token') token: string, @Body() body: unknown, @Ctx() ctx: ReqCtx) {
    parse(ConfirmBody, body);
    return this.memos.publicConfirm(token, ctx.ip);
  }
}

@Module({ imports: [VisitsModule, OrdersModule], controllers: [MemosController], providers: [MemosService] })
export class MemosModule {}
