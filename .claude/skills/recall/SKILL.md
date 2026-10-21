---
name: recall
description: Use when the human types "/recall <topic>" or asks "why is X like this / what did we decide about X". Searches docs/brain (MEMORY, learnings, clusters, profile) plus docs/DECISIONS.md and docs/DESIGN.md and answers with ids and file:line citations. Read-only. Not for recording new knowledge (/remember).
disable-model-invocation: true
argument-hint: "<topic or question>"
metadata:
  owner: Sushant6095
  last-verified: 2026-10-21
---

# /recall — answer from the repo's memory, with citations

## Done when
- The answer cites at least one source as `file:line` or a learning id (`L0004`), or says plainly "no record found" and lists where you looked.
- Each cited learning's status is shown (confirmed / hypothesis / superseded). Superseded entries point to their replacement.
- No files were changed.

## Gotchas
- Memory can be stale. If a learning or decision names a file, function or constant, check that it still exists (`grep -n`). If the code disagrees, say so ("L0010 says X; the code now does Y at file:line"). Do not silently trust either side.
- The decision stores are separate: backend → `docs/DECISIONS.md`, design → `docs/DESIGN.md` (v2 section wins over v1), API shapes → `docs/CONTRACT.md` (Changelog first), gaps → `docs/API_ISSUES.md`. `docs/brain` links to them; it does not copy them.
- `MEMORY.md` is a summary. Always open the full learning or decision before answering.
- Never answer from general knowledge as if it were a project decision. Label any inference as an inference.

## Steps
1. Normalise the topic into 2–4 search words (synonyms too: "rate" → gold rate, `ratePaisePerGram`, `GoldRate`, snapshot).
2. Search, in this order:
   ```
   grep -n -i -E "<w1>|<w2>" docs/brain/MEMORY.md docs/brain/learnings.md docs/brain/profile.md docs/brain/clusters/*.md
   grep -n -i -E "<w1>|<w2>" docs/DECISIONS.md docs/DESIGN.md docs/CONTRACT.md docs/API_ISSUES.md README.md
   ```
3. Open the matching sections (Read with offset) and the code they point at.
4. If the topic is an invariant, also cite the SQL (`apps/api/prisma/migrations/20261021000000_init/migration.sql`, from line 687) and the test (`apps/api/test/api.test.ts`, test number).
5. Answer in this shape:
   - **Answer:** 1–3 sentences.
   - **Sources:** bullet list of `file:line` / `L####` (status) / commit sha.
   - **Drift:** any mismatch between memory and code, or "none found".
6. If the question exposed a gap (no record, or drift), suggest the exact `/remember` entry to write. Do not write it yourself.

## Example
"/recall why do order lines store the rate" →
Answer: order lines freeze the rate and every price component at write time, so a later gold-rate change never alters an order (INV-4).
Sources: `docs/brain/profile.md` "Gold-rate snapshot rule"; `docs/DECISIONS.md` › Pricing ("OrderItem freezes rate id/rate/components"); `migration.sql:732` trigger `OrderItem_append_only`; `api.test.ts` test 8.
Drift: none found.

## Related
- Protocol: `docs/brain/README.md`. To record: `/remember`.
