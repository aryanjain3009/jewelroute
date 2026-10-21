import { Injectable } from '@nestjs/common';
import { formatINRCompact } from '@jewelroute/shared';
import { ulid } from 'ulid';
import type { Prisma } from '../../generated/prisma';
import type { Tx } from '../prisma.service';
import { eventRefs } from './event-refs';

export interface EmitInput {
  tenantId: string;
  tenantSlug: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  actorId?: string | null;
  data: Record<string, unknown>;
  targetEndpointId?: string;
  /** Pre-allocated event id (see OutboxService.newId) when rows written earlier in the tx must reference it. */
  id?: string;
}

/** Plain JSON (BigInt → number, Date → ISO) so the stored payload is exactly what gets signed and sent. */
export function toJson<T>(v: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? Number(x) : x)));
}

/**
 * Transactional outbox. Always called with the transaction of the state change, so an event
 * exists if and only if the change committed. Payload = the public webhook body.
 */
@Injectable()
export class OutboxService {
  newId() {
    return `evt_${ulid()}`;
  }

  async emit(tx: Tx, e: EmitInput) {
    const id = e.id ?? this.newId();
    const createdAt = new Date();
    const payload = toJson({ id, type: e.type, tenantId: e.tenantSlug, createdAt: createdAt.toISOString(), data: e.data });
    const refs = eventRefs(e.aggregateType, e.aggregateId, (payload as { data: Record<string, unknown> }).data);
    await tx.outboxEvent.create({
      data: {
        id,
        tenantId: e.tenantId,
        type: e.type,
        aggregateType: e.aggregateType,
        aggregateId: e.aggregateId,
        actorId: e.actorId ?? null,
        payload,
        createdAt,
        targetEndpointId: e.targetEndpointId,
        ...refs,
      },
    });
    return id;
  }
}

type Named = { id: string; name: string } | undefined;
interface FeedData {
  agent?: Named;
  actor?: Named;
  shop?: Named;
  number?: string;
  totalPaise?: number;
  totalValuePaise?: number;
  pieceCount?: number;
  pieces?: unknown[];
  dueDate?: string;
  verification?: string;
  fromLabel?: string;
  toLabel?: string;
  reason?: string;
  memoNumber?: string;
  rejectionReason?: string;
  cancellationReason?: string;
  orderNumber?: string;
  reasons?: string[];
  method?: string;
  unsold?: { memoNumber: string; pieceIds: string[] };
}

const REASON_TEXT: Record<string, string> = { CREDIT_LIMIT: 'over credit limit', ORDER_THRESHOLD: 'above approval threshold' };

/** Human sentence for the admin activity feed, derived from event type + payload. */
export function activityTitle(type: string, d: FeedData): { title: string; amountPaise?: number } {
  const who = d.agent?.name ?? d.actor?.name ?? 'Someone';
  const shop = d.shop?.name ?? 'a shop';
  const n = d.pieceCount ?? d.pieces?.length ?? 0;
  const s = n === 1 ? '' : 's';
  switch (type) {
    case 'visit.checked_in':
      return { title: `${who} checked in at ${shop}${d.verification === 'SIMULATED' ? ' (simulated GPS)' : d.verification === 'LOW_ACCURACY' ? ' (low GPS accuracy)' : ''}` };
    case 'visit.proof_uploaded':
      return { title: `${who} uploaded visit proof at ${shop}` };
    case 'visit.completed':
      return { title: `${who} completed the visit at ${shop}` };
    case 'order.created':
      return { title: `${who} booked ${d.number} at ${shop} · ${formatINRCompact(d.totalPaise ?? 0)}`, amountPaise: d.totalPaise };
    case 'order.confirmed':
      return { title: `${d.number} confirmed at ${shop} — within credit, no approval needed`, amountPaise: d.totalPaise };
    case 'order.pending_approval':
      return { title: `${d.number} at ${shop} needs approval — ${(d.reasons ?? []).map((r) => REASON_TEXT[r] ?? r).join(' and ') || 'rule tripped'}`, amountPaise: d.totalPaise };
    case 'order.settled':
      return { title: `${d.number} (${shop}) marked settled by ${d.actor?.name ?? 'Manager'}`, amountPaise: d.totalPaise };
    case 'order.cancelled':
      return { title: `${d.actor?.name ?? 'Manager'} cancelled ${d.number} (${shop})${d.cancellationReason ? ` — ${d.cancellationReason}` : ''}`, amountPaise: d.totalPaise };
    case 'memo.acknowledged':
      return { title: `${shop} acknowledged receiving ${d.number}${d.method === 'OTP' ? ' (code read to the agent)' : d.method === 'QR_CONFIRM' ? ' (confirmed on their phone)' : ''}`, amountPaise: d.totalValuePaise };
    case 'order.approved':
      return { title: `${d.actor?.name ?? 'Manager'} approved ${d.number} (${shop})`, amountPaise: d.totalPaise };
    case 'order.rejected':
      return { title: `${d.actor?.name ?? 'Manager'} rejected ${d.number} (${shop})${d.unsold ? ` — ${d.unsold.pieceIds.length} sample${d.unsold.pieceIds.length === 1 ? '' : 's'} back on ${d.unsold.memoNumber}` : ''}`, amountPaise: d.totalPaise };
    case 'memo.created':
      return { title: `${who} left ${n} sample${s} at ${shop} on ${d.number} · due ${d.dueDate}`, amountPaise: d.totalValuePaise };
    case 'memo.extended':
      return { title: `${d.number} at ${shop} extended to ${d.dueDate}` };
    case 'memo.returned':
      return { title: `${n} sample${s} returned from ${shop} (${d.number})`, amountPaise: d.totalValuePaise };
    case 'memo.converted':
      return { title: `${who} converted ${n} sample${s} on ${d.number} at ${shop} into ${d.orderNumber ?? 'an order'}`, amountPaise: d.totalPaise };
    case 'memo.overdue':
      return { title: `${d.number} at ${shop} is overdue (due ${d.dueDate})`, amountPaise: d.totalValuePaise };
    case 'sample.custody_changed':
      return { title: `${n} sample${s} moved ${d.fromLabel ?? '?'} → ${d.toLabel ?? '?'}` };
    case 'ping':
      return { title: 'Test webhook event' };
    default:
      return { title: type };
  }
}
