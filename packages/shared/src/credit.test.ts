/* Credit exposure known answers (v3 contract). Every number is hand-computed in the comment —
 * integer paise, no division, so no rounding is involved. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditPosition } from './index';

// Sharma-like shop: limit ₹25,00,000 · opening ₹8,00,000 · one unsettled order ₹3,66,517.26 ·
// memo exposure ₹1,85,000. outstanding = 80,000,000 + 36,651,726 = 116,651,726
// exposure = 116,651,726 + 18,500,000 = 135,151,726 · available = 250,000,000 − 135,151,726 = 114,848,274
const BASE = { creditLimitPaise: 250_000_000, openingOutstandingPaise: 80_000_000, unsettledOrdersPaise: 36_651_726, memoExposurePaise: 18_500_000, approvalThresholdPaise: 100_000_000 };

test('position without a prospective order', () => {
  const p = creditPosition(BASE);
  assert.equal(p.outstandingPaise, 116_651_726);
  assert.equal(p.exposurePaise, 135_151_726);
  assert.equal(p.availableCreditPaise, 114_848_274);
  assert.equal(p.orderAmountPaise, 0);
  assert.equal(p.projectedExposurePaise, 135_151_726);
  assert.equal(p.requiresApproval, false);
  assert.deepEqual(p.reasons, []);
  assert.equal(p.overLimit, false);
});

test('a ₹4,00,000 order fits: projected 175,151,726 ≤ limit, below the ₹10L threshold', () => {
  const p = creditPosition({ ...BASE, orderAmountPaise: 40_000_000 });
  assert.equal(p.projectedExposurePaise, 175_151_726);
  assert.deepEqual(p.reasons, []);
  assert.equal(p.requiresApproval, false);
});

test('CREDIT_LIMIT boundary: projected exactly at the limit passes; one paisa more trips', () => {
  const at = creditPosition({ ...BASE, approvalThresholdPaise: null, orderAmountPaise: 114_848_274 });
  assert.equal(at.projectedExposurePaise, 250_000_000);
  assert.deepEqual(at.reasons, []);
  const over = creditPosition({ ...BASE, approvalThresholdPaise: null, orderAmountPaise: 114_848_275 });
  assert.equal(over.projectedExposurePaise, 250_000_001);
  assert.deepEqual(over.reasons, ['CREDIT_LIMIT']);
  assert.equal(over.requiresApproval, true);
});

test('ORDER_THRESHOLD boundary: equal to the threshold trips; one paisa less does not', () => {
  const big = { ...BASE, creditLimitPaise: 0 }; // limit 0 = no credit limit
  assert.deepEqual(creditPosition({ ...big, orderAmountPaise: 100_000_000 }).reasons, ['ORDER_THRESHOLD']);
  assert.deepEqual(creditPosition({ ...big, orderAmountPaise: 99_999_999 }).reasons, []);
  assert.deepEqual(creditPosition({ ...big, approvalThresholdPaise: null, orderAmountPaise: 9_000_000_000 }).reasons, [], 'no threshold set → never');
});

test('both rules, fixed order; limit 0 means no limit; available clamps at 0 when over', () => {
  // 4 × Rajwada Bridal Set ≈ ₹62L: over the limit and over the threshold
  const p = creditPosition({ ...BASE, orderAmountPaise: 620_000_000 });
  assert.deepEqual(p.reasons, ['CREDIT_LIMIT', 'ORDER_THRESHOLD']);
  // already over the limit: available clamps to 0, overLimit true, any order trips CREDIT_LIMIT
  const over = creditPosition({ ...BASE, creditLimitPaise: 100_000_000 });
  assert.equal(over.availableCreditPaise, 0);
  assert.equal(over.overLimit, true);
  assert.deepEqual(over.reasons, ['CREDIT_LIMIT']);
  const none = creditPosition({ ...BASE, creditLimitPaise: 0, orderAmountPaise: 1 });
  assert.equal(none.availableCreditPaise, null, 'no limit → unknown/unlimited, never ₹0');
  assert.equal(none.overLimit, false);
  assert.deepEqual(none.reasons, []);
});

test('rejects non-integer or negative money', () => {
  assert.throws(() => creditPosition({ ...BASE, orderAmountPaise: 10.5 }), /integer/);
  assert.throws(() => creditPosition({ ...BASE, memoExposurePaise: -1 }), /integer/);
});
