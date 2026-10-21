const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** ₹1,48,500 */
export const formatINR = (paise: number, exact = false) => (exact ? inr2 : inr).format(paise / 100);
/** ₹14.9L / ₹1.2Cr / ₹48.5K — the compact Indian style used in feeds and metrics. */
export function formatINRCompact(paise: number): string {
  const r = paise / 100;
  const abs = Math.abs(r);
  const f = (n: number) => (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)).replace(/\.0+$|(\.\d*[1-9])0+$/, '$1');
  if (abs >= 1e7) return `₹${f(r / 1e7)}Cr`;
  if (abs >= 1e5) return `₹${f(r / 1e5)}L`;
  if (abs >= 1e3) return `₹${f(r / 1e3)}K`;
  return `₹${Math.round(r)}`;
}
/** 12.450 g */
export const formatGrams = (mg: number, digits = 2) => `${(mg / 1000).toFixed(digits)} g`;
export const PURITY_LABEL: Record<string, string> = { K24: '24K', K22: '22K', K18: '18K', K14: '14K' };
const group = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
/** Exact rupees from integer paise: ₹10,612.50, ₹10,800 (paise shown only when non-zero), −₹187.50. */
export function formatRupees(paise: number): string {
  const a = Math.abs(Math.trunc(paise));
  const p = a % 100;
  const r = (a - p) / 100; // exact: no float division of money
  return `${paise < 0 ? '−' : ''}₹${group.format(r)}${p ? `.${String(p).padStart(2, '0')}` : ''}`;
}
/** Rate display: ₹7,215/g, ₹10,612.50/g — never rounds away the paise of a stored rate. */
export const formatRate = (paisePerGram: number) => `${formatRupees(paisePerGram)}/g`;
/** Signed change between two rates: +₹72.50, −₹187.50, ₹0. */
export const formatRateDelta = (deltaPaise: number) => (deltaPaise > 0 ? `+${formatRupees(deltaPaise)}` : formatRupees(deltaPaise));
/** "10,612.50" → 1061250 paise without floats. Up to 2 decimals, non-negative; anything else → null. */
export function parseRupeesToPaise(input: string): number | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim().replace(/,/g, ''));
  if (!m) return null;
  const n = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(n) ? n : null;
}
