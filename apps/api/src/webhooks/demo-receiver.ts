/**
 * Whether the built-in demo webhook receiver (`POST /v1/dev/webhook-receiver/:token`) answers.
 * `ENABLE_DEMO_RECEIVER=true|false` decides when set. Unset: on outside production; in production
 * only for endpoints whose tenant is in demo mode (the hosted demo tenant). Otherwise the route is a 404.
 */
export function demoReceiverEnabled(o: { flag: string | undefined; nodeEnv: string; demoMode: boolean }): boolean {
  if (o.flag === 'false') return false;
  if (o.flag === 'true') return true;
  return o.nodeEnv !== 'production' || o.demoMode;
}
