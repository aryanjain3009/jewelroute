import { addDays, istDate, orderTotals } from "@jewelroute/shared";
import type { Design, Memo, Order, Piece } from "@/lib/types";
import type { AckLink } from "../types";

export type SaleMode = "order" | "memo";

/** What survives a reload, per visit (sessionStorage `jr:sale:<visitId>`). Ids only — objects are
 *  resolved against fresh server data, so a piece that left the bag can never be submitted. */
export interface SaleDraft {
  order: Record<string, number>;     // designId → qty
  orderNotes: string;
  orderStep: "browse" | "review";
  orderDone?: Order;
  memo: string[];                    // pieceIds
  due: string;
  memoNotes: string;
  memoStep: "browse" | "review";
  memoAck?: { memo: Memo; ack: AckLink };
  /** The exact pieces of a memo submit whose outcome is not confirmed yet. While set, the draft is frozen
   *  (a bag refetch must not drop them) until the same Idempotency-Key gets a definite answer. */
  memoPending?: Piece[];
}
export const emptyDraft = (): SaleDraft => ({ order: {}, orderNotes: "", orderStep: "browse", memo: [], due: addDays(istDate(), 5), memoNotes: "", memoStep: "browse" });

/** Display-only preview of the cart. The number Rahul commits to is the one the API returns. */
export function orderPreview(order: Record<string, number>, designs: Map<string, Design>) {
  const lines = Object.entries(order)
    .map(([id, qty]) => ({ design: designs.get(id), qty }))
    .filter((l): l is { design: Design; qty: number } => !!l.design?.price && l.qty > 0);
  const items = lines.reduce((s, l) => s + l.qty, 0);
  const weightMg = lines.reduce((s, l) => s + l.design.netWeightMg * l.qty, 0);
  const totals = orderTotals(lines.map((l) => l.design.price!.unitPricePaise * l.qty));
  return { lines, items, weightMg, ...totals };
}

export function memoPreview(ids: string[], bag: Piece[]) {
  const picks = bag.filter((p) => ids.includes(p.id));
  return {
    picks, items: picks.length,
    weightMg: picks.reduce((s, p) => s + p.netWeightMg, 0),
    valuePaise: picks.reduce((s, p) => s + p.valuePaise, 0),
  };
}
