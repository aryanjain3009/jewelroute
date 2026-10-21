"use client";
import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { AlertCircle, Check, Loader2, Minus, Plus } from "lucide-react";
import { formatGrams, formatINR, formatRate, istDate, PURITY_LABEL } from "@jewelroute/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PurityTag } from "@/components/jr/money";
import { OrderStatusPill } from "@/components/jr/status";
import { api, ApiError } from "@/lib/api";
import type { Design, Order } from "@/lib/types";
import { useSync } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { Thumb } from "../bits";
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

  return (
    <main className="pb-4">
      <p className="px-4 pt-3 text-[14px] text-ink-2">For <span className="font-medium text-ink">{shopName}</span>. Prices freeze at today’s rate when you place it.</p>
      <ul className="mt-3 border-y border-line">
        {s.lines.map(({ design: d, qty }) => (
          <li key={d.id} className="flex gap-3 border-b border-line px-4 py-3 last:border-b-0">
            <Thumb src={d.imageUrls[0]} size={56} />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 font-display text-[16px] text-ink">{d.name}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-3"><span className="num">{d.sku}</span><PurityTag purity={d.purity} className="h-[18px] px-1 text-[10.5px]" /><span className="num">{formatGrams(d.netWeightMg)}</span></p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex h-10 items-center rounded-lg border border-line-strong">
                  <button type="button" aria-label={`Fewer ${d.name}`} className="grid size-10 place-items-center text-ink-2" onClick={() => onSetQty(d, qty - 1)}><Minus className="size-3.5" /></button>
                  <span className="num w-6 text-center text-[14px] font-semibold">{qty}</span>
                  <button type="button" aria-label={`More ${d.name}`} className="grid size-10 place-items-center text-ink-2" onClick={() => onSetQty(d, qty + 1)}><Plus className="size-3.5" /></button>
                </div>
                <span className="num text-[15px] font-semibold text-ink">{formatINR(d.price!.unitPricePaise * qty)}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="px-4 pt-4">
        <label htmlFor="order-notes" className="text-[14px] font-medium text-ink">Notes for the office <span className="font-normal text-ink-3">(optional)</span></label>
        <Textarea id="order-notes" value={notes} onChange={(e) => onNotes(e.target.value)} rows={2} maxLength={1000} placeholder="Deliver before Dhanteras. Size 2.6 for the bangles." className="mt-2 text-[15px]" />
      </div>

      <dl className="mx-4 mt-4 rounded-xl border border-line px-4 py-3 text-[14px]">
        <div className="flex justify-between py-1"><dt className="text-ink-2">{plural(s.items, "item")}, gold</dt><dd className="num text-ink">{formatGrams(s.weightMg)}</dd></div>
        <div className="flex justify-between py-1"><dt className="text-ink-2">Subtotal</dt><dd className="num text-ink">{formatINR(s.subtotalPaise)}</dd></div>
        <div className="flex justify-between py-1"><dt className="text-ink-2">GST 3%</dt><dd className="num text-ink">{formatINR(s.gstPaise)}</dd></div>
        <div className="mt-1.5 flex items-baseline justify-between border-t border-line pt-2.5">
          <dt className="font-medium text-ink">Total</dt>
          <dd className="num text-[22px] font-semibold tracking-[-0.01em] text-gold-ink">{formatINR(s.totalPaise)}</dd>
        </div>
        <p className="mt-2 text-[12px] text-ink-3">
          {/* One clause per purity actually priced, each with ITS rate row's time — never another purity's. */}
          At {rates.filter((r) => purities.includes(r.purity)).map((r) => `${PURITY_LABEL[r.purity]} ${formatRate(r.ratePaisePerGram)} (rate as of ${rateWhen(r.effectiveFrom)})`).join(", ")}.
          {" "}The office sees the frozen price.
        </p>
      </dl>

      {blockReason && <p className="mx-4 mt-3 rounded-lg bg-warn-soft px-3 py-2.5 text-[13px] text-warn">{blockReason}</p>}

      <BottomSpacer h={error || checking ? 150 : 92} />
      <BottomBar>
        {checking && <div role="status" className="mb-2.5 flex gap-2 rounded-lg bg-sunken px-3 py-2 text-[13px] text-ink-2"><Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" /><p>We couldn&apos;t confirm the order. Checking…</p></div>}
        {!checking && error && <div role="alert" className={cn("mb-2.5 flex gap-2 rounded-lg px-3 py-2 text-[13px]", unconfirmed ? "bg-warn-soft text-warn" : "bg-danger-soft text-danger")}><AlertCircle className="mt-0.5 size-4 shrink-0" /><p>{error}</p></div>}
        <Button className="h-12 w-full justify-between px-4 text-[15px]" disabled={busy || s.items === 0 || (!!blockReason && !unconfirmed)} onClick={submit}>
          <span className="flex items-center gap-2">{busy && <Loader2 className="animate-spin" />}{busy ? (checking ? "Checking" : "Placing order") : unconfirmed ? "Retry" : error ? "Place order again" : "Place order"}</span>
          <span className="num">{formatINR(s.totalPaise)}</span>
        </Button>
      </BottomBar>
    </main>
  );
}

export function OrderDone({ order, visitId, onAnother, onLeave }: { order: Order; visitId: string; onAnother: () => void; onLeave: () => void }) {
  return (
    <main className="flex flex-col items-center px-6 pb-10 pt-12 text-center">
      <motion.span initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 380, damping: 20 }}
        className="grid size-14 place-items-center rounded-full bg-verified text-white"><Check className="size-7" strokeWidth={2.5} /></motion.span>
      <h2 className="mt-5 text-[20px] font-semibold tracking-[-0.01em] text-ink">Order booked for {order.shop.name}</h2>
      <p className="num mt-1 text-[14px] text-ink-2">{order.number}</p>
      <p className="num mt-5 text-[32px] font-semibold tracking-[-0.02em] text-gold-ink">{formatINR(order.totalPaise)}</p>
      <p className="mt-1 text-[13px] text-ink-3">{plural(order.items.reduce((s, i) => s + i.quantity, 0), "item")}, incl. GST {formatINR(order.gstPaise)}</p>
      <div className="mt-4"><OrderStatusPill status={order.status} /></div>
      <p className="mt-3 max-w-xs text-[14px] text-ink-2">Your manager has it now. Approval shows on this visit.</p>
      <div className="mt-8 grid w-full max-w-sm gap-2">
        <Button asChild className="h-12 text-[15px]"><Link href={`/field/visits/${visitId}`} onClick={onLeave}>Back to visit</Link></Button>
        <Button variant="outline" className="h-12 text-[15px]" onClick={onAnother}>Book another order</Button>
      </div>
    </main>
  );
}
