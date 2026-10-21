"use client";
/** Read hooks for the Field surfaces (Home, Shops, Visits record, Agents) — v2 endpoints from
 *  docs/CONTRACT.md only, one call per screen. Keys come from `qk` (lib/sync.ts). */
import { useQuery } from "@tanstack/react-query";
import { istDate } from "@jewelroute/shared";
import { api } from "@/lib/api";
import { qk } from "@/lib/sync";
import type { ActivityItem, AdminHome, AdminVisitRecord, AdminVisitRow, AgentListRow, AgentRecord, AuditRow, ShopRecord, ShopRow } from "@/lib/types";

const qs = (o: Record<string, string | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
};

/** A visit row as the Field pages use it (the API's AdminVisitRow). */
export type VRow = AdminVisitRow;

/* ------------------------------------------------------------------ Home */
export function useHome(date?: string) {
  const d = date ?? istDate();
  return useQuery({ queryKey: [...qk.home, d], refetchInterval: 10_000, queryFn: () => api<AdminHome>(`/admin/home${qs({ date })}`) });
}

/** Visit rows for a day / agent / shop (live feed + agent progress). */
export function useVisitRows(f: { date?: string; agentId?: string; shopId?: string } = {}, opts: { enabled?: boolean; refetch?: number } = {}) {
  return useQuery({
    queryKey: [...qk.adminVisits, f],
    enabled: opts.enabled ?? true,
    refetchInterval: opts.refetch ?? 15_000,
    queryFn: () => api<VRow[]>(`/admin/visits${qs(f)}`),
  });
}

/* ------------------------------------------------------------------ Shops */
export function useShops() {
  return useQuery({ queryKey: [...qk.shops, "rows"], refetchInterval: 30_000, queryFn: () => api<ShopRow[]>("/admin/shops") });
}

export type ShopRec = ShopRecord;
export type AgentRec = AgentRecord;
export function useShopRecord(id: string) {
  return useQuery({ queryKey: qk.shop(id), refetchInterval: 15_000, queryFn: () => api<ShopRec>(`/admin/shops/${id}`) });
}

/* ------------------------------------------------------------------ Visit record */
export type VisitRec = AdminVisitRecord & { row: VRow; audit: AuditRow[]; activity: ActivityItem[] };
export function useVisitRecord(id: string) {
  return useQuery({ queryKey: qk.adminVisit(id), refetchInterval: 15_000, queryFn: () => api<VisitRec>(`/admin/visits/${id}`) });
}

/* ------------------------------------------------------------------ Agents */
export type AgentRow = AgentListRow;
/** v2 agents list — the one row per agent (route progress, current visit, bag, memos, orders today). */
export function useAgentRows() {
  return useQuery({ queryKey: qk.agents, refetchInterval: 15_000, queryFn: () => api<AgentRow[]>("/admin/agents") });
}

export function useAgentRecord(id: string) {
  return useQuery({ queryKey: qk.agent(id), refetchInterval: 15_000, queryFn: () => api<AgentRec>(`/admin/agents/${id}`) });
}

/** Agent options for selects — same key and response as the agents list. */
export function useAgentOptions() {
  return useQuery({ queryKey: qk.agents, queryFn: () => api<AgentListRow[]>("/admin/agents"), staleTime: 30_000 });
}
