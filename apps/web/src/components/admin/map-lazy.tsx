"use client";
/** MapLibre is ~300 kB: load it only when a map is actually on screen. */
import dynamic from "next/dynamic";
export const JrMap = dynamic(() => import("@/components/jr/map").then((m) => m.JrMap), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-sunken" />,
});
