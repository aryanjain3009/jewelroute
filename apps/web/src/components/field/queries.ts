"use client";
/** Field-agent server state. Keys come from `qk` in `lib/sync.ts` so `useSync()(change)` refreshes them
 *  together with the admin views. Never patch derived state locally: write, then sync, then render
 *  what the server answers. */
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { qk } from "@/lib/sync";
import type { CatalogResponse, FieldVisitRow, ProfileResponse, TodayResponse, VisitDetail } from "./types";

export function useToday() {
  return useQuery({ queryKey: qk.today, queryFn: () => api<TodayResponse>("/field/today"), refetchOnWindowFocus: true, refetchInterval: 60_000 });
}

export function useVisit(id: string, opts: { refetchInterval?: number | false } = {}) {
  return useQuery({ queryKey: qk.visit(id), queryFn: () => api<VisitDetail>(`/visits/${id}`), refetchOnWindowFocus: true, ...opts });
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
