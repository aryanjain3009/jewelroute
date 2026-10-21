"use client";
import Link from "next/link";
import { useState } from "react";
import type { Design } from "@/lib/types";
import { useToday } from "../queries";
import { PageBar } from "../top-bar";
import { CatalogGrid } from "./catalog-grid";
import { DesignCard } from "./design-card";
import { DesignDetail } from "./design-detail";

/** Catalog tab: browse prices anywhere. Ordering and memos happen inside an open visit. */
export function CatalogBrowse() {
  const [open, setOpen] = useState<Design | null>(null);
  const today = useToday();
  const live = today.data?.visits.find((v) => v.status === "CHECKED_IN" || v.status === "ACTIVE");
  return (
    <>
      <PageBar title="Catalog" right={live ? <Link href={`/field/visits/${live.id}/sale?mode=order`} className="inline-flex h-9 items-center rounded-lg bg-ink px-3 text-[13px] font-medium text-white">Order for {live.shop.name.split(" ")[0]}</Link> : null} />
      <main className="pb-6">
        <CatalogGrid visitId={null} renderCard={(d, i) => <DesignCard design={d} onOpen={() => setOpen(d)} priority={i < 4} />} />
        {!live && <p className="px-4 pt-6 text-center text-[13px] text-ink-3">To book an order or leave pieces on memo, check in at a shop first.</p>}
      </main>
      <DesignDetail design={open} onClose={() => setOpen(null)} />
    </>
  );
}
