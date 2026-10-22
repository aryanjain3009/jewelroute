#!/usr/bin/env node
// `pnpm verify` — the one gate. Runs every check (does not stop at the first failure), keeps full logs in
// .artifacts/verify/, prints a receipt (command · exit · tests · duration · tree) and exits non-zero if anything
// failed. A test step that ran zero tests counts as a failure (ZERO-RUN).
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LOGS = join(ROOT, '.artifacts', 'verify');
mkdirSync(LOGS, { recursive: true });

const STEPS = [
  { name: 'shared build', cmd: 'pnpm --filter @jewelroute/shared build' },
  { name: 'shared test', cmd: 'pnpm --filter @jewelroute/shared test', tests: true },
  { name: 'api typecheck', cmd: 'pnpm --filter @jewelroute/api typecheck' },
  { name: 'postgres ready', cmd: 'pg_isready -q -h 127.0.0.1 -p 5432 || { echo "Postgres is not running on 127.0.0.1:5432 — run: service postgresql start"; exit 1; }' },
  { name: 'api test', cmd: 'pnpm --filter @jewelroute/api test', tests: true, needs: 'postgres ready' },
  { name: 'web typecheck', cmd: 'pnpm --filter @jewelroute/web typecheck' },
  { name: 'web lint', cmd: 'pnpm --filter @jewelroute/web lint' },
  { name: 'harness test', cmd: 'node scripts/harness/test-hooks.mjs', tests: true },
];

const git = (...a) => spawnSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).stdout?.trim() ?? '';
const sha = git('rev-parse', '--short', 'HEAD') || 'unknown';
const dirty = git('status', '--porcelain').length > 0;

function counts(out) {
  // node --test prints "# pass N" (tap, Node 22 without a TTY) or "ℹ pass N" (spec, Node 24).
  const pass = out.match(/^(?:#|ℹ) pass (\d+)/m);
  const fail = out.match(/^(?:#|ℹ) fail (\d+)/m);
  if (pass) return { pass: +pass[1], fail: +(fail?.[1] ?? 0) };
  const h = out.match(/harness: (\d+) passed, (\d+) failed/);
  if (h) return { pass: +h[1], fail: +h[2] };
  return null;
}

const rows = [];
const results = new Map();
const t0 = Date.now();
for (const [i, s] of STEPS.entries()) {
  const log = join(LOGS, `${String(i + 1).padStart(2, '0')}-${s.name.replace(/\W+/g, '-')}.log`);
  if (s.needs && results.get(s.needs) !== 0) {
    rows.push({ ...s, exit: 'skip', tests: '—', ms: 0, log, ok: false, why: `needs ${s.needs}` });
    results.set(s.name, 1);
    continue;
  }
  process.stdout.write(`▸ ${s.name} … `);
  const start = Date.now();
  const r = spawnSync(s.cmd, { cwd: ROOT, shell: true, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0' }, maxBuffer: 64 * 1024 * 1024 });
  const out = `$ ${s.cmd}\n${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  writeFileSync(log, out);
  const c = s.tests ? counts(out) : null;
  let ok = r.status === 0;
  let why = '';
  if (s.tests && (!c || c.pass + c.fail === 0)) {
    ok = false;
    why = 'ZERO-RUN: no test count found';
  }
  const ms = Date.now() - start;
  results.set(s.name, ok ? 0 : 1);
  rows.push({ ...s, exit: r.status ?? r.signal, tests: c ? `${c.pass}/${c.pass + c.fail}` : '—', ms, log, ok, why, out });
  console.log(ok ? `ok (${(ms / 1000).toFixed(1)}s)` : `FAILED (${why || `exit ${r.status}`})`);
}

const failed = rows.filter((r) => !r.ok);
const ist = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
console.log(`\nverify receipt · tree ${sha}${dirty ? ' (+uncommitted changes)' : ''} · ${ist} IST · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log('| step | exit | tests | time | command |');
console.log('|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.ok ? '✓' : '✗'} ${r.name} | ${r.exit} | ${r.tests} | ${(r.ms / 1000).toFixed(1)}s | \`${r.cmd.length > 60 ? `${r.cmd.slice(0, 57)}...` : r.cmd}\` |`);
for (const r of failed) {
  console.log(`\n--- ${r.name} failed${r.why ? ` (${r.why})` : ''} · full log: ${r.log.replace(`${ROOT}/`, '')}`);
  if (r.out) console.log(r.out.trim().split('\n').slice(-30).join('\n'));
}
console.log(failed.length ? `\nVERIFY FAILED: ${failed.map((r) => r.name).join(', ')}` : '\nVERIFY PASSED');
process.exit(failed.length ? 1 : 0);
