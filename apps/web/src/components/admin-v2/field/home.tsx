"use client";
/** Admin Home — an operations workspace, not a KPI dashboard: greeting, a hairline metric strip,
 *  live field activity (map + who-is-where), exceptions only, and the Attio activity timeline. */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangleIcon, BellRingIcon, ChevronLeftIcon, ChevronRightIcon, CameraOffIcon, CalendarIcon, ClockIcon, FlaskConicalIcon, HomeIcon, MapPinOffIcon, PlusIcon, ReceiptTextIcon,
  ScrollTextIcon, WebhookIcon, CheckCircle2Icon,
} from "lucide-react";
import { addDays, formatINRCompact, istDate } from "@jewelroute/shared";
import { cn } from "@/lib/utils";
import type { AttentionItem, AttentionKind, MapCheckIn, MapShop } from "@/lib/types";
import { ListCard, ListRow } from "@/components/app/record";
import { Avatar, Btn, Empty, TitleBar } from "@/components/app/chrome";
import { Timeline, IconBubble } from "@/components/app/timeline";
import { OBJECT_TINT } from "@/components/app/shell";
import { JrMap } from "@/components/admin/map-lazy";
import type { MapMarker, MapTone } from "@/components/jr/map";
import { useHome, useVisitRows, type VRow } from "./data";
import { AssignVisitDialog } from "./dialogs";
import { Bar, PROOF, QueryError, StatusDot, age, fmtDist, entityHref, istDay, istTime, prettyDates, toTimeline } from "./ui";

const TZ = "Asia/Kolkata";
function greeting(d: Date) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", hour12: false }).format(d));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
const longDay = (ymd: string) => new Intl.DateTimeFormat("en-IN", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date(`${ymd}T12:00:00+05:30`));

export function HomeView() {
  const router = useRouter();
  const today = istDate();
  const [date, setDate] = React.useState(today);
  const [assignOpen, setAssignOpen] = React.useState(false);
  const isToday = date === today;
  const home = useHome(isToday ? undefined : date);
  const visits = useVisitRows({ date }, { refetch: 10_000 });
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => { setNow(new Date()); const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  const d = home.data;
  const first = d?.user.name.split(" ")[0];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TitleBar icon={HomeIcon} iconClass={OBJECT_TINT.home} title="Home">
        <Btn variant="primary" icon={PlusIcon} onClick={() => setAssignOpen(true)}>Assign visit</Btn>
      </TitleBar>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1320px] px-4 pb-10 sm:px-6">
          {/* Greeting + date */}
          <div className="flex flex-wrap items-end gap-3 pb-5 pt-6">
            <div className="min-w-0">
              <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-ink" suppressHydrationWarning>
                {now ? greeting(now) : "Hello"}{first ? `, ${first}` : ""}
              </h2>
              <p className="mt-0.5 text-[13px] text-ink-2" suppressHydrationWarning>{longDay(date)}{!isToday && " · viewing a past day"}</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              {!isToday && <Btn size="sm" variant="ghost" onClick={() => setDate(today)}>Back to today</Btn>}
              <Btn size="sm" icon={ChevronLeftIcon} onClick={() => setDate(addDays(date, -1))} aria-label="Previous day" />
              <label className="relative inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong bg-white px-2.5 text-[13px] font-medium text-ink shadow-[0_1px_2px_rgb(0_0_0/0.04)] hover:bg-hover">
                <CalendarIcon className="size-3.5 text-ink-3" />{isToday ? "Today" : istDay(date)}
                <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Choose a day" />
              </label>
              <Btn size="sm" icon={ChevronRightIcon} onClick={() => setDate(addDays(date, 1))} disabled={isToday} aria-label="Next day" />
            </div>
          </div>

          {home.error && !d ? <QueryError error={home.error} retry={() => home.refetch()} /> : (
            <>
              <MetricStrip m={d?.metrics} isToday={isToday} />
              <NeedsAttention items={d?.attention} loading={!d} now={now} />
              <div className="mt-8 grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
                <LiveField shops={d?.map.shops} checkIns={d?.map.checkIns} visits={visits.data} loading={!d} isToday={isToday} />
                <section className="min-w-0">
                  <SectionHead title="Recent activity" action={<Link href="/admin/visits" className="text-[13px] text-ink-2 hover:text-ink">All visits</Link>} />
                  {!d ? <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="flex gap-3"><span className="size-5 rounded-full bg-hover" /><Bar className="w-3/5" /></div>)}</div> : (
                    <Timeline
                      items={toTimeline(d.activity.slice(0, 20), (h) => router.push(h), { proofs: true })}
                      empty={<Empty icon={ClockIcon} title="Nothing has happened yet today" hint="Check-ins, orders and memos appear here the moment agents record them." />}
                    />
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      </div>
      <AssignVisitDialog open={assignOpen} onOpenChange={setAssignOpen} />
    </div>
  );
}

function SectionHead({ title, count, action }: { title: string; count?: number; action?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex h-7 items-center gap-2">
      <h3 className="text-[15px] font-medium text-ink">{title}</h3>
      {count !== undefined && <span className="num text-[13px] text-ink-3">{count}</span>}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

/* ---------------- Metric strip (Attio highlights, hairline separated) ---------------- */
function MetricStrip({ m, isToday }: { m?: import("@/lib/types").AdminHome["metrics"]; isToday: boolean }) {
  const cells: { label: string; value?: React.ReactNode; sub?: React.ReactNode; href: string; tone?: "danger" | "warn" }[] = [
    { label: isToday ? "Orders today" : "Orders", value: m && formatINRCompact(m.ordersToday.valuePaise), sub: m && `${m.ordersToday.count} order${m.ordersToday.count === 1 ? "" : "s"}`, href: "/admin/orders" },
    { label: "Visits completed", value: m && <>{m.visits.completed}<span className="text-ink-3"> / {m.visits.planned}</span></>, sub: m && (m.visits.inProgress ? `${m.visits.inProgress} in progress` : "None in progress"), href: "/admin/visits" },
    { label: "Samples outside", value: m && formatINRCompact(m.samplesOutside.valuePaise), sub: m && `${m.samplesOutside.count} piece${m.samplesOutside.count === 1 ? "" : "s"} at shops`, href: "/admin/samples" },
    { label: "Overdue memo value", value: m && formatINRCompact(m.overdueMemos.valuePaise), sub: m && (m.overdueMemos.count ? `${m.overdueMemos.count} memo${m.overdueMemos.count === 1 ? "" : "s"} overdue` : "Nothing overdue"), href: "/admin/memos?view=overdue", tone: m && m.overdueMemos.count ? "danger" : undefined },
    { label: "Pending approvals", value: m && formatINRCompact(m.pendingApprovals.valuePaise), sub: m && (m.pendingApprovals.count ? `${m.pendingApprovals.count} order${m.pendingApprovals.count === 1 ? "" : "s"} waiting` : "All decided"), href: "/admin/orders?view=pending", tone: m && m.pendingApprovals.count ? "warn" : undefined },
  ];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line md:grid-cols-5">
      {cells.map((c, i) => (
        <Link
          key={c.label}
          href={c.href}
          className={cn("group flex min-w-0 flex-col gap-1 bg-white px-3 py-3 hover:bg-hover lg:px-4", i === cells.length - 1 && "col-span-2 md:col-span-1")}
        >
          <span className="flex items-center gap-1.5 text-[13px] leading-[18px] text-ink-2">
            {c.tone && <span className={cn("size-1.5 shrink-0 rounded-full", c.tone === "danger" ? "bg-danger" : "bg-warn")} />}
            {c.label}
          </span>
          {c.value === undefined ? <Bar className="my-1.5 h-4 w-20" /> : (
            <span className={cn("num text-[20px] font-medium leading-7 text-ink", c.tone === "danger" && "text-danger", c.tone === "warn" && "text-warn")}>{c.value}</span>
          )}
          <span className="truncate text-[12.5px] text-ink-3">{c.sub ?? " "}</span>
        </Link>
      ))}
    </div>
  );
}

/* ---------------- Live field activity ---------------- */
const SHOP_TONE: Partial<Record<string, MapTone>> = { COMPLETED: "done", CHECKED_IN: "active", ACTIVE: "active", PLANNED: "planned", MISSED: "alert" };
const VER_COLOR: Record<string, string> = { VERIFIED: "#2c7a54", LOW_ACCURACY: "#b7791f", SIMULATED: "#2f6bf2" };

function LiveField({ shops, checkIns, visits, loading, isToday }: { shops?: MapShop[]; checkIns?: MapCheckIn[]; visits?: VRow[]; loading: boolean; isToday: boolean }) {
  const router = useRouter();
  const routed = (shops ?? []).filter((s) => s.visitStatus);
  const markers: MapMarker[] = routed.map((s) => ({
    id: s.id, lat: s.lat, lng: s.lng, tone: SHOP_TONE[s.visitStatus ?? ""] ?? "muted", label: s.name, sublabel: s.area,
    onClick: () => router.push(`/admin/shops/${s.id}`),
  }));
  const points = (checkIns ?? []).map((c) => ({ id: c.visitId, lat: c.lat, lng: c.lng, color: VER_COLOR[c.verification] ?? "#6e6f73", title: `${c.agentName} at ${c.shopName} · ${c.distanceM} m` }));
  // Who is where: one row per agent, from today's visit rows.
  const byAgent = new Map<string, VRow[]>();
  for (const v of visits ?? []) byAgent.set(v.agent.id, [...(byAgent.get(v.agent.id) ?? []), v]);
  const agents = [...byAgent.entries()].map(([id, vs]) => {
    const sorted = [...vs].sort((a, b) => a.sequence - b.sequence);
    const open = sorted.find((v) => v.status === "CHECKED_IN" || v.status === "ACTIVE");
    const next = sorted.find((v) => v.status === "PLANNED");
    const lastDone = [...sorted].reverse().find((v) => v.status === "COMPLETED");
    return { id, name: vs[0].agent.name, done: sorted.filter((v) => v.status === "COMPLETED").length, total: sorted.length, open, next, lastDone, missed: sorted.filter((v) => v.status === "MISSED").length };
  }).sort((a, b) => Number(!!b.open) - Number(!!a.open) || a.name.localeCompare(b.name));

  return (
    <section className="min-w-0">
      <SectionHead title="Live field activity" action={<span className="inline-flex items-center gap-1.5 text-[13px] text-ink-3">{isToday && <span className="size-1.5 rounded-full bg-verified" />}{isToday ? "Updates every 10 s" : "Past day"}</span>} />
      <div className="grid overflow-hidden rounded-[10px] border border-line lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="relative h-[300px] border-b border-line lg:h-auto lg:min-h-[340px] lg:border-b-0 lg:border-r">
          {loading ? <div className="h-full w-full animate-pulse bg-hover" /> : markers.length ? (
            <JrMap markers={markers} points={points} initialZoom={11} />
          ) : <div className="grid h-full place-items-center text-[13px] text-ink-3">No visits planned for this day</div>}
          {markers.length > 0 && (
            <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-x-3 gap-y-1 rounded-md border border-line bg-white/95 px-2 py-1 text-[12px] text-ink-2">
              <Legend bg="#2c7a54" fg="#fff" l="In visit" /><Legend bg="#e5f2ea" fg="#2c7a54" ring="#9fcbb3" l="Done" /><Legend bg="#fff" fg="#191714" ring="#d6d0c3" l="Planned" /><Legend bg="#b23a2b" fg="#fff" l="Missed" />
            </div>
          )}
        </div>
        <ol className="max-h-[340px] divide-y divide-line overflow-y-auto">
          {visits === undefined && Array.from({ length: 3 }).map((_, i) => <li key={i} className="flex h-14 items-center gap-2 px-3"><span className="size-6 rounded-full bg-hover" /><Bar className="w-32" /></li>)}
          {visits && !agents.length && <li className="px-4 py-8 text-center text-[13px] text-ink-3">No agents are routed for this day.</li>}
          {agents.map((a) => {
            const v = a.open ?? a.next ?? a.lastDone;
            return (
              <li key={a.id}>
                <Link href={`/admin/agents/${a.id}`} className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-hover">
                  <span className="relative mt-0.5">
                    <Avatar name={a.name} size={24} />
                    {a.open && <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-white bg-verified" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-medium text-ink">{a.name}</span>
                      <span className="num ml-auto shrink-0 text-[12.5px] text-ink-3">{a.done}/{a.total}</span>
                    </span>
                    <span className="block truncate text-[13px] text-ink-2">
                      {a.open ? <>At <span className="text-ink">{a.open.shop.name}</span> since {istTime(a.open.checkInAt)}</>
                        : a.next ? <>Next: {a.next.shop.name}{a.next.plannedTime ? ` · ${a.next.plannedTime}` : ""}</>
                        : a.lastDone ? <>Route done · last {istTime(a.lastDone.completedAt)}</> : "No visits"}
                    </span>
                    {v?.verification === "SIMULATED" && a.open && <span className="mt-0.5 block text-[12.5px] text-info">Simulated location (demo)</span>}
                    {a.missed > 0 && <span className="mt-0.5 block text-[12.5px] text-danger">{a.missed} missed</span>}
                    <span className="mt-1.5 flex h-1 overflow-hidden rounded-full bg-hover">
                      <span className="bg-verified" style={{ width: `${(a.done / Math.max(1, a.total)) * 100}%` }} />
                      {a.open && <span className="bg-blue/60" style={{ width: `${100 / Math.max(1, a.total)}%` }} />}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
      <CheckInList checkIns={checkIns} />
    </section>
  );
}

/** Latest GPS check-ins with their server verdict — the trust signal at a glance. */
function CheckInList({ checkIns }: { checkIns?: MapCheckIn[] }) {
  if (!checkIns?.length) return null;
  const rows = [...checkIns].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 6);
  return (
    <div className="mt-6">
      <SectionHead title="Check-ins" count={checkIns.length} action={<Link href="/admin/visits" className="text-[13px] text-ink-2 hover:text-ink">View all</Link>} />
      <ListCard>
        {rows.map((c) => (
          <ListRow key={c.visitId} href={`/admin/visits/${c.visitId}`} className="group h-10 py-0">
            <Avatar name={c.agentName} size={20} />
            <span className="min-w-0 flex-1 truncate text-ink-2"><span className="font-medium text-ink">{c.agentName}</span> at <span className="text-ink decoration-ink-3 decoration-dotted underline-offset-4 group-hover:underline">{c.shopName}</span></span>
            <span className="num hidden w-14 shrink-0 text-right text-[13px] text-ink-2 sm:block">{fmtDist(c.distanceM)}</span>
            <span className="w-[120px] shrink-0"><StatusDot map={PROOF} value={c.verification} className="text-[13px]" /></span>
            <span className="w-16 shrink-0 text-right text-[13px] text-ink-3">{istTime(c.at)}</span>
          </ListRow>
        ))}
      </ListCard>
    </div>
  );
}
const Legend = ({ bg, fg, ring, l }: { bg: string; fg: string; ring?: string; l: string }) => (
  <span className="inline-flex items-center gap-1">
    <span className="grid size-3 place-items-center rounded-full" style={{ background: bg, boxShadow: `0 0 0 1px ${ring ?? bg}` }}><span className="size-1.5 rounded-full" style={{ background: fg }} /></span>{l}
  </span>
);

/* ---------------- Needs attention ---------------- */
const KIND: Record<AttentionKind, [React.ComponentType<{ className?: string; strokeWidth?: number }>, "red" | "amber" | "blue" | "grey"]> = {
  MEMO_OVERDUE: [BellRingIcon, "red"], MEMO_DUE_TODAY: [ScrollTextIcon, "amber"], VISIT_MISSED: [MapPinOffIcon, "red"],
  PROOF_MISSING: [CameraOffIcon, "red"], PROOF_SIMULATED: [FlaskConicalIcon, "blue"], ORDER_PENDING: [ReceiptTextIcon, "amber"], WEBHOOK_FAILING: [WebhookIcon, "red"],
};
const ORDER: AttentionKind[] = ["MEMO_OVERDUE", "VISIT_MISSED", "PROOF_MISSING", "WEBHOOK_FAILING", "MEMO_DUE_TODAY", "ORDER_PENDING", "PROOF_SIMULATED"];

function NeedsAttention({ items, loading, now }: { items?: AttentionItem[]; loading: boolean; now: Date | null }) {
  const router = useRouter();
  const sorted = [...(items ?? [])].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1) || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  return (
    <section className="mt-8">
      <SectionHead title="Needs attention" count={items?.length} />
      <div className="overflow-hidden rounded-[10px] border border-line">
        {loading && Array.from({ length: 3 }).map((_, i) => <div key={i} className="flex h-10 items-center gap-2.5 border-b border-line px-3 last:border-b-0"><span className="size-5 rounded-full bg-hover" /><Bar className="w-72" /></div>)}
        {!loading && sorted.length === 0 && (
          <div className="flex items-center gap-2.5 px-3 py-3 text-[14px]">
            <CheckCircle2Icon className="size-4 text-verified" strokeWidth={1.75} />
            <span className="font-medium text-ink">Nothing needs you right now.</span>
            <span className="text-ink-2">Overdue memos, missed visits and failed proofs will show up here.</span>
          </div>
        )}
        <ul className="divide-y divide-line">
          {sorted.map((a) => {
            const [I, tone] = KIND[a.kind] ?? [AlertTriangleIcon, "grey"];
            const href = entityHref(a.entity);
            return (
              <li key={a.id}>
                <button type="button" onClick={() => href && router.push(href)} className="group flex min-h-10 w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-hover md:py-0">
                  <IconBubble icon={I} tone={tone} />
                  <span className="flex min-w-0 flex-1 flex-col md:flex-row md:items-center md:gap-2.5">
                    <span className="truncate text-[14px] text-ink decoration-ink-3 decoration-dotted underline-offset-4 group-hover:underline md:shrink-0 md:max-w-[55%]">{prettyDates(a.title)}</span>
                    <span className="truncate text-[13px] text-ink-3">{prettyDates(a.subtitle)}</span>
                  </span>
                  {a.amountPaise ? <span className={cn("num w-20 shrink-0 text-right text-[14px] font-medium", a.kind === "MEMO_OVERDUE" ? "text-danger" : "text-ink")}>{formatINRCompact(a.amountPaise)}</span> : <span className="hidden w-20 md:block" />}
                  <span className="w-16 shrink-0 text-right text-[13px] text-ink-3" suppressHydrationWarning>{now ? age(a.at, now) : ""}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
