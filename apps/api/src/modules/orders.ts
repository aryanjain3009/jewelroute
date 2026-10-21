import { Body, Controller, Get, HttpCode, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { orderTotals } from '@jewelroute/shared';
import { z } from 'zod';
import type { JewelryDesign } from '../../generated/prisma';
import { PrismaService, Tx } from '../prisma.service';
import { Requires } from '../common/auth';
import { Ctx, ReqCtx } from '../common/context';
import { AppError, conflict, isUniqueViolation, notFound } from '../common/errors';
import { parse } from '../common/http';
import { AuditService } from '../core/audit';
import { CreditService } from '../core/credit';
import { CustodyService, fmtDoc, nextDocNumber, nextMemoStatus } from '../core/custody';
import { IdempotencyService } from '../core/idempotency';
import { OutboxService, toJson } from '../core/outbox';
import { price, RatesService } from '../core/rates';
import { ViewsService } from '../core/views';
import { VisitsModule, VisitsService } from './visits';

const CreateOrder = z.object({
  visitId: z.string().min(1),
  items: z.array(z.object({ designId: z.string().min(1), quantity: z.number().int().min(1).max(500) })).min(1).max(100),
  notes: z.string().max(2000).optional(),
});
const RejectBody = z.object({ reason: z.string().trim().min(1).max(1000) });
const CancelBody = z.object({ reason: z.string().trim().min(1).max(1000).optional() }).default({});
const CreditQuery = z.object({ amountPaise: z.coerce.number().int().min(0).max(1_000_000_000_000).optional() });
const LIVE: ('CONFIRMED' | 'APPROVED')[] = ['CONFIRMED', 'APPROVED'];
const BatchApproveBody = z.object({ orderIds: z.array(z.string().min(1).max(64)).min(1).max(200) });

export interface OrderLine {
  design: JewelryDesign;
  quantity: number;
  pieceId?: string;
  netWeightMg?: number;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly views: ViewsService,
    private readonly rates: RatesService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly idem: IdempotencyService,
    private readonly visits: VisitsService,
    private readonly credit: CreditService,
    private readonly custody: CustodyService,
  ) {}

  /** Memo row, then the order's sold pieces (id order) — the first two steps of the global lock order. */
  private async lockConversion(tx: Tx, tid: string, orderId: string, memoId: string) {
    await tx.$queryRaw`SELECT id FROM "Memo" WHERE id = ${memoId} AND "tenantId" = ${tid} FOR UPDATE`;
    const lines = await tx.orderItem.findMany({ where: { tenantId: tid, orderId, pieceId: { not: null } }, select: { pieceId: true } });
    const pieceIds = [...new Set(lines.map((l) => l.pieceId!))].sort();
    if (pieceIds.length) await tx.$queryRaw`SELECT id FROM "SamplePiece" WHERE "tenantId" = ${tid} AND id = ANY(${pieceIds}) ORDER BY id FOR UPDATE`;
  }

  /** Lock the shop row (same lock the order create takes) so exposure-changing writes serialise per shop. */
  private async lockShop(tx: Tx, tid: string, shopId: string) {
    await tx.$queryRaw`SELECT id FROM "Shop" WHERE id = ${shopId} AND "tenantId" = ${tid} FOR UPDATE`;
  }

  /** Prices every line from the CURRENT gold rate and freezes it into OrderItem + goldRateSnapshot. */
  async createInTx(
    tx: Tx,
    ctx: ReqCtx,
    o: { shop: { id: string; name: string }; agent: { id: string; name: string }; visitId?: string; lines: OrderLine[]; clientOpId: string; notes?: string; sourceMemoId?: string },
  ) {
    const tid = ctx.user.tid;
    const rates = await this.rates.current(tid, tx);
    const priced = o.lines.map((l) => {
      const p = price(l.design, rates, l.netWeightMg ?? l.design.netWeightMg);
      return { l, p, lineTotal: p.unitPricePaise * l.quantity };
    });
    const totals = orderTotals(priced.map((x) => x.lineTotal));
    const purities = [...new Set(priced.map((x) => x.p.purity))];
    const snapshot = purities.map((pu) => ({ purity: pu, goldRateId: rates[pu]!.goldRateId, ratePaisePerGram: rates[pu]!.ratePaisePerGram, effectiveFrom: rates[pu]!.effectiveFrom }));
    // v3 credit rule — server-authoritative, inside this transaction, shop row locked FOR UPDATE.
    const position = await this.credit.position(tid, o.shop.id, { tx, amountPaise: totals.totalPaise, lock: true });
    const status = position.requiresApproval ? ('PENDING_APPROVAL' as const) : ('CONFIRMED' as const);
    const year = new Date().getUTCFullYear();
    const number = fmtDoc('ORD', year, await nextDocNumber(tx, tid, 'ORD', year));
    const order = await tx.order.create({
      data: {
        tenantId: tid,
        number,
        shopId: o.shop.id,
        agentId: o.agent.id,
        visitId: o.visitId,
        status,
        approvalRequired: position.requiresApproval,
        approvalReasons: position.reasons,
        creditSnapshot: toJson(position),
        clientOpId: o.clientOpId,
        subtotalPaise: BigInt(totals.subtotalPaise),
        gstPaise: BigInt(totals.gstPaise),
        totalPaise: BigInt(totals.totalPaise),
        goldRateSnapshot: snapshot,
        notes: o.notes,
        sourceMemoId: o.sourceMemoId,
        items: {
          create: priced.map(({ l, p, lineTotal }) => ({
            tenantId: tid,
            designId: l.design.id,
            pieceId: l.pieceId,
            sku: l.design.sku,
            name: l.design.name,
            purity: l.design.purity,
            quantity: l.quantity,
            netWeightMg: p.netWeightMg,
            goldRateId: p.goldRateId,
            ratePaisePerGram: BigInt(p.ratePaisePerGram),
            goldValuePaise: BigInt(p.goldValuePaise),
            makingPaise: BigInt(p.makingPaise),
            stonePaise: BigInt(p.stonePaise),
            otherPaise: BigInt(p.otherPaise),
            unitPricePaise: BigInt(p.unitPricePaise),
            lineTotalPaise: BigInt(lineTotal),
          })),
        },
      },
    });
    const view = (await this.views.order(tid, order.id, tx))!;
    await this.audit.log(tx, ctx, 'order.create', 'Order', order.id, null, {
      number,
      status,
      approvalReasons: position.reasons,
      visitId: o.visitId,
      sourceMemoId: o.sourceMemoId,
      totalPaise: totals.totalPaise,
      exposurePaise: position.exposurePaise,
      creditLimitPaise: position.creditLimitPaise,
      goldRateSnapshot: snapshot,
    });
    const base = { orderId: order.id, number, status, agent: o.agent, shop: o.shop, visitId: o.visitId, sourceMemoId: o.sourceMemoId, totalPaise: totals.totalPaise };
    const approval = { required: position.requiresApproval, reasons: position.reasons };
    await this.outbox.emit(tx, {
      tenantId: tid,
      tenantSlug: ctx.user.tslug,
      type: 'order.created',
      aggregateType: 'Order',
      aggregateId: order.id,
      actorId: ctx.user.sub,
      data: {
        ...base,
        subtotalPaise: totals.subtotalPaise,
        gstPaise: totals.gstPaise,
        approval,
        goldRateSnapshot: snapshot,
        items: view.items.map((i) => ({ sku: i.sku, name: i.name, purity: i.purity, quantity: i.quantity, netWeightMg: i.netWeightMg, unitPricePaise: i.unitPricePaise, lineTotalPaise: i.lineTotalPaise, pieceId: i.pieceId })),
      },
    });
    await this.outbox.emit(tx, {
      tenantId: tid,
      tenantSlug: ctx.user.tslug,
      type: status === 'CONFIRMED' ? 'order.confirmed' : 'order.pending_approval',
      aggregateType: 'Order',
      aggregateId: order.id,
      actorId: ctx.user.sub,
      data: { ...base, reasons: position.reasons, credit: position },
    });
    return view;
  }

  async create(ctx: ReqCtx, body: z.infer<typeof CreateOrder>) {
    this.idem.require(ctx);
    const tid = ctx.user.tid;
    try {
      return await this.idem.run(ctx, async (tx, clientOpId) => {
        const v = await this.visits.lock(tx, ctx, body.visitId);
        this.visits.requireOpen(v);
        await this.visits.requireProof(tx, ctx, v.id);
        const ids = [...new Set(body.items.map((i) => i.designId))];
        const designs = await tx.jewelryDesign.findMany({ where: { tenantId: tid, id: { in: ids } } });
        if (designs.length !== ids.length) throw notFound('Design');
        const inactive = designs.filter((d) => !d.active);
        if (inactive.length) throw conflict('DESIGN_INACTIVE', `${inactive.map((d) => d.sku).join(', ')} is no longer in the catalog`, { designIds: inactive.map((d) => d.id) });
        const byId = new Map(designs.map((d) => [d.id, d]));
        const shop = await tx.shop.findUniqueOrThrow({ where: { id: v.shopId }, select: { id: true, name: true } });
        const order = await this.createInTx(tx, ctx, {
          shop,
          agent: { id: ctx.user.sub, name: ctx.user.name ?? '' },
          visitId: v.id,
          lines: body.items.map((i) => ({ design: byId.get(i.designId)!, quantity: i.quantity })),
          clientOpId,
          notes: body.notes,
        });
        return { order };
      });
    } catch (e) {
      // Second line of defence: clientOpId is unique per tenant.
      if (ctx.idempotencyKey && isUniqueViolation(e)) {
        const existing = await this.prisma.db.order.findFirst({ where: { tenantId: tid, clientOpId: ctx.idempotencyKey } });
        if (existing) return { order: await this.views.order(tid, existing.id) };
      }
      throw e;
    }
  }

  /** Approve/reject — only from PENDING_APPROVAL. A lost race reports the committed decision. */
  async decide(ctx: ReqCtx, id: string, decision: 'APPROVED' | 'REJECTED', reason?: string) {
    const tid = ctx.user.tid;
    return this.prisma.tx(async (tx) => {
      const before = await tx.order.findFirst({ where: { id, tenantId: tid }, include: { shop: { select: { id: true, name: true } }, agent: { select: { id: true, name: true } } } });
      if (!before) throw notFound('Order');
      // Global lock order (docs/brain/clusters/orders-pricing.md › Lock order): Memo → Visit → SamplePiece
      // (id order) → Shop → Order. A memo conversion is created under Memo → Pieces → Shop (memo convert),
      // so deciding one takes Memo and its Pieces first; taking Shop first deadlocked (re-review N1, V13).
      if (before.sourceMemoId) await this.lockConversion(tx, tid, before.id, before.sourceMemoId);
      // Approving moves the order into outstanding: serialise with order creates at this shop.
      await this.lockShop(tx, tid, before.shopId);
      const r = await tx.order.updateMany({
        where: { id, tenantId: tid, status: 'PENDING_APPROVAL' },
        data: { status: decision, decidedById: ctx.user.sub, decidedAt: new Date(), rejectionReason: decision === 'REJECTED' ? reason : null },
      });
      if (r.count !== 1) {
        // `before` was read without a lock, so under a race it can still say PENDING_APPROVAL. Re-read
        // the committed row (READ COMMITTED: this statement sees the winner) and report the real outcome.
        const now = await tx.order.findFirstOrThrow({ where: { id, tenantId: tid }, select: { number: true, status: true, decidedById: true, decidedAt: true } });
        if (now.status !== 'APPROVED' && now.status !== 'REJECTED') {
          throw conflict('ORDER_NOT_PENDING', `${now.number} is ${now.status.toLowerCase().replace('_', ' ')} — only orders pending approval can be approved or rejected`, { status: now.status });
        }
        const by = now.decidedById ? await tx.user.findFirst({ where: { id: now.decidedById, tenantId: tid }, select: { id: true, name: true } }) : null;
        const verb = now.status === 'APPROVED' ? 'approved' : 'rejected';
        throw conflict('ORDER_ALREADY_DECIDED', `Order ${now.number} was already ${verb}${by ? ` by ${by.name}` : ''}`, {
          status: now.status,
          decidedBy: by ?? undefined,
          decidedAt: now.decidedAt?.toISOString(),
        });
      }
      // Rejecting a memo conversion un-sells it (DECISIONS › v3 follow-up B1): the pieces go back to the
      // memo's shop and their memo items are OUT again, in this transaction. The deferred trigger
      // "Order_dead_unsells_pieces" refuses to commit a rejection that leaves a piece SOLD.
      const unsold = decision === 'REJECTED' && before.sourceMemoId ? await this.unsell(tx, ctx, { id, sourceMemoId: before.sourceMemoId, visitId: before.visitId }) : undefined;
      await this.audit.log(tx, ctx, decision === 'APPROVED' ? 'order.approve' : 'order.reject', 'Order', id, { status: before.status, approvalReasons: before.approvalReasons }, { status: decision, reason, ...(unsold ? { unsoldPieceIds: unsold.pieceIds, memoId: unsold.memoId } : {}) });
      await this.outbox.emit(tx, {
        tenantId: tid,
        tenantSlug: ctx.user.tslug,
        type: decision === 'APPROVED' ? 'order.approved' : 'order.rejected',
        aggregateType: 'Order',
        aggregateId: id,
        actorId: ctx.user.sub,
        data: {
          orderId: id,
          number: before.number,
          status: decision,
          totalPaise: Number(before.totalPaise),
          shop: before.shop,
          agent: before.agent,
          agentRef: before.agent,
          visitId: before.visitId ?? undefined,
          reasons: before.approvalReasons,
          actor: { id: ctx.user.sub, name: ctx.user.name ?? '' },
          rejectionReason: reason,
          sourceMemoId: before.sourceMemoId ?? undefined,
          unsold,
        },
      });
      return { order: await this.views.order(tid, id, tx) };
    });
  }

  /**
   * Un-sell a rejected memo conversion: every piece the order sold moves SOLD → the memo's shop through
   * the custody choke point (reason SALE_REJECTED: append-only event, outbox, audit), its memo items go
   * CONVERTED → OUT, and the memo status is recomputed — so the piece is on memo again and its value
   * is back in memo exposure.
   */
  private async unsell(tx: Tx, ctx: ReqCtx, o: { id: string; sourceMemoId: string; visitId: string | null }) {
    const tid = ctx.user.tid;
    const [memo] = await tx.$queryRaw<{ id: string; number: string; shopId: string; status: string }[]>`
      SELECT id, number, "shopId", status::text AS status FROM "Memo" WHERE id = ${o.sourceMemoId} AND "tenantId" = ${tid} FOR UPDATE`;
    if (!memo) throw notFound('Memo');
    const lines = await tx.orderItem.findMany({ where: { tenantId: tid, orderId: o.id, pieceId: { not: null } }, select: { pieceId: true } });
    const pieceIds = [...new Set(lines.map((l) => l.pieceId!))];
    if (!pieceIds.length) return undefined;
    await this.custody.move(tx, ctx, {
      pieceIds,
      from: { type: 'SOLD' },
      to: { type: 'SHOP', shopId: memo.shopId },
      reason: 'SALE_REJECTED',
      memoId: memo.id,
      memoNumber: memo.number,
      visitId: o.visitId ?? undefined,
      notHeldCode: 'PIECE_NOT_SOLD',
    });
    await tx.memoItem.updateMany({ where: { memoId: memo.id, pieceId: { in: pieceIds }, status: 'CONVERTED' }, data: { status: 'OUT', returnedAt: null } });
    const after = await tx.memoItem.findMany({ where: { memoId: memo.id } });
    const status = nextMemoStatus(after);
    await tx.memo.update({ where: { id: memo.id }, data: { status, closedAt: null } });
    await this.audit.log(tx, ctx, 'memo.sale_rejected', 'Memo', memo.id, { status: memo.status }, { status, pieceIds, orderId: o.id });
    return { memoId: memo.id, memoNumber: memo.number, memoStatus: status, pieceIds };
  }

  /** Paid/settled: CONFIRMED or APPROVED, once. Reduces the shop's outstanding. */
  async settle(ctx: ReqCtx, id: string) {
    const tid = ctx.user.tid;
    return this.prisma.tx(async (tx) => {
      const o = await tx.order.findFirst({ where: { id, tenantId: tid }, include: { shop: { select: { id: true, name: true } }, agent: { select: { id: true, name: true } } } });
      if (!o) throw notFound('Order');
      await this.lockShop(tx, tid, o.shopId);
      const now = new Date();
      const r = await tx.order.updateMany({ where: { id, tenantId: tid, status: { in: LIVE }, settledAt: null }, data: { settledAt: now } });
      if (r.count !== 1) {
        const cur = await tx.order.findFirstOrThrow({ where: { id, tenantId: tid }, select: { number: true, status: true, settledAt: true } });
        if (cur.settledAt) throw conflict('ORDER_ALREADY_SETTLED', `${cur.number} was already settled`, { status: cur.status, settledAt: cur.settledAt.toISOString() });
        throw conflict('ORDER_NOT_SETTLEABLE', `${cur.number} is ${cur.status.toLowerCase().replace('_', ' ')} — only confirmed or approved orders can be settled`, { status: cur.status });
      }
      await this.audit.log(tx, ctx, 'order.settle', 'Order', id, { status: o.status, settledAt: null }, { status: o.status, settledAt: now.toISOString(), totalPaise: Number(o.totalPaise) });
      const credit = await this.credit.position(tid, o.shopId, { tx });
      await this.outbox.emit(tx, {
        tenantId: tid,
        tenantSlug: ctx.user.tslug,
        type: 'order.settled',
        aggregateType: 'Order',
        aggregateId: id,
        actorId: ctx.user.sub,
        data: { orderId: id, number: o.number, status: o.status, totalPaise: Number(o.totalPaise), settledAt: now.toISOString(), shop: o.shop, agent: o.agent, visitId: o.visitId ?? undefined, actor: { id: ctx.user.sub, name: ctx.user.name ?? '' }, credit },
      });
      return { order: await this.views.order(tid, id, tx), credit };
    });
  }

  /**
   * Cancel a CONFIRMED or PENDING_APPROVAL order that is not settled. An order converted from a memo
   * is refused: its pieces were sold (custody SOLD) and cancelling would not bring them back.
   */
  async cancel(ctx: ReqCtx, id: string, reason?: string) {
    const tid = ctx.user.tid;
    return this.prisma.tx(async (tx) => {
      const o = await tx.order.findFirst({ where: { id, tenantId: tid }, include: { shop: { select: { id: true, name: true } }, agent: { select: { id: true, name: true } } } });
      if (!o) throw notFound('Order');
      await this.lockShop(tx, tid, o.shopId);
      const now = new Date();
      const r = await tx.order.updateMany({
        where: { id, tenantId: tid, status: { in: ['CONFIRMED', 'PENDING_APPROVAL'] }, settledAt: null, sourceMemoId: null },
        data: { status: 'CANCELLED', cancelledAt: now, cancellationReason: reason ?? null },
      });
      if (r.count !== 1) {
        const cur = await tx.order.findFirstOrThrow({ where: { id, tenantId: tid }, select: { number: true, status: true, settledAt: true, sourceMemoId: true } });
        const why = cur.settledAt
          ? 'it is already settled'
          : cur.sourceMemoId && ['CONFIRMED', 'PENDING_APPROVAL'].includes(cur.status)
            ? 'it was converted from a memo and its pieces are sold'
            : `it is ${cur.status.toLowerCase().replace('_', ' ')}`;
        throw conflict('ORDER_NOT_CANCELLABLE', `${cur.number} cannot be cancelled — ${why}`, { status: cur.status, settled: !!cur.settledAt, sourceMemoId: cur.sourceMemoId ?? undefined });
      }
      await this.audit.log(tx, ctx, 'order.cancel', 'Order', id, { status: o.status }, { status: 'CANCELLED', reason });
      await this.outbox.emit(tx, {
        tenantId: tid,
        tenantSlug: ctx.user.tslug,
        type: 'order.cancelled',
        aggregateType: 'Order',
        aggregateId: id,
        actorId: ctx.user.sub,
        data: { orderId: id, number: o.number, status: 'CANCELLED', fromStatus: o.status, totalPaise: Number(o.totalPaise), shop: o.shop, agent: o.agent, visitId: o.visitId ?? undefined, actor: { id: ctx.user.sub, name: ctx.user.name ?? '' }, cancellationReason: reason },
      });
      return { order: await this.views.order(tid, id, tx) };
    });
  }

  /** CreditPosition for the agent's own open visit (order review), optionally for an amount. */
  async visitCredit(ctx: ReqCtx, visitId: string, amountPaise?: number) {
    const v = await this.visits.readable(ctx, visitId);
    if (v.agentId !== ctx.user.sub && ctx.user.role !== 'ADMIN') throw notFound('Visit');
    if (!['CHECKED_IN', 'ACTIVE'].includes(v.status)) throw conflict('VISIT_NOT_OPEN', `Visit is ${v.status}; check in first`, { status: v.status });
    return this.credit.position(ctx.user.tid, v.shopId, { amountPaise });
  }

  shopCredit(ctx: ReqCtx, shopId: string, amountPaise?: number) {
    return this.credit.position(ctx.user.tid, shopId, { amountPaise });
  }

  /**
   * Batch approve: each order runs through `decide` in its own transaction (audited, one
   * `order.approved` each), so one failure never rolls back the others. Results keep request order;
   * duplicate ids are collapsed.
   */
  async approveMany(ctx: ReqCtx, orderIds: string[]) {
    const results: { id: string; ok: boolean; number?: string; status?: string; error?: { code: string; message: string } }[] = [];
    for (const id of [...new Set(orderIds)]) {
      try {
        const { order } = await this.decide(ctx, id, 'APPROVED');
        results.push({ id, ok: true, number: order?.number, status: order?.status });
      } catch (e) {
        results.push({ id, ok: false, error: e instanceof AppError ? { code: e.code, message: e.message } : { code: 'INTERNAL_ERROR', message: 'Unexpected error; nothing changed for this order' } });
      }
    }
    return { results, approved: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
  }

  async get(ctx: ReqCtx, id: string) {
    const o = await this.views.order(ctx.user.tid, id);
    if (!o || (ctx.user.role !== 'ADMIN' && o.agent.id !== ctx.user.sub)) throw notFound('Order');
    return { order: o };
  }
}

@ApiTags('orders')
@Controller('v1')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Requires('field')
  @Post('orders')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  create(@Ctx() ctx: ReqCtx, @Body() body: unknown) {
    return this.orders.create(ctx, parse(CreateOrder, body));
  }

  @Requires('field')
  @Get('orders/:id')
  get(@Ctx() ctx: ReqCtx, @Param('id') id: string) {
    return this.orders.get(ctx, id);
  }

  @Requires('admin')
  @Post('admin/orders/approve')
  @HttpCode(200)
  approveMany(@Ctx() ctx: ReqCtx, @Body() body: unknown) {
    return this.orders.approveMany(ctx, parse(BatchApproveBody, body).orderIds);
  }

  @Requires('admin')
  @Post('admin/orders/:id/approve')
  @HttpCode(200)
  approve(@Ctx() ctx: ReqCtx, @Param('id') id: string) {
    return this.orders.decide(ctx, id, 'APPROVED');
  }

  @Requires('admin')
  @Post('admin/orders/:id/settle')
  @HttpCode(200)
  settle(@Ctx() ctx: ReqCtx, @Param('id') id: string) {
    return this.orders.settle(ctx, id);
  }

  @Requires('admin')
  @Post('admin/orders/:id/cancel')
  @HttpCode(200)
  cancel(@Ctx() ctx: ReqCtx, @Param('id') id: string, @Body() body: unknown) {
    return this.orders.cancel(ctx, id, parse(CancelBody, body ?? {}).reason);
  }

  @Requires('field')
  @Get('visits/:id/credit')
  visitCredit(@Ctx() ctx: ReqCtx, @Param('id') id: string, @Query() q: unknown) {
    return this.orders.visitCredit(ctx, id, parse(CreditQuery, q).amountPaise);
  }

  @Requires('admin')
  @Get('admin/shops/:id/credit')
  shopCredit(@Ctx() ctx: ReqCtx, @Param('id') id: string, @Query() q: unknown) {
    return this.orders.shopCredit(ctx, id, parse(CreditQuery, q).amountPaise);
  }

  @Requires('admin')
  @Post('admin/orders/:id/reject')
  @HttpCode(200)
  reject(@Ctx() ctx: ReqCtx, @Param('id') id: string, @Body() body: unknown) {
    return this.orders.decide(ctx, id, 'REJECTED', parse(RejectBody, body).reason);
  }
}

@Module({ imports: [VisitsModule], controllers: [OrdersController], providers: [OrdersService], exports: [OrdersService] })
export class OrdersModule {}
