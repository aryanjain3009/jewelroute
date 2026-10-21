// Sample data for the landing page (a demo workspace, "Aurum Jewels", Karol Bagh). Nothing here is
// live: the page labels every product frame as sample data. Prices go through the same shared
// `priceDesign` / `orderTotals` the API uses, so every rupee shown is arithmetically real.
import { orderTotals, priceDesign } from "@jewelroute/shared";

export const WORKSPACE = "Aurum Jewels";
export const RATE_22K = 1052500; // paise per gram: ₹10,525/g
export const RATE_SET_AT = "8:45 am";
/** Morning issue: Priya hands Rahul's bag over at the vault. */
export const ISSUED_AT = "9:00 am";
export const VAULT = "Aurum Vault";

export const IMG = {
  kada: "/catalog/1758995116383-f51775896add.jpg",
  jhumka: "/catalog/1653227907864-560dce4c252d.jpg",
  temple: "/catalog/1601121141461-9d6647bca1ed.jpg",
  kundan: "/catalog/1611598935678-c88dca238fce.jpg",
  paisley: "/catalog/1651160670627-2896ddf7822f.jpg",
  antique: "/catalog/1679156272446-30738eb5c4e7.jpg",
  counter: "/catalog/1654781456542-fdd1683c79c3.jpg", // arrival photo: the shop's display wall
} as const;

type Making = { type: "PER_GRAM"; perGramPaise: number };
export interface DemoPiece { tag: string; design: string; code: string; collection: string; purity: "K22" | "K18"; netWeightMg: number; grossWeightMg: number; making: Making; img: string }

const price = (p: DemoPiece) =>
  priceDesign({ netWeightMg: p.netWeightMg, ratePaisePerGram: RATE_22K, makingChargeType: "PER_GRAM", makingChargeValue: p.making.perGramPaise, stoneValuePaise: 0 });

/** The hero piece: a 22K Rajwada bangle (24.50 g, ₹2.73 lakh at today's rate) that travels
 *  Aurum Vault → Rahul Verma → Sharma Jewellers. */
export const KADA: DemoPiece = { tag: "AJ-S-000123", design: "Rajwada Bangle", code: "AJ-BNG-2201", collection: "Rajwada", purity: "K22", netWeightMg: 24500, grossWeightMg: 25100, making: { type: "PER_GRAM", perGramPaise: 60000 }, img: IMG.kada };
export const JHUMKA: DemoPiece = { tag: "AJ-S-000131", design: "Noor jhumka pair", code: "AJ-EAR-1107", collection: "Noor", purity: "K22", netWeightMg: 11200, grossWeightMg: 11640, making: { type: "PER_GRAM", perGramPaise: 80000 }, img: IMG.jhumka };
export const KADA_PRICE = price(KADA);
export const JHUMKA_PRICE = price(JHUMKA);

/** MEMO-2026-00017: both pieces left at Sharma Jewellers, acknowledged by the retailer's QR scan. */
export const MEMO = {
  number: "MEMO-2026-00017",
  shop: "Sharma Jewellers",
  area: "Karol Bagh",
  owner: "Rakesh Sharma",
  agent: "Rahul Verma",
  issuedAt: "11:58 am",
  due: "26 Oct",
  ackAt: "11:59 am",
  code: "482913",
  items: [
    { piece: KADA, valuePaise: KADA_PRICE.unitPricePaise },
    { piece: JHUMKA, valuePaise: JHUMKA_PRICE.unitPricePaise },
  ],
};
export const MEMO_TOTAL = MEMO.items.reduce((s, i) => s + i.valuePaise, 0);

/** The order Rahul books at Sharma Jewellers: 1 temple necklace + 2 antique bangles at today's rate. */
export const TEMPLE: DemoPiece = { tag: "", design: "Lakshmi temple necklace", code: "AJ-NCK-3304", collection: "Temple", purity: "K22", netWeightMg: 18450, grossWeightMg: 19020, making: { type: "PER_GRAM", perGramPaise: 90000 }, img: IMG.temple };
export const ANTIQUE: DemoPiece = { tag: "", design: "Antique bangle", code: "AJ-BNG-2214", collection: "Heritage", purity: "K22", netWeightMg: 7200, grossWeightMg: 7410, making: { type: "PER_GRAM", perGramPaise: 70000 }, img: IMG.antique };
export const KUNDAN: DemoPiece = { tag: "", design: "Kundan choker", code: "AJ-NCK-3311", collection: "Kundan", purity: "K22", netWeightMg: 28600, grossWeightMg: 30140, making: { type: "PER_GRAM", perGramPaise: 110000 }, img: IMG.kundan };
export const TEMPLE_PRICE = price(TEMPLE);
export const KUNDAN_PRICE = price(KUNDAN);
export const ANTIQUE_PRICE = price(ANTIQUE);
export const ORDER_LINES = [
  { design: TEMPLE, qty: 1, unitPaise: TEMPLE_PRICE.unitPricePaise },
  { design: ANTIQUE, qty: 2, unitPaise: ANTIQUE_PRICE.unitPricePaise },
];
export const ORDER = { number: "ORD-2026-00042", at: "11:51 am", ...orderTotals(ORDER_LINES.map((l) => l.qty * l.unitPaise)) };

/** Credit position at Sharma Jewellers before the order (contract v3 `CreditPosition`). */
export const CREDIT = (() => {
  const outstandingPaise = 31250000;          // ₹3,12,500 unpaid confirmed orders
  const memoExposurePaise = MEMO_TOTAL;       // pieces out on memo at the shop
  const creditLimitPaise = 150000000;         // ₹15,00,000
  const exposurePaise = outstandingPaise + memoExposurePaise;
  const projectedExposurePaise = exposurePaise + ORDER.totalPaise;
  return {
    outstandingPaise, memoExposurePaise, creditLimitPaise, exposurePaise,
    availableCreditPaise: Math.max(0, creditLimitPaise - exposurePaise),
    orderAmountPaise: ORDER.totalPaise, projectedExposurePaise,
    requiresApproval: projectedExposurePaise > creditLimitPaise,
  };
})();
/** A second shop where the same rule trips: Mehta Jewellers is already near its limit. */
export const CREDIT_MEHTA = { shop: "Mehta Jewellers", area: "Chandni Chowk", creditLimitPaise: 100000000, projectedExposurePaise: 118640000, orderPaise: 23180000, number: "ORD-2026-00043" };

/* ---------- Manager command center ---------- */

export const AGENTS = [
  { name: "Rahul Verma", at: "At Sharma Jewellers since 11:42 am", done: 1, total: 4, bagPaise: 115000000 },
  { name: "Arjun Singh", at: "At Royal Gems since 11:50 am", done: 1, total: 3, bagPaise: 82000000 },
  { name: "Kavya Nair", at: "Next: Jain Ornaments, Zaveri Bazaar · 12:30 pm", done: 1, total: 3, bagPaise: 61000000 },
] as const;

export const ATTENTION = [
  { tone: "red" as const, title: "MEMO-2026-00011 overdue at Mehta Jewellers", meta: "2 pieces · Rahul Verma · due 19 Oct", paise: 68400000, age: "2 days" },
  { tone: "amber" as const, title: "ORD-2026-00043 over credit limit", meta: "Mehta Jewellers · Arjun Singh", paise: 23180000, age: "4 min" },
];

/* ---------- Field day ---------- */
export const ROUTE = [
  { n: 1, shop: "Sharma Jewellers", area: "Bank Street, Karol Bagh", time: "10:30 am", state: "In visit" as const, note: "2 on memo" },
  { n: 2, shop: "Bansal Jewellers", area: "Ajmal Khan Road", time: "1:00 pm", state: "Planned" as const, note: "" },
  { n: 3, shop: "Gupta Gold House", area: "Arya Samaj Road", time: "3:00 pm", state: "Planned" as const, note: "" },
  { n: 4, shop: "Mehta Jewellers", area: "Chandni Chowk", time: "5:00 pm", state: "Planned" as const, note: "Memo overdue" },
];

/* ---------- Orders list (command center) ---------- */
export type DemoOrderStatus = "Confirmed" | "Pending approval" | "Approved" | "Rejected";
export interface DemoOrder { id: string; number: string; shop: string; area: string; agent: string; totalPaise: number; status: DemoOrderStatus; booked: string; reason?: string }
export const ORDERS: DemoOrder[] = [
  { id: "o43", number: "ORD-2026-00043", shop: "Mehta Jewellers", area: "Chandni Chowk", agent: "Arjun Singh", totalPaise: 23180000, status: "Pending approval", booked: "12:01 pm", reason: "Over credit limit" },
  { id: "o42", number: ORDER.number, shop: "Sharma Jewellers", area: "Karol Bagh", agent: "Rahul Verma", totalPaise: ORDER.totalPaise, status: "Confirmed", booked: ORDER.at },
  { id: "o41", number: "ORD-2026-00041", shop: "Kapoor Jewellers", area: "Daryaganj", agent: "Arjun Singh", totalPaise: 14820000, status: "Confirmed", booked: "11:10 am" },
  { id: "o40", number: "ORD-2026-00040", shop: "Shah & Sons", area: "Zaveri Bazaar, Mumbai", agent: "Kavya Nair", totalPaise: 9465000, status: "Confirmed", booked: "10:48 am" },
  { id: "o39", number: "ORD-2026-00039", shop: "Sethi Jewellers", area: "Lajpat Nagar", agent: "Arjun Singh", totalPaise: 62040000, status: "Approved", booked: "Yesterday" },
  { id: "o38", number: "ORD-2026-00038", shop: "Gupta Gold House", area: "Karol Bagh", agent: "Rahul Verma", totalPaise: 20560000, status: "Rejected", booked: "Yesterday" },
];

export const ORDERS_TODAY = ORDERS.filter((o) => o.booked !== "Yesterday");
export const METRICS = [
  { label: "Orders today", paise: ORDERS_TODAY.reduce((a, o) => a + o.totalPaise, 0), sub: `${ORDERS_TODAY.length} orders`, tone: "ink" },
  { label: "Visits completed", count: [6, 10], sub: "3 in progress", tone: "ink" },
  { label: "Samples outside", paise: 147000000, sub: "9 pieces at 4 shops", tone: "gold" },
  { label: "Overdue on memo", paise: 68400000, sub: "1 memo overdue", tone: "danger" },
  { label: "Pending approval", paise: 23180000, sub: "1 order over credit limit", tone: "warn" },
] as const;

export const ENDPOINTS = [
  { name: "Tally connector", url: "https://tally-bridge.aurum.in/hooks/jr", events: "order.*, memo.*", status: "Delivered", latency: "124 ms", tone: "green" as const },
  { name: "WhatsApp bot", url: "https://wa.aurum.in/jewelroute", events: "memo.created, memo.overdue", status: "Delivered", latency: "98 ms", tone: "green" as const },
  { name: "Accounts ERP", url: "https://erp.aurum.in/api/hooks", events: "order.confirmed, order.settled", status: "Retrying · attempt 3", latency: "2.1 s", tone: "amber" as const },
];
