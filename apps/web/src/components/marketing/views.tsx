"use client";
/** The three product states shown in the hero frame, built from the app's own components and fed
 *  with the sample data in ./data. The switcher chooses which one is on screen. */
import {
  BoxesIcon, CircleCheckIcon, CalendarIcon, CameraIcon, CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon,
  ClipboardListIcon, CompassIcon, GemIcon, HomeIcon, IndianRupeeIcon, LandmarkIcon, LockIcon, MapPinIcon,
  MapPinnedIcon, NavigationIcon, PhoneIcon, PlugIcon, PlusIcon, ReceiptTextIcon, ScaleIcon, ScrollTextIcon,
  SearchIcon, Settings2Icon, ShieldCheckIcon, ShoppingBagIcon, StoreIcon, TagIcon, UserIcon, UsersIcon,
  BookOpenIcon, CheckCheckIcon, CrosshairIcon,
} from "lucide-react";
import { formatGrams, formatINR, formatINRCompact, formatRate } from "@jewelroute/shared";
import { Avatar, Btn, Chip, CountBadge, Dot, Kbd } from "@/components/app/chrome";
import { IconBubble } from "@/components/app/timeline";
import { Highlight, Property } from "@/components/app/record";
import { PurityTag } from "@/components/jr/money";
import { cn } from "@/lib/utils";
import { AGENTS, ANTIQUE, ANTIQUE_PRICE, ATTENTION, IMG, ISSUED_AT, KADA, KADA_PRICE, KUNDAN, KUNDAN_PRICE, MEMO, MEMO_TOTAL, METRICS, ORDER, ORDER_LINES, RATE_22K, ROUTE, TEMPLE, TEMPLE_PRICE, WORKSPACE } from "./data";
import { Feed } from "./feed";
import { FenceMap, ObjectSquare, PhoneFrame, Photo, TINT } from "./kit";

/* ======================================================================================
 * Manager — Priya's Home
 * ====================================================================================== */
const NAV = [
  { items: [{ label: "Home", icon: HomeIcon, tint: TINT.home, active: true }] },
  { label: "Field", items: [{ label: "Visits", icon: MapPinnedIcon, tint: TINT.visits }, { label: "Agents", icon: UsersIcon, tint: TINT.agents }, { label: "Shops", icon: StoreIcon, tint: TINT.shops }] },
  { label: "Sales", items: [{ label: "Orders", icon: ReceiptTextIcon, tint: TINT.orders }, { label: "Memos", icon: ScrollTextIcon, tint: TINT.memos }, { label: "Samples", icon: GemIcon, tint: TINT.samples }] },
  { label: "Workspace", items: [{ label: "Catalog", icon: BoxesIcon, tint: TINT.catalog }, { label: "Integrations", icon: PlugIcon, tint: TINT.integrations }, { label: "Settings", icon: Settings2Icon, tint: TINT.settings }] },
];

export function AppSidebar({ active = "Home" }: { active?: string }) {
  return (
    <aside className="hidden w-[216px] shrink-0 flex-col border-r border-line bg-sidebar-bg lg:flex">
      <div className="flex h-[52px] items-center gap-2 px-3">
        <span className="grid size-6 place-items-center rounded-[6px] bg-ink text-[11px] font-semibold text-white">A</span>
        <span className="text-[14px] font-semibold text-ink">{WORKSPACE}</span>
        <ChevronDownIcon className="size-3.5 text-ink-3" />
      </div>
      <div className="px-3 pb-2">
        <div className="flex h-8 items-center gap-2 rounded-lg border border-line-strong bg-white px-2.5 text-[14px] text-ink-3"><SearchIcon className="size-4" />Search<span className="ml-auto"><Kbd>⌘K</Kbd></span></div>
      </div>
      <nav className="flex-1 px-3">
        {NAV.map((g, gi) => (
          <div key={gi} className={cn(g.label && "mt-4")}>
            {g.label && <div className="mb-1 px-2 text-[13px] text-ink-3">{g.label}</div>}
            {g.items.map((n) => (
              <div key={n.label} className={cn("flex h-[30px] items-center gap-2 rounded-md px-2 text-[14px] text-ink", n.label === active && "bg-active font-medium")}>
                <ObjectSquare icon={n.icon} tint={n.tint} />{n.label}
              </div>
            ))}
          </div>
        ))}
      </nav>
      <div className="border-t border-line px-3 py-2.5">
        <div className="flex h-[30px] items-center gap-2 px-2 text-[13px] text-ink-2"><span className="size-2 rounded-full bg-gold" />22K today<span className="num ml-auto font-medium text-gold-ink">{formatRate(RATE_22K)}</span></div>
        <div className="flex h-[30px] items-center gap-2 px-2 text-[13px] text-ink-2"><Avatar name="Priya Mehta" size={20} />Priya Mehta</div>
      </div>
    </aside>
  );
}

export function RouteMap() {
  const done = [{ x: 96, y: 70 }, { x: 330, y: 52 }];
  const planned = [{ x: 176, y: 150 }, { x: 410, y: 142 }, { x: 252, y: 196 }, { x: 60, y: 186 }];
  return (
    <svg viewBox="0 0 480 240" className="block h-full w-full" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Map of today's visits across Karol Bagh">
      <rect width="480" height="240" fill="#f4f4f2" />
      <g fill="#ebebe8"><rect x="20" y="96" width="120" height="58" rx="3" /><rect x="216" y="8" width="150" height="46" rx="3" /><rect x="300" y="168" width="160" height="62" rx="3" /><rect x="380" y="30" width="90" height="70" rx="3" /></g>
      <g stroke="#fff" strokeWidth="11" fill="none" strokeLinecap="round"><path d="M-10 170 C 110 150, 230 190, 490 130" /><path d="M170 -10 L 210 250" /><path d="M-10 74 L 490 84" /><path d="M360 -10 L 372 250" /></g>
      <path d="M96 70 L 214 120 L 330 52" stroke="#2f6bf2" strokeWidth="2" strokeDasharray="4 4" fill="none" opacity=".55" />
      {planned.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="7" fill="#1c1d1f" stroke="#fff" strokeWidth="2.5" />)}
      {done.map((p, i) => <g key={i}><circle cx={p.x} cy={p.y} r="9" fill="#fff" stroke="#2c7a54" strokeWidth="2.5" /><circle cx={p.x} cy={p.y} r="3.5" fill="#2c7a54" /></g>)}
      <circle cx="214" cy="120" r="16" fill="rgb(47 107 242 / .15)" /><circle cx="214" cy="120" r="7.5" fill="#2f6bf2" stroke="#fff" strokeWidth="2.5" />
      <rect x="226" y="108" width="104" height="22" rx="11" fill="#fff" stroke="#e3e3e3" />
      <text x="236" y="123" fontSize="11" fontWeight="600" fill="#1c1d1f" fontFamily="var(--font-ui)">Rahul · Sharma</text>
    </svg>
  );
}

export function ManagerView({ highlight, metrics = 5 }: { highlight?: string; metrics?: 4 | 5 } = {}) {
  return (
    <div className="flex h-full bg-white text-ink">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-line px-5">
          <ObjectSquare icon={HomeIcon} tint={TINT.home} size={20} />
          <span className="text-[15px] font-medium">Home</span>
          <div className="ml-auto"><Btn variant="primary" icon={PlusIcon} tabIndex={-1}>Assign visit</Btn></div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden px-4 py-4 sm:px-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[18px] font-semibold tracking-[-0.01em]">Good afternoon, Priya</div>
              <div className="text-[13px] text-ink-2">Wednesday, 21 October</div>
            </div>
            <div className="hidden items-center gap-1 sm:flex">
              <Btn size="sm" icon={ChevronLeftIcon} aria-label="Previous day" tabIndex={-1} />
              <Btn size="sm" icon={CalendarIcon} tabIndex={-1}>Today</Btn>
              <Btn size="sm" variant="ghost" icon={ChevronRightIcon} aria-label="Next day" tabIndex={-1} />
            </div>
          </div>

          <dl className={cn("mt-4 grid grid-cols-2 overflow-hidden rounded-[10px] border border-line sm:grid-cols-4", metrics === 5 && "xl:grid-cols-5")}>
            {METRICS.slice(0, metrics).map((m, i) => (
              <div key={m.label} className={cn("min-w-0 border-line px-3.5 py-3", i % 2 === 1 && "border-l", i === 2 && "sm:border-l", i >= 2 && "max-sm:border-t", i === 4 && "hidden border-l xl:block")}>
                <dt className="flex items-center gap-1.5 truncate text-[13px] text-ink-2">
                  {m.tone === "danger" && <span className="size-1.5 shrink-0 rounded-full bg-danger" />}
                  {m.tone === "warn" && <span className="size-1.5 shrink-0 rounded-full bg-warn" />}
                  {m.label}
                </dt>
                <dd className={cn("num mt-1 text-[20px] font-medium tracking-[-0.01em]", m.tone === "gold" && "text-gold-ink", m.tone === "danger" && "text-danger", m.tone === "warn" && "text-warn")}>
                  {"paise" in m ? formatINRCompact(m.paise) : <>{m.count[0]}<span className="text-ink-3"> / {m.count[1]}</span></>}
                </dd>
                <dd className="mt-0.5 truncate text-[12.5px] text-ink-3">{m.sub}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2 text-[14px] font-medium">Needs attention <span className="num text-[13px] font-normal text-ink-3">{ATTENTION.length}</span></div>
              <div className="divide-y divide-line overflow-hidden rounded-[10px] border border-line">
                {ATTENTION.map((a) => (
                  <div key={a.title} className="flex h-10 items-center gap-2.5 px-3 text-[13.5px]">
                    <IconBubble icon={a.tone === "red" ? ScrollTextIcon : ReceiptTextIcon} tone={a.tone} />
                    <span className="truncate font-medium">{a.title}</span>
                    <span className={cn("num ml-auto shrink-0 font-medium", a.tone === "red" ? "text-danger" : "text-ink")}>{formatINRCompact(a.paise)}</span>
                    <span className="hidden w-12 shrink-0 text-right text-[12.5px] text-ink-3 sm:block">{a.age}</span>
                  </div>
                ))}
              </div>

              <div className="mt-5 mb-2 flex items-center gap-2 text-[14px] font-medium">Live field activity<span className="ml-auto flex items-center gap-1.5 text-[12.5px] font-normal text-ink-3"><span className="size-1.5 rounded-full bg-verified" />Updates every 10 s</span></div>
              <div className="grid overflow-hidden rounded-[10px] border border-line md:grid-cols-[minmax(0,1fr)_260px]">
                <div className="relative hidden h-[204px] md:block"><RouteMap /></div>
                <ul className="divide-y divide-line md:border-l md:border-line">
                  {AGENTS.map((a) => (
                    <li key={a.name} className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar name={a.name} size={20} />
                        <span className="text-[13.5px] font-medium">{a.name}</span>
                        <span className="num ml-auto text-[12px] text-ink-3">{a.done}/{a.total}</span>
                      </div>
                      <div className="mt-0.5 truncate pl-7 text-[12.5px] text-ink-2">{a.at}</div>
                      <div className="mt-1.5 ml-7 h-1 overflow-hidden rounded-full bg-[#f1f1f2]"><div className="h-full rounded-full bg-verified" style={{ width: `${(a.done / a.total) * 100}%` }} /></div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="hidden min-w-0 xl:block">
              <div className="mb-2 flex items-center text-[14px] font-medium">Recent activity<span className="ml-auto text-[13px] font-normal text-ink-2">All activity</span></div>
              <Feed
                label="Today"
                highlight={highlight}
                items={[
                  { id: "a1", lead: <IconBubble icon={ReceiptTextIcon} tone="amber" />, text: <><b>ORD-2026-00043</b> needs approval: over Mehta Jewellers&apos; credit limit</>, time: "12:01 pm" },
                  { id: "a2", lead: <IconBubble icon={ShieldCheckIcon} tone="green" />, text: <><b>Sharma Jewellers</b> acknowledged <b>{MEMO.number}</b> by QR</>, time: MEMO.ackAt },
                  {
                    id: "a3", lead: <Avatar name="Rahul Verma" size={20} />, time: MEMO.issuedAt,
                    text: <><b>Rahul Verma</b> left 2 pieces on memo with <b>Sharma Jewellers</b></>,
                    body: (
                      <div className="flex items-center gap-2.5">
                        <Photo src={KADA.img} alt="" className="size-9 rounded-md" sizes="36px" />
                        <Photo src={IMG.jhumka} alt="" className="size-9 rounded-md" sizes="36px" />
                        <div className="min-w-0 text-[12.5px]"><div className="font-medium text-ink">{MEMO.number}</div><div className="text-ink-3">Due back {MEMO.due}</div></div>
                        <span className="num ml-auto text-[13px] font-medium text-gold-ink">{formatINRCompact(MEMO_TOTAL)}</span>
                      </div>
                    ),
                  },
                  { id: "a4", lead: <Avatar name="Rahul Verma" size={20} />, text: <><b>Rahul Verma</b> booked <b>{ORDER.number}</b> for {formatINRCompact(ORDER.totalPaise)}, confirmed</>, time: ORDER.at },
                  { id: "a5", lead: <IconBubble icon={MapPinIcon} tone="blue" />, text: <><b>Arjun Singh</b> checked in at <b>Royal Gems</b>, 22 m from the shop</>, time: "11:50 am" },
                  { id: "a6", lead: <IconBubble icon={MapPinIcon} tone="blue" />, text: <><b>Rahul Verma</b> checked in at <b>Sharma Jewellers</b>, 38 m from the shop</>, time: "11:42 am" },
                ]}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ======================================================================================
 * Field agent — Rahul's phone: today's route, check-in, visit workspace
 * ====================================================================================== */
export function PhoneTop({ title, back }: { title: string; back?: string }) {
  return (
    <div className="grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-line px-3">
      <span className="flex items-center gap-0.5 text-[13px] text-ink-2">{back && <><ChevronLeftIcon className="size-4" />{back}</>}</span>
      <span className="text-[15px] font-semibold">{title}</span>
      <span className="flex justify-end">{back ? <PhoneIcon className="size-4 text-ink-2" strokeWidth={1.75} /> : <Avatar name="Rahul Verma" size={22} />}</span>
    </div>
  );
}
export function Steps({ at }: { at: 0 | 1 | 2 | 3 }) {
  const s = ["Check in", "Arrival photo", "Sell"];
  return (
    <div className="mt-3 grid grid-cols-3 gap-1.5">
      {s.map((l, i) => (
        <div key={l}>
          <div className={cn("h-[3px] rounded-full", i < at ? "bg-verified" : i === at ? "bg-ink" : "bg-line")} />
          <div className={cn("mt-1.5 flex items-center gap-0.5 whitespace-nowrap text-[11px]", i < at ? "text-verified" : i === at ? "font-medium text-ink" : "text-ink-3")}>{i < at && <CheckIcon className="size-3" />}{l}</div>
        </div>
      ))}
    </div>
  );
}
export function VisitHead({ status, tone }: { status: string; tone: "grey" | "blue" }) {
  return (
    <div className="px-4 pt-3">
      <div className="flex items-center gap-2 text-[12px] text-ink-3"><Dot tone={tone} className="text-[12px] text-ink-2">{status}</Dot>Planned 10:30 am<span>Stop 1</span></div>
      <div className="mt-1.5 text-[21px] font-semibold leading-tight tracking-[-0.01em]">Sharma Jewellers</div>
      <div className="mt-0.5 text-[12.5px] text-ink-2">Rakesh Sharma, Karol Bagh</div>
    </div>
  );
}
const TABS = [["Today", HomeIcon], ["Visits", MapPinnedIcon], ["Catalog", BookOpenIcon], ["Profile", UserIcon]] as const;
export function TabBar() {
  return (
    <div className="mt-auto grid h-[52px] shrink-0 grid-cols-4 border-t border-line bg-white">
      {TABS.map(([l, I], i) => (
        <div key={l} className={cn("flex flex-col items-center justify-center gap-0.5 text-[10.5px]", i === 0 ? "font-medium text-ink" : "text-ink-3")}><I className="size-[18px]" strokeWidth={1.75} />{l}</div>
      ))}
    </div>
  );
}

export function PhoneToday() {
  return (
    <PhoneFrame time="10:20" className="h-[600px]">
      <PhoneTop title="Today" />
      <div className="px-4 pt-3">
        <div className="text-[12.5px] text-ink-2">Wed, 21 Oct · 4 stops</div>
        <div className="mt-2.5 grid grid-cols-2 divide-x divide-line rounded-[10px] border border-line">
          {/* Same custody strip as the real Today: both values are custody, both gold; counts beside them. */}
          <div className="min-w-0 px-3 py-2"><div className="text-[11.5px] text-ink-3">In your bag</div><div className="mt-0.5 flex items-baseline gap-1.5 whitespace-nowrap"><span className="num text-[15px] font-medium text-gold-ink">{formatINRCompact(AGENTS[0].bagPaise)}</span><span className="text-[11.5px] text-ink-3">11 pieces</span></div></div>
          <div className="min-w-0 px-3 py-2"><div className="text-[11.5px] text-ink-3">On memo</div><div className="mt-0.5 flex items-baseline gap-1.5 whitespace-nowrap"><span className="num text-[15px] font-medium text-gold-ink">{formatINRCompact(ATTENTION[0].paise)}</span><span className="text-[11.5px] text-danger">1 overdue</span></div></div>
        </div>
      </div>
      <div className="mt-4 px-4 text-[13px] font-semibold">Route</div>
      <ul className="mt-1.5 divide-y divide-line border-y border-line">
        {ROUTE.map((r, i) => (
          <li key={r.n} className={cn("flex items-center gap-3 px-4 py-2.5", i === 0 && "border-l-2 border-l-ink bg-hover pl-[14px]")}>
            <span className={cn("num grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold", i === 0 ? "bg-ink text-white" : "bg-[#f1f1f2] text-ink-2")}>{r.n}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-medium">{r.shop}</div>
              <div className="truncate text-[12px] text-ink-3"><span className="num">{r.time}</span> · {r.area}</div>
              {i === 0 && <div className="mt-1.5 inline-flex h-7 items-center gap-1 rounded-lg bg-ink px-2.5 text-[12px] font-medium text-white"><NavigationIcon className="size-3" />Open visit</div>}
            </div>
            {r.note && <Chip tone={r.note.includes("overdue") ? "red" : "grey"} className="text-[11px]">{r.note.includes("overdue") ? "Memo overdue" : "Next"}</Chip>}
            {i === 0 && !r.note && <Chip tone="grey" className="text-[11px]">Next</Chip>}
          </li>
        ))}
      </ul>
      <TabBar />
    </PhoneFrame>
  );
}

export function PhoneCheckIn() {
  return (
    <PhoneFrame time="11:42" className="h-[600px]">
      <PhoneTop title="Sharma Jewellers" back="Today" />
      <VisitHead status="Planned" tone="grey" />
      <div className="px-4"><Steps at={0} /></div>
      <div className="mx-4 mt-3 overflow-hidden rounded-[12px] border border-line"><FenceMap compact agent={{ x: 352, y: 122 }} /></div>
      <div className="mx-4 mt-2.5 flex gap-2.5 rounded-[12px] border border-line bg-white px-3 py-2.5">
        <CircleCheckIcon className="mt-0.5 size-5 shrink-0 text-ink-3" strokeWidth={1.75} />
        <div className="min-w-0 flex-1"><div className="flex items-baseline gap-2 text-[14px] font-semibold"><span className="text-ink">You&apos;re at Sharma Jewellers</span><span className="num ml-auto text-ink">38 m</span></div><div className="text-[12px] text-ink-2">Inside the 100 m zone. Check in to start the visit.</div></div>
      </div>
      <div className="mt-auto border-t border-line px-4 pt-3 pb-4">
        <div className="flex h-11 items-center justify-center gap-2 rounded-[10px] bg-ink text-[15px] font-medium text-white"><CrosshairIcon className="size-4" />Check in</div>
        <div className="mt-2 text-center text-[11.5px] text-ink-3">Accuracy ±9 m · location checked on the server</div>
      </div>
    </PhoneFrame>
  );
}

export function PhoneVisit({ className }: { className?: string }) {
  const actions = [
    { icon: BookOpenIcon, l: "Browse catalog", r: "Today's prices" },
    { icon: ShoppingBagIcon, l: "Create order", r: "1 confirmed" },
    { icon: GemIcon, l: "Leave on memo", r: "2 acknowledged" },
  ];
  return (
    <PhoneFrame time="11:59" className={cn("h-[600px]", className)}>
      <PhoneTop title="Sharma Jewellers" back="Today" />
      <VisitHead status="In visit" tone="blue" />
      <div className="px-4"><Steps at={2} /></div>
      <div className="mx-4 mt-3 flex items-center gap-2 rounded-[10px] border border-verified/25 bg-verified-soft px-3 py-2 text-[13px]">
        <MapPinIcon className="size-4 shrink-0 text-verified" strokeWidth={1.75} /><span className="whitespace-nowrap font-medium text-verified">Location verified · 38 m</span><span className="num ml-auto whitespace-nowrap text-[12px] text-ink-2">11:42 am</span>
      </div>
      <div className="mx-4 mt-2 flex items-center gap-3 rounded-[10px] border border-line p-2">
        <Photo src={IMG.counter} alt="Arrival photo of the shop counter" className="size-12 shrink-0 rounded-lg" sizes="48px" />
        <div className="min-w-0 text-[12px] leading-snug">
          <div className="flex items-center gap-1 text-[13px] font-medium"><CheckIcon className="size-3.5 text-verified" />Arrival photo</div>
          <div className="text-ink-2">11:43 am, GPS verified 38 m</div>
          <div className="num truncate text-ink-3">SHA-256 cc23231c</div>
        </div>
      </div>
      <div className="mt-3 px-4 text-[13px] font-semibold">Actions</div>
      <ul className="mt-1 divide-y divide-line border-y border-line">
        {actions.map((a) => (
          <li key={a.l} className="flex h-11 items-center gap-3 whitespace-nowrap px-4 text-[14px]">
            <a.icon className="size-[18px] text-ink-2" strokeWidth={1.6} />
            {a.l}
            <span className="ml-auto text-[12px] text-ink-3">{a.r}</span>
            <ChevronRightIcon className="size-3.5 text-ink-3" />
          </li>
        ))}
      </ul>
      <div className="mt-auto border-t border-line px-4 pt-3 pb-4">
        <div className="flex h-11 items-center justify-center gap-2 rounded-[10px] bg-ink text-[15px] font-medium text-white"><CheckCheckIcon className="size-4" />Complete visit</div>
      </div>
    </PhoneFrame>
  );
}

/** The sale workspace inside Rahul's visit (mirrors field/sale/sale-view: Order | Memo switch,
 *  catalogue priced at today's rate, the running total in the bottom bar). */
export function PhoneSale({ className }: { className?: string }) {
  const designs = [
    { d: TEMPLE, qty: 1, p: TEMPLE_PRICE.unitPricePaise },
    { d: ANTIQUE, qty: 2, p: ANTIQUE_PRICE.unitPricePaise },
    { d: KADA, qty: 0, p: KADA_PRICE.unitPricePaise },
    { d: KUNDAN, qty: 0, p: KUNDAN_PRICE.unitPricePaise },
  ];
  const weight = ORDER_LINES.reduce((a, l) => a + l.qty * l.design.netWeightMg, 0);
  return (
    <PhoneFrame time="11:49" className={cn("h-[600px]", className)}>
      <div className="grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-3">
        <span className="flex items-center gap-0.5 text-[13px] text-ink-2"><ChevronLeftIcon className="size-4" />Visit</span>
        <span className="text-[15px] font-semibold">New order</span>
        <span />
      </div>
      <div className="border-b border-line px-3 pb-2.5">
        <div className="grid grid-cols-2 rounded-lg bg-sunken p-0.5 text-[13px] font-medium">
          <span className="flex h-8 items-center justify-center rounded-md border border-line-strong bg-white text-ink">Order<span className="num ml-1.5 text-ink-3">3</span></span>
          <span className="flex h-8 items-center justify-center text-ink-2">Memo</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[11.5px] text-ink-2"><span className="size-1.5 rounded-full bg-gold" />22K <span className="num font-medium text-gold-ink">{formatRate(RATE_22K)}</span><span className="text-ink-3">· today, set 8:45 am</span></div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-2 overflow-hidden px-3 pt-2.5">
        {designs.map(({ d, qty, p }) => (
          <div key={d.design} className="overflow-hidden rounded-[10px] border border-line">
            <div className="relative">
              <Photo src={d.img} alt="" className="aspect-square w-full" sizes="140px" />
              {qty > 0 && <span className="num absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-ink text-[11px] font-semibold text-white">{qty}</span>}
            </div>
            <div className="px-2 py-1.5">
              <div className="truncate text-[12px] font-medium text-ink">{d.design}</div>
              <div className="flex items-center justify-between gap-1 text-[11px] text-ink-3"><span className="num">{formatGrams(d.netWeightMg)}</span><span className="num font-medium text-gold-ink">{formatINRCompact(p)}</span></div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto border-t border-line px-3 pt-2.5 pb-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[12px] text-ink-2"><span className="num font-medium text-ink">3 items</span><span className="num"> · {formatGrams(weight)}</span></div>
            <div className="num text-[16px] font-semibold leading-tight text-gold-ink">{formatINR(ORDER.totalPaise)}</div>
          </div>
          <div className="flex h-10 items-center rounded-[10px] bg-ink px-3.5 text-[14px] font-medium text-white">Review order</div>
        </div>
      </div>
    </PhoneFrame>
  );
}

export function FieldView() {
  return (
    <div className="flex h-full items-start justify-center gap-8 overflow-hidden bg-sunken px-4 pt-5 sm:pt-6 xl:gap-10">
      <div className="hidden lg:block"><PhoneToday /></div>
      <div className="hidden md:block"><PhoneCheckIn /></div>
      <PhoneVisit />
    </div>
  );
}

/* ======================================================================================
 * Sample custody — the record of AJ-S-000123
 * ====================================================================================== */
function LedgerMove({ who, verb, to, seq, time, children, accent = "border-l-line-strong" }: { who: string; verb: string; to?: string; seq: number; time: string; children: React.ReactNode; accent?: string }) {
  return (
    <li className="relative flex gap-2.5 pb-3 pl-10">
      <span className="mt-[3px] shrink-0"><Avatar name={who} size={18} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2 text-[13.5px] leading-6 text-ink-2">
          <p className="min-w-0 flex-1"><b className="font-medium text-ink">{who}</b> {verb}{to && <> <b className="font-medium text-ink">{to}</b></>}</p>
          <CountBadge n={`#${seq}`} className="mt-[3px] hidden sm:inline-flex" />
          <span className="num shrink-0 pt-0.5 text-[12.5px] text-ink-3">{time}</span>
        </div>
        <div className={cn("mt-1 rounded-[10px] border border-line border-l-2 px-3 py-2", accent)}>{children}</div>
      </div>
    </li>
  );
}
function LedgerHolder({ icon, name, role, since, now }: { icon: React.ReactNode; name: string; role?: string; since: string; now?: boolean }) {
  return (
    <li className="relative flex items-center gap-3 pb-3">
      <span className={cn("relative z-[1] grid size-7 shrink-0 place-items-center rounded-lg border bg-white", now ? "border-gold/60" : "border-line-strong")}>{icon}</span>
      <span className="text-[14px] font-medium text-ink">{name}</span>
      {role && <span className="text-[12.5px] text-ink-3">{role}</span>}
      {now && <Chip tone="gold">Holds now</Chip>}
      <span className="num ml-auto text-[12.5px] text-ink-3">since {since}</span>
    </li>
  );
}

export function CustodyView() {
  return (
    <div className="flex h-full bg-white text-ink">
      <AppSidebar active="Samples" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-10 shrink-0 items-center border-b border-line px-4 text-[13px] text-ink-2"><ChevronLeftIcon className="size-3.5" />Samples</div>
        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-[320px] shrink-0 overflow-hidden border-r border-line md:block">
            <div className="flex items-center gap-3 border-b border-line px-4 pt-4 pb-3.5">
              <Photo src={KADA.img} alt="" className="size-10 rounded-lg" sizes="40px" />
              <div className="min-w-0"><div className="text-[18px] leading-tight font-semibold tracking-[-0.01em]">{KADA.tag}</div><div className="text-[13px] text-ink-2">{KADA.design}</div></div>
            </div>
            <div className="border-b border-line px-4 py-3"><Photo src={KADA.img} alt="Rajwada kada, 22K gold bangles" className="aspect-[16/10] w-full rounded-xl" sizes="290px" /></div>
            <div className="px-4 py-3">
              <div className="mb-1 flex items-center gap-1 text-[14px] font-medium">Sample details<ChevronDownIcon className="size-3.5 text-ink-3" /></div>
              <dl className="[&>div]:min-h-8 [&>div]:py-[5px] [&_dd]:text-[13.5px] [&_dt]:w-[118px] [&_dt]:text-[13.5px]">
                <Property icon={TagIcon} label="Design"><span className="block">{KADA.design}</span><span className="num block whitespace-nowrap text-[12.5px] text-ink-3">{KADA.code}</span></Property>
                <Property icon={GemIcon} label="Purity"><PurityTag purity={KADA.purity} /></Property>
                <Property icon={ScaleIcon} label="Net weight"><span className="num">{formatGrams(KADA.netWeightMg)}</span></Property>
                <Property icon={IndianRupeeIcon} label="Value today"><span className="num font-medium text-gold-ink">{formatINR(KADA_PRICE.unitPricePaise)}</span></Property>
                <Property icon={UserIcon} label="Custodian"><span className="inline-flex items-center gap-1.5"><Avatar name="Sharma Jewellers" size={18} square />Sharma Jewellers</span></Property>
                <Property icon={MapPinIcon} label="Location">Bank Street, Karol Bagh</Property>
                <Property icon={ScrollTextIcon} label="Memo">{MEMO.number}</Property>
                <Property icon={CalendarIcon} label="Due back">{MEMO.due}</Property>
              </dl>
            </div>
          </aside>
          <section className="min-w-0 flex-1 overflow-hidden">
            <div className="flex items-center gap-3 border-b border-line px-4 py-3 md:hidden">
              <Photo src={KADA.img} alt="" className="size-10 rounded-lg" sizes="40px" />
              <div className="min-w-0"><div className="text-[17px] leading-tight font-semibold">{KADA.tag}</div><div className="text-[13px] text-ink-2">{KADA.design} · <span className="text-gold-ink">22K</span></div></div>
            </div>
            <div className="flex h-12 items-end gap-1 border-b border-line px-4">
              <span className="relative mb-1.5 inline-flex h-8 items-center gap-1.5 rounded-lg bg-active px-2.5 text-[14px] font-medium"><ClipboardListIcon className="size-4" strokeWidth={1.6} />Custody ledger<CountBadge n={3} /><span className="absolute right-2 -bottom-1.5 left-2 h-0.5 rounded-full bg-ink" /></span>
              <span className="mb-1.5 inline-flex h-8 items-center gap-1.5 px-2.5 text-[14px] text-ink-2"><CompassIcon className="size-4" strokeWidth={1.6} />Activity<CountBadge n={6} /></span>
            </div>
            <div className="px-4 py-4 sm:px-5">
              <div className="mb-2.5 text-[14px] font-medium">Highlights</div>
              {/* Cards when the record pane is wide enough, compact rows when it is not (container query). */}
              <div className="@container">
                <div className="hidden grid-cols-2 gap-2.5 @[440px]:grid @[860px]:grid-cols-4">
                  <Highlight label="Value today" icon={IndianRupeeIcon} tone="gold" sub={`${formatRate(RATE_22K)} · net ${formatGrams(KADA.netWeightMg)}`}><span className="num">{formatINR(KADA_PRICE.unitPricePaise)}</span></Highlight>
                  <Highlight label="Held by" icon={StoreIcon} sub={`since ${MEMO.issuedAt} today`}>Sharma Jewellers</Highlight>
                  <Highlight label="On memo" icon={ScrollTextIcon} sub={`Due back ${MEMO.due}`}><span className="num whitespace-nowrap">{MEMO.number}</span></Highlight>
                  <Highlight label="Acknowledged" icon={ShieldCheckIcon} sub={`${MEMO.ackAt} on the retailer's phone`}>By QR confirmation</Highlight>
                </div>
                <dl className="divide-y divide-line rounded-[10px] border border-line px-3 text-[13.5px] @[440px]:hidden">
                  {([["Value today", <span key="v" className="num font-medium text-gold-ink">{formatINR(KADA_PRICE.unitPricePaise)}</span>], ["Held by", "Sharma Jewellers"], ["On memo", <span key="m" className="num">{MEMO.number}</span>], ["Due back", MEMO.due], ["Acknowledged", <span key="a" className="text-verified">QR · {MEMO.ackAt}</span>]] as const).map(([k, v]) => (
                    <div key={k} className="flex h-9 items-center justify-between gap-3"><dt className="text-ink-2">{k}</dt><dd className="truncate text-right font-medium text-ink">{v}</dd></div>
                  ))}
                </dl>
              </div>

              <div className="mt-5 mb-3 flex items-center gap-2 text-[14px] font-medium">Custody ledger<span className="num text-[13px] font-normal text-ink-3">3</span></div>
              <ol className="relative">
                <span className="absolute top-4 bottom-8 left-[13.5px] border-l border-dotted border-line-strong" aria-hidden />
                <LedgerHolder icon={<LandmarkIcon className="size-3.5 text-ink-2" />} name="Vault" role="Karol Bagh" since="7 Oct, 11:00 am" />
                <LedgerMove who="Priya Mehta" verb="issued this piece to" to="Rahul Verma" seq={2} time={ISSUED_AT}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-2"><span className="font-medium text-ink">Issued to agent</span><span>Morning issue · 11 pieces</span><span className="num rounded-[5px] border border-line px-1.5 text-[11.5px] text-ink-3">evt_01JB8M4F…R9K3Z</span></div>
                </LedgerMove>
                <LedgerHolder icon={<Avatar name="Rahul Verma" size={18} />} name="Rahul Verma" role="Field agent" since={ISSUED_AT} />
                <LedgerMove who="Rahul Verma" verb="left this piece on memo with" to="Sharma Jewellers" seq={3} time={MEMO.issuedAt} accent="border-l-gold">
                  <div className="grid gap-x-4 gap-y-1.5 text-[12.5px] sm:grid-cols-2">
                    <div className="flex items-center gap-1.5 text-ink-2"><ScrollTextIcon className="size-3.5 text-ink-3" /><span className="font-medium text-ink">{MEMO.number}</span>due {MEMO.due}</div>
                    <div className="flex items-center gap-1.5 text-ink-2"><MapPinIcon className="size-3.5 text-ink-3" />Visit · checked in 38 m from shop</div>
                    <div className="flex items-center gap-1.5 text-verified"><ShieldCheckIcon className="size-3.5" />Acknowledged by QR · 11:59 am</div>
                    <div className="flex items-center gap-1.5 text-ink-2"><CameraIcon className="size-3.5 text-ink-3" />Arrival photo · 11:43 am</div>
                  </div>
                </LedgerMove>
                <LedgerHolder icon={<StoreIcon className="size-3.5 text-gold-ink" />} name="Sharma Jewellers" role="Retailer" since="11:58 am" now />
              </ol>
              <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-ink-3"><LockIcon className="size-3.5" />Append-only ledger. Each move is written with the visit and event that caused it.</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

