"use client";
import { Plus } from "lucide-react";
import { formatGrams, formatINR, PURITY_LABEL } from "@jewelroute/shared";
import { PurityTag } from "@/components/jr/money";
import type { Design } from "@/lib/types";
import { cn } from "@/lib/utils";
import { sizedMedia } from "../format";

/** Photo first, then name, purity, net weight and today's final price. No arithmetic on the card.
 *  In a sale the card also carries quick add (with the quantity in the cart) and how many of this design
 *  are in the agent's bag right now. */
export function DesignCard({ design, qty, onOpen, onQuickAdd, priority, inBag }: {
  design: Design; qty?: number; onOpen: () => void; onQuickAdd?: () => void; priority?: boolean; inBag?: number;
}) {
  const img = design.imageUrls[0];
  return (
    <div className="group relative">
      <button type="button" onClick={onOpen} aria-label={`${design.name}, ${design.sku}`}
        className="block w-full text-left transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:outline-offset-4 motion-safe:active:scale-[0.98]">
        <div className={cn("relative aspect-[4/5] overflow-hidden rounded-xl bg-sunken", qty ? "ring-[1.5px] ring-ink" : "")}>
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sizedMedia(img, 640)} alt="" loading={priority ? "eager" : "lazy"} decoding="async"
              className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]" />
          ) : <div className="grid size-full place-items-center text-[12px] text-ink-3">No photo</div>}
          {inBag ? <span className="absolute left-2 top-2 inline-flex h-[22px] items-center rounded-md bg-paper/95 px-1.5 text-[11.5px] font-medium text-gold-ink"><span className="num mr-1">{inBag}</span>in your bag</span> : null}
        </div>
        <div className="mt-2.5 px-0.5">
          <p className="line-clamp-1 font-display text-[17px] leading-snug tracking-[-0.01em] text-ink">{design.name}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-3">
            <PurityTag purity={design.purity} className="h-[18px] px-1 text-[10.5px]" />
            <span className="num whitespace-nowrap">{formatGrams(design.netWeightMg)}</span>
            <span className="num min-w-0 truncate min-[600px]:hidden">{design.sku}</span>
          </p>
          {design.price
            ? <p className="num mt-1.5 text-[15px] font-semibold text-ink">{formatINR(design.price.totalWithGstPaise)}</p>
            : <p className="mt-1.5 text-[13px] text-warn">No {PURITY_LABEL[design.purity]} rate today</p>}
        </div>
      </button>
      {onQuickAdd && design.price && (
        <span className="pointer-events-none absolute inset-x-0 top-0 aspect-[4/5]">
          <button type="button" onClick={onQuickAdd} aria-label={qty ? `Add another ${design.name}` : `Add ${design.name} to order`}
            className="group/add pointer-events-auto absolute bottom-0.5 right-0.5 grid size-12 place-items-center">
            <span className={cn("grid h-9 min-w-9 place-items-center rounded-full border px-2.5 text-[14px] font-semibold shadow-float transition-[transform,background-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-safe:group-active/add:scale-90",
              qty ? "border-ink bg-ink text-white" : "border-line bg-paper text-ink hover:bg-hover")}>
              {qty ? <span className="num">{qty}</span> : <Plus className="size-[18px]" strokeWidth={2.25} />}
            </span>
          </button>
        </span>
      )}
    </div>
  );
}
