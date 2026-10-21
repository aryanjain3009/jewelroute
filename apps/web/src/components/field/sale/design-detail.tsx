"use client";
import { useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { formatGrams, formatINR, formatRate, PURITY_LABEL } from "@jewelroute/shared";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { PurityTag } from "@/components/jr/money";
import type { Design } from "@/lib/types";
import { cn } from "@/lib/utils";
import { fmtDay, fmtTime, mediaUrl } from "../format";
import { PRESS_BTN } from "../bits";

type Props = {
  design: Design | null; onClose: () => void; shopName?: string;
  /** Present when the design can be ordered (inside an open visit). */
  order?: { qty: number; onSetQty: (d: Design, qty: number) => void; disabledReason?: string };
};

/** Product detail: photography, then the complete price breakdown the card leaves out. */
export function DesignDetail({ design, onClose, order, shopName }: Props) {
  const last = useRef<Design | null>(null);
  if (design) last.current = design;
  const shown = design ?? last.current; // keep content during the close animation
  return (
    <Drawer open={!!design} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="mx-auto max-w-[520px] data-[vaul-drawer-direction=bottom]:max-h-[94dvh]">
        {shown && <Body key={`${shown.id}:${order?.qty ?? 0}`} d={shown} onClose={onClose} order={order} shopName={shopName} />}
      </DrawerContent>
    </Drawer>
  );
}

function Body({ d, onClose, order, shopName }: { d: Design; onClose: () => void; order?: Props["order"]; shopName?: string }) {
  const [qty, setQty] = useState(Math.max(1, order?.qty ?? 0));
  const [img, setImg] = useState(0);
  const p = d.price;
  const making = d.makingChargeType === "PER_GRAM" ? `${formatRate(d.makingChargeValue)} on net weight` : `${(d.makingChargeValue / 100).toFixed(d.makingChargeValue % 100 ? 1 : 0)}% of gold value`;
  const pieces = d.availablePieces ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 pt-3">
          <div className="relative">
            <div className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto rounded-xl bg-sunken"
              onScroll={(e) => { const el = e.currentTarget; setImg(Math.round(el.scrollLeft / el.clientWidth)); }}>
              {(d.imageUrls.length ? d.imageUrls : [""]).map((u, i) => (
                <div key={i} className="aspect-[5/4] w-full shrink-0 snap-center">
                  {u ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaUrl(u)} alt={i === 0 ? d.name : ""} className="size-full object-cover" />
                  ) : <div className="grid size-full place-items-center text-[13px] text-ink-3">No photo</div>}
                </div>
              ))}
            </div>
            {d.imageUrls.length > 1 && (
              <div className="absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5" aria-hidden>
                {d.imageUrls.map((_, i) => <span key={i} className={cn("h-1.5 rounded-full transition-colors duration-200", i === img ? "w-4 bg-paper" : "w-1.5 bg-paper/60")} />)}
              </div>
            )}
          </div>
        </div>

        <div className="px-4 pb-5 pt-4">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-ink-3">
            <PurityTag purity={d.purity} /><span className="num">{d.sku}</span><span>{d.collection}</span>
          </div>
          <DrawerTitle className="mt-1.5 font-display text-[26px] font-normal leading-[1.15] tracking-[-0.02em] text-ink">{d.name}</DrawerTitle>
          <DrawerDescription className={cn("mt-1 text-[14px] leading-relaxed text-ink-2", !d.description && "sr-only")}>{d.description || `${d.category} in ${PURITY_LABEL[d.purity]} gold`}</DrawerDescription>

          <dl className="mt-4 grid grid-cols-3 divide-x divide-line rounded-xl border border-line text-[13px]">
            <div className="px-3 py-2.5"><dt className="text-ink-3">Gross</dt><dd className="num mt-0.5 text-[15px] font-medium text-ink">{formatGrams(d.grossWeightMg)}</dd></div>
            <div className="px-3 py-2.5"><dt className="text-ink-3">Net gold</dt><dd className="num mt-0.5 text-[15px] font-medium text-ink">{formatGrams(d.netWeightMg)}</dd></div>
            <div className="px-3 py-2.5"><dt className="text-ink-3">Category</dt><dd className="mt-0.5 truncate text-[15px] font-medium text-ink">{d.category}</dd></div>
          </dl>

          {p ? (
            <section className="mt-5" aria-label="Price breakdown">
              <div className="flex items-baseline justify-between">
                <h3 className="text-[13px] font-semibold text-ink">Price breakdown</h3>
                <span className="num text-[12px] text-ink-3">Rate as of {fmtTime(p.rateEffectiveFrom)}, {fmtDay(p.rateEffectiveFrom)}</span>
              </div>
              <dl className="mt-1.5 text-[14px]">
                <Line label="Gold value" hint={<><span className="num">{formatGrams(p.netWeightMg)}</span> × <span className="num text-gold-ink">{formatRate(p.ratePaisePerGram)}</span></>} paise={p.goldValuePaise} />
                <Line label="Making" hint={making} paise={p.makingPaise} />
                <Line label="Stones" paise={p.stonePaise} />
                {d.otherComponents.map((c) => <Line key={c.label} label={c.label} paise={c.valuePaise} />)}
                {d.otherComponents.length === 0 && <Line label="Other" paise={p.otherPaise} />}
                <div className="my-1.5 border-t border-line" />
                <Line label="Unit price" hint="before GST" paise={p.unitPricePaise} strong />
                <Line label="GST" hint="3%" paise={p.gstPaise} />
                <div className="mt-2 flex items-baseline justify-between border-t border-ink pt-2.5">
                  <dt className="text-[15px] font-medium text-ink">Total</dt>
                  <dd className="num text-[22px] font-semibold tracking-[-0.01em] text-gold-ink">{formatINR(p.totalWithGstPaise)}</dd>
                </div>
              </dl>
            </section>
          ) : (
            <p className="mt-5 rounded-xl bg-warn-soft px-4 py-3 text-[14px] text-warn">No {PURITY_LABEL[d.purity]} gold rate is set today, so this design can’t be priced or ordered. Ask the office to publish today’s rate.</p>
          )}

          {pieces.length > 0 && (
            <section className="mt-5">
              <h3 className="text-[13px] font-semibold text-ink">In your bag</h3>
              <ul className="mt-1.5 divide-y divide-line rounded-xl border border-line">
                {pieces.map((pc) => (
                  <li key={pc.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                    <span className="num font-medium text-ink">{pc.tagCode}</span>
                    <span className="num text-ink-3">{formatGrams(pc.netWeightMg)} net</span>
                    <span className="num ml-auto font-medium text-gold-ink">{formatINR(pc.valuePaise)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {order && (
        <div className="border-t border-line bg-paper px-4 pt-3 safe-bottom">
          {order.disabledReason ? <p className="pb-1 text-center text-[13px] text-ink-2">{order.disabledReason}</p> : (
            <>
              {p && (
                <div className="mb-2.5 flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate text-ink-2">{shopName ? <>For <span className="font-medium text-ink">{shopName}</span></> : "Total"}</span>
                  <span className="shrink-0 text-ink-2"><span className="num font-semibold text-ink">{formatINR(p.totalWithGstPaise * qty)}</span> incl. GST</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="flex h-12 items-center rounded-lg border border-line-strong" role="group" aria-label="Quantity">
                  <button type="button" className="grid size-12 place-items-center text-ink-2 transition-colors duration-150 active:bg-sunken disabled:opacity-40" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Decrease quantity"><Minus className="size-4" /></button>
                  <span className="num w-7 text-center text-[16px] font-semibold" aria-live="polite">{qty}</span>
                  <button type="button" className="grid size-12 place-items-center text-ink-2 transition-colors duration-150 active:bg-sunken" onClick={() => setQty((q) => Math.min(99, q + 1))} aria-label="Increase quantity"><Plus className="size-4" /></button>
                </div>
                <Button className={cn("h-12 flex-1 justify-between px-4 text-[15px]", PRESS_BTN)} disabled={!p} onClick={() => { order.onSetQty(d, qty); onClose(); }}>
                  <span>{order.qty ? (qty === order.qty ? "In order" : "Update order") : "Add to order"}</span>
                  {p && <span className="num text-[13px] opacity-75">×{qty}</span>}
                </Button>
              </div>
              {order.qty > 0 && <button type="button" className="mt-1 h-11 w-full text-[14px] text-ink-2 transition-colors hover:text-danger active:opacity-60" onClick={() => { order.onSetQty(d, 0); onClose(); }}>Remove from order</button>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Line({ label, hint, paise, strong }: { label: string; hint?: React.ReactNode; paise: number; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="min-w-0"><span className={cn("text-ink", strong && "font-medium")}>{label}</span>{hint && <span className="ml-2 text-[12px] text-ink-3">{hint}</span>}</dt>
      <dd className={cn("num shrink-0", strong ? "font-semibold text-ink" : paise ? "text-ink" : "text-ink-3")}>{paise ? formatINR(paise) : "None"}</dd>
    </div>
  );
}
