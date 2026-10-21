/** Manager operations: the hero already shows Priya's Home, so this section shows the other half of
 *  her day — the Orders table with the one order a rule stopped, open in a side sheet with the
 *  shop's credit position and the decision. Then three short notes. Reference: centred two-tone
 *  claim over one large app frame cut by the next hairline (record table + sheet, Attio-style).
 *  Server-rendered; the frame is inert sample data. */
import { CheckIcon, ChevronDownIcon, ListFilterIcon, ReceiptTextIcon, XIcon } from "lucide-react";
import { formatINR, formatINRCompact } from "@jewelroute/shared";
import { Avatar, Chip, Dot } from "@/components/app/chrome";
import { cn } from "@/lib/utils";
import { CREDIT_MEHTA, ORDERS, type DemoOrderStatus } from "./data";
import { ObjectSquare, TINT } from "./kit";
import { AppWindow, Eyebrow, Heading, INSET, Section, Stage } from "./primitives";
import { AppSidebar } from "./views";

const NOTES = [
  { t: "Overdue memos first.", d: "Pieces past their due date, with the shop, the salesman and the value at risk." },
  { t: "Approvals wait for you.", d: "Only orders over a shop's credit limit or your threshold stop; the rest confirm on the spot." },
  { t: "Live, without a phone call.", d: "Check-ins, orders and acknowledgements arrive in the feed as they happen." },
];

const STATUS: Record<DemoOrderStatus, { tone: "amber" | "green" | "blue" | "red"; label: string }> = {
  "Pending approval": { tone: "amber", label: "Needs approval" },
  Confirmed: { tone: "green", label: "Confirmed" },
  Approved: { tone: "blue", label: "Approved" },
  Rejected: { tone: "red", label: "Rejected" },
};

const nowPaise = CREDIT_MEHTA.projectedExposurePaise - CREDIT_MEHTA.orderPaise;
const overPaise = CREDIT_MEHTA.projectedExposurePaise - CREDIT_MEHTA.creditLimitPaise;
const pct = (v: number) => `${Math.min(100, (v / CREDIT_MEHTA.projectedExposurePaise) * 100).toFixed(2)}%`;

function ApprovalSheet() {
  return (
    <aside className="flex flex-col border-line bg-white max-md:border-t md:absolute md:inset-y-0 md:right-0 md:w-[340px] md:border-l md:shadow-[-16px_0_40px_-24px_rgb(28_29_31/0.18)] xl:w-[372px]">
      <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-line px-4">
        <ObjectSquare icon={ReceiptTextIcon} tint={TINT.orders} />
        <span className="num text-[14px] font-medium text-ink">{CREDIT_MEHTA.number}</span>
        <Chip tone="amber" className="ml-1">Needs approval</Chip>
        <XIcon className="ml-auto size-4 text-ink-3" />
      </div>
      <div className="flex-1 space-y-4 px-4 py-4">
        <div className="flex items-center gap-2.5">
          <Avatar name={CREDIT_MEHTA.shop} size={28} square />
          <div className="min-w-0">
            <div className="text-[14px] font-medium text-ink">{CREDIT_MEHTA.shop}</div>
            <div className="text-[12.5px] text-ink-3">{CREDIT_MEHTA.area} · booked by Arjun Singh, <span className="num">12:01 pm</span></div>
          </div>
        </div>

        <div className="rounded-[10px] border border-line">
          <div className="flex items-center justify-between px-3 pt-2.5 text-[13px]">
            <span className="font-medium text-ink">Credit position</span>
            <span className="text-[12px] text-ink-3">Rule: credit limit</span>
          </div>
          {/* Exposure now + this order, against the limit marker */}
          <div className="relative mx-3 mt-3 h-2 rounded-full bg-[#f1f1f2]">
            <div className="absolute inset-y-0 left-0 rounded-l-full bg-ink/70" style={{ width: pct(nowPaise) }} />
            <div className="absolute inset-y-0 rounded-r-full bg-warn" style={{ left: pct(nowPaise), width: `calc(100% - ${pct(nowPaise)})` }} />
            <div className="absolute -top-1 -bottom-1 w-px bg-ink" style={{ left: pct(CREDIT_MEHTA.creditLimitPaise) }} />
          </div>
          <dl className="mt-3 divide-y divide-line border-t border-line px-3 text-[12.5px]">
            <div className="flex h-8 items-center justify-between"><dt className="text-ink-2">Credit limit</dt><dd className="num text-ink">{formatINR(CREDIT_MEHTA.creditLimitPaise)}</dd></div>
            <div className="flex h-8 items-center justify-between"><dt className="text-ink-2">Exposure now</dt><dd className="num text-ink">{formatINR(nowPaise)}</dd></div>
            <div className="flex h-8 items-center justify-between"><dt className="text-ink-2">This order</dt><dd className="num text-ink">{formatINR(CREDIT_MEHTA.orderPaise)}</dd></div>
            <div className="flex h-8 items-center justify-between font-medium"><dt className="text-ink">After this order</dt><dd className="num text-warn">{formatINR(CREDIT_MEHTA.projectedExposurePaise)}</dd></div>
          </dl>
          <div className="border-t border-line px-3 py-2 text-[12.5px] text-warn">Over the limit by <span className="num font-medium">{formatINRCompact(overPaise)}</span></div>
        </div>

        <p className="text-[12.5px] leading-relaxed text-ink-3">Approving confirms the order at the rate it was booked at. Rejecting asks for a reason, which Arjun sees on his phone.</p>
      </div>
      <div className="flex gap-2 border-t border-line px-4 py-3">
        <span className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-white text-[14px] font-medium text-ink"><XIcon className="size-4" />Reject</span>
        <span className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-ink text-[14px] font-medium text-white"><CheckIcon className="size-4" />Approve</span>
      </div>
    </aside>
  );
}

function OrdersView() {
  return (
    <div className="flex bg-white text-ink">
      <AppSidebar active="Orders" />
      <div className="relative min-w-0 flex-1 md:min-h-[588px]">
        <div className="flex h-[52px] items-center gap-2 border-b border-line px-5">
          <ObjectSquare icon={ReceiptTextIcon} tint={TINT.orders} size={20} />
          <span className="text-[15px] font-medium">Orders</span>
        </div>
        <div className="flex h-12 items-center gap-1.5 border-b border-line px-5 text-[13.5px]">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-md bg-active px-2 font-medium text-ink">All orders<span className="num text-ink-3">{ORDERS.length}</span></span>
          <span className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-ink-2">Needs approval<span className="num rounded-[5px] bg-warn-soft px-1 text-[12px] font-medium text-warn">1</span></span>
          <span className="inline-flex h-7 items-center rounded-md px-2 text-ink-2 max-sm:hidden">Confirmed</span>
          <span className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-md border border-line-strong px-2 text-ink-2 max-sm:hidden"><ListFilterIcon className="size-3.5" />Filter</span>
        </div>
        <table className="w-full text-[13.5px] md:w-[calc(100%-340px)] xl:w-[calc(100%-372px)]">
          <thead>
            <tr className="h-9 border-b border-line text-left text-[12.5px] text-ink-3">
              <th className="px-5 font-normal">Order</th>
              <th className="px-3 font-normal max-sm:hidden md:max-xl:hidden">Shop</th>
              <th className="px-3 text-right font-normal"><span className="inline-flex items-center gap-1">Total<ChevronDownIcon className="size-3" /></span></th>
              <th className="px-3 pr-5 font-normal max-sm:hidden">Status</th>
            </tr>
          </thead>
          <tbody>
            {ORDERS.map((o) => {
              const s = STATUS[o.status];
              const sel = o.status === "Pending approval";
              return (
                <tr key={o.id} className={cn("h-10 border-b border-line", sel && "bg-selected")}>
                  <td className="px-5"><span className="num whitespace-nowrap font-medium">{o.number}</span></td>
                  <td className="max-w-[200px] truncate px-3 max-sm:hidden md:max-xl:hidden"><span className="inline-flex items-center gap-2"><Avatar name={o.shop} size={18} square />{o.shop}</span></td>
                  <td className="num whitespace-nowrap px-3 text-right">{formatINR(o.totalPaise)}</td>
                  <td className="px-3 pr-5 max-sm:hidden"><Dot tone={s.tone} className="text-[13px]">{s.label}</Dot></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <ApprovalSheet />
      </div>
    </div>
  );
}

export function ManagerSection() {
  return (
    <Section id="manager" labelledBy="manager-title">
      <div className={cn(INSET, "flex flex-col items-center pt-20 pb-14 text-center md:pt-28 lg:pt-32 lg:pb-16")}>
        <Eyebrow>Manager operations</Eyebrow>
        <Heading id="manager-title" className="mt-4 max-w-[900px]" lead="Manage exceptions" rest="instead of calling every salesperson at the end of the day." />
      </div>
      <Stage className="border-t border-line px-4 pt-10 sm:px-8 md:pt-14 lg:px-14">
          <figure aria-label={`Orders, shown with sample data: ${ORDERS.length} orders today, one waiting for approval because it takes ${CREDIT_MEHTA.shop} over its credit limit.`}>
            <AppWindow title="aurum.jewelroute.app/admin/orders" className="mx-auto max-w-[1180px] rounded-b-none border-b-0" bodyClassName="mb-0 rounded-b-none border-b-0">
              <div inert aria-hidden><OrdersView /></div>
            </AppWindow>
          </figure>
      </Stage>
      <ul className="grid gap-px border-t border-line bg-line md:grid-cols-3">
        {NOTES.map((n) => (
          <li key={n.t} className="bg-white px-5 py-8 sm:px-8 lg:px-14 lg:py-10">
            <p className="max-w-[340px] text-[16px] font-medium leading-snug text-ink">{n.t} <span className="text-ink-2">{n.d}</span></p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
