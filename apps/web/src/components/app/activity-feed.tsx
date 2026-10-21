"use client";
/** The ONE activity feed (docs/CONTRACT.md v3 "One activity model"). Every surface — Home, Shop,
 *  Agent, Visit, Order, Memo, Sample, record previews — renders `ActivityItem`s from
 *  `GET /admin/activity?<ref>=…` through this component, so one business event reads the same
 *  everywhere: actor avatar, "**Rahul Verma** left 2 pieces on memo with **Sharma Jewellers**",
 *  linked refs, a nested evidence card from `detail` (photo, from → to, reasons), time on the right.
 *  Nothing here is computed: sentences, refs and amounts are the API's. */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ActivityIcon, ArrowRightIcon, BellRingIcon, CameraIcon, CheckCircle2Icon, CheckIcon, ClockIcon, CoinsIcon, GemIcon, MapPinCheckIcon,
  ReceiptTextIcon, RotateCcwIcon, ScrollTextIcon, ShieldCheckIcon, TimerIcon, WebhookIcon, XCircleIcon, BanIcon, WalletIcon, HourglassIcon,
} from "lucide-react";
import { formatINRCompact } from "@jewelroute/shared";
import { api } from "@/lib/api";
import { qk } from "@/lib/sync";
import { cn } from "@/lib/utils";
import type { ActivityFilter, ActivityItem, ActivityPage, ApprovalReason } from "@/lib/types";
import { Avatar, Btn, Chip, Empty } from "./chrome";
import { IconBubble, Timeline, type TimelineItem } from "./timeline";
import { REASON_SHORT, SIMULATED_LOCATION } from "./status";

type Icon = React.ComponentType<{ className?: string; strokeWidth?: number }>;
type BubbleTone = "grey" | "green" | "amber" | "red" | "blue" | "gold";

/** Event type → system icon (used when an event has no human actor, e.g. memo.overdue). */
const EVT: Record<string, [Icon, BubbleTone]> = {
  "visit.checked_in": [MapPinCheckIcon, "blue"], "visit.proof_uploaded": [CameraIcon, "blue"], "visit.completed": [CheckCircle2Icon, "green"],
  "order.created": [ReceiptTextIcon, "grey"], "order.confirmed": [CheckIcon, "green"], "order.pending_approval": [HourglassIcon, "amber"],
  "order.approved": [CheckIcon, "green"], "order.rejected": [XCircleIcon, "red"], "order.settled": [WalletIcon, "green"], "order.cancelled": [BanIcon, "grey"],
  "memo.created": [ScrollTextIcon, "gold"], "memo.extended": [TimerIcon, "amber"], "memo.returned": [RotateCcwIcon, "grey"], "memo.overdue": [BellRingIcon, "red"],
  "memo.converted": [ReceiptTextIcon, "green"], "memo.acknowledged": [ShieldCheckIcon, "green"],
  "sample.custody_changed": [GemIcon, "gold"], "gold_rate.set": [CoinsIcon, "gold"], ping: [WebhookIcon, "grey"],
};
const IST = "Asia/Kolkata";
const ISO_DAY = /\b(\d{4}-\d{2}-\d{2})\b/g;
const day = (ymd: string) => new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "numeric", month: "short" }).format(new Date(`${ymd}T12:00:00+05:30`));
const media = (u?: string) => (!u ? undefined : u.startsWith("/v1/") ? `/api${u}` : u);
const dist = (m?: number) => (m == null ? undefined : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
const VER: Record<string, [BubbleTone, string]> = { VERIFIED: ["green", "GPS verified"], LOW_ACCURACY: ["amber", "Low GPS accuracy"], SIMULATED: ["blue", SIMULATED_LOCATION] };

/** Links for every record the event touches (refs), so the sentence's names are navigable. */
function marks(a: ActivityItem, selfId?: string): { text: string; href?: string; strong?: boolean }[] {
  const r = a.refs ?? {};
  const out: { text: string; href?: string; strong?: boolean }[] = [];
  const add = (text: string | undefined, href: string | undefined, id?: string) => { if (text && text.length > 1) out.push({ text, href: id && id === selfId ? undefined : href, strong: true }); };
  const actor = a.actor ?? r.agent;
  if (actor) add(actor.name, `/admin/agents/${actor.id}`, actor.id);
  if (r.agent && r.agent.id !== actor?.id) add(r.agent.name, `/admin/agents/${r.agent.id}`, r.agent.id);
  const shop = r.shop ?? a.shop;
  if (shop) add(shop.name, `/admin/shops/${shop.id}`, shop.id);
  if (r.order?.number) add(r.order.number, `/admin/orders/${r.order.id}`, r.order.id);
  if (r.memo?.number) add(r.memo.number, `/admin/memos/${r.memo.id}`, r.memo.id);
  for (const p of r.pieces ?? []) if (p.tagCode) add(p.tagCode, `/admin/samples/${p.id}`, p.id);
  // Order / memo numbers the title mentions but refs don't resolve are still emphasised.
  for (const m of a.title.match(/\b(ORD|MEMO)-\d{4}-\d{5}\b/g) ?? []) if (!out.some((o) => o.text === m)) out.push({ text: m, strong: true });
  return out.sort((x, y) => y.text.length - x.text.length);
}

/** "**Actor** verb **Object**" from the API's own title — names become links, nothing invented. */
export function ActivitySentence({ a, selfId }: { a: ActivityItem; selfId?: string }) {
  let t = a.title.replace(/\s·\s₹[\d.,]+[LCrK]*\s*$/u, "").replace(ISO_DAY, (_, d: string) => day(d));
  const ms = marks(a, selfId);
  const parts: React.ReactNode[] = [];
  let k = 0;
  while (t.length) {
    let at = -1; let hit: (typeof ms)[number] | undefined;
    for (const m of ms) { const i = t.indexOf(m.text); if (i !== -1 && (at === -1 || i < at)) { at = i; hit = m; } }
    if (!hit) { parts.push(t); break; }
    if (at > 0) parts.push(t.slice(0, at));
    parts.push(hit.href
      ? <Link key={k++} href={hit.href} onClick={(e) => e.stopPropagation()} className="font-medium text-ink decoration-ink-3 decoration-dotted underline-offset-4 hover:underline">{hit.text}</Link>
      : <b key={k++}>{hit.text}</b>);
    t = t.slice(at + hit.text.length);
  }
  return <>{parts}</>;
}

/** Nested evidence card, only from `detail` / `refs` the API sent; null when there is nothing to show
 *  (so no empty card is drawn). */
function evidence(a: ActivityItem): React.ReactNode {
  const d = a.detail ?? {};
  const pieces = a.refs?.pieces?.filter((p) => p.tagCode) ?? [];
  if (a.kind === "proof" && d.photoUrl) {
    const v = d.verification ? VER[d.verification] : undefined;
    return (
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={media(d.photoUrl)} alt="Arrival photo" className="size-14 shrink-0 rounded-md border border-line object-cover" loading="lazy" />
        <div className="min-w-0 text-[13px]">
          <div className="font-medium text-ink">Arrival photo</div>
          <div className="text-ink-3">{d.verification !== "SIMULATED" && dist(d.distanceM) ? `${dist(d.distanceM)} from check-in` : "Stored with its checksum"}</div>
          {v && <span className={cn("text-[12.5px]", v[0] === "blue" ? "text-info" : v[0] === "amber" ? "text-warn" : "text-verified")}>{v[1]}</span>}
        </div>
      </div>
    );
  }
  if (a.type === "order.pending_approval" && d.reasons?.length && !/approval/i.test(a.title)) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink-2">
        <span>Needs approval:</span>
        {(d.reasons as ApprovalReason[]).map((r) => <Chip key={r} tone="amber">{REASON_SHORT[r] ?? r}</Chip>)}
      </div>
    );
  }
  if ((a.type === "order.rejected" || a.type === "order.cancelled") && d.reason) return <p className="text-[13px] text-ink-2">{d.reason}</p>;
  if (a.kind === "custody" && (d.fromLabel || d.toLabel)) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
        <span className="text-ink-2">{d.fromLabel}</span><ArrowRightIcon className="size-3.5 text-ink-3" /><span className="font-medium text-ink">{d.toLabel}</span>
        {pieces.length > 0 && <PieceChips pieces={pieces} />}
      </div>
    );
  }
  if ((a.type === "memo.created" || a.type === "memo.returned" || a.type === "memo.converted") && pieces.length) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
        <PieceChips pieces={pieces} />
        {a.type === "memo.created" && d.dueDate && <span>due {day(d.dueDate)}</span>}
      </div>
    );
  }
  return null;
}
function PieceChips({ pieces }: { pieces: { id: string; tagCode: string }[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {pieces.slice(0, 6).map((p) => (
        <Link key={p.id} href={`/admin/samples/${p.id}`} onClick={(e) => e.stopPropagation()} className="num inline-flex h-[22px] items-center rounded-[6px] bg-gold-soft px-1.5 text-[12.5px] font-medium text-gold-ink hover:brightness-95">{p.tagCode}</Link>
      ))}
      {pieces.length > 6 && <span className="self-center text-[12px] text-ink-3">+{pieces.length - 6}</span>}
    </span>
  );
}

/** Where clicking the row goes: the most specific record the event is about (never this record). */
function hrefOf(a: ActivityItem, selfId?: string): string | undefined {
  const r = a.refs ?? {};
  const cands: [string | undefined, string][] = [
    [r.order?.id, `/admin/orders/${r.order?.id}`], [r.memo?.id, `/admin/memos/${r.memo?.id}`],
    [r.pieces?.length === 1 ? r.pieces[0].id : undefined, `/admin/samples/${r.pieces?.[0]?.id}`],
    [r.visit?.id, `/admin/visits/${r.visit?.id}`], [(r.shop ?? a.shop)?.id, `/admin/shops/${(r.shop ?? a.shop)?.id}`],
  ];
  for (const [id, h] of cands) if (id && id !== selfId) return h;
  return undefined;
}

export function activityRow(a: ActivityItem, opts: { selfId?: string; compact?: boolean; go?: (h: string) => void } = {}): TimelineItem {
  const [I, tone] = EVT[a.type] ?? [ClockIcon, "grey" as const];
  const money = a.kind === "memo" || a.kind === "custody";
  const href = hrefOf(a, opts.selfId);
  const actor = a.actor;
  const body = opts.compact ? null : evidence(a);
  return {
    id: a.id,
    at: a.createdAt,
    lead: a.type === "memo.acknowledged" && (a.refs?.shop ?? a.shop)
      ? <Avatar name={(a.refs?.shop ?? a.shop)!.name} square />
      : actor && a.type !== "memo.overdue" ? <Avatar name={actor.name} /> : <IconBubble icon={I} tone={tone} />,
    text: <ActivitySentence a={a} selfId={opts.selfId} />,
    right: a.amountPaise ? <span className={cn("num font-medium", money ? "text-gold-ink" : "text-ink")}>{formatINRCompact(a.amountPaise)}</span> : undefined,
    body: body ?? undefined,
    tone: a.type === "memo.overdue" || a.type === "order.rejected" ? "danger" : undefined,
    onClick: href && opts.go ? () => opts.go!(href) : undefined,
  };
}

/** One business fact = one row. The API emits separate events for the same moment (an order that needs
 *  approval is also "booked"; a memo hand-over is also a custody move of the same pieces); show the most
 *  specific one. Only display grouping — every remaining sentence is the API's own. */
function dedupe(items: ActivityItem[]): ActivityItem[] {
  const pendingOrders = new Set(items.filter((a) => a.type === "order.pending_approval").map((a) => a.refs?.order?.id ?? a.entity.id));
  const memoMoves = items.filter((a) => a.type.startsWith("memo.") && a.refs?.pieces?.length);
  const pieceKey = (a: ActivityItem) => (a.refs?.pieces ?? []).map((p) => p.id).sort().join(",");
  return items.filter((a) => {
    if (a.type === "order.created" && pendingOrders.has(a.refs?.order?.id ?? a.entity.id)) return false;
    if (a.type === "sample.custody_changed" && a.refs?.pieces?.length) {
      const k = pieceKey(a);
      return !memoMoves.some((m) => pieceKey(m) === k && Math.abs(+new Date(m.createdAt) - +new Date(a.createdAt)) < 120_000);
    }
    return true;
  });
}

/* ---------------- data ---------------- */
const toPage = (r: ActivityPage | ActivityItem[]): ActivityPage => (Array.isArray(r) ? { items: r } : r);
function qs(f: ActivityFilter, limit: number, before?: string) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  p.set("limit", String(limit));
  if (before) p.set("before", before);
  return p.toString();
}
export function useActivityFeed(filter: ActivityFilter, limit = 30, opts: { refetch?: number; enabled?: boolean } = {}) {
  return useInfiniteQuery({
    queryKey: [...qk.activity, "feed", filter, limit],
    enabled: opts.enabled ?? true,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => toPage(await api<ActivityPage | ActivityItem[]>(`/admin/activity?${qs(filter, limit, pageParam)}`)),
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    refetchInterval: opts.refetch ?? 20_000,
  });
}

/* ---------------- component ---------------- */
export function ActivityFeed({
  filter = {}, selfId, limit = 30, compact, grouped = !compact, empty, refetch, max, className, framed,
}: {
  /** Wrap rows in a hairline card (record overviews) — but never an empty one. */
  framed?: boolean;
  /** The record this feed is about (`?shopId=` …). `{}` = whole workspace (Home). */
  filter?: ActivityFilter;
  /** Id of the record the page shows: its own name is not linked and rows don't navigate to it. */
  selfId?: string;
  limit?: number;
  /** One-line rows without evidence cards and without "Load more" (overview / preview sheets). */
  compact?: boolean;
  grouped?: boolean;
  empty?: React.ReactNode;
  refetch?: number;
  /** Show at most N rows (compact lists). */
  max?: number;
  className?: string;
}) {
  const router = useRouter();
  const q = useActivityFeed(filter, max ? Math.max(max, 5) : limit, { refetch });
  const items = React.useMemo(() => {
    const all = dedupe(q.data?.pages.flatMap((p) => p.items) ?? []);
    return max ? all.slice(0, max) : all;
  }, [q.data, max]);
  if (q.isLoading) {
    return (
      <div className={cn("space-y-3", className)} aria-busy>
        {Array.from({ length: compact ? 3 : 5 }).map((_, i) => <div key={i} className="flex items-center gap-3"><span className="size-5 rounded-full bg-hover" /><span className="h-3 w-3/5 animate-pulse rounded bg-hover" /></div>)}
      </div>
    );
  }
  if (q.error && !items.length) return <p className={cn("text-[13px] text-danger", className)}>Couldn&apos;t load activity. <button type="button" className="underline" onClick={() => q.refetch()}>Try again</button></p>;
  return (
    <div className={cn(framed && items.length > 0 && "rounded-[10px] border border-line px-3.5 py-3", className)}>
      <Timeline
        grouped={grouped}
        items={items.map((a) => activityRow(a, { selfId, compact, go: (h) => router.push(h) }))}
        empty={empty ?? <Empty icon={ActivityIcon} title="No activity yet" hint="Check-ins, proofs, orders, memos and custody moves appear here as they happen." />}
      />
      {!compact && !max && q.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Btn size="sm" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>{q.isFetchingNextPage ? "Loading…" : "Load more"}</Btn>
        </div>
      )}
    </div>
  );
}
