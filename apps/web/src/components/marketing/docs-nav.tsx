"use client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const ITEMS = [
  ["auth", "Authentication"], ["idempotency", "Idempotency keys"], ["errors", "Errors"], ["endpoints", "Key endpoints"], ["paging", "Paging and batches"],
  ["events", "Webhook events"], ["payload", "Payload"], ["signatures", "Verifying signatures"], ["retries", "Retries and dead letters"], ["testing", "Testing"],
] as const;

/** Left nav with scroll-spy. Sticky on desktop, a horizontal scroller on phones. */
export function DocsNav() {
  const [active, setActive] = useState<string>("auth");
  useEffect(() => {
    const els = ITEMS.map(([id]) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActive(vis[0].target.id);
    }, { rootMargin: "-80px 0px -65% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return (
    <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
      <ul className="scrollbar-none -mx-5 flex gap-1 overflow-x-auto px-5 lg:mx-0 lg:flex-col lg:gap-0.5 lg:px-0">
        {ITEMS.map(([id, label]) => (
          <li key={id} className="shrink-0">
            <a href={`#${id}`} className={cn("block rounded-lg px-2.5 py-1.5 text-[13.5px] transition-colors", active === id ? "bg-surface font-medium text-ink ring-1 ring-line" : "text-ink-2 hover:text-ink")}>{label}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
