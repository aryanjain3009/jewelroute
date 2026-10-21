"use client";
/** Field-agent server state. Keys come from `qk` in `lib/sync.ts` so `useSync()(change)` refreshes them
 *  together with the admin views. Never patch derived state locally: write, then sync, then render
 *  what the server answers. */
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { POLL, qk, useSync } from "@/lib/sync";
import type { CreditPosition } from "@/lib/types";
import type { CatalogResponse, FieldVisitRow, ProfileResponse, TodayResponse, VisitDetail } from "./types";

export function useToday() {
  // Polls so the manager's changes (assignments, decisions, memo extensions, rates) reach an open Today screen.
  return useQuery({ queryKey: qk.today, queryFn: () => api<TodayResponse>("/field/today"), refetchOnWindowFocus: true, refetchInterval: POLL.today });
}

/** Orders on this visit payload still waiting for the manager (this visit's and the shop's recent ones). */
export const pendingDecisions = (d?: VisitDetail) =>
  d ? [...d.orders, ...d.shopContext.previousOrders].filter((o) => o.status === "PENDING_APPROVAL" || o.status === "SUBMITTED") : [];

/** A visit polls while one of its orders waits for a decision (POLL.pendingDecision), so an approval or a
 *  rejection — with its reason — reaches an agent who keeps the screen open. When a decision lands, every
 *  screen it affects refreshes through the same `AFFECTS` rows as an admin decision (`order.decided`, plus
 *  `order.unsold` when a rejected sale went back on a memo). */
export function useVisit(id: string, opts: { refetchInterval?: number | false } = {}) {
  const sync = useSync();
  const q = useQuery({
    queryKey: qk.visit(id),
    queryFn: () => api<VisitDetail>(`/visits/${id}`),
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const a = pendingDecisions(query.state.data).length ? POLL.pendingDecision : false;
      const b = opts.refetchInterval ?? false;
      return a && b ? Math.min(a, b) : a || b;
    },
    refetchIntervalInBackground: false,
  });
  const waiting = useRef<Map<string, boolean>>(new Map());
  useEffect(() => {
    const d = q.data;
    if (!d) return;
    const before = waiting.current;
    const all = [...d.orders, ...d.shopContext.previousOrders];
    const decided = all.filter((o) => before.get(o.id) && o.status !== "PENDING_APPROVAL" && o.status !== "SUBMITTED");
    waiting.current = new Map(all.map((o) => [o.id, o.status === "PENDING_APPROVAL" || o.status === "SUBMITTED"]));
    if (decided.length) sync("order.decided", ...(decided.some((o) => o.status === "REJECTED" && o.sourceMemoId) ? (["order.unsold"] as const) : []));
  }, [q.data, sync]);
  return q;
}

/** The shop's live credit position on an open visit (outstanding, memo exposure, available credit). Same
 *  `qk.credit` prefix as the order review, so every order/memo/return change refreshes it (AFFECTS). The
 *  server answers only for CHECKED_IN/ACTIVE visits. */
export function useVisitCredit(visitId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...qk.credit, "visit", visitId, 0],
    queryFn: () => api<CreditPosition>(`/visits/${visitId}/credit`),
    enabled,
    staleTime: 10_000,
    retry: 1,
  });
}

export function useFieldVisits(scope: "recent" | "upcoming") {
  return useQuery({ queryKey: [...qk.fieldVisits, scope], queryFn: () => api<FieldVisitRow[]>(`/field/visits?scope=${scope}`) });
}

export function useProfile() {
  return useQuery({ queryKey: qk.profile, queryFn: () => api<ProfileResponse>("/field/profile") });
}

export interface CatalogFilters { q?: string; category?: string; collection?: string; purity?: string; minWeightMg?: number; maxWeightMg?: number }
/** Inside a visit (`visitId`) the catalog carries `availablePieces` for this agent; standalone it is browse-only. */
export function useCatalog(visitId: string | null, f: CatalogFilters = {}) {
  const qs = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => { if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v)); });
  const path = visitId ? `/visits/${visitId}/catalog` : "/field/catalog";
  return useQuery({
    queryKey: [...qk.catalog, visitId ?? "browse", Object.fromEntries(qs)],
    queryFn: () => api<CatalogResponse>(`${path}${qs.size ? `?${qs}` : ""}`),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

/** Server codes whose message is written for the agent here, not taken from the API text. */
const FIELD_MESSAGES: Record<string, string> = {
  PROOF_REQUIRED_BEFORE_SALE: "Add the arrival photo on this visit first. Orders, memos and returns unlock once it's uploaded. Nothing was recorded.",
};

export function errorMessage(e: unknown, fallback = "Something went wrong. Try again.") {
  if (e instanceof ApiError && FIELD_MESSAGES[e.code]) return FIELD_MESSAGES[e.code];
  if (e instanceof ApiError) return e.status >= 500 ? `${fallback}` : e.message || fallback;
  if (e instanceof Error && e.message) return /fetch|network/i.test(e.message) ? "No connection. Check your network and try again." : e.message;
  return fallback;
}
