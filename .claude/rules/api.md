---
paths:
  - "apps/api/**"
---
# apps/api — read first

Before your first edit under `apps/api/`, read `apps/api/AGENTS.md`. Claude Code does not load it on its own while a root `CLAUDE.md` exists.

- Route changes update `docs/CONTRACT.md` in the same change.
- Never call `$queryRawUnsafe` or `$executeRawUnsafe` with input. Never take `tenantId` from the body, query or headers.
- Never log request bodies, tokens, webhook secrets or `.env` values. Logs carry the request id.
- A NestJS provider, decorator, route handler or outbox event type with zero callers is **not** proof that it is unused. Check module `providers` arrays, decorators, `EVENT_DESCRIPTIONS` and `docs/CONTRACT.md` before you delete anything.
