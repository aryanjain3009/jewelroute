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
  /** First-run checklist (a new workspace's six setup steps). */
  onboarding: ["onboarding"] as const,
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
  settings: ["settings"] as const,
  /** Credit position for a prospective order (field review) or a shop. */
  credit: ["credit"] as const,
  /** Memo-to-sale preview (prices at today's rate + credit net of the pieces sold). */
  convertPreview: ["convert-preview"] as const,
};

/** Polling for live screens (focus refetch covers the rest). A field visit polls while one of its orders
 *  waits for the manager, so the decision (and a rejection's reason) reaches an agent who keeps it open. */
export const POLL = { home: 10_000, deliveries: 5_000, pendingDecision: 10_000, ackPage: 5_000, today: 30_000 } as const;

export type Change =
  | "visit.checked_in" | "visit.proof_uploaded" | "visit.note_added" | "visit.completed" | "visit.assigned"
  | "order.created" | "order.decided" | "order.settled" | "order.cancelled" | "order.unsold"
  | "memo.created" | "memo.returned" | "memo.extended" | "memo.converted" | "memo.acknowledged"
  | "piece.moved" | "gold_rate.set" | "shop.saved" | "design.saved" | "agent.saved" | "webhook.changed" | "settings.saved";

const everywhereVisit: QueryKey[] = [qk.onboarding, qk.today, qk.visit(), qk.fieldVisits, qk.home, qk.adminVisits, qk.adminVisit(), qk.shop(), qk.shops, qk.agent(), qk.agents, qk.activity];
const custody: QueryKey[] = [qk.onboarding, qk.credit, qk.convertPreview, qk.pieces, qk.piece(), qk.profile, qk.catalog, qk.designs, qk.memos, qk.memo(), qk.shop(), qk.shops, qk.agent(), qk.agents, qk.today, qk.visit(), qk.adminVisit(), qk.home, qk.activity];

export const AFFECTS: Record<Change, QueryKey[]> = {
  "visit.checked_in": everywhereVisit,
  "visit.proof_uploaded": everywhereVisit,
  "visit.note_added": [qk.visit(), qk.adminVisit(), qk.shop(), qk.activity],
  "visit.completed": [...everywhereVisit, qk.profile],
  "visit.assigned": [...everywhereVisit],
  "order.created": [qk.credit, qk.convertPreview, qk.orders, qk.order(), qk.visit(), qk.adminVisit(), qk.today, qk.shop(), qk.shops, qk.agent(), qk.agents, qk.home, qk.activity, qk.profile, qk.fieldVisits, qk.adminVisits],
  "order.decided": [qk.orders, qk.order(), qk.home, qk.shop(), qk.shops, qk.adminVisit(), qk.visit(), qk.activity, qk.credit, qk.convertPreview, qk.agent(), qk.agents, qk.today, qk.adminVisits, qk.fieldVisits, qk.profile],
  // Settling/cancelling changes the shop's outstanding → its credit, every list showing it, and the feed.
  // Rejecting an order converted from a memo un-sells it: pieces go back to the shop on that memo.
  "order.unsold": [...custody, qk.orders, qk.order(), qk.adminVisit(), qk.visit(), qk.adminVisits, qk.fieldVisits],
  "order.settled": [qk.orders, qk.order(), qk.shop(), qk.shops, qk.credit, qk.convertPreview, qk.home, qk.activity, qk.agent(), qk.adminVisit(), qk.visit()],
  "order.cancelled": [qk.orders, qk.order(), qk.shop(), qk.shops, qk.credit, qk.convertPreview, qk.home, qk.activity, qk.agent(), qk.agents, qk.adminVisit(), qk.visit(), qk.today, qk.profile, qk.adminVisits, qk.fieldVisits],
  "memo.created": [...custody, qk.fieldVisits, qk.adminVisits],
  "memo.returned": [...custody, qk.fieldVisits, qk.adminVisits],
  "memo.converted": [...custody, qk.orders, qk.order(), qk.fieldVisits, qk.adminVisits],
  "memo.extended": [qk.memos, qk.memo(), qk.home, qk.shop(), qk.visit(), qk.adminVisit(), qk.activity, qk.today, qk.profile, qk.pieces, qk.piece(), qk.shops, qk.agents, qk.agent()],
  "memo.acknowledged": [qk.memos, qk.memo(), qk.visit(), qk.adminVisit(), qk.shop(), qk.piece(), qk.pieces, qk.home, qk.activity],
  "piece.moved": custody,
  "gold_rate.set": [qk.onboarding, qk.goldRates, qk.convertPreview, qk.catalog, qk.designs, qk.pieces, qk.piece(), qk.home, qk.profile, qk.today, qk.visit(), qk.adminVisit(), qk.shops, qk.shop(), qk.agents, qk.agent(), qk.activity],
  "shop.saved": [qk.onboarding, qk.shops, qk.shop(), qk.credit, qk.convertPreview, qk.home, qk.today, qk.activity, qk.adminVisits, qk.adminVisit(), qk.orders, qk.memos],
  "design.saved": [qk.onboarding, qk.designs, qk.catalog, qk.pieces, qk.piece()],
  "agent.saved": [qk.onboarding, qk.agents, qk.agent(), qk.home, qk.adminVisits, qk.shops, qk.shop(), qk.pieces],
  "webhook.changed": [qk.webhooks, qk.deliveries, qk.delivery(), qk.received, qk.home],
  // The approval threshold changes every prospective credit check and the shop credit rows.
  "settings.saved": [qk.settings, qk.credit, qk.convertPreview, qk.shops, qk.shop(), qk.me],
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
