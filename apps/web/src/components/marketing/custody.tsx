"use client";
/** Sample custody — the strongest visual on the page. One piece (AJ-S-000123) as a record that
 *  answers the four questions first — where is it, who has it, why, when is it back — next to the
 *  piece itself (photo, tag, purity, weights, value today), then its custody ledger drawn on the
 *  Origin UI timeline primitive (components/ui/timeline, `shadcn add https://coss.com/origin/r/comp-536.json`).
 *  Motion: when the record first scrolls into view the ledger fills hop by hop (scale on the
 *  connector from its start edge, 280 ms strong ease-out, 320 ms apart). Reduced motion: complete. */
import * as React from "react";
import { useInView, useReducedMotion } from "motion/react";
import { CalendarClockIcon, LandmarkIcon, LockIcon, MapPinIcon, ScrollTextIcon, ShieldCheckIcon, StoreIcon, UserIcon } from "lucide-react";
import { formatGrams, formatINR, formatRate } from "@jewelroute/shared";
import { Avatar, Chip, CountBadge } from "@/components/app/chrome";
import { PurityTag } from "@/components/jr/money";
import { Timeline, TimelineContent, TimelineDate, TimelineHeader, TimelineIndicator, TimelineItem, TimelineSeparator, TimelineTitle } from "@/components/ui/timeline";
import { cn } from "@/lib/utils";
import { ISSUED_AT, KADA, KADA_PRICE, MEMO, RATE_22K, VAULT } from "./data";
import { Photo } from "./kit";
import { Eyebrow, Heading, INSET, SampleTag, Section, Stage } from "./primitives";

const MOVES = [
  { k: "vault", who: VAULT, icon: <LandmarkIcon className="size-3.5 text-ink-2" />, when: "7 Oct, 11:00 am", what: "Tagged and weighed into stock", by: "by Priya Mehta", seq: 1 },
  { k: "rahul", who: "Rahul Verma", icon: <Avatar name="Rahul Verma" size={20} />, when: `21 Oct, ${ISSUED_AT}`, what: "Issued to his bag for the day's route", by: "by Priya Mehta · morning issue", seq: 2 },
  { k: "shop", who: "Sharma Jewellers", icon: <StoreIcon className="size-3.5 text-gold-ink" />, when: `21 Oct, ${MEMO.issuedAt}`, what: `Left on ${MEMO.number} by Rahul Verma`, by: `Signed for by QR · ${MEMO.ackAt}`, seq: 3, now: true },
];

function useProgress(ref: React.RefObject<HTMLElement | null>) {
  const reduce = useReducedMotion();
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const [n, setN] = React.useState(1);
  React.useEffect(() => {
    if (reduce) { setN(MOVES.length); return; }
    if (!inView || n >= MOVES.length) return;
    const t = setTimeout(() => setN((v) => v + 1), n === 1 ? 260 : 320);
    return () => clearTimeout(t);
  }, [reduce, inView, n]);
  return n;
}

/** Connector that draws itself: a hairline track with a gold fill scaled from the start edge. */
function Fill({ on, vertical }: { on: boolean; vertical?: boolean }) {
  return (
    <span
      className={cn("block size-full bg-gold transition-[scale] duration-[280ms] ease-[cubic-bezier(0.23,1,0.32,1)]", vertical ? "origin-top" : "origin-left", on ? "scale-100" : vertical ? "scale-y-0" : "scale-x-0")}
      aria-hidden
    />
  );
}

function Ledger({ n, orientation }: { n: number; orientation: "horizontal" | "vertical" }) {
  const h = orientation === "horizontal";
  return (
    <Timeline value={n} orientation={orientation} className={h ? "max-md:hidden" : "md:hidden"}>
      {MOVES.map((m, i) => {
        const reached = m.seq <= n;
        return (
          <TimelineItem key={m.k} step={m.seq} className={cn(h ? "group-data-[orientation=horizontal]/timeline:mt-12 group-data-[orientation=horizontal]/timeline:not-last:pe-8" : "group-data-[orientation=vertical]/timeline:ms-12 group-data-[orientation=vertical]/timeline:not-last:pb-7")}>
            <TimelineHeader>
              <TimelineSeparator className={cn("overflow-hidden bg-line-strong!", h ? "group-data-[orientation=horizontal]/timeline:-top-7 group-data-[orientation=horizontal]/timeline:h-px group-data-[orientation=horizontal]/timeline:translate-x-9 group-data-[orientation=horizontal]/timeline:w-[calc(100%-2.75rem)]" : "group-data-[orientation=vertical]/timeline:-left-[30px] group-data-[orientation=vertical]/timeline:w-px group-data-[orientation=vertical]/timeline:translate-y-9 group-data-[orientation=vertical]/timeline:h-[calc(100%-2.5rem)]")}>
                <Fill on={MOVES[i + 1] ? MOVES[i + 1].seq <= n : false} vertical={!h} />
              </TimelineSeparator>
              <TimelineIndicator className={cn(
                "grid size-8 place-items-center rounded-[9px] border bg-white transition-colors duration-200",
                h ? "group-data-[orientation=horizontal]/timeline:-top-7" : "group-data-[orientation=vertical]/timeline:-left-[30px]",
                m.now && reached ? "border-gold/60! bg-gold-soft" : reached ? "border-line-strong!" : "border-line!",
              )}>
                {m.icon}
              </TimelineIndicator>
              <TimelineDate className="num mb-1 flex items-center gap-1.5 text-[12.5px] font-normal text-ink-3">{m.when}<CountBadge n={`#${m.seq}`} /></TimelineDate>
              <TimelineTitle className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-ink">
                {m.who}
                {m.now && <Chip tone="gold" className={cn("transition-opacity duration-200", reached ? "opacity-100" : "opacity-0")}>Holds now</Chip>}
              </TimelineTitle>
            </TimelineHeader>
            <TimelineContent className="mt-1 text-[13.5px] leading-relaxed text-ink-2">
              {m.what}
              <span className={cn("mt-1 flex items-start gap-1.5 text-[12.5px]", m.now ? "text-verified" : "text-ink-3")}>
                {m.now && <ShieldCheckIcon className="mt-px size-3.5 shrink-0" />}{m.by}
              </span>
            </TimelineContent>
          </TimelineItem>
        );
      })}
    </Timeline>
  );
}

type Icon = React.ComponentType<{ className?: string; strokeWidth?: number }>;
function Answer({ q, icon: I, children, sub, tone }: { q: string; icon: Icon; children: React.ReactNode; sub: React.ReactNode; tone?: "gold" | "green" }) {
  return (
    <div className="min-w-0 px-5 py-5 sm:px-6">
      <dt className="flex items-center gap-1.5 text-[13px] text-ink-2"><I className="size-3.5 text-ink-3" strokeWidth={1.75} />{q}</dt>
      <dd className={cn("mt-2 text-[19px] leading-tight font-medium tracking-[-0.01em] text-ink sm:text-[20px]", tone === "gold" && "text-gold-ink")}>{children}</dd>
      <dd className={cn("mt-1 text-[13px] text-ink-3", tone === "green" && "text-verified")}>{sub}</dd>
    </div>
  );
}

export function CustodySection() {
  const ref = React.useRef<HTMLDivElement>(null);
  const n = useProgress(ref);
  return (
    <Section id="custody" labelledBy="custody-title">
      <div className={cn(INSET, "flex flex-col items-center pt-20 pb-14 text-center md:pt-28 lg:pt-32 lg:pb-16")}>
        <Eyebrow>Sample custody</Eyebrow>
        <Heading id="custody-title" size="xl" className="mt-4" lead="Know where every piece is." />
        <p className="mt-5 max-w-[620px] text-pretty text-[17px] leading-[1.45] font-medium text-ink-2">
          Every sample that leaves the vault has exactly one holder, a reason and a due date. Open the piece and those answers come first.
        </p>
      </div>

      <Stage className="border-t border-line px-4 py-10 sm:px-8 md:py-16 lg:px-14 lg:py-20">
        <div ref={ref} role="figure" aria-label={`Sample record for ${KADA.tag}, shown with sample data`} className="mx-auto grid max-w-[1160px] overflow-hidden rounded-[14px] border border-line-strong bg-white lg:grid-cols-[380px_minmax(0,1fr)]">
          {/* The piece */}
          <div className="border-line max-lg:border-b lg:border-r">
            <div className="p-3 sm:p-4">
              <Photo src={KADA.img} alt="Rajwada Bangle, 22K gold, sample AJ-S-000123" className="aspect-[4/3] w-full rounded-[10px] sm:max-lg:aspect-[16/7]" sizes="(min-width: 1024px) 360px, 100vw" />
            </div>
            <div className="px-5 pb-5 sm:px-6">
              <div className="flex items-center gap-2 text-[12.5px] text-ink-3">Sample<SampleTag /></div>
              <div className="num mt-1 text-[28px] font-semibold leading-tight tracking-[-0.015em] text-ink">{KADA.tag}</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-ink-2">
                <span className="font-medium text-ink">{KADA.design}</span>
                <PurityTag purity={KADA.purity} />
                <span className="num text-ink-3">{KADA.code}</span>
              </div>
              <dl className="mt-4 divide-y divide-line border-y border-line text-[13.5px]">
                <div className="flex h-9 items-center justify-between"><dt className="text-ink-2">Net weight</dt><dd className="num text-ink">{formatGrams(KADA.netWeightMg)}</dd></div>
                <div className="flex h-9 items-center justify-between"><dt className="text-ink-2">Gross weight</dt><dd className="num text-ink">{formatGrams(KADA.grossWeightMg)}</dd></div>
                <div className="flex h-9 items-center justify-between"><dt className="text-ink-2">Rate today</dt><dd className="num text-ink">22K {formatRate(RATE_22K)}</dd></div>
              </dl>
              <div className="mt-4 flex items-end justify-between gap-3">
                <span className="text-[13px] text-ink-2">Value today</span>
                <span className="num text-[28px] font-semibold leading-none tracking-[-0.015em] text-gold-ink">{formatINR(KADA_PRICE.unitPricePaise)}</span>
              </div>
            </div>
          </div>

          {/* The answers, then the ledger that proves them */}
          <div className="min-w-0">
            <dl className="grid grid-cols-1 border-b border-line sm:grid-cols-2 sm:[&>div:nth-child(even)]:border-l sm:[&>div:nth-child(n+3)]:border-t max-sm:divide-y max-sm:divide-line [&>div]:border-line">
              <Answer q="Where is it?" icon={MapPinIcon} sub="Bank Street, Karol Bagh" tone="gold">Sharma Jewellers</Answer>
              <Answer q="Who has it?" icon={UserIcon} sub={<>Handed over by Rahul Verma, <span className="num">{MEMO.issuedAt}</span></>}>{MEMO.owner}</Answer>
              <Answer q="Why is it there?" icon={ScrollTextIcon} sub={<span className="flex items-center gap-1"><ShieldCheckIcon className="size-3.5" />Acknowledged by QR · <span className="num">{MEMO.ackAt}</span></span>} tone="green"><span className="text-ink">On memo <span className="num">{MEMO.number}</span></span></Answer>
              <Answer q="When is it back?" icon={CalendarClockIcon} sub="In 5 days, or sold on an order">Mon, {MEMO.due}</Answer>
            </dl>
            <div className="px-5 pt-6 pb-8 sm:px-6 md:pb-9">
              <div className="mb-2 flex items-center gap-2 text-[14px] font-medium text-ink">Custody ledger<span className="num text-[13px] font-normal text-ink-3">3 moves</span></div>
              <Ledger n={n} orientation="horizontal" />
              <div className="pt-4"><Ledger n={n} orientation="vertical" /></div>
            </div>
          </div>
        </div>
        <p className="mx-auto mt-5 flex max-w-[1160px] items-center justify-center gap-1.5 text-center text-[12.5px] text-ink-3"><LockIcon className="size-3.5 shrink-0" />The ledger is append-only: each move is written once, with the visit and event that caused it.</p>
      </Stage>
    </Section>
  );
}
