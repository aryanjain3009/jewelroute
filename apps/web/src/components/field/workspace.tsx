"use client";
import Link from "next/link";
import { useState } from "react";
import { BookOpen, CalendarPlus, CheckCheck, CheckCircle2, Gem, Hourglass, Loader2, MapPin, NotebookPen, QrCode, ShoppingBag, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { formatGrams, formatINR, formatINRCompact } from "@jewelroute/shared";
import { Button } from "@/components/ui/button";
import { Drawer as DrawerRoot, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Chip, Dot } from "@/components/app/chrome";
import { Money } from "@/components/jr/money";
import { MemoStatusPill, OrderStatusPill } from "@/components/jr/status";
import { api } from "@/lib/api";
import type { Memo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Attr, PRESS, PRESS_BTN, SectionTitle, ShopMoney, TapRow, Thumb } from "./bits";
import { ProofSummary } from "./proof";
import { MemoAck } from "./sale/memo-ack";
import { OrderDecision } from "./order-decision";
import { CompleteDrawer, ExtendMemoDrawer, NoteDrawer, ReturnDrawer, SellFromMemoDrawer } from "./visit-drawers";
import { errorMessage, useFieldVisits, useToday } from "./queries";
import { dayLabel, fmtDay, fmtDue, fmtFromShop, fmtTime, plural } from "./format";
import { useGuard } from "./guard";
import { BottomBar, BottomSpacer } from "./top-bar";
import type { AckLink, VisitDetail } from "./types";
import { SIMULATED_LOCATION } from "@/components/app/status";

type Drawer = null | "note" | "return" | "complete" | "sell" | "extend";

/** "Location verified · 38 m" — exactly what the server recorded at check-in. */
export function ArrivalLine({ v }: { v: VisitDetail["visit"] }) {
  const sim = v.verification === "SIMULATED"; const low = v.verification === "LOW_ACCURACY";
  return (
    <div className={cn("mx-4 flex items-center gap-2.5 rounded-xl border px-4 py-3", sim ? "border-info/15 bg-info-soft" : low ? "border-warn/20 bg-warn-soft" : "border-verified/20 bg-verified-soft")}>
      <MapPin className={cn("size-[18px] shrink-0", sim ? "text-info" : low ? "text-warn" : "text-verified")} />
      <p className={cn("min-w-0 flex-1 truncate text-[14px] font-medium", sim ? "text-info" : "text-ink")}>
        {sim ? SIMULATED_LOCATION : low ? "Location low accuracy" : "Location verified"}
        {!sim && v.checkInDistanceM !== undefined && <span className="font-normal text-ink-2">, <span className="num">{fmtFromShop(v.checkInDistanceM)}</span></span>}
      </p>
    </div>
  );
}

export function Workspace({ data }: { data: VisitDetail }) {
  const { visit, shop, proofs, shopContext, bag } = data;
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [returnMemo, setReturnMemo] = useState<string | null>(null);
  const [memoId, setMemoId] = useState<string | null>(null);
  const openMemos = shopContext.activeMemos.filter((m) => m.items.some((i) => i.status === "OUT"));
  const sale = (mode: "order" | "memo") => `/field/visits/${visit.id}/sale?mode=${mode}`;
  const outHere = openMemos.reduce((n, m) => n + m.items.filter((i) => i.status === "OUT").length, 0);
  // The server decides whether selling is allowed (open visit + arrival photo). Never offer it otherwise.
  const canSell = data.resume?.canSell === true;
  const pendingAcks = data.resume?.pendingAcks ?? data.memosCreated.filter((m) => m.ackStatus !== "ACKNOWLEDGED").map((m) => ({ memoId: m.id, number: m.number }));
  const orderValue = data.orders.reduce((s, o) => s + o.totalPaise, 0);
  // Selling is the job in the shop: until an order, memo or return is recorded, the thumb-zone primary is
  // Create order; once something is recorded, finishing the visit takes over.
  const recorded = data.orders.length + data.memosCreated.length + (data.returns?.length ?? 0) > 0;
  const sellFirst = canSell && !recorded;

  return (
    <>
      <ShopMoney d={data} />
      <div className="mx-4 mt-3">
        <ProofSummary proof={proofs[proofs.length - 1]} shopName={shop.name} verification={visit.verification} checkInDistanceM={visit.checkInDistanceM} checkInAt={visit.checkInAt} />
      </div>

      {!sellFirst && (
        <div className="mx-4 mt-5 grid grid-cols-2 gap-2.5" aria-label="Sell to this retailer">
          <ActionTile href={sale("order")} icon={ShoppingBag} label="Create order" disabled={!canSell}
            hint={visit.orderCount ? <><span className="num">{plural(visit.orderCount, "order")}</span>{orderValue ? <>, <span className="num">{formatINRCompact(orderValue)}</span></> : null}</> : "At today’s gold rate"} />
          <ActionTile href={sale("memo")} icon={Gem} label="Leave on memo" disabled={!canSell}
            hint={bag.length ? <><span className="num">{plural(bag.length, "piece")}</span> in your bag</> : "Your bag is empty"} />
        </div>
      )}

      <ul className={cn("border-y border-line", sellFirst ? "mt-5" : "mt-3")} aria-label="More actions">
        {outHere > 0 && <li className="border-b border-line"><TapRow onClick={() => { setReturnMemo(null); setDrawer("return"); }} icon={Undo2} label="Return samples" hint={`${outHere} out here`} disabled={!canSell} /></li>}
        <li className="border-b border-line"><TapRow onClick={() => setDrawer("note")} icon={NotebookPen} label="Add note" hint={data.notes.length ? plural(data.notes.length, "note") : undefined} /></li>
        <li><TapRow href={`${sale("order")}&browse=1`} icon={BookOpen} label="Show the catalog" hint="Today’s prices" /></li>
      </ul>
      {sellFirst && (
        <div className="px-4 pt-4">
          <Button variant="outline" className={cn("h-11 w-full text-[15px]", PRESS_BTN)} onClick={() => setDrawer("complete")}><CheckCheck />Complete visit</Button>
          <p className="mt-1.5 text-center text-[12px] text-ink-3">Nothing sold? You can still close the visit.</p>
        </div>
      )}

      <SamplesHere memos={openMemos} valuePaise={visit.activeMemoValuePaise} canSell={canSell}
        onReturn={(id) => { setReturnMemo(id); setDrawer("return"); }}
        onSell={(id) => { setMemoId(id); setDrawer("sell"); }}
        onExtend={(id) => { setMemoId(id); setDrawer("extend"); }} />
      <Timeline data={data} live />
      <PreviousOrders d={data} />
      <Retailer d={data} />

      <BottomSpacer h={pendingAcks.length ? 116 : 92} />
      <BottomBar>
        {pendingAcks.length > 0 && (
          <p className="mb-2 flex items-center justify-center gap-1.5 text-center text-[13px] text-warn">
            <Hourglass className="size-3.5 shrink-0" />
            <span className="truncate">{pendingAcks.length === 1 ? <><span className="num">{pendingAcks[0].number}</span> awaits the retailer’s receipt</> : `${pendingAcks.length} memos await the retailer’s receipt`}</span>
          </p>
        )}
        {sellFirst ? (
          <div className="grid grid-cols-[1fr_1fr] gap-2">
            <Button asChild className={cn("h-12 text-[15px]", PRESS_BTN)}><Link href={sale("order")}><ShoppingBag />Create order</Link></Button>
            <Button asChild variant="outline" className={cn("h-12 text-[15px]", PRESS_BTN)}><Link href={sale("memo")}><Gem />Leave on memo</Link></Button>
          </div>
        ) : (
          <Button className={cn("h-12 w-full text-[15px]", PRESS_BTN)} onClick={() => setDrawer("complete")}><CheckCheck />Complete visit</Button>
        )}
      </BottomBar>

      <NoteDrawer open={drawer === "note"} onOpenChange={(o) => setDrawer(o ? "note" : null)} visitId={visit.id} />
      <ReturnDrawer open={drawer === "return"} onOpenChange={(o) => setDrawer(o ? "return" : null)} visitId={visit.id} memos={openMemos} initialMemoId={returnMemo} />
      <CompleteDrawer open={drawer === "complete"} onOpenChange={(o) => setDrawer(o ? "complete" : null)} data={data} />
      <SellFromMemoDrawer open={drawer === "sell"} onOpenChange={(o) => setDrawer(o ? "sell" : null)} visitId={visit.id} shopName={shop.name} memo={shopContext.activeMemos.find((m) => m.id === memoId) ?? null} />
      <ExtendMemoDrawer open={drawer === "extend"} onOpenChange={(o) => setDrawer(o ? "extend" : null)} memo={shopContext.activeMemos.find((m) => m.id === memoId) ?? null} />
    </>
  );
}

/** Big two-up action for the two things Rahul does at the counter. Disabled tiles are not links. */
function ActionTile({ href, icon: Icon, label, hint, disabled }: {
  href: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; label: string; hint: React.ReactNode; disabled?: boolean;
}) {
  const body = (
    <>
      <Icon className={cn("size-[22px]", disabled ? "text-ink-3" : "text-ink")} strokeWidth={1.7} />
      <span className={cn("mt-4 block text-[15px] font-semibold leading-tight", disabled ? "text-ink-3" : "text-ink")}>{label}</span>
      <span className="mt-0.5 block truncate text-[13px] text-ink-2">{hint}</span>
    </>
  );
  const cls = "block min-h-[96px] rounded-xl border border-line bg-paper px-3.5 pb-3 pt-3.5 text-left";
  return disabled
    ? <div aria-disabled className={cn(cls, "opacity-60")}>{body}</div>
    : <Link href={href} className={cn(cls, "hover:border-line-strong hover:bg-hover", PRESS)}>{body}</Link>;
}

export function ClosedVisit({ data }: { data: VisitDetail }) {
  const { visit, shop, proofs } = data;
  const mins = visit.startedAt && visit.completedAt ? Math.round((Date.parse(visit.completedAt) - Date.parse(visit.checkInAt ?? visit.startedAt)) / 60000) : null;
  const orderValue = data.orders.reduce((s, o) => s + o.totalPaise, 0);
  const memoValue = data.memosCreated.reduce((s, m) => s + m.totalValuePaise, 0);
  const returned = (data.returns ?? []).reduce((n, r) => n + r.pieces.length, 0);
  return (
    <>
      {visit.status === "COMPLETED" ? (
        <section aria-label="Visit outcome" className="mx-4 overflow-hidden rounded-xl border border-line">
          <div className="flex items-start gap-3 px-4 py-3.5">
            <CheckCircle2 className="mt-px size-5 shrink-0 text-verified" />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-ink">Visit completed</p>
              <p className="text-[13px] text-ink-2"><span className="num">{fmtTime(visit.completedAt)}</span>, {fmtDay(visit.completedAt)}{mins !== null && mins > 0 ? <>, <span className="num">{mins}</span> min at the shop</> : null}</p>
            </div>
          </div>
          <dl className="grid grid-cols-3 divide-x divide-line border-t border-line">
            <Outcome label="Orders" value={data.orders.length ? formatINRCompact(orderValue) : "None"} sub={data.orders.length ? plural(data.orders.length, "order") : undefined} />
            <Outcome label="Left on memo" gold={!!data.memosCreated.length} value={data.memosCreated.length ? formatINRCompact(memoValue) : "None"} sub={data.memosCreated.length ? plural(data.memosCreated.length, "memo") : undefined} />
            <Outcome label="Returned" value={returned ? plural(returned, "piece") : "None"} />
          </dl>
          <p className="whitespace-pre-line border-t border-line px-4 py-3 text-[14px] text-ink-2">{visit.summary || <span className="text-ink-3">No summary was written for this visit.</span>}</p>
        </section>
      ) : (
        <p className="mx-4 rounded-xl border border-line px-4 py-3 text-[14px] text-ink-2">{visit.status === "MISSED" ? "This visit was missed. Nothing can be recorded on it now." : "This visit was cancelled."}</p>
      )}
      {proofs.length > 0 && (
        <div className="mx-4 mt-3">
          <ProofSummary proof={proofs[proofs.length - 1]} shopName={shop.name} verification={visit.verification} checkInDistanceM={visit.checkInDistanceM} checkInAt={visit.checkInAt} />
        </div>
      )}
      <MemosStillOut data={data} />
      <Timeline data={data} />
      <Retailer d={data} />
    </>
  );
}

function Outcome({ label, value, sub, gold }: { label: string; value: string; sub?: string; gold?: boolean }) {
  const none = value === "None";
  return (
    <div className="min-w-0 px-3 py-2.5">
      <dt className="truncate text-[12px] text-ink-2">{label}</dt>
      <dd className={cn("num mt-0.5 truncate text-[16px] font-semibold", none ? "font-normal text-ink-3" : gold ? "text-gold-ink" : "text-ink")}>{value}</dd>
      {sub && <dd className="truncate text-[12px] text-ink-3">{sub}</dd>}
    </div>
  );
}

/** A closed visit can't record anything, but the shop may still hold pieces on memo. Selling or taking
 *  them back happens on an open visit at that shop (arrival photo first — PROOF_REQUIRED_BEFORE_SALE), so
 *  say that, and open the agent's next visit there when the route has one. Agents can't add visits
 *  themselves; the manager assigns them. */
function MemosStillOut({ data }: { data: VisitDetail }) {
  const { shop, visit } = data;
  const memos = data.shopContext.activeMemos.filter((m) => m.items.some((i) => i.status === "OUT"));
  const today = useToday();
  const upcoming = useFieldVisits("upcoming");
  if (!memos.length) return null;
  const live = (s: string) => s === "PLANNED" || s === "CHECKED_IN" || s === "ACTIVE";
  const next = [...(today.data?.visits ?? []), ...(upcoming.data ?? [])].find((v) => v.shop.id === shop.id && v.id !== visit.id && live(v.status));
  const pieces = memos.reduce((n, m) => n + m.items.filter((i) => i.status === "OUT").length, 0);
  const loading = today.isPending || upcoming.isPending;
  return (
    <section aria-label="Samples still at this shop" className="mx-4 mt-3 rounded-xl border border-line px-4 py-3">
      <p className="text-[14px] font-medium text-ink">{plural(pieces, "piece")} still on memo at {shop.name}</p>
      <ul className="mt-1 text-[13px] text-ink-2">
        {memos.map((m) => (
          <li key={m.id} className="flex items-baseline justify-between gap-3 py-0.5">
            <span><span className="num text-ink">{m.number}</span>, <span className={cn(m.daysToDue < 0 ? "text-danger" : m.daysToDue <= 2 ? "text-warn" : "")}>{fmtDue(m.daysToDue).toLowerCase()}</span></span>
            <span className="num text-gold-ink">{formatINRCompact(m.outstandingValuePaise)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[13px] text-ink-2">Start a visit at {shop.name} to sell or return memo pieces. This visit is closed, so nothing more can be recorded on it.</p>
      {next ? (
        <Button asChild variant="outline" className={cn("mt-3 h-11 w-full text-[14px]", PRESS_BTN)}>
          <Link href={`/field/visits/${next.id}`}>{next.status === "PLANNED" ? `Open the visit on ${dayLabel(next.plannedDate)}` : "Open the visit in progress"}</Link>
        </Button>
      ) : !loading ? (
        <p className="mt-2 text-[13px] text-ink-3">{shop.name} isn&apos;t on your route again yet. Ask your manager to add it, then check in there.</p>
      ) : null}
    </section>
  );
}

/** Before check-in / before proof: what Rahul needs to know at the counter. */
export function ShopContext({ d }: { d: VisitDetail }) {
  const inShop = d.visit.status === "CHECKED_IN" || d.visit.status === "ACTIVE";
  const memos = d.shopContext.activeMemos.filter((m) => m.items.some((i) => i.status === "OUT"));
  const last = d.shopContext.lastVisit;
  const prev = d.shopContext.previousOrders[0];
  return (
    <>
      <SectionTitle className="mt-7">{inShop ? "At this shop" : "Before you go in"}</SectionTitle>
      <ShopMoney d={d} className="mt-2" />
      <dl className="mx-4 mt-1 divide-y divide-line">
        {memos.map((m) => (
          <Attr key={m.id} label={m.number}>
            <span className={cn(m.daysToDue < 0 ? "font-medium text-danger" : m.daysToDue <= 2 ? "text-warn" : "text-ink")}>{fmtDue(m.daysToDue)}</span>
            <span className="text-ink-2">, {plural(m.items.filter((i) => i.status === "OUT").length, "piece")} out</span>
          </Attr>
        ))}
        <Attr label="Last visit">{last ? <>{fmtDay(last.completedAt)}<span className="text-ink-2">, {last.agentName}</span></> : <span className="text-ink-3">First visit</span>}</Attr>
        {/* Before check-in the money strip above already shows the last order. */}
        {inShop && <Attr label="Last order">{prev ? <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1"><span><span className="num">{prev.number}</span><span className="text-ink-2">, </span><Money paise={prev.totalPaise} compact /></span>{prev.status !== "CONFIRMED" && prev.status !== "APPROVED" && <OrderStatusPill status={prev.status} />}</span> : <span className="text-ink-3">No orders yet</span>}</Attr>}
        <Attr label="Your bag"><span className="num">{plural(d.bag.length, "piece")}</span><span className="text-ink-2"> to show</span></Attr>
      </dl>
    </>
  );
}

function SamplesHere({ memos, valuePaise, canSell, onReturn, onSell, onExtend }: { memos: Memo[]; valuePaise: number; canSell: boolean; onReturn: (memoId: string) => void; onSell: (memoId: string) => void; onExtend: (memoId: string) => void }) {
  if (!memos.length) return null;
  return (
    <section aria-label="Samples at this shop">
      <SectionTitle className="mt-7" aside={valuePaise ? <span className="num font-medium text-gold-ink">{formatINRCompact(valuePaise)} out</span> : undefined}>Samples at this shop</SectionTitle>
      <ul className="mt-2 border-y border-line">
        {memos.map((m) => {
          const out = m.items.filter((i) => i.status === "OUT");
          return (
            <li key={m.id} className="border-b border-line px-4 py-3.5 last:border-b-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="num text-[15px] font-semibold text-ink">{m.number}</p>
                  <p className={cn("text-[13px]", m.daysToDue < 0 ? "font-medium text-danger" : m.daysToDue <= 2 ? "text-warn" : "text-ink-3")}>{fmtDue(m.daysToDue)}, {fmtDay(m.dueDate)}</p>
                </div>
                <MemoStatusPill status={m.displayStatus} />
              </div>
              <ul className="mt-2.5 space-y-2">
                {out.map((i) => (
                  <li key={i.id} className="flex items-center gap-2.5 text-[13px]">
                    <Thumb src={i.piece.imageUrl} size={32} className="rounded-md" />
                    <span className="num shrink-0 font-medium text-ink">{i.piece.tagCode}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-2">{i.piece.name}</span>
                    <span className="num shrink-0 text-gold-ink">{formatINRCompact(i.valuePaise)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Button variant="outline" className={cn("h-11 px-2 text-[14px]", PRESS_BTN)} disabled={!canSell} onClick={() => onReturn(m.id)}><Undo2 />Return</Button>
                <Button variant="outline" className={cn("h-11 px-2 text-[14px]", PRESS_BTN)} disabled={!canSell} onClick={() => onSell(m.id)}><ShoppingBag />Sell</Button>
                <Button variant="outline" className={cn("h-11 px-2 text-[14px]", PRESS_BTN)} onClick={() => onExtend(m.id)}><CalendarPlus />Extend</Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PreviousOrders({ d }: { d: VisitDetail }) {
  const orders = d.shopContext.previousOrders.filter((o) => o.visitId !== d.visit.id).slice(0, 3);
  if (!orders.length) return null;
  return (
    <>
      <SectionTitle className="mt-7">Previous orders</SectionTitle>
      <ul className="mt-2 border-y border-line">
        {orders.map((o) => (
          <li key={o.id} className="border-b border-line px-4 py-3 last:border-b-0">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="num text-[14px] font-medium text-ink">{o.number}</p>
                <p className="text-[12px] text-ink-3">{fmtDay(o.createdAt)}, {plural(o.items.reduce((s, i) => s + i.quantity, 0), "item")}</p>
              </div>
              <Money paise={o.totalPaise} compact className="text-[14px] font-medium text-ink" />
              {o.status !== "REJECTED" && o.status !== "PENDING_APPROVAL" && <OrderStatusPill status={o.status} />}
            </div>
            {(o.status === "REJECTED" || o.status === "PENDING_APPROVAL") && <OrderDecision order={o} className="mt-2" />}
          </li>
        ))}
      </ul>
    </>
  );
}

function Retailer({ d }: { d: VisitDetail }) {
  const { shop } = d;
  return (
    <>
      <SectionTitle className="mt-7">Retailer</SectionTitle>
      <dl className="mx-4 mt-1 divide-y divide-line">
        <Attr label="Owner">{shop.ownerName ?? <span className="text-ink-3">No value</span>}</Attr>
        <Attr label="Phone">{shop.phone ? <a className="num underline decoration-line-strong underline-offset-4" href={`tel:${shop.phone}`}>{shop.phone}</a> : <span className="text-ink-3">No value</span>}</Attr>
        <Attr label="Credit limit">{shop.creditLimitPaise ? <Money paise={shop.creditLimitPaise} /> : <span className="text-ink-3">No limit</span>}</Attr>
        <Attr label="Address"><span className="text-ink-2">{shop.address}, {shop.city}</span></Attr>
        <Attr label="Shop code"><span className="num text-[13px]">{shop.code}</span></Attr>
      </dl>
    </>
  );
}

type Ev = { at: string; key: string; title: React.ReactNode; body?: React.ReactNode; tone?: "gold" | "green" | "blue" | "grey" };
/** Everything recorded on this visit, oldest first (Attio-style timeline). */
function Timeline({ data, live }: { data: VisitDetail; live?: boolean }) {
  const { visit, orders, memosCreated, notes, proofs } = data;
  const [ack, setAck] = useState<{ memo: Memo; ack: AckLink } | null>(null);
  const [run, busy] = useGuard();
  const reissue = (m: Memo) => run(async () => {
    try { const r = await api<{ ack: AckLink }>(`/memos/${m.id}/ack/link`, { method: "POST", body: {} }); setAck({ memo: m, ack: r.ack }); }
    catch (e) { toast.error(errorMessage(e)); }
  });

  const ev: Ev[] = [];
  if (visit.checkInAt) ev.push({ at: visit.checkInAt, key: "ci", tone: visit.verification === "SIMULATED" ? "blue" : "green", title: <>Checked in{visit.verification === "SIMULATED" ? " (simulated)" : visit.checkInDistanceM !== undefined ? <span className="font-normal text-ink-2">, <span className="num">{fmtFromShop(visit.checkInDistanceM)}</span></span> : null}</> });
  proofs.forEach((p) => ev.push({ at: p.uploadedAt, key: p.id, tone: "grey", title: "Arrival photo uploaded" }));
  orders.forEach((o) => ev.push({
    at: o.createdAt, key: o.id, tone: "grey", title: <>Order <span className="num">{o.number}</span> booked</>,
    body: (
      <div className="overflow-hidden rounded-lg border border-line">
        {o.items.map((i) => (
          <div key={i.id} className="flex items-center gap-2.5 border-b border-line px-3 py-2 text-[13px] last:border-b-0">
            <Thumb src={i.imageUrl} size={28} className="rounded-md" />
            <span className="min-w-0 flex-1 truncate text-ink">{i.name} <span className="text-ink-3">×<span className="num">{i.quantity}</span></span></span>
            <span className="num shrink-0 text-ink-2">{formatINR(i.lineTotalPaise)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-2 border-t border-line bg-[#fafafa] px-3 py-2 text-[13px]">
          {o.status === "CONFIRMED" ? <OrderStatusPill status={o.status} /> : <span className="text-ink-2">Total</span>}
          <span className="num font-semibold text-gold-ink">{formatINR(o.totalPaise)}</span>
        </div>
        {o.status !== "CONFIRMED" && <OrderDecision order={o} className="mx-2 mb-2" />}
      </div>
    ),
  }));
  memosCreated.forEach((m) => ev.push({
    at: m.createdAt, key: m.id, tone: "gold", title: <>Memo <span className="num">{m.number}</span> left with retailer</>,
    body: (
      <div className="overflow-hidden rounded-lg border border-line">
        {m.items.map((i) => (
          <div key={i.id} className="flex items-center gap-2.5 border-b border-line px-3 py-2 text-[13px] last:border-b-0">
            <Thumb src={i.piece.imageUrl} size={28} className="rounded-md" />
            <span className="num shrink-0 font-medium text-ink">{i.piece.tagCode}</span>
            <span className="min-w-0 flex-1 truncate text-ink-2">{i.piece.name}</span>
            <span className="num shrink-0 text-ink-3">{formatGrams(i.piece.netWeightMg)}</span>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line bg-[#fafafa] px-3 py-2 text-[13px]">
          {m.ackStatus === "ACKNOWLEDGED" ? <Dot tone="green" className="text-[13px]">Acknowledged <span className="num">{fmtTime(m.ackAt)}</span></Dot> : <Dot tone="amber" className="text-[13px]">Awaiting retailer</Dot>}
          <span className="text-ink-3">Due {fmtDay(m.dueDate)}</span>
          <span className="num ml-auto font-semibold text-gold-ink">{formatINRCompact(m.totalValuePaise)}</span>
        </div>
        {m.ackStatus !== "ACKNOWLEDGED" && live && (
          <div className="border-t border-line px-2 py-2">
            <Button variant="outline" className={cn("h-10 w-full text-[14px]", PRESS_BTN)} disabled={busy} onClick={() => reissue(m)}>{busy ? <Loader2 className="animate-spin" /> : <QrCode />}Show QR again</Button>
          </div>
        )}
      </div>
    ),
  }));
  (data.returns ?? []).forEach((r, i) => ev.push({
    at: r.at, key: r.eventId ?? `ret-${r.memoId}-${i}`, tone: "grey", title: <>{plural(r.pieces.length, "piece")} returned from <span className="num">{r.memoNumber}</span></>,
    body: (
      <div className="overflow-hidden rounded-lg border border-line">
        {r.pieces.map((p) => (
          <div key={p.id} className="flex items-center gap-2.5 border-b border-line px-3 py-2 text-[13px] last:border-b-0">
            <Undo2 className="size-3.5 shrink-0 text-ink-3" />
            <span className="num shrink-0 font-medium text-ink">{p.tagCode}</span>
            <span className="min-w-0 flex-1 truncate text-ink-2">{p.name}</span>
            <span className="shrink-0 text-ink-3">Back in bag</span>
          </div>
        ))}
      </div>
    ),
  }));
  notes.forEach((n) => ev.push({ at: n.createdAt, key: n.id, tone: "grey", title: "Note added", body: <p className="whitespace-pre-line rounded-lg bg-sunken px-3 py-2 text-[14px] text-ink">{n.body}</p> }));
  if (visit.completedAt) ev.push({ at: visit.completedAt, key: "done", tone: "green", title: "Visit completed" });
  ev.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const returned = (data.returns ?? []).reduce((n, r) => n + r.pieces.length, 0);
  const DOT = { gold: "bg-gold", green: "bg-verified", blue: "bg-info", grey: "bg-ink-3" } as const;

  return (
    <section aria-label="This visit">
      <SectionTitle className="mt-7" aside={orders.length || memosCreated.length || returned ? <Chip tone="grey">{[orders.length && plural(orders.length, "order"), memosCreated.length && plural(memosCreated.length, "memo"), returned && `${returned} returned`].filter(Boolean).join(", ")}</Chip> : undefined}>This visit</SectionTitle>
      {ev.length === 0 ? <p className="px-4 pt-2 text-[14px] text-ink-3">Nothing recorded yet.</p> : (
        <ol className="mt-3 px-4">
          {ev.map((e, i) => (
            <li key={e.key} className="relative flex gap-3 pb-5 last:pb-0">
              {i < ev.length - 1 && <span aria-hidden className="absolute bottom-0 left-[9px] top-6 border-l border-dashed border-line-strong" />}
              <span aria-hidden className="relative mt-[3px] grid size-[19px] shrink-0 place-items-center rounded-full border border-line-strong bg-paper"><span className={cn("size-[7px] rounded-full", DOT[e.tone ?? "grey"])} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 text-[14px] font-medium text-ink">{e.title}</p>
                  <span className="num shrink-0 text-[12px] text-ink-3">{fmtTime(e.at)}</span>
                </div>
                {e.body && <div className="mt-2">{e.body}</div>}
              </div>
            </li>
          ))}
        </ol>
      )}
      <DrawerRoot open={!!ack} onOpenChange={(o) => !o && setAck(null)}>
        <DrawerContent className="mx-auto max-w-[520px] data-[vaul-drawer-direction=bottom]:max-h-[94dvh]">
          <DrawerTitle className="sr-only">Retailer acknowledgement</DrawerTitle>
          <div className="overflow-y-auto px-4 pb-8 pt-2 safe-bottom">{ack && <MemoAck key={ack.ack.url} visitId={visit.id} memo={ack.memo} ack={ack.ack} embedded />}</div>
        </DrawerContent>
      </DrawerRoot>
    </section>
  );
}
