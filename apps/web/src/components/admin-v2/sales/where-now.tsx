"use client";
/** "Where is this piece right now, who has it, why, and when is it due back?" — the answer block shared
 *  by the sample record and its preview. Every word comes from the piece row and its custody ledger. */
import * as React from "react";
import Link from "next/link";
import { ShieldAlertIcon, ShieldCheckIcon } from "lucide-react";
import { formatINR, istDate } from "@jewelroute/shared";
import type { CustodyEventRow, MemoRecord, PieceRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SelfAckNote } from "@/components/app/status";
import { ackSentence, PartyLead, reasonLabel } from "./custody-timeline";
import { DueText, fmtDayTime, fmtTime, holderLabel } from "./ui";

const TZ = "Asia/Kolkata";
/** "Mon 26 Oct" for a business date. */
export const dueDay = (ymd: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-IN", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).formatToParts(new Date(`${ymd}T12:00:00+05:30`)).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.day} ${p.month}`;
};
/** "4:14 pm" today, "21 Oct, 4:14 pm" otherwise. */
const when = (iso: string) => (istDate(new Date(iso)) === istDate() ? fmtTime(iso) : fmtDayTime(iso));
const sorted = (ev: CustodyEventRow[]) => [...ev].sort((a, b) => a.seq - b.seq);
export const ROLE: Record<string, string> = { VAULT: "Stock", AGENT: "Field agent", SHOP: "Retailer", SOLD: "Converted to order", LOST: "Lost" };

/* ---------------- the answer: where is it, who has it, why, when is it due back ---------------- */
export function WhereNow({ p, events, memo, compact }: { p: PieceRow; events: CustodyEventRow[]; memo?: MemoRecord; compact?: boolean }) {
  const ev = sorted(events);
  const last = ev[ev.length - 1];
  const handover = [...ev].reverse().find((e) => e.reason === "MEMO_HANDOVER" && e.to.type === "SHOP");
  const ack: CustodyEventRow["ack"] = handover?.ack ?? (memo ? { status: memo.memo.ackStatus, method: memo.memo.ackMethod as "QR_CONFIRM" | "OTP" | undefined, at: memo.memo.ackAt, ...(memo.memo.selfAckSuspected ? { selfAckSuspected: true as const } : {}) } : undefined);
  const area = memo?.memo.shop.area;
  const today = istDate();
  const memoDays = p.memo ? Math.round((+new Date(`${p.memo.dueDate}T00:00:00+05:30`) - +new Date(`${today}T00:00:00+05:30`)) / 86_400_000) : 0;
  const holder = holderLabel(p);
  const holderHref = p.custodianType === "AGENT" && p.custodian.agentId ? `/admin/agents/${p.custodian.agentId}` : p.custodianType === "SHOP" && p.custodian.shopId ? `/admin/shops/${p.custodian.shopId}` : undefined;
  const holderLink = holderHref ? <Link href={holderHref} className="decoration-ink-3 decoration-dotted underline-offset-4 hover:underline">{holder}</Link> : holder;
  const agentWhere = p.location?.label?.replace(/^With [^·]+·\s*/, "");

  // Headline: the place, in plain words.
  const head: React.ReactNode =
    p.custodianType === "SHOP" ? <>At {holderLink}{area ? <span className="font-normal text-ink-2">, {area}</span> : null}</>
    : p.custodianType === "AGENT" ? <>With {holderLink}{agentWhere ? <span className="font-normal text-ink-2"> · {p.location?.visitId ? <Link href={`/admin/visits/${p.location.visitId}`} className="hover:underline">{agentWhere}</Link> : agentWhere}</span> : null}</>
    : p.custodianType === "VAULT" ? <>In the vault</>
    : p.custodianType === "SOLD" ? <>Sold{last?.from.type === "SHOP" ? <> to {last.from.label}</> : null}</>
    : <>Marked lost</>;

  const why: React.ReactNode =
    p.memo ? <span className="flex flex-col"><span>On memo</span><Link href={`/admin/memos/${p.memo.id}`} className="num text-[13px] text-ink-2 decoration-ink-3 decoration-dotted underline-offset-4 hover:text-ink hover:underline">{p.memo.number}</Link></span>
    : last?.order ? <span className="flex flex-col"><span>{reasonLabel(last.reason)}</span><Link href={`/admin/orders/${last.order.id}`} className="num text-[13px] text-ink-2 hover:text-ink hover:underline">{last.order.number}</Link></span>
    : last ? <span className="flex flex-col"><span>{reasonLabel(last.reason)}</span>{last.actor && <span className="text-[13px] text-ink-3">by {last.actor.name}</span>}</span>
    : <span className="text-ink-3">No ledger entry</span>;

  const due: React.ReactNode =
    p.memo ? (
      <span className="flex flex-col">
        <span className={cn("num", memoDays < 0 && "text-danger")}>{dueDay(p.memo.dueDate)}</span>
        <DueText days={memoDays} className="text-[13px]" />
        {memoDays <= 1 && <Link href={`/admin/memos/${p.memo.id}?extend=1`} className="mt-1 inline-flex w-fit items-center gap-1 rounded-md text-[13px] text-ink underline decoration-ink-3 decoration-dotted underline-offset-4 hover:decoration-ink">Extend due date</Link>}
      </span>
    )
    : p.custodianType === "SOLD" ? <span className="text-ink-3">Not coming back</span>
    : <span className="flex flex-col"><span className="text-ink-3">No due date</span><span className="text-[13px] text-ink-3">{p.custodianType === "AGENT" ? "Returns with the agent" : p.custodianType === "VAULT" ? "In stock" : ""}</span></span>;

  const facts: { label: string; value: React.ReactNode }[] = [
    { label: "Who has it", value: <span className="flex min-w-0 items-center gap-2"><PartyLead p={{ type: p.custodianType, id: p.custodian.agentId ?? p.custodian.shopId, label: holder }} size={20} /><span className="min-w-0"><span className="block truncate">{holderLink}</span><span className="block text-[13px] text-ink-3">{ROLE[p.custodianType] ?? ""}</span></span></span> },
    { label: "Why", value: why },
    { label: "Since", value: last ? <span className="flex flex-col"><span className="num">{when(last.occurredAt)}</span>{handover?.actor && p.custodianType === "SHOP" ? <span className="truncate text-[13px] text-ink-3">by {handover.actor.name}</span> : last.actor ? <span className="truncate text-[13px] text-ink-3">by {last.actor.name}</span> : null}</span> : <span className="text-ink-3">—</span> },
    { label: "Due back", value: due },
  ];

  const acked = ack?.status === "ACKNOWLEDGED";
  return (
    <div className={compact ? "" : "border-b border-line px-6 pb-5 pt-5"}>
      {!compact && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-[13px] text-ink-2">Where it is now</p>
          <p className="text-[13px] text-ink-2">Value today <span className="num text-[15px] font-semibold text-gold-ink">{formatINR(p.valuePaise)}</span></p>
        </div>
      )}
      <h2 className={cn(!compact && "mt-1", "font-semibold tracking-[-0.015em] text-ink", compact ? "text-[16px] leading-6" : "text-[20px] leading-8")}>{head}</h2>
      <dl className={cn("mt-3.5 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line", !compact && "md:grid-cols-4")}>
        {facts.map((f) => (
          <div key={f.label} className="min-w-0 bg-white px-3.5 py-3">
            <dt className="text-[12.5px] text-ink-3">{f.label}</dt>
            <dd className="mt-1 min-w-0 text-[14px] font-medium leading-5 text-ink [&_.text-\[13px\]]:font-normal">{f.value}</dd>
          </div>
        ))}
      </dl>
      {p.custodianType === "SHOP" && handover && (
        <p className={cn("mt-3 flex items-center gap-1.5 text-[13.5px]", acked ? "text-ink-2" : "text-warn")}>
          {acked ? <ShieldCheckIcon className="size-4 shrink-0 text-verified" /> : <ShieldAlertIcon className="size-4 shrink-0" />}
          <span className={acked ? "text-ink" : undefined}>{ack ? ackSentence(ack, handover.to.label) : "No acknowledgement recorded"}</span>
        </p>
      )}
      {p.custodianType === "SHOP" && handover && acked && ack?.selfAckSuspected && (
        <SelfAckNote note={ack.note} className="mt-1 pl-[1px]" />
      )}
    </div>
  );
}

