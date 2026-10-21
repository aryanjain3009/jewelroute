// Integrations (webhooks) response shapes from docs/CONTRACT.md (Admin → Integrations).

export interface EventType { type: string; description: string; example?: unknown }
export interface WebhookEndpoint { id: string; url: string; description?: string; events: string[]; active: boolean; secretLast4: string; createdAt: string; stats: { succeeded24h: number; failed24h: number } }
export type DeliveryStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "DEAD";
export interface Delivery {
  id: string; endpointId: string; eventId: string; eventType: string; status: DeliveryStatus; attempts: number;
  lastStatusCode?: number | null; lastLatencyMs?: number | null; lastError?: string | null; nextAttemptAt?: string | null; deliveredAt?: string | null; createdAt: string;
}
export interface DeliveryAttempt { attemptNo?: number; attempt?: number; statusCode?: number | null; latencyMs?: number | null; error?: string | null; responseBody?: string | null; at?: string; createdAt?: string; requestHeaders?: Record<string, string> }
export interface DeliveryDetail extends Delivery { attemptLog: DeliveryAttempt[]; payload: unknown; requestHeaders?: Record<string, string>; url?: string }
export interface ReceivedWebhook { id: string; endpointId?: string; eventType?: string; type?: string; deliveryId?: string; eventId?: string; signatureOk?: boolean; signatureValid?: boolean; verified?: boolean; headers?: Record<string, string>; receivedAt?: string; createdAt?: string; payload?: unknown; body?: unknown }

