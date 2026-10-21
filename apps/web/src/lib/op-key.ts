"use client";
/** One Idempotency-Key per logical submit: the same key is reused when the same body is retried (a
 *  timeout, a double click that slipped through), a new one is minted when the body changes or after
 *  a success (`done()`), so the next submit is a new create. Same pattern as field/check-in-panel. */
import * as React from "react";
import { newOpKey } from "./api";

export function useOpKey() {
  const ref = React.useRef<{ sig: string; key: string } | null>(null);
  const keyFor = React.useCallback((body: unknown) => {
    const sig = JSON.stringify(body ?? null);
    if (!ref.current || ref.current.sig !== sig) ref.current = { sig, key: newOpKey() };
    return ref.current.key;
  }, []);
  const done = React.useCallback(() => { ref.current = null; }, []);
  return { keyFor, done };
}
