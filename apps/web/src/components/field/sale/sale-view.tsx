"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatGrams, formatINR } from "@jewelroute/shared";
import { Button } from "@/components/ui/button";
import type { Design } from "@/lib/types";
import { cn } from "@/lib/utils";
import { plural } from "../format";
import { useSessionState } from "../guard";
import { useCatalog, useVisit } from "../queries";
import { BottomBar, BottomSpacer, PageBar } from "../top-bar";
import { CatalogGrid } from "./catalog-grid";
import { DesignCard } from "./design-card";
import { DesignDetail } from "./design-detail";
import { OrderDone, OrderReview } from "./order-review";
import { MemoPicker } from "./memo-picker";
import { MemoReview } from "./memo-review";
import { MemoAck } from "./memo-ack";
import { emptyDraft, memoPreview, orderPreview, type SaleDraft, type SaleMode } from "./cart";

/** Catalog → order, and bag → memo, inside one visit. The draft (cart, memo selection, notes, step)
 *  lives in sessionStorage per visit and is cleared when the server confirms. */
export function SaleView({ visitId }: { visitId: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const mode: SaleMode = params.get("mode") === "memo" ? "memo" : "order";
  const browsing = params.get("browse") === "1";
  const [draft, setDraft, ready] = useSessionState<SaleDraft>(`jr:sale:${visitId}`, emptyDraft());
  const patch = (p: Partial<SaleDraft> | ((d: SaleDraft) => Partial<SaleDraft>)) => setDraft((d) => ({ ...d, ...(typeof p === "function" ? p(d) : p) }));
  const [open, setOpen] = useState<Design | null>(null);

  const visit = useVisit(visitId);
  const all = useCatalog(visitId);
  const designs = useMemo(() => new Map((all.data?.designs ?? []).map((d) => [d.id, d])), [all.data]);
  const v = visit.data?.visit;
  const shopName = visit.data?.shop.name ?? "";
  // Only the server's resume.canSell (open visit + arrival photo) unlocks selling; its nextStep says why not.
  const resume = visit.data?.resume;
  const canTransact = resume?.canSell === true;
  const blockReason = !v || canTransact ? undefined
    : resume?.nextStep === "CHECK_IN" || v.status === "PLANNED" ? "Check in at the shop to book orders or leave pieces."
    : resume?.nextStep === "UPLOAD_PROOF" ? "Add the arrival photo on the visit first."
    : resume?.nextStep === "DONE" || resume?.nextStep === "CLOSED" ? "This visit is closed. Browsing only."
    : "Selling isn't available on this visit right now.";

  const bag = visit.data?.bag;
  // Pieces that left the bag (another tab, a refresh after a memo) are dropped, never submitted.
  useEffect(() => {
    if (!ready || !bag || draft.memoPending) return; // an unconfirmed submit freezes its pieces until it resolves
    const held = new Set(bag.map((p) => p.id));
    if (draft.memo.some((id) => !held.has(id))) patch((d) => ({ memo: d.memo.filter((id) => held.has(id)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, bag]);

  const op = orderPreview(draft.order, designs);
  // While a memo submit is unconfirmed, show exactly what was sent (the bag may already lack those pieces).
  const mp = memoPreview(draft.memo, draft.memoPending ?? bag ?? []);
  const setQty = (d: Design, qty: number) => patch((x) => { const order = { ...x.order }; if (qty <= 0) delete order[d.id]; else order[d.id] = Math.min(99, qty); return { order }; });
  const setMode = (m: SaleMode) => router.replace(`/field/visits/${visitId}/sale?mode=${m}`, { scroll: false });
  const backToVisit = `/field/visits/${visitId}`;

  // ---- terminal steps
  if (mode === "order" && draft.orderDone) {
    return (
      <>
        <PageBar back={backToVisit} backLabel="Visit" title="Order booked" />
        <OrderDone order={draft.orderDone} visitId={visitId} onAnother={() => patch({ orderDone: undefined })} onLeave={() => patch({ orderDone: undefined })} />
      </>
    );
  }
  if (mode === "memo" && draft.memoAck) {
    return (
      <>
        <PageBar back={() => { patch({ memoAck: undefined }); router.push(backToVisit); }} backLabel="Visit" title="Retailer acknowledgement" />
        <main className="px-4 pb-8 pt-2"><MemoAck visitId={visitId} memo={draft.memoAck.memo} ack={draft.memoAck.ack} onLeave={() => patch({ memoAck: undefined })} /></main>
      </>
    );
  }
  if (mode === "order" && draft.orderStep === "review" && op.items > 0) {
    return (
      <>
        <PageBar back={() => patch({ orderStep: "browse" })} backLabel="Catalog" title="Review order" />
        <OrderReview visitId={visitId} shopName={shopName} preview={op} rates={all.data?.rates ?? []} notes={draft.orderNotes} onNotes={(orderNotes) => patch({ orderNotes })}
          onSetQty={setQty} blockReason={blockReason}
          onDone={(order) => patch({ order: {}, orderNotes: "", orderStep: "browse", orderDone: order })} />
      </>
    );
  }
  if (mode === "memo" && draft.memoStep === "review" && (mp.items > 0 || draft.memoPending)) {
    return (
      <>
        <PageBar back={() => { if (!draft.memoPending) patch({ memoStep: "browse" }); }} backLabel="Bag" title="Review memo" />
        <MemoReview visitId={visitId} shopName={shopName} preview={mp} due={draft.due} notes={draft.memoNotes} blockReason={blockReason}
          pending={!!draft.memoPending} onPending={(picks) => patch({ memoPending: picks })}
          onDue={(due) => patch({ due })} onNotes={(memoNotes) => patch({ memoNotes })}
          onRemove={(ids) => patch((d) => ({ memo: d.memo.filter((x) => !ids.includes(x)) }))}
          onDone={(memo, ack) => patch({ memo: [], memoNotes: "", memoStep: "browse", memoPending: undefined, memoAck: { memo, ack } })} />
      </>
    );
  }

  // ---- browse
  const count = mode === "order" ? op.items : mp.items;
  return (
    <>
      <PageBar back={backToVisit} backLabel="Visit" title={mode === "memo" ? "Leave on memo" : browsing ? "Catalog" : "New order"}
        sub={
          <div className="px-4 pb-2.5">
            <div className="grid grid-cols-2 rounded-lg bg-sunken p-0.5" role="tablist" aria-label="Sale mode">
              {(["order", "memo"] as const).map((m) => (
                <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
                  className={cn("h-9 rounded-md text-[14px] font-medium", mode === m ? "border border-line-strong bg-paper text-ink shadow-[0_1px_2px_rgb(0_0_0/0.04)]" : "text-ink-2")}>
                  {m === "order" ? "Order" : "Memo"}
                  {m === "order" && op.items > 0 && <span className="num ml-1.5 text-ink-3">{op.items}</span>}
                  {m === "memo" && mp.items > 0 && <span className="num ml-1.5 text-gold-ink">{mp.items}</span>}
                </button>
              ))}
            </div>
          </div>
        } />
      {blockReason && <p className="mx-4 mt-3 rounded-lg bg-warn-soft px-3 py-2.5 text-[13px] text-warn">{blockReason} <Link href={backToVisit} className="font-medium underline underline-offset-2">Open visit</Link></p>}

      <main>
        {mode === "order" ? (
          <CatalogGrid visitId={visitId} renderCard={(d, i) => (
            <DesignCard design={d} priority={i < 4} qty={draft.order[d.id]} onOpen={() => setOpen(d)}
              onQuickAdd={canTransact ? () => setQty(d, (draft.order[d.id] ?? 0) + 1) : undefined} />
          )} />
        ) : (
          <MemoPicker bag={bag} loading={visit.isPending} selected={draft.memo} disabled={!canTransact}
            onToggle={(id) => patch((d) => ({ memo: d.memo.includes(id) ? d.memo.filter((x) => x !== id) : [...d.memo, id] }))} />
        )}
        <BottomSpacer h={count > 0 ? 104 : 24} />
      </main>

      <DesignDetail design={open} onClose={() => setOpen(null)}
        order={{ qty: open ? draft.order[open.id] ?? 0 : 0, onSetQty: setQty, disabledReason: canTransact ? undefined : blockReason }} />

      {count > 0 && (
        <BottomBar>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-ink-2">
                <span className="num font-medium text-ink">{mode === "order" ? plural(op.items, "item") : plural(mp.items, "piece")}</span>
                <span className="num"> · {formatGrams(mode === "order" ? op.weightMg : mp.weightMg)}</span>
              </p>
              <p className="num text-[18px] font-semibold leading-tight text-gold-ink">{formatINR(mode === "order" ? op.totalPaise : mp.valuePaise)}</p>
            </div>
            <Button className="h-12 px-5 text-[15px]" disabled={!canTransact}
              onClick={() => patch(mode === "order" ? { orderStep: "review" } : { memoStep: "review" })}>
              {mode === "order" ? "Review order" : "Review memo"}
            </Button>
          </div>
        </BottomBar>
      )}
    </>
  );
}
