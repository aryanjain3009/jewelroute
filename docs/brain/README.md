# docs/brain — JewelRoute decision memory

This folder is the repo's durable memory. It is reviewed like code and reaches `main` only by commit or PR.
Claude Code's own auto memory stays personal scratch; anything the team must keep lands here.

```
docs/brain/
  README.md      this protocol
  MEMORY.md      ≤60 lines: current state, open threads, confirmed learnings index (printed at session start)
  profile.md     durable facts: units, purity table, rate-snapshot rule, tenant model, roles, stack pins
  learnings.md   L#### entries: hypothesis → confirmed → superseded, each with evidence
  clusters/      one file per area: owned paths · invariants · what counts as consequential · gate
```
Decisions about the backend live in `docs/DECISIONS.md`. Design decisions live in `docs/DESIGN.md`. Keep one store per kind and link to it; never copy decisions in here.

## Protocol

### 1. Recall before acting (`/recall <topic>`)
Before you change anything in a cluster:
1. Read `MEMORY.md` (the session-start hook already printed it) and the cluster file for the paths you will touch (route table in `AGENTS.md`).
2. Search `learnings.md` for the topic: `grep -n -i "<word>" docs/brain/learnings.md`. Read every hit whose status is `confirmed`.
3. If a learning or decision covers your case, follow it and cite its id (`L0003`, `DECISIONS.md › Custody`) in your plan. If you think it is wrong, say so and get a human answer. Do not route around it quietly.

### 2. Record after verifying (`/remember`)
Write a learning only when you have **evidence**: a command and its output, a commit, a test, a doc URL with the quoted line. No evidence, no learning.
- New observation, not yet reproduced → `status: hypothesis`.
- Reproduced or proven by a test, commit or doc → `status: confirmed`.
- One learning per entry, ≤8 lines. Write the rule as an instruction someone can follow tomorrow.
- Add it to the end of `learnings.md` with the next free id. Add a confirmed learning to the index in `MEMORY.md` only if it changes how people work every day (≤10 in the index).
- If it changes a durable fact (unit, pin, role), update `profile.md` in the same commit.

### 3. Supersede, never delete
- A learning that is wrong or outdated gets `status: superseded by L00NN` and stays in the file. The new entry says `supersedes: L00MM` and why.
- `MEMORY.md` is rewritten freely (it is a current-state page), but every line that leaves it must still be true somewhere: in a learning, a cluster file or `DECISIONS.md`.
- Never delete a cluster file. Mark paths `retired (date)`.

### 4. Keep it small
- `MEMORY.md` ≤60 lines. Hook output is capped at 6,000 characters. Over the cap, the tail is cut and the session sees a truncation notice.
- Cluster files ≤60 lines. Facts only: paths, invariant ids, gates. No narrative.
- No session logs, no daily journals, no copies of command output beyond the evidence line.

### 5. What never goes here
Secrets, tokens, connection strings, customer data (names, phones, GSTIN, PAN), screenshots of real tenants. Seed names (Aurum Jewels, Rahul Verma) are fine.

## Entry format (learnings.md)
```
## L0007 · <one-line title>
- status: confirmed · 2026-10-21 · cluster: platform-webhooks
- evidence: <commit / file:line / command → output / URL "quoted line">
- rule: <the instruction to follow>
```
