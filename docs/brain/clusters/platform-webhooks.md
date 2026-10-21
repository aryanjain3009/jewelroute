# Cluster: platform-webhooks (tier T3)

## Owned paths
- `apps/api/src/webhooks/**`: `dispatcher.ts` (claim with `FOR UPDATE SKIP LOCKED`, 30 s lease, `BACKOFF_SECONDS`, `MAX_ATTEMPTS`), `webhooks.module.ts`
- `apps/api/src/core/outbox.ts` (`OutboxService.emit`, `activityTitle`), `core/idempotency.ts`, `core/audit.ts`
- `apps/api/src/common/**`: auth (JWT, `ROLE_PERMISSIONS`, guards), context, crypto (AES-256-GCM secrets, HMAC signing, ack code), errors, http (zod `parse`, envelope, exception filter)
- `apps/api/src/modules/auth.ts`, `apps/api/src/{app,main,serverless,env,prisma.service}.ts`, `apps/api/api/index.ts`, `apps/api/vercel.json`
- `apps/api/prisma/**`: schema, migrations, seed entry · `apps/api/scripts/**` · `.github/workflows/**` · `docker-compose.yml`
- `packages/shared/src/events.ts` (event catalogue)
- web: `apps/web/src/app/admin/settings/**` (integrations), `apps/web/src/app/developers/**`

## Invariants
- INV-5 idempotency row inserted first inside the business transaction; errors roll it back; replays are deep-equal (L0006)
- INV-6 tenant only from the verified JWT
- INV-8 outbox row in the same transaction as the change. Delivery is at-least-once: 1 attempt + 6 retries (30s, 2m, 10m, 30m, 2h, 6h), then DEAD (L0004). Signature `sha256=HMAC(secret, "${ts}.${rawBody}")`. Every attempt stores the request headers sent, never the secret.
- Endpoint secrets are encrypted at rest. Reveal and rotate are audited.
- Auth: 15 min access JWT, 30 d rotating refresh stored hashed; reuse of a rotated token revokes the family.

## Consequential
Anything under `common/`, the outbox, dispatcher timing or claim SQL, signing, secret storage, token lifetimes, rate limits, CORS and cookies, migrations (`.claude/rules/migrations.md`), the Vercel build (`migrate-on-vercel.cjs`, `includeFiles`), CI.

## Verification gate
`pnpm --filter @jewelroute/api test` (tests 3, 6, 7), `pnpm verify`. For migrations, also `migration-reviewer` APPROVE. Hosted DB changes happen only through the Vercel build (L0002).
