"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, ChevronRight, History } from "lucide-react";
import { formatINRCompact, istDate } from "@jewelroute/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ErrorState, FieldEmpty, PRESS_BTN, PRESS_ROW, Segmented, VisitDot } from "./bits";
import { dayLabel, plannedParts, plural } from "./format";
import { errorMessage, useFieldVisits } from "./queries";
import { PageBar } from "./top-bar";
import type { FieldVisitRow } from "./types";

type Scope = "recent" | "upcoming";

export function VisitsView() {
  // The tab lives in the URL so refresh, Back and a shared link keep it.
  const router = useRouter();
  const scope: Scope = useSearchParams().get("scope") === "upcoming" ? "upcoming" : "recent";
  const setScope = (s: Scope) => router.replace(s === "upcoming" ? "/field/visits?scope=upcoming" : "/field/visits", { scroll: false });
  const q = useFieldVisits(scope);
  const todayYmd = istDate();
  // "Recent" = today's whole route (any status) + the last 14 days, straight from the API.
  const rows: FieldVisitRow[] = q.data ?? [];
  const groups = groupByDay(rows);

  return (
    <Segmented label="Visits" value={scope} onChange={setScope}
      items={[{ value: "recent", label: "Recent" }, { value: "upcoming", label: "Upcoming" }]}
      wrap={(tabs) => <PageBar title="Visits" sub={tabs} />}>
      <main className="pb-6">
        {q.isPending ? (
          <div className="pt-4" aria-busy>
            <div className="px-4 pb-2"><Skeleton className="h-3.5 w-20" /></div>
            <div className="divide-y divide-line border-y border-line">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3"><div className="w-11 space-y-1.5"><Skeleton className="h-3.5 w-9" /><Skeleton className="h-3 w-5" /></div><div className="flex-1 space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-24" /></div><Skeleton className="h-3 w-16" /></div>
              ))}
            </div>
          </div>
        ) : q.isError ? (
          <ErrorState title="Couldn't load your visits" message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        ) : groups.length === 0 ? (
          <FieldEmpty icon={scope === "recent" ? History : CalendarClock}
            title={scope === "recent" ? "No visits today or in the last 14 days" : "Nothing planned for the next 7 days"}
            hint={scope === "recent" ? "Your route for today and visits from the last two weeks show up here." : "Your manager assigns shops. New assignments appear here."}
            action={scope === "recent" ? undefined : <Button asChild variant="outline" className={cn("h-11 px-4 text-[15px]", PRESS_BTN)}><Link href="/field/today">Back to today</Link></Button>} />
        ) : (
          groups.map(([day, list]) => (
            <section key={day} className="pt-5" aria-label={dayLabel(day, todayYmd)}>
              <div className="flex items-baseline justify-between px-4 pb-2">
                <h2 className="text-[13px] font-semibold text-ink">{dayLabel(day, todayYmd)}</h2>
                <span className="text-[12px] text-ink-3">{summary(list)}</span>
              </div>
              <ul className="border-y border-line">
                {list.map((v) => <Row key={v.id} v={v} />)}
              </ul>
            </section>
          ))
        )}
      </main>
    </Segmented>
  );
}

function groupByDay(rows: FieldVisitRow[]) {
  const m = new Map<string, FieldVisitRow[]>();
  for (const r of rows) m.set(r.plannedDate, [...(m.get(r.plannedDate) ?? []), r]);
  for (const l of m.values()) l.sort((a, b) => a.sequence - b.sequence);
  return [...m.entries()];
}

function summary(list: FieldVisitRow[]) {
  const done = list.filter((v) => v.status === "COMPLETED").length;
  return done ? `${done} of ${list.length} done` : plural(list.length, "visit");
}

function Row({ v }: { v: FieldVisitRow }) {
  const o = v.outcome;
  const orders = o?.orderCount ?? v.orderCount;
  const muted = v.status === "CANCELLED" || v.status === "MISSED";
  const p = plannedParts(v.plannedTime);
  const sim = v.proofState === "SIMULATED" || v.verification === "SIMULATED";
  return (
    <li className="border-b border-line last:border-b-0">
      <Link href={`/field/visits/${v.id}`} className={cn("flex min-h-[68px] items-center gap-3 px-4 py-2.5", PRESS_ROW)}>
        <span className="w-11 shrink-0 leading-tight">
          {p ? <><span className={cn("num block text-[14px] font-medium", muted ? "text-ink-3" : "text-ink")}>{p.t}</span><span className="block text-[12px] text-ink-3">{p.ap}</span></> : <span className="num text-[14px] text-ink">#{v.sequence}</span>}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-[15px] font-medium", muted ? "text-ink-2" : "text-ink")}>{v.shop.name}</p>
          <p className="mt-0.5 truncate text-[13px] text-ink-2">{v.shop.area}</p>
          {(orders > 0 || (o && o.memoCount > 0) || sim) && (
            <p className="mt-0.5 flex min-w-0 items-center gap-x-2.5 text-[12px] text-ink-3">
              {orders > 0 && <span className="shrink-0">{o?.orderValuePaise ? <><span className="num text-ink-2">{formatINRCompact(o.orderValuePaise)}</span> ordered</> : plural(orders, "order")}</span>}
              {o && o.memoCount > 0 && <span className="shrink-0">{plural(o.memoCount, "memo")} left</span>}
              {sim && <span className="shrink-0 text-info">Simulated</span>}
            </p>
          )}
        </div>
        <VisitDot status={v.status} className="shrink-0" />
        <ChevronRight className="size-4 shrink-0 text-ink-3" />
      </Link>
    </li>
  );
}
