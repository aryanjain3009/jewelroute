// Runs the activity-refs back-fill during the Vercel build only (VERCEL=1), after `prisma migrate deploy`
// and `tsc` (it uses the compiled dist/core/backfill-refs.js). Idempotent and batched (1k rows per tx).
if (process.env.VERCEL !== '1') {
  console.log('[backfill-on-vercel] not on Vercel — skipping activity-refs back-fill');
  process.exit(0);
}
if (!process.env.DATABASE_URL && process.env.DATABASE_URL_DIRECT) process.env.DATABASE_URL = process.env.DATABASE_URL_DIRECT;
const { PrismaClient } = require('../generated/prisma');
const { backfillActivityRefs } = require('../dist/core/backfill-refs.js');
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL } } });
backfillActivityRefs(db, { log: console.log })
  .then((s) => console.log(`[backfill-on-vercel] ${s.updated} updated of ${s.scanned} scanned`))
  .catch((e) => {
    console.error('[backfill-on-vercel] failed:', e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
