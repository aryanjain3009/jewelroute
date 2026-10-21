"use client";
/** Order decisions shared by the order record and its list preview, so rejecting from a side panel keeps
 *  you on the list and rejecting from the record keeps you on the record. The server decides; we render
 *  its answer (no optimistic status) and refetch every surface through useSync. */
import * as React from "react";
import { api } from "@/lib/api";
import type { Order } from "@/lib/types";
import { Btn } from "@/components/app/chrome";
import { Textarea } from "@/components/ui/textarea";
import { useMemoRecord, useWrite } from "./data";
import { Modal } from "./ui";

export function useApproveOrder(id: string) {
  return useWrite(() => api<{ order: Order }>(`/admin/orders/${id}/approve`, { method: "POST" }), { changes: ["order.decided"], success: (r) => `${r.order.number} approved` });
}

export function RejectOrderDialog({ order: o, open, onOpenChange }: { order: Order; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [reason, setReason] = React.useState("");
  React.useEffect(() => { if (open) setReason(""); }, [open]);
  // An order converted from a memo goes back on that memo when rejected (the server un-sells the pieces).
  const sourceMemo = useMemoRecord(o.sourceMemoId, { enabled: open && !!o.sourceMemoId });
  const reject = useWrite(() => api<{ order: Order }>(`/admin/orders/${o.id}/reject`, { body: { reason: reason.trim() } }), {
    changes: o.sourceMemoId ? ["order.decided", "order.unsold"] : ["order.decided"],
    success: (r) => `${r.order.number} rejected`,
    onSuccess: () => onOpenChange(false),
  });
  const n = o.items.filter((i) => i.pieceId).length || o.items.reduce((a, i) => a + i.quantity, 0);
  const memo = sourceMemo.data?.memo;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Reject ${o.number}?`}
      description={<>
        {o.sourceMemoId && (
          <span className="mb-2 block rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-ink">
            Rejecting puts {n} piece{n === 1 ? "" : "s"} back on {memo ? <span className="num font-medium">{memo.number}</span> : "its memo"} at {memo?.shop.name ?? o.shop.name}. They stay with the retailer on memo; they don&apos;t go to the vault.
          </span>
        )}
        {o.agent.name} sees the reason, your name and the time on this order in the field app (an open visit updates within 10 seconds). The order stays on record with its frozen prices.
      </>}
      footer={<>
        <Btn variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Btn>
        <Btn variant="primary" className="bg-danger hover:bg-danger/90" disabled={reason.trim().length < 3 || reject.isPending} onClick={() => reject.mutate(undefined)}>
          {reject.isPending ? "Rejecting…" : o.sourceMemoId ? "Reject and put pieces back on memo" : "Reject order"}
        </Btn>
      </>}
    >
      <label className="block text-[13px] font-medium text-ink" htmlFor={`reject-reason-${o.id}`}>Reason</label>
      <Textarea id={`reject-reason-${o.id}`} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Retailer's credit limit exceeded; re-book after payment" className="mt-1.5 min-h-20 border-line-strong text-[14px]" maxLength={500} />
    </Modal>
  );
}
