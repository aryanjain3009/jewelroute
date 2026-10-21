/* CLI wrapper:  pnpm --filter @jewelroute/api db:seed   (same logic as POST /v1/internal/seed) */
import { join } from 'node:path';
import { PrismaClient } from '../generated/prisma';
import { runSeed } from '../src/seed/seed';

try {
  process.loadEnvFile?.(join(__dirname, '..', '.env'));
} catch {
  /* env from the shell */
}

const prisma = new PrismaClient();
runSeed(prisma, { apiPublicUrl: process.env.API_PUBLIC_URL ?? 'http://localhost:4000', encryptionKeyB64: process.env.APP_ENCRYPTION_KEY ?? '' })
  .then((s) => console.log('Seeded tenant aurum', JSON.stringify(s)))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
