"use client";
import { Plus } from "lucide-react";
import { formatGrams, formatINR } from "@jewelroute/shared";
import { PurityTag } from "@/components/jr/money";
import type { Design } from "@/lib/types";
import { cn } from "@/lib/utils";
import { sizedMedia } from "../format";

/** Photo first, then name, SKU, purity, net weight and today's final price. No arithmetic on the card. */
export function DesignCard({ design, qty, onOpen, onQuickAdd, priority, inBag }: {
  design: Design; qty?: number; onOpen: () => void; onQuickAdd?: () => void; priority?: boolean; inBag?: number;
}) {
  const img = design.imageUrls[0];
  return (
    <div className="group relative">
      <button type="button" onClick={onOpen} className="block w-full text-left focus-visible:outline-offset-4" aria-label={`${design.name}, ${design.sku}`}>
        <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-sunken">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sizedMedia(img, 640)} alt="" loading={priority ? "eager" : "lazy"} decoding="async"
              className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]" />
          ) : <div className="grid size-full place-items-center text-[12px] text-ink-3">No photo</div>}
          {inBag ? <span className="absolute left-2 top-2 rounded-md bg-paper/95 px-1.5 py-0.5 text-[11px] font-medium text-gold-ink">{inBag} in your bag</span> : null}
        </div>
        <div className="mt-2 px-0.5">
          <p className="line-clamp-1 font-display text-[17px] leading-snug tracking-[-0.01em] text-ink">{design.name}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-3">
            <span className="num">{design.sku}</span>
            <PurityTag purity={design.purity} className="h-[18px] px-1 text-[10.5px]" />
            <span className="num">{formatGrams(design.netWeightMg)}</span>
          </p>
          {design.price
            ? <p className="num mt-1 text-[15px] font-semibold text-ink">{formatINR(design.price.totalWithGstPaise)}</p>
            : <p className="mt-1 text-[13px] text-warn">No {design.purity.slice(1)}K rate today</p>}
        </div>
      </button>
      {onQuickAdd && design.price && (
        <span className="pointer-events-none absolute inset-x-0 top-0 aspect-[4/5]">
          <button type="button" onClick={onQuickAdd} aria-label={qty ? `Add another ${design.name}` : `Add ${design.name} to order`}
            className="pointer-events-auto absolute bottom-1 right-1 grid size-11 place-items-center">
            <span className={cn("grid h-8 min-w-8 place-items-center rounded-full border px-2 text-[13px] font-semibold shadow-float transition-colors",
              qty ? "border-ink bg-ink text-white" : "border-line bg-paper text-ink hover:bg-hover")}>
              {qty ? <span className="num">{qty}</span> : <Plus className="size-4" strokeWidth={2.25} />}
            </span>
          </button>
        </span>
      )}
    </div>
  );
}
