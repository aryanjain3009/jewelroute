"use client";
import Link from "next/link";
import { useState } from "react";
import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Design } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PRESS_BTN } from "../bits";
import { fmtTime } from "../format";
import { useToday } from "../queries";
import { BottomBar, BottomSpacer, PageBar } from "../top-bar";
import { CatalogGrid } from "./catalog-grid";
import { DesignCard } from "./design-card";
import { DesignDetail } from "./design-detail";

/** Catalog tab: browse designs and today's prices anywhere. Selling (an order or a memo for one retailer)
 *  happens inside an open visit; when one is open, a bar in the thumb zone takes Rahul straight there. */
export function CatalogBrowse() {
  const [open, setOpen] = useState<Design | null>(null);
  const today = useToday();
  const live = today.data?.openVisit ?? today.data?.visits.find((v) => v.status === "CHECKED_IN" || v.status === "ACTIVE");
  return (
    <>
      <PageBar title="Catalog" />
      <main className="pb-6">
        <CatalogGrid visitId={null} renderCard={(d, i) => <DesignCard design={d} onOpen={() => setOpen(d)} priority={i < 4} />} />
        {!live && today.isSuccess && <p className="px-6 pt-8 text-center text-[13px] leading-snug text-ink-3">To book an order or leave pieces on memo, check in at a shop. Selling happens inside the visit.</p>}
        {live && <BottomSpacer h={84} />}
      </main>
      <DesignDetail design={open} onClose={() => setOpen(null)} />
      {live && (
        <BottomBar aboveTabs enter>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-info">In visit{live.checkInAt ? <> since <span className="num">{fmtTime(live.checkInAt)}</span></> : null}</p>
              <p className="truncate text-[15px] font-medium text-ink">{live.shop.name}</p>
            </div>
            <Button asChild className={cn("h-11 px-4 text-[15px]", PRESS_BTN)}>
              <Link href={`/field/visits/${live.id}/sale?mode=order`}><ShoppingBag />Sell here</Link>
            </Button>
          </div>
        </BottomBar>
      )}
    </>
  );
}
