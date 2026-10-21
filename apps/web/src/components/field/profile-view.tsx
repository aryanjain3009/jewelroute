"use client";
import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronRight, LogOut, Package } from "lucide-react";
import { formatGrams, formatINR, formatINRCompact } from "@jewelroute/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/app/chrome";
import { PurityTag } from "@/components/jr/money";
import { useMe, logout } from "@/lib/session";
import { cn } from "@/lib/utils";
import { ErrorState, FieldEmpty, PRESS_BTN, PRESS_ROW, SectionTitle, Thumb } from "./bits";
import { fmtDue, plural } from "./format";
import { errorMessage, useProfile, useToday } from "./queries";
import { useGuard } from "./guard";
import { PageBar } from "./top-bar";

export function ProfileView() {
  const q = useProfile();
  const me = useMe();
  const [run, signingOut] = useGuard();
  const today = useToday(); // server aggregates for the bag and memo totals
  const d = q.data;
  const totals = today.data;

  const [allBag, setAllBag] = useState(false);

  return (
    <>
      <PageBar title="Profile" />
      {q.isPending ? (
        <div className="px-4 pt-5" aria-busy>
          <div className="flex items-center gap-3"><Skeleton className="size-12 rounded-full" /><div className="space-y-2"><Skeleton className="h-5 w-40" /><Skeleton className="h-3.5 w-52" /></div></div>
          <Skeleton className="mt-6 h-[76px] w-full rounded-xl" />
          <Skeleton className="mt-6 h-64 w-full rounded-xl" />
        </div>
      ) : q.isError ? (
        <ErrorState title="Couldn't load your profile" message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <main className="pb-8">
          <section className="flex items-center gap-3 px-4 pt-5">
            <Avatar name={d!.user.name} size={48} />
            <div className="min-w-0">
              <p className="truncate text-[19px] font-semibold tracking-[-0.01em] text-ink">{d!.user.name}</p>
              <p className="truncate text-[13px] text-ink-2">{["Field agent", me.data?.tenant.name, d!.user.homeArea].filter(Boolean).join(", ")}</p>
            </div>
          </section>
          <dl className="mx-4 mt-4 divide-y divide-line border-y border-line text-[14px]">
            <div className="flex min-h-11 items-center justify-between gap-3"><dt className="text-ink-2">Email</dt><dd className="min-w-0 truncate text-ink">{d!.user.email}</dd></div>
            {d!.user.phone && <div className="flex min-h-11 items-center justify-between gap-3"><dt className="text-ink-2">Phone</dt><dd className="num text-ink">{d!.user.phone}</dd></div>}
          </dl>

          <SectionTitle className="mt-7" aside="Last 7 days">This week</SectionTitle>
          <dl className="mx-4 mt-2 grid grid-cols-3 divide-x divide-line rounded-xl border border-line">
            <Stat label="Visits done" value={String(d!.week.visitsCompleted)} />
            <Stat label="Orders booked" value={d!.week.ordersValuePaise ? formatINRCompact(d!.week.ordersValuePaise) : "None"} muted={!d!.week.ordersValuePaise} />
            <Stat label="Memos open" value={String(d!.week.memosOpen)} />
          </dl>

          <SectionTitle className="mt-8" aside={totals && d!.bag.length ? <><span className="num font-medium text-gold-ink">{formatINRCompact(totals.bag.valuePaise)}</span> at today’s rate</> : undefined}>
            In your bag <span className="num ml-1 font-normal text-ink-3">{d!.bag.length}</span>
          </SectionTitle>
          {d!.bag.length === 0 ? (
            <FieldEmpty icon={Package} className="mx-4 mt-2 rounded-xl border border-line py-10" title="Your bag is empty" hint="Pieces the office issues to you from the vault show up here, with their tag and value." />
          ) : (
            <ul className="mt-2 border-y border-line">
              {(allBag ? d!.bag : d!.bag.slice(0, 4)).map((p) => (
                <li key={p.id} className="flex min-h-[64px] items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                  <Thumb src={p.imageUrl} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-ink">{p.name}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-[12px] text-ink-3">
                      <span className="num font-medium text-ink-2">{p.tagCode}</span><PurityTag purity={p.purity} className="h-[18px] px-1 text-[10.5px]" /><span className="num">{formatGrams(p.netWeightMg)}</span>
                    </p>
                  </div>
                  <span className="num shrink-0 text-[14px] font-medium text-gold-ink">{formatINR(p.valuePaise)}</span>
                </li>
              ))}
              {d!.bag.length > 4 && (
                <li>
                  <button type="button" onClick={() => setAllBag((v) => !v)} aria-expanded={allBag}
                    className={cn("flex min-h-11 w-full items-center justify-center gap-1.5 text-[14px] font-medium text-ink-2", PRESS_ROW)}>
                    {allBag ? "Show fewer" : `Show all ${d!.bag.length} pieces`}<ChevronDown className={cn("size-4 transition-transform duration-200", allBag && "rotate-180")} />
                  </button>
                </li>
              )}
            </ul>
          )}

          <SectionTitle id="memos" className="mt-8 scroll-mt-16" aside={d!.activeMemos.length && totals ? <><span className="num">{formatINRCompact(totals.activeMemos.valuePaise)}</span> outstanding</> : undefined}>
            Open memos <span className="num ml-1 font-normal text-ink-3">{d!.activeMemos.length}</span>
          </SectionTitle>
          {d!.activeMemos.length === 0 ? (
            <p className="px-4 pt-2 text-[14px] text-ink-3">No samples out on memo.</p>
          ) : (
            <ul className="mt-2 border-y border-line">
              {d!.activeMemos.map((m) => {
                const out = m.items.filter((i) => i.status === "OUT").length;
                const inner = (
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-[14px] font-medium text-ink">{m.shop.name}</p>
                      <p className="num shrink-0 text-[14px] font-medium text-gold-ink">{formatINRCompact(m.outstandingValuePaise)}</p>
                    </div>
                    <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[12px]">
                      <p className="truncate text-ink-3"><span className="num">{m.number}</span>, {plural(out, "piece")}</p>
                      <p className={cn("shrink-0", m.daysToDue < 0 ? "font-medium text-danger" : m.daysToDue <= 2 ? "text-warn" : "text-ink-3")}>{fmtDue(m.daysToDue)}</p>
                    </div>
                  </div>
                );
                return (
                  <li key={m.id} className="border-b border-line last:border-b-0">
                    {m.visitId
                      ? <Link href={`/field/visits/${m.visitId}`} className={cn("flex min-h-[60px] items-center gap-3 px-4 py-2.5", PRESS_ROW)}>{inner}<ChevronRight className="size-4 shrink-0 text-ink-3" /></Link>
                      : <div className="flex min-h-[60px] items-center gap-3 px-4 py-2.5">{inner}</div>}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="px-4 pt-10">
            <Button variant="outline" className={cn("h-12 w-full text-[15px] text-danger hover:text-danger", PRESS_BTN)} disabled={signingOut} onClick={() => run(() => logout())}>
              <LogOut />Sign out
            </Button>
          </div>
        </main>
      )}
    </>
  );
}

function Stat({ label, value, gold, muted }: { label: string; value: string; gold?: boolean; muted?: boolean }) {
  return (
    <div className="min-w-0 px-3 py-3">
      <dt className="truncate text-[12px] text-ink-2">{label}</dt>
      <dd className={cn("num mt-0.5 truncate text-[18px] font-semibold tracking-[-0.01em]", muted ? "font-normal text-ink-3" : gold ? "text-gold-ink" : "text-ink")}>{value}</dd>
    </div>
  );
}
