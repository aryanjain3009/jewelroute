"use client";
/** Small client-side safety nets for one-handed use on a flaky network:
 *  - `useGuard`: a primary action runs at most once at a time (a second tap is ignored even within
 *    the same frame, before React re-renders the disabled state).
 *  - `session`: sessionStorage that never throws (private mode, quota, SSR).
 *  - `opKey`: one Idempotency-Key per logical action, persisted per visit so a retry — even after a
 *    refresh — replays the original request instead of creating a duplicate. */
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, newOpKey } from "@/lib/api";

export function useGuard() {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (inFlight.current) return undefined;
    inFlight.current = true; setPending(true);
    try { return await fn(); } finally { inFlight.current = false; setPending(false); }
  }, []);
  return [run, pending] as const;
}

export const session = {
  get<T>(k: string): T | null {
    try { const s = sessionStorage.getItem(k); return s ? (JSON.parse(s) as T) : null; } catch { return null; }
  },
  set(k: string, v: unknown) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* quota or disabled */ } },
  del(k: string) { try { sessionStorage.removeItem(k); } catch { /* disabled */ } },
};

/** Same `sig` (the request body) → same key, across retries and reloads. A changed body gets a new key. */
export const opKey = {
  for(scope: string, sig: string): string {
    const k = `jr:op:${scope}`;
    const cur = session.get<{ sig: string; key: string }>(k);
    if (cur && cur.sig === sig) return cur.key;
    const key = newOpKey();
    session.set(k, { sig, key });
    return key;
  },
  clear(scope: string) { session.del(`jr:op:${scope}`); },
};

/** useState mirrored into sessionStorage. Reads after mount (SSR-safe); `ready` turns true once restored. */
export function useSessionState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const v = session.get<T>(key);
    if (v !== null) setValue(v);
    setReady(true);
  }, [key]);
  useEffect(() => { if (ready) session.set(key, value); }, [key, value, ready]);
  return [value, setValue, ready] as const;
}

/** A failure that says nothing about whether the server committed: no response (network), a 5xx, or the
 *  same key still being processed. A 4xx with a business code is a definite "no". */
export function isUnconfirmed(e: unknown) {
  if (!(e instanceof ApiError)) return true;
  return e.status >= 500 || e.code === "IDEMPOTENCY_IN_PROGRESS" || e.code === "IDEMPOTENCY_RETRY";
}

/** Thrown when the outcome is still unknown after the automatic re-check. Never means "nothing happened". */
export class UnconfirmedError extends Error {
  constructor(public cause: unknown) { super("unconfirmed"); }
}

/**
 * Send a create whose Idempotency-Key is fixed by the caller. If the answer is lost, never guess: call
 * `onChecking`, then send the SAME request again (the server replays what it committed, or does the work
 * once if it never got it). A definite answer (success or a 4xx) is returned/thrown as usual; if it is
 * still unknown, an `UnconfirmedError` is thrown so the UI keeps the draft and offers Retry with that key.
 */
export async function sendConfirmed<T>(send: () => Promise<T>, onChecking: () => void, waitMs = 900): Promise<T> {
  try {
    return await send();
  } catch (e) {
    if (!isUnconfirmed(e)) throw e;
    onChecking();
  }
  let last: unknown;
  for (let i = 0; i < 2; i++) { // one re-send; one more only if the key is still "in progress"
    await new Promise((r) => setTimeout(r, waitMs * (i + 1)));
    try {
      return await send();
    } catch (e) {
      if (!isUnconfirmed(e)) throw e;
      last = e;
      if (!(e instanceof ApiError && e.code === "IDEMPOTENCY_IN_PROGRESS")) break;
    }
  }
  throw new UnconfirmedError(last);
}
