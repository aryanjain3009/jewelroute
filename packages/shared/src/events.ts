export const WEBHOOK_EVENT_TYPES = [
  'visit.checked_in', 'visit.completed', 'visit.proof_uploaded',
  'order.created', 'order.approved', 'order.rejected',
  'memo.created', 'memo.extended', 'memo.returned', 'memo.converted', 'memo.overdue',
  'sample.custody_changed',
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number] | 'ping';
export const EVENT_DESCRIPTIONS: Record<WebhookEventType, string> = {
  'visit.checked_in': 'An agent checked in at a retailer inside the geofence',
  'visit.completed': 'A visit was completed',
  'visit.proof_uploaded': 'A visit proof photo was attached',
  'order.created': 'An order was booked during a visit',
  'order.approved': 'A manager approved an order',
  'order.rejected': 'A manager rejected an order',
  'memo.created': 'Samples were left with a retailer on memo',
  'memo.extended': 'A memo due date was extended',
  'memo.returned': 'Some or all memo samples came back',
  'memo.converted': 'Memo samples were sold to the retailer (an order was created from them)',
  'memo.overdue': 'A memo passed its due date with samples still outside',
  'sample.custody_changed': 'A physical sample changed custodian',
  ping: 'Test event sent from the Integrations page',
};
