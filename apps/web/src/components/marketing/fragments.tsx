"use client";
/** Real product UI fragments rendered in HTML for the landing page (no screenshots). */
import { QRCodeSVG } from "qrcode.react";
import { CheckIcon, ReceiptTextIcon, ShieldCheckIcon } from "lucide-react";
import { formatGrams, formatINR, formatRate } from "@jewelroute/shared";
import { cn } from "@/lib/utils";
import { JHUMKA, JHUMKA_PRICE, PIECE, PIECE_PRICE, RATE_22K } from "./data";

const frame = "rounded-[12px] border border-line bg-white shadow-[0_1px_2px_rgb(0_0_0/0.04)]";

/* 1. GPS-verified visit */
export function FenceFragment() {
  return (
    <div className={cn(frame, "overflow-hidden")}>
      <svg viewBox="0 0 560 300" className="block h-auto w-full" role="img" aria-label="Geofence of 100 metres around Sharma Jewellers with the agent 38 metres from the shop">
        <rect width="560" height="300" fill="#f5f3ee" />
        <g stroke="#ebe7de" strokeWidth="18" fill="none" strokeLinecap="round">
          <path d="M-10 210 C 120 190, 260 230, 570 170" />
          <path d="M190 -10 L 250 310" />
          <path d="M-10 70 L 570 95" />
        </g>
        <g stroke="#ffffff" strokeWidth="10" fill="none"><path d="M-10 210 C 120 190, 260 230, 570 170" /><path d="M190 -10 L 250 310" /><path d="M-10 70 L 570 95" /></g>
        <text x="300" y="86" fill="#8f897d" fontSize="11" fontFamily="var(--font-ui)">Bank Street</text>
        <text x="64" y="196" fill="#8f897d" fontSize="11" fontFamily="var(--font-ui)">Ajmal Khan Road</text>
        <circle cx="330" cy="150" r="96" fill="rgb(44 122 84 / .08)" stroke="#2c7a54" strokeWidth="1.5" strokeDasharray="5 5" />
        <line x1="330" y1="150" x2="366" y2="122" stroke="#191714" strokeWidth="1" strokeDasharray="2 3" />
        <text x="352" y="146" fill="#191714" fontSize="12" fontWeight="600" fontFamily="var(--font-ui)">38 m</text>
        <text x="410" y="236" fill="#2c7a54" fontSize="11" fontFamily="var(--font-ui)">100 m fence</text>
        <circle cx="330" cy="150" r="11" fill="#191714" /><circle cx="330" cy="150" r="4" fill="#fcfbf8" />
        <circle cx="366" cy="122" r="16" fill="rgb(47 95 143 / .14)" />
        <circle cx="366" cy="122" r="6.5" fill="#2f5f8f" stroke="#fff" strokeWidth="2.5" />
        <circle cx="120" cy="250" r="6.5" fill="#d6d0c3" stroke="#fff" strokeWidth="2.5" />
        <text x="134" y="254" fill="#8f897d" fontSize="11" fontFamily="var(--font-ui)">214 m away: check-in stays locked</text>
      </svg>
      <div className="space-y-2.5 border-t border-line p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-verified-soft px-3 text-[13px] font-medium text-verified ring-1 ring-verified/20 ring-inset"><CheckIcon className="size-4" />Location verified · 38 m</span>
          <span className="text-[13px] text-ink-3 num">±9 m accuracy · 11:42 am</span>
        </div>
        <p className="rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">You&apos;re 214 m from Sharma Jewellers. Check-in opens within 100 m.</p>
      </div>
    </div>
  );
}

/* 2. Memo with retailer acknowledgement */
export function MemoFragment() {
  const total = PIECE_PRICE.unitPricePaise + JHUMKA_PRICE.unitPricePaise;
  return (
    <div className={cn(frame, "grid overflow-hidden sm:grid-cols-[minmax(0,1fr)_220px]")}>
      <div className="p-5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[15px] font-semibold text-ink num">MEMO-2026-00017</div>
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-gold-soft px-2.5 text-xs font-medium text-gold-ink ring-1 ring-gold/25 ring-inset"><span className="size-1.5 rounded-full bg-current" />On memo</span>
        </div>
        <div className="text-[13px] text-ink-3">Sharma Jewellers, Karol Bagh · left by Rahul Verma</div>
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {[{ ...PIECE, price: PIECE_PRICE }, { ...JHUMKA, price: JHUMKA_PRICE }].map((p) => (
            <li key={p.tag} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
              <span><span className="block font-medium text-ink">{p.name}</span><span className="block text-xs text-ink-3 num">{p.tag} · 22K · {formatGrams(p.netWeightMg)}</span></span>
              <span className="text-gold-ink num">{formatINR(p.price.unitPricePaise)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-end justify-between">
          <div><div className="text-xs text-ink-3">Due back</div><div className="font-display text-[26px] leading-none text-ink">26 Oct</div></div>
          <div className="text-right"><div className="text-xs text-ink-3">Outside on memo</div><div className="font-display text-[26px] leading-none text-gold-ink num">{formatINR(total)}</div></div>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center gap-3 border-t border-line bg-sunken p-5 sm:border-t-0 sm:border-l">
        <div className="rounded-xl bg-white p-2.5 ring-1 ring-line"><QRCodeSVG value="https://jewelroute.app/ack/demo" size={112} fgColor="#191714" bgColor="#ffffff" level="M" /></div>
        <div className="text-center text-xs text-ink-2">Retailer scans, checks every piece, and confirms on their own phone</div>
        <div className="flex gap-1" aria-label="Acknowledgement code 482913">
          {"482913".split("").map((c, i) => <span key={i} className={cn("grid h-8 w-6 place-items-center rounded-md bg-white text-[15px] font-semibold text-ink ring-1 ring-line num", i === 2 && "mr-1.5")}>{c}</span>)}
        </div>
        <div className="inline-flex items-center gap-1 text-xs font-medium text-verified"><ShieldCheckIcon className="size-3.5" />Acknowledged · 11:58 am</div>
      </div>
    </div>
  );
}

/* 3. Catalog + order booking priced from today's rate */
export function PriceFragment() {
  const p = PIECE_PRICE;
  return (
    <div className={cn(frame, "grid overflow-hidden md:grid-cols-[260px_minmax(0,1fr)]")}>
      <div className="relative aspect-[4/3] bg-sunken md:aspect-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="https://images.unsplash.com/photo-1758995116383-f51775896add?w=800&q=75&auto=format&fit=crop" alt="22K gold bangle" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      </div>
      <div className="p-5 sm:p-6">
        <div className="flex items-center gap-2 text-xs text-ink-3"><span className="inline-flex h-5 items-center rounded-[5px] border border-gold/40 px-1.5 font-semibold text-gold-ink">22K</span><span className="num">AJ-BNG-2207 · Rajwada collection</span></div>
        <div className="mt-2 font-display text-[30px] leading-tight tracking-[-0.01em] text-ink">Rajwada bangle</div>
        <div className="mt-1 font-display text-[34px] leading-tight text-gold-ink num">{formatINR(p.unitPricePaise)}<span className="ml-2 font-sans text-[13px] text-ink-3">+ 3% GST</span></div>
        <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-[13px]">
          <div className="flex justify-between gap-3"><dt className="text-ink-3">Gold · {formatGrams(PIECE.netWeightMg)} × {formatRate(RATE_22K)}</dt><dd className="num">{formatINR(p.goldValuePaise)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-ink-3">Making · ₹650/g</dt><dd className="num">{formatINR(p.makingPaise)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-ink-3">GST 3%</dt><dd className="num">{formatINR(p.gstPaise)}</dd></div>
          <div className="flex justify-between gap-3 border-t border-line pt-1.5 font-medium"><dt>Total</dt><dd className="num">{formatINR(p.totalWithGstPaise)}</dd></div>
        </dl>
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-sunken px-3 py-2 text-xs text-ink-2">
          <span className="size-1.5 shrink-0 rounded-full bg-gold" />22K set to {formatRate(RATE_22K)} at 10:30 am by Priya. Orders booked earlier keep their rate.
        </div>
      </div>
    </div>
  );
}

/* 4. The app itself: Attio-style sidebar + Orders table with a bulk-approve bar (same chrome as /admin). */
const NAV: [string, string[]][] = [["", ["Home", "Search"]], ["Field", ["Visits", "Shops", "Agents"]], ["Sales", ["Orders", "Memos", "Samples", "Catalog"]]];
const ROWS: { n: string; shop: string; agent: string; total: string; st: [string, string]; sel?: boolean }[] = [
  { n: "ORD-2026-00042", shop: "Sharma Jewellers", agent: "Rahul Verma", total: "₹14,92,310", st: ["bg-warn", "Pending"], sel: true },
  { n: "ORD-2026-00041", shop: "Sethi Jewellers", agent: "Arjun Singh", total: "₹6,48,920", st: ["bg-warn", "Pending"], sel: true },
  { n: "ORD-2026-00040", shop: "Royal Gems", agent: "Arjun Singh", total: "₹9,10,450", st: ["bg-verified", "Approved"] },
  { n: "ORD-2026-00039", shop: "Jain Ornaments", agent: "Kavya Nair", total: "₹3,22,780", st: ["bg-verified", "Approved"] },
  { n: "ORD-2026-00038", shop: "Gupta Gold House", agent: "Rahul Verma", total: "₹2,05,600", st: ["bg-danger", "Rejected"] },
];
export function CommandFragment() {
  return (
    <div className="overflow-hidden rounded-[12px] border border-line bg-white text-[13px] shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
      <div className="flex">
        <aside className="hidden w-[148px] shrink-0 border-r border-line bg-[#fbfbfa] px-2 py-2.5 sm:block" aria-hidden>
          <div className="flex h-8 items-center gap-2 px-1.5"><span className="grid size-5 place-items-center rounded-[5px] bg-ink text-[10px] font-semibold text-white">A</span><span className="font-semibold text-ink">Aurum Jewels</span></div>
          <div className="mt-1.5 flex h-7 items-center justify-between rounded-md border border-line bg-white px-2 text-ink-3"><span>Search</span><span className="rounded border border-line px-1 text-[10px]">⌘K</span></div>
          {NAV.map(([sec, items]) => (
            <div key={sec || "top"} className="mt-2.5">
              {sec && <div className="px-1.5 pb-1 text-[12px] text-ink-3">{sec}</div>}
              {items.filter((x) => x !== "Search").map((x) => (
                <div key={x} className={cn("flex h-[26px] items-center gap-2 rounded-md px-1.5 text-ink-2", x === "Orders" && "bg-[#efefef] font-medium text-ink")}>
                  <span className={cn("size-3 rounded-[3px] border", x === "Orders" ? "border-ink/50" : "border-ink-3/60")} />{x}
                </div>
              ))}
            </div>
          ))}
        </aside>
        <div className="relative min-w-0 flex-1">
          <div className="flex h-11 items-center gap-2 border-b border-line px-2.5.5">
            <ReceiptTextIcon className="size-4 text-ink-2" /><span className="text-[14px] font-medium text-ink">Orders</span>
            <span className="ml-auto inline-flex h-7 items-center rounded-lg bg-ink px-2.5 text-[12.5px] font-medium text-white">Export</span>
          </div>
          <div className="flex h-10 items-center gap-1 border-b border-line px-2.5 text-ink-2">
            <span className="rounded-md bg-[#f3f3f3] px-2 py-1 font-medium text-ink">All <span className="num text-ink-3">42</span></span>
            <span className="px-2 py-1">Pending <span className="num text-ink-3">3</span></span>
            <span className="px-2 py-1">Approved</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-separate border-spacing-0 whitespace-nowrap">
              <thead><tr className="text-left text-[12.5px] font-medium text-ink">
                {["Order", "Shop", "Total", "Status"].map((h, i) => <th key={h} className={cn("h-8 border-b border-r border-line px-2.5 font-medium last:border-r-0", i === 2 && "text-right")}>{h}</th>)}
              </tr></thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.n} className={r.sel ? "bg-[#eef3fe]" : undefined}>
                    <td className="h-9 border-b border-r border-line px-2.5"><span className="flex items-center gap-2"><span className={cn("size-3.5 rounded-[3px] border", r.sel ? "border-[#2f6bf2] bg-[#2f6bf2]" : "border-line-strong")} /><span className="num font-medium text-ink">{r.n}</span></span></td>
                    <td className="h-9 border-b border-r border-line px-2.5 text-ink" title={`Booked by ${r.agent}`}>{r.shop}</td>
                    <td className="num h-9 border-b border-r border-line px-2.5 text-right text-ink">{r.total}</td>
                    <td className="h-9 border-b border-line px-2.5"><span className="flex items-center gap-1.5 text-ink"><span className={cn("size-2 rounded-full", r.st[0])} />{r.st[1]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-center py-3">
            <div className="inline-flex items-center gap-2 rounded-[10px] border border-line bg-white px-2 py-1.5 shadow-[0_4px_16px_rgb(0_0_0/0.08)]">
              <span className="num grid size-5 place-items-center rounded-[5px] bg-[#2f6bf2] text-[11px] font-semibold text-white">2</span><span className="text-ink-2">selected</span>
              <span className="inline-flex h-7 items-center gap-1 rounded-lg px-2 font-medium text-ink hover:bg-hover"><CheckIcon className="size-3.5" />Approve 2</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* 5. Webhooks */
export function WebhookFragment() {
  return (
    <div className="overflow-hidden rounded-[12px] border border-[#2c2925] bg-[#1f1d1a] text-[#ece7dc]">
      <pre className="overflow-x-auto p-5 text-[12px] leading-[1.7] font-[ui-monospace,SFMono-Regular,Menlo,monospace]"><code className="font-[ui-monospace,SFMono-Regular,Menlo,monospace]">
<span className="text-[#8f897d]">POST https://erp.yourfirm.in/hooks/jewelroute</span>{"\n"}
<span className="text-[#c9a65a]">X-JewelRoute-Event:</span> memo.created{"\n"}
<span className="text-[#c9a65a]">X-JewelRoute-Timestamp:</span> 1792561080{"\n"}
<span className="text-[#c9a65a]">X-JewelRoute-Signature:</span> sha256=7f3c…e91a{"\n\n"}
{`{
  "id": "evt_01JB8Q4W2N",
  "type": "memo.created",
  "data": {
    "memo": { "number": "MEMO-2026-00017", "dueDate": "2026-10-26" },
    "shop": { "name": "Sharma Jewellers", "area": "Karol Bagh" },
    "pieces": [{ "tagCode": "AJ-S-000123", "netWeightMg": 24500 }],
    "totalValuePaise": `}{PIECE_PRICE.unitPricePaise + JHUMKA_PRICE.unitPricePaise}{`
  }
}`}
      </code></pre>
      <div className="divide-y divide-[#2c2925] border-t border-[#2c2925] text-[12.5px]">
        {[["order.created", "200", "124 ms", "Delivered", "text-[#7fc7a0]"], ["visit.completed", "200", "98 ms", "Delivered", "text-[#7fc7a0]"], ["memo.overdue", "500", "2.1 s", "Retrying · attempt 3, next in 10 min", "text-[#e3a35a]"]].map(([e, s, l, st, c]) => (
          <div key={e} className="grid grid-cols-[1fr_44px_64px] items-center gap-3 px-5 py-2 sm:grid-cols-[150px_44px_64px_1fr]">
            <span className="font-[ui-monospace,monospace]">{e}</span>
            <span className={c}>{s}</span>
            <span className="text-[#a59f92]">{l}</span>
            <span className={cn("max-sm:col-span-3", c)}>{st}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
