"use client";
import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { addDays, formatGrams, formatINR, formatINRCompact, formatRate, istDate, PURITY_LABEL } from "@jewelroute/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MemoStatusPill, OrderStatusPill } from "@/components/jr/status";
import { Money, PurityTag } from "@/components/jr/money";
import { api, ApiError } from "@/lib/api";
import type { ConvertPreview, Memo, Order } from "@/lib/types";
import { qk, useSync } from "@/lib/sync";
import { reasonsText } from "@/components/app/status";
import { cn } from "@/lib/utils";
import { PRESS_BTN, Thumb } from "./bits";
import { errorMessage } from "./queries";
import { fmtDay, fmtDue, fmtTime, plural } from "./format";
import { CreditCheck } from "./sale/order-review";
import { isUnconfirmed, opKey, useGuard, useSessionState } from "./guard";
import { useFieldGeo } from "./use-field-geo";
import type { VisitDetail } from "./types";

type Base = { open: boolean; onOpenChange: (o: boolean) => void; visitId: string };

function Sheet({ open, onOpenChange, title, description, children, footer }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent className="mx-auto max-w-[520px] data-[vaul-drawer-direction=bottom]:max-h-[88dvh]">
        <DrawerHeader className="px-4 pb-3 pt-2 !text-left">
          <DrawerTitle className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{title}</DrawerTitle>
          {description && <DrawerDescription className="text-[14px] leading-snug text-ink-2">{description}</DrawerDescription>}
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">{children}</div>
        <DrawerFooter className="border-t border-line px-4 pt-3 safe-bottom">{footer}</DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

export function NoteDrawer({ open, onOpenChange, visitId }: Base) {
  const sync = useSync();
  const [body, setBody] = useSessionState(`jr:note:${visitId}`, ""); // an unsent note survives a reload
  const [run, busy] = useGuard();
  const save = () => run(async () => {
    // One key per distinct note: a retry of the same text (timeout, refresh) replays instead of adding it twice.
    const text = body.trim();
    const scope = `note:${visitId}`;
    try {
      await api(`/visits/${visitId}/notes`, { body: { body: text }, idempotencyKey: opKey.for(scope, text) });
      opKey.clear(scope);
      sync("visit.note_added"); toast.success("Note added"); setBody(""); onOpenChange(false);
    } catch (e) {
      if (!isUnconfirmed(e)) opKey.clear(scope); // a definite "no": nothing was saved under this key
      toast.error(errorMessage(e, "The note wasn't confirmed. It's still here; saving again won't add it twice."));
    }
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Add note" description="Visible to your manager on this visit."
      footer={<Button className={cn("h-12 text-[15px]", PRESS_BTN)} disabled={!body.trim() || busy} onClick={save}>{busy && <Loader2 className="animate-spin" />}Save note</Button>}>
      <Textarea autoFocus value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={2000}
        placeholder="What you learned at this shop" className="min-h-32 text-[15px]" />
    </Sheet>
  );
}

export function CompleteDrawer({ open, onOpenChange, data }: { open: boolean; onOpenChange: (o: boolean) => void; data: VisitDetail }) {
  const { visit, shop } = data;
  const sync = useSync();
  const router = useRouter();
  const geo = useFieldGeo(open);
  const [summary, setSummary] = useSessionState(`jr:summary:${visit.id}`, "");
  const [run, busy] = useGuard();
  const hasProof = data.proofs.length > 0;
  const pendingAck = data.memosCreated.filter((m) => m.ackStatus !== "ACKNOWLEDGED").length;

  const complete = () => run(async () => {
    try {
      const f = geo.fix;
      await api(`/visits/${visit.id}/complete`, { body: { summary: summary.trim() || undefined, ...(f ? { lat: f.lat, lng: f.lng } : {}) } });
    } catch (e) {
      if (!(e instanceof ApiError && e.code === "VISIT_ALREADY_COMPLETED")) {
        // A definite 4xx: nothing changed. No answer / 5xx: unknown — re-read; tapping again is safe
        // (an already completed visit answers VISIT_ALREADY_COMPLETED and lands here as done).
        const definite = e instanceof ApiError && e.status < 500;
        if (!definite) sync("visit.completed");
        toast.error(definite ? errorMessage(e) : "We couldn't confirm the visit was closed. Tap Complete visit again.");
        return;
      }
    }
    setSummary("");
    sync("visit.completed");
    toast.success(`${shop.name} visit complete`);
    onOpenChange(false);
    router.push("/field/today");
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Complete visit" description={`Close the visit at ${shop.name}. Orders and memos stay as they are.`}
      footer={
        <>
          {!hasProof && <p className="text-center text-[13px] text-danger">Add the arrival photo first. Every visit needs proof.</p>}
          <Button className={cn("h-12 text-[15px]", PRESS_BTN)} disabled={!hasProof || busy} onClick={complete}>{busy && <Loader2 className="animate-spin" />}Complete visit</Button>
        </>
      }>
      <ul className="mb-4 divide-y divide-line rounded-xl border border-line text-[14px]">
        <li className="flex justify-between px-3 py-2.5"><span className="text-ink-2">Orders booked</span><span className="num text-ink">{visit.orderCount ? plural(visit.orderCount, "order") : "None"}</span></li>
        <li className="flex justify-between px-3 py-2.5"><span className="text-ink-2">Memos left</span><span className="num text-ink">{data.memosCreated.length ? plural(data.memosCreated.length, "memo") : "None"}</span></li>
        {pendingAck > 0 && <li className="flex justify-between px-3 py-2.5"><span className="text-ink-2">Retailer acknowledgement</span><span className="text-warn">{pendingAck} pending</span></li>}
      </ul>
      <label htmlFor="summary" className="text-[14px] font-medium text-ink">Summary <span className="font-normal text-ink-3">(optional)</span></label>
      <Textarea id="summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} maxLength={2000}
        placeholder="How the visit went" className="mt-2 min-h-24 text-[15px]" />
    </Sheet>
  );
}

export function ReturnDrawer({ open, onOpenChange, memos, initialMemoId }: Base & { memos: Memo[]; initialMemoId?: string | null }) {
  const sync = useSync();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [run, busy] = useGuard();
  const open_ = useMemo(() => memos.filter((m) => m.items.some((i) => i.status === "OUT")), [memos]);

  useEffect(() => {
    if (!open) return;
    const m = open_.find((x) => x.id === initialMemoId);
    setSel(new Set(m ? m.items.filter((i) => i.status === "OUT").map((i) => i.piece.id) : []));
  }, [open, initialMemoId, open_]);

  const chosen = open_.flatMap((m) => m.items.filter((i) => i.status === "OUT" && sel.has(i.piece.id)).map((i) => ({ memo: m, item: i })));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const submit = () => run(async () => {
    const byMemo = new Map<string, string[]>();
    chosen.forEach(({ memo, item }) => byMemo.set(memo.id, [...(byMemo.get(memo.id) ?? []), item.piece.id]));
    try {
      for (const [memoId, pieceIds] of byMemo) {
        const ids = [...pieceIds].sort();
        const scope = `return:${memoId}`;
        await api(`/memos/${memoId}/return`, { body: { pieceIds: ids }, idempotencyKey: opKey.for(scope, ids.join(",")) });
        opKey.clear(scope);
      }
      sync("memo.returned");
      toast.success(`${plural(chosen.length, "piece")} back in your bag`);
      onOpenChange(false);
    } catch (e) {
      sync("memo.returned"); // some memos may have gone through; show the truth
      toast.error(errorMessage(e, "We couldn't confirm the return. Check the samples list; tapping Return again is safe, it is never recorded twice."));
    }
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Return samples" description="Pick the pieces the retailer is handing back. They move into your bag."
      footer={
        <Button className={cn("h-12 text-[15px]", PRESS_BTN)} disabled={!chosen.length || busy} onClick={submit}>
          {busy && <Loader2 className="animate-spin" />}
          {chosen.length ? `Return ${plural(chosen.length, "piece")}` : "Select pieces to return"}
        </Button>
      }>
      {open_.length === 0 ? (
        <p className="py-8 text-center text-[14px] text-ink-2">No samples are out on memo at this shop.</p>
      ) : (
        <div className="space-y-5 pb-2">
          {open_.map((m) => (
            <section key={m.id}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="num text-[14px] font-medium text-ink">{m.number}</p>
                  <p className="text-[13px] text-ink-3">{fmtDue(m.daysToDue)}, {fmtDay(m.dueDate)}</p>
                </div>
                <MemoStatusPill status={m.displayStatus} />
              </div>
              <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line">
                {m.items.filter((i) => i.status === "OUT").map((i) => (
                  <li key={i.id}>
                    <label className={cn("flex min-h-16 cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors duration-150", sel.has(i.piece.id) ? "bg-selected" : "active:bg-sunken")}>
                      <Checkbox checked={sel.has(i.piece.id)} onCheckedChange={() => toggle(i.piece.id)} className="size-5 rounded-[5px] border-[#c9cacd] data-[state=checked]:border-ink data-[state=checked]:bg-ink data-[state=checked]:text-white" aria-label={`Return ${i.piece.tagCode}`} />
                      <Thumb src={i.piece.imageUrl} size={44} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium text-ink">{i.piece.name}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
                          <span className="num font-medium text-ink-2">{i.piece.tagCode}</span><PurityTag purity={i.piece.purity} /><span className="num">{formatGrams(i.piece.netWeightMg)}</span>
                        </span>
                      </span>
                      <Money paise={i.valuePaise} compact className="text-[14px] font-medium text-gold-ink" />
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {chosen.length > 0 && <p className="pb-2 pt-3 text-center text-[13px] text-ink-2">{plural(chosen.length, "piece")} selected, <span className="num">{formatINRCompact(chosen.reduce((s, c) => s + c.item.valuePaise, 0))}</span></p>}
    </Sheet>
  );
}

/** "Sell from memo": the retailer keeps some pieces on this memo → one order at today's gold rate.
 *  Before booking it shows what the order review shows — the server's price at today's rate (GST once on
 *  the subtotal) and the server's credit position with these pieces already off the memo, plus whether it
 *  needs approval and why (`GET /memos/:id/convert-preview`). After booking it shows the order the server
 *  wrote: status and, when pending, the reasons. */
export function SellFromMemoDrawer({ open, onOpenChange, visitId, shopName, memo: live }: Base & { shopName: string; memo: Memo | null }) {
  const sync = useSync();
  // Keep the memo we opened with: selling its last pieces closes it and it leaves the shop's open list.
  const [kept, setKept] = useState<Memo | null>(live);
  useEffect(() => { if (live) setKept(live); }, [live]);
  const memo = live ?? kept;
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<Order | null>(null);
  const [run, busy] = useGuard();
  const out = useMemo(() => memo?.items.filter((i) => i.status === "OUT") ?? [], [memo]);
  useEffect(() => { if (open) { setSel(new Set()); setDone(null); } }, [open, memo?.id]);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const chosen = out.filter((i) => sel.has(i.piece.id));
  const ids = chosen.map((i) => i.piece.id).sort();

  const preview = useQuery({
    queryKey: [...qk.convertPreview, memo?.id, visitId, ids.join(",")],
    queryFn: () => api<ConvertPreview>(`/memos/${memo!.id}/convert-preview?pieceIds=${ids.map(encodeURIComponent).join(",")}&visitId=${encodeURIComponent(visitId)}`),
    enabled: open && !!memo && ids.length > 0 && !done,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    retry: 1,
  });
  // Only a preview for exactly this selection counts (placeholder data may still be the previous one).
  const pv = preview.data && !preview.isPlaceholderData ? preview.data : undefined;
  const doneId = done?.id;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (doneId) sync("memo.converted"); }, [doneId]);
  const needsApproval = pv?.credit.requiresApproval === true;

  const submit = () => memo && run(async () => {
    const scope = `convert:${memo.id}`;
    try {
      const r = await api<{ memo: Memo; order: Order }>(`/memos/${memo.id}/convert`, { body: { pieceIds: ids, visitId }, idempotencyKey: opKey.for(scope, ids.join(",")) });
      opKey.clear(scope);
      setDone(r.order); // sync runs after this renders (effect below), when the preview query is already off
      toast.success(r.order.status === "PENDING_APPROVAL" ? `${r.order.number} sent for approval` : `${r.order.number} confirmed`);
    } catch (e) {
      sync("memo.converted"); // if it landed, the visit shows it
      toast.error(errorMessage(e, "We couldn't confirm the sale. Check the memo; tapping again is safe, it is never booked twice."));
    }
  });

  if (!memo) return null;
  const pending = done?.status === "PENDING_APPROVAL";
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={done ? (pending ? "Sent to your manager for approval" : "Order confirmed") : `Sell from ${memo.number}`}
      description={done ? undefined : "Pick the pieces the retailer is keeping. They become one order priced at today's gold rate."}
      footer={done
        ? <Button className={cn("h-12 text-[15px]", PRESS_BTN)} onClick={() => onOpenChange(false)}>Done</Button>
        : (
          <Button className={cn("h-12 justify-between px-4 text-[15px]", PRESS_BTN)} disabled={!chosen.length || busy || !pv} onClick={submit}>
            <span className="flex items-center gap-2">
              {(busy || (chosen.length > 0 && preview.isFetching && !pv)) && <Loader2 className="animate-spin" />}
              {!chosen.length ? "Select pieces to sell" : !pv ? (preview.isError ? "Can't book yet" : "Checking price and credit") : busy ? (needsApproval ? "Sending" : "Booking") : needsApproval ? `Send ${plural(chosen.length, "piece")} for approval` : `Book order for ${plural(chosen.length, "piece")}`}
            </span>
            {pv && <span className="num">{formatINR(pv.totalPaise)}</span>}
          </Button>
        )}>
      {done ? <ConvertedOutcome order={done} memoNumber={memo.number} /> : (
        <>
          <ul className="mb-2 divide-y divide-line overflow-hidden rounded-xl border border-line">
            {out.map((i) => (
              <li key={i.id}>
                <label className={cn("flex min-h-16 cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors duration-150", sel.has(i.piece.id) ? "bg-selected" : "active:bg-sunken")}>
                  <Checkbox checked={sel.has(i.piece.id)} onCheckedChange={() => toggle(i.piece.id)} className="size-5 rounded-[5px] border-[#c9cacd] data-[state=checked]:border-ink data-[state=checked]:bg-ink data-[state=checked]:text-white" aria-label={`Sell ${i.piece.tagCode}`} />
                  <Thumb src={i.piece.imageUrl} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-ink">{i.piece.name}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
                      <span className="num font-medium text-ink-2">{i.piece.tagCode}</span><PurityTag purity={i.piece.purity} /><span className="num">{formatGrams(i.piece.netWeightMg)}</span>
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {chosen.length > 0 && <SalePreview q={preview} pv={pv} shopName={shopName} />}
        </>
      )}
    </Sheet>
  );
}

function SalePreview({ q, pv, shopName }: { q: UseQueryResult<ConvertPreview>; pv?: ConvertPreview; shopName: string }) {
  if (!pv) {
    if (q.isError) return <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-3 py-2.5 text-[13px] text-danger">{errorMessage(q.error, "Couldn't get today's price and credit for these pieces. Check your connection and try again.")}</p>;
    return <div className="mb-3 space-y-2" aria-busy><div className="h-[120px] animate-pulse rounded-xl bg-sunken" /><div className="h-[150px] animate-pulse rounded-xl bg-sunken" /></div>;
  }
  return (
    <div className="space-y-3 pb-3">
      <dl className="rounded-xl border border-line px-4 py-3 text-[14px]">
        {pv.lines.map((l) => (
          <div key={l.pieceId} className="flex items-baseline justify-between gap-3 py-1">
            <dt className="min-w-0 truncate text-ink-2"><span className="num font-medium text-ink">{l.tagCode}</span> {l.name}</dt>
            <dd className="num shrink-0 text-ink">{formatINR(l.lineTotalPaise)}</dd>
          </div>
        ))}
        <div className="flex justify-between py-1"><dt className="text-ink-2">Subtotal</dt><dd className="num text-ink">{formatINR(pv.subtotalPaise)}</dd></div>
        <div className="flex justify-between py-1"><dt className="text-ink-2">GST 3%</dt><dd className="num text-ink">{formatINR(pv.gstPaise)}</dd></div>
        <div className="mt-1.5 flex items-baseline justify-between border-t border-line pt-2.5">
          <dt className="font-medium text-ink">Total incl. GST</dt>
          <dd className="num text-[20px] font-semibold tracking-[-0.01em] text-gold-ink">{formatINR(pv.totalPaise)}</dd>
        </div>
        <p className="mt-2 text-[12px] text-ink-3">
          At {pv.goldRateSnapshot.map((r) => `${PURITY_LABEL[r.purity]} ${formatRate(r.ratePaisePerGram)} (rate as of ${fmtTime(r.effectiveFrom)}, ${fmtDay(r.effectiveFrom)})`).join(", ")}. The price freezes when you book; the office sees the frozen price.
        </p>
      </dl>
      <CreditCheck position={pv.credit} shopName={shopName} amountLabel="This sale" afterLabel="Projected exposure" className=""
        memoNote="Samples on memo already leaves out the pieces you're selling: they come off the memo when you book." />
    </div>
  );
}

/** The order the server wrote, told the same way as the normal order flow (OrderDone). */
function ConvertedOutcome({ order, memoNumber }: { order: Order; memoNumber: string }) {
  const pending = order.status === "PENDING_APPROVAL";
  const why = reasonsText(order.approval?.reasons, order.approval?.position);
  return (
    <div className="space-y-3 pb-3">
      {pending && why && <p className="text-[15px] font-medium text-warn">{why}</p>}
      <div className="rounded-xl border border-line">
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
          <span className="num text-[15px] font-semibold text-ink">{order.number}</span>
          <OrderStatusPill status={order.status} />
        </div>
        {order.items.map((i) => (
          <div key={i.id} className="flex items-center gap-2.5 border-b border-line px-3 py-2 text-[13px] last:border-b-0">
            <Thumb src={i.imageUrl} size={28} className="rounded-md" />
            <span className="min-w-0 flex-1 truncate text-ink">{i.name}</span>
            <Money paise={i.lineTotalPaise} className="text-ink-2" />
          </div>
        ))}
        <div className="flex items-center justify-between border-b border-line px-3 py-2 text-[13px]">
          <span className="text-ink-2">GST 3%</span>
          <Money paise={order.gstPaise} className="text-ink-2" />
        </div>
        <div className="flex items-center justify-between px-3 py-2.5 text-[14px]">
          <span className="text-ink-2">Total incl. GST</span>
          <Money paise={order.totalPaise} className="font-semibold text-gold-ink" />
        </div>
      </div>
      <p className="text-[13px] text-ink-2">
        {pending
          ? <>Prices are frozen. The pieces are sold and off {memoNumber} while your manager decides — the decision shows on this visit. If it&apos;s rejected, they go back on the memo.</>
          : <>Prices are frozen at today&apos;s rate. The pieces are sold and off {memoNumber}. Nothing else to do — the office has it.</>}
      </p>
    </div>
  );
}

/** Field-side due-date extension (today … today + 90 days, IST). */
export function ExtendMemoDrawer({ open, onOpenChange, memo }: { open: boolean; onOpenChange: (o: boolean) => void; memo: Memo | null }) {
  const sync = useSync();
  const today = istDate();
  const [due, setDue] = useState("");
  const [reason, setReason] = useState("");
  const [run, busy] = useGuard();
  const max = addDays(today, 90);
  useEffect(() => {
    if (!open || !memo) return;
    const next = addDays(memo.dueDate < today ? today : memo.dueDate, 7); // suggest one more week
    setDue(next > max ? max : next);
    setReason("");
  }, [open, memo, today, max]);
  const valid = !!due && due >= today && due <= max && due !== memo?.dueDate;
  const submit = () => memo && run(async () => {
    try {
      const r = await api<{ memo: Memo }>(`/memos/${memo.id}/extend`, { body: { dueDate: due, reason: reason.trim() || undefined } });
      sync("memo.extended");
      toast.success(`${r.memo.number} now due ${fmtDay(r.memo.dueDate)}`);
      onOpenChange(false);
    } catch (e) { toast.error(errorMessage(e, "The due date didn't change. Try again.")); }
  });
  if (!memo) return null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={`Extend ${memo.number}`} description={`Currently due ${fmtDay(memo.dueDate)}. Pick a new date up to ${fmtDay(max)}.`}
      footer={<Button className={cn("h-12 text-[15px]", PRESS_BTN)} disabled={!valid || busy} onClick={submit}>{busy && <Loader2 className="animate-spin" />}Extend to {due ? fmtDay(due) : "…"}</Button>}>
      <div className="space-y-3 pb-3">
        <label className="block">
          <span className="mb-1.5 block text-[14px] font-medium text-ink">New due date</span>
          <Input type="date" value={due} min={today} max={max} onChange={(e) => setDue(e.target.value)} className="h-11 text-[15px]" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[14px] font-medium text-ink">Reason <span className="font-normal text-ink-3">(optional)</span></span>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} placeholder="Why the retailer needs more time" className="text-[15px]" />
        </label>
      </div>
    </Sheet>
  );
}
