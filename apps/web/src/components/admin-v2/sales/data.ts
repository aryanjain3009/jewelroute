"use client";
/** Sales (orders, memos, samples, catalog) data hooks — v2 endpoints from docs/CONTRACT.md only.
 *  Every query uses a `qk` key; every write goes through `useWrite` → `useSync()`. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { qk, useSync, type Change } from "@/lib/sync";
import type { TenantSettings, AgentListRow, Design, GoldRateRow, MemoRecord, MemoRow, Order, OrderRecord, Piece, PieceRecord, PieceRow } from "@/lib/types";

export function errMessage(e: unknown) {
  if (e instanceof ApiError && e.code === "ORDER_NOT_PENDING") {
    const d = (e.details ?? {}) as { status?: string };
    return `Nothing to decide — this order is ${d.status ? d.status.toLowerCase().replace(/_/g, " ") : "no longer pending"}.`;
  }
  if (e instanceof ApiError && e.code === "ORDER_ALREADY_DECIDED") {
    // The server re-reads the order after losing a race, so details carry the REAL status and decider.
    const d = (e.details ?? {}) as { status?: string; decidedBy?: { name?: string } };
    const verb = d.status === "APPROVED" ? "approved" : d.status === "REJECTED" ? "rejected" : "decided";
    return `Already ${verb}${d.decidedBy?.name ? ` by ${d.decidedBy.name}` : ""}.`;
  }
  return apiErrorText(e);
}

/** The API's message; for 400 VALIDATION_FAILED also which fields (details = [{path, message}]). */
export function apiErrorText(e: unknown) {
  if (e instanceof ApiError && e.code === "VALIDATION_FAILED" && Array.isArray(e.details) && e.details.length) {
    const fields = (e.details as { path?: string; message?: string }[]).map((d) => `${d.path || "request"}: ${d.message ?? "invalid"}`).slice(0, 3).join("; ");
    return `${e.message} — ${fields}`;
  }
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong. Try again.";
}

/* ---------------- queries ---------------- */
export const useOrders = () =>
  useQuery({ queryKey: [...qk.orders, "list"], queryFn: () => api<Order[]>("/admin/orders"), refetchInterval: 15_000 });

export const useOrderRecord = (id: string) =>
  useQuery({ queryKey: qk.order(id), queryFn: () => api<OrderRecord>(`/admin/orders/${id}`), refetchInterval: 15_000 });

/** v3 tenant settings (approval threshold). */
export const useSettings = () => useQuery({ queryKey: qk.settings, queryFn: () => api<TenantSettings>("/admin/settings"), staleTime: 30_000 });

export const useMemos = () =>
  useQuery({ queryKey: [...qk.memos, "all"], queryFn: () => api<MemoRow[]>("/admin/memos?filter=all"), refetchInterval: 20_000 });

export const useMemoRecord = (id: string | undefined, opts: { enabled?: boolean } = {}) =>
  useQuery({ queryKey: qk.memo(id ?? "none"), queryFn: () => api<MemoRecord>(`/admin/memos/${id}`), refetchInterval: 20_000, enabled: !!id && (opts.enabled ?? true) });

export const usePieces = () =>
  useQuery({ queryKey: [...qk.pieces, "rows"], queryFn: () => api<PieceRow[]>("/admin/pieces"), refetchInterval: 20_000 });

export const usePieceRecord = (id: string) =>
  useQuery({ queryKey: qk.piece(id), queryFn: () => api<PieceRecord>(`/admin/pieces/${id}`), refetchInterval: 20_000 });

export type AdminDesign = Design & { pieces: Piece[]; active?: boolean };
export const useDesigns = () => useQuery({ queryKey: qk.designs, queryFn: () => api<AdminDesign[]>("/admin/designs") });
export const useAgents = () => useQuery({ queryKey: qk.agents, queryFn: () => api<AgentListRow[]>("/admin/agents"), staleTime: 30_000 });
export interface GoldRates { current: GoldRateRow[]; history: GoldRateRow[] }
export const useGoldRates = () => useQuery({ queryKey: qk.goldRates, queryFn: () => api<GoldRates>("/admin/gold-rates"), staleTime: 30_000 });

/* ---------------- mutations ---------------- */
/** Every write: pending until the API answers, toast its message, then refetch every surface that can show the change. */
/** `quiet` suppresses the error toast — `true` always, or a predicate for errors the form shows inline. */
export function useWrite<V, R = unknown>(fn: (v: V) => Promise<R>, opts: { changes: Change[]; success?: string | ((r: R, v: V) => string); onSuccess?: (r: R, v: V) => void; quiet?: boolean | ((e: unknown, v: V) => boolean) }) {
  const sync = useSync();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => {
      sync(...opts.changes);
      if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(r, v) : opts.success);
      opts.onSuccess?.(r, v);
    },
    onError: (e, v) => {
      // A 409 means someone else changed this first: refetch so the screen shows what actually happened.
      if (e instanceof ApiError && e.status === 409) sync(...opts.changes);
      const quiet = typeof opts.quiet === "function" ? opts.quiet(e, v) : opts.quiet;
      if (!quiet) toast.error(errMessage(e));
    },
  });
}
