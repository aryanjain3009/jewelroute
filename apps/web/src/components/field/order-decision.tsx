"use client";
/** What happened to an order after the agent booked it, exactly as the API recorded it: who decided,
 *  when, and the manager's note on a rejection. Nothing here is inferred — every word is a field of `Order`. */
import { Ban, CheckCircle2, Hourglass, XCircle } from "lucide-react";
import { reasonsText } from "@/components/app/status";
import type { Order } from "@/lib/types";
import { cn } from "@/lib/utils";
import { fmtDay, fmtTime } from "./format";

const when = (iso?: string) => (iso ? `${fmtTime(iso)}, ${fmtDay(iso)}` : "");

export function OrderDecision({ order: o, className }: { order: Order; className?: string }) {
  const box = "flex gap-2 rounded-lg px-3 py-2 text-[13px]";
  if (o.status === "REJECTED") {
    return (
      <div role="note" aria-label={`${o.number} rejected`} className={cn(box, "bg-danger-soft text-ink", className)}>
        <XCircle className="mt-0.5 size-4 shrink-0 text-danger" />
        <div className="min-w-0">
          <p className="font-medium text-danger">
            Rejected{o.decidedBy ? ` by ${o.decidedBy.name}` : ""}{o.decidedAt ? <span className="num font-normal text-ink-2"> · {when(o.decidedAt)}</span> : null}
          </p>
          <p className="mt-0.5 whitespace-pre-line text-ink">{o.rejectionReason ? <>Reason: {o.rejectionReason}</> : <span className="text-ink-2">No reason was given.</span>}</p>
          {o.sourceMemoId && <p className="mt-0.5 text-ink-2">The pieces went back on the memo at the shop.</p>}
        </div>
      </div>
    );
  }
  if (o.status === "APPROVED") {
    return (
      <div role="note" className={cn(box, "bg-verified-soft text-ink", className)}>
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-verified" />
        <p className="font-medium text-verified">Approved{o.decidedBy ? ` by ${o.decidedBy.name}` : ""}{o.decidedAt ? <span className="num font-normal text-ink-2"> · {when(o.decidedAt)}</span> : null}</p>
      </div>
    );
  }
  if (o.status === "PENDING_APPROVAL" || o.status === "SUBMITTED") {
    const why = reasonsText(o.approval?.reasons, o.approval?.position);
    return (
      <div role="note" className={cn(box, "bg-warn-soft text-ink", className)}>
        <Hourglass className="mt-0.5 size-4 shrink-0 text-warn" />
        <div className="min-w-0">
          <p className="font-medium text-warn">Waiting for your manager</p>
          {why && <p className="mt-0.5 text-ink">{why}</p>}
        </div>
      </div>
    );
  }
  if (o.status === "CANCELLED") {
    return (
      <div role="note" className={cn(box, "bg-sunken text-ink", className)}>
        <Ban className="mt-0.5 size-4 shrink-0 text-ink-3" />
        <div className="min-w-0">
          <p className="font-medium text-ink">Cancelled{o.cancelledAt ? <span className="num font-normal text-ink-2"> · {when(o.cancelledAt)}</span> : null}</p>
          {o.cancellationReason && <p className="mt-0.5 text-ink">Reason: {o.cancellationReason}</p>}
        </div>
      </div>
    );
  }
  return null;
}
