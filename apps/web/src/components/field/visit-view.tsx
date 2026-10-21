"use client";
import Link from "next/link";
import { Check, Phone } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ErrorState, MemoChip, VisitDot } from "./bits";
import { CheckInStage } from "./check-in-panel";
import { ProofCapture } from "./proof";
import { ArrivalLine, ClosedVisit, ShopContext, Workspace } from "./workspace";
import { errorMessage, useVisit } from "./queries";
import { fmtPlanned, fmtWeekday } from "./format";
import { PageBar } from "./top-bar";
import type { VisitDetail, VisitResume } from "./types";

/** One workspace for the whole visit. Every stage is derived from `GET /visits/:id`, so a reload at any
 *  point lands on the same step. */
export function VisitView({ id }: { id: string }) {
  const q = useVisit(id);
  const d = q.data;
  const s = d?.visit.status;
  const open = s === "CHECKED_IN" || s === "ACTIVE";
  const closed = s === "COMPLETED" || s === "MISSED" || s === "CANCELLED";
  const back = closed ? "/field/visits" : "/field/today";

  const bar = (
    <PageBar back={back} backLabel={closed ? "Visits" : "Today"} title={d?.shop.name ?? "Visit"}
      right={d?.shop.phone ? <a href={`tel:${d.shop.phone}`} aria-label={`Call ${d.shop.name}`} className="grid size-11 place-items-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink"><Phone className="size-[18px]" /></a> : null} />
  );

  if (q.isPending) return <>{bar}<VisitSkeleton /></>;
  if (q.isError) {
    const nf = q.error instanceof ApiError && (q.error.status === 404 || q.error.status === 403);
    return (
      <>
        {bar}
        <ErrorState title={nf ? "This visit isn't on your route" : "Couldn't load this visit"} message={nf ? "It may have been reassigned." : errorMessage(q.error)} onRetry={nf ? undefined : () => q.refetch()} />
        <div className="text-center"><Link href="/field/today" className="text-[14px] font-medium text-ink underline underline-offset-4">Back to today</Link></div>
      </>
    );
  }

  const data = d!;
  // Prefer the server's resume block; fall back to status + proofs for an older API.
  const step = data.resume?.nextStep ?? (s === "PLANNED" ? "CHECK_IN" : open && !data.proofs.length ? "UPLOAD_PROOF" : open ? "SELL_OR_COMPLETE" : "CLOSED");
  const stage = step === "CHECK_IN" ? 0 : step === "UPLOAD_PROOF" ? 1 : 2;
  const blocked = data.resume?.blockedBy;

  return (
    <>
      {bar}
      <main className="pb-6">
        <ShopHeader d={data} />
        {!closed && <Stages stage={stage} />}
        {blocked && <Blocked b={blocked} plannedDate={data.visit.plannedDate} />}

        {step === "CHECK_IN" && (
          <>
            <CheckInStage data={data} />
            <ShopContext d={data} />
          </>
        )}

        {step === "UPLOAD_PROOF" && (
          <>
            <ArrivalLine v={data.visit} />
            <div className="mt-4 px-4"><ProofCapture visitId={data.visit.id} existingChecksums={data.proofs.map((p) => p.checksumSha256)} /></div>
            <ShopContext d={data} />
          </>
        )}

        {step === "SELL_OR_COMPLETE" && <Workspace data={data} />}
        {(step === "DONE" || step === "CLOSED") && <ClosedVisit data={data} />}
      </main>
    </>
  );
}

function ShopHeader({ d }: { d: VisitDetail }) {
  const { shop, visit } = d;
  return (
    <header className="px-4 pb-3 pt-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <VisitDot status={visit.status} />
        {visit.plannedTime && <span className="num text-[13px] text-ink-3">Planned {fmtPlanned(visit.plannedTime)}</span>}
        <span className="text-[13px] text-ink-3">Stop {visit.sequence}</span>
      </div>
      <h2 className="mt-1.5 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink">{shop.name}</h2>
      <p className="mt-0.5 text-[14px] text-ink-2">{shop.ownerName ? `${shop.ownerName}, ` : ""}{shop.area}</p>
      <p className="text-[13px] text-ink-3">{shop.address}</p>
      {visit.activeMemoCount > 0 && <MemoChip count={visit.activeMemoCount} valuePaise={visit.activeMemoValuePaise} className="mt-2" />}
    </header>
  );
}

function Blocked({ b, plannedDate }: { b: NonNullable<VisitResume["blockedBy"]>; plannedDate: string }) {
  return (
    <div role="alert" className="mx-4 mb-3 rounded-xl border border-warn/20 bg-warn-soft px-4 py-3 text-[14px] text-ink">
      {b.code === "ANOTHER_VISIT_OPEN" ? (
        <>
          <p className="font-medium">Another visit is still open</p>
          <p className="mt-0.5 text-ink-2">Complete it before checking in here.</p>
          <Link href={`/field/visits/${b.visitId}`} className="mt-2 inline-flex h-10 items-center rounded-lg bg-ink px-3.5 text-[14px] font-medium text-white">Open that visit</Link>
        </>
      ) : (
        <>
          <p className="font-medium">Planned for {fmtWeekday(plannedDate)}</p>
          <p className="mt-0.5 text-ink-2">Check-in opens on the day of the visit.</p>
        </>
      )}
    </div>
  );
}

const STEPS = ["Check in", "Arrival photo", "Sell and complete"];
function Stages({ stage }: { stage: number }) {
  return (
    <ol className="mx-4 mb-4 grid grid-cols-3 gap-1.5" aria-label="Visit steps">
      {STEPS.map((label, i) => {
        const done = i < stage; const cur = i === stage;
        return (
          <li key={label} aria-current={cur ? "step" : undefined}>
            <span className={cn("block h-[3px] rounded-full", done ? "bg-verified" : cur ? "bg-ink" : "bg-line-strong")} />
            <span className={cn("mt-1.5 flex items-center gap-1 text-[12px]", cur ? "font-medium text-ink" : done ? "text-verified" : "text-ink-3")}>
              {done && <Check className="size-3" strokeWidth={3} />}{label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function VisitSkeleton() {
  return (
    <div className="space-y-3 px-4 pt-4">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-[220px] w-full rounded-xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
    </div>
  );
}

