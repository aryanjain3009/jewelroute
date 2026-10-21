---
name: plan
description: Use when the human has approved a SPEC.md and types "/plan NNN-slug". Turns the spec into PLAN.md and tasks.json (small, ordered, each with a runnable verify command and acceptance list), then stops for approval on T2/T3. Not for writing the spec (/spec) or doing the work (/build).
disable-model-invocation: true
argument-hint: "NNN-slug"
metadata:
  owner: Sushant6095
  last-verified: 2026-10-21
---

# /plan — from approved spec to tasks

## Done when
- `docs/features/$ARGUMENTS/PLAN.md` has `must_haves` (truths, artifacts, key links), the tier, the task order and the risks.
- `docs/features/$ARGUMENTS/tasks.json` parses (`node -e 'JSON.parse(require("fs").readFileSync(process.argv[1]))' <path>`). Every task has every field in the template, and `passes` is `false`.
- Every spec requirement maps to at least one task (the PLAN.md traceability table), and every INV touched has a task whose `verify` runs a test that proves it.
- On T2/T3 you stopped for approval. On T0/T1 you may continue to `/build` if the human said so.

## Gotchas
- **Order:** migration → shared (`packages/shared`) → API service + controller → contract (`docs/CONTRACT.md`) → web types (`apps/web/src/lib/types.ts`) → web queries and invalidation → web UI. The API never ships before its test does.
- **Size:** one task = one fresh context. That means ≤10 files and a 2–3 sentence `action`. Tests ship in the same task as the code they prove.
- **T3 tasks** list their failing test first in `acceptance` ("test 10 fails on base with 409 expected, got 201"). The builder must show it red before green.
- `verify` is a command that exits non-zero on failure and runs in under 3 minutes, for example `pnpm --filter @jewelroute/api test` or `pnpm --filter @jewelroute/web typecheck`. "Manually check" is not a verify.
- `read_first` lists the exact files and docs the builder needs. Include the cluster file and the relevant rule (`.claude/rules/money-custody.md`, `migrations.md`, `web.md`).
- A new table, a new dependency or a new top-level folder is a **checkpoint** task: `"action": "STOP: ask the human …"`. Never `pnpm add` without approval.
- Concurrent agents edit `apps/api` and `apps/web`. Name the exact files a task owns so that two tasks never touch the same file at the same time.

## Steps
1. Read `docs/features/$ARGUMENTS/SPEC.md`. If Fog is not empty or the spec is not marked approved, stop and say so.
2. Recall: `docs/brain/MEMORY.md`, the cluster files, and learnings matching the spec's nouns.
3. Map the code: for each requirement, find the files that change (`grep -rn` the endpoint path, the service method, the query key). Note DI wiring (module `providers`, `controllers`). Zero callers is not proof of unused.
4. Write PLAN.md from `docs/features/_template/PLAN.md`:
   - `must_haves.truths`: statements that must be true at the end ("a second approve returns 409 ORDER_ALREADY_DECIDED and writes no audit row").
   - `must_haves.artifacts`: files that must exist or change.
   - `must_haves.key_links`: wiring that must hold (controller registered in module, query key invalidated by the mutation, contract entry).
   - Tier, with the paths that set it. Risks with their mitigation.
5. Write tasks.json from `docs/features/_template/tasks.json`: ids `T1…Tn` in execution order, `tier` per task, `files`, `read_first`, `action`, `verify`, `acceptance[]`, `invariant_ids[]`, `attempts: 0`, `passes: false`, `verified_by: null`, `notes: ""`.
6. Create `progress.md` with the "Codebase patterns" header from the template.
7. Stop (T2/T3): reply with the task list (id, title, tier, verify) and "Approve PLAN.md to continue with /build."

## Related
- Before: `/spec` (approved SPEC.md). Next: `/build NNN-slug`.
- Templates: `docs/features/_template/{PLAN.md,tasks.json,progress.md}`.
