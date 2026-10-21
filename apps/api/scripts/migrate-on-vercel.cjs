// Runs `prisma migrate deploy` during the Vercel build only (VERCEL=1). Local builds are unchanged.
// Prisma uses `directUrl` (DATABASE_URL_DIRECT) for migrations; fall back to DATABASE_URL if unset.
const { execSync } = require('node:child_process');
if (process.env.VERCEL !== '1') {
  console.log('[migrate-on-vercel] not on Vercel — skipping prisma migrate deploy');
  process.exit(0);
}
const env = { ...process.env };
if (!env.DATABASE_URL_DIRECT && env.DATABASE_URL) env.DATABASE_URL_DIRECT = env.DATABASE_URL;
console.log('[migrate-on-vercel] prisma migrate deploy');
execSync('npx prisma migrate deploy', { stdio: 'inherit', env, cwd: __dirname + '/..' });
