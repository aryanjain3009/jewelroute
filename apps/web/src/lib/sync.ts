"use client";
/** One map of "what changed → which screens must refetch", shared by field and admin.
 *  The UI never patches derived state locally: after a write it invalidates every query that can
 *  show that fact, and the server answers. Query keys are prefixes, so ["visit"] also refreshes
 *  ["visit", id]. Cross-user freshness comes from refetch-on-focus + polling on live screens. */
import { useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";

export const qk = {
  me: ["me"] as const,
  // field
  today: ["today"] as const,
  visit: (id?: string) => (id ? (["visit", id] as const) : (["visit"] as const)),
  fieldVisits: ["field-visits"] as const,
  profile: ["profile"] as const,
  catalog: ["catalog"] as const,
  // admin
  home: ["home"] as const,
  dashboard: ["dashboard"] as const,
  search: ["search"] as const,
  shops: ["shops"] as const,
  shop: (id?: string) => (id ? (["shop", id] as const) : (["shop"] as const)),
  adminVisits: ["admin-visits"] as const,
  adminVisit: (id?: string) => (id ? (["admin-visit", id] as const) : (["admin-visit"] as const)),
  agents: ["agents"] as const,
  agent: (id?: string) => (id ? (["agent", id] as const) : (["agent"] as const)),
  orders: ["orders"] as const,
  order: (id?: string) => (id ? (["order", id] as const) : (["order"] as const)),
  memos: ["memos"] as const,
  memo: (id?: string) => (id ? (["memo", id] as const) : (["memo"] as const)),
  pieces: ["pieces"] as const,
  piece: (id?: string) => (id ? (["piece", id] as const) : (["piece"] as const)),
  designs: ["designs"] as const,
  goldRates: ["gold-rates"] as const,
  webhooks: ["webhooks"] as const,
  deliveries: ["deliveries"] as const,
  delivery: (id?: string | null) => (id ? (["delivery", id] as const) : (["delivery"] as const)),
  received: ["received"] as const,
  eventTypes: ["event-types"] as const,
  geofence: (visitId: string) => ["geofence", visitId] as const,
  activity: ["activity"] as const,
};

export type Change =
  | "visit.checked_in" | "visit.proof_uploaded" | "visit.note_added" | "visit.completed" | "visit.assigned"
  | "order.created" | "order.decided"
  | "memo.created" | "memo.returned" | "memo.extended" | "memo.converted" | "memo.acknowledged"
  | "piece.moved" | "gold_rate.set" | "shop.saved" | "design.saved" | "agent.saved" | "webhook.changed";

const everywhereVisit: QueryKey[] = [qk.today, qk.visit(), qk.fieldVisits, qk.home, qk.dashboard, qk.adminVisits, qk.adminVisit(), qk.shop(), qk.shops, qk.agent(), qk.agents, qk.activity];
const custody: QueryKey[] = [qk.pieces, qk.piece(), qk.profile, qk.catalog, qk.designs, qk.memos, qk.memo(), qk.shop(), qk.shops, qk.agent(), qk.agents, qk.today, qk.visit(), qk.adminVisit(), qk.home, qk.dashboard, qk.activity];

export const AFFECTS: Record<Change, QueryKey[]> = {
  "visit.checked_in": everywhereVisit,
  "visit.proof_uploaded": everywhereVisit,
  "visit.note_added": [qk.visit(), qk.adminVisit(), qk.shop(), qk.activity],
  "visit.completed": [...everywhereVisit, qk.profile],
  "visit.assigned": [...everywhereVisit],
  "order.created": [qk.orders, qk.order(), qk.visit(), qk.adminVisit(), qk.today, qk.shop(), qk.shops, qk.agent(), qk.agents, qk.home, qk.dashboard, qk.activity, qk.profile],
  "order.decided": [qk.orders, qk.order(), qk.home, qk.dashboard, qk.shop(), qk.shops, qk.adminVisit(), qk.visit(), qk.activity],
  "memo.created": custody,
  "memo.returned": custody,
  "memo.converted": [...custody, qk.orders, qk.order()],
  "memo.extended": [qk.memos, qk.memo(), qk.home, qk.dashboard, qk.shop(), qk.visit(), qk.adminVisit(), qk.activity],
  "memo.acknowledged": [qk.memos, qk.memo(), qk.visit(), qk.adminVisit(), qk.shop(), qk.activity],
  "piece.moved": custody,
  "gold_rate.set": [qk.goldRates, qk.catalog, qk.designs, qk.pieces, qk.piece(), qk.home, qk.dashboard, qk.profile, qk.shops, qk.shop(), qk.agents, qk.agent(), qk.activity],
  "shop.saved": [qk.shops, qk.shop(), qk.home, qk.dashboard, qk.today],
  "design.saved": [qk.designs, qk.catalog, qk.pieces],
  "agent.saved": [qk.agents, qk.agent(), qk.home, qk.dashboard],
  "webhook.changed": [qk.webhooks, qk.deliveries, qk.delivery(), qk.received, qk.home],
};

export function invalidateAfter(qc: QueryClient, ...changes: Change[]) {
  const seen = new Set<string>();
  for (const c of changes) for (const k of AFFECTS[c]) {
    const s = JSON.stringify(k);
    if (seen.has(s)) continue;
    seen.add(s);
    void qc.invalidateQueries({ queryKey: k });
  }
}
export function useSync() {
  const qc = useQueryClient();
  return (...changes: Change[]) => invalidateAfter(qc, ...changes);
}
