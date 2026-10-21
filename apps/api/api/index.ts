// Vercel Node function entry (Root Directory = apps/api). All paths are rewritten here by vercel.json.
// The Nest app is compiled by `pnpm build` into dist/ (tsc keeps decorator metadata); this file
// only forwards to it, so Vercel's bundler never has to compile decorators itself.
import type { IncomingMessage, ServerResponse } from 'node:http';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getHandler } = require('../dist/serverless') as { getHandler: () => Promise<(req: IncomingMessage, res: ServerResponse) => void> };

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const h = await getHandler();
    h(req, res);
  } catch (e) {
    console.error('bootstrap failed', e);
    // Env-validation messages list variable names only (never values) — safe to show on /v1/health.
    const msg = String((e as Error)?.message ?? e);
    const isHealth = (req.url ?? '').startsWith('/v1/health');
    res.statusCode = isHealth ? 503 : 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: { code: 'BOOT_FAILED', message: isHealth && msg.startsWith('Invalid environment') ? msg : 'API failed to start' } }));
  }
}
