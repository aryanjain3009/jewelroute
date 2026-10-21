"use client";
import Link from "next/link";
import { useState } from "react";
import { BookOpen, CalendarPlus, CheckCheck, ChevronRight, Gem, Loader2, MapPin, NotebookPen, QrCode, ShoppingBag, Undo2 } from "lucide-react";
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
import { Attr, SectionTitle, Thumb } from "./bits";
import { ProofSummary } from "./proof";
import { MemoAck } from "./sale/memo-ack";
import { CompleteDrawer, ExtendMemoDrawer, NoteDrawer, ReturnDrawer, SellFromMemoDrawer } from "./visit-drawers";
import { errorMessage } from "./queries";
import { fmtDay, fmtDistance, fmtDue, fmtTime, plural } from "./format";
import { useGuard } from "./guard";
import { BottomBar, BottomSpacer } from "./top-bar";
import type { AckLink, VisitDetail } from "./types";

type Drawer = null | "note" | "return" | "complete" | "sell" | "extend";

/** "Location verified · 38 m" — exactly what the server recorded at check-in. */
export function ArrivalLine({ v }: { v: VisitDetail["visit"] }) {
  const sim = v.verification === "SIMULATED"; const low = v.verification === "LOW_ACCURACY";
  return (
    <div className={cn("mx-4 flex items-center gap-2.5 rounded-xl border px-4 py-3", sim ? "border-info/20 bg-info-soft" : low ? "border-warn/20 bg-warn-soft" : "border-verified/20 bg-verified-soft")}>
      <MapPin className={cn("size-[18px] shrink-0", sim ? "text-info" : low ? "text-warn" : "text-verified")} />
      <p className="min-w-0 flex-1 text-[14px] font-medium text-ink">
        {sim ? "Arrival simulated (demo)" : low ? "Location low accuracy" : "Location verified"}
        {!sim && v.checkInDistanceM !== undefined && <> · <span className="num">{fmtDistance(v.checkInDistanceM)}</span></>}
      </p>
      <span className="num shrink-0 text-[13px] text-ink-2">In {fmtTime(v.checkInAt)}</span>
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

  return (
    <>
      <ArrivalLine v={visit} />
      <div className="mx-4 mt-3 overflow-hidden rounded-xl border border-line">
        <ProofSummary proof={proofs[proofs.length - 1]} shopName={shop.name} verification={visit.verification} checkInDistanceM={visit.checkInDistanceM} />
      </div>

      <SectionTitle className="mt-6">Actions</SectionTitle>
      <ul className="mt-2 border-y border-line" aria-label="Visit actions">
        <Action href={`${sale("order")}&browse=1`} icon={BookOpen} label="Browse catalog" hint="Today’s prices" />
        <Action href={sale("order")} icon={ShoppingBag} label="Create order" hint={visit.orderCount ? plural(visit.orderCount, "order") : undefined} disabled={!canSell} />
        <Action href={sale("memo")} icon={Gem} label="Leave on memo" hint={plural(bag.length, "piece") + " in bag"} gold disabled={!canSell} />
        <Action onClick={() => { setReturnMemo(null); setDrawer("return"); }} icon={Undo2} label="Return samples" hint={outHere ? `${outHere} out here` : "None out here"} disabled={!outHere || !canSell} />
        <Action onClick={() => setDrawer("note")} icon={NotebookPen} label="Add note" hint={data.notes.length ? plural(data.notes.length, "note") : undefined} />
      </ul>

      <Timeline data={data} live />
      <SamplesHere memos={openMemos} valuePaise={visit.activeMemoValuePaise} canSell={canSell}
        onReturn={(id) => { setReturnMemo(id); setDrawer("return"); }}
        onSell={(id) => { setMemoId(id); setDrawer("sell"); }}
        onExtend={(id) => { setMemoId(id); setDrawer("extend"); }} />
      <PreviousOrders d={data} />
      <Retailer d={data} />

      <BottomSpacer h={92} />
      <BottomBar>
        <Button className="h-12 w-full text-[15px]" onClick={() => setDrawer("complete")}><CheckCheck />Complete visit</Button>
      </BottomBar>

      <NoteDrawer open={drawer === "note"} onOpenChange={(o) => setDrawer(o ? "note" : null)} visitId={visit.id} />
      <ReturnDrawer open={drawer === "return"} onOpenChange={(o) => setDrawer(o ? "return" : null)} visitId={visit.id} memos={openMemos} initialMemoId={returnMemo} />
      <CompleteDrawer open={drawer === "complete"} onOpenChange={(o) => setDrawer(o ? "complete" : null)} data={data} />
      <SellFromMemoDrawer open={drawer === "sell"} onOpenChange={(o) => setDrawer(o ? "sell" : null)} visitId={visit.id} memo={shopContext.activeMemos.find((m) => m.id === memoId) ?? null} />
      <ExtendMemoDrawer open={drawer === "extend"} onOpenChange={(o) => setDrawer(o ? "extend" : null)} memo={shopContext.activeMemos.find((m) => m.id === memoId) ?? null} />
    </>
  );
}

export function ClosedVisit({ data }: { data: VisitDetail }) {
  const { visit, shop, proofs } = data;
  const mins = visit.startedAt && visit.completedAt ? Math.round((Date.parse(visit.completedAt) - Date.parse(visit.checkInAt ?? visit.startedAt)) / 60000) : null;
  return (
    <>
      <div className="mx-4 rounded-xl border border-line px-4 py-3">
        {visit.status === "COMPLETED" ? (
          <>
            <p className="text-[14px] text-ink"><span className="font-medium">Completed</span> <span className="num text-ink-2">{fmtTime(visit.completedAt)}, {fmtDay(visit.completedAt)}{mins !== null && mins > 0 ? `, ${mins} min` : ""}</span></p>
            <p className="mt-1 whitespace-pre-line text-[14px] text-ink-2">{visit.summary || "No summary was written for this visit."}</p>
          </>
        ) : (
          <p className="text-[14px] text-ink-2">{visit.status === "MISSED" ? "This visit was missed. Nothing can be recorded on it now." : "This visit was cancelled."}</p>
        )}
      </div>
      {proofs.length > 0 && (
        <div className="mx-4 mt-3 overflow-hidden rounded-xl border border-line">
          <ProofSummary proof={proofs[proofs.length - 1]} shopName={shop.name} verification={visit.verification} checkInDistanceM={visit.checkInDistanceM} />
        </div>
      )}
      <Timeline data={data} />
      <Retailer d={data} />
    </>
  );
}

/** Before check-in / before proof: what Rahul needs to know at the counter. */
export function ShopContext({ d }: { d: VisitDetail }) {
  const memos = d.shopContext.activeMemos.filter((m) => m.items.some((i) => i.status === "OUT"));
  const last = d.shopContext.lastVisit;
  const prev = d.shopContext.previousOrders[0];
  return (
    <>
      <SectionTitle className="mt-6">Before you go in</SectionTitle>
      <dl className="mx-4 mt-1 divide-y divide-line">
        <Attr label="On memo here">{memos.length ? <span className="text-gold-ink">{plural(memos.length, "memo")}{d.visit.activeMemoValuePaise ? <>, <span className="num">{formatINRCompact(d.visit.activeMemoValuePaise)}</span></> : null}</span> : <span className="text-ink-3">Nothing</span>}</Attr>
        {memos.map((m) => (
          <Attr key={m.id} label={m.number}><span className={cn(m.daysToDue < 0 ? "text-danger" : m.daysToDue <= 2 ? "text-warn" : "text-ink")}>{fmtDue(m.daysToDue)}</span>, {plural(m.items.filter((i) => i.status === "OUT").length, "piece")}</Attr>
        ))}
        <Attr label="Last visit">{last ? <>{fmtDay(last.completedAt)}, {last.agentName}</> : <span className="text-ink-3">First visit</span>}</Attr>
        <Attr label="Last order">{prev ? <><span className="num">{prev.number}</span>, <Money paise={prev.totalPaise} compact /></> : <span className="text-ink-3">No orders yet</span>}</Attr>
        <Attr label="Your bag"><span className="num">{plural(d.bag.length, "piece")}</span> to show</Attr>
      </dl>
    </>
  );
}

function Action({ href, onClick, icon: Icon, label, hint, disabled, gold }: {
  href?: string; onClick?: () => void; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; label: string; hint?: string; disabled?: boolean; gold?: boolean;
}) {
  const cls = cn("flex min-h-[52px] w-full items-center gap-3 px-4 text-left transition-colors hover:bg-hover active:bg-sunken", disabled && "pointer-events-none opacity-45");
  const body = (
    <>
      <Icon className={cn("size-5 shrink-0", gold ? "text-gold" : "text-ink-2")} strokeWidth={1.75} />
      <span className="flex-1 text-[15px] font-medium text-ink">{label}</span>
      {hint && <span className="text-[13px] text-ink-3">{hint}</span>}
      <ChevronRight className="size-4 shrink-0 text-ink-3" />
    </>
  );
  return <li className="border-b border-line last:border-b-0">{href && !disabled ? <Link href={href} className={cls}>{body}</Link> : <button type="button" onClick={onClick} disabled={disabled} aria-disabled={disabled} className={cls}>{body}</button>}</li>;
}

function SamplesHere({ memos, valuePaise, canSell, onReturn, onSell, onExtend }: { memos: Memo[]; valuePaise: number; canSell: boolean; onReturn: (memoId: string) => void; onSell: (memoId: string) => void; onExtend: (memoId: string) => void }) {
  if (!memos.length) return null;
  return (
    <>
      <SectionTitle className="mt-7" aside={valuePaise ? <span className="num text-gold-ink">{formatINRCompact(valuePaise)} out</span> : undefined}>Samples at this shop</SectionTitle>
      <ul className="mt-2 border-y border-line">
        {memos.map((m) => {
          const out = m.items.filter((i) => i.status === "OUT");
          return (
            <li key={m.id} className="border-b border-line px-4 py-3 last:border-b-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="num text-[14px] font-medium text-ink">{m.number}</p>
                  <p className={cn("text-[13px]", m.daysToDue < 0 ? "text-danger" : m.daysToDue <= 2 ? "text-warn" : "text-ink-3")}>{fmtDue(m.daysToDue)}, {fmtDay(m.dueDate)}</p>
                </div>
                <MemoStatusPill status={m.displayStatus} />
              </div>
              <ul className="mt-2 space-y-1.5">
                {out.map((i) => (
                  <li key={i.id} className="flex items-center gap-2.5 text-[13px]">
                    <Thumb src={i.piece.imageUrl} size={28} className="rounded-md" />
                    <span className="num font-medium text-ink">{i.piece.tagCode}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-2">{i.piece.name}</span>
                    <span className="num text-gold-ink">{formatINRCompact(i.valuePaise)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Button variant="outline" className="h-11 px-2" disabled={!canSell} onClick={() => onReturn(m.id)}><Undo2 />Return</Button>
                <Button variant="outline" className="h-11 px-2" disabled={!canSell} onClick={() => onSell(m.id)}><ShoppingBag />Sell</Button>
                <Button variant="outline" className="h-11 px-2" onClick={() => onExtend(m.id)}><CalendarPlus />Extend</Button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
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
          <li key={o.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="num text-[14px] font-medium text-ink">{o.number}</p>
              <p className="text-[12px] text-ink-3">{fmtDay(o.createdAt)}, {plural(o.items.reduce((s, i) => s + i.quantity, 0), "item")}</p>
            </div>
            <Money paise={o.totalPaise} compact className="text-[14px] font-medium text-ink" />
            <OrderStatusPill status={o.status} />
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
        <Attr label="Credit limit"><Money paise={shop.creditLimitPaise} /></Attr>
        <Attr label="Address"><span className="text-ink-2">{shop.address}, {shop.city}</span></Attr>
        <Attr label="Shop code"><span className="num text-[13px]">{shop.code}</span></Attr>
      </dl>
    </>
  );
}

type Ev = { at: string; key: string; title: React.ReactNode; body?: React.ReactNode };
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
  if (visit.checkInAt) ev.push({ at: visit.checkInAt, key: "ci", title: <>Checked in{visit.verification === "SIMULATED" ? " (simulated)" : visit.checkInDistanceM !== undefined ? <> · <span className="num">{fmtDistance(visit.checkInDistanceM)}</span> from shop</> : null}</> });
  proofs.forEach((p) => ev.push({ at: p.uploadedAt, key: p.id, title: "Arrival photo uploaded" }));
  orders.forEach((o) => ev.push({
    at: o.createdAt, key: o.id, title: <>Order <span className="num">{o.number}</span> booked</>,
    body: (
      <div className="rounded-lg border border-line">
        {o.items.map((i) => (
          <div key={i.id} className="flex items-center gap-2.5 border-b border-line px-3 py-2 text-[13px] last:border-b-0">
            <Thumb src={i.imageUrl} size={28} className="rounded-md" />
            <span className="min-w-0 flex-1 truncate text-ink">{i.name} <span className="text-ink-3">×{i.quantity}</span></span>
            <span className="num text-ink-2">{formatINR(i.lineTotalPaise)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-2 px-3 py-2 text-[13px]">
          <OrderStatusPill status={o.status} />
          <span className="num font-semibold text-gold-ink">{formatINR(o.totalPaise)}</span>
        </div>
      </div>
    ),
  }));
  memosCreated.forEach((m) => ev.push({
    at: m.createdAt, key: m.id, title: <>Memo <span className="num">{m.number}</span> left with retailer</>,
    body: (
      <div className="rounded-lg border border-line">
        {m.items.map((i) => (
          <div key={i.id} className="flex items-center gap-2.5 border-b border-line px-3 py-2 text-[13px] last:border-b-0">
            <Thumb src={i.piece.imageUrl} size={28} className="rounded-md" />
            <span className="num font-medium text-ink">{i.piece.tagCode}</span>
            <span className="min-w-0 flex-1 truncate text-ink-2">{i.piece.name}</span>
            <span className="num text-ink-3">{formatGrams(i.piece.netWeightMg)}</span>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-[13px]">
          {m.ackStatus === "ACKNOWLEDGED" ? <Dot tone="green" className="text-[13px]">Acknowledged {fmtTime(m.ackAt)}</Dot> : <Dot tone="amber" className="text-[13px]">Awaiting retailer</Dot>}
          <span className="text-ink-3">due {fmtDay(m.dueDate)}</span>
          <span className="num ml-auto font-semibold text-gold-ink">{formatINRCompact(m.totalValuePaise)}</span>
        </div>
        {m.ackStatus !== "ACKNOWLEDGED" && live && (
          <div className="border-t border-line px-3 py-2">
            <Button variant="outline" size="sm" className="h-9" disabled={busy} onClick={() => reissue(m)}>{busy ? <Loader2 className="animate-spin" /> : <QrCode />}Show QR again</Button>
          </div>
        )}
      </div>
    ),
  }));
  (data.returns ?? []).forEach((r, i) => ev.push({
    at: r.at, key: r.eventId ?? `ret-${r.memoId}-${i}`, title: <>{plural(r.pieces.length, "piece")} returned from <span className="num">{r.memoNumber}</span></>,
    body: (
      <div className="rounded-lg border border-line">
        {r.pieces.map((p) => (
          <div key={p.id} className="flex items-center gap-2.5 border-b border-line px-3 py-2 text-[13px] last:border-b-0">
            <Undo2 className="size-3.5 shrink-0 text-ink-3" />
            <span className="num font-medium text-ink">{p.tagCode}</span>
            <span className="min-w-0 flex-1 truncate text-ink-2">{p.name}</span>
            <span className="shrink-0 text-ink-3">back in bag</span>
          </div>
        ))}
      </div>
    ),
  }));
  notes.forEach((n) => ev.push({ at: n.createdAt, key: n.id, title: "Note added", body: <p className="whitespace-pre-line text-[14px] text-ink-2">{n.body}</p> }));
  if (visit.completedAt) ev.push({ at: visit.completedAt, key: "done", title: "Visit completed" });
  ev.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const returned = (data.returns ?? []).reduce((n, r) => n + r.pieces.length, 0);

  return (
    <section>
      <SectionTitle className="mt-7" aside={orders.length || memosCreated.length || returned ? <Chip tone="grey">{[orders.length && plural(orders.length, "order"), memosCreated.length && plural(memosCreated.length, "memo"), returned && `${returned} returned`].filter(Boolean).join(", ")}</Chip> : undefined}>This visit</SectionTitle>
      {ev.length === 0 ? <p className="px-4 pt-2 text-[14px] text-ink-3">Nothing recorded yet.</p> : (
        <ol className="mt-3 px-4">
          {ev.map((e, i) => (
            <li key={e.key} className="relative flex gap-3 pb-4 last:pb-0">
              {i < ev.length - 1 && <span aria-hidden className="absolute bottom-0 left-[9px] top-6 border-l border-dashed border-line-strong" />}
              <span aria-hidden className="relative mt-1 grid size-[19px] shrink-0 place-items-center rounded-full border border-line-strong bg-paper"><span className="size-[7px] rounded-full bg-ink-3" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[14px] font-medium text-ink">{e.title}</p>
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
          <div className="overflow-y-auto px-4 pb-8 pt-2">{ack && <MemoAck key={ack.ack.url} visitId={visit.id} memo={ack.memo} ack={ack.ack} embedded />}</div>
        </DrawerContent>
      </DrawerRoot>
    </section>
  );
}
