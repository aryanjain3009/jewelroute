/** "One complete field day": six timestamped moments on one rail, each with the fragment of UI it
 *  leaves behind. No paragraphs. Reference: the dated column strip with hairline dividers.
 *  Times follow the product's format ("9:00 am", IST). Server-rendered. */
import { BadgeCheckIcon, ShieldCheckIcon } from "lucide-react";
import { formatINRCompact } from "@jewelroute/shared";
import { Avatar, Dot } from "@/components/app/chrome";
import { cn } from "@/lib/utils";
import { AGENTS, IMG, ISSUED_AT, MEMO, MEMO_TOTAL, ORDER } from "./data";
import { Photo } from "./kit";
import { Eyebrow, Heading, INSET, Section } from "./primitives";

const frag = "flex min-h-[52px] items-center gap-2 rounded-[10px] border border-line bg-white px-2.5 py-2 text-[12.5px]";

const DAY: { time: string; title: string; frag: React.ReactNode }[] = [
  {
    time: ISSUED_AT, title: "Samples issued",
    frag: <div className={frag}><Avatar name="Rahul Verma" size={20} /><div className="min-w-0"><div className="truncate text-ink">11 pieces to Rahul</div><div className="num font-medium text-gold-ink">{formatINRCompact(AGENTS[0].bagPaise)}</div></div></div>,
  },
  {
    time: "11:42 am", title: "GPS verified",
    frag: <div className={frag}><BadgeCheckIcon className="size-4 shrink-0 text-verified" strokeWidth={1.75} /><div className="min-w-0"><div className="truncate font-medium text-verified">38 m from the shop</div><div className="text-ink-3">Fence 100 m</div></div></div>,
  },
  {
    time: "11:43 am", title: "Arrival proof",
    frag: <div className={frag}><Photo src={IMG.counter} alt="" className="size-8 shrink-0 rounded-[6px]" sizes="32px" /><div className="min-w-0"><div className="truncate text-ink">Photo, stamped</div><div className="num truncate text-ink-3">cc23231c</div></div></div>,
  },
  {
    time: ORDER.at, title: "Order booked",
    frag: <div className={frag}><div className="min-w-0"><div className="num truncate text-ink">{ORDER.number}</div><div className="flex items-center gap-1.5"><span className="num font-medium text-gold-ink">{formatINRCompact(ORDER.totalPaise)}</span><Dot tone="green" className="text-[12px] text-ink-3">Confirmed</Dot></div></div></div>,
  },
  {
    time: MEMO.issuedAt, title: "Memo created",
    frag: <div className={frag}><div className="min-w-0"><div className="num truncate text-ink">{MEMO.number}</div><div className="text-ink-3">2 pieces · <span className="num text-gold-ink">{formatINRCompact(MEMO_TOTAL)}</span></div></div></div>,
  },
  {
    time: MEMO.ackAt, title: "Retailer acknowledged",
    frag: <div className={frag}><ShieldCheckIcon className="size-4 shrink-0 text-verified" strokeWidth={1.75} /><div className="min-w-0"><div className="truncate font-medium text-verified">QR confirmed</div><div className="truncate text-ink-3">{MEMO.owner}</div></div></div>,
  },
];

export function FieldDaySection() {
  return (
    <Section id="workflow" labelledBy="workflow-title">
      <div className={cn(INSET, "pt-20 pb-12 md:pt-28 lg:pt-32 lg:pb-16")}>
        <Eyebrow>Workflow</Eyebrow>
        <Heading id="workflow-title" className="mt-4 max-w-[820px]" lead="One complete field day." rest="Six moments, each written down once by the person who made it." />
      </div>
      <ol className="grid gap-px border-t border-line bg-line sm:grid-cols-2 lg:grid-cols-6">
        {DAY.map((d, i) => (
          <li key={d.title} className="relative flex gap-4 bg-white px-5 pt-6 pb-7 sm:block sm:px-6 sm:pb-8 lg:px-5">
            {/* the day's rail: one segment per column, continuous across the 1 px gaps at lg */}
            <span className={cn("absolute top-[29.5px] hidden h-px bg-line-strong lg:block", i === 0 ? "left-5 right-0" : i === DAY.length - 1 ? "left-0 right-1/2" : "inset-x-0")} aria-hidden />
            <span className={cn("relative z-[1] mt-1 block size-3 sm:mt-0 shrink-0 rounded-full ring-4 ring-white", i === DAY.length - 1 ? "bg-verified" : "bg-ink")} aria-hidden />
            <div className="min-w-0 flex-1 sm:mt-5">
              <time className="num block text-[13px] text-ink-3">{d.time}</time>
              <h3 className="mt-1 text-[16px] font-medium leading-snug text-ink">{d.title}</h3>
              <div className="mt-4" aria-hidden>{d.frag}</div>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
