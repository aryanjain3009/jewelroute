---
name: review-change
description: Use when asked to review a diff, branch, commit range or PR in JewelRoute ("review my changes", "is this safe to merge"). Runs three independent axes — spec/behaviour (verifier), invariants (invariant-reviewer), and security/migrations/UI when touched — and merges their findings into one verdict. Named review-change so it never shadows the bundled /code-review. Not for verifying a planned feature end to end (/verify).
metadata:
  owner: Sushant6095
  last-verified: 2026-10-21
---

# review-change — three axes, fresh eyes, one verdict

## Done when
- You produced one report: **verdict** (APPROVE / REQUEST CHANGES / ESCALATE), the tier, a findings list ordered by severity (each with `file:line`, what breaks, and a concrete fix), and which reviewers ran.
- At most 5 nits. Nothing that CI or the linters already enforce.
- Every "Important" finding was checked to be real: you or the reviewer tried to disprove it (read the caller, ran the test) before reporting.
- No files were changed by the review.

## Gotchas
- **Important** = breaks behaviour, leaks data across tenants or agents, loses money precision, double-moves custody, blocks rollback, or makes a test lie. Style is never Important.
- Always check, whatever the diff: tenant scope on every new query (`tenantId: ctx.user.tid`); `Idempotency-Key` handling on creates; custody writes only via `CustodyService.move`; no recomputed stored price; integer paise/mg; no secrets or PII in logs; `docs/CONTRACT.md` updated for route changes; TanStack invalidation for new mutations.
- **Zero callers is not proof of unused.** Before flagging dead code, check Nest module `providers`/`controllers`, decorators, `EVENT_DESCRIPTIONS`, `activityTitle`, and string-keyed query keys.
- Reviewers get only: the diff range, the spec or intent, and the commands. Do not pass your own opinion of the change. Their default is REJECT and they cannot edit.
- Other agents commit to this repo concurrently. Review exactly the range you were given (`git diff A..B`), not the working tree.

## Steps
1. **Scope.** Determine the range (`git log --oneline -15`, or what the human named). Get files: `git diff --stat A..B`. Compute the tier from `AGENTS.md` (highest path wins).
2. **Intent.** Find the spec (`docs/features/*/SPEC.md` mentioning the files) or ask for a one-line intent if there is none.
3. **Deterministic first.** `pnpm verify` (or the affected subset). Record exit codes. A red gate is an Important finding by itself.
4. **Spawn reviewers in parallel** (≤4, self-contained prompts):
   - `verifier`: "Does A..B do what <intent/spec> says? Goal-backward table, default REJECT."
   - `invariant-reviewer`: always on T3, and on T2 if any money, custody, rate or idempotency symbol appears in the diff (`grep -E "Paise|Mg\\b|custod|goldRate|idem" `).
   - `migration-reviewer`: if `apps/api/prisma/**` changed.
   - `security-reviewer`: if auth, `common/**`, uploads, public routes, webhooks, tenancy filters or new endpoints changed.
   - `ui-critic`: if `apps/web/**` UI changed (give it screenshot paths from `ui-verify`, or ask it to take them).
5. **Merge.** De-duplicate findings, keep the highest severity, and drop anything a reviewer could not support with `file:line`. Disprove-or-keep each Important finding yourself.
6. **Report** (format example, not a real finding):
   ```
   Verdict: REQUEST CHANGES · Tier T3 · range a1b2c3..d4e5f6
   Gates: pnpm verify exit 0 (api 10/10, harness 34/34)
   Important
   1. apps/api/src/modules/memos.ts:142 — return skips idem.run → retried POST double-moves custody. Fix: wrap in this.idem.run(ctx, …) like create (line 97).
   Nits (≤5) …
   Reviewers: verifier APPROVE · invariant-reviewer FAIL (item 3) · security-reviewer PASS
   ```

## Related
- Agents: `verifier`, `invariant-reviewer`, `migration-reviewer`, `security-reviewer`, `ui-critic`. Full feature gate: `/verify`.
