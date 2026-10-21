"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { formatGrams, formatINR, formatINRCompact } from "@jewelroute/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/app/chrome";
import type { Design } from "@/lib/types";
import { cn } from "@/lib/utils";
import { plural } from "../format";
import { Notice, PRESS_BTN, Segmented } from "../bits";
import type { VisitDetail } from "../types";
import { session, useSessionState } from "../guard";
import { useCatalog, useVisit, useVisitCredit } from "../queries";
import { BottomBar, BottomSpacer, PageBar } from "../top-bar";
import { CatalogGrid } from "./catalog-grid";
import { DesignCard } from "./design-card";
import { DesignDetail } from "./design-detail";
import { OrderDone, OrderReview } from "./order-review";
import { MemoPicker } from "./memo-picker";
import { MemoReview } from "./memo-review";
import { MemoAck } from "./memo-ack";
import { emptyDraft, memoPreview, orderPreview, type SaleDraft, type SaleMode } from "./cart";

type Step = "browse" | "review" | "done" | "ack";

/** Catalog → order, and bag → memo, inside one visit. The step lives in the URL (`?mode=order&step=review`)
 *  so refresh, Back and Forward land on the same screen; the draft (cart, memo selection, notes, the
 *  server's answer for done/ack) lives in sessionStorage per visit and is cleared when the server confirms. */
export function SaleView({ visitId }: { visitId: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const mode: SaleMode = params.get("mode") === "memo" ? "memo" : "order";
  const browsing = params.get("browse") === "1";
  const urlStep = (params.get("step") ?? "browse") as Step;
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
    const gone = draft.memo.filter((id) => !held.has(id));
    if (!gone.length) return;
    patch((d) => ({ memo: d.memo.filter((id) => held.has(id)) }));
    // Say so: a picked piece vanishing from the review without a word looks like a lost selection.
    toast.warning(`${plural(gone.length, "piece")} you picked ${gone.length === 1 ? "is" : "are"} no longer in your bag (left on memo or returned elsewhere) and ${gone.length === 1 ? "was" : "were"} removed.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, bag]);

  const op = orderPreview(draft.order, designs);
  // While a memo submit is unconfirmed, show exactly what was sent (the bag may already lack those pieces).
  const mp = memoPreview(draft.memo, draft.memoPending ?? bag ?? []);
  const setQty = (d: Design, qty: number) => patch((x) => { const order = { ...x.order }; if (qty <= 0) delete order[d.id]; else order[d.id] = Math.min(99, qty); return { order }; });
  const backToVisit = `/field/visits/${visitId}`;
  const urlFor = (m: SaleMode, step: Step = "browse") => {
    const q = new URLSearchParams({ mode: m });
    if (browsing && m === "order") q.set("browse", "1");
    if (step !== "browse") q.set("step", step);
    return `/field/visits/${visitId}/sale?${q}`;
  };
  const setMode = (m: SaleMode) => router.replace(urlFor(m), { scroll: false });
  // Review is pushed, so Back returns to the catalog/bag. The in-app back pops that entry when we pushed it.
  const pushedKey = `jr:sale:pushed:${visitId}`;
  const toReview = () => { session.set(pushedKey, true); router.push(urlFor(mode, "review"), { scroll: false }); };
  const leaveReview = () => {
    if (session.get<boolean>(pushedKey)) { session.del(pushedKey); router.back(); }
    else router.replace(urlFor(mode), { scroll: false });
  };

  // What the URL asks for, if the draft can show it. A terminal step without its server answer (a new tab,
  // a cleared draft) and a review with nothing in it fall back to browsing. An unconfirmed memo submit always
  // resumes on its review, so the agent sees the Retry.
  // A submit that just succeeded stores the server's answer and replaces the URL with done/ack; until the
  // URL catches up, the answer wins over the (now empty) review.
  const step: Step = !ready ? "browse"
    : mode === "memo" && draft.memoPending ? "review"
    : urlStep === "review" && mode === "order" && draft.orderDone && op.items === 0 ? "done"
    : urlStep === "review" && mode === "memo" && draft.memoAck && mp.items === 0 ? "ack"
    : urlStep === "done" ? (mode === "order" && draft.orderDone ? "done" : "browse")
    : urlStep === "ack" ? (mode === "memo" && draft.memoAck ? "ack" : "browse")
    : urlStep === "review" && (mode === "order" ? op.items > 0 : mp.items > 0) ? "review"
    : "browse";
  const settled = ready && (mode === "order" ? !!all.data || all.isError : !!bag || visit.isError);
  // Once the agent is back on the catalog/bag, a receipt left in the draft is history: drop it so it can
  // never be shown again in place of a new order or memo.
  useEffect(() => {
    if (settled && step === "browse" && urlStep === "browse" && (draft.orderDone || draft.memoAck)) patch({ orderDone: undefined, memoAck: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, step, urlStep]);
  useEffect(() => {
    if (!settled || step === urlStep) return;
    if (step === "browse") session.del(pushedKey);
    router.replace(urlFor(mode, step), { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, step, urlStep, mode]);

  // A receipt or the QR screen always opens at its top (the review it replaces may have been scrolled).
  useEffect(() => { if (step === "done" || step === "ack") window.scrollTo(0, 0); }, [step]);

  // A deep link / refresh on a later step: wait for the draft and the data instead of flashing the catalog.
  if (!settled && urlStep !== "browse") return <PageBar back={backToVisit} backLabel="Visit" title={mode === "memo" ? "Leave on memo" : "New order"} subtitle={shopName || undefined} />;

  // ---- terminal steps (the effect above scrolls them to the top on arrival)
  // Leaving a receipt never clears it here (that would re-render this page as the catalog and race the
  // navigation); the catalog drops a leftover receipt when it is next shown.
  if (step === "done" && draft.orderDone) {
    return (
      <>
        <PageBar back={backToVisit} backLabel="Visit" title={draft.orderDone.status === "PENDING_APPROVAL" ? "Sent for approval" : draft.orderDone.status === "CONFIRMED" ? "Order confirmed" : "Order placed"} subtitle={draft.orderDone.shop.name} />
        <OrderDone order={draft.orderDone} visitId={visitId} onAnother={() => router.replace(urlFor("order"), { scroll: false })} />
      </>
    );
  }
  if (step === "ack" && draft.memoAck) {
    return (
      <>
        <PageBar back={backToVisit} backLabel="Visit" title="Retailer acknowledgement" subtitle={draft.memoAck.memo.shop.name} />
        <main className="px-4 pb-8 pt-2"><MemoAck visitId={visitId} memo={draft.memoAck.memo} ack={draft.memoAck.ack} /></main>
      </>
    );
  }
  if (step === "review" && mode === "order") {
    return (
      <>
        <PageBar back={leaveReview} backLabel="Catalog" title="Review order" subtitle={shopName || undefined} />
        <OrderReview visitId={visitId} shopName={shopName} preview={op} rates={all.data?.rates ?? []} notes={draft.orderNotes} onNotes={(orderNotes) => patch({ orderNotes })}
          onSetQty={setQty} blockReason={blockReason}
          onDone={(order) => { patch({ order: {}, orderNotes: "", orderDone: order }); session.del(pushedKey); router.replace(urlFor("order", "done"), { scroll: false }); }} />
      </>
    );
  }
  if (step === "review" && mode === "memo") {
    return (
      <>
        <PageBar back={() => { if (!draft.memoPending) leaveReview(); }} backLabel="Bag" title="Review memo" subtitle={shopName || undefined} />
        <MemoReview visitId={visitId} shopName={shopName} preview={mp} due={draft.due} notes={draft.memoNotes} blockReason={blockReason}
          pending={!!draft.memoPending} onPending={(picks) => patch({ memoPending: picks })}
          onDue={(due) => patch({ due })} onNotes={(memoNotes) => patch({ memoNotes })}
          onRemove={(ids) => patch((d) => ({ memo: d.memo.filter((x) => !ids.includes(x)) }))}
          onDone={(memo, ack) => { patch({ memo: [], memoNotes: "", memoPending: undefined, memoAck: { memo, ack } }); session.del(pushedKey); router.replace(urlFor("memo", "ack"), { scroll: false }); }} />
      </>
    );
  }

  // ---- browse
  const count = mode === "order" ? op.items : mp.items;
  return (
    <Segmented label="Sale mode" value={mode} onChange={setMode} className="pt-0.5"
      items={[
        { value: "order", label: <>Order{op.items > 0 && <span className="num ml-1.5 text-ink-3">{op.items}</span>}</> },
        { value: "memo", label: <>Memo{mp.items > 0 && <span className="num ml-1.5 text-gold-ink">{mp.items}</span>}</> },
      ]}
      wrap={(tabs) => <PageBar back={backToVisit} backLabel="Visit" title={mode === "memo" ? "Leave on memo" : browsing ? "Catalog" : "New order"} subtitle={shopName || undefined} sub={tabs} />}>
      <main>
        <RetailerStrip d={visit.data} loading={visit.isPending} mode={mode} />
        {blockReason && (
          <Notice tone="warn" icon={Lock} className="mx-4 mt-3" title={blockReason}
            action={<Button asChild variant="outline" className={cn("h-10 bg-paper px-3.5 text-[14px]", PRESS_BTN)}><Link href={backToVisit}>Open visit</Link></Button>} />
        )}
        {mode === "order" ? (
          <CatalogGrid visitId={visitId} renderCard={(d, i) => (
            <DesignCard design={d} priority={i < 4} qty={draft.order[d.id]} onOpen={() => setOpen(d)}
              onQuickAdd={canTransact ? () => setQty(d, (draft.order[d.id] ?? 0) + 1) : undefined} />
          )} />
        ) : (
          <MemoPicker bag={bag} loading={visit.isPending} selected={draft.memo} disabled={!canTransact}
            onToggle={(id) => patch((d) => ({ memo: d.memo.includes(id) ? d.memo.filter((x) => x !== id) : [...d.memo, id] }))} />
        )}
        <BottomSpacer h={count > 0 ? 108 : 24} />
      </main>

      <DesignDetail design={open} onClose={() => setOpen(null)} shopName={shopName}
        order={{ qty: open ? draft.order[open.id] ?? 0 : 0, onSetQty: setQty, disabledReason: canTransact ? undefined : blockReason }} />

      {count > 0 && (
        <BottomBar enter>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex gap-x-2 truncate text-[13px] text-ink-2">
                <span className="num font-medium text-ink">{mode === "order" ? plural(op.items, "item") : plural(mp.items, "piece")}</span>
                <span className="num">{formatGrams(mode === "order" ? op.weightMg : mp.weightMg)}</span>
              </p>
              <p className="num truncate text-[19px] font-semibold leading-tight tracking-[-0.01em] text-gold-ink">{formatINR(mode === "order" ? op.totalPaise : mp.valuePaise)}</p>
              <p className="truncate text-[11.5px] text-ink-3">{mode === "order" ? "Incl. GST, estimate at today’s rate" : "Value at today’s rate"}</p>
            </div>
            <Button className={cn("h-12 px-5 text-[15px]", PRESS_BTN)} disabled={!canTransact} onClick={toReview}>
              {mode === "order" ? "Review order" : "Review memo"}
            </Button>
          </div>
        </BottomBar>
      )}
    </Segmented>
  );
}

/** Who Rahul is selling to, and the one number that matters for this mode: available credit for an order
 *  (the server's live position), what is already on memo at this shop for a memo. */
function RetailerStrip({ d, loading, mode }: { d?: VisitDetail; loading: boolean; mode: SaleMode }) {
  const open = d?.visit.status === "CHECKED_IN" || d?.visit.status === "ACTIVE";
  const credit = useVisitCredit(d?.visit.id ?? "", !!d && open && mode === "order");
  if (!d) return loading ? <div className="mx-4 mt-3"><Skeleton className="h-[60px] w-full rounded-xl" /></div> : null;
  const { shop, visit } = d;
  const c = credit.data;
  let label: string; let value: React.ReactNode;
  if (mode === "memo") {
    label = "On memo here";
    value = visit.activeMemoCount ? <span className="text-gold-ink">{formatINRCompact(visit.activeMemoValuePaise)}</span> : <span className="font-normal text-ink-3">None</span>;
  } else if (c) {
    label = "Available credit";
    value = c.availableCreditPaise == null ? <span className="font-normal text-ink-2">No limit</span>
      : <span className={c.overLimit || c.availableCreditPaise <= 0 ? "text-danger" : "text-ink"}>{formatINRCompact(Math.max(0, c.availableCreditPaise))}</span>;
  } else {
    label = "Credit limit";
    value = credit.isPending && open ? <Skeleton className="ml-auto mt-1 h-4 w-12" /> : shop.creditLimitPaise ? formatINRCompact(shop.creditLimitPaise) : <span className="font-normal text-ink-2">No limit</span>;
  }
  return (
    <section aria-label={`Selling to ${shop.name}`} className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5">
      <Avatar name={shop.name} size={34} square className="rounded-lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-snug text-ink">{shop.name}</p>
        <p className="truncate text-[13px] text-ink-2">{shop.ownerName ? `${shop.ownerName}, ` : ""}{shop.area}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[12px] text-ink-2">{label}</p>
        <div className="num text-[16px] font-semibold leading-tight">{value}</div>
      </div>
    </section>
  );
}
