"use client";
/** List state that must survive a hard refresh and back/forward lives in the URL (?q=&agent=&sort=…).
 *  Writes use history.replaceState, which Next.js (≥14.1) folds into useSearchParams without a
 *  navigation or a server round-trip, so typing in a search box stays instant and the list URL the
 *  user returns to (Back from a record) carries every filter. Default values are omitted from the URL. */
import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { SortingState } from "@tanstack/react-table";

function write(pathname: string, mutate: (p: URLSearchParams) => void) {
  const p = new URLSearchParams(window.location.search);
  mutate(p);
  const s = p.toString();
  const next = `${pathname}${s ? `?${s}` : ""}`;
  // Pass null, not history.state: Next ignores calls that carry its own internal state (__NA) and would
  // then not re-render useSearchParams; with null it copies its state and syncs the router.
  if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", next);
}

const LIST_KEY = (path: string) => `jr:list:${path}`;

/** One string param. `def` is what an absent param means (and is never written). */
export function useUrlState(key: string, def = ""): [string, (v: string) => void] {
  const sp = useSearchParams();
  const pathname = usePathname();
  const value = sp.get(key) ?? def;
  // Remember the list's full URL so a record's "← Orders" link returns to the same filters (per tab).
  const qs = sp.toString();
  React.useEffect(() => { try { sessionStorage.setItem(LIST_KEY(pathname), `${pathname}${qs ? `?${qs}` : ""}`); } catch { /* storage blocked */ } }, [pathname, qs]);
  const set = React.useCallback((v: string) => write(pathname, (p) => { if (v === def || v === "") p.delete(key); else p.set(key, v); }), [pathname, key, def]);
  return [value, set];
}

/** Set or clear several params at once (e.g. "Clear filters"). `null` removes a key. */
export function useUrlPatch() {
  const pathname = usePathname();
  return React.useCallback((patch: Record<string, string | null>) => write(pathname, (p) => {
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === "") p.delete(k); else p.set(k, v); }
  }), [pathname]);
}

/** Table sort as `?sort=created.desc` (one column, like Attio's "Sorted by"). */
export function useUrlSort(initial: SortingState, key = "sort"): [SortingState, (s: SortingState) => void] {
  const def = initial[0] ? `${initial[0].id}.${initial[0].desc ? "desc" : "asc"}` : "";
  const [raw, setRaw] = useUrlState(key, def);
  const sorting = React.useMemo<SortingState>(() => {
    const m = /^([\w-]+)\.(asc|desc)$/.exec(raw);
    return m ? [{ id: m[1], desc: m[2] === "desc" }] : [];
  }, [raw]);
  const set = React.useCallback((s: SortingState) => setRaw(s[0] ? `${s[0].id}.${s[0].desc ? "desc" : "asc"}` : "none"), [setRaw]);
  return [sorting, set];
}

/** The list URL last seen in this tab for `href` (with its filters), else `href` itself. */
export function useBackHref(href: string) {
  const [h, setH] = React.useState(href);
  React.useEffect(() => { try { const v = sessionStorage.getItem(LIST_KEY(href)); setH(v ?? href); } catch { setH(href); } }, [href]);
  return h;
}
