/** Business date (YYYY-MM-DD) in Asia/Kolkata. */
export function istDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
export function addDays(ymd: string, days: number): string {
  const t = new Date(`${ymd}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + days); return t.toISOString().slice(0, 10);
}
export function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / 86400000);
}
export const DUE_SOON_DAYS = 2;
export type MemoDisplayStatus = 'ACTIVE' | 'DUE_SOON' | 'OVERDUE' | 'PARTIALLY_RETURNED' | 'RETURNED' | 'CONVERTED_TO_ORDER';
export function memoDisplayStatus(status: string, dueDate: string, today = istDate()): MemoDisplayStatus {
  if (status === 'RETURNED' || status === 'CONVERTED_TO_ORDER') return status;
  const d = daysBetween(today, dueDate);
  if (d < 0) return 'OVERDUE';
  if (d <= DUE_SOON_DAYS) return 'DUE_SOON';
  return status === 'PARTIALLY_RETURNED' ? 'PARTIALLY_RETURNED' : 'ACTIVE';
}
