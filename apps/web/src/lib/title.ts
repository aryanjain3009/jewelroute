"use client";
import { useEffect } from "react";

/** Record pages are client components, so their static `metadata` title can only name the object type
 *  ("Order"). Once the record has loaded, this names the record itself ("ORD-2026-00039 · JewelRoute"),
 *  on direct load and after client navigation. Next streams route metadata and may write the route's
 *  <title> after this effect, so while the page is mounted the record title is re-applied whenever the
 *  document title changes; on unmount the observer stops and the next route's metadata takes over. */
export function useDocTitle(title?: string | null) {
  useEffect(() => {
    if (!title) return;
    const next = `${title} · JewelRoute`;
    const path = window.location.pathname;
    // Only on this record's URL: during a client navigation away, the next route's title must win.
    const apply = () => { if (window.location.pathname === path && document.title !== next) document.title = next; };
    apply();
    const obs = new MutationObserver(apply);
    obs.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
    return () => obs.disconnect();
  }, [title]);
}
