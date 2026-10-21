"use client";
import Link from "next/link";
import { useState } from "react";
import { CalendarClock, ChevronRight, History } from "lucide-react";
import { formatINRCompact, istDate } from "@jewelroute/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty } from "@/components/app/chrome";
import { cn } from "@/lib/utils";
import { ErrorState, VisitDot } from "./bits";
import { dayLabel, plannedParts, plural } from "./format";
import { errorMessage, useFieldVisits } from "./queries";
import { PageBar } from "./top-bar";
import type { FieldVisitRow } from "./types";

type Scope = "recent" | "upcoming";

export function VisitsView() {
  const [scope, setScope] = useState<Scope>("recent");
  const q = useFieldVisits(scope);
  const todayYmd = istDate();
  // "Recent" = today's whole route (any status) + the last 14 days, straight from the API.
  const rows: FieldVisitRow[] = q.data ?? [];
  const groups = groupByDay(rows);

  return (
    <>
      <PageBar title="Visits" sub={
        <div className="px-4 pb-2.5">
          <div className="grid grid-cols-2 rounded-lg bg-sunken p-0.5" role="tablist" aria-label="Visits">
            {(["recent", "upcoming"] as const).map((s) => (
              <button key={s} type="button" role="tab" aria-selected={scope === s} onClick={() => setScope(s)}
                className={cn("h-9 rounded-md text-[14px] font-medium transition-colors", scope === s ? "border border-line-strong bg-paper text-ink shadow-[0_1px_2px_rgb(0_0_0/0.04)]" : "text-ink-2")}>
                {s === "recent" ? "Recent" : "Upcoming"}
              </button>
            ))}
          </div>
        </div>
      } />
      <main className="pb-6">
        {q.isPending ? (
          <div className="space-y-px pt-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[64px] w-full" />)}</div>
        ) : q.isError ? (
          <ErrorState title="Couldn't load your visits" message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        ) : groups.length === 0 ? (
          <Empty icon={scope === "recent" ? History : CalendarClock}
            title={scope === "recent" ? "No visits today or in the last 14 days" : "Nothing planned for the next 7 days"}
            hint={scope === "recent" ? "Your route for today and visits from the last two weeks show up here." : "Your manager assigns shops. New assignments appear here."} />
        ) : (
          groups.map(([day, list]) => (
            <section key={day} className="pt-4">
              <div className="flex items-baseline justify-between px-4 pb-1.5">
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
    </>
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
  const muted = v.status === "CANCELLED";
  const p = plannedParts(v.plannedTime);
  return (
    <li className="border-b border-line last:border-b-0">
      <Link href={`/field/visits/${v.id}`} className="flex min-h-[64px] items-center gap-3 px-4 py-2.5 hover:bg-hover active:bg-sunken">
        <span className="w-11 shrink-0 leading-tight">
          {p ? <><span className="num block text-[14px] text-ink">{p.t}</span><span className="block text-[12px] text-ink-3">{p.ap}</span></> : <span className="num text-[14px] text-ink">#{v.sequence}</span>}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-[15px] font-medium", muted ? "text-ink-3" : "text-ink")}>{v.shop.name}</p>
          <p className="mt-0.5 flex min-w-0 gap-x-2.5 truncate text-[13px] text-ink-3">
            <span className="truncate text-ink-2">{v.shop.area}</span>
            {orders > 0 && <span className="shrink-0">{o?.orderValuePaise ? <><span className="num text-ink-2">{formatINRCompact(o.orderValuePaise)}</span> order</> : plural(orders, "order")}</span>}
            {o && o.memoCount > 0 && <span className="shrink-0 text-gold-ink">{plural(o.memoCount, "memo")}</span>}
          </p>
        </div>
        <VisitDot status={v.status} />
        <ChevronRight className="size-4 shrink-0 text-ink-3" />
      </Link>
    </li>
  );
}
