# T3 review: final backend audit, API changes (`bd41191..248a537`, `apps/api` + `packages/shared`)

- **Verdict: REJECT.** No invariant (INV-1..8) is broken, the gates are green and most fixes hold up under attack. The rejection rests on two must-fix **major** issues. M1: the refresh grace window lets anyone holding a just-rotated token mint unlimited independent sessions and never trips the theft signal (demonstrated). M2: the memo-ack bearer token is still written in plain text to every request log line, which leaves the B2 "only hashes at rest" fix incomplete (pre-existing, but it is exactly the property B2 claims). M3 (unsound `AGENT_DEVICE` heuristic) needs evidence from a preview deployment or a redesign before `ACK_SELF_SUSPECTED` is shown to admins. There are 10 minors.
- **Reviewer:** an independent pass covering the verifier, invariant-reviewer, security-reviewer and migration-reviewer roles, run with fresh context. The default verdict was REJECT. No source file was edited.
- **Scope:** the 13 commits in `git log bd41191..HEAD -- apps/api packages/shared` (`0ec71ca` … `ee17a77`). `docs/AUDIT-SYNC.md` was taken as the statement of intent. Tree: `248a537`.
- **Date:** 21 Oct 2026, about 9:40 pm IST.
- **Scratch work:** I used the DB `jr_review_test` and an API on :4231 with `WEBHOOK_ALLOW_PRIVATE` unset. Both were dropped or stopped afterwards (`DROP DATABASE` exit 0, and :4231 health returned 000). I did not touch :3000, :4000 or the `jewelroute` DB.

## Receipts

| # | Command | Exit | Result |
|---|---|---|---|
| R1 | `cd apps/api && npx tsc -p tsconfig.build.json` | 0 | — |
| R2 | `TEST_PORT=4231 TEST_DATABASE_URL=…/jr_review_test node --import tsx --test --test-concurrency=1 test/*.test.ts` | 0 | **73/73 pass**, 15 suites, 0 skipped (A1–A19, E1–E3, V11 rollback included) |
| R3 | `prisma migrate diff --from-url jr_review_test --to-schema-datamodel prisma/schema.prisma --exit-code` | 0 | `No difference detected.` Both new CHECKs show `convalidated = t` |
| R4 | `git diff --name-status bd41191..HEAD -- prisma/migrations prisma/migration_lock.toml` | 0 | Only `A` for 0900 and 1000. Both are newer than every existing folder, and the lock file is untouched |
| R5 | Egress probe (`node --import tsx scratchpad/egress-probe.ts`, which imports `src/webhooks/egress.ts`) | 0 | Blocked: decimal (`2130706433`), hex (`0x7f.0.0.1`), octal (`0177.0.0.1`), short (`127.1`), `[::ffff:127.0.0.1]`, `[::ffff:a9fe:a9fe]`, `localhost`, `64:ff9b::a9fe:a9fe`, `fd00::1`, `fe80::1`, `100.100.100.200`, ftp and userinfo. **Allowed:** `2002:7f00:1::`, `2002:a9fe:a9fe::`, `64:ff9b:1::a9fe:a9fe`, Teredo `2001:0:…`, `100::1`, and any port on a public IP. `postWebhook('http://localhost:1/')` and `postWebhook('http://[::ffff:7f00:1]:1/')` were refused at connect time |
| R6 | `POST /v1/admin/webhooks` on :4231 | — | 422 `WEBHOOK_URL_FORBIDDEN` for `2130706433:5432`, `[::ffff:7f00:1]:5432` and `localhost:5432`. **201** for `http://127.0.0.1:4231/v1/dev/webhook-receiver/../../internal/dispatch`. Its `/test` delivery POSTed to `/v1/internal/dispatch`, and the stored attempt body is `INVALID_CRON_SECRET` (m1) |
| R7 | Auth probe (`scratchpad/auth-probe.ts` against :4231). Rahul logs in, rotates r1 → r2 as `Victim/1`, then `Attacker/9` replays r1 eight times within 30 s | 0 | **8/8 → 200, 8 distinct refresh tokens, 9 live tokens for the user.** The attacker then chains a minted token (200), and the victim's next refresh is also 200, so no theft signal is ever raised (M1) |
| R8 | Same probe: gold-rate with key K replayed, other body, other route | 0 | Replay 201 with no second row. Other body → 422 `IDEMPOTENCY_KEY_REUSED`. Same key on `POST /admin/shops` → 422. `curl` shop create ×2 with one key → 201 201 and 1 row. Replayed JSON is semantically equal but has jsonb-reordered keys (info) |

## Role checklists (summary)

- **Invariants (INV-1..8):** all PASS.
  - INV-5: the new optional-key creates (`admin.ts` intake, `setRate`, `createShop`; `visits.ts` `addNote`) all run inside `IdempotencyService.run`. The key row is in the business transaction and is scoped by tenant, user (`idempotency.ts:78`) and path, via a fingerprint of method, path and body. A18 shows the due-date check now runs after a replay and that a 400 leaves no key row.
  - INV-6: the new queries filter on `tid`: `auth.ts` guard `findFirst({id, tenantId, active})`, `selfAckSignal`, and the attention query.
  - INV-8: a blocked attempt counts as a failed attempt and follows the retry ladder (E2/E3).
  - No custody, price or snapshot path changed.
- **Migrations:** forward-only. The new columns are nullable or use constant defaults (metadata-only on PG ≥ 11). The CHECKs go in `NOT VALID` and are then validated. The rollback script exists and is exercised by V11. It is a one-way door for the evidence data only (stated in the script). See m5 and m6.
- **Security:**
  - Item 8 (refresh reuse revokes the family) is **weakened**: M1.
  - Item 9 (no tokens in logs): **FAIL**, M2, pre-existing.
  - Items 1–5 PASS. 401 `ACCOUNT_DISABLED` needs a validly signed token, so it is not an enumeration oracle.
  - Item 7: the SSRF guard is sound against DNS rebinding. The `lookup` validates the very addresses `net.connect` uses, including `autoSelectFamily` `all:true`. Redirects are never followed and the response is capped. Gaps are m1–m4.

## Findings

### M1 · major: the refresh grace window mints unlimited independent sessions and silences theft detection
`apps/api/src/modules/auth.ts:66` and `:75` (`inGrace` → `issueFor`, `:81`)

- **What happens:** any presentation of a rotated token within 30 s returns a brand-new refresh token. Nothing limits the count, nothing binds it to the device, and nothing links it to the successor.
- **Exploit (R7):** the attacker gets r1 at rotation time, for example from a shared or compromised machine, a proxy log or a browser extension. Replaying r1 within 30 s of the victim's rotation yields any number of 30-day tokens. The victim keeps refreshing normally, so nobody ever presents a token outside the window. The family is never revoked and the attacker's chain lives on indefinitely (the probe's chained refresh returned 200).
- **Before this change:** the same replay revoked every session.
- **Related race:** `revokeFamily` (`:88`) races a concurrent grace issuance. That issuance reads the row before the revocation and inserts its new token after it, so the new token survives.
- **Fix (keep the two-tab UX):**
  1. Allow **one** grace issuance per rotated token. Add a `graceUsedAt` column, or claim it with `updateMany where rotatedAt > now-30s AND graceUsedAt IS NULL`. A second grace use should be treated as theft.
  2. Require `userAgent` to equal the rotated row's `userAgent` (two tabs share it).
  3. Do the grace check and issuance in one transaction with the rotated row `FOR UPDATE`, so it serialises with `revokeFamily`.
- **Tests to add to A15:** a 3rd use within 30 s → 401 plus family revoked, and a different UA → 401.

### M2 · major (pre-existing; it undoes B2's claim): ack bearer tokens are logged in plain text
`apps/api/src/app.ts:87-88`

- **What happens:** pino-http auto-logs every request with `req.url`. That records `/v1/public/memo-ack/<token>` (GET and POST from every retailer and every probe) and `/v1/dev/webhook-receiver/<token>`.
- **Impact:** anyone who can read the logs can open the page within the 72 h TTL, see the 6-digit code and confirm receipt, which is custody evidence. B2 sealed the same capability in `IdempotencyKey`, but it still sits in the logs.
- **Fix:** in the `req` serializer, replace `/memo-ack/[^/?]+` and `/webhook-receiver/[^/?]+` with `/…/[redacted]`, and add a test that captures a log line.

### M3 · major (needs evidence before admins see it): the `AGENT_DEVICE` heuristic is unsound in the deployed topology
`apps/api/src/modules/memos.ts:475`, `apps/api/src/common/auth.ts:79-82`

- **Why it is unsound:**
  - Browsers reach the API only through the Next rewrite (`apps/web/next.config.ts:10`, `/api/:path*` → `API_ORIGIN`). On Vercel the API's edge sees the web project's egress, not the phone. `AUDIT-SYNC` itself says "users behind … the web proxy". In that case `req.ip` is identical for the agent and the retailer, so the signal reduces to a UA match.
  - Chrome on Android has sent a reduced, near-identical UA since Chrome 110 (`Linux; Android 10; K … Chrome/<major>.0.0.0 Mobile`).
- **Failure scenario:** any retailer on Android Chrome confirms within 15 min of the agent's last request. The memo is flagged `AGENT_DEVICE`, gets a medium `ACK_SELF_SUSPECTED` attention row, and the agent is falsely implicated. Shop Wi-Fi or carrier CGNAT produce the same result even when the IP is real.
- **Also affected:** if `req.ip` really is the proxy egress, the B5 throttle buckets are shared across all users. For example, 10 wrong logins/min for a known email lock out its owner everywhere. This is not a regression, but it is unverified.
- **Fix:**
  - Verify on a preview: log `req.ip` for two different phones through the web origin.
  - Until then, drop `AGENT_DEVICE`, or replace it with a device-bound signal, such as a long-lived random httpOnly `jr_dev` cookie set at login with its hash on `User`. The same-origin ack page carries that cookie even after the session expires.
  - Keep `AGENT_SESSION` and `CODE_VIEWED_ON_AGENT_DEVICE`, but key the latter on the session or device cookie as well.

### Minors

| # | Where | Problem | Fix |
|---|---|---|---|
| m1 | `webhooks/egress.ts:70` `isOwnReceiver` | It matches a raw-string prefix. `…/webhook-receiver/../../internal/dispatch` is exempt from the guard and is normalised by `new URL` to any path on the API's own origin (R6). If `API_PUBLIC_URL` is ever a private address (Docker or a private network), that whole origin bypasses the guard | Parse the URL. Compare `origin` and require the normalised `pathname` to match `^/v1/dev/webhook-receiver/[^/]+$`. Store the normalised `u.href` |
| m2 | `egress.ts:54-63` | 6to4 `2002::/16`, NAT64 local-use `64:ff9b:1::/48`, Teredo `2001::/32` and discard `100::/64` are allowed (R5). Reachability depends on host routes, but "unknown → blocked" is the stated rule | Block these prefixes, or decode the embedded IPv4 and apply `v4Blocked` |
| m3 | `env.ts:25` | `WEBHOOK_ALLOW_PRIVATE=true` is accepted with `NODE_ENV=production`, which silently turns the guard off | Refuse to boot (or ignore it) in production |
| m4 | `egress.ts:95,102,105,113` | The 422 and attempt-error messages echo the resolved address and whether a host resolves. That gives any tenant admin an internal DNS oracle (`db.internal resolves to 10.0.3.7`). `dns.promises.lookup` has no timeout | Return a generic message, log the detail server-side, and wrap the lookup in a timeout of about 3 s |
| m5 | `migrations/20261021000900…/migration.sql:6-16` | There is no `SET lock_timeout`. Every authenticated request now reads `User`, so an `ACCESS EXCLUSIVE` ALTER queued behind one long transaction stalls all authentication | Add `SET lock_timeout = '3s';` as the first statement (forward-only: put it in the next migration's convention or the deploy runbook) |
| m6 | `RefreshToken` (no index on `userId`) | Logout now runs a user-wide `updateMany` (`auth.ts:102`), as do `revokeFamily` and deactivation. All of them seq-scan a table that grows with every refresh, and grace mints add more rows. Nothing purges expired rows | Add a new migration with an index on `("userId") WHERE "revokedAt" IS NULL OR "rotatedAt" IS NOT NULL`. Add an expired-token purge to the cron sweep |
| m7 | `Memo.ackIp/ackUserAgent`, `AuditLog.after.userAgent`, `User.lastSeenIp/Ua` | Retailer IP and UA are personal data (DPDP 2023) and are kept forever. No retention rule exists | Null the evidence columns N days after `ackAt` (for example 90) and document this in `DECISIONS` |
| m8 | `auth.ts:96-103` logout | Logout on device A clears `rotatedAt` for **all** of the user's tokens. If device B rotated less than 30 s earlier and its second tab is mid-refresh, that tab falls through to `revokeFamily`, which signs out every device | Clear grace only for the logged-out token's own predecessor, or include this in the M1 redesign |
| m9 | `common/auth.ts:82` | `user.update` after `findFirst`: a user deleted between the two (for example a reseed) → P2025 → 500 instead of 401 | Use `updateMany({ where: { id, active: true } })` |
| m10 | `admin.ts:29-30` ShopFields | `ownerName`/`phone` trim but allow `""`, so create stores an empty string while PATCH `null` clears. The two representations of "none" differ | Add `.transform(v => v === '' ? null : v)` |

**Info:** idempotent replays return the stored jsonb with reordered keys, which is semantically identical (R8). Clients must not compare raw bytes.

## What would flip this to APPROVE
1. M1 is fixed (one grace issuance per rotated token, UA-bound, locked), with A15 extended.
2. M2 is fixed, with a log-redaction test.
3. M3 is either backed by preview evidence that `req.ip` is the device IP, or `AGENT_DEVICE` is removed or replaced with a device cookie. m1 and m3 should be fixed in the same pass, since each is a one-liner.

## Addendum: fixes for 03734d6 (backend auditor, 21 Oct 2026)

All test-first on `jewelroute_test` / :4107. Every new test was run red against stubs that kept the old behaviour, then green. Full API suite 77/77. `pnpm verify` ×2 is in the commit trail. No independent re-review yet, so the verdict stays REJECT until one is run.

| Finding | Fix | Commit | Test |
|---|---|---|---|
| M1 | One grace reuse per rotated token, same user agent, per-user advisory lock + row `FOR UPDATE`, returns the **same** successor (HMAC-derived plaintext; `successorId`, `graceUsedAt`). A 2nd reuse, another UA, reuse after 30 s or a logged-out token revokes every live token (committed) → 401. Family revocation, logout-all and deactivation take the same lock | `1fe6f56`, `d168cac` | A15: 8 sequential replays → `[200, 401×7]` with the same successor; a concurrent burst never yields two successors; another UA → theft |
| M2 | `redactUrl` (path tokens for memo-ack, ack and webhook-receiver; `token`/`code`/`refreshToken`/`secret` query params) in the pino-http req serializer and the 5xx error log | `193ad6e` | L1 (rules), L2 (captured stdout of a real server has no token) |
| M3 | Self-ack triggers are the agent's session or the `jr_dev` device cookie (httpOnly, Lax, 365 d, hash on the session row). IP/UA are evidence only. The guard no longer writes last-seen | `9d8b39f`, `d168cac` | A17: same IP + UA without cookies → not flagged; agent's `jr_dev` alone → `AGENT_DEVICE` |
| m1 | Own-receiver exemption = exact origin + `^/v1/dev/webhook-receiver/[A-Za-z0-9_-]{1,100}$`; no dot/encoded segments, query, fragment or credentials | `43fcaf2` | E1, E2 (`../../internal/dispatch`, `%2F` → 422) |
| m2 | Block 2002::/16, 64:ff9b:1::/48, 2001::/32, 100::/64 | `43fcaf2` | E1 |
| m3 | `allowPrivateFor`: ignored in production unless the tenant is in demo mode | `43fcaf2`, `34eb0eb` | E1 |
| m4 | Generic 422 / attempt message; detail only in the server log; 3 s DNS timeout | `43fcaf2` | E2 (no address in the message), E3 |
| m5 | `SET lock_timeout = '3s'` in 1100 and 1300 (applied migrations untouched) | `1fe6f56` | migrate deploy |
| m6 | `RefreshToken(userId)` index (CONCURRENTLY, own file); cron purge of tokens expired/revoked > 30 d | `1fe6f56`, `34eb0eb` | A20 |
| m7 | Cron clears `Memo.ackIp/ackUserAgent` 90 d after the ack (finding kept); UA no longer copied into audit; documented in DECISIONS | `34eb0eb`, `9d8b39f` | A20, A17 |
| m8 | Logout revokes only the presented session; new `POST /v1/auth/logout-all` | `d168cac` | A15 |
| m9 | The guard only reads (`findFirst` → 401), so a vanished user cannot cause P2025/500 | `d168cac` | A13 |
| m10 | Shop `ownerName`/`phone`: blank → null on create and PATCH | `d168cac` | A21 |

The rollback script `prisma/rollback/20261021000900_audit_down.sql` also removes 1100–1300 (V11). Still open (not code): preview evidence of what `req.ip` is behind the web rewrite. `TRUST_PROXY` must match the real hop count per deployment.

- Gate: `pnpm verify` ×2 PASSED on `0d71a40` (api 77/77). An earlier run on `d775db1` failed once in pre-existing test 7b (`500 !== 401`): an unordered lookup could pick test 7's `fail-` receiver. Fixed in `0d71a40` by pinning to the seeded `demo-` receiver; 3 isolated reruns + 2 gates green.

## Re-review (fixes `1fe6f56`…`a1b0f27`; tree `a1b0f27`; 21 Oct 2026, about 10:20 pm IST)

- **Verdict: APPROVE.** I confirmed with my own probes that M1, M2, M3 and m1, m2, m4–m6, m8–m10 are fixed. No invariant (INV-1..8) regressed.
- **Condition:** **N1** (major, but it only bites if production is misconfigured) must be fixed before any production deploy that could carry `WEBHOOK_ALLOW_PRIVATE`. Every other item is minor or info.
- **Isolation:** same reviewer and roles, fresh scratch `jr_review_test` and :4231 (`WEBHOOK_ALLOW_PRIVATE` unset, `LOG_LEVEL=info`, stdout captured). I stopped the server (exit 143 is my own kill) and dropped the DB (`DROP DATABASE` exit 0). :4000 was never touched (health 200). No source was edited.

### Receipts
| # | Command / probe | Exit | Result |
|---|---|---|---|
| RR1 | `npx tsc -p tsconfig.build.json` | 0 | — |
| RR2 | Full API suite, `TEST_PORT=4231`, `jr_review_test` | 0 | **77/77**, 16 suites, 0 skipped |
| RR3 | `prisma migrate diff --from-url … --to-schema-datamodel … --exit-code` | 0 | `No difference detected`. CHECKs `successor_needs_rotation`, `grace_needs_successor` and `rotated_is_revoked` all have `convalidated=t`. `RefreshToken_userId_idx` is present. V11 (forward → updated down script → forward) passed inside RR2 |
| RR4 | `rr-probe.ts`, grace window | 0 | **G1:** rotate 200, same-UA reuse 200 with the **same successor** (1 live token). A 2nd reuse → 401, the family dies, and the successor → 401 too. **G2:** another-UA reuse → 401, 0 live. **G3:** an attacker with a spoofed UA spends the grace and shares the successor. After the victim rotates, the attacker's next use → 401 and 0 live, so the theft is detected. **G4:** 2 parallel same-UA refreshes → 200,200, same token, 1 live. 5 parallel → `200,401,200,401,401`, 0 live (see n2). **G5:** reuse from another UA ‖ grace ‖ successor rotation, 3 unthrottled runs: 0 live and 0 usable tokens survive (one 200 was already dead). Later runs hit the 30/min refresh throttle (429) and were discarded |
| RR5 | `rr-probe2.ts logout` (fresh throttle window) | 0 | **L2:** logout of C only → D still refreshes (2 live). **L3:** logout-all → 0 live; without auth → 401. **L4:** a predecessor cannot resurrect a logged-out session (401). **L5** (logout-all ‖ refresh) and **L6** (deactivate ‖ refresh) → `200,401` with 0 live. **L1:** replaying a *logged-out* token → theft path, 0 live (n3) |
| RR6 | `rr-probe2.ts device` (one memo reset to PENDING between cases; Android-Chrome reduced UA everywhere) | 0 | The `jr_dev` cookie is HttpOnly, SameSite=Lax, 365 d, not in the body, and kept on re-login. Agent session cookie → `AGENT_SESSION`. Agent `jr_dev` only → `AGENT_DEVICE`. **Same IP + identical UA, no cookie → not flagged.** Forged `jr_dev` → not flagged. Another agent's `jr_dev` → not flagged. OTP code viewed with the agent's `jr_dev` → `CODE_VIEWED_ON_AGENT_DEVICE` |
| RR7 | Log probes on captured stdout | 0 | A real 32-char ack token, used for GET + POST, appears **0×**. Access tokens 0×, `rt_…` 0×. `/V1/PUBLIC/MEMO-ACK/…` is redacted. `?x=1`, a trailing `/`, and a 400 malformed-JSON POST are redacted. 5xx lines: 0. Only non-routable 404 shapes leak, and only attacker-supplied text: `memo-ack;<t>`, `memo-ack/x/<t>`, `?refresh_token=` (n5) |
| RR8 | `egress2.ts` | 0 | 2002::/16, 64:ff9b:1::/48, Teredo and 100::/64 are blocked. Own-receiver: only the exact origin plus `/v1/dev/webhook-receiver/<id>` passes. `..`, `%2e%2e%2f`, extra segments, query, credentials, `\..`, `%00`, `//`, a trailing-dot host, a scheme change and an upper-case path are all refused (`:443` and an upper-case host normalise to the same origin, which is fine). The 422 / blocked-attempt message is generic and the detail goes only to the server log. **`allowPrivateFor({…'true', NODE_ENV:'production'}, demo=true)` → `true`** (N1) |
| RR9 | Retention: seeded aged rows, then `POST /v1/internal/dispatch` with the cron secret | 0 | `tokensPurged: 2`, `evidenceCleared: 1`. Tokens expired 31 d ago and revoked 31 d ago are deleted. Tokens at 29 d and the live one are kept. A memo acked 91 d ago has its IP/UA cleared with `selfAckSuspected` kept; the one acked 89 d ago is untouched |

### Findings
- **N1 · major (bites only under misconfiguration; fix before a prod deploy):** `webhooks/egress.ts` `allowPrivateFor`. In production, `WEBHOOK_ALLOW_PRIVATE=true` still disables the SSRF guard for **demo-mode tenants**. The seeded public demo tenant `aurum` has `demoMode: true` (`seed.ts:154`), and its admin credentials are published on the login page (`apps/web/src/app/login/login-form.tsx:19`, "Sign in as Priya"). So that one misconfiguration gives every anonymous visitor SSRF with a 2 kB response read. That is the opposite of the fail-closed fix m3 asked for, and demo tenants do not need it, because the own receiver is exempted separately. Fix: `return e.WEBHOOK_ALLOW_PRIVATE === 'true' && e.NODE_ENV !== 'production'`, plus an E1 assertion.
- **n2 · minor (UX):** `auth.ts` grace allows a single reuse. When ≥ 3 tabs (or retries) refresh one cookie at once, the 3rd is treated as theft and revokes everything. In RR4 G4, two callers had already received 200s whose tokens were dead. The grace path now returns the *same* successor, so letting same-UA reuses repeat within the 30 s window mints no new session. The cap therefore adds only sign-outs. Consider dropping `graceUsedAt` as a hard stop and keeping the same-UA, same-successor and 30 s rules.
- **n3 · info:** replaying a logged-out token is treated as theft and revokes every device (RR5 L1). This is deliberate (DECISIONS) and harmless for cookie clients, since logout clears the cookie. Bearer/body clients must discard the token on logout.
- **n4 · minor (defence in depth):** `successorToken` = HMAC(`JWT_REFRESH_SECRET`, parentId). Before this change a DB read yielded only hashes. Now a DB read plus that one env secret yields the plaintext of every rotated live session. Use a dedicated key (or HKDF with a label), document the dependency, and note that rotating it ends only the in-flight grace.
- **n5 · info:** `redactUrl` over-redacts `/v1/memos/:id/ack/{link,verify}` as `/ack/[redacted]`, which loses that route in logs. `refresh_token` is not in the query list, though nothing reads refresh tokens from the query. Non-routable 404 shapes are logged verbatim, which is attacker-supplied text only. No test covers the 5xx error-filter path; the code is correct by reading.
- **n6 · minor (retention, m7 remainder):** `publicConfirm` still writes the retailer's IP to `AuditLog.ip`, and that is never purged. Older `AuditLog.after.userAgent` rows (from `04ed72c` until the fix) are not backfilled. Fix: drop `ip` on public ack audit rows, or extend the 90-day sweep to them.
- **n7 · info (migration):** if `CREATE INDEX CONCURRENTLY IF NOT EXISTS` (1200) fails midway, it leaves an INVALID index that a re-run skips. The runbook should check `pg_index.indisvalid`.
- **n8 · info:** `new Logger(...).warn({ detail }, 'webhook URL refused')` passes (object, context) to Nest's Logger, so the detail and the message render as two lines (RR8). This is cosmetic.
