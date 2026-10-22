"use client";
import { useRef, useState } from "react";

/**
 * Radix tabs move focus on a pointer press in a way Chrome reports as :focus-visible, so a plain
 * `focus-visible:ring` leaves a ring after a tap. Spread these props on the tab list and style the ring
 * with `group-data-[kbd]/kbd:focus-visible:…` (list gets `group/kbd`): keyboard → ring, pointer → none.
 */
export function useKbdFocus() {
  const [kbd, setKbd] = useState(false);
  const lastPointer = useRef(0);
  return {
    "data-kbd": kbd || undefined,
    onKeyDown: () => setKbd(true),
    onPointerDown: () => { lastPointer.current = Date.now(); setKbd(false); },
    onFocusCapture: () => { if (Date.now() - lastPointer.current > 400) setKbd(true); },
  };
}
