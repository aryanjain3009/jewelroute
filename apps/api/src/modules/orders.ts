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
import { fmtDoc, nextDocNumber } from '../core/custody';
import { IdempotencyService } from '../core/idempotency';
import { OutboxService } from '../core/outbox';
import { price, RatesService } from '../core/rates';
import { ViewsService } from '../core/views';
import { VisitsModule, VisitsService } from './visits';

const CreateOrder = z.object({
  visitId: z.string().min(1),
  items: z.array(z.object({ designId: z.string().min(1), quantity: z.number().int().min(1).max(500) })).min(1).max(100),
  notes: z.string().max(2000).optional(),
});
const RejectBody = z.object({ reason: z.string().trim().min(1).max(1000) });
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
  ) {}

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
    const year = new Date().getUTCFullYear();
    const number = fmtDoc('ORD', year, await nextDocNumber(tx, tid, 'ORD', year));
    const order = await tx.order.create({
      data: {
        tenantId: tid,
        number,
        shopId: o.shop.id,
        agentId: o.agent.id,
        visitId: o.visitId,
        status: 'SUBMITTED',
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
    await this.audit.log(tx, ctx, 'order.create', 'Order', order.id, null, { number, status: 'SUBMITTED', visitId: o.visitId, sourceMemoId: o.sourceMemoId, totalPaise: totals.totalPaise, goldRateSnapshot: snapshot });
    await this.outbox.emit(tx, {
      tenantId: tid,
      tenantSlug: ctx.user.tslug,
      type: 'order.created',
      aggregateType: 'Order',
      aggregateId: order.id,
      actorId: ctx.user.sub,
      data: {
        orderId: order.id,
        number,
        status: 'SUBMITTED',
        agent: o.agent,
        shop: o.shop,
        visitId: o.visitId,
        sourceMemoId: o.sourceMemoId,
        subtotalPaise: totals.subtotalPaise,
        gstPaise: totals.gstPaise,
        totalPaise: totals.totalPaise,
        goldRateSnapshot: snapshot,
        items: view.items.map((i) => ({ sku: i.sku, name: i.name, purity: i.purity, quantity: i.quantity, netWeightMg: i.netWeightMg, unitPricePaise: i.unitPricePaise, lineTotalPaise: i.lineTotalPaise })),
      },
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

  async decide(ctx: ReqCtx, id: string, decision: 'APPROVED' | 'REJECTED', reason?: string) {
    const tid = ctx.user.tid;
    return this.prisma.tx(async (tx) => {
      const before = await tx.order.findFirst({ where: { id, tenantId: tid }, include: { shop: { select: { id: true, name: true } }, agent: { select: { id: true, name: true } } } });
      if (!before) throw notFound('Order');
      const r = await tx.order.updateMany({
        where: { id, tenantId: tid, status: 'SUBMITTED' },
        data: { status: decision, decidedById: ctx.user.sub, decidedAt: new Date(), rejectionReason: decision === 'REJECTED' ? reason : null },
      });
      if (r.count !== 1) {
        // `before` was read without a lock, so under a race it can still say SUBMITTED. Re-read the
        // committed row (READ COMMITTED: this statement sees the winner) and report the real outcome.
        const now = await tx.order.findFirstOrThrow({ where: { id, tenantId: tid }, select: { number: true, status: true, decidedById: true, decidedAt: true } });
        const by = now.decidedById ? await tx.user.findFirst({ where: { id: now.decidedById, tenantId: tid }, select: { id: true, name: true } }) : null;
        const verb = now.status === 'APPROVED' ? 'approved' : now.status === 'REJECTED' ? 'rejected' : now.status.toLowerCase();
        throw conflict('ORDER_ALREADY_DECIDED', `Order ${now.number} was already ${verb}${by ? ` by ${by.name}` : ''}`, {
          status: now.status,
          decidedBy: by ?? undefined,
          decidedAt: now.decidedAt?.toISOString(),
        });
      }
      await this.audit.log(tx, ctx, decision === 'APPROVED' ? 'order.approve' : 'order.reject', 'Order', id, { status: before.status }, { status: decision, reason });
      await this.outbox.emit(tx, {
        tenantId: tid,
        tenantSlug: ctx.user.tslug,
        type: decision === 'APPROVED' ? 'order.approved' : 'order.rejected',
        aggregateType: 'Order',
        aggregateId: id,
        actorId: ctx.user.sub,
        data: { orderId: id, number: before.number, status: decision, totalPaise: Number(before.totalPaise), shop: before.shop, agentRef: before.agent, actor: { id: ctx.user.sub, name: ctx.user.name ?? '' }, rejectionReason: reason },
      });
      return { order: await this.views.order(tid, id, tx) };
    });
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
  @Post('admin/orders/:id/reject')
  @HttpCode(200)
  reject(@Ctx() ctx: ReqCtx, @Param('id') id: string, @Body() body: unknown) {
    return this.orders.decide(ctx, id, 'REJECTED', parse(RejectBody, body).reason);
  }
}

@Module({ imports: [VisitsModule], controllers: [OrdersController], providers: [OrdersService], exports: [OrdersService] })
export class OrdersModule {}
