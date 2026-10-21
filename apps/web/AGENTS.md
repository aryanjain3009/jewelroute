# apps/web — conventions that differ from the root

- Next.js 15 App Router, React 19, Tailwind 4, shadcn (radix) in `src/components/ui/`. Routes: `/` landing, `/login`, `/field/*` (agent, phone-first), `/admin/*` (manager, laptop-first), `/ack/[token]` (public retailer page), `/developers`.
- The browser calls only `/api/v1/...`; `next.config.ts` rewrites `/api/*` to `API_ORIGIN` so auth cookies stay first-party. Call the API only through `api<T>()` in `src/lib/api.ts` (unwraps `{ok,data}`, throws `ApiError`, refreshes once on 401).
- Types in `src/lib/types.ts` mirror `docs/CONTRACT.md`. When they disagree, the contract wins: fix the type and log the gap in `docs/API_ISSUES.md`. `Ref` fields are objects `{id,name}` — render `.name` (`docs/brain/learnings.md` L0005).
- Server state lives in TanStack Query only. Keys come from `qk` and invalidation from `useSync()` in `src/lib/sync.ts`; the read hooks are in `src/components/field/queries.ts` (agent), `src/components/admin-v2/field/data.ts` and `src/components/admin-v2/sales/data.ts` (admin). Reuse them instead of new keys (see `.claude/rules/web.md`).
- Mutations that create something pass `idempotencyKey` to `api()`: one key held in a `useRef` per form/drawer open (keyed by the body signature, as in `field/check-in-panel.tsx` and `field/sale/order-review.tsx`), reused on retry, replaced only when the body changes.
- Money, weight and rates go through `Money`, `Grams`, `PurityTag` (`src/components/jr/money.tsx`) or `formatINR*` / `formatGrams` / `formatRate` from `@jewelroute/shared`. Never format paise by hand.
- Pricing on the web is display-only (`priceDesign` from shared); the number the user commits to is the one the API returns.
- zod here is v3 (`apps/api` uses v4). Do not share zod schemas between the apps.
- No business logic and no Server Actions for writes; pages are client components that read through the query hooks.
- Lint: `pnpm --filter @jewelroute/web lint` (next eslint config). There is no unit test runner; UI is verified with the `ui-verify` skill.
