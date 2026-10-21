"use client";
/** Human audit rows (docs/CONTRACT.md AuditRow): "**Actor** summary", with the records the API
 *  resolved in `refs` rendered as links. Never shows a raw id as content. */
import * as React from "react";
import Link from "next/link";
import { FileClockIcon } from "lucide-react";
import type { AuditRefType, AuditRow } from "@/lib/types";
import { Avatar, Empty } from "./chrome";
import { ListCard } from "./record";
import type { TimelineItem } from "./timeline";

const HREF: Partial<Record<AuditRefType, (id: string) => string>> = {
  shop: (id) => `/admin/shops/${id}`,
  order: (id) => `/admin/orders/${id}`,
  memo: (id) => `/admin/memos/${id}`,
  piece: (id) => `/admin/samples/${id}`,
  visit: (id) => `/admin/visits/${id}`,
  webhook: () => "/admin/integrations",
};
const IST = "Asia/Kolkata";
const day = (ymd: string) => new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "numeric", month: "short" }).format(new Date(`${ymd}T12:00:00+05:30`));
/** "2026-10-26" → "26 Oct" (business dates in API sentences). */
const prettyDates = (t: string) => t.replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (_, d: string) => day(d));
const fmtWhen = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso)).replace(",", " ·").replace(/(am|pm)$/i, (m) => m.toLowerCase());

const ACTION: Record<string, string> = {
  "visit.assign": "Assigned a visit", "visit.unassign": "Removed a visit", "visit.check_in": "Checked in", "visit.proof": "Uploaded visit proof", "visit.complete": "Completed the visit",
  "order.create": "Booked an order", "order.approve": "Approved the order", "order.reject": "Rejected the order",
  "memo.create": "Issued a memo", "memo.return": "Recorded returns", "memo.extend": "Extended the due date", "memo.convert": "Converted pieces to an order", "memo.ack": "Acknowledged the memo",
};
/** The API summary, or a humanised action when an old row has none. */
export const auditSummary = (r: AuditRow) => prettyDates(r.summary ?? ACTION[r.action] ?? r.action.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase()));

/** Summary split into text + links: every resolved ref (except `selfId` and people) links to its record. */
function auditParts(row: AuditRow, selfId?: string): React.ReactNode[] {
  const text = auditSummary(row);
  const marks = Object.entries(row.refs ?? {})
    .filter(([id, r]) => id !== selfId && r.type !== "user" && r.name.length > 2)
    .map(([id, r]) => ({ name: r.name, href: HREF[r.type]?.(id) }))
    .sort((a, b) => b.name.length - a.name.length);
  const parts: React.ReactNode[] = [];
  let rest = text;
  let k = 0;
  while (rest.length) {
    let at = -1;
    let hit: (typeof marks)[number] | undefined;
    for (const m of marks) {
      const i = rest.indexOf(m.name);
      if (i !== -1 && (at === -1 || i < at)) { at = i; hit = m; }
    }
    if (!hit) { parts.push(rest); break; }
    if (at > 0) parts.push(rest.slice(0, at));
    parts.push(hit.href ? <Link key={k++} href={hit.href} className="font-medium text-ink hover:underline">{hit.name}</Link> : <b key={k++}>{hit.name}</b>);
    rest = rest.slice(at + hit.name.length);
  }
  return parts;
}
export function AuditText({ row, selfId }: { row: AuditRow; selfId?: string }) {
  return <>{auditParts(row, selfId)}</>;
}

/** Lower-case the verb so "Priya Mehta approved ORD-…" reads as one sentence (keeps "ORD", "K22"). */
const verbCase = (n: React.ReactNode[]): React.ReactNode[] => {
  const [first, ...rest] = n;
  return typeof first === "string" && /^[A-Z][a-z]/.test(first) ? [first.charAt(0).toLowerCase() + first.slice(1), ...rest] : n;
};
function Sentence({ row, selfId }: { row: AuditRow; selfId?: string }) {
  return <><b>{row.actor.name}</b> {verbCase(auditParts(row, selfId))}</>;
}

/** AuditRow → Attio timeline row (History tabs). */
export function auditTimelineItem(row: AuditRow, selfId?: string): TimelineItem {
  return { id: row.id, at: row.createdAt, lead: <Avatar name={row.actor.name} />, text: <Sentence row={row} selfId={selfId} /> };
}

/** Bordered list of audit rows (record Audit tabs). */
export function AuditList({ rows, selfId, title = "Audit trail", hint }: { rows: AuditRow[]; selfId?: string; title?: string; hint?: string }) {
  if (!rows.length) return <div className="px-6 py-5"><Empty icon={FileClockIcon} title="No audit rows" hint={hint ?? "Every write on this record is recorded here."} /></div>;
  return (
    <div className="px-6 py-5">
      <h2 className="mb-1 text-[15px] font-medium text-ink">{title}</h2>
      {hint && <p className="mb-4 text-[13px] text-ink-2">{hint}</p>}
      <ListCard>
        {rows.map((a) => (
          <div key={a.id} className="flex items-start gap-2.5 px-3.5 py-2.5 text-[14px]">
            <span className="mt-0.5 shrink-0"><Avatar name={a.actor.name} size={20} /></span>
            <p className="min-w-0 flex-1 leading-6 text-ink-2 [&_b]:font-medium [&_b]:text-ink"><Sentence row={a} selfId={selfId} /></p>
            <span className="num shrink-0 whitespace-nowrap pt-0.5 text-[13px] text-ink-3">{fmtWhen(a.createdAt)}</span>
          </div>
        ))}
      </ListCard>
    </div>
  );
}
