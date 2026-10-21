import { Body, Controller, Get, HttpCode, Injectable, Module, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { addDays, istDate, orderTotals } from '@jewelroute/shared';
import { z } from 'zod';
import type { MemoItemStatus, MemoStatus } from '../../generated/prisma';
import { PrismaService, Tx } from '../prisma.service';
import { Public, Requires, tokenFromRequest, verifyAccessToken } from '../common/auth';
import { Ctx, ReqCtx } from '../common/context';
import { ackCode, ackCodeHash, decryptSecret, encryptSecret, randomToken, safeEqual, sha256 } from '../common/crypto';
import { AppError, badRequest, conflict, isUniqueViolation, notFound } from '../common/errors';
import { parse, ymd } from '../common/http';
import { AuditService } from '../core/audit';
import { CreditService } from '../core/credit';
import { CustodyService, fmtDoc, nextDocNumber, nextMemoStatus } from '../core/custody';
import { IdempotencyService, StoredForm } from '../core/idempotency';
import { OutboxService } from '../core/outbox';
import { price, RatesService } from '../core/rates';
import { dateOf, ViewsService, ymdOf } from '../core/views';
import { env } from '../env';
import { DEVICE_COOKIE } from './auth';
import { OrdersModule, OrdersService } from './orders';
import { VisitsModule, VisitsService } from './visits';

const ACK_TTL_MS = 72 * 3600 * 1000;
export type SelfAckReason = 'AGENT_SESSION' | 'AGENT_DEVICE' | 'CODE_VIEWED_ON_AGENT_DEVICE';
/** Who is calling a public ack route: IP + user agent (stored evidence only), and the session / device cookies it carries (the trigger). */
export interface Requester {
  ip: string;
  ua: string | null;
  token?: string;
  device?: string;
}
export const requesterOf = (req: Request): Requester => ({
  ip: req.ip ?? '',
  ua: String(req.headers['user-agent'] ?? '').slice(0, 300) || null,
  token: tokenFromRequest(req),
  device: (req as Request & { cookies?: Record<string, string> }).cookies?.[DEVICE_COOKIE],
});
const MAX_ACK_ATTEMPTS = 5;
const MAX_MEMO_DAYS = 90;

const CreateMemo = z.object({ visitId: z.string().min(1), pieceIds: z.array(z.string().min(1)).min(1).max(100), dueDate: ymd, notes: z.string().max(2000).optional() });
/** `visitId` is optional: when omitted the caller's open visit at the memo's shop (if any) is used, so returns/sales are attributed to the visit they happened in. */
const PiecesBody = z.object({ pieceIds: z.array(z.string().min(1)).min(1).max(100), visitId: z.string().min(1).max(64).optional() });
const ExtendBody = z.object({ dueDate: ymd, reason: z.string().max(1000).optional() });
const CodeBody = z.object({ code: z.string().regex(/^\d{6}$/, '6 digits') });
const ConfirmBody = z.object({ confirm: z.literal(true) });
/** `?pieceIds=a,b&visitId=` — the same inputs as POST /memos/:id/convert, as a query. */
const PreviewQuery = z.object({
  pieceIds: z.string().min(1).transform((v) => [...new Set(v.split(',').map((x) => x.trim()).filter(Boolean))]).pipe(z.array(z.string().min(1).max(64)).min(1).max(100)),
  visitId: z.string().min(1).max(64).optional(),
});

/**
 * The memo-create response carries the ack link — a bearer capability (retailer page + 6-digit code).
 * Only its hash may be stored (DECISIONS › Retailer ack), so the idempotency copy keeps the URL
 * AES-GCM sealed with APP_ENCRYPTION_KEY and a replay returns the original link.
 */
const SEALED_ACK: StoredForm = {
  seal: (r) => {
    const o = r as { ack?: { url?: string; expiresAt?: string } | null };
    return o.ack?.url ? { ...(r as object), ack: { sealedUrl: encryptSecret(o.ack.url), expiresAt: o.ack.expiresAt } } : r;
  },
  unseal: (s) => {
    const o = s as { ack?: { sealedUrl?: string; expiresAt?: string } | null };
    return o?.ack?.sealedUrl ? { ...(s as object), ack: { url: decryptSecret(o.ack.sealedUrl), expiresAt: o.ack.expiresAt } } : s;
  },
};

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
  ackTokenExpiresAt: Date | null;
  ackViewSuspected: boolean;
}

export { nextMemoStatus };

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
    private readonly credit: CreditService,
  ) {}

  private async newAck(tx: Tx, memoId: string) {
    const token = randomToken(24);
    const expiresAt = new Date(Date.now() + ACK_TTL_MS);
    await tx.memo.update({
      where: { id: memoId },
      // A new link has a new code: evidence about who viewed the previous one no longer applies.
      data: { ackTokenHash: sha256(token), ackCodeHash: ackCodeHash(memoId, ackCode(memoId, token)), ackTokenExpiresAt: expiresAt, ackAttempts: 0, ackViewSuspected: false, ackIp: null, ackUserAgent: null },
    });
    return { url: `${env().APP_PUBLIC_URL}/ack/${token}`, token, expiresAt: expiresAt.toISOString() };
  }

  private async lock(tx: Tx, ctx: ReqCtx, id: string): Promise<LockedMemo> {
    const [m] = await tx.$queryRaw<LockedMemo[]>`
      SELECT id, number, status, "shopId", "agentId", "visitId", "dueDate", "ackStatus"::text AS "ackStatus", "ackAttempts", "ackCodeHash", "ackTokenExpiresAt", "ackViewSuspected"
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
    try {
      return await this.idem.run(ctx, async (tx, clientOpId) => {
        // Validated inside the run, i.e. after a stored response was replayed: a retry after IST midnight of a
        // memo that succeeded with dueDate = yesterday's "today" gets its original answer, not a 400 (audit B9).
        const today = istDate();
        if (body.dueDate < today || body.dueDate > addDays(today, MAX_MEMO_DAYS)) throw badRequest('INVALID_DUE_DATE', `Due date must be between ${today} and ${addDays(today, MAX_MEMO_DAYS)}`);
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
      }, SEALED_ACK);
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
        data: { memoId: id, number: m.number, fromDueDate: from, dueDate: body.dueDate, reason: body.reason, shop: await this.shopRef(tx, m.shopId), agent: await this.agentRef(tx, m.agentId), visitId: m.visitId ?? undefined, actor: { id: ctx.user.sub, name: ctx.user.name ?? '' } },
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
      // v3: the converted pieces leave memo exposure before the order is priced and the credit rule
      // runs (same rule as POST /orders), so the sale is not counted twice (memo value + order total).
      const now = new Date();
      await tx.memoItem.updateMany({ where: { memoId: id, pieceId: { in: body.pieceIds }, status: 'OUT' }, data: { status: 'CONVERTED', returnedAt: now } });
      const order = await this.orders.createInTx(tx, ctx, {
        shop: await this.shopRef(tx, m.shopId),
        agent: await this.agentRef(tx, m.agentId),
        visitId,
        lines: pieces.map((p) => ({ design: p.design, quantity: 1, pieceId: p.id, netWeightMg: p.netWeightMg })),
        clientOpId: `convert:${clientOpId}`,
        notes: `Converted from ${m.number}`,
        sourceMemoId: id,
      });
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

  /**
   * Read-only preview of POST /memos/:id/convert for the same pieces (and visit): lines priced from the
   * CURRENT gold rate with `price()` + `orderTotals` (as the convert does), and the CreditPosition from the
   * shared credit rule with those pieces already out of memo exposure (as the convert does before the rule
   * runs). The convert re-evaluates everything under its locks; this is what the agent sees before booking.
   */
  async convertPreview(ctx: ReqCtx, id: string, q: z.infer<typeof PreviewQuery>) {
    const tid = ctx.user.tid;
    const db = this.prisma.db;
    const m = await db.memo.findFirst({ where: { id, tenantId: tid }, select: { id: true, number: true, shopId: true, agentId: true } });
    if (!m || (ctx.user.role !== 'ADMIN' && m.agentId !== ctx.user.sub)) throw notFound('Memo');
    if (q.visitId) {
      const v = await this.visits.readable(ctx, q.visitId);
      if (v.agentId !== ctx.user.sub) throw notFound('Visit');
      if (!['CHECKED_IN', 'ACTIVE'].includes(v.status)) throw conflict('VISIT_NOT_OPEN', `Visit is ${v.status}; check in first`, { status: v.status });
      if (v.shopId !== m.shopId) throw conflict('VISIT_SHOP_MISMATCH', 'That visit is at a different shop than the memo');
      if ((await db.visitProof.count({ where: { tenantId: tid, visitId: v.id } })) < 1) {
        throw conflict('PROOF_REQUIRED_BEFORE_SALE', 'Add the arrival photo for this visit before booking orders, leaving pieces on memo, or taking returns', { visitId: v.id });
      }
    }
    const items = await db.memoItem.findMany({ where: { memoId: id, tenantId: tid }, include: { piece: { include: { design: true } } } });
    const out = new Map(items.filter((i) => i.status === 'OUT').map((i) => [i.pieceId, i]));
    const bad = q.pieceIds.filter((p) => !out.has(p));
    if (bad.length) throw conflict('PIECE_NOT_ON_MEMO', 'Some pieces are not outstanding on this memo', { pieceIds: bad });
    const chosen = q.pieceIds.map((p) => out.get(p)!).sort((a, b) => a.piece.tagCode.localeCompare(b.piece.tagCode));
    const rates = await this.rates.current(tid);
    const lines = chosen.map((i) => {
      const p = price(i.piece.design, rates, i.piece.netWeightMg);
      return {
        pieceId: i.pieceId,
        tagCode: i.piece.tagCode,
        designId: i.piece.designId,
        sku: i.piece.design.sku,
        name: i.piece.design.name,
        purity: p.purity,
        imageUrl: i.piece.design.imageUrls[0],
        netWeightMg: p.netWeightMg,
        goldRateId: p.goldRateId,
        ratePaisePerGram: p.ratePaisePerGram,
        goldValuePaise: p.goldValuePaise,
        makingPaise: p.makingPaise,
        stonePaise: p.stonePaise,
        otherPaise: p.otherPaise,
        unitPricePaise: p.unitPricePaise,
        lineTotalPaise: p.unitPricePaise, // one piece per line
        memoValuePaise: Number(i.valuePaise),
      };
    });
    const totals = orderTotals(lines.map((l) => l.lineTotalPaise));
    const purities = [...new Set(lines.map((l) => l.purity))];
    const goldRateSnapshot = purities.map((pu) => ({ purity: pu, goldRateId: rates[pu]!.goldRateId, ratePaisePerGram: rates[pu]!.ratePaisePerGram, effectiveFrom: rates[pu]!.effectiveFrom }));
    const credit = await this.credit.position(tid, m.shopId, { amountPaise: totals.totalPaise, excludeMemoPieceIds: q.pieceIds });
    return { memoId: m.id, memoNumber: m.number, visitId: q.visitId, lines, ...totals, goldRateSnapshot, credit };
  }

  async verifyCode(ctx: ReqCtx, id: string, code: string) {
    const tid = ctx.user.tid;
    const result = await this.prisma.tx(async (tx) => {
      const m = await this.lock(tx, ctx, id);
      if (m.ackStatus === 'ACKNOWLEDGED') return 'ok' as const;
      // The code is derived from the link's token: once the link has expired (public page → 410) its code is dead too.
      if (m.ackTokenExpiresAt && m.ackTokenExpiresAt < new Date()) return 'expired' as const;
      if (m.ackAttempts >= MAX_ACK_ATTEMPTS) return 'locked' as const;
      if (m.ackCodeHash && safeEqual(m.ackCodeHash, ackCodeHash(id, code))) {
        const at = new Date();
        // OTP: the agent enters the code by design; the evidence is who opened the page that shows it.
        const reason: SelfAckReason | null = m.ackViewSuspected ? 'CODE_VIEWED_ON_AGENT_DEVICE' : null;
        await tx.memo.update({ where: { id }, data: { ackStatus: 'ACKNOWLEDGED', ackAt: at, ackMethod: 'OTP', selfAckSuspected: !!reason, selfAckReason: reason } });
        await this.audit.log(tx, ctx, 'memo.ack', 'Memo', id, { ackStatus: 'PENDING' }, { ackStatus: 'ACKNOWLEDGED', method: 'OTP', selfAckSuspected: !!reason, selfAckReason: reason ?? undefined });
        await this.emitAck(tx, tid, ctx.user.tslug, m.id, 'OTP', at, ctx.user.sub);
        return 'ok' as const;
      }
      await tx.memo.update({ where: { id }, data: { ackAttempts: { increment: 1 } } });
      return m.ackAttempts + 1 >= MAX_ACK_ATTEMPTS ? ('locked' as const) : ('wrong' as const);
    });
    if (result === 'expired') throw new AppError(410, 'ACK_EXPIRED', 'This acknowledgement link has expired — reissue it and let the retailer scan the new QR');
    if (result === 'locked') throw new AppError(423, 'ACK_LOCKED', 'Too many wrong codes — ask the retailer to tap “Confirm receipt”, or reissue the link');
    if (result === 'wrong') throw new AppError(422, 'ACK_CODE_INVALID', 'That code is not correct');
    return { memo: await this.views.memo(tid, id) };
  }

  /** v3 `memo.acknowledged` — the retailer confirmed receipt (QR on their phone, or the code read to the agent). */
  private async emitAck(tx: Tx, tenantId: string, tenantSlug: string, memoId: string, method: 'OTP' | 'QR_CONFIRM', at: Date, actorId: string | null) {
    const m = await tx.memo.findFirstOrThrow({ where: { id: memoId, tenantId }, include: { items: { include: { piece: { select: { id: true, tagCode: true } } } } } });
    await this.outbox.emit(tx, {
      tenantId,
      tenantSlug,
      type: 'memo.acknowledged',
      aggregateType: 'Memo',
      aggregateId: memoId,
      actorId,
      data: {
        memoId,
        number: m.number,
        method,
        ackAt: at.toISOString(),
        by: 'retailer',
        visitId: m.visitId ?? undefined,
        shop: await this.shopRef(tx, m.shopId),
        agent: await this.agentRef(tx, m.agentId),
        pieceCount: m.items.length,
        totalValuePaise: Number(m.totalValuePaise),
        pieces: m.items.map((i) => ({ id: i.piece.id, tagCode: i.piece.tagCode })),
        selfAckSuspected: m.selfAckSuspected,
        selfAckReason: m.selfAckReason ?? undefined,
      },
    });
  }

  /**
   * Self-acknowledgement evidence (audit B8, redesigned after review M3; read model only, never blocks). Behind
   * the web's same-origin rewrite every phone can share one proxy IP and Android Chrome sends a near-identical UA,
   * so IP/UA are stored as evidence but never trigger. The triggers are cookies the agent's own browser carries
   * to the same-origin ack page: the agent's session (jr_at / bearer) or the agent's device id (jr_dev), whose hash
   * is on one of the agent's sessions.
   */
  private async selfAckSignal(tenantId: string, agentId: string, r: Requester): Promise<'AGENT_SESSION' | 'AGENT_DEVICE' | null> {
    if (r.token) {
      try {
        const u = verifyAccessToken(r.token);
        if (u.sub === agentId && u.tid === tenantId) return 'AGENT_SESSION';
      } catch {
        /* an expired or foreign token is no evidence either way */
      }
    }
    if (r.device && /^[A-Za-z0-9_-]{32,64}$/.test(r.device)) {
      const hit = await this.prisma.db.refreshToken.findFirst({ where: { tenantId, userId: agentId, deviceHash: sha256(r.device) }, select: { id: true } });
      if (hit) return 'AGENT_DEVICE';
    }
    return null;
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

  async publicView(token: string, r: Requester) {
    const m = await this.byToken(token);
    if (m.ackStatus === 'PENDING') {
      // Remember who opened the page that shows the code (the OTP evidence); sticky until the link is reissued.
      const suspicious = !m.ackViewSuspected && (await this.selfAckSignal(m.tenantId, m.agentId, r)) !== null;
      if (suspicious || m.ackIp !== r.ip || m.ackUserAgent !== r.ua) {
        await this.prisma.db.memo.updateMany({ where: { id: m.id, ackStatus: 'PENDING' }, data: { ackIp: r.ip, ackUserAgent: r.ua, ...(suspicious ? { ackViewSuspected: true } : {}) } });
      }
    }
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

  async publicConfirm(token: string, req: Requester) {
    const m = await this.byToken(token);
    if (m.ackStatus === 'ACKNOWLEDGED') return { ackStatus: 'ACKNOWLEDGED', ackAt: m.ackAt?.toISOString() };
    const now = new Date();
    const reason = await this.selfAckSignal(m.tenantId, m.agentId, req);
    await this.prisma.tx(async (tx) => {
      const r = await tx.memo.updateMany({
        where: { id: m.id, ackStatus: 'PENDING' },
        data: { ackStatus: 'ACKNOWLEDGED', ackAt: now, ackMethod: 'QR_CONFIRM', ackIp: req.ip, ackUserAgent: req.ua, selfAckSuspected: !!reason, selfAckReason: reason },
      });
      if (r.count === 1) {
        // The retailer's UA stays on the memo row only (cleared after 90 days); the audit trail keeps the finding.
        const after = { ackStatus: 'ACKNOWLEDGED', method: 'QR_CONFIRM', selfAckSuspected: !!reason, selfAckReason: reason ?? undefined };
        await tx.auditLog.create({ data: { tenantId: m.tenantId, actorId: null, action: 'memo.ack', entityType: 'Memo', entityId: m.id, before: { ackStatus: 'PENDING' }, after, ip: req.ip } });
        await this.emitAck(tx, m.tenantId, m.tenant.slug, m.id, 'QR_CONFIRM', now, null);
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
  @Get('memos/:id/convert-preview')
  convertPreview(@Ctx() ctx: ReqCtx, @Param('id') id: string, @Query() q: unknown) {
    return this.memos.convertPreview(ctx, id, parse(PreviewQuery, q));
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
  publicView(@Param('token') token: string, @Req() req: Request) {
    return this.memos.publicView(token, requesterOf(req));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('public/memo-ack/:token')
  @HttpCode(200)
  publicConfirm(@Param('token') token: string, @Body() body: unknown, @Req() req: Request) {
    parse(ConfirmBody, body);
    return this.memos.publicConfirm(token, requesterOf(req));
  }
}

@Module({ imports: [VisitsModule, OrdersModule], controllers: [MemosController], providers: [MemosService] })
export class MemosModule {}
