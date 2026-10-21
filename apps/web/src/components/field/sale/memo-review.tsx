"use client";
import { useState } from "react";
import { AlertCircle, CalendarDays, Loader2, X } from "lucide-react";
import { addDays, formatGrams, formatINR, istDate } from "@jewelroute/shared";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { PurityTag } from "@/components/jr/money";
import { api, ApiError } from "@/lib/api";
import type { Memo, Piece } from "@/lib/types";
import { useSync } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { Thumb } from "../bits";
import { fmtDay, fmtWeekday, plural } from "../format";
import { errorMessage } from "../queries";
import { opKey, sendConfirmed, UnconfirmedError, useGuard } from "../guard";
import { BottomBar, BottomSpacer } from "../top-bar";
import type { AckLink } from "../types";
import type { memoPreview } from "./cart";

const UNCONFIRMED = "We couldn't confirm the memo. Your pieces are kept in this draft. Tap Retry; it sends the same request, so it can never create a second memo.";
const ymdToDate = (s: string) => new Date(`${s}T12:00:00`);
const dateToYmd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function MemoReview({ visitId, shopName, preview: s, due, notes, onDue, onNotes, onRemove, onDone, onPending, pending, blockReason }: {
  visitId: string; shopName: string; preview: ReturnType<typeof memoPreview>; due: string; notes: string;
  onDue: (d: string) => void; onNotes: (n: string) => void; onRemove: (ids: string[]) => void;
  onDone: (memo: Memo, ack: AckLink) => void;
  /** Freeze (picks) / release (undefined) the draft while a submit's outcome is unknown. */
  onPending: (picks: Piece[] | undefined) => void; pending: boolean; blockReason?: string;
}) {
  const sync = useSync();
  const today = istDate();
  const [calOpen, setCalOpen] = useState(false);
  const [error, setError] = useState<string | null>(pending ? UNCONFIRMED : null);
  const [checking, setChecking] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(pending);
  const [run, busy] = useGuard();
  const scope = `memo:${visitId}`;

  const submit = () => run(async () => {
    const body = { visitId, pieceIds: s.picks.map((p) => p.id).sort(), dueDate: due, notes: notes.trim() || undefined };
    const key = opKey.for(scope, JSON.stringify(body)); // same pieces + due + notes → same key → never two memos
    setError(null);
    setChecking(false);
    onPending(s.picks); // until the server answers definitively, these exact pieces stay in the draft
    try {
      const res = await sendConfirmed(() => api<{ memo: Memo; ack: AckLink | null }>("/memos", { body, idempotencyKey: key }), () => setChecking(true));
      opKey.clear(scope);
      onPending(undefined);
      sync("memo.created");
      // A replay normally carries the ack link; if not, issue a fresh one so the retailer step is never skipped.
      let ack = res.ack;
      if (!ack) ack = await api<{ ack: AckLink }>(`/memos/${res.memo.id}/ack/link`, { method: "POST" }).then((r) => r.ack).catch(() => null);
      if (ack) onDone(res.memo, ack);
      else setError(`${res.memo.number} is created and the pieces are with ${shopName}. Open the visit and tap Show QR again for the retailer.`);
    } catch (e) {
      setChecking(false);
      if (e instanceof UnconfirmedError) {
        // Unknown outcome: keep the draft AND the key. Retrying replays the same request, so at most one memo.
        setUnconfirmed(true);
        setError(UNCONFIRMED);
        return;
      }
      setUnconfirmed(false);
      onPending(undefined);
      opKey.clear(scope); // a definite "no": nothing was created
      if (e instanceof ApiError && (e.code === "PIECE_NOT_IN_YOUR_CUSTODY" || e.code === "PIECE_ALREADY_ON_MEMO")) {
        const ids = ((e.details ?? {}) as { pieceIds?: string[] }).pieceIds ?? [];
        onRemove(ids);
        sync("piece.moved");
        setError(ids.length ? `${plural(ids.length, "piece")} ${ids.length === 1 ? "is" : "are"} no longer in your bag and ${ids.length === 1 ? "was" : "were"} removed. Check the list and try again.` : e.message);
      } else {
        if (e instanceof ApiError && e.code === "PROOF_REQUIRED_BEFORE_SALE") sync("visit.proof_uploaded");
        setError(errorMessage(e));
      }
    }
  });

  return (
    <main className="pb-4">
      <p className="px-4 pt-3 text-[14px] text-ink-2">These exact pieces move from your bag to <span className="font-medium text-ink">{shopName}</span> until they’re returned or sold.</p>
      <ul className="mt-3 border-y border-line">
        {s.picks.map((p) => (
          <li key={p.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
            <Thumb src={p.imageUrl} size={48} />
            <div className="min-w-0 flex-1">
              <p className="num text-[15px] font-semibold text-ink">{p.tagCode}</p>
              <p className="truncate text-[13px] text-ink-2">{p.name}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-3"><PurityTag purity={p.purity} className="h-[18px] px-1 text-[10.5px]" /><span className="num">{formatGrams(p.netWeightMg)}</span></p>
            </div>
            <span className="num text-[14px] font-medium text-gold-ink">{formatINR(p.valuePaise)}</span>
            <button type="button" aria-label={`Remove ${p.tagCode}`} onClick={() => onRemove([p.id])} className="-mr-2 grid size-10 place-items-center rounded-lg text-ink-3 hover:bg-hover hover:text-ink"><X className="size-4" /></button>
          </li>
        ))}
      </ul>

      <section className="px-4 pt-5">
        <p className="text-[14px] font-medium text-ink">Due back</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {[3, 5, 7].map((n) => {
            const v = addDays(today, n);
            return (
              <button key={n} type="button" onClick={() => onDue(v)} aria-pressed={due === v}
                className={cn("h-10 rounded-lg border px-3 text-[14px] font-medium", due === v ? "border-ink bg-ink text-white" : "border-line-strong text-ink hover:bg-hover")}>
                {n} days
              </button>
            );
          })}
          <Popover open={calOpen} onOpenChange={setCalOpen}>
            <PopoverTrigger asChild>
              <button type="button" className={cn("inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-[14px]", ![3, 5, 7].some((n) => addDays(today, n) === due) ? "border-ink text-ink" : "border-line-strong text-ink-2")}>
                <CalendarDays className="size-4" />{fmtDay(due)}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={ymdToDate(due)} defaultMonth={ymdToDate(due)}
                disabled={{ before: ymdToDate(addDays(today, 1)), after: ymdToDate(addDays(today, 90)) }}
                onSelect={(d) => { if (d) { onDue(dateToYmd(d)); setCalOpen(false); } }} />
            </PopoverContent>
          </Popover>
        </div>
      </section>

      <div className="px-4 pt-5">
        <label htmlFor="memo-notes" className="text-[14px] font-medium text-ink">Notes <span className="font-normal text-ink-3">(optional)</span></label>
        <Textarea id="memo-notes" value={notes} onChange={(e) => onNotes(e.target.value)} rows={2} maxLength={1000} placeholder="For the Gupta family’s wedding viewing on Saturday." className="mt-2 text-[15px]" />
      </div>

      <div className="mx-4 mt-4 flex items-end justify-between rounded-xl border border-line px-4 py-3">
        <div>
          <p className="text-[13px] text-ink-2">{plural(s.items, "piece")}, <span className="num">{formatGrams(s.weightMg)}</span> gold</p>
          <p className="text-[12px] text-ink-3">Value at today’s rate, due {fmtWeekday(due)}</p>
        </div>
        <p className="num text-[22px] font-semibold tracking-[-0.01em] text-gold-ink">{formatINR(s.valuePaise)}</p>
      </div>

      {blockReason && <p className="mx-4 mt-3 rounded-lg bg-warn-soft px-3 py-2.5 text-[13px] text-warn">{blockReason}</p>}

      <BottomSpacer h={error || checking ? 150 : 92} />
      <BottomBar>
        {checking && <div role="status" className="mb-2.5 flex gap-2 rounded-lg bg-sunken px-3 py-2 text-[13px] text-ink-2"><Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" /><p>We couldn&apos;t confirm the memo. Checking…</p></div>}
        {!checking && error && <div role="alert" className={cn("mb-2.5 flex gap-2 rounded-lg px-3 py-2 text-[13px]", unconfirmed ? "bg-warn-soft text-warn" : "bg-danger-soft text-danger")}><AlertCircle className="mt-0.5 size-4 shrink-0" /><p>{error}</p></div>}
        <Button className="h-12 w-full justify-between px-4 text-[15px]" disabled={busy || s.items === 0 || (!!blockReason && !unconfirmed)} onClick={submit}>
          <span className="flex items-center gap-2">{busy && <Loader2 className="animate-spin" />}{busy ? (checking ? "Checking" : "Leaving on memo") : unconfirmed ? "Retry" : `Leave ${plural(s.items, "piece")} on memo`}</span>
          <span className="num opacity-80">{formatINR(s.valuePaise)}</span>
        </Button>
      </BottomBar>
    </main>
  );
}
