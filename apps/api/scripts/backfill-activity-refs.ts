/* `pnpm --filter @jewelroute/api db:backfill-activity-refs` — see src/core/backfill-refs.ts. */
import { join } from 'node:path';
import { PrismaClient } from '../generated/prisma';
import { backfillActivityRefs } from '../src/core/backfill-refs';

try {
  process.loadEnvFile?.(join(__dirname, '..', '.env'));
} catch {
  /* env provided by the caller */
}
const db = new PrismaClient();
backfillActivityRefs(db, { log: console.log })
  .then((s) => console.log(`[backfill-activity-refs] done: ${s.updated} updated of ${s.scanned} scanned in ${s.batches} batch(es)`))
  .catch((e) => {
    console.error('[backfill-activity-refs] failed:', e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
