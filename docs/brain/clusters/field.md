# Cluster: field (tier T2; check-in and proof integrity are T3)

## Owned paths
- `apps/api/src/modules/visits.ts`: today, visit detail, geofence-check, check-in, proofs, notes, complete, field catalog/profile
- `apps/api/src/modules/uploads.ts`: proof token, direct upload, `GET /v1/files/:id`
- `packages/shared/src/geo.ts` (`distanceM`, `geofenceDecision`), `packages/shared/src/dates.ts` (`istDate`)
- assignments in `apps/api/src/modules/admin.ts` (`POST/DELETE /v1/admin/assignments`)
- `apps/web/src/app/field/**`, `apps/web/src/components/field/**`, `apps/web/src/hooks/use-geolocation*`
- SQL: `Visit_one_open_per_agent`, `Visit_one_shop_per_day` (non-cancelled), UNIQUE `VisitProof(visitId,checksumSha256)`, `Shop_geo`

## Invariants
- INV-3 one open (CHECKED_IN/ACTIVE) visit per agent. Check-in only when `distance ≤ radius + min(accuracy, 50 m)`, computed on the server (tests 1, 1b, 2)
- One shop has at most one non-cancelled visit per tenant and business date, regardless of agent (test 0)
- INV-5 check-in and proofs are idempotent
- INV-6 an agent sees only their own visits
- Simulated GPS only when `tenant.demoMode`, stored as `SIMULATED`, never upgraded to VERIFIED
- EXIF is never trusted. The proof checksum is sha256 on the server in direct mode. Blob-mode proofs are trusted by URL⇄pathname match: **known gap**, no server re-hash.

## State machine
Visit: PLANNED → CHECKED_IN → ACTIVE (first proof) → COMPLETED (needs ≥1 proof, else `409 PROOF_REQUIRED`) · PLANNED → MISSED | CANCELLED. Check-in only on the planned IST date (`409 VISIT_NOT_TODAY`).
Selling on a visit (orders, memos, memo return/convert) needs ≥1 proof: `VisitsService.requireProof` → `409 PROOF_REQUIRED_BEFORE_SALE`; `resume.canSell = open && proofs > 0` (tests 1c, F5, F14).

## Consequential
Geofence maths or slack, accuracy handling, the simulated-GPS gate, proof trust (checksum, size ≤ 8 MB blob / 4 MB direct), visit status transitions, `plannedDate` and IST handling.

## Verification gate
`pnpm --filter @jewelroute/api test` (tests 1, 1b, 2, 9), `pnpm verify`. UI: the `ui-verify` skill at 390 px for every `/field` screen touched (sticky bottom action, 44 px targets).
