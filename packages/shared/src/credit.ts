/* Credit exposure and the order-approval rules (docs/CONTRACT.md § v3). Pure integer paise — sums
 * and comparisons only, no division, so there is no rounding anywhere in this file. The API gathers
 * the four sums from Postgres (inside the order transaction, shop row locked) and calls this; the
 * seed calls it too, so a seeded snapshot and a live one are computed the same way. */

export type ApprovalReason = 'CREDIT_LIMIT' | 'ORDER_THRESHOLD';
export const APPROVAL_REASONS: readonly ApprovalReason[] = ['CREDIT_LIMIT', 'ORDER_THRESHOLD'];

export interface CreditInputs {
  /** 0 = no credit limit configured for the shop (CREDIT_LIMIT never trips). */
  creditLimitPaise: number;
  /** Opening balance carried in from before JewelRoute (Shop.openingOutstandingPaise). */
  openingOutstandingPaise: number;
  /** Σ totalPaise of the shop's CONFIRMED + APPROVED orders with settledAt null. */
  unsettledOrdersPaise: number;
  /** Σ MemoItem.valuePaise of OUT items on memos at the shop (valuation at handover). */
  memoExposurePaise: number;
  /** Tenant setting; null = no threshold rule. */
  approvalThresholdPaise: number | null;
  /** Prospective order total incl. GST; 0/absent = "position right now". */
  orderAmountPaise?: number;
}

export interface CreditPosition {
  creditLimitPaise: number;
  openingOutstandingPaise: number;
  unsettledOrdersPaise: number;
  outstandingPaise: number;
  memoExposurePaise: number;
  exposurePaise: number;
  /** null when the shop has no credit limit (unlimited — never render it as ₹0). */
  availableCreditPaise: number | null;
  overLimit: boolean;
  approvalThresholdPaise: number | null;
  orderAmountPaise: number;
  projectedExposurePaise: number;
  requiresApproval: boolean;
  reasons: ApprovalReason[];
}

function paise(name: string, v: number) {
  if (!Number.isSafeInteger(v) || v < 0) throw new RangeError(`${name} must be a non-negative integer of paise (got ${v})`);
  return v;
}

export function creditPosition(i: CreditInputs): CreditPosition {
  const limit = paise('creditLimitPaise', i.creditLimitPaise);
  const opening = paise('openingOutstandingPaise', i.openingOutstandingPaise);
  const unsettled = paise('unsettledOrdersPaise', i.unsettledOrdersPaise);
  const memo = paise('memoExposurePaise', i.memoExposurePaise);
  const amount = paise('orderAmountPaise', i.orderAmountPaise ?? 0);
  const threshold = i.approvalThresholdPaise == null ? null : paise('approvalThresholdPaise', i.approvalThresholdPaise);
  const outstanding = opening + unsettled;
  const exposure = outstanding + memo;
  const projected = exposure + amount;
  const reasons: ApprovalReason[] = [];
  // Rule 1: projected exposure strictly above the limit (exactly at the limit is allowed).
  if (limit > 0 && projected > limit) reasons.push('CREDIT_LIMIT');
  // Rule 2: order total at or above the tenant threshold (equality trips).
  if (threshold != null && amount > 0 && amount >= threshold) reasons.push('ORDER_THRESHOLD');
  for (const [k, v] of [['outstandingPaise', outstanding], ['projectedExposurePaise', projected]] as const) paise(k, v);
  return {
    creditLimitPaise: limit,
    openingOutstandingPaise: opening,
    unsettledOrdersPaise: unsettled,
    outstandingPaise: outstanding,
    memoExposurePaise: memo,
    exposurePaise: exposure,
    availableCreditPaise: limit > 0 ? Math.max(0, limit - exposure) : null,
    overLimit: limit > 0 && exposure > limit,
    approvalThresholdPaise: threshold,
    orderAmountPaise: amount,
    projectedExposurePaise: projected,
    requiresApproval: reasons.length > 0,
    reasons,
  };
}
