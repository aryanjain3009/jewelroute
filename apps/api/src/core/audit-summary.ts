/* Human-readable audit rows: every AuditRow gets `actor: {id,name}`, a `summary` sentence and `refs`
 * (id → {type,name}) for every id found in entityId/before/after, resolved with one batched query per
 * table — so no surface ever has to show a raw cuid as the only content. */
import { formatINR, formatRate, PURITY_LABEL } from '@jewelroute/shared';
import type { Prisma } from '../../generated/prisma';
import type { PrismaService } from '../prisma.service';

type AuditLogRow = Prisma.AuditLogGetPayload<object>;
type Obj = Record<string, unknown>;
export type RefKind = 'user' | 'shop' | 'order' | 'memo' | 'piece' | 'visit' | 'design' | 'webhook';
export type RefMap = Record<string, { type: RefKind; name: string }>;

const ID_KEYS: Record<string, RefKind> = { shopId: 'shop', agentId: 'user', assignedAgentId: 'user', orderId: 'order', memoId: 'memo', visitId: 'visit', designId: 'design' };
const ENTITY_KIND: Record<string, RefKind> = { Order: 'order', Memo: 'memo', Shop: 'shop', User: 'user', Visit: 'visit', JewelryDesign: 'design', SamplePiece: 'piece', WebhookEndpoint: 'webhook' };
const FIELD_LABEL: Record<string, string> = {
  assignedAgentId: 'assigned agent', creditLimitPaise: 'credit limit', geofenceRadiusM: 'geofence', ownerName: 'owner', active: 'active',
  makingChargeValue: 'making charge', stoneValuePaise: 'stone value', netWeightMg: 'net weight', grossWeightMg: 'gross weight', events: 'events', url: 'URL',
};
const SKIP_DIFF = new Set(['id', 'code', 'price', 'otherComponents', 'imageUrls', 'description', 'lat', 'lng', 'notes']);

const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Collect every id we know how to resolve from a row. */
function collect(r: AuditLogRow, want: Record<RefKind, Set<string>>) {
  const kind = ENTITY_KIND[r.entityType];
  if (kind) for (const id of r.entityId.split(',')) want[kind].add(id);
  for (const side of [obj(r.before), obj(r.after)]) {
    for (const [k, v] of Object.entries(side)) {
      if (ID_KEYS[k] && typeof v === 'string') want[ID_KEYS[k]].add(v);
      if (k === 'pieceIds' && Array.isArray(v)) for (const id of v) if (typeof id === 'string') want.piece.add(id);
      if (k === 'custodian') {
        const c = obj(v);
        if (typeof c.agentId === 'string') want.user.add(c.agentId);
        if (typeof c.shopId === 'string') want.shop.add(c.shopId);
      }
    }
  }
}

export async function resolveAuditRefs(db: PrismaService['db'], tenantId: string, rows: AuditLogRow[]): Promise<RefMap> {
  const want = { user: new Set<string>(), shop: new Set<string>(), order: new Set<string>(), memo: new Set<string>(), piece: new Set<string>(), visit: new Set<string>(), design: new Set<string>(), webhook: new Set<string>() } as Record<RefKind, Set<string>>;
  for (const r of rows) {
    collect(r, want);
    if (r.actorId) want.user.add(r.actorId);
  }
  const ids = (k: RefKind) => [...want[k]];
  const [users, shops, orders, memos, pieces, visits, designs, hooks] = await Promise.all([
    db.user.findMany({ where: { tenantId, id: { in: ids('user') } }, select: { id: true, name: true } }),
    db.shop.findMany({ where: { tenantId, id: { in: ids('shop') } }, select: { id: true, name: true } }),
    db.order.findMany({ where: { tenantId, id: { in: ids('order') } }, select: { id: true, number: true } }),
    db.memo.findMany({ where: { tenantId, id: { in: ids('memo') } }, select: { id: true, number: true } }),
    db.samplePiece.findMany({ where: { tenantId, id: { in: ids('piece') } }, select: { id: true, tagCode: true } }),
    db.visit.findMany({ where: { tenantId, id: { in: ids('visit') } }, select: { id: true, plannedDate: true, shop: { select: { name: true } }, agent: { select: { name: true } } } }),
    db.jewelryDesign.findMany({ where: { tenantId, id: { in: ids('design') } }, select: { id: true, sku: true, name: true } }),
    db.webhookEndpoint.findMany({ where: { tenantId, id: { in: ids('webhook') } }, select: { id: true, url: true } }),
  ]);
  const refs: RefMap = {};
  for (const u of users) refs[u.id] = { type: 'user', name: u.name };
  for (const s of shops) refs[s.id] = { type: 'shop', name: s.name };
  for (const o of orders) refs[o.id] = { type: 'order', name: o.number };
  for (const m of memos) refs[m.id] = { type: 'memo', name: m.number };
  for (const p of pieces) refs[p.id] = { type: 'piece', name: p.tagCode };
  for (const v of visits) refs[v.id] = { type: 'visit', name: `${v.agent.name} at ${v.shop.name} · ${v.plannedDate.toISOString().slice(0, 10)}` };
  for (const d of designs) refs[d.id] = { type: 'design', name: `${d.sku} ${d.name}` };
  for (const h of hooks) refs[h.id] = { type: 'webhook', name: h.url.replace(/^https?:\/\//, '') };
  return refs;
}

function fmtValue(key: string, v: unknown, refs: RefMap): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string' && refs[v]) return refs[v].name;
  if (/Paise$/.test(key) && typeof v === 'number') return formatINR(v);
  if (/Mg$/.test(key) && typeof v === 'number') return `${(v / 1000).toFixed(3)} g`;
  if (key === 'geofenceRadiusM') return `${v} m`;
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function diff(before: Obj, after: Obj, refs: RefMap): string {
  const parts: string[] = [];
  for (const k of Object.keys(after)) {
    if (SKIP_DIFF.has(k) || k === 'passwordChanged') continue;
    if (JSON.stringify(before[k] ?? null) === JSON.stringify(after[k] ?? null)) continue;
    const label = FIELD_LABEL[k] ?? k.replace(/([A-Z])/g, ' $1').toLowerCase();
    parts.push(`${label}: ${fmtValue(k, before[k], refs)} → ${fmtValue(k, after[k], refs)}`);
  }
  if (after.passwordChanged === true) parts.push('password reset');
  return parts.length ? parts.join('; ') : 'no visible changes';
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const custodianLabel = (c: Obj, refs: RefMap) =>
  c.type === 'AGENT' ? (refs[String(c.agentId)]?.name ?? 'agent') : c.type === 'SHOP' ? (refs[String(c.shopId)]?.name ?? 'shop') : cap(String(c.type ?? '').toLowerCase());

export function auditSummary(r: AuditLogRow, refs: RefMap): string {
  const b = obj(r.before);
  const a = obj(r.after);
  const name = (id: unknown, fallback: string) => (typeof id === 'string' && refs[id]?.name) || fallback;
  const self = name(r.entityId, r.entityType);
  const n = (x: unknown) => (Array.isArray(x) ? x.length : 0);
  switch (r.action) {
    case 'order.create':
      return `Created ${a.number ?? self}${typeof a.totalPaise === 'number' ? ` · ${formatINR(a.totalPaise)}` : ''}${a.sourceMemoId ? ` from ${name(a.sourceMemoId, 'a memo')}` : ''}`;
    case 'order.approve':
      return `Approved ${self}`;
    case 'order.reject':
      return `Rejected ${self}${a.reason ? ` — “${a.reason}”` : ''}`;
    case 'memo.create':
      return `Issued ${a.number ?? self}${typeof a.shopId === 'string' && refs[a.shopId] ? ` to ${refs[a.shopId].name}` : ''} · ${plural(n(a.pieceIds), 'piece')} (${(a.pieceIds as string[] | undefined)?.map((p) => name(p, '?')).join(', ') ?? ''}) · due ${a.dueDate}${typeof a.totalValuePaise === 'number' ? ` · ${formatINR(a.totalValuePaise)}` : ''}`;
    case 'memo.return':
      return `Returned ${plural(n(a.pieceIds), 'piece')} on ${self} (${(a.pieceIds as string[] | undefined)?.map((p) => name(p, '?')).join(', ')}) · ${b.status} → ${a.status}`;
    case 'memo.convert':
      return `Sold ${plural(n(a.pieceIds), 'piece')} on ${self} as ${name(a.orderId, 'an order')} · ${b.status} → ${a.status}`;
    case 'memo.extend':
      return `Extended ${self} due date ${b.dueDate} → ${a.dueDate}${a.reason ? ` (“${a.reason}”)` : ''}`;
    case 'memo.ack':
      return `Retailer acknowledged ${self} (${a.method === 'OTP' ? 'code read to agent' : 'confirmed on their phone'})`;
    case 'custody.move': {
      const ids = r.entityId.split(',');
      return `Moved ${plural(ids.length, 'piece')} (${ids.map((p) => name(p, '?')).join(', ')}) ${custodianLabel(obj(b.custodian), refs)} → ${custodianLabel(obj(a.custodian), refs)} · ${String(a.reason ?? '').toLowerCase().replace(/_/g, ' ')}${a.memoId ? ` · ${name(a.memoId, '')}` : ''}`;
    }
    case 'visit.assign':
      return `Assigned ${name(a.shopId, 'a shop')} to ${name(a.agentId, 'an agent')} for ${a.date}${a.plannedTime ? ` at ${a.plannedTime}` : ''}`;
    case 'visit.unassign':
      return `Unassigned visit (${self})`;
    case 'gold_rate.set': {
      const pu = PURITY_LABEL[String(a.purity)] ?? a.purity;
      return typeof b.ratePaisePerGram === 'number'
        ? `Set ${pu} gold rate ${formatRate(Number(b.ratePaisePerGram))} → ${formatRate(Number(a.ratePaisePerGram))}`
        : `Set ${pu} gold rate to ${formatRate(Number(a.ratePaisePerGram))}`;
    }
    case 'shop.create':
      return `Created shop ${a.name ?? self}`;
    case 'shop.update':
      return `Updated ${self}: ${diff(b, a, refs)}`;
    case 'design.create':
      return `Created design ${a.sku ?? ''} ${a.name ?? ''}`.trim();
    case 'design.update':
      return `Updated design ${self}: ${diff(b, a, refs)}`;
    case 'piece.intake':
      return `Added ${plural(Number(a.count ?? n(a.pieceIds)), 'piece')} of ${self} to the vault`;
    case 'agent.create':
      return `Added agent ${a.name ?? self} (${a.email ?? ''})`;
    case 'agent.update':
      return `Updated agent ${self}: ${diff(b, a, refs)}`;
    case 'webhook.create':
      return `Created webhook endpoint ${a.url ?? self}`;
    case 'webhook.update':
      return `Updated webhook ${self}: ${diff(b, a, refs)}`;
    case 'webhook.delete':
      return `Deleted webhook endpoint ${self}`;
    case 'webhook.rotate_secret':
      return `Rotated the signing secret of ${self}`;
    case 'webhook.reveal_secret':
      return `Revealed the signing secret of ${self}`;
    default:
      return `${cap(r.action.replace(/[._]/g, ' '))} · ${self}`;
  }
}
