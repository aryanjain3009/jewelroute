export const WEBHOOK_EVENT_TYPES = [
  'visit.checked_in', 'visit.completed', 'visit.proof_uploaded',
  'order.created', 'order.confirmed', 'order.pending_approval', 'order.approved', 'order.rejected', 'order.settled', 'order.cancelled',
  'memo.created', 'memo.extended', 'memo.returned', 'memo.converted', 'memo.overdue', 'memo.acknowledged',
  'sample.custody_changed',
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number] | 'ping';
export const EVENT_DESCRIPTIONS: Record<WebhookEventType, string> = {
  'visit.checked_in': 'An agent checked in at a retailer inside the geofence',
  'visit.completed': 'A visit was completed',
  'visit.proof_uploaded': 'A visit proof photo was attached',
  'order.created': 'An order was booked during a visit',
  'order.confirmed': 'An order was confirmed without approval (no rule tripped) — counts towards the retailer outstanding',
  'order.pending_approval': 'An order tripped an approval rule (credit limit or order threshold) and waits for a manager',
  'order.approved': 'A manager approved an order that was pending approval',
  'order.rejected': 'A manager rejected an order that was pending approval',
  'order.settled': 'An order was marked paid/settled — it no longer counts towards the retailer outstanding',
  'order.cancelled': 'A confirmed or pending order was cancelled',
  'memo.created': 'Samples were left with a retailer on memo',
  'memo.extended': 'A memo due date was extended',
  'memo.returned': 'Some or all memo samples came back',
  'memo.converted': 'Memo samples were sold to the retailer (an order was created from them)',
  'memo.overdue': 'A memo passed its due date with samples still outside',
  'memo.acknowledged': 'The retailer acknowledged receiving the memo samples (QR confirm or code read out to the agent)',
  'sample.custody_changed': 'A physical sample changed custodian',
  ping: 'Test event sent from the Integrations page',
};
