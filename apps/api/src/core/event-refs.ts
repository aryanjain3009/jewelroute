/* v3 activity refs: the indexed columns every OutboxEvent carries (shopId, agentId, visitId, orderId,
 * memoId, pieceIds) so every surface can filter the one activity stream by any record.
 * Derived from the event payload — the same rules as the SQL back-fill in
 * prisma/migrations/20261021000300_v3_credit_activity (keep the two in step). Pure: used by
 * OutboxService.emit and by the demo seed. */

export interface EventRefs {
  shopId: string | null;
  agentId: string | null;
  visitId: string | null;
  orderId: string | null;
  memoId: string | null;
  pieceIds: string[];
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length ? v : undefined);
const idOf = (v: unknown) => str(obj(v)?.id);

export function eventRefs(aggregateType: string, aggregateId: string, data: Obj): EventRefs {
  const to = obj(data.to);
  const from = obj(data.from);
  const ids = new Set<string>();
  for (const p of Array.isArray(data.pieces) ? data.pieces : []) {
    const id = idOf(p);
    if (id) ids.add(id);
  }
  for (const i of Array.isArray(data.items) ? data.items : []) {
    const id = str(obj(i)?.pieceId);
    if (id) ids.add(id);
  }
  return {
    shopId: idOf(data.shop) ?? str(to?.shopId) ?? str(from?.shopId) ?? (aggregateType === 'Shop' ? aggregateId : undefined) ?? null,
    agentId: idOf(data.agent) ?? idOf(data.agentRef) ?? str(to?.agentId) ?? str(from?.agentId) ?? null,
    visitId: str(data.visitId) ?? (aggregateType === 'Visit' ? aggregateId : undefined) ?? null,
    orderId: str(data.orderId) ?? (aggregateType === 'Order' ? aggregateId : undefined) ?? null,
    memoId: str(data.memoId) ?? str(data.sourceMemoId) ?? (aggregateType === 'Memo' ? aggregateId : undefined) ?? null,
    pieceIds: [...ids].sort(),
  };
}
