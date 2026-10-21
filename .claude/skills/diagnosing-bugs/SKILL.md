---
name: diagnosing-bugs
description: Use when something in JewelRoute fails and the cause is not yet known — a red test, a 500, a wrong total, a piece with the wrong custodian, a duplicate order, a webhook stuck in FAILED, a page showing stale data — or when the same fix attempt failed twice. Builds a reproduction loop first, then narrows by evidence. Not for implementing a known fix (tdd).
metadata:
  owner: Sushant6095
  last-verified: 2026-10-21
---

# diagnosing-bugs — reproduce, then narrow, then prove

## Done when
- A **reproduction** exists that fails on demand: a numbered test in `apps/api/test/api.test.ts`, a `packages/shared` test, a curl sequence, or a SQL query that shows the bad state.
- The root cause is stated as `file:line` + mechanism ("`memos.ts:158` return path reads pieces without `FOR UPDATE`, so two returns both pass the OUT check"), backed by evidence you observed. Not "probably".
- The fix is handed to `tdd` (the repro becomes the red test). After the fix, the repro passes and `pnpm verify` is green.
- If the lesson generalises, a `/remember` entry is proposed with the evidence.

## Gotchas
- **Two-strike rule:** if the same error survived two fix attempts, stop editing. Go back to step 1. Guessing a third time is how invariants get "fixed" away.
- Never weaken a CHECK, unique index, trigger or test to make an error disappear. Those errors are usually the system working: find who tried to violate them.
- Prisma error `P2002` = unique violation (often the intended race guard, e.g. `Visit_one_open_per_agent` → should map to `409 ANOTHER_VISIT_OPEN`). `check_violation` raised by `jr_forbid_mutation` = something tried to UPDATE or DELETE an append-only row.
- The API test run compiles `dist` first. A TypeScript error looks like "API did not start" or a missing export. Read the top of the output, not the tail.
- Web "stale data" bugs are almost always a missing invalidation key (`.claude/rules/web.md` table) or a different key shape (`["orders", status]` vs `["orders"]`), not an API bug. Check the Network tab via Playwright MCP before touching the API.
- Hosted DB issues cannot be reproduced against Neon from here (L0002). Reproduce on local data, or ask the human for API responses (never for credentials).
- Never print `.env` values while debugging. Print variable *names* or a boolean (`node -e 'console.log(!!process.env.X)'`).

## Reproduction recipes
- **Concurrency** (double check-in, double memo, duplicate order): copy test 1, 3 or 4. `Promise.all` N identical requests, then count rows.
- **Custody state:** `psql -h 127.0.0.1 -U postgres jewelroute_test -c 'SELECT p."tagCode", p."custodianType", p."custodySeq", max(e.seq) FROM "SamplePiece" p JOIN "CustodyEvent" e ON e."pieceId"=p.id GROUP BY 1,2,3 HAVING p."custodySeq" <> max(e.seq);'` (should return 0 rows), and `SELECT "pieceId", count(*) FROM "MemoItem" WHERE status='OUT' GROUP BY 1 HAVING count(*)>1;`
- **Pricing:** write the hand-computed expected values (`money-math` step 1) and diff them against `priceDesign` output field by field.
- **Webhooks:** `SELECT status, attempts, "nextAttemptAt", "lastStatusCode", "lastError" FROM "WebhookDelivery" ORDER BY "createdAt" DESC LIMIT 10;` then trigger `POST /v1/internal/dispatch` with the `x-cron-secret` header (test harness `dispatch()`).
- **Geofence:** compute with `distanceM`/`geofenceDecision` from `@jewelroute/shared` in a one-off `node -e` against the shop's lat/lng. Test 2 uses `north(lat, metres)` to place a fix outside.
- **IST date bugs:** run the failing code with `TZ=UTC` and `TZ=Asia/Kolkata` and compare. Business dates must come from `istDate`.
- **UI:** `ui-verify` screenshots + `browser_network_requests` to see which `/api/v1/...` calls fired after the mutation.

## Steps
1. **State the symptom precisely:** expected vs actual, the exact error code or message, the request, the tenant/user (seed users only).
2. **Build the loop** (recipes above). Run it twice to confirm that it fails deterministically. Flaky → make it deterministic first (fix the time, isolate data, serialise).
3. **Form 2–3 hypotheses** ranked by evidence. For each, name the observation that would kill it.
4. **Narrow** with the cheapest discriminating check: add a temporary log (never of secrets), query the DB state between steps, `git log -p -S'<symbol>'` for when the behaviour changed, `git bisect run <repro>` if it used to work.
5. **Confirm the mechanism** by predicting a new observation and seeing it ("if the lock is missing, 5 parallel returns create 2 events" → see 2).
6. Remove the temporary logging. Hand off to `tdd` with the repro as the red test.
7. Report: symptom → repro → cause (`file:line`, mechanism) → fix commit → evidence (commands + exit codes).

## Related
- Hand-off: `tdd` (repro → red test). Record: `/remember`.
