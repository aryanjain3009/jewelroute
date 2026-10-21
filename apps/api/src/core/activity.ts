/* v3 — one activity model (docs/CONTRACT.md § v3 "One activity model"). Every business event is an
 * OutboxEvent with indexed refs (shopId, agentId, visitId, orderId, memoId, pieceIds — see
 * event-refs.ts). This is the ONLY place that turns outbox rows into ActivityItems: Home, the
 * workspace feed and every record's `activity` call it with a filter. No surface builds its own feed. */
import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma.service';
import { badRequest } from '../common/errors';
import { activityTitle } from './outbox';

export type ActivityKind = 'visit' | 'order' | 'memo' | 'custody' | 'proof' | 'ack' | 'rate' | 'webhook' | 'system';
export interface ActivityFilter {
  shopId?: string;
  agentId?: string;
  visitId?: string;
  orderId?: string;
  memoId?: string;
  pieceId?: string;
}
export interface ActivityRefs {
  shop?: { id: string; name: string };
  agent?: { id: string; name: string };
  visit?: { id: string; date: string; shopName: string };
  order?: { id: string; number: string };
  memo?: { id: string; number: string };
  pieces?: { id: string; tagCode: string }[];
}
export interface ActivityDetail {
  photoUrl?: string;
  amountPaise?: number;
  status?: string;
  reasons?: string[];
  fromLabel?: string;
  toLabel?: string;
  reason?: string;
  pieceCount?: number;
  dueDate?: string;
  verification?: string;
  distanceM?: number;
  method?: string;
}
export interface ActivityItem {
  id: string;
  type: string;
  kind: ActivityKind;
  title: string;
  amountPaise?: number;
  actor?: { id: string; name: string };
  shop?: { id: string; name: string };
  entity: { type: string; id: string };
  refs: ActivityRefs;
  detail?: ActivityDetail;
  createdAt: string;
}

type OutboxRow = Prisma.OutboxEventGetPayload<object>;
type Data = Record<string, unknown>;
const s = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const ref = (v: unknown) => {
  const o = v as { id?: unknown; name?: unknown } | undefined;
  return o && s(o.id) ? { id: o.id as string, name: s(o.name) ?? '' } : undefined;
};

export function activityKind(type: string): ActivityKind {
  if (type === 'visit.proof_uploaded') return 'proof';
  if (type.startsWith('visit.')) return 'visit';
  if (type === 'memo.acknowledged') return 'ack';
  if (type.startsWith('order.')) return 'order';
  if (type.startsWith('memo.')) return 'memo';
  if (type === 'sample.custody_changed') return 'custody';
  if (type.startsWith('gold_rate.')) return 'rate';
  if (type === 'ping' || type.startsWith('webhook.')) return 'webhook';
  return 'system';
}

function detailOf(kind: ActivityKind, d: Data): ActivityDetail | undefined {
  const approval = d.approval as { reasons?: unknown } | undefined;
  const reasons = Array.isArray(d.reasons) ? d.reasons : Array.isArray(approval?.reasons) ? approval!.reasons : undefined;
  const det: ActivityDetail = {
    photoUrl: kind === 'proof' ? s(d.url) : undefined,
    amountPaise: n(d.totalPaise) ?? n(d.totalValuePaise) ?? n(d.ordersValuePaise),
    status: s(d.status),
    reasons: reasons?.length ? (reasons as string[]) : undefined,
    fromLabel: s(d.fromLabel),
    toLabel: s(d.toLabel),
    reason: s(d.reason) ?? s(d.rejectionReason) ?? s(d.cancellationReason),
    pieceCount: n(d.pieceCount),
    dueDate: s(d.dueDate),
    verification: s(d.verification),
    distanceM: n(d.distanceM),
    method: s(d.method),
  };
  const out = Object.fromEntries(Object.entries(det).filter(([, v]) => v !== undefined)) as ActivityDetail;
  return Object.keys(out).length ? out : undefined;
}

const encodeCursor = (at: Date, id: string) => Buffer.from(`${at.toISOString()}|${id}`, 'utf8').toString('base64url');
function decodeCursor(c: string) {
  const [ts, id] = Buffer.from(c, 'base64url').toString('utf8').split('|');
  const at = new Date(ts ?? '');
  if (!id || !/^evt_/.test(id) || Number.isNaN(at.getTime())) throw badRequest('VALIDATION_FAILED', 'Invalid cursor', [{ path: 'before', message: 'use nextCursor from the previous page' }]);
  return { at, id };
}

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  where(tid: string, f: ActivityFilter = {}): Prisma.OutboxEventWhereInput {
    return {
      tenantId: tid,
      type: { not: 'ping' },
      ...(f.shopId ? { shopId: f.shopId } : {}),
      ...(f.agentId ? { agentId: f.agentId } : {}),
      ...(f.visitId ? { visitId: f.visitId } : {}),
      ...(f.orderId ? { orderId: f.orderId } : {}),
      ...(f.memoId ? { memoId: f.memoId } : {}),
      ...(f.pieceId ? { pieceIds: { has: f.pieceId } } : {}),
    };
  }

  /** Newest first, keyset on (createdAt, id). `nextCursor` is absent on the last page. */
  async page(tid: string, f: ActivityFilter, opts: { limit?: number; before?: string } = {}) {
    const limit = opts.limit ?? 40;
    const where = this.where(tid, f);
    if (opts.before) {
      const c = decodeCursor(opts.before);
      where.OR = [{ createdAt: { lt: c.at } }, { createdAt: c.at, id: { lt: c.id } }];
    }
    const rows = await this.prisma.db.outboxEvent.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1 });
    const more = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return { items: await this.project(tid, page), nextCursor: more && last ? encodeCursor(last.createdAt, last.id) : undefined };
  }

  async list(tid: string, f: ActivityFilter = {}, limit = 40) {
    return (await this.page(tid, f, { limit })).items;
  }

  /** Rows → ActivityItem[], resolving every ref's label in one grouped query per record type. */
  async project(tid: string, rows: OutboxRow[]): Promise<ActivityItem[]> {
    if (!rows.length) return [];
    const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter(Boolean) as string[])];
    const db = this.prisma.db;
    const [shops, users, visits, orders, memos, pieces] = await Promise.all([
      db.shop.findMany({ where: { tenantId: tid, id: { in: uniq(rows.map((r) => r.shopId)) } }, select: { id: true, name: true } }),
      db.user.findMany({ where: { tenantId: tid, id: { in: uniq(rows.map((r) => r.agentId)) } }, select: { id: true, name: true } }),
      db.visit.findMany({ where: { tenantId: tid, id: { in: uniq(rows.map((r) => r.visitId)) } }, select: { id: true, plannedDate: true, shop: { select: { name: true } } } }),
      db.order.findMany({ where: { tenantId: tid, id: { in: uniq(rows.map((r) => r.orderId)) } }, select: { id: true, number: true } }),
      db.memo.findMany({ where: { tenantId: tid, id: { in: uniq(rows.map((r) => r.memoId)) } }, select: { id: true, number: true } }),
      db.samplePiece.findMany({ where: { tenantId: tid, id: { in: uniq(rows.flatMap((r) => r.pieceIds)) } }, select: { id: true, tagCode: true } }),
    ]);
    const S = new Map(shops.map((x) => [x.id, x]));
    const U = new Map(users.map((x) => [x.id, x]));
    const V = new Map(visits.map((x) => [x.id, { id: x.id, date: x.plannedDate.toISOString().slice(0, 10), shopName: x.shop.name }]));
    const O = new Map(orders.map((x) => [x.id, x]));
    const M = new Map(memos.map((x) => [x.id, x]));
    const P = new Map(pieces.map((x) => [x.id, x]));
    return rows.map((e) => {
      const data = ((e.payload as { data?: Data })?.data ?? {}) as Data;
      const t = activityTitle(e.type, data as never);
      const kind = activityKind(e.type);
      const refs: ActivityRefs = {};
      if (e.shopId) refs.shop = S.get(e.shopId) ?? ref(data.shop) ?? { id: e.shopId, name: '' };
      if (e.agentId) refs.agent = U.get(e.agentId) ?? ref(data.agent) ?? { id: e.agentId, name: '' };
      if (e.visitId) refs.visit = V.get(e.visitId) ?? { id: e.visitId, date: '', shopName: refs.shop?.name ?? '' };
      if (e.orderId) refs.order = O.get(e.orderId) ?? { id: e.orderId, number: s(data.orderNumber) ?? s(data.number) ?? '' };
      if (e.memoId) refs.memo = M.get(e.memoId) ?? { id: e.memoId, number: s(data.memoNumber) ?? s(data.number) ?? '' };
      if (e.pieceIds.length) refs.pieces = e.pieceIds.map((id) => P.get(id) ?? { id, tagCode: '' });
      return {
        id: e.id,
        type: e.type,
        kind,
        title: t.title,
        amountPaise: t.amountPaise,
        actor: ref(data.actor) ?? ref(data.agent),
        shop: refs.shop,
        entity: { type: e.aggregateType, id: e.aggregateId },
        refs,
        detail: detailOf(kind, data),
        createdAt: e.createdAt.toISOString(),
      };
    });
  }
}
