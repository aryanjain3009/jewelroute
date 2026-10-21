"use client";
import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { AlertCircle, Check, Hourglass, Loader2, Minus, Plus, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { formatGrams, formatINR, formatRate, istDate, PURITY_LABEL } from "@jewelroute/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PurityTag } from "@/components/jr/money";
import { OrderStatusPill } from "@/components/jr/status";
import { api, ApiError } from "@/lib/api";
import type { CreditPosition, Design, Order } from "@/lib/types";
import { qk, useSync } from "@/lib/sync";
import { reasonText } from "@/components/app/status";
import { cn } from "@/lib/utils";
import { PRESS_BTN, SectionTitle, Thumb } from "../bits";
import { fmtDay, fmtTime, plural } from "../format";
import { errorMessage } from "../queries";
import { opKey, sendConfirmed, UnconfirmedError, useGuard } from "../guard";
import { BottomBar, BottomSpacer } from "../top-bar";
import type { CatalogRate } from "../types";
import type { orderPreview } from "./cart";

/** "1:53 pm" today, "20 Oct, 10:00 am" for an older rate row. */
const rateWhen = (iso: string) => (istDate(new Date(iso)) === istDate() ? fmtTime(iso) : `${fmtDay(iso)}, ${fmtTime(iso)}`);

/** Order composer: product · purity · qty · price per line (before GST; GST once on the subtotal), totals, one submit. */
export function OrderReview({ visitId, shopName, preview: s, rates, notes, onNotes, onSetQty, onDone, blockReason }: {
  visitId: string; shopName: string; preview: ReturnType<typeof orderPreview>; rates: CatalogRate[];
  notes: string; onNotes: (n: string) => void; onSetQty: (d: Design, q: number) => void; onDone: (o: Order) => void; blockReason?: string;
}) {
  const sync = useSync();
  const [run, busy] = useGuard();
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const purities = [...new Set(s.lines.map((l) => l.design.purity))];
  const scope = `order:${visitId}`;
  // Server-computed credit position for this prospective total (the server re-checks when the order is written).
  const credit = useQuery({
    queryKey: [...qk.credit, "visit", visitId, s.totalPaise],
    queryFn: () => api<CreditPosition>(`/visits/${visitId}/credit?amountPaise=${s.totalPaise}`),
    enabled: s.totalPaise > 0 && !blockReason,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
  const needsApproval = credit.data?.requiresApproval === true;

  const submit = () => run(async () => {
    const items = s.lines.map((l) => ({ designId: l.design.id, quantity: l.qty })).sort((a, b) => a.designId.localeCompare(b.designId));
    const body = { visitId, items, notes: notes.trim() || undefined };
    // Same order body → same Idempotency-Key, even after a failed response or a reload. No duplicate orders.
    const key = opKey.for(scope, JSON.stringify(body));
    setError(null);
    setChecking(false);
    try {
      const { order } = await sendConfirmed(() => api<{ order: Order }>("/orders", { body, idempotencyKey: key }), () => setChecking(true));
      opKey.clear(scope);
      setUnconfirmed(false);
      sync("order.created");
      onDone(order);
    } catch (e) {
      setChecking(false);
      if (e instanceof UnconfirmedError) {
        // Unknown outcome: keep the cart and the key; a retry replays the same request (at most one order).
        setUnconfirmed(true);
        setError("We couldn't confirm the order. Your order is kept. Tap Retry; it sends the same request, so it can never be booked twice.");
        return;
      }
      setUnconfirmed(false);
      opKey.clear(scope); // a definite "no": nothing was booked
      if (e instanceof ApiError && e.code === "PROOF_REQUIRED_BEFORE_SALE") sync("visit.proof_uploaded");
      setError(errorMessage(e));
    }
  });

  const rateNote = rates.filter((r) => purities.includes(r.purity)).map((r) => `${PURITY_LABEL[r.purity]} ${formatRate(r.ratePaisePerGram)} (rate as of ${rateWhen(r.effectiveFrom)})`).join(", ");

  return (
    <main className="pb-4">
      <SectionTitle className="pt-4" aside={<span className="num">{plural(s.items, "item")}, {formatGrams(s.weightMg)}</span>}>Items</SectionTitle>
      <ul className="mt-2 border-y border-line">
        {s.lines.map(({ design: d, qty }) => (
          <li key={d.id} className="flex gap-3 border-b border-line px-4 py-3 last:border-b-0">
            <Thumb src={d.imageUrls[0]} size={64} className="rounded-[10px]" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 font-display text-[16px] leading-snug text-ink">{d.name}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-3"><PurityTag purity={d.purity} className="h-[18px] px-1 text-[10.5px]" /><span className="num">{formatGrams(d.netWeightMg)}</span><span className="num truncate">{d.sku}</span></p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex h-11 items-center rounded-lg border border-line-strong">
                  <button type="button" aria-label={qty === 1 ? `Remove ${d.name}` : `Fewer ${d.name}`} className="grid size-11 place-items-center text-ink-2 transition-colors duration-150 active:bg-sunken" onClick={() => onSetQty(d, qty - 1)}>
                    {qty === 1 ? <Trash2 className="size-4" /> : <Minus className="size-4" />}
                  </button>
                  <span className="num w-7 text-center text-[15px] font-semibold">{qty}</span>
                  <button type="button" aria-label={`More ${d.name}`} className="grid size-11 place-items-center text-ink-2 transition-colors duration-150 active:bg-sunken" onClick={() => onSetQty(d, qty + 1)}><Plus className="size-4" /></button>
                </div>
                <div className="text-right">
                  <p className="num text-[15px] font-semibold text-ink">{formatINR(d.price!.unitPricePaise * qty)}</p>
                  {qty > 1 && <p className="num text-[12px] text-ink-3">{formatINR(d.price!.unitPricePaise)} each</p>}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <dl className="mx-4 mt-4 rounded-xl border border-line px-4 py-3 text-[14px]">
        <div className="flex justify-between py-1"><dt className="text-ink-2">Subtotal, before GST</dt><dd className="num text-ink">{formatINR(s.subtotalPaise)}</dd></div>
        <div className="flex justify-between py-1"><dt className="text-ink-2">GST 3%</dt><dd className="num text-ink">{formatINR(s.gstPaise)}</dd></div>
        <div className="mt-1.5 flex items-baseline justify-between border-t border-line pt-2.5">
          <dt className="font-medium text-ink">Total</dt>
          <dd className="num text-[22px] font-semibold tracking-[-0.01em] text-gold-ink">{formatINR(s.totalPaise)}</dd>
        </div>
        {/* One clause per purity actually priced, each with ITS rate row's time — never another purity's. */}
        <p className="mt-2 text-[12px] leading-snug text-ink-3">At {rateNote}. The price freezes when you place the order; the office sees the frozen price.</p>
      </dl>

      {!blockReason && <CreditCheck q={credit} shopName={shopName} />}

      <div className="px-4 pt-5">
        <label htmlFor="order-notes" className="text-[14px] font-medium text-ink">Notes for the office <span className="font-normal text-ink-3">(optional)</span></label>
        <Textarea id="order-notes" value={notes} onChange={(e) => onNotes(e.target.value)} rows={2} maxLength={1000} placeholder="Anything the office should know" className="mt-2 text-[15px]" />
      </div>

      {blockReason && <p className="mx-4 mt-3 rounded-lg bg-warn-soft px-3 py-2.5 text-[13px] text-warn">{blockReason}</p>}

      <BottomSpacer h={error || checking ? 156 : 96} />
      <BottomBar>
        {checking && <div role="status" className="mb-2.5 flex gap-2 rounded-lg bg-sunken px-3 py-2 text-[13px] text-ink-2"><Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" /><p>We couldn&apos;t confirm the order. Checking…</p></div>}
        {!checking && error && <div role="alert" className={cn("mb-2.5 flex gap-2 rounded-lg px-3 py-2 text-[13px]", unconfirmed ? "bg-warn-soft text-warn" : "bg-danger-soft text-danger")}><AlertCircle className="mt-0.5 size-4 shrink-0" /><p>{error}</p></div>}
        {!checking && !error && needsApproval && <p className="mb-2 flex items-center justify-center gap-1.5 text-[13px] text-warn"><ShieldAlert className="size-3.5" />Your manager approves this one before it&apos;s confirmed</p>}
        <Button className={cn("h-12 w-full justify-between px-4 text-[15px]", PRESS_BTN)} disabled={busy || s.items === 0 || (!!blockReason && !unconfirmed)} onClick={submit}>
          <span className="flex items-center gap-2">{busy && <Loader2 className="animate-spin" />}{busy ? (checking ? "Checking" : needsApproval ? "Sending" : "Placing order") : unconfirmed ? "Retry" : error ? "Place order again" : needsApproval ? "Send for approval" : "Place order"}</span>
          <span className="num">{formatINR(s.totalPaise)}</span>
        </Button>
      </BottomBar>
    </main>
  );
}

/** Credit before placing: the server's CreditPosition for this total. Approval is the server's call on
 *  submit; this only tells the agent what to expect at the counter. */
export function CreditCheck({ q, shopName, position, amountLabel = "This order", afterLabel = "Exposure after order", memoNote, className = "mx-4 mt-3" }: {
  q?: UseQueryResult<CreditPosition>; shopName: string; position?: CreditPosition; amountLabel?: string; afterLabel?: string; memoNote?: string; className?: string;
}) {
  const p = position ?? q?.data;
  if (!position && q?.isLoading) return <div className={cn(className, "h-[92px] animate-pulse rounded-xl bg-sunken")} aria-busy />;
  if (!p || (!position && q?.error)) return <p className={cn(className, "text-[13px] text-ink-3")}>Couldn&apos;t check {shopName}&apos;s credit. The office checks it when you place the order.</p>;
  const unlimited = !p.creditLimitPaise;
  const row = (k: string, v: React.ReactNode, strong?: boolean) => (
    <div className="flex items-baseline justify-between gap-3 py-[3px]"><dt className="text-ink-2">{k}</dt><dd className={cn("num", strong ? "font-semibold" : "text-ink")}>{v}</dd></div>
  );
  return (
    <section aria-label="Credit check" className={cn(className, "overflow-hidden rounded-xl border text-[14px]", p.requiresApproval ? "border-warn/35" : "border-line")}>
      <div className={cn("flex items-start gap-2.5 px-4 py-3", p.requiresApproval ? "bg-warn-soft" : "bg-paper")}>
        {p.requiresApproval ? <ShieldAlert className="mt-px size-[18px] shrink-0 text-warn" /> : <ShieldCheck className="mt-px size-[18px] shrink-0 text-verified" />}
        <div className="min-w-0">
          <p className={cn("font-semibold", p.requiresApproval ? "text-warn" : "text-ink")}>{p.requiresApproval ? "Needs manager approval" : "Within credit, confirms right away"}</p>
          {p.requiresApproval && <ul className="mt-0.5 text-[13px] text-ink">{p.reasons.map((r) => <li key={r}>{reasonText(r, p)}</li>)}</ul>}
          {!p.requiresApproval && <p className="text-[13px] text-ink-2">Checked against this shop&apos;s live credit.</p>}
        </div>
      </div>
      <dl className="border-t border-line px-4 py-2.5 text-[13px]">
        {row("Outstanding", formatINR(p.outstandingPaise))}
        {p.memoExposurePaise > 0 && row("Samples on memo", <span className="text-gold-ink">{formatINR(p.memoExposurePaise)}</span>)}
        {row("Credit limit", unlimited ? <span className="text-ink-3">No limit</span> : formatINR(p.creditLimitPaise))}
        {row("Available credit", p.availableCreditPaise == null ? <span className="text-ink-3">No limit</span> : formatINR(p.availableCreditPaise))}
        {row(amountLabel, <span className="text-gold-ink">{formatINR(p.orderAmountPaise)}</span>)}
        <div className="mt-1 border-t border-line pt-1.5">{row(afterLabel, <span className={cn(!unlimited && p.projectedExposurePaise > p.creditLimitPaise ? "text-danger" : "text-ink")}>{formatINR(p.projectedExposurePaise)}</span>, true)}</div>
      </dl>
      {memoNote && <p className="border-t border-line px-4 py-2 text-[12px] text-ink-3">{memoNote}</p>}
    </section>
  );
}

/** The honest outcome: the status the SERVER wrote. Confirmed → done; pending → who decides and why. */
export function OrderDone({ order, visitId, onAnother, onLeave }: { order: Order; visitId: string; onAnother: () => void; onLeave?: () => void }) {
  const pending = order.status === "PENDING_APPROVAL" || order.status === "SUBMITTED";
  const reasons = order.approval?.reasons ?? [];
  const why = reasons.map((r) => reasonText(r, order.approval?.position)).join(" · ");
  const items = order.items.reduce((s, i) => s + i.quantity, 0);
  return (
    <main className="px-4 pb-10 pt-8">
      <div className="flex flex-col items-center text-center">
        <motion.span initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", duration: 0.4, bounce: 0.25 }}
          className={cn("grid size-14 place-items-center rounded-full", pending ? "bg-warn-soft text-warn" : "bg-verified-soft text-verified")}>
          {pending ? <Hourglass className="size-6" strokeWidth={2} /> : <Check className="size-7" strokeWidth={2.5} />}
        </motion.span>
        <h2 className="mt-4 text-[20px] font-semibold tracking-[-0.01em] text-ink">{pending ? "Sent to your manager for approval" : "Order confirmed"}</h2>
        {pending && why && <p className="mt-1 max-w-xs text-[14px] font-medium text-warn">{why}</p>}
        <p className="num mt-4 text-[34px] font-semibold leading-none tracking-[-0.02em] text-gold-ink">{formatINR(order.totalPaise)}</p>
        <p className="mt-1.5 text-[13px] text-ink-3"><span className="num">{plural(items, "item")}</span>, incl. GST <span className="num">{formatINR(order.gstPaise)}</span></p>
      </div>

      <section aria-label="Receipt" className="mt-6 overflow-hidden rounded-xl border border-line">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-ink">{order.shop.name}</p>
            <p className="num text-[13px] text-ink-2">{order.number}, {fmtTime(order.createdAt)}</p>
          </div>
          <OrderStatusPill status={order.status} />
        </div>
        <ul>
          {order.items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-[13px]">
              <Thumb src={i.imageUrl} size={36} className="rounded-md" />
              <span className="min-w-0 flex-1"><span className="block truncate text-[14px] text-ink">{i.name}</span><span className="num text-ink-3">{PURITY_LABEL[i.purity]}, ×{i.quantity}</span></span>
              <span className="num shrink-0 text-ink">{formatINR(i.lineTotalPaise)}</span>
            </li>
          ))}
        </ul>
        <dl className="px-4 py-2.5 text-[13px]">
          <div className="flex justify-between py-0.5"><dt className="text-ink-2">Subtotal</dt><dd className="num text-ink">{formatINR(order.subtotalPaise)}</dd></div>
          <div className="flex justify-between py-0.5"><dt className="text-ink-2">GST 3%</dt><dd className="num text-ink">{formatINR(order.gstPaise)}</dd></div>
          <div className="mt-1 flex justify-between border-t border-line pt-1.5 text-[14px]"><dt className="font-medium text-ink">Total</dt><dd className="num font-semibold text-gold-ink">{formatINR(order.totalPaise)}</dd></div>
        </dl>
      </section>
      <p className="mt-3 text-center text-[13px] leading-snug text-ink-2">
        {pending ? "Prices are frozen. Your manager approves or rejects it in JewelRoute; the decision shows on this visit." : "Prices are frozen at today’s rate. Nothing else to do; the office has it."}
      </p>
      <div className="mt-6 grid gap-2">
        <Button asChild className={cn("h-12 text-[15px]", PRESS_BTN)}><Link href={`/field/visits/${visitId}`} onClick={onLeave}>Back to visit</Link></Button>
        <Button variant="outline" className={cn("h-12 text-[15px]", PRESS_BTN)} onClick={onAnother}>Book another order</Button>
      </div>
    </main>
  );
}
