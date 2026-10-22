import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

/** Clipboard writes are refused over plain http, without permission or without focus. Resolve to whether it
 *  worked, so callers never show "Copied" for a copy that failed and never leak an unhandled rejection. */
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
