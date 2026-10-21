import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRate, formatRateDelta, formatRupees, parseRupeesToPaise } from './format';

test('formatRate shows paise only when non-zero (₹10,612.50/g, ₹10,800/g)', () => {
  assert.equal(formatRate(1_061_250), '₹10,612.50/g');
  assert.equal(formatRate(1_080_000), '₹10,800/g');
  assert.equal(formatRate(1_061_205), '₹10,612.05/g');
  assert.equal(formatRate(72_15_00), '₹7,215/g');
  assert.equal(formatRate(1_23_45_678_90), '₹1,23,45,678.90/g', 'Indian grouping');
  assert.equal(formatRate(5), '₹0.05/g');
});

test('formatRupees is exact for integer paise', () => {
  assert.equal(formatRupees(0), '₹0');
  assert.equal(formatRupees(7250), '₹72.50');
  assert.equal(formatRupees(-18750), '−₹187.50');
});

test('formatRateDelta keeps the paise of a change (+₹72.50, −₹187.50)', () => {
  assert.equal(formatRateDelta(7_250), '+₹72.50');
  assert.equal(formatRateDelta(-18_750), '−₹187.50');
  assert.equal(formatRateDelta(18_800), '+₹188');
  assert.equal(formatRateDelta(0), '₹0');
});

test('parseRupeesToPaise parses a typed rupee amount without floats', () => {
  assert.equal(parseRupeesToPaise('10612.50'), 1_061_250);
  assert.equal(parseRupeesToPaise('10,612.5'), 1_061_250);
  assert.equal(parseRupeesToPaise(' 10800 '), 1_080_000);
  assert.equal(parseRupeesToPaise('0.29'), 29, '0.29 * 100 is 28.999… in floats');
  assert.equal(parseRupeesToPaise('1.005'), null, 'more than 2 decimals is rejected');
  assert.equal(parseRupeesToPaise('abc'), null);
  assert.equal(parseRupeesToPaise(''), null);
  assert.equal(parseRupeesToPaise('-5'), null);
});
