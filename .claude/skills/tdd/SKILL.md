---
name: tdd
description: Use when changing behaviour in apps/api or packages/shared — a new endpoint, a rule, a state transition, a bug fix with a known cause — and the change must be proven by a test written first. Seams are the HTTP API on real Postgres (apps/api/test) and pure functions in packages/shared. Not for UI-only changes (ui-verify) or for finding an unknown cause (diagnosing-bugs).
metadata:
  owner: Sushant6095
  last-verified: 2026-10-21
---

# tdd — red, green, refactor on real Postgres

## Done when
- A new or changed test failed on the old code (you saw the red output with the expected-vs-actual line), and passes now.
- `pnpm --filter @jewelroute/api test` (or `pnpm --filter @jewelroute/shared build && pnpm --filter @jewelroute/shared test`) exits 0 with the test count increased by the tests you added.
- For a stateful rule, the test asserts **database rows** (via `db.<model>` from `test/harness.ts`) and audit/outbox rows, not just the HTTP status.

## Gotchas
- **Never mock Postgres** for custody, memos, orders, rates, idempotency or tenancy. The bugs live in locks, unique indexes and transactions. `test/harness.ts` migrates and seeds `jewelroute_test`, boots `dist/main.js` on :4107 and gives you `api(token, method, path, body, headers)`.
- `pnpm --filter @jewelroute/api test` compiles `dist` first (`tsc -p tsconfig.build.json`). A type error shows up as a test-run failure, so read the top of the output.
- Tests run serially and share the seeded tenant `aurum`. Make your test independent: create its own visit, piece or memo, or pick seed data no other test mutates. Never depend on test order.
- **Expected values come from worked examples, not from calling the function under test.** Write `33517200`, not `priceDesign(...)`.
- **Concurrency rules need concurrency tests.** Fire N identical or conflicting requests with `Promise.all` and assert that exactly one effect happened (row count, `custodySeq`, outbox count). See tests 1, 3, 4.
- Idempotency: the same `Idempotency-Key` + same body → same response (`deepStrictEqual`, L0006); same key + other body → 422 `IDEMPOTENCY_KEY_REUSED`.
- Tenancy: every new read or write endpoint gets a cross-tenant or cross-agent case → 404 (test 6 pattern).
- Never `test.skip`, `.only` or loosen an assertion to go green. If the test is wrong, say why in the commit message.
- Dates: business dates are IST. Build them with `istDate` from `@jewelroute/shared`, never `new Date().toISOString().slice(0,10)`.

## Steps
1. **Pick the seam.** Pure maths or formatting → `packages/shared/src/*.test.ts` (node:test, compiled to `dist/*.test.js`). Anything that touches the DB or HTTP → `apps/api/test/api.test.ts` (add the next number: `test('10. …')`).
2. **Write the test from the spec's Acceptance line.** Arrange with real API calls or `db` setup, act through HTTP, then assert the HTTP status, the response `code`, and the DB postconditions:
   ```ts
   test('10. second approve of an order → 409, one audit row', async () => {
     const r1 = await api(admin, 'POST', `/v1/admin/orders/${id}/approve`);
     const r2 = await api(admin, 'POST', `/v1/admin/orders/${id}/approve`);
     assert.equal(r1.status, 200);
     assert.equal(r2.status, 409);
     assert.equal(r2.error.code, 'ORDER_ALREADY_DECIDED');
     assert.equal(await db.auditLog.count({ where: { entityId: id, action: 'order.approve' } }), 1);
   });
   ```
   (`api()` returns `{ status, json, data, error }`; `login(email, password)` returns a token. Seed users are in `README.md`.)
3. **Run it red:** `pnpm --filter @jewelroute/api test 2>&1 | tail -40`. Confirm that it fails for the **right reason** (the assertion you wrote, not a typo or a boot error). Paste the red lines into `progress.md` for T3 tasks.
4. **Make it green** with the smallest change in the right layer: a SQL guard (new migration, `write-migration` skill) for invariants, the service for rules, the controller for shape and validation.
5. **Run the package's full suite**, not just your test. Then `pnpm --filter @jewelroute/api typecheck`.
6. **Refactor** only while green. Re-run.
7. If the contract changed, update `docs/CONTRACT.md` (Changelog line with the date) in the same change.

## Related
- Money maths: `money-math`. Schema guards: `write-migration`. Unknown cause: `diagnosing-bugs` first.
