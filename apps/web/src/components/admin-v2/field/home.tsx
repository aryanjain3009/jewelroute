"use client";
/** Admin Home — an operations workspace, not a KPI dashboard. Top to bottom: greeting + day, a hairline
 *  metric strip, then two columns. Main: "Needs attention" grouped by kind (each group capped, so eight
 *  missed check-ins never bury an approval), samples outside + orders for the day side by side, and the
 *  live field (map, who is where, latest check-ins). Rail: the live activity timeline (Attio's activity
 *  panel). Every figure, sentence and status is the API's; the page only groups and links them. */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUrlState } from "@/lib/url-state";
import {
  AlertTriangleIcon, BellRingIcon, ChevronLeftIcon, ChevronRightIcon, CameraOffIcon, CalendarIcon, ClockIcon, FlaskConicalIcon, HomeIcon, MapPinOffIcon, PlusIcon, ReceiptTextIcon,
  ScrollTextIcon, ShieldAlertIcon, WebhookIcon, CheckCircle2Icon, UserIcon,
} from "lucide-react";
import { addDays, formatINRCompact, istDate } from "@jewelroute/shared";
import { cn } from "@/lib/utils";
import type { AttentionItem, AttentionKind, MapCheckIn, MapShop, MemoRow, Order, ShopRow } from "@/lib/types";
import { ListCard, ListRow } from "@/components/app/record";
import { Avatar, Btn, Empty, FilterChip, TitleBar } from "@/components/app/chrome";
import { ActivityFeed } from "@/components/app/activity-feed";
import { IconBubble } from "@/components/app/timeline";
import { OBJECT_TINT } from "@/components/app/shell";
import { MEMO_STATUS, ORDER_STATUS, SIMULATED_LOCATION } from "@/components/app/status";
import { useMemos, useOrders } from "@/components/admin-v2/sales/data";
import { JrMap } from "@/components/admin/map-lazy";
import type { MapMarker, MapTone } from "@/components/jr/map";
import { useHome, useShops, useVisitRows, type VRow } from "./data";
import { AssignVisitDialog } from "./dialogs";
import { Bar, PROOF, QueryError, StatusDot, age, fmtDist, entityHref, istDay, istTime, prettyDates, wallTime } from "./ui";

const TZ = "Asia/Kolkata";
function greeting(d: Date) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", hour12: false }).format(d));
  return h < 5 ? "Hello" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
const longDay = (ymd: string) => new Intl.DateTimeFormat("en-IN", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date(`${ymd}T12:00:00+05:30`));
const ymdOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));

export function HomeView() {
  const today = istDate();
  const [dateRaw, setDateRaw] = useUrlState("date", today);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) && dateRaw <= today ? dateRaw : today;
  const setDate = (d: string) => setDateRaw(d);
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [feedAgent, setFeedAgent] = useUrlState("agent", "all");
  const isToday = date === today;
  const home = useHome(isToday ? undefined : date);
  const visits = useVisitRows({ date }, { refetch: 10_000 });
  const memos = useMemos();
  const shops = useShops();
  const orders = useOrders();
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
        <div className="mx-auto w-full max-w-[1360px] px-4 pb-12 sm:px-6">
          {/* Greeting + day */}
          <div className="flex flex-wrap items-end gap-3 pb-5 pt-6">
            <div className="min-w-0">
              <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-ink" suppressHydrationWarning>
                {now ? greeting(now) : "Hello"}{first ? `, ${first}` : ""}
              </h2>
              <p className="mt-0.5 flex items-center text-[13px] text-ink-2" suppressHydrationWarning>
                {longDay(date)}
                {!isToday && <span className="ml-2 inline-flex h-5 items-center rounded-[5px] bg-[#f1f1f2] px-1.5 text-[12px] font-medium text-ink-2">Past day</span>}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              {!isToday && <Btn size="sm" variant="ghost" onClick={() => setDate(today)}>Back to today</Btn>}
              <Btn size="sm" icon={ChevronLeftIcon} onClick={() => setDate(addDays(date, -1))} aria-label="Previous day" title="Previous day" />
              <label className="press relative inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong bg-white px-2.5 text-[13px] font-medium text-ink shadow-[0_1px_2px_rgb(0_0_0/0.04)] focus-within:ring-2 focus-within:ring-blue/35 hover:bg-hover">
                <CalendarIcon className="size-3.5 text-ink-3" />{isToday ? "Today" : istDay(date)}
                <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Choose a day" />
              </label>
              <Btn size="sm" icon={ChevronRightIcon} onClick={() => setDate(addDays(date, 1))} disabled={isToday} aria-label="Next day" title="Next day" />
            </div>
          </div>

          {home.error && !d ? <QueryError error={home.error} retry={() => home.refetch()} /> : (
            <>
              <MetricStrip m={d?.metrics} isToday={isToday} />
              <div className="mt-8 grid grid-cols-1 gap-x-8 gap-y-9 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="min-w-0 space-y-9">
                  <NeedsAttention items={d?.attention} loading={!d} now={now} />
                  <div className="grid grid-cols-1 gap-x-6 gap-y-9 md:grid-cols-2">
                    <SamplesOutside shops={shops.data} memos={memos.data} error={!!shops.error && !shops.data} valuePaise={d?.metrics.samplesOutside.valuePaise} />
                    <DayOrders orders={orders.data} error={!!orders.error && !orders.data} date={date} isToday={isToday} />
                  </div>
                  <LiveField shops={d?.map.shops} checkIns={d?.map.checkIns} visits={visits.data} loading={!d} isToday={isToday} />
                </div>
                <aside className="min-w-0 xl:sticky xl:top-0 xl:-mt-1 xl:flex xl:max-h-[calc(100dvh-52px)] xl:flex-col xl:self-start xl:pt-1" aria-label="Activity">
                  <SectionHead title="Activity" action={
                    <FilterChip label="Agent" icon={UserIcon} value={feedAgent} onChange={setFeedAgent}
                      options={[{ value: "all", label: "Everyone" }, ...(d?.agents ?? []).map((a) => ({ value: a.id, label: a.name }))]} />
                  } />
                  <ActivityFeed
                    className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pb-6 xl:pr-1"
                    filter={feedAgent === "all" ? {} : { agentId: feedAgent }}
                    limit={20}
                    refetch={10_000}
                    empty={<Empty icon={ClockIcon} title="Nothing has happened yet" hint="Check-ins, orders and memos appear here the moment agents record them." />}
                  />
                </aside>
              </div>
            </>
          )}
        </div>
      </div>
      <AssignVisitDialog open={assignOpen} onOpenChange={setAssignOpen} />
    </div>
  );
}

function SectionHead({ title, count, action, sub }: { title: string; count?: number; action?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex h-7 items-center gap-2">
      <h3 className="text-[15px] font-medium text-ink">{title}</h3>
      {count !== undefined && <span className="num text-[13px] text-ink-3">{count}</span>}
      {sub}
      {action && <div className="ml-auto flex items-center">{action}</div>}
    </div>
  );
}
const ViewAll = ({ href, children = "View all" }: { href: string; children?: React.ReactNode }) => (
  <Link href={href} className="rounded-md px-1.5 py-0.5 text-[13px] text-ink-2 transition-colors hover:bg-hover hover:text-ink">{children}</Link>
);

/* ---------------- Metric strip (Attio highlights, hairline separated) ---------------- */
function MetricStrip({ m, isToday }: { m?: import("@/lib/types").AdminHome["metrics"]; isToday: boolean }) {
  const cells: { label: string; value?: React.ReactNode; sub?: React.ReactNode; href: string; tone?: "danger" | "warn" | "gold" }[] = [
    { label: isToday ? "Orders today" : "Orders", value: m && formatINRCompact(m.ordersToday.valuePaise), sub: m && `${m.ordersToday.count} order${m.ordersToday.count === 1 ? "" : "s"}`, href: "/admin/orders" },
    { label: "Visits completed", value: m && <>{m.visits.completed}<span className="text-ink-3"> / {m.visits.planned}</span></>, sub: m && (m.visits.inProgress ? `${m.visits.inProgress} in progress` : "None in progress"), href: "/admin/visits" },
    { label: "Samples outside", value: m && formatINRCompact(m.samplesOutside.valuePaise), sub: m && `${m.samplesOutside.count} piece${m.samplesOutside.count === 1 ? "" : "s"} at shops`, href: "/admin/samples?view=memo", tone: m && m.samplesOutside.count ? "gold" : undefined },
    { label: "Overdue memos", value: m && formatINRCompact(m.overdueMemos.valuePaise), sub: m && (m.overdueMemos.count ? `${m.overdueMemos.count} memo${m.overdueMemos.count === 1 ? "" : "s"} overdue` : "Nothing overdue"), href: "/admin/memos?view=overdue", tone: m && m.overdueMemos.count ? "danger" : undefined },
    { label: "Pending approvals", value: m && formatINRCompact(m.pendingApprovals.valuePaise), sub: m && (m.pendingApprovals.count ? `${m.pendingApprovals.count} order${m.pendingApprovals.count === 1 ? "" : "s"} waiting` : "All decided"), href: "/admin/orders?view=pending", tone: m && m.pendingApprovals.count ? "warn" : undefined },
  ];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-3 lg:grid-cols-5">
      {cells.map((c, i) => (
        <Link
          key={c.label}
          href={c.href}
          className={cn("group flex min-w-0 flex-col gap-1 bg-white px-3.5 py-3 transition-colors hover:bg-hover lg:px-4", i === cells.length - 1 && "col-span-2 lg:col-span-1")}
        >
          <span className="flex items-center gap-1.5 text-[13px] leading-[18px] text-ink-2">
            {(c.tone === "danger" || c.tone === "warn") && <span className={cn("size-1.5 shrink-0 rounded-full", c.tone === "danger" ? "bg-danger" : "bg-warn")} />}
            <span className="truncate">{c.label}</span>
            <ChevronRightIcon className="ml-auto size-3.5 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
          </span>
          {c.value === undefined ? <Bar className="my-1.5 h-4 w-20" /> : (
            <span className={cn("num truncate text-[20px] font-medium leading-7 tracking-[-0.01em] text-ink", c.tone === "danger" && "text-danger", c.tone === "warn" && "text-warn", c.tone === "gold" && "text-gold-ink")}>{c.value}</span>
          )}
          <span className="truncate text-[12.5px] text-ink-3">{c.sub ?? " "}</span>
        </Link>
      ))}
    </div>
  );
}

/* ---------------- Needs attention: grouped by kind, capped per group ---------------- */
type IconT = React.ComponentType<{ className?: string; strokeWidth?: number }>;
const KIND: Record<AttentionKind, { icon: IconT; tone: "red" | "amber" | "blue" | "grey"; group: string; href?: string }> = {
  MEMO_OVERDUE: { icon: BellRingIcon, tone: "red", group: "Overdue memos", href: "/admin/memos?view=overdue" },
  VISIT_MISSED: { icon: MapPinOffIcon, tone: "red", group: "Missed check-ins", href: "/admin/visits" },
  PROOF_MISSING: { icon: CameraOffIcon, tone: "red", group: "Missing photo proof", href: "/admin/visits?proof=MISSING" },
  WEBHOOK_FAILING: { icon: WebhookIcon, tone: "red", group: "Failing webhooks", href: "/admin/integrations" },
  MEMO_DUE_TODAY: { icon: ScrollTextIcon, tone: "amber", group: "Memos due today", href: "/admin/memos?view=due_today" },
  ACK_SELF_SUSPECTED: { icon: ShieldAlertIcon, tone: "amber", group: "Acknowledgements to confirm", href: "/admin/memos" },
  ORDER_PENDING: { icon: ReceiptTextIcon, tone: "amber", group: "Waiting for your approval", href: "/admin/orders?view=pending" },
  PROOF_SIMULATED: { icon: FlaskConicalIcon, tone: "blue", group: "Simulated check-ins", href: "/admin/visits?proof=SIMULATED" },
};
const ORDER: AttentionKind[] = ["MEMO_OVERDUE", "ORDER_PENDING", "VISIT_MISSED", "PROOF_MISSING", "WEBHOOK_FAILING", "MEMO_DUE_TODAY", "ACK_SELF_SUSPECTED", "PROOF_SIMULATED"];
/** Kinds this build doesn't know yet sort last instead of first (indexOf → -1). */
const rank = (k: string) => { const i = ORDER.indexOf(k as AttentionKind); return i < 0 ? ORDER.length : i; };
const CAP = 3;

function NeedsAttention({ items, loading, now }: { items?: AttentionItem[]; loading: boolean; now: Date | null }) {
  const router = useRouter();
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const groups = React.useMemo(() => {
    const by = new Map<string, AttentionItem[]>();
    for (const a of items ?? []) by.set(a.kind, [...(by.get(a.kind) ?? []), a]);
    return [...by.entries()]
      .map(([kind, rows]) => ({ kind, rows: [...rows].sort((x, y) => +new Date(y.at) - +new Date(x.at)), high: rows.some((r) => r.severity === "high") }))
      .sort((a, b) => Number(b.high) - Number(a.high) || rank(a.kind) - rank(b.kind));
  }, [items]);

  return (
    <section>
      <SectionHead title="Needs attention" count={items?.length} />
      <div className="overflow-hidden rounded-[10px] border border-line">
        {loading && Array.from({ length: 4 }).map((_, i) => <div key={i} className="flex h-10 items-center gap-2.5 border-b border-line px-3 last:border-b-0"><span className="size-5 rounded-full bg-hover" /><Bar className="w-72" /></div>)}
        {!loading && groups.length === 0 && (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 px-3.5 py-3 text-[14px]">
            <CheckCircle2Icon className="size-4 text-verified" strokeWidth={1.75} />
            <span className="font-medium text-ink">Nothing needs you right now.</span>
            <span className="text-ink-2">Overdue memos, approvals, missed visits and failed proofs show up here.</span>
          </div>
        )}
        {groups.map((g) => {
          const k = KIND[g.kind as AttentionKind] ?? { icon: AlertTriangleIcon, tone: "grey" as const, group: g.kind.toLowerCase().replace(/_/g, " ") };
          const expanded = open[g.kind] ?? false;
          const shown = expanded ? g.rows : g.rows.slice(0, CAP);
          const hidden = g.rows.length - shown.length;
          return (
            <div key={g.kind} className="border-b border-line last:border-b-0">
              <div className="group/hd flex h-9 items-center gap-2.5 bg-[#fafafa] px-3">
                <IconBubble icon={k.icon} tone={k.tone} />
                <span className="text-[13px] font-medium text-ink">{k.group}</span>
                <span className="num text-[13px] text-ink-3">{g.rows.length}</span>
                {k.href && <span className="ml-auto transition-opacity md:opacity-0 md:focus-within:opacity-100 md:group-hover/hd:opacity-100"><ViewAll href={k.href}>Open list</ViewAll></span>}
              </div>
              <ul className="divide-y divide-line border-t border-line">
                {shown.map((a) => {
                  const href = a.entity ? entityHref(a.entity) : undefined;
                  return (
                    <li key={a.id}>
                      <button type="button" onClick={() => href && router.push(href)} className="group flex min-h-12 w-full items-center gap-3 py-2 pl-3 pr-3 text-left transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-none sm:pl-[42px]">
                        <span className="flex min-w-0 flex-1 flex-col py-0.5">
                          <span className="line-clamp-2 text-[14px] leading-5 text-ink decoration-ink-3 decoration-dotted underline-offset-4 group-hover:underline md:truncate">{prettyDates(a.title)}</span>
                          <span className="line-clamp-2 text-[12.5px] leading-[18px] text-ink-3 md:line-clamp-1">{prettyDates(a.subtitle)}</span>
                        </span>
                        {a.amountPaise ? <span className={cn("num shrink-0 text-right text-[14px] font-medium", a.kind === "MEMO_OVERDUE" ? "text-danger" : "text-ink")}>{formatINRCompact(a.amountPaise)}</span> : null}
                        <span className="w-14 shrink-0 text-right text-[13px] text-ink-3" suppressHydrationWarning>{now ? age(a.at, now) : ""}</span>
                      </button>
                    </li>
                  );
                })}
                {(hidden > 0 || (expanded && g.rows.length > CAP)) && (
                  <li>
                    <button type="button" onClick={() => setOpen((o) => ({ ...o, [g.kind]: !expanded }))} className="flex h-9 w-full items-center gap-1.5 pl-3 text-left text-[13px] text-ink-2 transition-colors hover:bg-hover hover:text-ink sm:pl-[42px]">
                      {expanded ? "Show fewer" : `Show ${hidden} more`}
                    </button>
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------- Samples outside: shops holding pieces, valued at today's rate (same basis as the metric) ---------------- */
function SamplesOutside({ shops, memos, error, valuePaise }: { shops?: ShopRow[]; memos?: MemoRow[]; error: boolean; valuePaise?: number }) {
  const holding = (shops ?? []).filter((s) => s.samplesHereCount > 0);
  // The shop's most urgent open memo gives the due line (API daysToDue).
  const memoOf = (shopId: string) => (memos ?? []).filter((m) => m.shop.id === shopId && (m.status === "ACTIVE" || m.status === "PARTIALLY_RETURNED")).sort((a, b) => a.daysToDue - b.daysToDue)[0];
  const rows = holding.map((s) => ({ s, m: memoOf(s.id) })).sort((a, b) => (a.m?.daysToDue ?? 999) - (b.m?.daysToDue ?? 999) || b.s.samplesHereValuePaise - a.s.samplesHereValuePaise);
  const shown = rows.slice(0, 5);
  return (
    <section className="min-w-0">
      <SectionHead title="Samples outside" count={shops ? holding.length : undefined}
        sub={valuePaise ? <span className="num text-[13px] text-ink-3"><span className="font-medium text-gold-ink">{formatINRCompact(valuePaise)}</span> today</span> : undefined}
        action={<ViewAll href="/admin/samples?view=memo" />} />
      <ListCard>
        {!shops && !error && Array.from({ length: 2 }).map((_, i) => <div key={i} className="flex h-[52px] items-center gap-2.5 px-3.5"><span className="size-5 rounded-[5px] bg-hover" /><Bar className="w-40" /></div>)}
        {error && <p className="px-3.5 py-3 text-[13px] text-danger">Couldn&apos;t load shops.</p>}
        {shops && !holding.length && <p className="px-3.5 py-3 text-[13px] text-ink-3">Every sample is in the vault or with an agent.</p>}
        {shown.map(({ s, m }) => (
          <ListRow key={s.id} href={m ? `/admin/memos/${m.id}` : `/admin/shops/${s.id}`} className="group items-start gap-2.5 py-2.5">
            <Avatar name={s.name} size={20} square className="mt-0.5" />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="truncate font-medium text-ink decoration-ink-3 decoration-dotted underline-offset-4 group-hover:underline">{s.name}</span>
                <span className={cn("num ml-auto shrink-0 font-medium", m?.displayStatus === "OVERDUE" ? "text-danger" : "text-gold-ink")}>{formatINRCompact(s.samplesHereValuePaise)}</span>
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-3">
                <span className="num truncate">{s.samplesHereCount} piece{s.samplesHereCount === 1 ? "" : "s"}{m ? ` · ${m.agent.name}` : ""}</span>
                {m && <span className="ml-auto shrink-0"><Due m={m} /></span>}
              </span>
            </span>
          </ListRow>
        ))}
        {rows.length > shown.length && <ListRow href="/admin/samples?view=memo" className="h-9 min-h-9 text-[13px] text-ink-2">{rows.length - shown.length} more shops</ListRow>}
      </ListCard>
      <p className="mt-1.5 text-[12px] text-ink-3">Value at today&apos;s gold rate, as in the metric above.</p>
    </section>
  );
}
/** The API's own due vocabulary: daysToDue + displayStatus. */
function Due({ m }: { m: MemoRow }) {
  const d = m.daysToDue;
  const tone = MEMO_STATUS[m.displayStatus]?.[0];
  const t = d < 0 ? `${-d} day${d === -1 ? "" : "s"} overdue` : d === 0 ? "due today" : d === 1 ? "due tomorrow" : `due ${istDay(m.dueDate)}`;
  return <span className={cn(tone === "red" ? "font-medium text-danger" : tone === "amber" ? "text-warn" : "text-ink-3")}>{t}</span>;
}

/* ---------------- Orders for the day ---------------- */
const TONE_DOT: Record<string, string> = { amber: "bg-warn", red: "bg-danger", green: "bg-verified", grey: "bg-[#c4c5c9]" };
function DayOrders({ orders, error, date, isToday }: { orders?: Order[]; error: boolean; date: string; isToday: boolean }) {
  const day = (orders ?? []).filter((o) => ymdOf(o.createdAt) === date).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const rows = day.slice(0, 5);
  return (
    <section className="min-w-0">
      <SectionHead title={isToday ? "Orders today" : `Orders on ${istDay(date)}`} count={orders ? day.length : undefined} action={<ViewAll href="/admin/orders" />} />
      <ListCard>
        {!orders && !error && Array.from({ length: 2 }).map((_, i) => <div key={i} className="flex h-[52px] items-center gap-2.5 px-3.5"><span className="size-5 rounded-[5px] bg-hover" /><Bar className="w-40" /></div>)}
        {error && <p className="px-3.5 py-3 text-[13px] text-danger">Couldn&apos;t load orders.</p>}
        {orders && !day.length && <p className="px-3.5 py-3 text-[13px] text-ink-3">{isToday ? "No orders booked yet today." : "No orders were booked that day."}</p>}
        {rows.map((o) => {
          const [tone, label] = ORDER_STATUS[o.status] ?? ["grey", o.status];
          return (
            <ListRow key={o.id} href={`/admin/orders/${o.id}`} className="group items-start gap-2.5 py-2.5">
              <Avatar name={o.shop.name} size={20} square className="mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate font-medium text-ink decoration-ink-3 decoration-dotted underline-offset-4 group-hover:underline">{o.shop.name}</span>
                  <span className="num ml-auto shrink-0 font-medium text-ink">{formatINRCompact(o.totalPaise)}</span>
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-3">
                  <span className="num truncate">{o.number} · {istTime(o.createdAt)}</span>
                  <span className={cn("ml-auto inline-flex shrink-0 items-center gap-1.5", tone === "amber" ? "text-warn" : tone === "red" ? "text-danger" : "text-ink-2")}>
                    <span className={cn("size-1.5 rounded-full", TONE_DOT[tone] ?? TONE_DOT.grey)} />{label}
                  </span>
                </span>
              </span>
            </ListRow>
          );
        })}
        {day.length > rows.length && <ListRow href="/admin/orders" className="h-9 min-h-9 text-[13px] text-ink-2">{day.length - rows.length} more</ListRow>}
      </ListCard>
    </section>
  );
}

/* ---------------- Live field ---------------- */
const SHOP_TONE: Partial<Record<string, MapTone>> = { COMPLETED: "done", CHECKED_IN: "active", ACTIVE: "active", PLANNED: "planned", MISSED: "alert" };
const VER_COLOR: Record<string, string> = { VERIFIED: "#2c7a54", LOW_ACCURACY: "#b7791f", SIMULATED: "#2f6bf2" };

function LiveField({ shops, checkIns, visits, loading, isToday }: { shops?: MapShop[]; checkIns?: MapCheckIn[]; visits?: VRow[]; loading: boolean; isToday: boolean }) {
  const router = useRouter();
  const routed = (shops ?? []).filter((s) => s.visitStatus);
  const markers: MapMarker[] = routed.map((s) => ({
    id: s.id, lat: s.lat, lng: s.lng, tone: SHOP_TONE[s.visitStatus ?? ""] ?? "muted", label: s.name, sublabel: s.area,
    onClick: () => router.push(`/admin/shops/${s.id}`),
  }));
  const points = (checkIns ?? []).map((c) => ({ id: c.visitId, lat: c.lat, lng: c.lng, color: VER_COLOR[c.verification] ?? "#6e6f73", title: `${c.agentName} at ${c.shopName} · ${c.verification === "SIMULATED" ? SIMULATED_LOCATION : `${c.distanceM} m from shop`}` }));
  // Who is where: one row per agent, from the day's visit rows.
  const byAgent = new Map<string, VRow[]>();
  for (const v of visits ?? []) byAgent.set(v.agent.id, [...(byAgent.get(v.agent.id) ?? []), v]);
  const agents = [...byAgent.entries()].map(([id, vs]) => {
    // Removed stops (CANCELLED) are not part of the route — the metric strip and agents list exclude them too.
    const sorted = vs.filter((v) => v.status !== "CANCELLED").sort((a, b) => a.sequence - b.sequence);
    const open = sorted.find((v) => v.status === "CHECKED_IN" || v.status === "ACTIVE");
    const next = sorted.find((v) => v.status === "PLANNED");
    const lastDone = [...sorted].reverse().find((v) => v.status === "COMPLETED");
    return { id, name: vs[0].agent.name, done: sorted.filter((v) => v.status === "COMPLETED").length, total: sorted.length, open, next, lastDone, missed: sorted.filter((v) => v.status === "MISSED").length };
  }).filter((a) => a.total > 0).sort((a, b) => Number(!!b.open) - Number(!!a.open) || a.name.localeCompare(b.name));

  return (
    <section className="min-w-0">
      <SectionHead
        title={isToday ? "Field today" : "Field that day"}
        action={<span className="inline-flex items-center gap-1.5 text-[13px] text-ink-3">{isToday && <span className="size-1.5 rounded-full bg-verified" />}{isToday ? "Live · updates every 10 s" : "Past day"}</span>}
      />
      <div className="grid overflow-hidden rounded-[10px] border border-line lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="relative h-[280px] border-b border-line lg:h-auto lg:min-h-[320px] lg:border-b-0 lg:border-r">
          {loading ? <div className="h-full w-full animate-pulse bg-hover" /> : markers.length ? (
            <JrMap markers={markers} points={points} initialZoom={11} />
          ) : <div className="grid h-full place-items-center bg-sunken text-[13px] text-ink-3">No visits planned for this day</div>}
          {markers.length > 0 && (
            <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-x-3 gap-y-1 rounded-md border border-line bg-white/95 px-2 py-1 text-[12px] text-ink-2">
              <Legend bg="#2c7a54" fg="#fff" l="In visit" /><Legend bg="#e5f2ea" fg="#2c7a54" ring="#9fcbb3" l="Done" /><Legend bg="#fff" fg="#191714" ring="#d6d0c3" l="Planned" />{routed.some((x) => x.visitStatus === "MISSED") && <Legend bg="#b23a2b" fg="#fff" l="Missed" />}
            </div>
          )}
        </div>
        <ol className="max-h-[320px] divide-y divide-line overflow-y-auto">
          {visits === undefined && Array.from({ length: 3 }).map((_, i) => <li key={i} className="flex h-14 items-center gap-2 px-3"><span className="size-6 rounded-full bg-hover" /><Bar className="w-32" /></li>)}
          {visits && !agents.length && <li className="px-4 py-8 text-center text-[13px] text-ink-3">No agents are routed for this day.</li>}
          {agents.map((a) => {
            const v = a.open ?? a.next ?? a.lastDone;
            return (
              <li key={a.id}>
                <Link href={`/admin/agents/${a.id}`} className="flex items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-hover">
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
                        : a.next ? <>Next: {a.next.shop.name}{a.next.plannedTime ? ` · ${wallTime(a.next.plannedTime)}` : ""}</>
                        : a.lastDone ? <>Route done · last {istTime(a.lastDone.completedAt)}</> : "No visits"}
                    </span>
                    {v?.verification === "SIMULATED" && a.open && <span className="mt-0.5 block truncate text-[12.5px] text-info" title={SIMULATED_LOCATION}>Simulated · not verified</span>}
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
      <SectionHead title="Check-ins" count={checkIns.length} action={<ViewAll href="/admin/visits" />} />
      <ListCard>
        {rows.map((c) => (
          <ListRow key={c.visitId} href={`/admin/visits/${c.visitId}`} className="group h-10 py-0">
            <Avatar name={c.agentName} size={20} />
            <span className="min-w-0 flex-1 truncate text-ink-2"><span className="font-medium text-ink">{c.agentName}</span> at <span className="text-ink decoration-ink-3 decoration-dotted underline-offset-4 group-hover:underline">{c.shopName}</span></span>
            <span className="num hidden w-14 shrink-0 text-right text-[13px] text-ink-2 sm:block" title={c.verification === "SIMULATED" ? SIMULATED_LOCATION : undefined}>{c.verification === "SIMULATED" ? <span className="text-ink-3">—</span> : fmtDist(c.distanceM)}</span>
            <span className="w-[112px] shrink-0"><StatusDot map={PROOF} value={c.verification} className="text-[13px]" /></span>
            <span className="w-[92px] shrink-0 text-right text-[13px] text-ink-3">{ymdOf(c.at) === istDate() ? istTime(c.at) : `${istDay(c.at)}, ${istTime(c.at)}`}</span>
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
