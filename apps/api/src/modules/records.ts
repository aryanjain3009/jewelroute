/* v2 — Attio-style record pages and enriched lists (docs/CONTRACT.md § "v2 — Attio-style IA").
 * Every builder takes a batch of rows and resolves relations with a constant number of grouped
 * queries (no per-row lookups), so lists of hundreds of rows stay O(1) round-trips.
 */
import { Controller, Get, Injectable, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { addDays, istDate } from '@jewelroute/shared';
import { z } from 'zod';
import type { CustodianType, MemoStatus, OrderStatus, Prisma, VisitStatus } from '../../generated/prisma';
import { PrismaService } from '../prisma.service';
import { Requires } from '../common/auth';
import { Ctx, ReqCtx } from '../common/context';
import { badRequest, notFound } from '../common/errors';
import { parse, ymd } from '../common/http';
import { ActivityFilter, ActivityService } from '../core/activity';
import { auditSummary, resolveAuditRefs } from '../core/audit-summary';
import { CreditService } from '../core/credit';
import { RateMap, RatesService, valueOrZero } from '../core/rates';
import { dateOf, pieceInclude, toDesign, toPiece, toShop, ViewsService, visitInclude, VisitRow, VisitSummaryView } from '../core/views';
import { CatalogQuery, VisitsService } from './visits';

// ---------------------------------------------------------------- shapes
export type Ref = { id: string; name: string };
export type ProofState = 'VERIFIED' | 'LOW_ACCURACY' | 'SIMULATED' | 'MISSING' | 'NOT_STARTED';
export type PieceStatus = 'IN_VAULT' | 'WITH_AGENT' | 'ON_MEMO' | 'OVERDUE' | 'SOLD' | 'LOST';
export type ShopStatus = 'ACTIVE' | 'MEMO_OVERDUE' | 'DORMANT' | 'NEW';
export type AttentionKind = 'MEMO_OVERDUE' | 'MEMO_DUE_TODAY' | 'VISIT_MISSED' | 'PROOF_MISSING' | 'PROOF_SIMULATED' | 'ORDER_PENDING' | 'WEBHOOK_FAILING' | 'ACK_SELF_SUSPECTED';
export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  severity: 'high' | 'medium';
  title: string;
  subtitle: string;
  amountPaise?: number;
  at: string;
  entity: { type: 'memo' | 'visit' | 'order' | 'webhook' | 'shop'; id: string };
}

const OPEN_VISIT: VisitStatus[] = ['CHECKED_IN', 'ACTIVE'];
const OPEN_MEMO: MemoStatus[] = ['ACTIVE', 'PARTIALLY_RETURNED'];
const PIECE_STATUSES = ['IN_VAULT', 'WITH_AGENT', 'ON_MEMO', 'OVERDUE', 'SOLD', 'LOST'] as const;
const SHOP_STATUSES = ['ACTIVE', 'MEMO_OVERDUE', 'DORMANT', 'NEW'] as const;
const PROOF_STATES = ['VERIFIED', 'LOW_ACCURACY', 'SIMULATED', 'MISSING', 'NOT_STARTED'] as const;
const VISIT_STATUSES = ['PLANNED', 'CHECKED_IN', 'ACTIVE', 'COMPLETED', 'MISSED', 'CANCELLED'] as const;
const DAY_MS = 86_400_000;
const CUSTODIAN_LABEL: Record<CustodianType, string> = { VAULT: 'Vault', AGENT: 'Agent', SHOP: 'Shop', SOLD: 'Sold', LOST: 'Lost' };

export type PieceLocation = {
  kind: 'IN_VISIT' | 'LAST_CHECK_IN' | 'FIELD_BAG';
  label: string;
  shop?: Ref;
  visitId?: string;
  lat?: number;
  lng?: number;
  verification?: string;
  at?: string;
};

const num = (v: bigint | number | null | undefined) => (v == null ? 0 : Number(v));
/** "21 Oct, 11:42 am" in IST. */
const istWhen = (d: Date) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${p.day} ${p.month}, ${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()}`;
};
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : undefined);
const ymdOf = (d: Date) => d.toISOString().slice(0, 10);
/** Start of an IST business day as a UTC instant. */
const istStart = (day: string) => new Date(`${day}T00:00:00+05:30`);
const csv = <T extends string>(v: string | undefined, allowed: readonly T[], field: string): T[] | undefined => {
  if (!v) return undefined;
  const xs = v.split(',').map((x) => x.trim()).filter(Boolean);
  const bad = xs.filter((x) => !allowed.includes(x as T));
  if (bad.length) throw badRequest('VALIDATION_FAILED', `Invalid ${field}: ${bad.join(', ')}`, [{ path: field, message: `expected one of ${allowed.join('|')}` }]);
  return xs as T[];
};

export function proofStateOf(v: { checkInAt?: string; proofCount: number; verification?: string | null }): ProofState {
  if (!v.checkInAt) return 'NOT_STARTED';
  if (v.proofCount === 0) return 'MISSING';
  if (v.verification === 'SIMULATED') return 'SIMULATED';
  if (v.verification === 'LOW_ACCURACY') return 'LOW_ACCURACY';
  return 'VERIFIED';
}

/** Orders that are real business — everything except REJECTED and CANCELLED. */
const NOT_DEAD = { notIn: ['REJECTED', 'CANCELLED'] as OrderStatus[] };
const ORDER_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'CONFIRMED', 'APPROVED', 'REJECTED', 'CANCELLED', 'SUBMITTED'] as const;

// ---------------------------------------------------------------- query schemas
const VisitsQuery = z.object({
  date: ymd.optional(),
  from: ymd.optional(),
  to: ymd.optional(),
  agentId: z.string().max(64).optional(),
  shopId: z.string().max(64).optional(),
  status: z.string().max(200).optional(),
  proof: z.string().max(200).optional(),
});
const OrdersQuery = z.object({ status: z.string().max(100).optional(), from: ymd.optional(), to: ymd.optional(), agentId: z.string().max(64).optional(), shopId: z.string().max(64).optional() });
const MemosQuery = z.object({ filter: z.enum(['active', 'due_today', 'overdue', 'returned', 'all']).default('active'), shopId: z.string().max(64).optional(), agentId: z.string().max(64).optional() });
const PiecesQuery = z.object({
  q: z.string().max(100).optional(),
  status: z.string().max(200).optional(),
  custodianType: z.enum(['VAULT', 'AGENT', 'SHOP', 'SOLD', 'LOST']).optional(),
  agentId: z.string().max(64).optional(),
  shopId: z.string().max(64).optional(),
  designId: z.string().max(64).optional(),
});
const ShopsQuery = z.object({ q: z.string().max(100).optional(), agentId: z.string().max(64).optional(), status: z.string().max(200).optional() });
const SearchQuery = z.object({ q: z.string().trim().max(100).default('') });
const FieldVisitsQuery = z.object({ scope: z.enum(['recent', 'upcoming']).default('recent') });

@Injectable()
export class RecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly views: ViewsService,
    private readonly rates: RatesService,
    private readonly visits: VisitsService,
    private readonly activityFeed: ActivityService,
    private readonly credit: CreditService,
  ) {}

  private get db() {
    return this.prisma.db;
  }

  // ============================================================ builders
  async adminVisitRows(tid: string, rows: VisitRow[]) {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [summaries, orders, memos, returns] = await Promise.all([
      this.views.visitSummaries(tid, rows),
      this.db.order.groupBy({ by: ['visitId'], where: { tenantId: tid, visitId: { in: ids }, status: NOT_DEAD }, _count: { _all: true }, _sum: { totalPaise: true } }),
      this.db.memo.groupBy({ by: ['visitId'], where: { tenantId: tid, visitId: { in: ids } }, _count: { _all: true }, _sum: { totalValuePaise: true } }),
      this.db.custodyEvent.groupBy({ by: ['visitId'], where: { tenantId: tid, visitId: { in: ids }, reason: 'MEMO_RETURN' }, _count: { _all: true } }),
    ]);
    const om = new Map(orders.map((o) => [o.visitId, o]));
    const mm = new Map(memos.map((m) => [m.visitId, m]));
    const rm = new Map(returns.map((r) => [r.visitId, r._count._all]));
    const now = Date.now();
    return summaries.map((s) => this.toAdminVisitRow(s, now, om.get(s.id), mm.get(s.id), rm.get(s.id)));
  }

  private toAdminVisitRow(
    s: VisitSummaryView,
    now: number,
    o?: { _count: { _all: number }; _sum: { totalPaise: bigint | null } },
    m?: { _count: { _all: number }; _sum: { totalValuePaise: bigint | null } },
    returned?: number,
  ) {
    const start = s.checkInAt ? Date.parse(s.checkInAt) : undefined;
    const end = s.completedAt ? Date.parse(s.completedAt) : OPEN_VISIT.includes(s.status as VisitStatus) ? now : undefined;
    return {
      ...s,
      agent: s.agent,
      durationMin: start != null && end != null ? Math.max(0, Math.round((end - start) / 60_000)) : undefined,
      proofState: proofStateOf(s),
      outcome: {
        orderCount: o?._count._all ?? 0,
        orderValuePaise: num(o?._sum.totalPaise),
        memoCount: m?._count._all ?? 0,
        memoValuePaise: num(m?._sum.totalValuePaise),
        returnedCount: returned ?? 0,
      },
    };
  }
  async adminVisitRow(tid: string, visitId: string) {
    const v = await this.db.visit.findFirst({ where: { id: visitId, tenantId: tid }, include: visitInclude });
    return v ? (await this.adminVisitRows(tid, [v]))[0] : undefined;
  }

  async pieceRows(tid: string, where: Prisma.SamplePieceWhereInput, rates?: RateMap, take = 1000) {
    const [rows, r] = await Promise.all([
      this.db.samplePiece.findMany({
        where: { ...where, tenantId: tid },
        include: { ...pieceInclude, memoItems: { where: { status: 'OUT' }, select: { memo: { select: { id: true, number: true, dueDate: true } } }, take: 1 } },
        orderBy: { tagCode: 'asc' },
        take,
      }),
      rates ? Promise.resolve(rates) : this.rates.current(tid),
    ]);
    if (!rows.length) return [];
    const agentIds = [...new Set(rows.filter((p) => p.custodianType === 'AGENT' && p.custodianAgentId).map((p) => p.custodianAgentId!))];
    const [last, where_] = await Promise.all([
      this.db.custodyEvent.groupBy({ by: ['pieceId'], where: { tenantId: tid, pieceId: { in: rows.map((p) => p.id) } }, _max: { occurredAt: true } }),
      this.agentWhereabouts(tid, agentIds),
    ]);
    const lm = new Map(last.map((l) => [l.pieceId, l._max.occurredAt]));
    const today = istDate();
    return rows.map((p) => {
      const memo = p.memoItems[0]?.memo;
      const due = memo ? ymdOf(memo.dueDate) : undefined;
      const status: PieceStatus =
        p.custodianType === 'VAULT' ? 'IN_VAULT' : p.custodianType === 'AGENT' ? 'WITH_AGENT' : p.custodianType === 'SHOP' ? (due && due < today ? 'OVERDUE' : 'ON_MEMO') : p.custodianType;
      return {
        ...toPiece(p, r),
        collection: p.design.collection,
        status,
        memo: memo ? { id: memo.id, number: memo.number, dueDate: due! } : undefined,
        location: p.custodianType === 'AGENT' && p.custodianAgentId ? where_.get(p.custodianAgentId) : undefined,
        lastMovedAt: (lm.get(p.id) ?? p.updatedAt).toISOString(),
      };
    });
  }
  /**
   * Where an agent (and so every piece in their bag) is right now, resolved in two grouped queries:
   * the open visit (any date) if checked in, else the latest check-in, else just "in the field bag".
   */
  async agentWhereabouts(tid: string, agentIds: string[]): Promise<Map<string, PieceLocation>> {
    const out = new Map<string, PieceLocation>();
    if (!agentIds.length) return out;
    const [open, last, agents] = await Promise.all([
      this.db.visit.findMany({
        where: { tenantId: tid, agentId: { in: agentIds }, status: { in: OPEN_VISIT } },
        select: { id: true, agentId: true, checkInAt: true, checkInLat: true, checkInLng: true, verification: true, shop: { select: { id: true, name: true } } },
        orderBy: { checkInAt: 'desc' },
      }),
      this.db.$queryRaw<{ agentId: string; visitId: string; checkInAt: Date; shopId: string; shopName: string }[]>`
        SELECT DISTINCT ON (v."agentId") v."agentId", v.id AS "visitId", v."checkInAt", s.id AS "shopId", s.name AS "shopName"
        FROM "Visit" v JOIN "Shop" s ON s.id = v."shopId"
        WHERE v."tenantId" = ${tid} AND v."agentId" = ANY(${agentIds}) AND v."checkInAt" IS NOT NULL
        ORDER BY v."agentId", v."checkInAt" DESC`,
      this.db.user.findMany({ where: { tenantId: tid, id: { in: agentIds } }, select: { id: true, name: true } }),
    ]);
    const names = new Map(agents.map((a) => [a.id, a.name]));
    const L = new Map(last.map((l) => [l.agentId, l]));
    for (const id of agentIds) {
      const v = open.find((x) => x.agentId === id);
      if (v) {
        out.set(id, {
          kind: 'IN_VISIT',
          label: `At ${v.shop.name} · in visit`,
          shop: v.shop,
          visitId: v.id,
          lat: v.checkInLat ?? undefined,
          lng: v.checkInLng ?? undefined,
          verification: v.verification ?? undefined,
          at: iso(v.checkInAt),
        });
        continue;
      }
      const l = L.get(id);
      const who = names.get(id) ?? 'agent';
      out.set(
        id,
        l
          ? { kind: 'LAST_CHECK_IN', label: `With ${who} · last check-in ${l.shopName} ${istWhen(l.checkInAt)}`, shop: { id: l.shopId, name: l.shopName }, visitId: l.visitId, at: l.checkInAt.toISOString() }
          : { kind: 'FIELD_BAG', label: 'In field bag' },
      );
    }
    return out;
  }

  pieceStatusWhere(statuses: PieceStatus[]): Prisma.SamplePieceWhereInput {
    const types = new Set<CustodianType>();
    for (const s of statuses) types.add(s === 'IN_VAULT' ? 'VAULT' : s === 'WITH_AGENT' ? 'AGENT' : s === 'ON_MEMO' || s === 'OVERDUE' ? 'SHOP' : s);
    return { custodianType: { in: [...types] } };
  }

  async custodyRows(tid: string, events: Prisma.CustodyEventGetPayload<object>[]) {
    if (!events.length) return [];
    const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter(Boolean) as string[])];
    const userIds = uniq(events.flatMap((e) => [e.fromAgentId, e.toAgentId, e.actorId]));
    const visitIds = uniq(events.map((e) => e.visitId));
    const conv = events.filter((e) => e.reason === 'CONVERTED_TO_SALE' && e.memoId);
    const [users, shops, memos, visits, proofs, pieces, convLines] = await Promise.all([
      this.db.user.findMany({ where: { tenantId: tid, id: { in: userIds } }, select: { id: true, name: true } }),
      this.db.shop.findMany({ where: { tenantId: tid, id: { in: uniq(events.flatMap((e) => [e.fromShopId, e.toShopId])) } }, select: { id: true, name: true } }),
      this.db.memo.findMany({ where: { tenantId: tid, id: { in: uniq(events.map((e) => e.memoId)) } }, select: { id: true, number: true, ackStatus: true, ackMethod: true, ackAt: true, selfAckSuspected: true } }),
      this.db.visit.findMany({ where: { tenantId: tid, id: { in: visitIds } }, select: { id: true, checkInLat: true, checkInLng: true, checkInDistanceM: true, verification: true, shop: { select: { name: true } } } }),
      this.db.visitProof.findMany({ where: { tenantId: tid, visitId: { in: visitIds } }, select: { id: true, visitId: true, url: true }, orderBy: [{ visitId: 'asc' }, { uploadedAt: 'asc' }, { id: 'asc' }], distinct: ['visitId'] }),
      this.db.samplePiece.findMany({ where: { tenantId: tid, id: { in: uniq(events.map((e) => e.pieceId)) } }, select: { id: true, tagCode: true, design: { select: { name: true } } } }),
      // v3: the order a memo conversion created for each sold piece (OrderItem.pieceId on an order sourced from that memo)
      conv.length
        ? this.db.orderItem.findMany({
            where: { tenantId: tid, pieceId: { in: uniq(conv.map((e) => e.pieceId)) }, order: { sourceMemoId: { in: uniq(conv.map((e) => e.memoId)) } } },
            select: { pieceId: true, order: { select: { id: true, number: true, sourceMemoId: true } } },
          })
        : Promise.resolve([]),
    ]);
    const U = new Map(users.map((u) => [u.id, u.name]));
    const S = new Map(shops.map((s) => [s.id, s.name]));
    const M = new Map(memos.map((m) => [m.id, m]));
    const CO = new Map(convLines.map((l) => [`${l.pieceId}|${l.order.sourceMemoId}`, { id: l.order.id, number: l.order.number }]));
    const V = new Map(visits.map((v) => [v.id, v]));
    const P = new Map(proofs.map((p) => [p.visitId, p]));
    const PC = new Map(pieces.map((p) => [p.id, p]));
    const side = (t: CustodianType | null, agentId: string | null, shopId: string | null) => {
      if (!t) return { type: 'VAULT' as CustodianType, label: 'Intake' };
      if (t === 'AGENT') return { type: t, id: agentId ?? undefined, label: (agentId && U.get(agentId)) || 'Agent' };
      if (t === 'SHOP') return { type: t, id: shopId ?? undefined, label: (shopId && S.get(shopId)) || 'Shop' };
      return { type: t, label: CUSTODIAN_LABEL[t] };
    };
    return events.map((e) => {
      const v = e.visitId ? V.get(e.visitId) : undefined;
      const proof = e.visitId ? P.get(e.visitId) : undefined;
      const pc = PC.get(e.pieceId);
      return {
        id: e.id,
        seq: e.seq,
        pieceId: e.pieceId,
        tagCode: pc?.tagCode ?? '',
        pieceName: pc?.design.name ?? '',
        from: side(e.fromType, e.fromAgentId, e.fromShopId),
        to: side(e.toType, e.toAgentId, e.toShopId),
        reason: e.reason,
        occurredAt: e.occurredAt.toISOString(),
        actor: e.actorId ? { id: e.actorId, name: U.get(e.actorId) ?? 'Unknown' } : { id: 'system', name: 'System' },
        location:
          v && v.checkInLat != null && v.checkInLng != null
            ? { lat: v.checkInLat, lng: v.checkInLng, label: v.shop.name, distanceM: v.checkInDistanceM == null ? undefined : Math.round(v.checkInDistanceM), verification: v.verification ?? undefined }
            : undefined,
        visit: v ? { id: v.id, shopName: v.shop.name } : undefined,
        proof: proof ? { id: proof.id, url: proof.url } : undefined,
        memo: e.memoId ? { id: e.memoId, number: M.get(e.memoId)?.number ?? '' } : undefined,
        // v3: "who acknowledged receiving it" — the retailer's acknowledgement of the memo hand-over.
        ack:
          e.reason === 'MEMO_HANDOVER' && e.memoId && M.get(e.memoId)
            ? (() => {
                const m = M.get(e.memoId!)!;
                return m.ackStatus === 'ACKNOWLEDGED'
                  ? {
                      status: m.ackStatus,
                      method: (m.ackMethod ?? undefined) as 'QR_CONFIRM' | 'OTP' | undefined,
                      at: iso(m.ackAt),
                      by: 'retailer' as const,
                      ...(m.selfAckSuspected ? { selfAckSuspected: true as const, note: "Acknowledged from the agent's device" } : {}),
                    }
                  : { status: m.ackStatus, by: 'retailer' as const };
              })()
            : undefined,
        order: e.reason === 'CONVERTED_TO_SALE' && e.memoId ? CO.get(`${e.pieceId}|${e.memoId}`) : undefined,
        eventId: e.outboxEventId ?? undefined,
      };
    });
  }

  /** ShopRow[] — v2 fields + v3 `credit` (CreditPosition, no prospective order), `upcomingVisit`, `lastOrder`. */
  async shopRows(tid: string, shops: Prisma.ShopGetPayload<{ include: { assignedAgent: { select: { id: true; name: true } } } }>[], rates?: RateMap) {
    if (!shops.length) return [];
    const ids = shops.map((s) => s.id);
    const today = istDate();
    const since30 = new Date(Date.now() - 30 * DAY_MS);
    const [r, exposure, lastVisits, openOrders, here, next, lastOrders] = await Promise.all([
      rates ? Promise.resolve(rates) : this.rates.current(tid),
      this.db.$queryRaw<{ shopId: string; count: bigint; value: bigint | null; overdue: boolean }[]>`
        SELECT m."shopId", count(DISTINCT m.id) AS count, sum(mi."valuePaise") AS value, bool_or(m."dueDate" < ${today}::date) AS overdue
        FROM "Memo" m JOIN "MemoItem" mi ON mi."memoId" = m.id AND mi.status = 'OUT'
        WHERE m."tenantId" = ${tid} AND m."shopId" = ANY(${ids}) GROUP BY m."shopId"`,
      this.db.$queryRaw<{ shopId: string; completedAt: Date; agentId: string; agentName: string }[]>`
        SELECT DISTINCT ON (v."shopId") v."shopId", v."completedAt", v."agentId", u.name AS "agentName"
        FROM "Visit" v JOIN "User" u ON u.id = v."agentId"
        WHERE v."tenantId" = ${tid} AND v.status = 'COMPLETED' AND v."completedAt" IS NOT NULL AND v."shopId" = ANY(${ids})
        ORDER BY v."shopId", v."completedAt" DESC`,
      this.db.order.groupBy({ by: ['shopId'], where: { tenantId: tid, shopId: { in: ids }, status: { in: ['PENDING_APPROVAL', 'CONFIRMED', 'APPROVED'] }, createdAt: { gte: since30 } }, _sum: { totalPaise: true } }),
      this.db.samplePiece.findMany({ where: { tenantId: tid, custodianType: 'SHOP', custodianShopId: { in: ids } }, select: { custodianShopId: true, netWeightMg: true, design: true } }),
      this.db.$queryRaw<{ id: string; shopId: string; plannedDate: Date; plannedTime: string | null; agentId: string; agentName: string }[]>`
        SELECT DISTINCT ON (v."shopId") v.id, v."shopId", v."plannedDate", v."plannedTime", v."agentId", u.name AS "agentName"
        FROM "Visit" v JOIN "User" u ON u.id = v."agentId"
        WHERE v."tenantId" = ${tid} AND v.status = 'PLANNED' AND v."plannedDate" >= ${today}::date AND v."shopId" = ANY(${ids})
        ORDER BY v."shopId", v."plannedDate", v."plannedTime" NULLS LAST, v.sequence`,
      this.db.$queryRaw<{ id: string; shopId: string; number: string; status: OrderStatus; totalPaise: bigint; createdAt: Date; settledAt: Date | null }[]>`
        SELECT DISTINCT ON (o."shopId") o.id, o."shopId", o.number, o.status, o."totalPaise", o."createdAt", o."settledAt"
        FROM "Order" o WHERE o."tenantId" = ${tid} AND o."shopId" = ANY(${ids})
        ORDER BY o."shopId", o."createdAt" DESC, o.id DESC`,
    ]);
    const E = new Map(exposure.map((e) => [e.shopId, e]));
    const L = new Map(lastVisits.map((l) => [l.shopId, l]));
    const O = new Map(openOrders.map((o) => [o.shopId, num(o._sum.totalPaise)]));
    const N = new Map(next.map((n) => [n.shopId, n]));
    const LO = new Map(lastOrders.map((o) => [o.shopId, o]));
    const C = await this.credit.positions(tid, shops, new Map(exposure.map((e) => [e.shopId, num(e.value)])));
    const H = new Map<string, { count: number; value: number }>();
    for (const p of here) {
      const h = H.get(p.custodianShopId!) ?? { count: 0, value: 0 };
      h.count++;
      h.value += valueOrZero(p.design, r, p.netWeightMg);
      H.set(p.custodianShopId!, h);
    }
    const now = Date.now();
    return shops.map((s) => {
      const e = E.get(s.id);
      const l = L.get(s.id);
      const n = N.get(s.id);
      const h = H.get(s.id);
      const lo = LO.get(s.id);
      const nextVisit = n ? { id: n.id, date: ymdOf(n.plannedDate), plannedTime: n.plannedTime ?? undefined, agent: { id: n.agentId, name: n.agentName } } : undefined;
      const engaged = (l && now - l.completedAt.getTime() <= 30 * DAY_MS) || Number(e?.count ?? 0) > 0 || (O.get(s.id) ?? 0) > 0;
      const status: ShopStatus = e?.overdue ? 'MEMO_OVERDUE' : engaged ? 'ACTIVE' : !l && now - s.createdAt.getTime() <= 30 * DAY_MS ? 'NEW' : 'DORMANT';
      return {
        ...toShop(s),
        assignedAgent: s.assignedAgent ?? undefined,
        lastVisitAt: l ? l.completedAt.toISOString() : undefined,
        lastVisitAgent: l ? { id: l.agentId, name: l.agentName } : undefined,
        openOrdersPaise: O.get(s.id) ?? 0,
        activeMemoCount: Number(e?.count ?? 0),
        activeMemoValuePaise: num(e?.value),
        samplesHereCount: h?.count ?? 0,
        samplesHereValuePaise: h?.value ?? 0,
        piecesHere: h?.count ?? 0, // v1 alias
        nextVisit,
        upcomingVisit: nextVisit, // v3 name; same object as nextVisit
        lastOrder: lo ? { id: lo.id, number: lo.number, status: lo.status, totalPaise: num(lo.totalPaise), createdAt: lo.createdAt.toISOString(), settledAt: iso(lo.settledAt) } : undefined,
        credit: C.get(s.id)!,
        status,
      };
    });
  }

  async auditRows(tid: string, where: Prisma.AuditLogWhereInput, take = 100, order: 'asc' | 'desc' = 'asc') {
    const rows = await this.db.auditLog.findMany({ where: { ...where, tenantId: tid }, orderBy: { createdAt: order }, take });
    const refs = await resolveAuditRefs(this.db, tid, rows);
    return rows.map((r) => {
      const actor = r.actorId ? { id: r.actorId, name: refs[r.actorId]?.name ?? 'Unknown' } : { id: 'retailer', name: 'Retailer (public link)' };
      return {
        id: r.id,
        action: r.action,
        actor,
        actorName: actor.name, // v1 field
        summary: auditSummary(r, refs),
        entityType: r.entityType,
        entityId: r.entityId,
        entity: refs[r.entityId] ? { type: refs[r.entityId].type, id: r.entityId, name: refs[r.entityId].name } : undefined,
        before: r.before,
        after: r.after,
        refs,
        requestId: r.requestId ?? undefined,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  /** Every record's `activity` — the one projection, filtered by an indexed ref. */
  activity(tid: string, f: ActivityFilter, take = 40) {
    return this.activityFeed.list(tid, f, take);
  }

  /** v1 Memo + `pieceCount` + `issuedAt`. */
  async memoRows(tid: string, where: Prisma.MemoWhereInput, opts: { orderBy?: Prisma.MemoOrderByWithRelationInput; take?: number } = {}) {
    const memos = await this.views.memos(tid, where, { orderBy: opts.orderBy, take: opts.take ?? 300 });
    return memos.map((m) => ({ ...m, pieceCount: m.items.length, issuedAt: m.createdAt }));
  }

  // ============================================================ attention
  async attention(tid: string, day = istDate()): Promise<AttentionItem[]> {
    const today = istDate();
    const nowIstHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(new Date()));
    const since24h = new Date(Date.now() - DAY_MS);
    const [memos, missed, noProof, simulated, pending, failing, selfAcks] = await Promise.all([
      this.views.memos(tid, { status: { in: OPEN_MEMO }, dueDate: { lte: dateOf(day) } }, { orderBy: { dueDate: 'asc' }, take: 100 }),
      this.db.visit.findMany({
        where: {
          tenantId: tid,
          OR: [
            { status: 'MISSED', plannedDate: { gte: dateOf(addDays(day, -7)), lte: dateOf(day) } },
            { status: 'PLANNED', plannedDate: { gte: dateOf(addDays(day, -7)), lt: dateOf(day <= today ? (day === today && nowIstHour >= 18 ? addDays(day, 1) : day) : day) } },
          ],
        },
        include: { shop: { select: { id: true, name: true } }, agent: { select: { id: true, name: true } } },
        orderBy: { plannedDate: 'desc' },
        take: 50,
      }),
      this.db.visit.findMany({
        where: { tenantId: tid, proofs: { none: {} }, OR: [{ status: 'COMPLETED', plannedDate: { gte: dateOf(addDays(day, -7)), lte: dateOf(day) } }, { status: { in: OPEN_VISIT }, checkInAt: { lt: new Date(Date.now() - 20 * 60_000) } }] },
        include: { shop: { select: { id: true, name: true } }, agent: { select: { id: true, name: true } } },
        take: 50,
      }),
      this.db.visit.findMany({ where: { tenantId: tid, verification: 'SIMULATED', plannedDate: dateOf(day) }, include: { shop: { select: { id: true, name: true } }, agent: { select: { id: true, name: true } } }, take: 50 }),
      this.db.order.findMany({ where: { tenantId: tid, status: 'PENDING_APPROVAL' }, include: { shop: { select: { name: true } }, agent: { select: { name: true } } }, orderBy: { createdAt: 'asc' }, take: 50 }),
      this.db.webhookDelivery.groupBy({ by: ['endpointId'], where: { tenantId: tid, status: { in: ['FAILED', 'DEAD'] }, createdAt: { gte: since24h } }, _count: { _all: true }, _max: { createdAt: true } }),
      // Audit B8: open memos acknowledged from the agent's own session/device in the last 7 days.
      this.db.memo.findMany({
        where: { tenantId: tid, selfAckSuspected: true, status: { in: OPEN_MEMO }, ackAt: { gte: new Date(Date.now() - 7 * DAY_MS) } },
        include: { shop: { select: { name: true } }, agent: { select: { name: true } } },
        orderBy: { ackAt: 'desc' },
        take: 50,
      }),
    ]);
    const items: AttentionItem[] = [];
    for (const m of memos) {
      const overdue = m.dueDate < day;
      if (!overdue && m.dueDate !== day) continue;
      items.push({
        id: `${overdue ? 'memo_overdue' : 'memo_due'}:${m.id}`,
        kind: overdue ? 'MEMO_OVERDUE' : 'MEMO_DUE_TODAY',
        severity: overdue ? 'high' : 'medium',
        title: overdue ? `${m.number} overdue at ${m.shop.name}` : `${m.number} due today at ${m.shop.name}`,
        subtitle: `${m.outstandingCount} piece${m.outstandingCount === 1 ? '' : 's'} out · ${m.agent.name} · due ${m.dueDate}${overdue ? ` (${-m.daysToDue}d late)` : ''}`,
        amountPaise: m.outstandingValuePaise,
        at: istStart(m.dueDate).toISOString(),
        entity: { type: 'memo', id: m.id },
      });
    }
    for (const v of missed) {
      // Worded from the stored status, so Home never says "missed" for a visit every other screen shows
      // as planned (a PLANNED visit after 18:00 IST can still be checked in today). Timed at the planned
      // slot (IST) when there is one, else the start of the planned day.
      const ymd = ymdOf(v.plannedDate);
      const isMissed = v.status === 'MISSED';
      items.push({
        id: `visit_missed:${v.id}`,
        kind: 'VISIT_MISSED',
        severity: 'medium',
        title: isMissed ? `${v.agent.name} missed ${v.shop.name}` : `${v.agent.name} has not checked in at ${v.shop.name}`,
        subtitle: `Planned ${ymd}${v.plannedTime ? ` ${v.plannedTime}` : ''} · ${isMissed ? 'marked missed' : 'still planned, not checked in'}`,
        at: (v.plannedTime ? new Date(`${ymd}T${v.plannedTime}:00+05:30`) : istStart(ymd)).toISOString(),
        entity: { type: 'visit', id: v.id },
      });
    }
    for (const v of noProof) {
      items.push({
        id: `proof_missing:${v.id}`,
        kind: 'PROOF_MISSING',
        severity: 'high',
        title: `No visit photo at ${v.shop.name}`,
        subtitle: `${v.agent.name} · ${v.status === 'COMPLETED' ? 'completed without proof' : `checked in ${Math.round((Date.now() - (v.checkInAt?.getTime() ?? Date.now())) / 60_000)} min ago`}`,
        at: (v.checkInAt ?? v.updatedAt).toISOString(),
        entity: { type: 'visit', id: v.id },
      });
    }
    for (const v of simulated) {
      items.push({
        id: `proof_simulated:${v.id}`,
        kind: 'PROOF_SIMULATED',
        severity: 'medium',
        title: `Simulated GPS check-in at ${v.shop.name}`,
        subtitle: `${v.agent.name} · location not verified`,
        at: (v.checkInAt ?? v.updatedAt).toISOString(),
        entity: { type: 'visit', id: v.id },
      });
    }
    for (const o of pending) {
      items.push({
        id: `order_pending:${o.id}`,
        kind: 'ORDER_PENDING',
        severity: 'medium',
        title: `${o.number} awaiting approval`,
        subtitle: `${o.shop.name} · ${o.agent.name}${o.approvalReasons.length ? ` · ${o.approvalReasons.map((x) => (x === 'CREDIT_LIMIT' ? 'over credit limit' : x === 'ORDER_THRESHOLD' ? 'above approval threshold' : x)).join(', ')}` : ''}`,
        amountPaise: num(o.totalPaise),
        at: o.createdAt.toISOString(),
        entity: { type: 'order', id: o.id },
      });
    }
    for (const m of selfAcks) {
      items.push({
        id: `ack_self_suspected:${m.id}`,
        kind: 'ACK_SELF_SUSPECTED',
        severity: 'medium',
        title: `${m.number} acknowledged from the agent's device`,
        subtitle: `${m.shop.name} · ${m.agent.name} · confirm receipt with the retailer`,
        amountPaise: num(m.totalValuePaise),
        at: (m.ackAt ?? m.createdAt).toISOString(),
        entity: { type: 'memo', id: m.id },
      });
    }
    if (failing.length) {
      const eps = await this.db.webhookEndpoint.findMany({ where: { tenantId: tid, id: { in: failing.map((f) => f.endpointId) } }, select: { id: true, url: true, active: true } });
      for (const f of failing) {
        const ep = eps.find((e) => e.id === f.endpointId);
        if (!ep?.active) continue;
        items.push({
          id: `webhook_failing:${f.endpointId}`,
          kind: 'WEBHOOK_FAILING',
          severity: 'high',
          title: 'Webhook endpoint failing',
          subtitle: `${f._count._all} failed deliver${f._count._all === 1 ? 'y' : 'ies'} in 24h · ${ep.url.replace(/^https?:\/\//, '').slice(0, 60)}`,
          at: (f._max.createdAt ?? new Date()).toISOString(),
          entity: { type: 'webhook', id: f.endpointId },
        });
      }
    }
    const rank = { high: 0, medium: 1 };
    return items.sort((a, b) => rank[a.severity] - rank[b.severity] || b.at.localeCompare(a.at)).slice(0, 100);
  }

  // ============================================================ admin endpoints
  async search(ctx: ReqCtx, q: string) {
    const tid = ctx.user.tid;
    const empty = { shops: [], pieces: [], orders: [], memos: [], agents: [], designs: [] };
    if (!q) return empty;
    const c = { contains: q, mode: 'insensitive' as const };
    const [shops, pieces, orders, memos, agents, designs] = await Promise.all([
      this.db.shop.findMany({ where: { tenantId: tid, OR: [{ name: c }, { area: c }, { code: c }, { ownerName: c }] }, select: { id: true, name: true, area: true }, orderBy: { name: 'asc' }, take: 5 }),
      this.db.samplePiece.findMany({ where: { tenantId: tid, OR: [{ tagCode: c }, { design: { name: c } }, { design: { sku: c } }] }, select: { id: true, tagCode: true, design: { select: { name: true } } }, orderBy: { tagCode: 'asc' }, take: 5 }),
      this.db.order.findMany({ where: { tenantId: tid, OR: [{ number: c }, { shop: { name: c } }] }, select: { id: true, number: true, shop: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 5 }),
      this.db.memo.findMany({ where: { tenantId: tid, OR: [{ number: c }, { shop: { name: c } }] }, select: { id: true, number: true, shop: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 5 }),
      this.db.user.findMany({ where: { tenantId: tid, role: 'FIELD_AGENT', OR: [{ name: c }, { email: c }] }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 5 }),
      this.db.jewelryDesign.findMany({ where: { tenantId: tid, OR: [{ name: c }, { sku: c }, { collection: c }] }, select: { id: true, name: true, sku: true }, orderBy: { sku: 'asc' }, take: 5 }),
    ]);
    return {
      shops,
      pieces: pieces.map((p) => ({ id: p.id, name: p.design.name, tagCode: p.tagCode })),
      orders: orders.map((o) => ({ id: o.id, name: `${o.number} · ${o.shop.name}`, number: o.number })),
      memos: memos.map((m) => ({ id: m.id, name: `${m.number} · ${m.shop.name}`, number: m.number })),
      agents,
      designs,
    };
  }

  async listShops(ctx: ReqCtx, q: z.infer<typeof ShopsQuery>) {
    const tid = ctx.user.tid;
    const statuses = csv(q.status, SHOP_STATUSES, 'status');
    const c = q.q ? { contains: q.q, mode: 'insensitive' as const } : undefined;
    const shops = await this.db.shop.findMany({
      where: { tenantId: tid, ...(q.agentId ? { assignedAgentId: q.agentId } : {}), ...(c ? { OR: [{ name: c }, { area: c }, { code: c }, { ownerName: c }, { city: c }] } : {}) },
      include: { assignedAgent: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
      take: 1000,
    });
    const rows = await this.shopRows(tid, shops);
    return statuses ? rows.filter((r) => statuses.includes(r.status)) : rows;
  }

  async shopRecord(ctx: ReqCtx, id: string) {
    const tid = ctx.user.tid;
    const shop = await this.db.shop.findFirst({ where: { id, tenantId: tid }, include: { assignedAgent: { select: { id: true, name: true } } } });
    if (!shop) throw notFound('Shop');
    const today = istDate();
    const rates = await this.rates.current(tid);
    const [[row], visitRows, orders, memos, pieces, activity] = await Promise.all([
      this.shopRows(tid, [shop], rates),
      this.db.visit.findMany({
        where: { tenantId: tid, shopId: id, status: { not: 'CANCELLED' }, plannedDate: { gte: dateOf(addDays(today, -30)) } },
        include: visitInclude,
        orderBy: [{ plannedDate: 'desc' }, { sequence: 'asc' }],
        take: 200,
      }),
      this.views.orders(tid, { shopId: id }, { take: 50 }),
      this.views.memos(tid, { shopId: id }, { take: 50 }),
      this.pieceRows(tid, { custodianType: 'SHOP', custodianShopId: id }, rates),
      this.activity(tid, { shopId: id }),
    ]);
    return { shop: row, visits: await this.adminVisitRows(tid, visitRows), orders, memos, pieces, activity };
  }

  async listVisits(ctx: ReqCtx, q: z.infer<typeof VisitsQuery>) {
    const tid = ctx.user.tid;
    const statuses = csv(q.status, VISIT_STATUSES, 'status');
    const proof = csv(q.proof, PROOF_STATES, 'proof');
    const where: Prisma.VisitWhereInput = { tenantId: tid };
    if (q.date) where.plannedDate = dateOf(q.date);
    else if (q.from || q.to) where.plannedDate = { ...(q.from ? { gte: dateOf(q.from) } : {}), ...(q.to ? { lte: dateOf(q.to) } : {}) };
    else where.plannedDate = dateOf(istDate());
    if (q.agentId) where.agentId = q.agentId;
    if (q.shopId) where.shopId = q.shopId;
    if (statuses) where.status = { in: statuses };
    const rows = await this.db.visit.findMany({ where, include: visitInclude, orderBy: [{ plannedDate: 'desc' }, { agentId: 'asc' }, { sequence: 'asc' }], take: 1000 });
    const out = await this.adminVisitRows(tid, rows);
    return proof ? out.filter((r) => proof.includes(r.proofState)) : out;
  }

  async visitRecord(ctx: ReqCtx, id: string) {
    const tid = ctx.user.tid;
    const detail = await this.visits.detail(ctx, id);
    const entityIds = [id, ...detail.orders.map((o) => o.id), ...detail.memosCreated.map((m) => m.id)];
    const [row, audit, activity, events] = await Promise.all([
      this.adminVisitRow(tid, id),
      this.auditRows(tid, { entityId: { in: entityIds } }),
      this.activity(tid, { visitId: id }, 100),
      this.db.custodyEvent.findMany({ where: { tenantId: tid, visitId: id }, orderBy: [{ occurredAt: 'asc' }, { seq: 'asc' }] }),
    ]);
    return { ...detail, row, audit, activity, custody: await this.custodyRows(tid, events) };
  }

  async agentRecord(ctx: ReqCtx, id: string) {
    const tid = ctx.user.tid;
    const a = await this.db.user.findFirst({ where: { id, tenantId: tid, role: 'FIELD_AGENT' } });
    if (!a) throw notFound('Agent');
    const today = istDate();
    const rates = await this.rates.current(tid);
    const [todayRows, bag, memos, orders, activity, lastCheckIn] = await Promise.all([
      this.db.visit.findMany({ where: { tenantId: tid, agentId: id, plannedDate: dateOf(today), status: { not: 'CANCELLED' } }, include: visitInclude, orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }] }),
      this.pieceRows(tid, { custodianType: 'AGENT', custodianAgentId: id }, rates),
      this.views.memos(tid, { agentId: id, status: { in: OPEN_MEMO } }, { orderBy: { dueDate: 'asc' } }),
      this.views.orders(tid, { agentId: id }, { take: 30 }),
      this.activity(tid, { agentId: id }),
      this.db.visit.aggregate({ where: { tenantId: tid, agentId: id, checkInAt: { not: null } }, _max: { checkInAt: true } }),
    ]);
    return {
      agent: { id: a.id, name: a.name, email: a.email, phone: a.phone ?? undefined, homeArea: a.homeArea ?? undefined, active: a.active, lastCheckInAt: iso(lastCheckIn._max.checkInAt) },
      today: await this.adminVisitRows(tid, todayRows),
      bag,
      memos,
      orders,
      activity,
    };
  }

  async listOrders(ctx: ReqCtx, q: z.infer<typeof OrdersQuery>) {
    // v3 statuses; legacy `SUBMITTED` is accepted as an alias of PENDING_APPROVAL for v2 clients.
    const raw = csv(q.status, ORDER_STATUSES, 'status');
    const statuses = raw ? ([...new Set(raw.map((x) => (x === 'SUBMITTED' ? 'PENDING_APPROVAL' : x)))] as OrderStatus[]) : undefined;
    const where: Prisma.OrderWhereInput = {};
    if (statuses) where.status = { in: statuses };
    if (q.agentId) where.agentId = q.agentId;
    if (q.shopId) where.shopId = q.shopId;
    if (q.from || q.to) where.createdAt = { ...(q.from ? { gte: istStart(q.from) } : {}), ...(q.to ? { lt: istStart(addDays(q.to, 1)) } : {}) };
    return this.views.orders(ctx.user.tid, where, { take: 500 });
  }

  async orderRecord(ctx: ReqCtx, id: string) {
    const tid = ctx.user.tid;
    const order = await this.views.order(tid, id);
    if (!order) throw notFound('Order');
    const [visit, history, activity] = await Promise.all([
      order.visitId ? this.adminVisitRow(tid, order.visitId) : undefined,
      this.auditRows(tid, { entityType: 'Order', entityId: id }),
      this.activity(tid, { orderId: id }, 100),
    ]);
    return { order, visit, history, activity };
  }

  async listMemos(ctx: ReqCtx, q: z.infer<typeof MemosQuery>) {
    const today = dateOf(istDate());
    const scope: Prisma.MemoWhereInput = { ...(q.shopId ? { shopId: q.shopId } : {}), ...(q.agentId ? { agentId: q.agentId } : {}) };
    const byFilter: Record<typeof q.filter, Prisma.MemoWhereInput> = {
      active: { status: { in: OPEN_MEMO } },
      due_today: { status: { in: OPEN_MEMO }, dueDate: today },
      overdue: { status: { in: OPEN_MEMO }, dueDate: { lt: today } },
      returned: { status: { in: ['RETURNED', 'CONVERTED_TO_ORDER'] } },
      all: {},
    };
    const orderBy: Prisma.MemoOrderByWithRelationInput = q.filter === 'all' || q.filter === 'returned' ? { createdAt: 'desc' } : { dueDate: 'asc' };
    return this.memoRows(ctx.user.tid, { ...scope, ...byFilter[q.filter] }, { orderBy });
  }

  async memoRecord(ctx: ReqCtx, id: string) {
    const tid = ctx.user.tid;
    const memo = await this.views.memo(tid, id);
    if (!memo) throw notFound('Memo');
    const pieceIds = memo.items.map((i) => i.piece.id);
    const all = await this.db.custodyEvent.findMany({ where: { tenantId: tid, pieceId: { in: pieceIds } }, orderBy: [{ pieceId: 'asc' }, { seq: 'asc' }] });
    // Per piece: from the vault issue that preceded this memo's handover, onward.
    const kept = pieceIds.flatMap((pid) => {
      const evs = all.filter((e) => e.pieceId === pid);
      const handover = evs.find((e) => e.memoId === id && e.reason === 'MEMO_HANDOVER');
      const limit = handover?.seq ?? Infinity;
      const issue = [...evs].reverse().find((e) => e.reason === 'ISSUE_TO_AGENT' && e.seq < limit);
      const from = issue?.seq ?? handover?.seq ?? 1;
      return evs.filter((e) => e.seq >= from);
    });
    kept.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.seq - b.seq || a.pieceId.localeCompare(b.pieceId));
    const [custody, visit, history, activity] = await Promise.all([
      this.custodyRows(tid, kept),
      memo.visitId ? this.adminVisitRow(tid, memo.visitId) : undefined,
      this.auditRows(tid, { entityType: 'Memo', entityId: id }),
      this.activity(tid, { memoId: id }, 100),
    ]);
    return { memo: { ...memo, pieceCount: memo.items.length, issuedAt: memo.createdAt }, custody, visit, history, activity };
  }

  async listPieces(ctx: ReqCtx, q: z.infer<typeof PiecesQuery>) {
    const statuses = csv(q.status, PIECE_STATUSES, 'status');
    const and: Prisma.SamplePieceWhereInput[] = [];
    if (statuses) and.push(this.pieceStatusWhere(statuses));
    if (q.custodianType) and.push({ custodianType: q.custodianType });
    if (q.agentId) and.push({ custodianAgentId: q.agentId });
    if (q.shopId) and.push({ custodianShopId: q.shopId });
    if (q.designId) and.push({ designId: q.designId });
    if (q.q) {
      const c = { contains: q.q, mode: 'insensitive' as const };
      and.push({ OR: [{ tagCode: c }, { design: { name: c } }, { design: { sku: c } }, { design: { collection: c } }] });
    }
    const rows = await this.pieceRows(ctx.user.tid, and.length ? { AND: and } : {});
    return statuses ? rows.filter((r) => statuses.includes(r.status)) : rows;
  }

  async pieceRecord(ctx: ReqCtx, id: string) {
    const tid = ctx.user.tid;
    const rates = await this.rates.current(tid);
    const [piece] = await this.pieceRows(tid, { id }, rates);
    if (!piece) throw notFound('Piece');
    const [design, events] = await Promise.all([
      this.db.jewelryDesign.findFirstOrThrow({ where: { id: piece.designId, tenantId: tid } }),
      this.db.custodyEvent.findMany({ where: { tenantId: tid, pieceId: id }, orderBy: { seq: 'asc' } }),
    ]);
    const [rows, activity] = await Promise.all([this.custodyRows(tid, events), this.activity(tid, { pieceId: id }, 100)]);
    return { piece, design: toDesign(design, rates), events: rows, activity };
  }

  // ============================================================ field endpoints
  async fieldVisits(ctx: ReqCtx, scope: 'recent' | 'upcoming') {
    const tid = ctx.user.tid;
    const today = istDate();
    const where: Prisma.VisitWhereInput =
      scope === 'upcoming'
        ? { plannedDate: { gt: dateOf(today), lte: dateOf(addDays(today, 7)) }, status: { not: 'CANCELLED' } }
        : { plannedDate: { gte: dateOf(addDays(today, -14)), lte: dateOf(today) }, status: { not: 'CANCELLED' } };
    const rows = await this.db.visit.findMany({
      where: { ...where, tenantId: tid, agentId: ctx.user.sub },
      include: visitInclude,
      orderBy: scope === 'upcoming' ? [{ plannedDate: 'asc' }, { sequence: 'asc' }] : [{ plannedDate: 'desc' }, { sequence: 'asc' }],
      take: 300,
    });
    return this.adminVisitRows(tid, rows);
  }

  fieldCatalog(ctx: ReqCtx, q: z.infer<typeof CatalogQuery>) {
    return this.visits.catalogFor(ctx.user.tid, ctx.user.sub, q);
  }

  async fieldProfile(ctx: ReqCtx) {
    const tid = ctx.user.tid;
    const me = ctx.user.sub;
    const today = istDate();
    const weekStart = addDays(today, -6);
    const u = await this.db.user.findFirst({ where: { id: me, tenantId: tid }, select: { id: true, name: true, email: true, phone: true, homeArea: true } });
    if (!u) throw notFound('User');
    const rates = await this.rates.current(tid);
    const [bag, activeMemos, completed, orders] = await Promise.all([
      this.pieceRows(tid, { custodianType: 'AGENT', custodianAgentId: me }, rates),
      this.views.memos(tid, { agentId: me, status: { in: OPEN_MEMO } }, { orderBy: { dueDate: 'asc' } }),
      this.db.visit.count({ where: { tenantId: tid, agentId: me, status: 'COMPLETED', plannedDate: { gte: dateOf(weekStart), lte: dateOf(today) } } }),
      this.db.order.aggregate({ where: { tenantId: tid, agentId: me, status: NOT_DEAD, createdAt: { gte: istStart(weekStart) } }, _sum: { totalPaise: true } }),
    ]);
    return {
      user: { id: u.id, name: u.name, email: u.email, phone: u.phone ?? undefined, homeArea: u.homeArea ?? undefined },
      bag,
      activeMemos,
      week: { from: weekStart, to: today, visitsCompleted: completed, ordersValuePaise: num(orders._sum.totalPaise), memosOpen: activeMemos.length },
    };
  }
}

// ---------------------------------------------------------------- controller
@ApiTags('v2 records')
@Controller('v1')
export class RecordsController {
  constructor(private readonly records: RecordsService) {}

  // ---- admin
  @Requires('admin')
  @Get('admin/search')
  search(@Ctx() ctx: ReqCtx, @Query() q: unknown) {
    return this.records.search(ctx, parse(SearchQuery, q).q);
  }

  @Requires('admin')
  @Get('admin/shops')
  shops(@Ctx() ctx: ReqCtx, @Query() q: unknown) {
    return this.records.listShops(ctx, parse(ShopsQuery, q));
  }

  @Requires('admin')
  @Get('admin/shops/:id')
  shop(@Ctx() ctx: ReqCtx, @Param('id') id: string) {
    return this.records.shopRecord(ctx, id);
  }

  @Requires('admin')
  @Get('admin/visits')
  visits(@Ctx() ctx: ReqCtx, @Query() q: unknown) {
    return this.records.listVisits(ctx, parse(VisitsQuery, q));
  }

  @Requires('admin')
  @Get('admin/visits/:id')
  visit(@Ctx() ctx: ReqCtx, @Param('id') id: string) {
    return this.records.visitRecord(ctx, id);
  }

  @Requires('admin')
  @Get('admin/agents/:id')
  agent(@Ctx() ctx: ReqCtx, @Param('id') id: string) {
    return this.records.agentRecord(ctx, id);
  }

  @Requires('admin')
  @Get('admin/orders')
  orders(@Ctx() ctx: ReqCtx, @Query() q: unknown) {
    return this.records.listOrders(ctx, parse(OrdersQuery, q));
  }

  @Requires('admin')
  @Get('admin/orders/:id')
  order(@Ctx() ctx: ReqCtx, @Param('id') id: string) {
    return this.records.orderRecord(ctx, id);
  }

  @Requires('admin')
  @Get('admin/memos')
  memos(@Ctx() ctx: ReqCtx, @Query() q: unknown) {
    return this.records.listMemos(ctx, parse(MemosQuery, q));
  }

  @Requires('admin')
  @Get('admin/memos/:id')
  memo(@Ctx() ctx: ReqCtx, @Param('id') id: string) {
    return this.records.memoRecord(ctx, id);
  }

  @Requires('admin')
  @Get('admin/pieces')
  pieces(@Ctx() ctx: ReqCtx, @Query() q: unknown) {
    return this.records.listPieces(ctx, parse(PiecesQuery, q));
  }

  @Requires('admin')
  @Get('admin/pieces/:id')
  piece(@Ctx() ctx: ReqCtx, @Param('id') id: string) {
    return this.records.pieceRecord(ctx, id);
  }

  // ---- field
  @Requires('field')
  @Get('field/visits')
  fieldVisits(@Ctx() ctx: ReqCtx, @Query() q: unknown) {
    return this.records.fieldVisits(ctx, parse(FieldVisitsQuery, q).scope);
  }

  @Requires('field')
  @Get('field/catalog')
  fieldCatalog(@Ctx() ctx: ReqCtx, @Query() q: unknown) {
    return this.records.fieldCatalog(ctx, parse(CatalogQuery, q));
  }

  @Requires('field')
  @Get('field/profile')
  fieldProfile(@Ctx() ctx: ReqCtx) {
    return this.records.fieldProfile(ctx);
  }
}

