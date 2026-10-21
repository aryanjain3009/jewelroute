# NNN-slug — <feature name>

Status: draft | approved (by <name>, YYYY-MM-DD) · Tier: T? (paths: …) · Clusters: …

## Outcome
<1–2 sentences: what a manager or agent can do afterwards that they cannot do now>

## Verification
<how a human sees it working: route, role, steps>

## Constraints / Boundaries
- Constraints: <time, tech, compatibility; no new infrastructure unless a decision says so>
- Boundaries: <what must not change: endpoints, shapes, invariants>

## Requirements
### R1 · <title>
- Current: <behaviour today, with file:line>
- Target: <behaviour after>
- **Acceptance:** <test name in apps/api/test/api.test.ts | command | screenshot route@390/1440>

## Scope
- In: …
- Out: …
- **Anti:** <a tempting wrong approach and why not>

## Invariants touched
| INV | How it stays true | Proving test |
|---|---|---|

## State machine
<states; legal transitions; illegal transitions → HTTP status + error code>

## Money & time
<units (paise/mg/bps); worked example with hand-computed numbers; rounding; IST dates>

## Idempotency & concurrency
<which writes take Idempotency-Key; what N parallel identical/conflicting requests must produce (DB postconditions)>

## Audit & events
<audit actions; outbox event types (packages/shared/src/events.ts); webhook payload changes>

## Contract diff (docs/CONTRACT.md)
<method path · request · response · errors>

## Critical journeys
1. …

## Fog (must be empty before approval)
- <unknown> — proposed default: …
