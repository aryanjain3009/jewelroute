---
name: build
description: Use when the human types "/build NNN-slug" after approving PLAN.md. Runs the tasks in tasks.json one at a time, each in a fresh `builder` subagent, then commits each task. Never marks a task passed (only /verify does). Not for unplanned one-off fixes (use tdd directly) or for verification (/verify).
disable-model-invocation: true
argument-hint: "NNN-slug [task-id]"
metadata:
  owner: Sushant6095
  last-verified: 2026-10-21
---

# /build — execute the plan, one fresh builder per task

## Done when
- Every task in `docs/features/<slug>/tasks.json` either has a builder report showing its `verify` command exiting 0 (passes stays `false`; `/verify` sets it), or is escalated with a decision packet.
- Each finished task is one commit containing only that task's files, message `feat(<cluster>): <task title> (<slug> <task id>)` plus the trailers below.
- `progress.md` has one appended entry per task: what changed, the verify command and its exit code, surprises.
- You reply with a table: task · status · verify exit · commit, and suggest `/verify <slug>`.

## Gotchas
- **Fresh context per task.** Spawn the `builder` subagent with a self-contained prompt: the task JSON, its `read_first` files, the nearest `AGENTS.md`, and the rule files for its paths. Do not paste the whole spec. ≤4 builders in parallel, and only for tasks with disjoint `files`.
- **T3: red first.** The builder must show the new test failing on the current code before it writes the fix. Paste both runs into `progress.md`.
- **Stop conditions:** a new table, a new dependency, a change to an invariant (SQL guard, `CustodyService.move`, pricing formula) that the spec did not approve, or the same error 3 times. Stop and write a decision packet: what failed (evidence), 2–3 options, your recommendation.
- **3 attempts max per task** (`attempts` counter). Then escalate. Do not loop.
- Never edit an applied migration, never weaken a test or SQL guard, never `git add -A` (other agents share this tree).
- The Stop hook (`stop-verify`) re-runs affected checks when you finish. If it blocks, fix only the failures it lists.
- API tests need local Postgres (`service postgresql start`; check with `pg_isready -h 127.0.0.1`).

## Steps
1. Read `tasks.json` and `PLAN.md`. Confirm that PLAN.md is approved (T2/T3). Pick the next task with `passes: false` whose dependencies are done, or the one named in `$ARGUMENTS`.
2. Increment `attempts` for that task and save tasks.json.
3. Spawn `builder` with this prompt skeleton:
   ```
   Task <id> of docs/features/<slug>. Tier <T>. Files you own: <files>.
   Read first: <read_first>, AGENTS.md, <nearest apps/*/AGENTS.md>, <.claude/rules/*.md matching your files>.
   Action: <action>
   Acceptance: <acceptance[]>
   Invariants: <invariant_ids> (AGENTS.md section "Invariants").
   Verify: <verify> must exit 0. T3: show the new test failing first.
   Report: files changed, the verify command and the last 20 lines of its output with the exit code, anything surprising.
   ```
4. Read the builder's report. Re-run the task's `verify` yourself. Trust the exit code, not the summary.
5. If green: `git add <task files> docs/features/<slug>/{tasks.json,progress.md}` and commit:
   ```
   git -c user.name="Sushant" -c user.email="cssbjd69@gmail.com" commit -m "feat(<cluster>): <title> (<slug> <id>)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   Claude-Session: <session url>"
   ```
6. If red: append the failure to `notes` and `progress.md`. Retry with the error in the prompt (attempts ≤3), or escalate.
7. Append the task entry to `progress.md`. If the builder found a reusable pattern, add it under "Codebase patterns (candidates)". A human promotes candidates.
8. Repeat until no task is left. Then reply with the table and "Run /verify <slug>".

## Related
- Agents: `builder` (per task). Skills it uses: `tdd`, `money-math`, `write-migration`, `diagnosing-bugs`.
- Next: `/verify NNN-slug`.
