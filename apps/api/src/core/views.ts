import { Injectable } from '@nestjs/common';
import { daysBetween, istDate, memoDisplayStatus } from '@jewelroute/shared';
import { Prisma } from '../../generated/prisma';
import { PrismaService, Tx } from '../prisma.service';
import { otherComponentsOf, price, RateMap, RatesService, valueOrZero } from './rates';

export const ymdOf = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : undefined);
export const dateOf = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : undefined);
const num = (v: bigint | number | null | undefined) => (v == null ? 0 : Number(v));

export const pieceInclude = {
  design: true,
  custodianAgent: { select: { id: true, name: true } },
  custodianShop: { select: { id: true, name: true } },
} satisfies Prisma.SamplePieceInclude;
export type PieceRow = Prisma.SamplePieceGetPayload<{ include: typeof pieceInclude }>;

export const orderInclude = {
  shop: { select: { id: true, name: true, area: true } },
  agent: { select: { id: true, name: true } },
  items: { include: { design: { select: { imageUrls: true } } }, orderBy: { id: 'asc' } },
} satisfies Prisma.OrderInclude;
export type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export const memoInclude = {
  shop: { select: { id: true, name: true, area: true } },
  agent: { select: { id: true, name: true } },
  items: { include: { piece: { include: pieceInclude } }, orderBy: { createdAt: 'asc' } },
  extensions: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.MemoInclude;
export type MemoRow = Prisma.MemoGetPayload<{ include: typeof memoInclude }>;

export const visitInclude = {
  shop: true,
  agent: { select: { id: true, name: true } },
  _count: { select: { proofs: true, orders: true } },
} satisfies Prisma.VisitInclude;
export type VisitRow = Prisma.VisitGetPayload<{ include: typeof visitInclude }>;

type ShopRow = Prisma.ShopGetPayload<object>;
export function toShop(s: ShopRow) {
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    ownerName: s.ownerName ?? undefined,
    phone: s.phone ?? undefined,
    address: s.address,
    area: s.area,
    city: s.city,
    lat: s.lat,
    lng: s.lng,
    geofenceRadiusM: s.geofenceRadiusM,
    creditLimitPaise: num(s.creditLimitPaise),
    openingOutstandingPaise: num(s.openingOutstandingPaise),
    notes: s.notes ?? undefined,
    assignedAgentId: s.assignedAgentId ?? undefined,
  };
}

export function toPiece(p: PieceRow, rates: RateMap) {
  return {
    id: p.id,
    tagCode: p.tagCode,
    designId: p.designId,
    sku: p.design.sku,
    name: p.design.name,
    category: p.design.category,
    imageUrl: p.design.imageUrls[0],
    purity: p.design.purity,
    grossWeightMg: p.grossWeightMg,
    netWeightMg: p.netWeightMg,
    custodianType: p.custodianType,
    custodian: {
      type: p.custodianType,
      agentId: p.custodianAgentId ?? undefined,
      agentName: p.custodianAgent?.name,
      shopId: p.custodianShopId ?? undefined,
      shopName: p.custodianShop?.name,
    },
    custodySeq: p.custodySeq,
    valuePaise: valueOrZero(p.design, rates, p.netWeightMg),
  };
}
export type PieceView = ReturnType<typeof toPiece>;

export function toDesign(d: Prisma.JewelryDesignGetPayload<object>, rates: RateMap) {
  return {
    id: d.id,
    sku: d.sku,
    name: d.name,
    category: d.category,
    collection: d.collection,
    purity: d.purity,
    grossWeightMg: d.grossWeightMg,
    netWeightMg: d.netWeightMg,
    makingChargeType: d.makingChargeType,
    makingChargeValue: num(d.makingChargeValue),
    stoneValuePaise: num(d.stoneValuePaise),
    otherComponents: otherComponentsOf(d.otherComponents),
    imageUrls: d.imageUrls,
    description: d.description ?? undefined,
    active: d.active,
    price: rates[d.purity] ? price(d, rates) : null,
  };
}

export function toOrder(o: OrderRow, names: Map<string, string>) {
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    shop: o.shop,
    agent: o.agent,
    visitId: o.visitId ?? undefined,
    sourceMemoId: o.sourceMemoId ?? undefined,
    subtotalPaise: num(o.subtotalPaise),
    gstPaise: num(o.gstPaise),
    totalPaise: num(o.totalPaise),
    goldRateSnapshot: o.goldRateSnapshot,
    items: o.items.map((i) => ({
      id: i.id,
      designId: i.designId,
      pieceId: i.pieceId ?? undefined,
      sku: i.sku,
      name: i.name,
      purity: i.purity,
      quantity: i.quantity,
      netWeightMg: i.netWeightMg,
      goldRateId: i.goldRateId,
      ratePaisePerGram: num(i.ratePaisePerGram),
      goldValuePaise: num(i.goldValuePaise),
      makingPaise: num(i.makingPaise),
      stonePaise: num(i.stonePaise),
      otherPaise: num(i.otherPaise),
      unitPricePaise: num(i.unitPricePaise),
      lineTotalPaise: num(i.lineTotalPaise),
      imageUrl: i.design.imageUrls[0],
    })),
    itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
    notes: o.notes ?? undefined,
    decidedBy: o.decidedById ? { id: o.decidedById, name: names.get(o.decidedById) ?? 'Unknown' } : undefined,
    decidedAt: iso(o.decidedAt),
    rejectionReason: o.rejectionReason ?? undefined,
    // v3: why (or whether) this order needed approval, with the credit position frozen at creation.
    // Legacy (migrated) snapshots lack shopId/asOf — fill them so every position has the CreditPosition shape.
    approval: { required: o.approvalRequired, reasons: o.approvalReasons, position: o.creditSnapshot ? { shopId: o.shop.id, asOf: o.createdAt.toISOString(), ...(o.creditSnapshot as Record<string, unknown>) } : null },
    settledAt: iso(o.settledAt),
    cancelledAt: iso(o.cancelledAt),
    cancellationReason: o.cancellationReason ?? undefined,
    createdAt: o.createdAt.toISOString(),
  };
}
export type OrderView = ReturnType<typeof toOrder>;

export function toMemo(m: MemoRow, rates: RateMap, today = istDate()) {
  const due = ymdOf(m.dueDate)!;
  const outstanding = m.items.filter((i) => i.status === 'OUT').reduce((s, i) => s + num(i.valuePaise), 0);
  return {
    id: m.id,
    number: m.number,
    status: m.status,
    displayStatus: memoDisplayStatus(m.status, due, today),
    extended: m.extensions.length > 0,
    shop: m.shop,
    agent: m.agent,
    visitId: m.visitId ?? undefined,
    dueDate: due,
    daysToDue: daysBetween(today, due),
    notes: m.notes ?? undefined,
    totalValuePaise: num(m.totalValuePaise),
    outstandingValuePaise: outstanding,
    outstandingCount: m.items.filter((i) => i.status === 'OUT').length,
    ackStatus: m.ackStatus,
    ackAt: iso(m.ackAt),
    ackMethod: m.ackMethod ?? undefined,
    /** Audit B8: the acknowledgement came from the agent's own session or device (evidence only, never blocks). */
    selfAckSuspected: m.selfAckSuspected,
    selfAckReason: m.selfAckReason ?? undefined,
    items: m.items.map((i) => ({ id: i.id, status: i.status, valuePaise: num(i.valuePaise), returnedAt: iso(i.returnedAt), piece: toPiece(i.piece, rates) })),
    extensions: m.extensions.map((e) => ({ fromDueDate: ymdOf(e.fromDueDate)!, toDueDate: ymdOf(e.toDueDate)!, reason: e.reason ?? undefined, createdAt: e.createdAt.toISOString() })),
    closedAt: iso(m.closedAt),
    createdAt: m.createdAt.toISOString(),
  };
}
export type MemoView = ReturnType<typeof toMemo>;

@Injectable()
export class ViewsService {
  constructor(
    private readonly prisma: PrismaService,
    readonly rates: RatesService,
  ) {}

  async userNames(ids: (string | null | undefined)[], tx?: Tx) {
    const uniq = [...new Set(ids.filter(Boolean) as string[])];
    if (!uniq.length) return new Map<string, string>();
    const users = await (tx ?? this.prisma.db).user.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  async pieces(tenantId: string, where: Prisma.SamplePieceWhereInput, tx?: Tx, rates?: RateMap) {
    const db = tx ?? this.prisma.db;
    const [rows, r] = await Promise.all([
      db.samplePiece.findMany({ where: { ...where, tenantId }, include: pieceInclude, orderBy: { tagCode: 'asc' } }),
      rates ? Promise.resolve(rates) : this.rates.current(tenantId, tx),
    ]);
    return rows.map((p) => toPiece(p, r));
  }

  async orders(tenantId: string, where: Prisma.OrderWhereInput, opts: { take?: number; tx?: Tx } = {}) {
    const db = opts.tx ?? this.prisma.db;
    const rows = await db.order.findMany({ where: { ...where, tenantId }, include: orderInclude, orderBy: { createdAt: 'desc' }, take: opts.take });
    const names = await this.userNames(rows.map((o) => o.decidedById), opts.tx);
    return rows.map((o) => toOrder(o, names));
  }

  async order(tenantId: string, id: string, tx?: Tx) {
    return (await this.orders(tenantId, { id }, { tx }))[0];
  }

  async memos(tenantId: string, where: Prisma.MemoWhereInput, opts: { take?: number; tx?: Tx; orderBy?: Prisma.MemoOrderByWithRelationInput } = {}) {
    const db = opts.tx ?? this.prisma.db;
    const [rows, rates] = await Promise.all([
      db.memo.findMany({ where: { ...where, tenantId }, include: memoInclude, orderBy: opts.orderBy ?? { createdAt: 'desc' }, take: opts.take }),
      this.rates.current(tenantId, opts.tx),
    ]);
    const today = istDate();
    return rows.map((m) => toMemo(m, rates, today));
  }

  async memo(tenantId: string, id: string, tx?: Tx) {
    return (await this.memos(tenantId, { id }, { tx }))[0];
  }

  /** VisitSummary[] with per-shop open memo exposure computed in one grouped query. */
  async visitSummaries(tenantId: string, visits: VisitRow[], tx?: Tx) {
    const db = tx ?? this.prisma.db;
    const shopIds = [...new Set(visits.map((v) => v.shopId))];
    const exposure = new Map<string, { count: number; value: number }>();
    if (shopIds.length) {
      const rows = await db.$queryRaw<{ shopId: string; count: bigint; value: bigint | null }[]>`
        SELECT m."shopId", count(DISTINCT m.id) AS count, sum(mi."valuePaise") AS value
        FROM "Memo" m JOIN "MemoItem" mi ON mi."memoId" = m.id AND mi.status = 'OUT'
        WHERE m."tenantId" = ${tenantId} AND m."shopId" = ANY(${shopIds})
        GROUP BY m."shopId"`;
      for (const r of rows) exposure.set(r.shopId, { count: Number(r.count), value: Number(r.value ?? 0) });
    }
    return visits.map((v) => toVisitSummary(v, exposure.get(v.shopId)));
  }

  async visitSummary(tenantId: string, visitId: string, tx?: Tx) {
    const v = await (tx ?? this.prisma.db).visit.findFirst({ where: { id: visitId, tenantId }, include: visitInclude });
    return v ? (await this.visitSummaries(tenantId, [v], tx))[0] : undefined;
  }
}

export function toVisitSummary(v: VisitRow, exp?: { count: number; value: number }) {
  return {
    id: v.id,
    sequence: v.sequence,
    plannedDate: ymdOf(v.plannedDate)!,
    plannedTime: v.plannedTime ?? undefined,
    status: v.status,
    shop: toShop(v.shop),
    agent: v.agent,
    checkInAt: iso(v.checkInAt),
    verification: v.verification ?? undefined,
    checkInDistanceM: v.checkInDistanceM == null ? undefined : Math.round(v.checkInDistanceM),
    checkInLat: v.checkInLat ?? undefined,
    checkInLng: v.checkInLng ?? undefined,
    checkInAccuracyM: v.checkInAccuracyM ?? undefined,
    startedAt: iso(v.startedAt),
    completedAt: iso(v.completedAt),
    summary: v.summary ?? undefined,
    activeMemoCount: exp?.count ?? 0,
    activeMemoValuePaise: exp?.value ?? 0,
    proofCount: v._count.proofs,
    orderCount: v._count.orders,
  };
}
export type VisitSummaryView = ReturnType<typeof toVisitSummary>;
