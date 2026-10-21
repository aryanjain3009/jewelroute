"use client";
/** Custody timeline: custodians as vertical milestones (Vault → agent → retailer), and between them
 *  every transfer as an Attio activity row ("Rahul Verma left 2 pieces on memo with Sharma Jewellers")
 *  with a nested card of evidence: GPS location + verification + distance, visit, proof photo, event ids.
 *  Renders only what the custody ledger returned; nothing is inferred. */
import * as React from "react";
import Link from "next/link";
import { CheckCircle2Icon, CircleSlashIcon, LandmarkIcon, LockIcon, MapPinIcon, MapPinnedIcon, ScrollTextIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, Chip, type Tone } from "@/components/app/chrome";
import type { CustodianType, CustodyEventRow, CustodyParty } from "@/lib/types";
import { CopyId, fmtCoord, fmtDayTime, fmtDist } from "./ui";

const REASON: Record<string, string> = {
  INTAKE: "Taken into stock", ISSUE_TO_AGENT: "Issued to agent", MEMO_HANDOVER: "Left on memo", MEMO_RETURN: "Returned from memo",
  RETURN_TO_VAULT: "Returned to vault", CONVERTED_TO_SALE: "Sold from memo", ADJUSTMENT: "Adjustment",
};
export const reasonLabel = (r: string) => REASON[r] ?? r.charAt(0) + r.slice(1).toLowerCase().replace(/_/g, " ");
const BAR: Record<string, string> = { INTAKE: "bg-[#c4c5c9]", ISSUE_TO_AGENT: "bg-blue", MEMO_HANDOVER: "bg-gold", MEMO_RETURN: "bg-[#9b9ca0]", RETURN_TO_VAULT: "bg-[#9b9ca0]", CONVERTED_TO_SALE: "bg-verified" };
const ROLE: Record<CustodianType, string> = { VAULT: "", AGENT: "Field agent", SHOP: "Retailer", SOLD: "Sold", LOST: "Lost" };
const VERIF: Record<string, [Tone, string]> = { VERIFIED: ["green", "GPS verified"], LOW_ACCURACY: ["amber", "Low GPS accuracy"], SIMULATED: ["blue", "Simulated location"] };

interface Step { key: string; reason: string; from: CustodyParty; to: CustodyParty; events: CustodyEventRow[] }

function group(events: CustodyEventRow[]): Step[] {
  const sorted = [...events].sort((a, b) => +new Date(a.occurredAt) - +new Date(b.occurredAt) || a.seq - b.seq || a.pieceId.localeCompare(b.pieceId));
  const steps: Step[] = [];
  for (const e of sorted) {
    const key = [e.reason, e.from.type, e.from.label, e.to.type, e.to.label, e.memo?.number ?? "", e.visit?.id ?? ""].join("|");
    const last = steps[steps.length - 1];
    if (last && last.key === key) last.events.push(e);
    else steps.push({ key, reason: e.reason, from: e.from, to: e.to, events: [e] });
  }
  return steps;
}

const partyHref = (p: CustodyParty) => (p.id && p.type === "AGENT" ? `/admin/agents/${p.id}` : p.id && p.type === "SHOP" ? `/admin/shops/${p.id}` : undefined);

function PartyLead({ p, size }: { p: CustodyParty; size: number }) {
  if (p.type === "AGENT") return <Avatar name={p.label} size={size} />;
  if (p.type === "SHOP") return <Avatar name={p.label} size={size} square />;
  const I = p.type === "VAULT" ? LandmarkIcon : p.type === "SOLD" ? CheckCircle2Icon : CircleSlashIcon;
  const tint = p.type === "SOLD" ? "bg-verified-soft text-verified" : p.type === "LOST" ? "bg-danger-soft text-danger" : "bg-[#f1f1f2] text-ink-2";
  return <span className={cn("grid shrink-0 place-items-center rounded-[6px]", tint)} style={{ width: size, height: size }}><I className="size-[55%]" strokeWidth={1.9} /></span>;
}

function Name({ p }: { p: CustodyParty }) {
  const href = partyHref(p);
  return href ? <Link href={href} className="font-medium text-ink decoration-ink-3 decoration-dotted underline-offset-4 hover:underline">{p.label}</Link> : <b className="font-medium text-ink">{p.label === "Vault" ? "the vault" : p.label}</b>;
}

function Sentence({ s, subject }: { s: Step; subject: string }) {
  const actor = s.events[0].actor.name;
  const A = <b className="font-medium text-ink">{actor}</b>;
  switch (s.reason) {
    case "INTAKE": return <>{A} took {subject} into stock</>;
    case "ISSUE_TO_AGENT": return <>{A} issued {subject} to <Name p={s.to} /></>;
    case "MEMO_HANDOVER": return <>{A} left {subject} on memo with <Name p={s.to} /></>;
    case "MEMO_RETURN": return <>{A} collected {subject} back from <Name p={s.from} /></>;
    case "RETURN_TO_VAULT": return <>{A} returned {subject} to the vault</>;
    case "CONVERTED_TO_SALE": return <>{A} recorded {subject} as sold to <Name p={s.from} /></>;
    default: return <>{A} moved {subject} from <Name p={s.from} /> to <Name p={s.to} /></>;
  }
}

function Node({ p, since, now, first }: { p: CustodyParty; since?: string; now?: boolean; first?: boolean }) {
  return (
    <li className="relative flex items-center gap-3 py-1">
      {!first && <span aria-hidden className="absolute -top-1 left-[13.5px] h-2 border-l border-line-strong" />}
      <span className={cn("relative z-[1] rounded-[8px] bg-white", now && "ring-2 ring-gold/60 ring-offset-2")}><PartyLead p={p} size={28} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[15px] font-semibold text-ink">{partyHref(p) ? <Link href={partyHref(p)!} className="decoration-ink-3 decoration-dotted underline-offset-4 hover:underline">{p.label}</Link> : p.label}</span>
          {ROLE[p.type] && <span className="text-[13px] text-ink-3">{ROLE[p.type]}</span>}
          {now && <Chip tone="gold">Holds now</Chip>}
        </div>
      </div>
      {since && <span className="shrink-0 text-[13px] text-ink-3">since {fmtDayTime(since)}</span>}
    </li>
  );
}

function Transfer({ s, mode, memoId, top }: { s: Step; mode: "memo" | "ledger"; memoId?: string; top?: boolean }) {
  const e0 = s.events[0];
  const n = s.events.length;
  const subject = mode === "ledger" ? "this piece" : n === 1 ? e0.tagCode : `${n} pieces`;
  const end = s.events[n - 1].occurredAt;
  const spread = +new Date(end) - +new Date(e0.occurredAt) > 60_000;
  const loc = s.events.find((e) => e.location)?.location;
  const visit = s.events.find((e) => e.visit)?.visit;
  const proof = s.events.find((e) => e.proof)?.proof;
  const memo = s.events.find((e) => e.memo?.number)?.memo;
  const ids = [...new Set(s.events.map((e) => e.eventId).filter(Boolean) as string[])];
  const v = loc?.verification ? VERIF[loc.verification] : undefined;
  return (
    <li className="relative pb-4 pl-[38px] pt-3">
      <span aria-hidden className={cn("absolute bottom-0 left-[13.5px] border-l border-line-strong", top ? "top-5" : "top-0")} />
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0"><Avatar name={e0.actor.name} size={20} /></span>
        <p className="min-w-0 flex-1 text-[14px] leading-6 text-ink-2"><Sentence s={s} subject={subject} /></p>
        {mode === "ledger" && <span className="num mt-0.5 shrink-0 rounded-[5px] border border-line px-1 text-[12px] text-ink-3" title="Ledger sequence number">#{e0.seq}</span>}
        <time dateTime={e0.occurredAt} className="num mt-0.5 shrink-0 whitespace-nowrap text-[13px] text-ink-3">{fmtDayTime(e0.occurredAt)}{spread ? ` – ${fmtDayTime(end)}` : ""}</time>
      </div>
      <div className="relative ml-[30px] mt-1.5 flex gap-3 overflow-hidden rounded-[10px] border border-line bg-white py-3 pl-4 pr-3">
        <span aria-hidden className={cn("absolute inset-y-3 left-0 w-[3px] rounded-r-full", BAR[s.reason] ?? "bg-line-strong")} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
            <span className="font-medium text-ink">{reasonLabel(s.reason)}</span>
            {memo && memo.id !== memoId && (memo.id ? <Link href={`/admin/memos/${memo.id}`} className="inline-flex items-center gap-1 text-ink-2 hover:text-ink"><ScrollTextIcon className="size-3.5" />{memo.number}</Link> : <span className="inline-flex items-center gap-1 text-ink-2"><ScrollTextIcon className="size-3.5" />{memo.number}</span>)}
          </div>
          {mode === "memo" && (
            <div className="flex flex-wrap gap-1.5">
              {s.events.map((e) => (
                <Link key={e.id} href={`/admin/samples/${e.pieceId}`} className="inline-flex h-[22px] items-center gap-1 rounded-[6px] bg-gold-soft px-1.5 text-[12.5px] font-medium text-gold-ink hover:brightness-95" title={e.pieceName}>
                  <span className="num">{e.tagCode}</span>
                  {spread && <span className="font-normal text-gold-ink/70">· {fmtDayTime(e.occurredAt)}</span>}
                </Link>
              ))}
            </div>
          )}
          {loc && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
              <MapPinIcon className="size-3.5 shrink-0 text-ink-3" />
              <span className="text-ink">{loc.label}</span>
              <a href={`https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}#map=18/${loc.lat}/${loc.lng}`} target="_blank" rel="noreferrer" className="num text-ink-3 hover:text-ink-2 hover:underline">{fmtCoord(loc.lat, loc.lng)}</a>
              {v && <Chip tone={v[0]}>{v[1]}{loc.distanceM != null ? ` · ${fmtDist(loc.distanceM)} from shop` : ""}</Chip>}
            </div>
          )}
          {(visit || ids.length > 0) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
              {visit && <Link href={`/admin/visits/${visit.id}`} className="inline-flex items-center gap-1 text-ink-2 decoration-ink-3 decoration-dotted underline-offset-4 hover:text-ink hover:underline"><MapPinnedIcon className="size-3.5 text-ink-3" />Visit at {visit.shopName}</Link>}
              {ids.length > 0 && (
                <span className="flex flex-wrap items-center gap-1">
                  {ids.slice(0, 4).map((eid) => <CopyId key={eid} id={eid} />)}
                  {ids.length > 4 && <span className="text-[12px] text-ink-3">+{ids.length - 4}</span>}
                </span>
              )}
            </div>
          )}
        </div>
        {proof && (
          <a href={proof.url} target="_blank" rel="noreferrer" className="group/proof relative block size-16 shrink-0 overflow-hidden rounded-lg bg-sunken ring-1 ring-black/5" title="Open arrival photo proof">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={proof.url} alt="Arrival photo proof" className="h-full w-full object-cover transition-transform group-hover/proof:scale-105" loading="lazy" />
            <span className="absolute inset-x-0 bottom-0 bg-black/45 py-0.5 text-center text-[10.5px] font-medium text-white">Proof</span>
          </a>
        )}
      </div>
    </li>
  );
}

export function CustodyTimeline({ events, mode, memoId, holders }: {
  events: CustodyEventRow[];
  mode: "memo" | "ledger";
  memoId?: string;
  /** Current custodian label of every piece involved, from the API's piece records. */
  holders: { tagCode: string; label: string; pieceId: string }[];
}) {
  const steps = React.useMemo(() => group(events), [events]);
  if (!steps.length) return null;
  const first = steps[0];
  const lastTo = steps[steps.length - 1].to;
  const allHere = holders.length > 0 && holders.every((h) => h.label === lastTo.label);
  return (
    <div>
      <ol className="relative">
        {first.reason !== "INTAKE" && <Node p={first.from} first />}
        {steps.map((s, i) => {
          const isLast = i === steps.length - 1;
          return (
            <React.Fragment key={s.key + i}>
              <Transfer s={s} mode={mode} memoId={memoId} top={i === 0 && first.reason === "INTAKE"} />
              <Node p={s.to} since={s.events[s.events.length - 1].occurredAt} now={isLast && allHere} first={i === 0 && first.reason === "INTAKE"} />
            </React.Fragment>
          );
        })}
      </ol>
      {!allHere && holders.length > 0 && (
        <div className="ml-[38px] mt-3 rounded-[10px] border border-line bg-sunken px-3.5 py-2.5 text-[13px] text-ink-2">
          <span className="font-medium text-ink">Now</span>
          {holders.map((h) => (
            <span key={h.pieceId} className="ml-3 inline-flex items-center gap-1"><Link href={`/admin/samples/${h.pieceId}`} className="num text-gold-ink hover:underline">{h.tagCode}</Link> with <span className="text-ink">{h.label}</span></span>
          ))}
        </div>
      )}
      {mode === "ledger" && (
        <p className="ml-[38px] mt-4 inline-flex items-center gap-1.5 text-[12.5px] text-ink-3"><LockIcon className="size-3.5" />Append-only ledger — entries can&apos;t be edited. Each move is written with the event that announced it.</p>
      )}
    </div>
  );
}
