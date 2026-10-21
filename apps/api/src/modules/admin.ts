import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { istDate } from '@jewelroute/shared';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { CustodianType, Prisma, VisitStatus } from '../../generated/prisma';
import { PrismaService } from '../prisma.service';
import { Requires } from '../common/auth';
import { Ctx, ReqCtx } from '../common/context';
import { badRequest, conflict, isUniqueViolation, notFound } from '../common/errors';
import { parse, ymd } from '../common/http';
import { AuditService } from '../core/audit';
import { CustodyService, nextDocNumber } from '../core/custody';
import { RatesService, valueOrZero } from '../core/rates';
import { dateOf, toDesign, toShop, ViewsService, visitInclude } from '../core/views';
import { Dispatcher } from '../webhooks/dispatcher';
import { RecordsController, RecordsService, toActivityItems } from './records';
import { VisitsModule, VisitsService } from './visits';

const Purity = z.enum(['K24', 'K22', 'K18', 'K14']);
const AssignBody = z.object({ agentId: z.string().min(1), shopId: z.string().min(1), date: ymd, sequence: z.number().int().min(1).max(100).optional(), plannedTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM').optional() });
const RateBody = z.object({ purity: Purity, ratePaisePerGram: z.number().int().positive().max(10_000_000) });
const ShopBody = z.object({
  code: z.string().trim().min(1).max(32).optional(),
  name: z.string().trim().min(1).max(200),
  ownerName: z.string().max(200).optional(),
  phone: z.string().max(32).optional(),
  address: z.string().trim().min(1).max(500),
  area: z.string().trim().min(1).max(100),
  city: z.string().trim().min(1).max(100).default('New Delhi'),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  geofenceRadiusM: z.number().int().min(10).max(2000).default(100),
  creditLimitPaise: z.number().int().min(0).default(0),
  notes: z.string().max(2000).optional(),
  assignedAgentId: z.string().min(1).max(64).nullable().optional(),
});
const OtherComp = z.object({ label: z.string().min(1).max(100), valuePaise: z.number().int().min(0) });
const DesignBody = z.object({
  sku: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(100),
  collection: z.string().trim().min(1).max(100),
  purity: Purity,
  grossWeightMg: z.number().int().positive(),
  netWeightMg: z.number().int().positive(),
  makingChargeType: z.enum(['PER_GRAM', 'PERCENT']).default('PER_GRAM'),
  makingChargeValue: z.number().int().min(0),
  stoneValuePaise: z.number().int().min(0).default(0),
  otherComponents: z.array(OtherComp).max(20).default([]),
  imageUrls: z.array(z.string().url()).max(10).default([]),
  description: z.string().max(4000).optional(),
  active: z.boolean().optional(),
});
const IntakeBody = z.object({ count: z.number().int().min(1).max(50), grossWeightMg: z.number().int().positive().optional(), netWeightMg: z.number().int().positive().optional() });
const IssueBody = z.object({ pieceIds: z.array(z.string().min(1)).min(1).max(200), agentId: z.string().min(1) });
const PiecesOnly = z.object({ pieceIds: z.array(z.string().min(1)).min(1).max(200) });
const AgentBody = z.object({ name: z.string().trim().min(1).max(200), email: z.string().email().max(200), phone: z.string().max(32).optional(), password: z.string().min(8).max(200), homeArea: z.string().max(100).optional() });
const AgentPatch = z.object({ name: z.string().trim().min(1).max(200).optional(), phone: z.string().max(32).optional(), active: z.boolean().optional(), password: z.string().min(8).max(200).optional(), homeArea: z.string().max(100).optional() });

const OPEN: VisitStatus[] = ['CHECKED_IN', 'ACTIVE'];

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly views: ViewsService,
    private readonly rates: RatesService,
    private readonly audit: AuditService,
    private readonly custody: CustodyService,
    private readonly visits: VisitsService,
    private readonly records: RecordsService,
  ) {}

  // ---------------- dashboard ----------------
  async dashboard(ctx: ReqCtx, date?: string) {
    const tid = ctx.user.tid;
    const day = date ?? istDate();
    const db = this.prisma.db;
    const dayStartUtc = new Date(`${day}T00:00:00+05:30`);
    const dayEndUtc = new Date(dayStartUtc.getTime() + 86400000);
    const rates = await this.rates.current(tid);
    const [visitsRaw, ordersToday, pendingOrders, openMemos, shops, piecesOut, agents, events, missedPast] = await Promise.all([
      db.visit.findMany({ where: { tenantId: tid, plannedDate: dateOf(day), status: { not: 'CANCELLED' } }, include: visitInclude, orderBy: [{ agentId: 'asc' }, { sequence: 'asc' }] }),
      db.order.findMany({ where: { tenantId: tid, createdAt: { gte: dayStartUtc, lt: dayEndUtc }, status: { not: 'REJECTED' } }, select: { totalPaise: true, agentId: true } }),
      this.views.orders(tid, { status: 'SUBMITTED' }, { take: 50 }),
      this.views.memos(tid, { status: { in: ['ACTIVE', 'PARTIALLY_RETURNED'] } }, { orderBy: { dueDate: 'asc' } }),
      db.shop.findMany({ where: { tenantId: tid }, orderBy: { name: 'asc' } }),
      this.views.pieces(tid, { custodianType: { in: ['SHOP', 'AGENT'] } }, undefined, rates),
      db.user.findMany({ where: { tenantId: tid, role: 'FIELD_AGENT', active: true }, orderBy: { name: 'asc' } }),
      db.outboxEvent.findMany({ where: { tenantId: tid, type: { not: 'ping' } }, orderBy: { createdAt: 'desc' }, take: 40 }),
      db.visit.findMany({ where: { tenantId: tid, plannedDate: { lt: dateOf(day), gte: dateOf(new Date(dayStartUtc.getTime() - 7 * 86400000).toISOString().slice(0, 10)) }, status: { in: ['PLANNED', 'MISSED'] } }, include: visitInclude, take: 20 }),
    ]);
    const visits = await this.views.visitSummaries(tid, visitsRaw);
    const nowIstHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(new Date()));
    const isToday = day === istDate();
    const missedToday = visits.filter((v) => v.status === 'MISSED' || (v.status === 'PLANNED' && ((isToday && nowIstHour >= 18) || day < istDate())));
    const pastSummaries = await this.views.visitSummaries(tid, missedPast);
    const atShop = piecesOut.filter((p) => p.custodianType === 'SHOP');
    const overdue = openMemos.filter((m) => m.displayStatus === 'OVERDUE');
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const visitByShop = new Map(visits.map((v) => [v.shop.id, v.status]));
    const ordersByAgent = new Map<string, number>();
    for (const o of ordersToday) ordersByAgent.set(o.agentId, (ordersByAgent.get(o.agentId) ?? 0) + Number(o.totalPaise));
    return {
      date: day,
      rates: Object.values(rates),
      metrics: {
        ordersToday: { count: ordersToday.length, valuePaise: sum(ordersToday.map((o) => Number(o.totalPaise))) },
        visits: { completed: visits.filter((v) => v.status === 'COMPLETED').length, planned: visits.length, inProgress: visits.filter((v) => OPEN.includes(v.status)).length },
        samplesOutside: { count: atShop.length, valuePaise: sum(atShop.map((p) => p.valuePaise)) },
        memoValueOutsidePaise: sum(openMemos.map((m) => m.outstandingValuePaise)),
        overdueMemos: { count: overdue.length, valuePaise: sum(overdue.map((m) => m.outstandingValuePaise)) },
        pendingApprovals: { count: pendingOrders.length, valuePaise: sum(pendingOrders.map((o) => o.totalPaise)) },
      },
      map: {
        shops: shops.map((s) => ({ id: s.id, name: s.name, area: s.area, lat: s.lat, lng: s.lng, visitStatus: visitByShop.get(s.id), piecesHere: atShop.filter((p) => p.custodian.shopId === s.id).length })),
        checkIns: visits
          .filter((v) => v.checkInAt)
          .map((v) => ({ visitId: v.id, agentName: v.agent.name, shopName: v.shop.name, lat: v.checkInLat, lng: v.checkInLng, at: v.checkInAt, verification: v.verification, distanceM: v.checkInDistanceM, status: v.status })),
      },
      activity: await this.activity(tid, events),
      exceptions: { pendingOrders, overdueMemos: overdue, missedVisits: [...missedToday, ...pastSummaries.filter((v) => v.status !== 'PLANNED' || true)] },
      visits,
      agents: agents.map((a) => {
        const mine = visits.filter((v) => v.agent.id === a.id);
        const lastCheckIn = mine.map((v) => v.checkInAt).filter(Boolean).sort().pop();
        return {
          id: a.id,
          name: a.name,
          visitsPlanned: mine.length,
          visitsCompleted: mine.filter((v) => v.status === 'COMPLETED').length,
          currentVisit: mine.find((v) => OPEN.includes(v.status))?.shop.name,
          ordersValuePaise: ordersByAgent.get(a.id) ?? 0,
          bagValuePaise: sum(piecesOut.filter((p) => p.custodianType === 'AGENT' && p.custodian.agentId === a.id).map((p) => p.valuePaise)),
          bagCount: piecesOut.filter((p) => p.custodianType === 'AGENT' && p.custodian.agentId === a.id).length,
          lastCheckInAt: lastCheckIn,
        };
      }),
    };
  }

  async activity(tid: string, events?: Prisma.OutboxEventGetPayload<object>[], take = 40) {
    const rows = events ?? (await this.prisma.db.outboxEvent.findMany({ where: { tenantId: tid, type: { not: 'ping' } }, orderBy: { createdAt: 'desc' }, take }));
    return toActivityItems(rows);
  }

  // ---------------- visits & assignments ----------------
  async assign(ctx: ReqCtx, body: z.infer<typeof AssignBody>) {
    const tid = ctx.user.tid;
    const [agent, shop] = await Promise.all([
      this.prisma.db.user.findFirst({ where: { id: body.agentId, tenantId: tid, role: 'FIELD_AGENT' } }),
      this.prisma.db.shop.findFirst({ where: { id: body.shopId, tenantId: tid } }),
    ]);
    if (!agent) throw notFound('Agent');
    if (!shop) throw notFound('Shop');
    if (!agent.active) throw conflict('AGENT_INACTIVE', `${agent.name} is deactivated`);
    const today = istDate();
    if (body.date < today) throw badRequest('INVALID_DATE', `Visits can only be assigned for today (${today}) or later`);
    try {
      return await this.prisma.tx(async (tx) => {
        const max = await tx.visit.aggregate({ where: { tenantId: tid, agentId: agent.id, plannedDate: dateOf(body.date) }, _max: { sequence: true } });
        const v = await tx.visit.create({
          data: { tenantId: tid, agentId: agent.id, shopId: shop.id, plannedDate: dateOf(body.date), plannedTime: body.plannedTime, sequence: body.sequence ?? (max._max.sequence ?? 0) + 1, assignedById: ctx.user.sub },
        });
        await this.audit.log(tx, ctx, 'visit.assign', 'Visit', v.id, null, { agentId: agent.id, shopId: shop.id, date: body.date, sequence: v.sequence, plannedTime: body.plannedTime });
        return { visit: await this.views.visitSummary(tid, v.id, tx) };
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        const existing = await this.prisma.db.visit.findFirst({ where: { tenantId: tid, agentId: agent.id, shopId: shop.id, plannedDate: dateOf(body.date) }, select: { id: true } });
        throw conflict('ALREADY_ASSIGNED', `${shop.name} is already assigned to ${agent.name} on ${body.date}`, { visitId: existing?.id });
      }
      throw e;
    }
  }

  async unassign(ctx: ReqCtx, visitId: string) {
    return this.prisma.tx(async (tx) => {
      const v = await tx.visit.findFirst({ where: { id: visitId, tenantId: ctx.user.tid } });
      if (!v) throw notFound('Visit');
      const r = await tx.visit.updateMany({ where: { id: visitId, tenantId: ctx.user.tid, status: 'PLANNED' }, data: { status: 'CANCELLED' } });
      if (r.count !== 1) throw conflict('VISIT_NOT_PLANNED', `Only planned visits can be unassigned (visit is ${v.status})`);
      await this.audit.log(tx, ctx, 'visit.unassign', 'Visit', visitId, { status: v.status }, { status: 'CANCELLED' });
      return {};
    });
  }

  // ---------------- gold rates ----------------
  async goldRates(ctx: ReqCtx) {
    const tid = ctx.user.tid;
    const current = await this.rates.current(tid);
    const history = await this.prisma.db.goldRate.findMany({ where: { tenantId: ctx.user.tid }, orderBy: { effectiveFrom: 'desc' }, take: 60 });
    const names = await this.views.userNames([...history.map((h) => h.createdById)]);
    const by = (id: string | null) => (id ? { id, name: names.get(id) ?? '' } : undefined);
    const histMap = new Map(history.map((h) => [h.id, h]));
    return {
      current: Object.values(current).map((r) => ({ ...r!, createdBy: by(histMap.get(r!.goldRateId)?.createdById ?? null) })),
      history: history.map((h) => ({ purity: h.purity, ratePaisePerGram: Number(h.ratePaisePerGram), goldRateId: h.id, effectiveFrom: h.effectiveFrom.toISOString(), source: h.source, createdBy: by(h.createdById) })),
    };
  }

  async setRate(ctx: ReqCtx, body: z.infer<typeof RateBody>) {
    return this.prisma.tx(async (tx) => {
      const before = (await this.rates.current(ctx.user.tid, tx))[body.purity];
      const r = await tx.goldRate.create({ data: { tenantId: ctx.user.tid, purity: body.purity, ratePaisePerGram: BigInt(body.ratePaisePerGram), createdById: ctx.user.sub, source: 'MANUAL' } });
      await this.audit.log(tx, ctx, 'gold_rate.set', 'GoldRate', r.id, before ? { purity: body.purity, ratePaisePerGram: before.ratePaisePerGram, goldRateId: before.goldRateId } : null, { purity: body.purity, ratePaisePerGram: body.ratePaisePerGram });
      return { rate: { purity: r.purity, ratePaisePerGram: Number(r.ratePaisePerGram), goldRateId: r.id, effectiveFrom: r.effectiveFrom.toISOString(), createdBy: { id: ctx.user.sub, name: ctx.user.name ?? '' } } };
    });
  }

  // ---------------- shops ----------------
  private async checkAgent(tid: string, agentId: string | null | undefined) {
    if (!agentId) return;
    const a = await this.prisma.db.user.findFirst({ where: { id: agentId, tenantId: tid, role: 'FIELD_AGENT' }, select: { id: true } });
    if (!a) throw notFound('Agent');
  }

  async createShop(ctx: ReqCtx, body: z.infer<typeof ShopBody>) {
    const tid = ctx.user.tid;
    await this.checkAgent(tid, body.assignedAgentId);
    try {
      return await this.prisma.tx(async (tx) => {
        const code = body.code ?? `SH-${String(await nextDocNumber(tx, tid, 'TAG', 1)).padStart(4, '0')}`;
        const s = await tx.shop.create({ data: { ...body, code, tenantId: tid, creditLimitPaise: BigInt(body.creditLimitPaise) } });
        await this.audit.log(tx, ctx, 'shop.create', 'Shop', s.id, null, toShop(s));
        return { shop: toShop(s) };
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('SHOP_CODE_TAKEN', 'A shop with this code already exists');
      throw e;
    }
  }

  async patchShop(ctx: ReqCtx, id: string, body: Partial<z.infer<typeof ShopBody>>) {
    await this.checkAgent(ctx.user.tid, body.assignedAgentId);
    return this.prisma.tx(async (tx) => {
      const before = await tx.shop.findFirst({ where: { id, tenantId: ctx.user.tid } });
      if (!before) throw notFound('Shop');
      const s = await tx.shop.update({ where: { id }, data: { ...body, creditLimitPaise: body.creditLimitPaise == null ? undefined : BigInt(body.creditLimitPaise) } });
      await this.audit.log(tx, ctx, 'shop.update', 'Shop', id, toShop(before), toShop(s));
      return { shop: toShop(s) };
    });
  }

  // ---------------- designs & pieces ----------------
  async designs(ctx: ReqCtx) {
    const tid = ctx.user.tid;
    const rates = await this.rates.current(tid);
    const [designs, pieces] = await Promise.all([
      this.prisma.db.jewelryDesign.findMany({ where: { tenantId: tid }, orderBy: [{ category: 'asc' }, { sku: 'asc' }] }),
      this.views.pieces(tid, {}, undefined, rates),
    ]);
    return designs.map((d) => ({ ...toDesign(d, rates), pieces: pieces.filter((p) => p.designId === d.id) }));
  }

  async createDesign(ctx: ReqCtx, body: z.infer<typeof DesignBody>) {
    const tid = ctx.user.tid;
    try {
      return await this.prisma.tx(async (tx) => {
        const d = await tx.jewelryDesign.create({ data: { ...body, tenantId: tid, makingChargeValue: BigInt(body.makingChargeValue), stoneValuePaise: BigInt(body.stoneValuePaise) } });
        await this.audit.log(tx, ctx, 'design.create', 'JewelryDesign', d.id, null, body);
        return { design: toDesign(d, await this.rates.current(tid, tx)) };
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('SKU_TAKEN', 'A design with this SKU already exists');
      throw e;
    }
  }

  async patchDesign(ctx: ReqCtx, id: string, body: Partial<z.infer<typeof DesignBody>>) {
    const tid = ctx.user.tid;
    return this.prisma.tx(async (tx) => {
      const before = await tx.jewelryDesign.findFirst({ where: { id, tenantId: tid } });
      if (!before) throw notFound('Design');
      const d = await tx.jewelryDesign.update({
        where: { id },
        data: { ...body, makingChargeValue: body.makingChargeValue == null ? undefined : BigInt(body.makingChargeValue), stoneValuePaise: body.stoneValuePaise == null ? undefined : BigInt(body.stoneValuePaise) },
      });
      const rates = await this.rates.current(tid, tx);
      await this.audit.log(tx, ctx, 'design.update', 'JewelryDesign', id, toDesign(before, rates), toDesign(d, rates));
      return { design: toDesign(d, rates) };
    });
  }

  async intake(ctx: ReqCtx, designId: string, body: z.infer<typeof IntakeBody>) {
    const tid = ctx.user.tid;
    return this.prisma.tx(async (tx) => {
      const d = await tx.jewelryDesign.findFirst({ where: { id: designId, tenantId: tid } });
      if (!d) throw notFound('Design');
      const ids: string[] = [];
      for (let i = 0; i < body.count; i++) {
        const n = await nextDocNumber(tx, tid, 'TAG', 0);
        const p = await tx.samplePiece.create({
          data: { tenantId: tid, designId, tagCode: `AJ-S-${String(n).padStart(6, '0')}`, grossWeightMg: body.grossWeightMg ?? d.grossWeightMg, netWeightMg: body.netWeightMg ?? d.netWeightMg, custodianType: 'VAULT', custodySeq: 1 },
        });
        await tx.custodyEvent.create({ data: { tenantId: tid, pieceId: p.id, seq: 1, toType: 'VAULT', reason: 'INTAKE', actorId: ctx.user.sub } });
        ids.push(p.id);
      }
      await this.audit.log(tx, ctx, 'piece.intake', 'JewelryDesign', designId, null, { count: body.count, pieceIds: ids });
      return { pieces: await this.views.pieces(tid, { id: { in: ids } }, tx) };
    });
  }

  async pieceHistory(ctx: ReqCtx, id: string) {
    const tid = ctx.user.tid;
    const [piece] = await this.views.pieces(tid, { id });
    if (!piece) throw notFound('Piece');
    const events = await this.prisma.db.custodyEvent.findMany({ where: { tenantId: tid, pieceId: id }, orderBy: { seq: 'asc' } });
    const userIds = events.flatMap((e) => [e.fromAgentId, e.toAgentId, e.actorId]);
    const shopIds = [...new Set(events.flatMap((e) => [e.fromShopId, e.toShopId]).filter(Boolean) as string[])];
    const memoIds = [...new Set(events.map((e) => e.memoId).filter(Boolean) as string[])];
    const [names, shops, memos] = await Promise.all([
      this.views.userNames(userIds),
      this.prisma.db.shop.findMany({ where: { id: { in: shopIds } }, select: { id: true, name: true } }),
      this.prisma.db.memo.findMany({ where: { id: { in: memoIds } }, select: { id: true, number: true } }),
    ]);
    const label = (t: string | null, a: string | null, s: string | null) =>
      !t ? '—' : t === 'AGENT' ? names.get(a!) ?? 'Agent' : t === 'SHOP' ? shops.find((x) => x.id === s)?.name ?? 'Shop' : t[0] + t.slice(1).toLowerCase();
    return {
      piece,
      events: events.map((e) => ({
        seq: e.seq,
        fromType: e.fromType,
        toType: e.toType,
        fromLabel: label(e.fromType, e.fromAgentId, e.fromShopId),
        toLabel: label(e.toType, e.toAgentId, e.toShopId),
        reason: e.reason,
        actorName: e.actorId ? names.get(e.actorId) : undefined,
        memoId: e.memoId ?? undefined,
        memoNumber: memos.find((m) => m.id === e.memoId)?.number,
        visitId: e.visitId ?? undefined,
        occurredAt: e.occurredAt.toISOString(),
      })),
    };
  }

  async issue(ctx: ReqCtx, body: z.infer<typeof IssueBody>) {
    const tid = ctx.user.tid;
    const agent = await this.prisma.db.user.findFirst({ where: { id: body.agentId, tenantId: tid, role: 'FIELD_AGENT', active: true } });
    if (!agent) throw notFound('Agent');
    return this.prisma.tx(async (tx) => {
      await this.custody.move(tx, ctx, { pieceIds: body.pieceIds, from: { type: 'VAULT' }, to: { type: 'AGENT', agentId: agent.id }, reason: 'ISSUE_TO_AGENT', notHeldCode: 'PIECE_NOT_IN_VAULT' });
      return { pieces: await this.views.pieces(tid, { id: { in: body.pieceIds } }, tx) };
    });
  }

  async returnToVault(ctx: ReqCtx, body: z.infer<typeof PiecesOnly>) {
    const tid = ctx.user.tid;
    return this.prisma.tx(async (tx) => {
      const pieces = await tx.samplePiece.findMany({ where: { tenantId: tid, id: { in: body.pieceIds } }, select: { custodianType: true, custodianAgentId: true } });
      if (pieces.length !== new Set(body.pieceIds).size) throw notFound('Piece');
      const agents = [...new Set(pieces.map((p) => p.custodianAgentId))];
      if (agents.length !== 1 || !agents[0] || pieces.some((p) => p.custodianType !== 'AGENT')) throw conflict('PIECE_NOT_WITH_AGENT', 'All pieces must currently be with the same agent');
      await this.custody.move(tx, ctx, { pieceIds: body.pieceIds, from: { type: 'AGENT', agentId: agents[0] }, to: { type: 'VAULT' }, reason: 'RETURN_TO_VAULT', notHeldCode: 'PIECE_NOT_WITH_AGENT' });
      return { pieces: await this.views.pieces(tid, { id: { in: body.pieceIds } }, tx) };
    });
  }

  // ---------------- agents ----------------
  /** v2 AgentRow — one call, grouped queries (no per-agent lookups). */
  async agents(ctx: ReqCtx) {
    const tid = ctx.user.tid;
    const day = istDate();
    const dayStart = new Date(`${day}T00:00:00+05:30`);
    const db = this.prisma.db;
    const [agents, visits, open, bag, rates, memos, orders, lastCheckIns] = await Promise.all([
      db.user.findMany({ where: { tenantId: tid, role: 'FIELD_AGENT' }, orderBy: { name: 'asc' } }),
      db.visit.findMany({ where: { tenantId: tid, plannedDate: dateOf(day), status: { not: 'CANCELLED' } }, select: { id: true, agentId: true, status: true, sequence: true, plannedTime: true, shop: { select: { name: true } } }, orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }] }),
      db.visit.findMany({ where: { tenantId: tid, status: { in: OPEN } }, select: { id: true, agentId: true, checkInAt: true, shop: { select: { name: true } } } }),
      db.samplePiece.findMany({ where: { tenantId: tid, custodianType: 'AGENT' }, select: { custodianAgentId: true, netWeightMg: true, design: true } }),
      this.rates.current(tid),
      db.$queryRaw<{ agentId: string; count: bigint; value: bigint | null; overdue: bigint }[]>`
        SELECT m."agentId", count(DISTINCT m.id) AS count, sum(mi."valuePaise") AS value,
               count(DISTINCT m.id) FILTER (WHERE m."dueDate" < ${day}::date) AS overdue
        FROM "Memo" m JOIN "MemoItem" mi ON mi."memoId" = m.id AND mi.status = 'OUT'
        WHERE m."tenantId" = ${tid} GROUP BY m."agentId"`,
      db.order.groupBy({ by: ['agentId'], where: { tenantId: tid, status: { not: 'REJECTED' }, createdAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 86_400_000) } }, _count: { _all: true }, _sum: { totalPaise: true } }),
      db.visit.groupBy({ by: ['agentId'], where: { tenantId: tid, checkInAt: { not: null } }, _max: { checkInAt: true } }),
    ]);
    const bagBy = new Map<string, { count: number; valuePaise: number }>();
    for (const p of bag) {
      const b = bagBy.get(p.custodianAgentId!) ?? { count: 0, valuePaise: 0 };
      b.count++;
      b.valuePaise += valueOrZero(p.design, rates, p.netWeightMg);
      bagBy.set(p.custodianAgentId!, b);
    }
    const M = new Map(memos.map((m) => [m.agentId, m]));
    const O = new Map(orders.map((o) => [o.agentId, o]));
    const L = new Map(lastCheckIns.map((l) => [l.agentId, l._max.checkInAt]));
    return agents.map((a) => {
      const mine = visits.filter((v) => v.agentId === a.id);
      const cur = open.find((v) => v.agentId === a.id);
      const next = mine.find((v) => v.status === 'PLANNED');
      const m = M.get(a.id);
      const o = O.get(a.id);
      return {
        id: a.id,
        name: a.name,
        email: a.email,
        phone: a.phone ?? undefined,
        homeArea: a.homeArea ?? undefined,
        active: a.active,
        today: { planned: mine.length, completed: mine.filter((v) => v.status === 'COMPLETED').length, inProgress: mine.filter((v) => OPEN.includes(v.status)).length },
        currentVisit: cur ? { id: cur.id, shopName: cur.shop.name, since: cur.checkInAt?.toISOString() } : undefined,
        nextVisit: next ? { id: next.id, shopName: next.shop.name, plannedTime: next.plannedTime ?? undefined } : undefined,
        bag: bagBy.get(a.id) ?? { count: 0, valuePaise: 0 },
        openMemos: { count: Number(m?.count ?? 0), valuePaise: Number(m?.value ?? 0), overdueCount: Number(m?.overdue ?? 0) },
        ordersToday: { count: o?._count._all ?? 0, valuePaise: Number(o?._sum.totalPaise ?? 0) },
        lastCheckInAt: L.get(a.id)?.toISOString(),
      };
    });
  }

  async createAgent(ctx: ReqCtx, body: z.infer<typeof AgentBody>) {
    try {
      return await this.prisma.tx(async (tx) => {
        const u = await tx.user.create({
          data: { tenantId: ctx.user.tid, name: body.name, email: body.email.toLowerCase(), phone: body.phone, homeArea: body.homeArea, role: 'FIELD_AGENT', passwordHash: await bcrypt.hash(body.password, 10) },
        });
        await this.audit.log(tx, ctx, 'agent.create', 'User', u.id, null, { name: u.name, email: u.email });
        return { agent: { id: u.id, name: u.name, email: u.email, phone: u.phone ?? undefined, active: u.active } };
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('EMAIL_TAKEN', 'A user with this email already exists');
      throw e;
    }
  }

  async patchAgent(ctx: ReqCtx, id: string, body: z.infer<typeof AgentPatch>) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.user.findFirst({ where: { id, tenantId: ctx.user.tid, role: 'FIELD_AGENT' } });
      if (!before) throw notFound('Agent');
      const { password, ...rest } = body;
      const u = await tx.user.update({ where: { id }, data: { ...rest, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) } });
      if (body.active === false) await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log(tx, ctx, 'agent.update', 'User', id, { name: before.name, phone: before.phone, active: before.active }, { name: u.name, phone: u.phone, active: u.active, passwordChanged: !!password });
      return { agent: { id: u.id, name: u.name, email: u.email, phone: u.phone ?? undefined, active: u.active } };
    });
  }

  /** v1 list, now with the v2 AuditRow fields (`actor` Ref, `summary`, `refs`); `actorName` kept. */
  auditLog(ctx: ReqCtx, q: { entityType?: string; entityId?: string }) {
    return this.records.auditRows(ctx.user.tid, { ...(q.entityType ? { entityType: q.entityType } : {}), ...(q.entityId ? { entityId: { contains: q.entityId } } : {}) }, 200, 'desc');
  }
}

@ApiTags('admin')
@Requires('admin')
@Controller('v1/admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly dispatcher: Dispatcher,
    private readonly records: RecordsService,
  ) {}

  @Get('dashboard')
  dashboard(@Ctx() ctx: ReqCtx, @Query('date') date?: string) {
    this.dispatcher.maybeKick('dashboard');
    return this.admin.dashboard(ctx, date ? parse(ymd, date) : undefined);
  }

  @Get('home')
  async home(@Ctx() ctx: ReqCtx, @Query('date') date?: string) {
    this.dispatcher.maybeKick('home');
    const day = date ? parse(ymd, date) : istDate();
    const [d, attention] = await Promise.all([this.admin.dashboard(ctx, day), this.records.attention(ctx.user.tid, day)]);
    return { user: { id: ctx.user.sub, name: ctx.user.name ?? '' }, date: d.date, metrics: d.metrics, map: d.map, attention, activity: d.activity, agents: d.agents, rates: d.rates };
  }

  @Get('activity')
  activity(@Ctx() ctx: ReqCtx) {
    return this.admin.activity(ctx.user.tid, undefined, 100);
  }

  @Post('assignments')
  assign(@Ctx() ctx: ReqCtx, @Body() body: unknown) {
    return this.admin.assign(ctx, parse(AssignBody, body));
  }

  @Delete('assignments/:visitId')
  unassign(@Ctx() ctx: ReqCtx, @Param('visitId') id: string) {
    return this.admin.unassign(ctx, id);
  }

  @Get('gold-rates')
  goldRates(@Ctx() ctx: ReqCtx) {
    return this.admin.goldRates(ctx);
  }

  @Post('gold-rates')
  setRate(@Ctx() ctx: ReqCtx, @Body() body: unknown) {
    return this.admin.setRate(ctx, parse(RateBody, body));
  }

  @Post('shops')
  createShop(@Ctx() ctx: ReqCtx, @Body() body: unknown) {
    return this.admin.createShop(ctx, parse(ShopBody, body));
  }

  @Patch('shops/:id')
  patchShop(@Ctx() ctx: ReqCtx, @Param('id') id: string, @Body() body: unknown) {
    return this.admin.patchShop(ctx, id, parse(ShopBody.partial().omit({ code: true }), body));
  }

  @Get('designs')
  designs(@Ctx() ctx: ReqCtx) {
    return this.admin.designs(ctx);
  }

  @Post('designs')
  createDesign(@Ctx() ctx: ReqCtx, @Body() body: unknown) {
    return this.admin.createDesign(ctx, parse(DesignBody, body));
  }

  @Patch('designs/:id')
  patchDesign(@Ctx() ctx: ReqCtx, @Param('id') id: string, @Body() body: unknown) {
    return this.admin.patchDesign(ctx, id, parse(DesignBody.partial(), body));
  }

  @Post('designs/:id/pieces')
  intake(@Ctx() ctx: ReqCtx, @Param('id') id: string, @Body() body: unknown) {
    return this.admin.intake(ctx, id, parse(IntakeBody, body));
  }

  @Get('pieces/:id/history')
  pieceHistory(@Ctx() ctx: ReqCtx, @Param('id') id: string) {
    return this.admin.pieceHistory(ctx, id);
  }

  @Post('pieces/issue')
  @HttpCode(200)
  issue(@Ctx() ctx: ReqCtx, @Body() body: unknown) {
    return this.admin.issue(ctx, parse(IssueBody, body));
  }

  @Post('pieces/return-to-vault')
  @HttpCode(200)
  returnToVault(@Ctx() ctx: ReqCtx, @Body() body: unknown) {
    return this.admin.returnToVault(ctx, parse(PiecesOnly, body));
  }

  @Get('agents')
  agents(@Ctx() ctx: ReqCtx) {
    return this.admin.agents(ctx);
  }

  @Post('agents')
  createAgent(@Ctx() ctx: ReqCtx, @Body() body: unknown) {
    return this.admin.createAgent(ctx, parse(AgentBody, body));
  }

  @Patch('agents/:id')
  patchAgent(@Ctx() ctx: ReqCtx, @Param('id') id: string, @Body() body: unknown) {
    return this.admin.patchAgent(ctx, id, parse(AgentPatch, body));
  }

  @Get('audit')
  audit(@Ctx() ctx: ReqCtx, @Query() q: { entityType?: string; entityId?: string }) {
    return this.admin.auditLog(ctx, q);
  }
}

@Module({ imports: [VisitsModule], controllers: [AdminController, RecordsController], providers: [AdminService, RecordsService] })
export class AdminModule {}
