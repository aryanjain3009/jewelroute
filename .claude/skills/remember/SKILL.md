---
name: remember
description: Use when the human types "/remember <what>" or after a verified discovery worth keeping (a gotcha, a confirmed cause, a changed fact). Appends an evidence-backed L#### entry to docs/brain/learnings.md, updates MEMORY.md/profile.md/cluster files when needed, and supersedes rather than deletes. Not for looking things up (/recall).
disable-model-invocation: true
argument-hint: "<the learning, with its evidence>"
metadata:
  owner: Sushant6095
  last-verified: 2026-10-21
---

# /remember — record what was proven

## Done when
- `docs/brain/learnings.md` ends with a new `## L#### · title` entry (next free id) with `status`, date, cluster, `evidence` and `rule` lines, ≤8 lines.
- If the entry is confirmed and changes daily work, it is also in the `MEMORY.md` index (≤10 lines there; drop the least useful one if it is full. The learning itself stays).
- Changed durable facts (units, pins, roles, rate rule) are updated in `profile.md`. Changed owned paths or gates are updated in the cluster file.
- Any older entry this replaces is marked `status: superseded by L####`, not deleted.
- `MEMORY.md` is still ≤60 lines (`wc -l docs/brain/MEMORY.md`). The changes are committed as `docs(brain): L#### <title>`.

## Gotchas
- **No evidence, no learning.** Evidence is a command plus quoted output, a commit sha, `file:line`, a test name, or a doc URL with the quoted sentence. "I think" → `status: hypothesis`, and say what would confirm it.
- **Never** record secrets, tokens, connection strings, real customer data or `.env` values. Describe the variable by name.
- The rule line is an instruction someone can follow tomorrow ("Import the client from generated/prisma"), not a story.
- Do not duplicate `docs/DECISIONS.md` or `docs/DESIGN.md`. If the learning is really a decision change, propose the edit to that file and link it from the learning.
- One learning per entry. Two facts → two entries.
- Stage only `docs/brain/**` (other agents share the tree).

## Steps
1. Parse `$ARGUMENTS` into: claim, evidence, cluster (custody-memo, orders-pricing, field, platform-webhooks, web, harness).
2. Check for an existing entry: `grep -n -i "<keywords>" docs/brain/learnings.md`. If one exists, either add evidence to it (hypothesis → confirmed) or supersede it.
3. Get the next id: `grep -o "^## L[0-9]*" docs/brain/learnings.md | tail -1`, plus one.
4. Verify the evidence now if you can (re-run the command, `git show --stat <sha>`, open file:line). If you cannot, the status is `hypothesis`.
5. Append:
   ```
   ## L00NN · <title>
   - status: confirmed · YYYY-MM-DD · cluster: <cluster>
   - evidence: <…>
   - rule: <…>
   ```
6. Update `MEMORY.md` (index line and open threads), `profile.md` and the cluster file if affected.
7. Commit: `git add docs/brain && git -c user.name="Sushant" -c user.email="cssbjd69@gmail.com" commit -m "docs(brain): L00NN <title>"` with the Claude trailers.
8. Reply with the entry text and the files touched.

## Related
- Protocol: `docs/brain/README.md`. To look up: `/recall`.
