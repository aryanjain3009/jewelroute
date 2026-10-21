"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { addDays, formatGrams, formatINRCompact, istDate } from "@jewelroute/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MemoStatusPill, OrderStatusPill } from "@/components/jr/status";
import { Money, PurityTag } from "@/components/jr/money";
import { api, ApiError } from "@/lib/api";
import type { Memo, Order } from "@/lib/types";
import { useSync } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { Thumb } from "./bits";
import { errorMessage } from "./queries";
import { fmtDay, fmtDue, plural } from "./format";
import { opKey, useGuard, useSessionState } from "./guard";
import { useFieldGeo } from "./use-field-geo";
import type { VisitDetail } from "./types";

type Base = { open: boolean; onOpenChange: (o: boolean) => void; visitId: string };

function Sheet({ open, onOpenChange, title, description, children, footer }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent className="mx-auto max-w-[520px] data-[vaul-drawer-direction=bottom]:max-h-[88dvh]">
        <DrawerHeader className="px-4 pb-3 pt-3 !text-left">
          <DrawerTitle className="text-[17px] font-semibold">{title}</DrawerTitle>
          {description && <DrawerDescription className="text-[14px] text-ink-2">{description}</DrawerDescription>}
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">{children}</div>
        <DrawerFooter className="border-t border-line px-4 safe-bottom">{footer}</DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

export function NoteDrawer({ open, onOpenChange, visitId }: Base) {
  const sync = useSync();
  const [body, setBody] = useSessionState(`jr:note:${visitId}`, ""); // an unsent note survives a reload
  const [run, busy] = useGuard();
  const save = () => run(async () => {
    try {
      await api(`/visits/${visitId}/notes`, { body: { body: body.trim() } });
      sync("visit.note_added"); toast.success("Note added"); setBody(""); onOpenChange(false);
    } catch (e) { toast.error(errorMessage(e, "The note wasn't saved. It's still here; try again.")); }
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Add note" description="Visible to your manager on this visit."
      footer={<Button className="h-12 text-[15px]" disabled={!body.trim() || busy} onClick={save}>{busy && <Loader2 className="animate-spin" />}Save note</Button>}>
      <Textarea autoFocus value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={2000}
        placeholder="Owner wants lighter bangles under 20 g for the wedding season." className="min-h-32 text-[15px]" />
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
      if (!(e instanceof ApiError && e.code === "VISIT_ALREADY_COMPLETED")) { toast.error(errorMessage(e, "The visit wasn't closed. Try again.")); return; }
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
          <Button className="h-12 text-[15px]" disabled={!hasProof || busy} onClick={complete}>{busy && <Loader2 className="animate-spin" />}Complete visit</Button>
        </>
      }>
      <ul className="mb-4 divide-y divide-line rounded-xl border border-line text-[14px]">
        <li className="flex justify-between px-3 py-2.5"><span className="text-ink-2">Orders booked</span><span className="num text-ink">{visit.orderCount ? plural(visit.orderCount, "order") : "None"}</span></li>
        <li className="flex justify-between px-3 py-2.5"><span className="text-ink-2">Memos left</span><span className="num text-ink">{data.memosCreated.length ? plural(data.memosCreated.length, "memo") : "None"}</span></li>
        {pendingAck > 0 && <li className="flex justify-between px-3 py-2.5"><span className="text-ink-2">Retailer acknowledgement</span><span className="text-warn">{pendingAck} pending</span></li>}
      </ul>
      <label htmlFor="summary" className="text-[14px] font-medium text-ink">Summary <span className="font-normal text-ink-3">(optional)</span></label>
      <Textarea id="summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} maxLength={2000}
        placeholder="Booked 2 bangles. Left the Rajwada kada on memo for 5 days." className="mt-2 min-h-24 text-[15px]" />
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
        <Button className="h-12 text-[15px]" disabled={!chosen.length || busy} onClick={submit}>
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
                    <label className={cn("flex min-h-16 cursor-pointer items-center gap-3 px-3 py-2.5", sel.has(i.piece.id) && "bg-selected")}>
                      <Checkbox checked={sel.has(i.piece.id)} onCheckedChange={() => toggle(i.piece.id)} className="size-5" aria-label={`Return ${i.piece.tagCode}`} />
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
 *  Pending until the API answers; the order shown is the one the server created (number, total, status). */
export function SellFromMemoDrawer({ open, onOpenChange, visitId, memo: live }: Base & { memo: Memo | null }) {
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

  const submit = () => memo && run(async () => {
    const ids = chosen.map((i) => i.piece.id).sort();
    const scope = `convert:${memo.id}`;
    try {
      const r = await api<{ memo: Memo; order: Order }>(`/memos/${memo.id}/convert`, { body: { pieceIds: ids, visitId }, idempotencyKey: opKey.for(scope, ids.join(",")) });
      opKey.clear(scope);
      sync("memo.converted");
      setDone(r.order);
      toast.success(`${r.order.number} booked from ${memo.number}`);
    } catch (e) {
      sync("memo.converted"); // if it landed, the visit shows it
      toast.error(errorMessage(e, "We couldn't confirm the sale. Check the memo; tapping again is safe, it is never booked twice."));
    }
  });

  if (!memo) return null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={done ? "Order booked" : `Sell from ${memo.number}`}
      description={done ? undefined : "Pick the pieces the retailer is keeping. They become one order priced at today's gold rate."}
      footer={done
        ? <Button className="h-12 text-[15px]" onClick={() => onOpenChange(false)}>Done</Button>
        : <Button className="h-12 text-[15px]" disabled={!chosen.length || busy} onClick={submit}>{busy && <Loader2 className="animate-spin" />}{chosen.length ? `Book order for ${plural(chosen.length, "piece")}` : "Select pieces to sell"}</Button>}>
      {done ? (
        <div className="space-y-3 pb-3">
          <div className="rounded-xl border border-line">
            <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
              <span className="num text-[15px] font-semibold text-ink">{done.number}</span>
              <OrderStatusPill status={done.status} />
            </div>
            {done.items.map((i) => (
              <div key={i.id} className="flex items-center gap-2.5 border-b border-line px-3 py-2 text-[13px] last:border-b-0">
                <Thumb src={i.imageUrl} size={28} className="rounded-md" />
                <span className="min-w-0 flex-1 truncate text-ink">{i.name}</span>
                <Money paise={i.lineTotalPaise} className="text-ink-2" />
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2.5 text-[14px]">
              <span className="text-ink-2">Total incl. GST</span>
              <Money paise={done.totalPaise} className="font-semibold text-gold-ink" />
            </div>
          </div>
          <p className="text-[13px] text-ink-2">Sent to your manager for approval. The pieces are now sold and leave the memo.</p>
        </div>
      ) : (
        <ul className="mb-2 divide-y divide-line overflow-hidden rounded-xl border border-line">
          {out.map((i) => (
            <li key={i.id}>
              <label className={cn("flex min-h-16 cursor-pointer items-center gap-3 px-3 py-2.5", sel.has(i.piece.id) && "bg-selected")}>
                <Checkbox checked={sel.has(i.piece.id)} onCheckedChange={() => toggle(i.piece.id)} className="size-5" aria-label={`Sell ${i.piece.tagCode}`} />
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
      )}
      {!done && chosen.length > 0 && <p className="pb-2 pt-1 text-center text-[13px] text-ink-2">The order total is set by the server at today&apos;s rate when you book.</p>}
    </Sheet>
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
      footer={<Button className="h-12 text-[15px]" disabled={!valid || busy} onClick={submit}>{busy && <Loader2 className="animate-spin" />}Extend to {due ? fmtDay(due) : "…"}</Button>}>
      <div className="space-y-3 pb-3">
        <label className="block">
          <span className="mb-1.5 block text-[14px] font-medium text-ink">New due date</span>
          <Input type="date" value={due} min={today} max={max} onChange={(e) => setDue(e.target.value)} className="h-11 text-[15px]" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[14px] font-medium text-ink">Reason <span className="font-normal text-ink-3">(optional)</span></span>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} placeholder="Retailer is showing the set at a wedding on Sunday." className="text-[15px]" />
        </label>
      </div>
    </Sheet>
  );
}
