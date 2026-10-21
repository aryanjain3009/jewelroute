/* Bearer capabilities that travel in URLs must never reach a log line (audit review M2): the retailer ack token
 * (`/public/memo-ack/:token`, web `/ack/:token`), the demo receiver token (`/dev/webhook-receiver/:token`) and
 * any `token` / `code` / `refreshToken` / `secret` query parameter. Used by the pino-http serializer and the error filter. */
const PATH_TOKEN = /(\/(?:memo-ack|ack|webhook-receiver)\/)[^/?#]+/gi;
const QUERY_TOKEN = /([?&](?:token|code|refreshToken|secret)=)[^&#]*/gi;

export function redactUrl(url: string): string {
  return String(url ?? '').replace(PATH_TOKEN, '$1[redacted]').replace(QUERY_TOKEN, '$1[redacted]');
}
