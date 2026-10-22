"use client";
/** First-run checklist on Home for a new workspace. Every tick comes from the API (`/admin/onboarding`
 *  counts real rows); the card disappears once all six are done. Steps link to the screen that does them. */
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CheckIcon } from "lucide-react";
import { api } from "@/lib/api";
import { qk } from "@/lib/sync";
import { cn } from "@/lib/utils";

type StepKey = "gold_rate" | "catalog" | "shop" | "agent" | "issue" | "visit";
interface Onboarding { steps: { key: StepKey; done: boolean }[]; complete: boolean }

const COPY: Record<StepKey, { title: string; hint: string; cta: string; href?: string }> = {
  gold_rate: { title: "Set today's gold rate", hint: "Prices and memo values are worked out from it.", cta: "Set rate", href: "/admin/settings?tab=gold-rate" },
  catalog: { title: "Add a design and tag its sample pieces", hint: "Each tagged piece goes into the vault with its own custody ledger.", cta: "New design", href: "/admin/catalog?new=1" },
  shop: { title: "Add a retailer shop", hint: "Its location sets the check-in geofence; add a credit limit if you use one.", cta: "New shop", href: "/admin/shops?new=1" },
  agent: { title: "Create a field agent", hint: "They sign in on their phone with the email and password you set.", cta: "New agent", href: "/admin/agents?new=1" },
  issue: { title: "Issue sample pieces to the agent", hint: "Select pieces in the vault, then Issue to agent.", cta: "Open samples", href: "/admin/samples" },
  visit: { title: "Plan their first visit", hint: "It appears on the agent's Today screen.", cta: "Assign visit" },
};

export function useOnboarding() {
  return useQuery({ queryKey: qk.onboarding, queryFn: () => api<Onboarding>("/admin/onboarding"), staleTime: 30_000 });
}

export function OnboardingChecklist({ onAssignVisit }: { onAssignVisit: () => void }) {
  const q = useOnboarding();
  if (!q.data || q.data.complete) return null;
  const steps = q.data.steps;
  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done)?.key;
  return (
    <section aria-labelledby="onboarding-title" className="mb-8 overflow-hidden rounded-[10px] border border-line bg-white">
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3">
        <h2 id="onboarding-title" className="text-[14px] font-semibold text-ink">Set up your workspace</h2>
        <span className="text-[13px] text-ink-2">{doneCount} of {steps.length} done</span>
      </div>
      <ol>
        {steps.map((s, i) => {
          const c = COPY[s.key];
          const isNext = s.key === next;
          return (
            <li key={s.key} className={cn("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-line")}>
              <span aria-hidden className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border text-[12px] font-medium", s.done ? "border-verified bg-verified text-white" : "border-line-strong text-ink-2")}>
                {s.done ? <CheckIcon className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-[14px]", s.done ? "text-ink-3 line-through decoration-ink-3/60" : "font-medium text-ink")}>
                  {c.title}<span className="sr-only">{s.done ? " (done)" : ""}</span>
                </p>
                {!s.done && <p className="text-[13px] text-ink-2">{c.hint}</p>}
              </div>
              {!s.done && (c.href
                ? <Link href={c.href} className={cn("press inline-flex h-8 shrink-0 items-center rounded-lg border px-3 text-[13px] font-medium", isNext ? "border-ink bg-ink text-white hover:bg-ink/90" : "border-line-strong bg-white text-ink hover:bg-hover")}>{c.cta}</Link>
                : <button type="button" onClick={onAssignVisit} className={cn("press inline-flex h-8 shrink-0 items-center rounded-lg border px-3 text-[13px] font-medium", isNext ? "border-ink bg-ink text-white hover:bg-ink/90" : "border-line-strong bg-white text-ink hover:bg-hover")}>{c.cta}</button>)}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
