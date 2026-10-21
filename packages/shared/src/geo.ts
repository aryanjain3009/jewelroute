/** Haversine distance in metres. */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371008.8, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** Accuracy slack is capped so a wildly inaccurate fix cannot widen the fence. */
export const ACCURACY_SLACK_CAP_M = 50;
export const LOW_ACCURACY_THRESHOLD_M = 75;
export function geofenceDecision(distance: number, radiusM: number, accuracyM: number) {
  const slack = Math.min(Math.max(accuracyM || 0, 0), ACCURACY_SLACK_CAP_M);
  const inside = distance <= radiusM + slack;
  return { inside, verification: inside ? (accuracyM > LOW_ACCURACY_THRESHOLD_M ? 'LOW_ACCURACY' : 'VERIFIED') : null } as const;
}
