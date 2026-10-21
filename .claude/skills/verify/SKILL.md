---
name: verify
description: Use when the human types "/verify NNN-slug" after /build. Runs Stage A (deterministic gates, pnpm verify), Stage B (fresh-context verifier agent, default REJECT) and on T3 Stage C (invariant-reviewer), writes VERIFY.md and is the only step that sets passes in tasks.json. Replaces Claude Code's bundled /verify on purpose. Not for reviewing an arbitrary diff (review-change).
disable-model-invocation: true
argument-hint: "NNN-slug"
metadata:
  owner: Sushant6095
  last-verified: 2026-10-21
---

# /verify — prove it, from a fresh context, failing closed

## Done when
- `docs/features/<slug>/VERIFY.md` has Stage A receipts, the Stage B verdict and on T3 the Stage C verdict, a goal-backward table (each `must_haves.truth` → evidence) and a final verdict: **APPROVE**, **REJECT** or **ESCALATE**.
- On APPROVE: every task in tasks.json has `passes: true` and `verified_by: "verify <date> <short sha>"`, written by you in this step.
- On REJECT: findings are appended to each failing task's `notes` and `progress.md`, `passes` stays false, and the human is told to run `/build <slug>` again (max 3 build↔verify rounds, then ESCALATE).

## Gotchas
- **Fail closed.** If a command errors for infra reasons (Postgres down, timeout), an agent's output can't be parsed, or a gate ran zero tests, the verdict is REJECT with the reason, never APPROVE.
- **Zero-run is a failure.** `pnpm verify` prints the test counts; `# tests 0` or a missing count fails.
- Evidence is pinned to the tree: record `git rev-parse --short HEAD` and whether `git status --porcelain` was clean for your files. If the tree changed after Stage A, re-run Stage A.
- The verifier and invariant-reviewer **do not see** the builder's reasoning. Give them the spec, the plan, the diff range and the commands, nothing else. Their default is REJECT.
- Other agents may have uncommitted changes in `apps/*`. Judge only the feature's commits (`git diff <base>..HEAD -- <files>`). If someone else's breakage makes `pnpm verify` red, record it as ESCALATE with evidence; never "fix" their files.

## Steps
1. **Collect.** Read SPEC.md, PLAN.md and tasks.json. Base = the commit before the feature's first task commit (`git log --oneline --grep "<slug>"`). Tier = the highest task tier.
2. **Stage A (deterministic).** Run and capture the exit code and the summary lines:
   - `service postgresql status` (start it if down) and `pg_isready -h 127.0.0.1`
   - `pnpm verify` (shared build + test, api typecheck + tests, web typecheck + lint, harness tests). It prints a receipt table.
   - Each task's own `verify` command.
   - If migrations changed: apply them to a fresh local DB (`createdb jr_verify_<n>`, `DATABASE_URL=… pnpm --filter @jewelroute/api exec prisma migrate deploy`), then drop it. Spawn `migration-reviewer`.
   - Write the receipts table to VERIFY.md: command · exit · tests passed/failed · sha.
   Any non-zero → REJECT now (skip B/C), unless it is someone else's file (ESCALATE).
3. **Stage B.** Spawn `verifier` with: the spec path, the plan path, the base..HEAD range, the receipts, and "default REJECT; run commands yourself; output the goal-backward table and the verdict". Paste its table and verdict into VERIFY.md.
4. **Stage C (T3 only).** Spawn `invariant-reviewer` with the same inputs plus the INV ids touched. On a UI change also spawn `ui-critic` (or run the `ui-verify` skill) and attach the screenshot paths. On auth, tenancy or webhook changes, spawn `security-reviewer`.
5. **Verdict.** APPROVE only if Stage A is all green, B approves and (on T3) C approves. Otherwise REJECT with the top findings, or ESCALATE when the fix needs a human decision.
6. **Write results.** On APPROVE, set `passes: true` and `verified_by` on every task. On REJECT, append findings to the tasks' `notes`. Commit `docs/features/<slug>/{VERIFY.md,tasks.json,progress.md}` (`chore(<cluster>): verify <slug> — <verdict>`).
7. **Memory.** If verification taught something with evidence (a gotcha, a flaky gate), run `/remember`.
8. Reply with the verdict, the receipts table and the next step (`/ship <slug>` or `/build <slug>`).

## Related
- Agents: `verifier` (Stage B), `invariant-reviewer` (Stage C), `migration-reviewer`, `security-reviewer`, `ui-critic` (when touched).
- Template: `docs/features/_template/VERIFY.md`. Next: `/ship NNN-slug` on APPROVE, `/build NNN-slug` on REJECT.
