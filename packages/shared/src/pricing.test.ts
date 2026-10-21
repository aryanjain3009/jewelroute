import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceDesign, orderTotals, formatINRCompact, distanceM, geofenceDecision, memoDisplayStatus } from './index';
test('22K bangle priced from rate', () => {
  const p = priceDesign({ netWeightMg: 24500, ratePaisePerGram: 721500, makingChargeType: 'PER_GRAM', makingChargeValue: 45000, stoneValuePaise: 0 });
  assert.equal(p.goldValuePaise, 17676750); // 24.5 g * ₹7215
  assert.equal(p.makingPaise, 1102500);
  assert.equal(p.unitPricePaise, 18779250);
});
test('percent making', () => {
  const p = priceDesign({ netWeightMg: 10000, ratePaisePerGram: 600000, makingChargeType: 'PERCENT', makingChargeValue: 1200, stoneValuePaise: 500000, otherComponents: [{ label: 'Enamel', valuePaise: 10000 }] });
  assert.equal(p.makingPaise, 720000);
  assert.equal(p.unitPricePaise, 6000000 + 720000 + 500000 + 10000);
});
test('totals and format', () => {
  assert.deepEqual(orderTotals([100000, 200000]), { subtotalPaise: 300000, gstPaise: 9000, totalPaise: 309000 });
  assert.equal(formatINRCompact(149000000), '₹14.9L');
});
test('geo', () => {
  const d = distanceM(28.6519, 77.1909, 28.6522, 77.1911);
  assert.ok(d > 30 && d < 45, String(d));
  assert.equal(geofenceDecision(120, 100, 30).inside, true);
  assert.equal(geofenceDecision(200, 100, 500).inside, false);
  assert.equal(memoDisplayStatus('ACTIVE', '2026-10-20', '2026-10-21'), 'OVERDUE');
  assert.equal(memoDisplayStatus('ACTIVE', '2026-10-22', '2026-10-21'), 'DUE_SOON');
});
