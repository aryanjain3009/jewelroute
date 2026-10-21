---
name: spec
description: Use when the human starts a new JewelRoute feature or change ("/spec 012-memo-reminders <brief>"). Writes docs/features/NNN-slug/SPEC.md from the template and stops for human approval. Not for bug fixes with a known cause (use diagnosing-bugs, then tdd) or planning an approved spec (use /plan).
disable-model-invocation: true
argument-hint: "NNN-slug <one-paragraph brief>"
metadata:
  owner: Sushant6095
  last-verified: 2026-10-21
---

# /spec — write the feature spec, then stop

Input: `$ARGUMENTS` (folder name `NNN-slug` + brief). The spec is the contract that `/verify` judges against, so every requirement must be checkable.

## Done when
- `docs/features/NNN-slug/SPEC.md` exists and follows `docs/features/_template/SPEC.md`.
- Every requirement has an **Acceptance:** line that names a test, a command or a screenshot.
- **Fog** is empty. Every **Invariants touched** id exists in `AGENTS.md` (INV-1 … INV-8).
- The tier (T0–T3) is stated with the paths that set it.
- You stopped and asked the human to approve. You did not start `/plan`.

## Gotchas
- The contract is `docs/CONTRACT.md`. A new or changed endpoint is written into the spec as a contract diff (method, path, body, response, error codes), not as prose.
- Money is paise and weight is mg in every example. Write numbers as worked examples ("31,800 mg at ₹10,540/g → gold 33,517,200 paise"), never as formulas only.
- "Show X live" usually means polling plus TanStack invalidation (`.claude/rules/web.md`), not websockets. Do not invent infrastructure (no Redis, queues or new services) unless the brief demands it. If it does, that is a Fog item for the human.
- Anything the UI shows must come from an API field. If the API has no such field, the spec adds it to the contract.
- A brief that touches custody, memos, orders, pricing, gold rates, idempotency, auth or migrations is **T3**.
- Ask at most 3 questions, and only for things the code and docs cannot answer. Put the rest in Fog with your proposed default.

## Steps
1. **Recall.** Read `docs/brain/MEMORY.md`, the cluster file(s) for the paths you expect to touch (route table in `AGENTS.md`), and grep `docs/brain/learnings.md` for the topic. Note relevant ids (`L0004`, `DECISIONS.md › Webhooks`).
2. **Read the ground truth** for the area: the module(s) in `apps/api/src/modules/`, the relevant `docs/CONTRACT.md` section, `schema.prisma` models, and existing tests in `apps/api/test/api.test.ts`.
3. **Pick the folder.** `ls docs/features/` → the next free `NNN`, unless `$ARGUMENTS` gave one. Copy the template: `cp -r docs/features/_template docs/features/NNN-slug`.
4. **Fill SPEC.md** section by section:
   - Outcome (1–2 sentences, user-visible), Verification (how a human will see it working), Constraints, Boundaries (what must not change).
   - Requirements R1…Rn: Current → Target → **Acceptance:** (test name / command / screenshot at 390 or 1440 px).
   - In scope / Out of scope, at least one **Anti:** line (a tempting wrong approach, named).
   - Invariants touched (INV ids and how each stays true), State machine (states, transitions, illegal transitions + their error codes), Money & time (units, rounding, IST dates), Idempotency & concurrency (which writes take `Idempotency-Key`, what N parallel requests must produce), Audit and outbox events (event type names from `packages/shared/src/events.ts` or new ones), Contract diff.
   - Critical journeys (numbered user steps; these become e2e or `ui-verify` checks).
   - Fog: unknowns. It must be empty before approval. Propose a default for each one and ask.
5. **Self-check** against "Done when". Fix anything missing.
6. **Stop.** Reply with the path, the tier, the Fog questions (if any) and "Approve SPEC.md to continue with /plan."

## Related
- Next: `/plan NNN-slug` after the human approves.
- Memory: `/recall <topic>` before writing; the owner cluster file from the `AGENTS.md` route table.
