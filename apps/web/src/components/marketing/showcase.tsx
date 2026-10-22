/** Product showcase (reference: the platform section — sticky section index on the left, each
 *  experience = two-tone H3, a grey stage with real UI fragments in sequence, then a two-cell
 *  bento). Three experiences, all visible; the index only highlights where you are. The visit's
 *  proof and the piece's custody have their own sections below, so this one covers the work in
 *  between: the route and the bag, selling at today's rate, and memos. Server-rendered. */
import { ArrowRightLeftIcon, CalendarPlusIcon, CheckIcon, LockIcon, NavigationIcon, RotateCcwIcon, ScrollTextIcon } from "lucide-react";
import { formatGrams, formatINR, formatINRCompact, formatRate } from "@jewelroute/shared";
import { Avatar, Chip, Dot } from "@/components/app/chrome";
import { PurityTag } from "@/components/jr/money";
import { SectionNav } from "@/components/ui/origin/section-nav";
import { cn } from "@/lib/utils";
import { AGENTS, ATTENTION, CREDIT_MEHTA, ISSUED_AT, JHUMKA, KADA, MEMO, MEMO_TOTAL, ORDER, ORDER_LINES, RATE_22K, RATE_SET_AT, ROUTE, TEMPLE, TEMPLE_PRICE, VAULT, WORKSPACE } from "./data";
import { Photo } from "./kit";
import { Card, Eyebrow, FlowArrow, Heading, INSET, Section, Stage } from "./primitives";

const ITEMS = [
  { id: "product-route", label: "Route and bag" },
  { id: "product-selling", label: "Selling" },
  { id: "product-memos", label: "Memos" },
];

function Step({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex w-full min-w-0 flex-1 flex-col max-xl:mx-auto max-xl:max-w-[560px]", className)}>
      <div className="mb-2 text-[12.5px] font-medium text-ink-2">{label}</div>
      <Card className="flex-1">{children}</Card>
    </div>
  );
}

function Flow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col items-stretch xl:flex-row xl:items-stretch">{children}</div>;
}

type Cell = { title: string; text: string; frag: React.ReactNode };
function Bento({ cells }: { cells: Cell[] }) {
  return (
    <div className="grid grid-cols-1 border-t border-line md:grid-cols-2">
      {cells.map((c, i) => (
        <div key={c.title} className={cn("flex min-w-0 flex-col px-5 py-10 sm:px-8 lg:px-12", i > 0 && "border-t border-line md:border-t-0 md:border-l")}>
          <h4 className="text-[16px] font-medium leading-snug text-ink">{c.title} <span className="text-ink-2">{c.text}</span></h4>
          <div className="mt-6 max-w-[400px]" aria-hidden>{c.frag}</div>
        </div>
      ))}
    </div>
  );
}

function Experience({ id, lead, rest, flow, cells }: { id: string; lead: string; rest: string; flow: React.ReactNode; cells: Cell[] }) {
  return (
    <article id={id} aria-labelledby={`${id}-title`} className="scroll-mt-16 border-t border-line first:border-t-0">
      <div className="px-5 pt-14 pb-10 sm:px-8 lg:px-12 lg:pt-20">
        <Heading as="h3" size="md" id={`${id}-title`} lead={lead} rest={rest} className="max-w-[600px]" />
      </div>
      <Stage className="border-t border-line px-4 py-8 sm:px-8 lg:px-12 lg:py-12">
        <div aria-hidden inert>{flow}</div>
      </Stage>
      <Bento cells={cells} />
    </article>
  );
}

const row = "flex h-9 items-center justify-between gap-3";

/* ---------- Route and bag: Priya assigns → Rahul's route → his bag ---------- */
const BAG = [KADA, JHUMKA, { ...TEMPLE, tag: "AJ-S-000140" }];
const routeFlow = (
  <Flow>
    <Step label="Assign visit · Priya">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <CalendarPlusIcon className="size-4 text-ink-2" strokeWidth={1.75} />
        <span className="text-[13.5px] font-medium text-ink">Assign visit</span>
      </div>
      <dl className="divide-y divide-line px-3 text-[12.5px]">
        <div className={row}><dt className="text-ink-2">Shop</dt><dd className="flex items-center gap-1.5 font-medium text-ink"><Avatar name="Sharma Jewellers" size={16} square />Sharma Jewellers</dd></div>
        <div className={row}><dt className="text-ink-2">Agent</dt><dd className="flex items-center gap-1.5 font-medium text-ink"><Avatar name="Rahul Verma" size={16} />Rahul Verma</dd></div>
        <div className={row}><dt className="text-ink-2">Date</dt><dd className="font-medium text-ink">Wed, 21 Oct</dd></div>
        <div className={row}><dt className="text-ink-2">Planned</dt><dd className="num font-medium text-ink">10:30 am</dd></div>
      </dl>
      <div className="flex items-center gap-1.5 border-t border-line px-3 py-2.5 text-[12.5px] font-medium text-verified"><CheckIcon className="size-3.5" />On Rahul&apos;s route as stop 1</div>
    </Step>
    <FlowArrow />
    <Step label="Today · Rahul's phone">
      <div className="px-3 pt-2.5 pb-1 text-[12px] text-ink-3">Wed, 21 Oct · 4 stops</div>
      <ul className="divide-y divide-line">
        {ROUTE.map((r, i) => (
          <li key={r.n} className={cn("flex items-center gap-2.5 px-3 py-2", i === 0 && "bg-hover")}>
            <span className={cn("num grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold", i === 0 ? "bg-ink text-white" : "bg-[#f1f1f2] text-ink-2")}>{r.n}</span>
            <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-medium text-ink">{r.shop}</div><div className="truncate text-[11.5px] text-ink-3"><span className="num">{r.time}</span> · {r.area}</div></div>
            {i === 0 ? <NavigationIcon className="size-3.5 shrink-0 text-ink-2" /> : r.note.includes("overdue") ? <Chip tone="red" className="h-5 text-[11px]">Memo overdue</Chip> : null}
          </li>
        ))}
      </ul>
    </Step>
    <FlowArrow />
    <Step label="His bag">
      <div className="flex items-end justify-between gap-2 px-3 pt-2.5 pb-2">
        <div><div className="text-[12px] text-ink-3">Issued {ISSUED_AT} from {VAULT}</div><div className="num mt-0.5 text-[20px] font-medium tracking-[-0.01em] text-gold-ink">{formatINRCompact(AGENTS[0].bagPaise)}</div></div>
        <span className="num shrink-0 pb-1 text-[12px] whitespace-nowrap text-ink-2">11 pieces</span>
      </div>
      <ul className="divide-y divide-line border-t border-line text-[12.5px]">
        {BAG.map((p) => (
          <li key={p.tag} className="flex items-center gap-2.5 px-3 py-2">
            <Photo src={p.img} alt="" className="size-7 rounded-md" sizes="28px" />
            <div className="min-w-0 flex-1"><div className="num truncate font-medium text-ink">{p.tag}</div><div className="flex items-center gap-1 text-ink-3"><span className="truncate">{p.design}</span></div></div>
            <span className="num shrink-0 text-ink-2">{formatGrams(p.netWeightMg)}</span>
          </li>
        ))}
      </ul>
      <div className="border-t border-line px-3 py-2 text-[12px] text-ink-3">and 8 more, each tagged and weighed</div>
    </Step>
  </Flow>
);

const routeCells: Cell[] = [
  {
    title: "Overdue memos ride along.", text: "A shop with pieces past their due date is flagged on the route, before he walks in.",
    frag: (
      <div className="flex items-center gap-2.5 rounded-[10px] border border-line bg-white px-3 py-2.5 text-[13px]">
        <span className="num grid size-5 shrink-0 place-items-center rounded-full bg-[#f1f1f2] text-[11px] font-semibold text-ink-2">4</span>
        <div className="min-w-0 flex-1"><div className="truncate font-medium text-ink">Mehta Jewellers</div><div className="truncate text-[12px] text-ink-3"><span className="num">5:00 pm</span> · Chandni Chowk</div></div>
        <Chip tone="red">Memo overdue</Chip>
      </div>
    ),
  },
  {
    title: "The bag is counted in grams and rupees.", text: "Every piece he carries has a tag, a weight and today's value, on his phone and on Priya's.",
    frag: (
      <dl className="divide-y divide-line rounded-[10px] border border-line bg-white px-3 text-[13px]">
        <div className={row}><dt className="text-ink-2">Pieces</dt><dd className="num text-ink">11</dd></div>
        <div className={row}><dt className="text-ink-2">Value today</dt><dd className="num font-medium text-gold-ink">{formatINR(AGENTS[0].bagPaise)}</dd></div>
        <div className={row}><dt className="text-ink-2">Issued by</dt><dd className="text-ink">Priya Mehta · <span className="num">{ISSUED_AT}</span></dd></div>
      </dl>
    ),
  },
];

/* ---------- Selling: catalog → today's gold rate → order ---------- */
const sellingFlow = (
  <Flow>
    <Step label="Jewellery catalog">
      <Photo src={TEMPLE.img} alt="" className="aspect-[16/10] w-full" sizes="(min-width: 1024px) 300px, 100vw" />
      <div className="px-3 py-2.5">
        <div className="text-[14px] font-medium text-ink">{TEMPLE.design}</div>
        <div className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-3"><span className="num">{TEMPLE.code}</span><PurityTag purity={TEMPLE.purity} className="h-[18px] px-1 text-[10.5px]" /><span className="num">{formatGrams(TEMPLE.netWeightMg)}</span></div>
        <div className="num mt-2 text-[14px] font-medium text-gold-ink">{formatINR(TEMPLE_PRICE.unitPricePaise)}</div>
      </div>
    </Step>
    <FlowArrow />
    <Step label="Today's gold rate">
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 text-[12.5px] text-ink-2"><span className="size-2 rounded-full bg-gold" />22K gold</div>
        <div className="num mt-1 text-[26px] font-medium tracking-[-0.02em] text-gold-ink">{formatRate(RATE_22K)}</div>
        <div className="mt-0.5 text-[12px] text-ink-3">Set at <span className="num">{RATE_SET_AT}</span> by Priya Mehta</div>
      </div>
      <dl className="divide-y divide-line border-t border-line px-3 text-[12.5px]">
        <div className="flex h-8 items-center justify-between"><dt className="text-ink-2">Gold value</dt><dd className="num text-ink">{formatINR(TEMPLE_PRICE.goldValuePaise)}</dd></div>
        <div className="flex h-8 items-center justify-between"><dt className="text-ink-2">Making</dt><dd className="num text-ink">{formatINR(TEMPLE_PRICE.makingPaise)}</dd></div>
        <div className="flex h-8 items-center justify-between font-medium"><dt className="text-ink">Price today</dt><dd className="num text-gold-ink">{formatINR(TEMPLE_PRICE.unitPricePaise)}</dd></div>
      </dl>
    </Step>
    <FlowArrow />
    <Step label="Order">
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2"><span className="num whitespace-nowrap text-[13px] font-semibold text-ink">{ORDER.number}</span><span className="ml-auto"><Dot tone="green" className="text-[12.5px]">Confirmed</Dot></span></div>
      <ul className="divide-y divide-line border-y border-line text-[12.5px]">
        {ORDER_LINES.map((l) => (
          <li key={l.design.code} className="flex items-center gap-2 px-3 py-2"><span className="min-w-0 flex-1 truncate text-ink">{l.design.design}</span><span className="num text-ink-3">×{l.qty}</span><span className="num w-16 text-right text-ink">{formatINRCompact(l.qty * l.unitPaise)}</span></li>
        ))}
        <li className="flex items-center gap-2 px-3 py-2"><span className="flex-1 text-ink-2">GST 3%</span><span className="num text-ink">{formatINRCompact(ORDER.gstPaise)}</span></li>
      </ul>
      <div className="flex items-center justify-between px-3 py-2.5 text-[13px] font-medium"><span className="text-ink">Total</span><span className="num text-gold-ink">{formatINR(ORDER.totalPaise)}</span></div>
    </Step>
  </Flow>
);

const sellingCells: Cell[] = [
  {
    title: "The rate is frozen on the order.", text: "Tomorrow's rate never rewrites today's invoice.",
    frag: (
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-[10px] border border-line bg-white px-3 py-2.5 text-[13px]">
        <LockIcon className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} />
        <span className="num whitespace-nowrap font-medium text-ink">{ORDER.number}</span>
        <span className="whitespace-nowrap text-ink-2">priced at <span className="num">{formatRate(RATE_22K)}</span></span>
        <span className="num ml-auto whitespace-nowrap text-ink-3">{ORDER.at}</span>
      </div>
    ),
  },
  {
    title: "Credit is checked before it's placed.", text: "Orders over a shop's limit wait for a manager; the rest confirm at once.",
    frag: (
      <div className="rounded-[10px] border border-line bg-white px-3 py-2.5 text-[13px]">
        <div className="flex items-center gap-2"><Avatar name={CREDIT_MEHTA.shop} size={18} square /><span className="font-medium text-ink">{CREDIT_MEHTA.shop}</span><span className="ml-auto"><Chip tone="amber">Needs approval</Chip></span></div>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#f1f1f2]"><div className="h-full w-full rounded-full bg-warn" /></div>
        <div className="mt-1.5 flex justify-between text-[12px] text-ink-3"><span>Exposure after <span className="num text-ink">{formatINRCompact(CREDIT_MEHTA.projectedExposurePaise)}</span></span><span>Limit <span className="num text-ink">{formatINRCompact(CREDIT_MEHTA.creditLimitPaise)}</span></span></div>
      </div>
    ),
  },
];

/* ---------- Memos: pick pieces → the retailer's phone → acknowledged ---------- */
const memosFlow = (
  <Flow>
    <Step label="Leave on memo · Rahul">
      <ul className="divide-y divide-line text-[12.5px]">
        {MEMO.items.map(({ piece, valuePaise }) => (
          <li key={piece.tag} className="flex items-center gap-2.5 px-3 py-2">
            <span className="grid size-4 shrink-0 place-items-center rounded-[4px] bg-ink text-white"><CheckIcon className="size-3" strokeWidth={3} /></span>
            <Photo src={piece.img} alt="" className="size-8 rounded-md" sizes="32px" />
            <div className="min-w-0 flex-1"><div className="truncate font-medium text-ink">{piece.design}</div><div className="num text-ink-3">{piece.tag} · {formatGrams(piece.netWeightMg)}</div></div>
            <span className="num shrink-0 text-gold-ink">{formatINRCompact(valuePaise)}</span>
          </li>
        ))}
      </ul>
      <dl className="divide-y divide-line border-t border-line px-3 text-[12.5px]">
        <div className="flex h-8 items-center justify-between"><dt className="text-ink-2">Due back</dt><dd className="font-medium text-ink">Mon, {MEMO.due} · 5 days</dd></div>
        <div className="flex h-8 items-center justify-between font-medium"><dt className="text-ink">Memo value</dt><dd className="num text-gold-ink">{formatINR(MEMO_TOTAL)}</dd></div>
      </dl>
    </Step>
    <FlowArrow />
    <Step label="The retailer's phone">
      <div className="px-3 pt-3">
        <div className="flex items-center gap-1.5 text-[11.5px] text-ink-3"><span className="grid size-4 place-items-center rounded-[4px] bg-ink text-[9px] font-semibold text-white">A</span>{WORKSPACE} · memo receipt</div>
        <div className="mt-1.5 font-display text-[19px] leading-tight tracking-[-0.01em] text-ink">Confirm 2 pieces received</div>
        <div className="mt-0.5 text-[12px] text-ink-2">From Rahul Verma to {MEMO.shop}</div>
      </div>
      <div className="mx-3 mt-2.5 rounded-[8px] border border-line px-2.5 py-2 text-center">
        <div className="text-[11px] text-ink-3">Or read this code to Rahul</div>
        <div className="num mt-0.5 text-[20px] font-semibold tracking-[0.14em] text-ink">{MEMO.code.slice(0, 3)} {MEMO.code.slice(3)}</div>
      </div>
      <div className="p-3"><div className="flex h-9 items-center justify-center rounded-[8px] bg-ink text-[13px] font-medium text-white">Confirm receipt</div></div>
    </Step>
    <FlowArrow />
    <Step label="Acknowledged">
      <div className="flex flex-col items-center px-3 pt-4 pb-3 text-center">
        <span className="grid size-8 place-items-center rounded-full bg-verified text-white"><CheckIcon className="size-4" strokeWidth={2.5} /></span>
        <div className="mt-2 text-[14px] font-medium text-ink">Receipt confirmed</div>
        <div className="num text-[12px] text-ink-3">{MEMO.ackAt} · on {MEMO.owner}&apos;s phone</div>
      </div>
      <dl className="divide-y divide-dashed divide-line-strong border-t border-dashed border-line-strong px-3 text-[12.5px]">
        <div className="flex h-8 items-center justify-between"><dt className="text-ink-2">Memo</dt><dd className="num font-medium text-ink">{MEMO.number}</dd></div>
        <div className="flex h-8 items-center justify-between"><dt className="text-ink-2">Custody</dt><dd className="text-ink">Rahul → {MEMO.shop}</dd></div>
        <div className="flex h-8 items-center justify-between"><dt className="text-ink-2">Total value</dt><dd className="num font-medium text-gold-ink">{formatINR(MEMO_TOTAL)}</dd></div>
      </dl>
    </Step>
  </Flow>
);

const memosCells: Cell[] = [
  {
    title: "Return, sell or extend, piece by piece.", text: "Pieces that come back go into the bag; pieces the retailer keeps become an order at today's rate.",
    frag: (
      <ul className="divide-y divide-line rounded-[10px] border border-line bg-white text-[13px]">
        {([[RotateCcwIcon, "Return pieces", "Back to Rahul's bag"], [ArrowRightLeftIcon, "Convert to order", "At today's rate"], [CalendarPlusIcon, "Extend due date", "Up to 90 days"]] as const).map(([I, t, d]) => (
          <li key={t} className="flex h-10 items-center gap-2.5 px-3"><I className="size-4 shrink-0 text-ink-2" strokeWidth={1.75} /><span className="font-medium text-ink">{t}</span><span className="ml-auto text-[12px] text-ink-3">{d}</span></li>
        ))}
      </ul>
    ),
  },
  {
    title: "Overdue memos surface first.", text: "Pieces past their due date head the manager's list until they come back.",
    frag: (
      <div className="flex h-11 items-center gap-2.5 rounded-[10px] border border-line bg-white px-3 text-[13px]">
        <ScrollTextIcon className="size-4 shrink-0 text-danger" strokeWidth={1.75} />
        <span className="min-w-0 truncate font-medium text-ink">{ATTENTION[0].title}</span>
        <span className="num ml-auto shrink-0 font-medium text-danger">{formatINRCompact(ATTENTION[0].paise)}</span>
      </div>
    ),
  },
];

export function ProductShowcase() {
  return (
    <Section id="product" labelledBy="product-title">
      <div className={cn(INSET, "pt-20 pb-14 md:pt-28 lg:pt-32 lg:pb-20")}>
        <Eyebrow>Product</Eyebrow>
        <Heading id="product-title" className="mt-4 max-w-[880px]" lead="Everything between the vault and the counter." rest="Plan the route, sell at today's gold rate and leave samples on memo, in one app built for the shop floor." />
      </div>
      <div className="grid border-t border-line lg:grid-cols-[296px_minmax(0,1fr)]">
        <aside className="hidden border-r border-line lg:block">
          <div className="sticky top-16 px-10 py-20"><SectionNav items={ITEMS} /></div>
        </aside>
        <div className="min-w-0">
          <Experience id="product-route" lead="Route and bag." rest="Priya puts the day's shops on Rahul's route and issues his bag; he starts the morning with both on his phone." flow={routeFlow} cells={routeCells} />
          <Experience id="product-selling" lead="Selling." rest="The catalogue on his phone, priced from this morning's gold rate, becomes an order in front of the retailer." flow={sellingFlow} cells={sellingCells} />
          <Experience id="product-memos" lead="Memos." rest="Pieces left on approval go on a memo with a due date, and the retailer signs for them on their own phone." flow={memosFlow} cells={memosCells} />
        </div>
      </div>
    </Section>
  );
}
