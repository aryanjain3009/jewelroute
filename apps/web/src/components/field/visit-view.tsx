"use client";
import Link from "next/link";
import { Check, Phone, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ErrorState, Notice, PRESS_BTN, VisitChip } from "./bits";
import { CheckInStage } from "./check-in-panel";
import { ProofCapture } from "./proof";
import { ArrivalLine, ClosedVisit, ShopContext, Workspace } from "./workspace";
import { errorMessage, useVisit } from "./queries";
import { fmtPlanned, fmtTime, fmtWeekday } from "./format";
import { BottomSpacer, PageBar } from "./top-bar";
import type { VisitDetail, VisitResume } from "./types";
import { useDocTitle } from "@/lib/title";

/** One workspace for the whole visit. Every stage is derived from `GET /visits/:id`, so a reload at any
 *  point lands on the same step. */
export function VisitView({ id }: { id: string }) {
  const q = useVisit(id);
  useDocTitle(q.data?.shop.name);
  const d = q.data;
  const s = d?.visit.status;
  const open = s === "CHECKED_IN" || s === "ACTIVE";
  const closed = s === "COMPLETED" || s === "MISSED" || s === "CANCELLED";
  const back = closed ? "/field/visits" : "/field/today";

  const bar = (
    <PageBar back={back} backLabel={closed ? "Visits" : "Today"} title={d ? `Stop ${d.visit.sequence}` : "Visit"}
      right={d?.shop.phone ? <a href={`tel:${d.shop.phone}`} aria-label={`Call ${d.shop.name}`} className="grid size-11 place-items-center rounded-lg text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink active:bg-sunken"><Phone className="size-[18px]" /></a> : null} />
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
        {!closed && stage < 2 && <Stages stage={stage} />}
        {blocked && <Blocked b={blocked} plannedDate={data.visit.plannedDate} />}

        {step === "CHECK_IN" && (
          <>
            <CheckInStage data={data} />
            <ShopContext d={data} />
            {/* Clears the sticky check-in bar (helper line, button, simulated-arrival link). */}
            <BottomSpacer h={176} />
          </>
        )}

        {step === "UPLOAD_PROOF" && (
          <>
            <ArrivalLine v={data.visit} />
            <div className="mt-3 px-4"><ProofCapture visitId={data.visit.id} existingChecksums={data.proofs.map((p) => p.checksumSha256)} /></div>
            <ShopContext d={data} />
            <BottomSpacer h={184} />
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
  const open = visit.status === "CHECKED_IN" || visit.status === "ACTIVE";
  return (
    <header className="px-4 pb-4 pt-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3">
        <VisitChip status={visit.status} />
        {open && visit.checkInAt && <span>Since <span className="num">{fmtTime(visit.checkInAt)}</span></span>}
        {!open && visit.plannedTime && <span className="num">{fmtPlanned(visit.plannedTime)}</span>}
      </div>
      <h2 className="mt-2 line-clamp-2 text-[22px] font-semibold leading-[1.2] tracking-[-0.02em] text-ink">{shop.name}</h2>
      <p className="mt-1 truncate text-[14px] text-ink-2">{shop.ownerName ? `${shop.ownerName}, ` : ""}{shop.area}</p>
      <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink-3">{shop.address}</p>
    </header>
  );
}

function Blocked({ b, plannedDate }: { b: NonNullable<VisitResume["blockedBy"]>; plannedDate: string }) {
  return b.code === "ANOTHER_VISIT_OPEN" ? (
    <Notice tone="warn" icon={TriangleAlert} role="alert" className="mx-4 mb-3" title="Another visit is still open"
      action={<Button asChild className={cn("h-10 px-3.5 text-[14px]", PRESS_BTN)}><Link href={`/field/visits/${b.visitId}`}>Open that visit</Link></Button>}>
      Complete it before checking in here.
    </Notice>
  ) : (
    <Notice tone="warn" icon={TriangleAlert} role="alert" className="mx-4 mb-3" title={`Planned for ${fmtWeekday(plannedDate)}`}>
      Check-in opens on the day of the visit.
    </Notice>
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
            <span className={cn("block h-[3px] rounded-full transition-colors duration-300", done ? "bg-verified" : cur ? "bg-ink" : "bg-line-strong")} />
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
    <div className="px-4 pt-4" aria-busy>
      <Skeleton className="h-[22px] w-40 rounded-md" />
      <Skeleton className="mt-3 h-7 w-56" />
      <Skeleton className="mt-2 h-4 w-40" />
      <Skeleton className="mt-1.5 h-3.5 w-52" />
      <div className="mt-5 grid grid-cols-3 gap-1.5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[3px]" />)}</div>
      <Skeleton className="mt-6 h-[200px] w-full rounded-xl" />
      <Skeleton className="mt-3 h-[72px] w-full rounded-xl" />
    </div>
  );
}
