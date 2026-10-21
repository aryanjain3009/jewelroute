"use client";
import Link from "next/link";
import { LogOut, Package } from "lucide-react";
import { formatGrams, formatINR, formatINRCompact } from "@jewelroute/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, Empty } from "@/components/app/chrome";
import { PurityTag } from "@/components/jr/money";
import { MemoStatusPill } from "@/components/jr/status";
import { useMe, logout } from "@/lib/session";
import { cn } from "@/lib/utils";
import { ErrorState, SectionTitle, Thumb } from "./bits";
import { fmtDay, fmtDue, plural } from "./format";
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

  return (
    <>
      <PageBar title="Profile" />
      {q.isPending ? (
        <div className="space-y-3 px-4 pt-5"><Skeleton className="h-12 w-56" /><Skeleton className="h-20 w-full rounded-xl" /><Skeleton className="h-64 w-full rounded-xl" /></div>
      ) : q.isError ? (
        <ErrorState title="Couldn't load your profile" message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <main className="pb-8">
          <section className="flex items-center gap-3 px-4 pt-5">
            <Avatar name={d!.user.name} size={44} />
            <div className="min-w-0">
              <p className="truncate text-[18px] font-semibold text-ink">{d!.user.name}</p>
              <p className="truncate text-[13px] text-ink-2">Field agent{me.data?.tenant.name ? `, ${me.data.tenant.name}` : ""}{d!.user.homeArea ? `, ${d!.user.homeArea}` : ""}</p>
            </div>
          </section>
          <dl className="mx-4 mt-4 divide-y divide-line border-y border-line text-[14px]">
            <div className="flex justify-between gap-3 py-2.5"><dt className="text-ink-2">Email</dt><dd className="truncate text-ink">{d!.user.email}</dd></div>
            {d!.user.phone && <div className="flex justify-between gap-3 py-2.5"><dt className="text-ink-2">Phone</dt><dd className="num text-ink">{d!.user.phone}</dd></div>}
          </dl>

          <SectionTitle className="mt-7" aside="Last 7 days">This week</SectionTitle>
          <div className="mx-4 mt-2 grid grid-cols-3 divide-x divide-line rounded-xl border border-line">
            <Stat label="Visits done" value={String(d!.week.visitsCompleted)} />
            <Stat label="Orders booked" value={formatINRCompact(d!.week.ordersValuePaise)} />
            <Stat label="Memos open" value={String(d!.week.memosOpen)} gold={d!.week.memosOpen > 0} />
          </div>

          <SectionTitle className="mt-7" aside={totals ? <><span className="num font-medium text-gold-ink">{formatINRCompact(totals.bag.valuePaise)}</span> at today’s rate</> : undefined}>
            In your bag <span className="num font-normal text-ink-3">{d!.bag.length}</span>
          </SectionTitle>
          {d!.bag.length === 0 ? (
            <Empty icon={Package} title="Your bag is empty" hint="Pieces issued to you from the vault show up here." />
          ) : (
            <ul className="mt-2 border-y border-line">
              {d!.bag.map((p) => (
                <li key={p.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                  <Thumb src={p.imageUrl} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-ink">{p.name}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-[12px] text-ink-3">
                      <span className="num font-medium text-ink-2">{p.tagCode}</span><PurityTag purity={p.purity} /><span className="num">{formatGrams(p.netWeightMg)}</span>
                    </p>
                  </div>
                  <span className="num shrink-0 text-[14px] font-medium text-gold-ink">{formatINR(p.valuePaise)}</span>
                </li>
              ))}
            </ul>
          )}

          <SectionTitle className="mt-7" aside={d!.activeMemos.length && totals ? <span className="num">{formatINRCompact(totals.activeMemos.valuePaise)} outstanding</span> : undefined}>
            Open memos <span className="num font-normal text-ink-3">{d!.activeMemos.length}</span>
          </SectionTitle>
          {d!.activeMemos.length === 0 ? (
            <p className="px-4 pt-2 text-[14px] text-ink-2">No samples out on memo.</p>
          ) : (
            <ul className="mt-2 border-y border-line">
              {d!.activeMemos.map((m) => {
                const out = m.items.filter((i) => i.status === "OUT").length;
                const inner = (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-ink">{m.shop.name}</p>
                      <p className="mt-0.5 text-[12px] text-ink-3"><span className="num">{m.number}</span>, {plural(out, "piece")} out</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="num text-[14px] font-medium text-gold-ink">{formatINRCompact(m.outstandingValuePaise)}</p>
                      <p className={cn("text-[12px]", m.daysToDue < 0 ? "text-danger" : m.daysToDue <= 2 ? "text-warn" : "text-ink-3")}>{fmtDue(m.daysToDue)}, {fmtDay(m.dueDate)}</p>
                    </div>
                  </>
                );
                return (
                  <li key={m.id} className="border-b border-line last:border-b-0">
                    {m.visitId
                      ? <Link href={`/field/visits/${m.visitId}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-hover">{inner}</Link>
                      : <div className="flex items-center gap-3 px-4 py-2.5">{inner}</div>}
                  </li>
                );
              })}
            </ul>
          )}
          {d!.activeMemos.some((m) => m.displayStatus === "OVERDUE") && (
            <div className="px-4 pt-2"><MemoStatusPill status="OVERDUE" /> <span className="text-[13px] text-ink-2">Collect or extend at your next visit to the shop.</span></div>
          )}

          <div className="px-4 pt-10">
            <Button variant="outline" className="h-11 w-full text-[15px] text-danger hover:text-danger" disabled={signingOut} onClick={() => run(() => logout())}>
              <LogOut />Sign out
            </Button>
          </div>
        </main>
      )}
    </>
  );
}

function Stat({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="px-3 py-3">
      <p className="text-[12px] text-ink-2">{label}</p>
      <p className={cn("num mt-0.5 text-[18px] font-semibold tracking-[-0.01em]", gold ? "text-gold-ink" : "text-ink")}>{value}</p>
    </div>
  );
}
