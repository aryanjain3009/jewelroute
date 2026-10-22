"use client";
/**
 * Hero: eyebrow, two-line headline, one paragraph, two CTAs, then the product switch
 * `Manager | Field Agent | Sample Custody` over one stage that shows the real JewelRoute UI for each:
 * Priya's admin Home, Rahul's phone (Today → the visit advancing check-in → photo → order → memo →
 * the sale workspace) and the custody record of AJ-S-000123.
 *
 * Motion (emil-design-eng): the switch's active pill is a clip-path layer (220 ms strong ease-out);
 * panels cross-fade with CSS transitions (enter 240 ms: opacity + 6 px rise + 2 px blur that clears;
 * exit 140 ms opacity) so rapid switching retargets instead of restarting. The switch auto-advances
 * (a linear progress line in the active segment shows how long is left), pauses while hovered,
 * focused, off-screen or in a background tab, and stops for good the moment the visitor picks a tab.
 * Reduced motion: no auto-advance, the visit shows its final state, switches are instant.
 * Every frame is inert sample data (labelled); the tabs are the only controls.
 */
import * as React from "react";
import Link from "next/link";
import { useInView, useReducedMotion } from "motion/react";
import { CameraIcon, CheckCheckIcon, CheckIcon, ChevronRightIcon, CircleCheckIcon, CrosshairIcon, GemIcon, LayoutDashboardIcon, ScrollTextIcon, ShieldCheckIcon, ShoppingBagIcon, SmartphoneIcon } from "lucide-react";
import { formatGrams, formatINR, formatINRCompact, formatRate } from "@jewelroute/shared";
import { SegmentedTabs, SegmentedTabsContent, SegmentedTabsList, type SegmentedItem } from "@/components/ui/origin/segmented-tabs";
import { cn } from "@/lib/utils";
import { ATTENTION, KADA, MEMO, METRICS, ORDER, ORDER_LINES, RATE_22K, VAULT, IMG } from "./data";
import { FenceMap, PhoneFrame, Photo } from "./kit";
import { AppWindow, CtaLink, INSET, RAIL, SampleTag } from "./primitives";
import { CustodyView, ManagerView, PhoneSale, PhoneToday, PhoneTop, Steps, VisitHead } from "./views";

type TabId = "manager" | "field" | "custody";
const TABS: (SegmentedItem & { value: TabId })[] = [
  { value: "manager", label: "Manager", icon: LayoutDashboardIcon },
  { value: "field", label: "Field agent", icon: SmartphoneIcon },
  { value: "custody", label: "Sample custody", icon: GemIcon },
];
/** How long each tab stays before the switch moves on (the field tab plays the visit first). */
const DWELL: Record<TabId, number> = { manager: 6000, field: 8600, custody: 6000 };

/* ---------- Field app: Rahul's visit at Sharma Jewellers, advancing once per activation ---------- */
const LAST = 3;
const CLOCK = ["11:42", "11:43", "11:51", "11:59"] as const;
const STEP_MS = 1800;

function useVisitStep(active: boolean, reduce: boolean) {
  // Starts at 0 on the server and the first client render (no hydration mismatch); effects move it.
  const [step, setStep] = React.useState(0);
  React.useEffect(() => {
    if (reduce) { setStep(LAST); return; }
    if (!active) { const t = setTimeout(() => setStep(0), 200); return () => clearTimeout(t); }
  }, [active, reduce]);
  React.useEffect(() => {
    if (reduce || !active || step >= LAST) return;
    const t = setTimeout(() => setStep((s) => Math.min(LAST, s + 1)), step === 0 ? 1300 : STEP_MS);
    return () => clearTimeout(t);
  }, [active, reduce, step]);
  return step;
}

function PhoneAction({ icon: I, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="mt-auto border-t border-line px-4 pt-3 pb-4">
      <div className="flex h-11 items-center justify-center gap-2 rounded-[10px] bg-ink text-[15px] font-medium text-white"><I className="size-4" />{children}</div>
    </div>
  );
}

function PhoneBody({ step }: { step: number }) {
  if (step === 0) return (
    <>
      <div className="mx-4 mt-3 overflow-hidden rounded-[12px] border border-line"><FenceMap compact agent={{ x: 352, y: 122 }} /></div>
      <div className="mx-4 mt-2.5 flex gap-2.5 rounded-[12px] border border-line bg-white px-3 py-2.5">
        <CircleCheckIcon className="mt-0.5 size-5 shrink-0 text-ink-3" strokeWidth={1.75} />
        <div className="min-w-0 flex-1"><div className="flex items-baseline gap-2 text-[14px] font-semibold"><span className="text-ink">You&apos;re at Sharma Jewellers</span><span className="num ml-auto text-ink">38 m</span></div><div className="text-[12px] text-ink-2">Inside the 100 m zone. Check in to start the visit.</div></div>
      </div>
      <PhoneAction icon={CrosshairIcon}>Check in</PhoneAction>
    </>
  );
  if (step === 1) return (
    <>
      <div className="mx-4 mt-3 overflow-hidden rounded-[12px] border border-line">
        <Photo src={IMG.counter} alt="" className="aspect-[4/3] w-full" sizes="290px" />
        <div className="flex items-center gap-2 px-3 py-2 text-[12px]">
          <CameraIcon className="size-3.5 text-ink-3" />
          <span className="font-medium text-ink">Arrival photo</span>
          <span className="num ml-auto text-ink-3">11:43 am</span>
        </div>
      </div>
      <div className="mx-4 mt-2 text-[12px] leading-relaxed text-ink-2">Stamped on the server, 38 m from the shop · <span className="num">SHA-256 cc23231c</span></div>
      <PhoneAction icon={ShoppingBagIcon}>Continue to sale</PhoneAction>
    </>
  );
  if (step === 2) return (
    <>
      <div className="mx-4 mt-3 rounded-[12px] border border-line">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2"><span className="num text-[13px] font-semibold">{ORDER.number}</span><span className="ml-auto flex items-center gap-1 text-[12px] font-medium text-verified"><CheckIcon className="size-3.5" />Confirmed</span></div>
        <ul className="divide-y divide-line text-[12.5px]">
          {ORDER_LINES.map((l) => (
            <li key={l.design.code} className="flex items-center gap-2.5 px-3 py-2">
              <Photo src={l.design.img} alt="" className="size-8 rounded-md" sizes="32px" />
              <div className="min-w-0 flex-1"><div className="truncate font-medium text-ink">{l.design.design}</div><div className="num text-ink-3">{l.qty} × {formatGrams(l.design.netWeightMg)}</div></div>
              <span className="num text-ink">{formatINRCompact(l.qty * l.unitPaise)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[13px]"><span className="text-ink-2">Total with GST</span><span className="num font-semibold text-gold-ink">{formatINR(ORDER.totalPaise)}</span></div>
      </div>
      <div className="mx-4 mt-2 text-[12px] text-ink-2">Priced at 22K <span className="num">{formatRate(RATE_22K)}</span>, today&apos;s rate · within credit</div>
      <PhoneAction icon={ScrollTextIcon}>Leave on memo</PhoneAction>
    </>
  );
  return (
    <>
      <div className="mx-4 mt-3 rounded-[12px] border border-line">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2"><span className="num text-[13px] font-semibold">{MEMO.number}</span><span className="ml-auto text-[12px] text-ink-3">Due {MEMO.due}</span></div>
        <ul className="divide-y divide-line text-[12.5px]">
          {MEMO.items.map(({ piece, valuePaise }) => (
            <li key={piece.tag} className="flex items-center gap-2.5 px-3 py-2">
              <Photo src={piece.img} alt="" className="size-8 rounded-md" sizes="32px" />
              <div className="min-w-0 flex-1"><div className="truncate font-medium text-ink">{piece.design}</div><div className="num text-ink-3">{piece.tag}</div></div>
              <span className="num text-gold-ink">{formatINRCompact(valuePaise)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mx-4 mt-2.5 flex items-center gap-2 rounded-[10px] border border-verified/25 bg-verified-soft px-3 py-2 text-[13px] font-medium text-verified">
        <ShieldCheckIcon className="size-4 shrink-0" />Acknowledged by QR<span className="num ml-auto whitespace-nowrap font-normal">{MEMO.ackAt}</span>
      </div>
      <div className="mx-4 mt-2.5 rounded-[10px] border border-line px-3 py-2 text-[12.5px] max-md:hidden">
        <div className="text-ink-3">This visit</div>
        <div className="mt-1 flex items-center justify-between"><span className="num text-ink">{ORDER.number}</span><span className="num font-medium text-gold-ink">{formatINRCompact(ORDER.totalPaise)}</span></div>
        <div className="mt-0.5 flex items-center justify-between"><span className="num text-ink">{MEMO.number}</span><span className="text-ink-2">2 pieces on memo</span></div>
      </div>
      <PhoneAction icon={CheckCheckIcon}>Complete visit</PhoneAction>
    </>
  );
}

const PHONE_STATUS = [["Planned", "grey"], ["In visit", "blue"], ["In visit", "blue"], ["In visit", "blue"]] as const;

function VisitPhone({ active, reduce }: { active: boolean; reduce: boolean }) {
  const step = useVisitStep(active, reduce);
  return (
    <PhoneFrame time={CLOCK[step]} className="h-[560px] md:h-[600px]">
      <PhoneTop title="Sharma Jewellers" back="Today" />
      <VisitHead status={PHONE_STATUS[step][0]} tone={PHONE_STATUS[step][1]} />
      <div className="px-4"><Steps at={step === 0 ? 0 : step === 1 ? 1 : step === 2 ? 2 : 3} /></div>
      <div className="relative min-h-0 flex-1">
        {[0, 1, 2, 3].map((s) => (
          <div
            key={s}
            aria-hidden={s !== step}
            className={cn(
              "absolute inset-0 flex flex-col transition-[opacity,transform] ease-[cubic-bezier(0.23,1,0.32,1)]",
              s === step ? "translate-y-0 opacity-100 duration-[240ms]" : "pointer-events-none translate-y-1.5 opacity-0 duration-[120ms]",
            )}
          >
            <PhoneBody step={s} />
          </div>
        ))}
      </div>
    </PhoneFrame>
  );
}

/* ---------- Stage panels ---------- */
const STAGE_H = "h-[580px] md:h-[640px] lg:h-[660px]";
const WINDOW_BODY_H = "h-[538px] md:h-[598px] lg:h-[618px]"; // stage − title bar (36) − bottom gap (6)

function ManagerPanel() {
  return (
    <>
      <AppWindow title="aurum.jewelroute.app/admin" className="mx-auto max-w-[1180px] max-sm:hidden" bodyClassName={WINDOW_BODY_H}>
        <ManagerView highlight="a2" />
      </AppWindow>
      <MobileManager />
    </>
  );
}

/** Phones: a purpose-built crop of Priya's Home — the four numbers and what needs attention. */
function MobileManager() {
  return (
    <AppWindow title="aurum.jewelroute.app/admin" className="sm:hidden" bodyClassName={WINDOW_BODY_H}>
      <div className="flex h-full flex-col bg-white text-ink">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4 text-[15px] font-medium">Home<span className="ml-auto text-[12.5px] font-normal text-ink-3">Wed, 21 Oct</span></div>
        <div className="px-4 pt-3.5">
          <div className="text-[17px] font-semibold tracking-[-0.01em]">Good afternoon, Priya</div>
          <dl className="mt-3 grid grid-cols-2 overflow-hidden rounded-[10px] border border-line">
            {METRICS.slice(0, 4).map((m, i) => (
              <div key={m.label} className={cn("min-w-0 border-line px-3 py-2.5", i % 2 === 1 && "border-l", i >= 2 && "border-t")}>
                <dt className="flex items-start gap-1.5 text-[12.5px] leading-snug text-ink-2">{m.tone === "danger" && <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-danger" />}{m.label}</dt>
                <dd className={cn("num mt-1 text-[18px] font-medium", m.tone === "gold" && "text-gold-ink", m.tone === "danger" && "text-danger")}>{"paise" in m ? formatINRCompact(m.paise) : <>{m.count[0]}<span className="text-ink-3"> / {m.count[1]}</span></>}</dd>
                <dd className="text-[12px] leading-snug text-ink-3">{m.sub}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 mb-2 flex items-center gap-2 text-[14px] font-medium">Needs attention<span className="num text-[13px] font-normal text-ink-3">{ATTENTION.length}</span></div>
          <ul className="divide-y divide-line overflow-hidden rounded-[10px] border border-line">
            {ATTENTION.map((a) => (
              <li key={a.title} className="px-3 py-2.5">
                <div className="flex items-start gap-2 text-[13.5px]"><span className="min-w-0 flex-1 font-medium leading-snug">{a.title}</span><span className={cn("num shrink-0 font-medium", a.tone === "red" ? "text-danger" : "text-ink")}>{formatINRCompact(a.paise)}</span></div>
                <div className="mt-0.5 text-[12px] text-ink-3">{a.meta} · {a.age}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppWindow>
  );
}

function FieldPanel({ active, reduce }: { active: boolean; reduce: boolean }) {
  return (
    <div className="flex h-full items-start justify-center gap-6 lg:gap-10">
      <div className="hidden pt-6 md:block"><PhoneToday /></div>
      <div className="rounded-[40px] shadow-[0_24px_60px_-24px_rgb(28_29_31/0.28)] md:-mt-0"><VisitPhone active={active} reduce={reduce} /></div>
      <div className="hidden pt-6 xl:block"><PhoneSale /></div>
    </div>
  );
}

function CustodyPanel() {
  return (
    <AppWindow title={`aurum.jewelroute.app/admin/samples/${KADA.tag}`} className="mx-auto max-w-[1180px]" bodyClassName={WINDOW_BODY_H}>
      <CustodyView />
    </AppWindow>
  );
}

const SUMMARY: Record<TabId, string> = {
  manager: "Manager Home with sample data: orders today, visits completed, samples outside, overdue memos, the needs-attention list, live field activity and recent activity.",
  field: "Field agent app with sample data: Rahul Verma's route for today, his visit at Sharma Jewellers from GPS check-in at 11:42 am to the memo acknowledged at 11:59 am, and the sale workspace priced at today's gold rate.",
  custody: `Sample custody record with sample data: ${KADA.tag}, a 22K Rajwada Bangle of 24.50 g, held by Sharma Jewellers on ${MEMO.number}, due back ${MEMO.due}, with its custody ledger from ${VAULT} to Rahul Verma to Sharma Jewellers.`,
};

function ProductSwitch() {
  const reduce = !!useReducedMotion();
  const [tab, setTab] = React.useState<TabId>("manager");
  const [auto, setAuto] = React.useState(true);
  const [cycle, setCycle] = React.useState(0);
  const [hover, setHover] = React.useState(false);
  const [focus, setFocus] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const stage = React.useRef<HTMLDivElement>(null);
  const inView = useInView(stage, { amount: 0.25 });
  React.useEffect(() => setReady(true), []);

  React.useEffect(() => {
    const on = () => setHidden(document.visibilityState !== "visible");
    on();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  const next = React.useCallback(() => {
    setTab((t) => TABS[(TABS.findIndex((x) => x.value === t) + 1) % TABS.length].value);
    setCycle((c) => c + 1);
  }, []);
  const running = ready && auto && !reduce;
  const progress = running ? { id: `${tab}-${cycle}`, duration: DWELL[tab], paused: hover || focus || !inView || hidden, onDone: next } : null;

  return (
    <SegmentedTabs
      value={tab}
      onValueChange={(v) => { setAuto(false); setTab(v as TabId); }}
      activationMode="automatic"
      className="relative"
      onPointerEnter={(e) => { if (e.pointerType === "mouse") setHover(true); }}
      onPointerLeave={() => setHover(false)}
    >
      {/* Flat grey stage from the switch's midline down: the whole frame sits on it, no seam cuts a mock. */}
      <div className="absolute inset-x-0 top-6 bottom-0 border-t border-line bg-sunken sm:top-5" aria-hidden />
      <div
        className={cn(INSET, "relative flex justify-center")}
        onFocus={(e) => { if (e.target.matches(":focus-visible")) setFocus(true); }}
        onBlur={() => setFocus(false)}
      >
        <SegmentedTabsList
          items={TABS}
          value={tab}
          progress={progress}
          onTriggerPointerDown={() => setAuto(false)}
          triggerProps={(it) => ({ "data-hero-tab": it.value })}
          className="w-full max-w-[460px] sm:w-auto"
        />
      </div>

      {/* Stage: white above, flat grey below the frame's midline (no gradient). */}
      <div className="relative mt-8 pb-14 md:mt-10 md:pb-16">
        <div ref={stage} className={cn(INSET, "relative")}>
          <div className={cn("relative", STAGE_H)}>
            {TABS.map(({ value }) => {
              const on = value === tab;
              return (
                <SegmentedTabsContent
                  key={value}
                  value={value}
                  forceMount
                  inert={!on}
                  tabIndex={-1}
                  className={cn(
                    "absolute inset-0 outline-none transition-[opacity,transform,filter] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
                    on ? "translate-y-0 opacity-100 blur-[0px] duration-[240ms]" : "pointer-events-none translate-y-1.5 opacity-0 blur-[2px] duration-[140ms]",
                  )}
                >
                  <p className="sr-only">{SUMMARY[value]}</p>
                  <div className="h-full" aria-hidden inert>
                    {value === "manager" && <ManagerPanel />}
                    {value === "field" && <FieldPanel active={on} reduce={reduce} />}
                    {value === "custody" && <CustodyPanel />}
                  </div>
                </SegmentedTabsContent>
              );
            })}
          </div>
        </div>
        <p className={cn(INSET, "relative mt-8 flex flex-wrap items-center justify-center gap-2 text-center text-[12.5px] text-ink-3")}>
          <SampleTag />The real JewelRoute interface with sample data from a demo workspace.
        </p>
      </div>
    </SegmentedTabs>
  );
}

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative">
      <div className={cn(RAIL, "relative")}>
        <div className={cn(INSET, "flex flex-col items-center pt-14 pb-10 text-center sm:pt-20 md:pb-12 lg:pt-[88px]")}>
          <Link href="/#workflow" className="group inline-flex h-8 items-center gap-1 rounded-full border border-line-strong bg-white pr-2.5 pl-3.5 text-[13px] font-medium text-ink-2 outline-none transition-colors duration-150 ease-out focus-visible:ring-[3px] focus-visible:ring-blue/30 [@media(hover:hover)_and_(pointer:fine)]:hover:border-[#cfcfd2] [@media(hover:hover)_and_(pointer:fine)]:hover:text-ink">
            Field sales operating system for jewellery
            <ChevronRightIcon className="size-3.5 text-ink-3 transition-transform duration-150 ease-out [@media(hover:hover)_and_(pointer:fine)]:group-hover:translate-x-0.5" />
          </Link>
          <h1 id="hero-title" className="mt-6 text-balance text-[34px] font-semibold leading-[1.04] tracking-[-0.03em] text-ink sm:text-[48px] lg:text-[60px] lg:leading-[1]">
            <span className="block">Know where every salesman went.</span>
            <span className="block">Know where every gram went with them.</span>
          </h1>
          <p className="mt-6 max-w-[580px] text-pretty text-[17px] leading-[1.45] font-medium text-ink-2 sm:text-[18px]">
            GPS-verified retailer visits with arrival proof, orders priced from today&apos;s gold rate, and a custody record for every sample that leaves the vault.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-2.5">
            <CtaLink href="/signup" tone="secondary">Create your workspace</CtaLink>
            <CtaLink href="/login">Explore live demo</CtaLink>
          </div>
        </div>
        <ProductSwitch />
      </div>
    </section>
  );
}
