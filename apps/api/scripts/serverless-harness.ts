/* Runs the Vercel entry (api/index.ts) behind a plain node:http server, the way Vercel invokes it.
 *   pnpm build && npx tsx scripts/serverless-harness.ts   (PORT defaults to 4300) */
import { createServer } from 'node:http';
import { join } from 'node:path';
try {
  process.loadEnvFile?.(join(__dirname, '..', '.env'));
} catch {
  /* real env */
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const handler = require('../api/index').default;
const port = Number(process.env.HARNESS_PORT ?? 4300);
createServer((req, res) => handler(req, res)).listen(port, () => console.log(`serverless harness on http://localhost:${port}`));
