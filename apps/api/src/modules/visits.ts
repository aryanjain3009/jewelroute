import { Body, Controller, Get, HttpCode, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { distanceM, geofenceDecision, istDate } from '@jewelroute/shared';
import { z } from 'zod';
import type { Prisma } from '../../generated/prisma';
import { PrismaService, Tx } from '../prisma.service';
import { Requires } from '../common/auth';
import { Ctx, ReqCtx } from '../common/context';
import { AppError, conflict, forbidden, isUniqueViolation, notFound, unprocessable } from '../common/errors';
import { parse, ymd } from '../common/http';
import { IdempotencyService } from '../core/idempotency';
import { OutboxService } from '../core/outbox';
import { RatesService } from '../core/rates';
import { dateOf, toDesign, toShop, ViewsService, visitInclude } from '../core/views';
import { env } from '../env';

const OPEN = ['CHECKED_IN', 'ACTIVE'] as const;
/** accuracyM is optional: an unknown accuracy earns no slack and is never VERIFIED (recorded as LOW_ACCURACY). */
const GeoBody = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracyM: z.number().min(0).max(100000).optional() });
const CheckInBody = GeoBody.extend({ simulated: z.boolean().optional() });
export const PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const ProofBody = z.object({
  objectKey: z.string().min(1).max(300),
  url: z.string().min(1).max(1000),
  contentType: z.string().refine((t) => PROOF_TYPES.includes(t), 'unsupported content type'),
  sizeBytes: z.number().int().positive().max(8 * 1024 * 1024),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i, 'hex sha256'),
  capturedAt: z.string().datetime({ offset: true }).optional(),
  captureLat: z.number().min(-90).max(90).optional(),
  captureLng: z.number().min(-180).max(180).optional(),
});
const NoteBody = z.object({ body: z.string().trim().min(1).max(4000) });
const CompleteBody = z.object({ lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional(), summary: z.string().max(4000).optional() });
export const CatalogQuery = z.object({
  q: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  collection: z.string().max(100).optional(),
  purity: z.enum(['K24', 'K22', 'K18', 'K14']).optional(),
  minWeightMg: z.coerce.number().int().optional(),
  maxWeightMg: z.coerce.number().int().optional(),
});

interface LockedVisit {
  id: string;
  status: string;
  agentId: string;
  shopId: string;
  plannedDate: Date;
  checkInLat: number | null;
  checkInLng: number | null;
}

@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly views: ViewsService,
    private readonly rates: RatesService,
    private readonly outbox: OutboxService,
    private readonly idem: IdempotencyService,
  ) {}

  /** Agents see only their own visits (404 otherwise — no existence leak); admins can read any in their tenant. */
  async readable(ctx: ReqCtx, id: string) {
    const v = await this.prisma.db.visit.findFirst({ where: { id, tenantId: ctx.user.tid }, include: visitInclude });
    if (!v || (ctx.user.role !== 'ADMIN' && v.agentId !== ctx.user.sub)) throw notFound('Visit');
    return v;
  }

  /** Row-lock the visit for a state transition; only the assigned agent may mutate it. */
  async lock(tx: Tx, ctx: ReqCtx, id: string): Promise<LockedVisit> {
    const [v] = await tx.$queryRaw<LockedVisit[]>`
      SELECT id, status::text AS status, "agentId", "shopId", "plannedDate", "checkInLat", "checkInLng"
      FROM "Visit" WHERE id = ${id} AND "tenantId" = ${ctx.user.tid} FOR UPDATE`;
    if (!v) throw notFound('Visit');
    if (v.agentId !== ctx.user.sub) {
      if (ctx.user.role === 'ADMIN') throw forbidden('NOT_YOUR_VISIT', 'Only the assigned agent can act on this visit');
      throw notFound('Visit');
    }
    return v;
  }

  requireOpen(v: LockedVisit) {
    if (!(OPEN as readonly string[]).includes(v.status)) throw conflict('VISIT_NOT_OPEN', `Visit is ${v.status}; check in first`, { status: v.status });
  }

  /**
   * Arrival photo before any sale: orders, memos and memo return/convert on a visit need ≥1 VisitProof.
   * Proofs are append-only, so a count inside the caller's transaction is enough (no lost update).
   */
  async requireProof(tx: Tx, ctx: ReqCtx, visitId: string) {
    const proofs = await tx.visitProof.count({ where: { tenantId: ctx.user.tid, visitId } });
    if (proofs < 1) throw conflict('PROOF_REQUIRED_BEFORE_SALE', 'Add the arrival photo for this visit before booking orders, leaving pieces on memo, or taking returns', { visitId });
  }

  private feed(ctx: ReqCtx, shop: { id: string; name: string }) {
    return { agent: { id: ctx.user.sub, name: ctx.user.name ?? '' }, shop: { id: shop.id, name: shop.name } };
  }

  async today(ctx: ReqCtx, date?: string) {
    const day = date ?? istDate();
    const tid = ctx.user.tid;
    const visits = await this.prisma.db.visit.findMany({
      where: { tenantId: tid, agentId: ctx.user.sub, plannedDate: dateOf(day), status: { not: 'CANCELLED' } },
      include: visitInclude,
      orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }],
    });
    const summaries = await this.views.visitSummaries(tid, visits);
    const rates = await this.rates.current(tid);
    const bag = await this.views.pieces(tid, { custodianType: 'AGENT', custodianAgentId: ctx.user.sub }, undefined, rates);
    const memos = await this.views.memos(tid, { agentId: ctx.user.sub, status: { in: ['ACTIVE', 'PARTIALLY_RETURNED'] } });
    // The agent's open visit may be from an earlier day (never completed). It blocks every check-in
    // (one open visit per agent), so Today must surface it or the agent is stuck on ANOTHER_VISIT_OPEN.
    const openAny = await this.prisma.db.visit.findFirst({ where: { tenantId: tid, agentId: ctx.user.sub, status: { in: [...OPEN] } }, include: visitInclude });
    const openVisit = openAny ? (summaries.find((v) => v.id === openAny.id) ?? (await this.views.visitSummaries(tid, [openAny]))[0]) : undefined;
    const next = openVisit ?? summaries.find((v) => v.status === 'PLANNED');
    return {
      agent: { id: ctx.user.sub, name: ctx.user.name },
      user: { id: ctx.user.sub, name: ctx.user.name ?? '' },
      date: day,
      progress: {
        planned: summaries.length,
        completed: summaries.filter((v) => v.status === 'COMPLETED').length,
        inProgress: summaries.filter((v) => (OPEN as readonly string[]).includes(v.status)).length,
      },
      visits: summaries,
      nextVisitId: next?.id,
      openVisit,
      bag: { pieceCount: bag.length, valuePaise: bag.reduce((s, p) => s + p.valuePaise, 0) },
      activeMemos: {
        count: memos.length,
        valuePaise: memos.reduce((s, m) => s + m.outstandingValuePaise, 0),
        overdueCount: memos.filter((m) => m.displayStatus === 'OVERDUE').length,
      },
    };
  }

  async detail(ctx: ReqCtx, id: string) {
    const v = await this.readable(ctx, id);
    const tid = ctx.user.tid;
    const [summary] = await this.views.visitSummaries(tid, [v]);
    const [proofs, notes, orders, memosCreated, previousOrders, activeMemos, lastVisit, bag, returnEvents] = await Promise.all([
      this.prisma.db.visitProof.findMany({ where: { tenantId: tid, visitId: id }, orderBy: { uploadedAt: 'asc' } }),
      this.prisma.db.visitNote.findMany({ where: { tenantId: tid, visitId: id }, orderBy: { createdAt: 'asc' } }),
      this.views.orders(tid, { visitId: id }),
      this.views.memos(tid, { visitId: id }),
      this.views.orders(tid, { shopId: v.shopId, NOT: { visitId: id } }, { take: 5 }),
      this.views.memos(tid, { shopId: v.shopId, status: { in: ['ACTIVE', 'PARTIALLY_RETURNED'] } }),
      this.prisma.db.visit.findFirst({
        where: { tenantId: tid, shopId: v.shopId, status: 'COMPLETED', id: { not: id } },
        orderBy: { completedAt: 'desc' },
        include: { agent: { select: { name: true } } },
      }),
      this.views.pieces(tid, { custodianType: 'AGENT', custodianAgentId: v.agentId }),
      this.prisma.db.custodyEvent.findMany({
        where: { tenantId: tid, visitId: id, reason: 'MEMO_RETURN' },
        orderBy: [{ occurredAt: 'asc' }, { seq: 'asc' }],
        select: { pieceId: true, memoId: true, outboxEventId: true, occurredAt: true, piece: { select: { tagCode: true, design: { select: { name: true } } } } },
      }),
    ]);
    const returns = await this.returnsOf(tid, returnEvents);
    const authors = await this.views.userNames(notes.map((n) => n.authorId));
    const otherOpen = v.status === 'PLANNED' ? await this.prisma.db.visit.findFirst({ where: { tenantId: tid, agentId: v.agentId, status: { in: [...OPEN] }, id: { not: id } }, select: { id: true } }) : null;
    return {
      resume: { ...resumeState(v, proofs.length, memosCreated, otherOpen?.id), returnedCount: returns.reduce((n, r) => n + r.pieces.length, 0) },
      visit: summary,
      agent: v.agent,
      shop: toShop(v.shop),
      proofs: proofs.map(toProof),
      notes: notes.map((n) => ({ id: n.id, body: n.body, author: { id: n.authorId, name: authors.get(n.authorId) ?? '' }, createdAt: n.createdAt.toISOString() })),
      orders,
      memosCreated,
      returns,
      shopContext: {
        previousOrders,
        activeMemos,
        lastVisit: lastVisit ? { id: lastVisit.id, completedAt: lastVisit.completedAt?.toISOString(), agentName: lastVisit.agent.name } : undefined,
      },
      bag,
    };
  }

  /** Samples returned from memos during this visit, one entry per return action (grouped by its custody event id). */
  private async returnsOf(
    tid: string,
    events: { pieceId: string; memoId: string | null; outboxEventId: string | null; occurredAt: Date; piece: { tagCode: string; design: { name: string } } }[],
  ) {
    if (!events.length) return [];
    const memoIds = [...new Set(events.map((e) => e.memoId).filter(Boolean) as string[])];
    const memos = await this.prisma.db.memo.findMany({ where: { tenantId: tid, id: { in: memoIds } }, select: { id: true, number: true } });
    const groups = new Map<string, { memoId: string; memoNumber: string; eventId?: string; at: string; pieces: { id: string; tagCode: string; name: string }[] }>();
    for (const e of events) {
      const k = e.outboxEventId ?? `${e.memoId}:${e.occurredAt.toISOString()}`;
      const g = groups.get(k) ?? { memoId: e.memoId ?? '', memoNumber: memos.find((m) => m.id === e.memoId)?.number ?? '', eventId: e.outboxEventId ?? undefined, at: e.occurredAt.toISOString(), pieces: [] };
      g.pieces.push({ id: e.pieceId, tagCode: e.piece.tagCode, name: e.piece.design.name });
      groups.set(k, g);
    }
    return [...groups.values()];
  }

  async geofenceCheck(ctx: ReqCtx, id: string, body: z.infer<typeof GeoBody>) {
    const v = await this.readable(ctx, id);
    const d = distanceM(body.lat, body.lng, v.shop.lat, v.shop.lng);
    const g = geofence(d, v.shop.geofenceRadiusM, body.accuracyM);
    const distance = Math.round(d);
    return {
      inside: g.inside,
      distanceM: distance,
      radiusM: v.shop.geofenceRadiusM,
      accuracyM: body.accuracyM ?? null,
      verification: g.verification,
      message: g.inside
        ? `You are ${distance} m from ${v.shop.name} — inside the ${v.shop.geofenceRadiusM} m check-in zone.`
        : `You are ${distance} m from ${v.shop.name}. Move within ${v.shop.geofenceRadiusM} m to check in.`,
    };
  }

  async checkIn(ctx: ReqCtx, id: string, body: z.infer<typeof CheckInBody>) {
    try {
      return await this.idem.run(ctx, async (tx) => {
        const v = await this.lock(tx, ctx, id);
        if ((OPEN as readonly string[]).includes(v.status)) throw conflict('ALREADY_CHECKED_IN', 'You are already checked in to this visit');
        if (v.status !== 'PLANNED') throw conflict('VISIT_NOT_PLANNED', `Visit is ${v.status}`, { status: v.status });
        const today = istDate();
        if (v.plannedDate.toISOString().slice(0, 10) !== today) throw conflict('VISIT_NOT_TODAY', 'This visit is not planned for today', { plannedDate: v.plannedDate.toISOString().slice(0, 10), today });
        const shop = await tx.shop.findFirstOrThrow({ where: { id: v.shopId, tenantId: ctx.user.tid } });
        const d = distanceM(body.lat, body.lng, shop.lat, shop.lng);
        const g = geofence(d, shop.geofenceRadiusM, body.accuracyM);
        let verification: 'VERIFIED' | 'LOW_ACCURACY' | 'SIMULATED';
        if (body.simulated) {
          const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: ctx.user.tid } });
          if (!tenant.demoMode) throw forbidden('SIMULATION_NOT_ALLOWED', 'Simulated check-in is disabled for this tenant');
          verification = 'SIMULATED';
        } else {
          if (!g.inside) throw conflict('OUTSIDE_GEOFENCE', `You are ${Math.round(d)} m from ${shop.name}; check-in requires ${shop.geofenceRadiusM} m`, { distanceM: Math.round(d), radiusM: shop.geofenceRadiusM });
          verification = g.verification!;
        }
        const other = await tx.visit.findFirst({ where: { tenantId: ctx.user.tid, agentId: ctx.user.sub, status: { in: [...OPEN] }, id: { not: id } }, select: { id: true } });
        if (other) throw conflict('ANOTHER_VISIT_OPEN', 'Finish your open visit before checking in elsewhere', { visitId: other.id });
        const now = new Date();
        await tx.visit.update({
          where: { id },
          data: { status: 'CHECKED_IN', checkInAt: now, checkInLat: body.lat, checkInLng: body.lng, checkInAccuracyM: body.accuracyM ?? null, checkInDistanceM: d, verification },
        });
        await this.outbox.emit(tx, {
          tenantId: ctx.user.tid,
          tenantSlug: ctx.user.tslug,
          type: 'visit.checked_in',
          aggregateType: 'Visit',
          aggregateId: id,
          actorId: ctx.user.sub,
          data: { visitId: id, ...this.feed(ctx, shop), checkInAt: now.toISOString(), lat: body.lat, lng: body.lng, accuracyM: body.accuracyM ?? null, distanceM: Math.round(d), radiusM: shop.geofenceRadiusM, verification },
        });
        return { visit: await this.views.visitSummary(ctx.user.tid, id, tx) };
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        const other = await this.prisma.db.visit.findFirst({ where: { tenantId: ctx.user.tid, agentId: ctx.user.sub, status: { in: [...OPEN] } }, select: { id: true } });
        if (other?.id === id) throw conflict('ALREADY_CHECKED_IN', 'You are already checked in to this visit');
        throw conflict('ANOTHER_VISIT_OPEN', 'Finish your open visit before checking in elsewhere', { visitId: other?.id });
      }
      throw e;
    }
  }

  async addProof(ctx: ReqCtx, id: string, body: z.infer<typeof ProofBody>) {
    return this.idem.run(ctx, async (tx) => {
      const v = await this.lock(tx, ctx, id);
      this.requireOpen(v);
      const prefix = `tenants/${ctx.user.tslug}/visits/${id}/`;
      if (!body.objectKey.startsWith(prefix)) throw unprocessable('INVALID_OBJECT_KEY', `objectKey must start with ${prefix}`);
      let url = body.url;
      const stored = await tx.storedFile.findUnique({ where: { tenantId_objectKey: { tenantId: ctx.user.tid, objectKey: body.objectKey } }, select: { id: true, sha256: true, sizeBytes: true, contentType: true } });
      if (stored) {
        // Direct mode: the server holds the bytes, so it recomputed the checksum at upload time.
        if (stored.sha256 !== body.checksumSha256.toLowerCase()) throw unprocessable('CHECKSUM_MISMATCH', 'Uploaded file checksum does not match', { expected: stored.sha256 });
        url = `/api/v1/files/${stored.id}`;
      } else {
        // Blob mode: the client token was scoped to exactly this pathname; the URL must point at it.
        if (!env().BLOB_READ_WRITE_TOKEN) throw unprocessable('OBJECT_NOT_FOUND', 'No uploaded file found for this objectKey');
        if (!/^https:\/\//.test(url) || !url.includes(body.objectKey)) throw unprocessable('INVALID_URL', 'url does not match objectKey');
      }
      const dup = await tx.visitProof.findUnique({ where: { visitId_checksumSha256: { visitId: id, checksumSha256: body.checksumSha256.toLowerCase() } } });
      if (dup) return { proof: toProof(dup), visit: await this.views.visitSummary(ctx.user.tid, id, tx) };
      const hasCapture = body.captureLat != null && body.captureLng != null;
      const distance = hasCapture && v.checkInLat != null && v.checkInLng != null ? distanceM(body.captureLat!, body.captureLng!, v.checkInLat, v.checkInLng) : null;
      const proof = await tx.visitProof.create({
        data: {
          tenantId: ctx.user.tid,
          visitId: id,
          agentId: v.agentId,
          shopId: v.shopId,
          objectKey: body.objectKey,
          url,
          contentType: stored?.contentType ?? body.contentType,
          sizeBytes: stored?.sizeBytes ?? body.sizeBytes,
          checksumSha256: body.checksumSha256.toLowerCase(),
          capturedAt: body.capturedAt ? new Date(body.capturedAt) : null,
          captureLat: body.captureLat,
          captureLng: body.captureLng,
          checkInLat: v.checkInLat,
          checkInLng: v.checkInLng,
          distanceM: distance,
        },
      });
      if (v.status === 'CHECKED_IN') await tx.visit.update({ where: { id }, data: { status: 'ACTIVE', startedAt: new Date() } });
      const shop = await tx.shop.findUniqueOrThrow({ where: { id: v.shopId }, select: { id: true, name: true } });
      await this.outbox.emit(tx, {
        tenantId: ctx.user.tid,
        tenantSlug: ctx.user.tslug,
        type: 'visit.proof_uploaded',
        aggregateType: 'Visit',
        aggregateId: id,
        actorId: ctx.user.sub,
        data: { visitId: id, proofId: proof.id, ...this.feed(ctx, shop), url: absoluteUrl(url), contentType: proof.contentType, sizeBytes: proof.sizeBytes, checksumSha256: proof.checksumSha256, distanceFromCheckInM: distance == null ? null : Math.round(distance) },
      });
      return { proof: toProof(proof), visit: await this.views.visitSummary(ctx.user.tid, id, tx) };
    });
  }

  async addNote(ctx: ReqCtx, id: string, body: z.infer<typeof NoteBody>) {
    const v = await this.readable(ctx, id);
    const note = await this.prisma.db.visitNote.create({ data: { tenantId: ctx.user.tid, visitId: v.id, authorId: ctx.user.sub, body: body.body } });
    return { note: { id: note.id, body: note.body, author: { id: ctx.user.sub, name: ctx.user.name ?? '' }, createdAt: note.createdAt.toISOString() } };
  }

  async complete(ctx: ReqCtx, id: string, body: z.infer<typeof CompleteBody>) {
    return this.idem.run(ctx, async (tx) => {
      const v = await this.lock(tx, ctx, id);
      if (v.status === 'COMPLETED') throw conflict('VISIT_ALREADY_COMPLETED', 'Visit already completed');
      this.requireOpen(v);
      const proofs = await tx.visitProof.count({ where: { visitId: id } });
      if (proofs < 1) throw conflict('PROOF_REQUIRED', 'Add at least one visit photo before completing');
      const now = new Date();
      await tx.visit.update({ where: { id }, data: { status: 'COMPLETED', completedAt: now, completedLat: body.lat, completedLng: body.lng, summary: body.summary } });
      const [orders, memos, shop] = await Promise.all([
        tx.order.aggregate({ where: { visitId: id }, _count: true, _sum: { totalPaise: true } }),
        tx.memo.aggregate({ where: { visitId: id }, _count: true, _sum: { totalValuePaise: true } }),
        tx.shop.findUniqueOrThrow({ where: { id: v.shopId }, select: { id: true, name: true } }),
      ]);
      await this.outbox.emit(tx, {
        tenantId: ctx.user.tid,
        tenantSlug: ctx.user.tslug,
        type: 'visit.completed',
        aggregateType: 'Visit',
        aggregateId: id,
        actorId: ctx.user.sub,
        data: {
          visitId: id,
          ...this.feed(ctx, shop),
          completedAt: now.toISOString(),
          summary: body.summary,
          proofCount: proofs,
          orderCount: orders._count,
          ordersValuePaise: Number(orders._sum.totalPaise ?? 0),
          memoCount: memos._count,
          memoValuePaise: Number(memos._sum.totalValuePaise ?? 0),
        },
      });
      return { visit: await this.views.visitSummary(ctx.user.tid, id, tx) };
    });
  }

  async catalog(ctx: ReqCtx, id: string, q: z.infer<typeof CatalogQuery>) {
    const v = await this.readable(ctx, id);
    return this.catalogFor(ctx.user.tid, v.agentId, q);
  }

  /** Catalog priced at today's rates; `availablePieces` = the given agent's bag. Shared by visit + field catalog. */
  async catalogFor(tid: string, agentId: string, q: z.infer<typeof CatalogQuery>) {
    const rates = await this.rates.current(tid);
    const where: Prisma.JewelryDesignWhereInput = {
      tenantId: tid,
      active: true,
      ...(q.category ? { category: q.category } : {}),
      ...(q.collection ? { collection: q.collection } : {}),
      ...(q.purity ? { purity: q.purity } : {}),
      ...(q.minWeightMg || q.maxWeightMg ? { netWeightMg: { ...(q.minWeightMg ? { gte: q.minWeightMg } : {}), ...(q.maxWeightMg ? { lte: q.maxWeightMg } : {}) } } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { sku: { contains: q.q, mode: 'insensitive' } }, { collection: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [designs, all, bag] = await Promise.all([
      this.prisma.db.jewelryDesign.findMany({ where, orderBy: [{ category: 'asc' }, { sku: 'asc' }] }),
      this.prisma.db.jewelryDesign.findMany({ where: { tenantId: tid, active: true }, select: { category: true, collection: true, purity: true } }),
      this.views.pieces(tid, { custodianType: 'AGENT', custodianAgentId: agentId }, undefined, rates),
    ]);
    const uniq = <T>(xs: T[]) => [...new Set(xs)].sort();
    return {
      rates: Object.values(rates).map((r) => ({ purity: r!.purity, ratePaisePerGram: r!.ratePaisePerGram, goldRateId: r!.goldRateId, effectiveFrom: r!.effectiveFrom })),
      facets: { categories: uniq(all.map((d) => d.category)), collections: uniq(all.map((d) => d.collection)), purities: uniq(all.map((d) => d.purity)) },
      designs: designs.map((d) => ({ ...toDesign(d, rates), availablePieces: bag.filter((p) => p.designId === d.id) })),
    };
  }
}

/** Accuracy-aware geofence: unknown accuracy → no slack, and a pass is LOW_ACCURACY (never VERIFIED). */
export function geofence(distance: number, radiusM: number, accuracyM: number | undefined) {
  const g = geofenceDecision(distance, radiusM, accuracyM ?? 0);
  return { inside: g.inside, verification: g.inside && accuracyM == null ? ('LOW_ACCURACY' as const) : g.verification };
}

/**
 * Everything a client needs to resume a visit after a refresh / app kill: where the agent is in the
 * check-in → proof → sell → complete flow, and what is still pending. Server-derived only.
 */
export function resumeState(
  v: { status: string; plannedDate: Date; checkInAt: Date | null },
  proofCount: number,
  memos: { id: string; number: string; ackStatus: string }[],
  otherOpenVisitId?: string,
) {
  const isToday = v.plannedDate.toISOString().slice(0, 10) === istDate();
  const open = (OPEN as readonly string[]).includes(v.status);
  const blockedBy =
    v.status === 'PLANNED' && !isToday
      ? { code: 'VISIT_NOT_TODAY' }
      : v.status === 'PLANNED' && otherOpenVisitId
        ? { code: 'ANOTHER_VISIT_OPEN', visitId: otherOpenVisitId }
        : undefined;
  const nextStep =
    v.status === 'PLANNED' ? 'CHECK_IN' : open && proofCount === 0 ? 'UPLOAD_PROOF' : open ? 'SELL_OR_COMPLETE' : v.status === 'COMPLETED' ? 'DONE' : 'CLOSED';
  return {
    checkedIn: v.checkInAt != null,
    proofUploaded: proofCount > 0,
    canCheckIn: v.status === 'PLANNED' && !blockedBy,
    canSell: open && proofCount > 0,
    canComplete: open && proofCount > 0,
    nextStep,
    blockedBy,
    pendingAcks: memos.filter((m) => m.ackStatus === 'PENDING').map((m) => ({ memoId: m.id, number: m.number })),
  };
}

export function absoluteUrl(url: string) {
  if (/^https?:\/\//.test(url)) return url;
  return `${env().APP_PUBLIC_URL}${url}`;
}

export function toProof(p: Prisma.VisitProofGetPayload<object>) {
  return {
    id: p.id,
    url: p.url,
    objectKey: p.objectKey,
    contentType: p.contentType,
    sizeBytes: p.sizeBytes,
    checksumSha256: p.checksumSha256,
    capturedAt: p.capturedAt?.toISOString(),
    uploadedAt: p.uploadedAt.toISOString(),
    captureLat: p.captureLat ?? undefined,
    captureLng: p.captureLng ?? undefined,
    checkInLat: p.checkInLat ?? undefined,
    checkInLng: p.checkInLng ?? undefined,
    distanceM: p.distanceM == null ? undefined : Math.round(p.distanceM),
  };
}

@ApiTags('field')
@Requires('field')
@Controller('v1')
export class VisitsController {
  constructor(private readonly visits: VisitsService) {}

  @Get('field/today')
  @ApiOperation({ summary: "Agent's route for a business date (IST)" })
  today(@Ctx() ctx: ReqCtx, @Query('date') date?: string) {
    return this.visits.today(ctx, date ? parse(ymd, date) : undefined);
  }

  @Get('visits/:id')
  detail(@Ctx() ctx: ReqCtx, @Param('id') id: string) {
    return this.visits.detail(ctx, id);
  }

  @Post('visits/:id/geofence-check')
  @HttpCode(200)
  geofence(@Ctx() ctx: ReqCtx, @Param('id') id: string, @Body() body: unknown) {
    return this.visits.geofenceCheck(ctx, id, parse(GeoBody, body));
  }

  @Post('visits/:id/check-in')
  @HttpCode(200)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  checkIn(@Ctx() ctx: ReqCtx, @Param('id') id: string, @Body() body: unknown) {
    return this.visits.checkIn(ctx, id, parse(CheckInBody, body));
  }

  @Post('visits/:id/proofs')
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  proof(@Ctx() ctx: ReqCtx, @Param('id') id: string, @Body() body: unknown) {
    return this.visits.addProof(ctx, id, parse(ProofBody, body));
  }

  @Post('visits/:id/notes')
  note(@Ctx() ctx: ReqCtx, @Param('id') id: string, @Body() body: unknown) {
    return this.visits.addNote(ctx, id, parse(NoteBody, body));
  }

  @Post('visits/:id/complete')
  @HttpCode(200)
  complete(@Ctx() ctx: ReqCtx, @Param('id') id: string, @Body() body: unknown) {
    return this.visits.complete(ctx, id, parse(CompleteBody, body));
  }

  @Get('visits/:id/catalog')
  catalog(@Ctx() ctx: ReqCtx, @Param('id') id: string, @Query() q: unknown) {
    return this.visits.catalog(ctx, id, parse(CatalogQuery, q));
  }
}

@Module({ controllers: [VisitsController], providers: [VisitsService], exports: [VisitsService] })
export class VisitsModule {}

export { AppError };
