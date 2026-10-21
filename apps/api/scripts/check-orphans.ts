/* `pnpm --filter @jewelroute/api db:check-orphans` — read-only; exits 1 when any SOLD piece has no live
 * order (see src/core/orphans.ts). Run after a deploy and after a rollback re-forward. Never repairs. */
import { join } from 'node:path';
import { PrismaClient } from '../generated/prisma';
import { findSoldOrphans } from '../src/core/orphans';

try {
  process.loadEnvFile?.(join(__dirname, '..', '.env'));
} catch {
  /* env provided by the caller */
}
const db = new PrismaClient();
findSoldOrphans(db)
  .then((rows) => {
    if (!rows.length) return console.log('[check-orphans] ok: every SOLD piece is sold by a live order');
    console.error(`[check-orphans] ${rows.length} SOLD piece(s) without a live order:`);
    for (const r of rows) console.error(`  tenant ${r.tenantId} · ${r.tagCode} (${r.pieceId}) · last order ${r.lastOrderNumber ?? 'none'} ${r.lastOrderStatus ?? ''}`);
    process.exitCode = 1;
  })
  .catch((e) => {
    console.error('[check-orphans] failed:', e);
    process.exitCode = 2;
  })
  .finally(() => db.$disconnect());
