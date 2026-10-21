#!/usr/bin/env node
// Stop hook: if this session edited code, run the affected checks before Claude may say "done".
// Failures → exit 2 with the failing output (Claude keeps working). Loop-safe: when stop_hook_active is true
// (Claude is already continuing because of us) we let it stop. Skip for a session: JR_SKIP_STOP_VERIFY=1.
// Tests can inject a plan: JR_STOP_VERIFY_PLAN='[{"name":"x","cmd":"..."}]'.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { projectDir, readInput, readJson, statePath, writeJson } from './lib.mjs';

const input = readInput();
if (input?.stop_hook_active) process.exit(0);
if (process.env.JR_SKIP_STOP_VERIFY === '1') process.exit(0);

const root = projectDir();
const path = statePath('dirty.json');
const state = readJson(path, { packages: {} });
const dirty = state.packages ?? {};
const pkgs = Object.keys(dirty);
if (!pkgs.length) process.exit(0);

// Clear first: a crash or timeout below must not wedge every later stop.
writeJson(path, { packages: {}, updatedAt: new Date().toISOString() });

const shared = { name: 'shared build', cmd: 'pnpm --filter @jewelroute/shared build', pkg: 'packages/shared' };
function planFor(pkg) {
  const files = (dirty[pkg] ?? []).filter((f) => existsSync(join(root, f)));
  switch (pkg) {
    case 'packages/shared':
      return [shared, { name: 'shared test', cmd: 'pnpm --filter @jewelroute/shared test', pkg }];
    case 'apps/api':
      return [
        shared,
        { name: 'api typecheck', cmd: 'pnpm --filter @jewelroute/api typecheck', pkg },
        { name: 'postgres up', cmd: 'pg_isready -q -h 127.0.0.1 -p 5432 || (echo "Postgres is not running: service postgresql start" && exit 1)', pkg },
        { name: 'api test', cmd: 'pnpm --filter @jewelroute/api test', pkg },
      ];
    case 'apps/web': {
      const lintable = files.filter((f) => /\.(tsx?|jsx?|mjs)$/.test(f)).map((f) => JSON.stringify(f.replace(/^apps\/web\//, '')));
      return [
        shared,
        { name: 'web typecheck', cmd: 'pnpm --filter @jewelroute/web typecheck', pkg },
        ...(lintable.length ? [{ name: 'web lint (changed files)', cmd: `pnpm --filter @jewelroute/web exec eslint --max-warnings=0 ${lintable.join(' ')}`, pkg }] : []),
      ];
    }
    case 'harness':
      return [{ name: 'harness tests', cmd: 'node scripts/harness/test-hooks.mjs', pkg }];
    default:
      return [];
  }
}

let plan;
if (process.env.JR_STOP_VERIFY_PLAN) {
  plan = JSON.parse(process.env.JR_STOP_VERIFY_PLAN).map((p) => ({ pkg: pkgs[0], ...p }));
} else {
  const seen = new Set();
  plan = pkgs.flatMap(planFor).filter((s) => !seen.has(s.name) && seen.add(s.name));
}

const failures = [];
for (const step of plan) {
  if (failures.some((f) => f.pkg === step.pkg && step.name !== 'shared build')) continue; // first failure per package is enough
  const r = spawnSync(step.cmd, { cwd: root, shell: true, encoding: 'utf8', timeout: 300_000, env: { ...process.env, FORCE_COLOR: '0' } });
  if (r.status !== 0) {
    const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim().split('\n').slice(-40).join('\n');
    failures.push({ ...step, status: r.status ?? r.signal, out });
  }
}

if (!failures.length) process.exit(0);

// Keep the failed packages dirty so the next stop (after a fix) checks them again.
const keep = readJson(path, { packages: {} });
for (const f of failures) keep.packages[f.pkg] = [...new Set([...(keep.packages[f.pkg] ?? []), ...(dirty[f.pkg] ?? [])])];
writeJson(path, keep);

let msg = `stop-verify: ${failures.length} check(s) failed for code you edited (${pkgs.join(', ')}). Fix only these failures, then finish.\n`;
for (const f of failures) msg += `\n--- ${f.name} (exit ${f.status}) · ${f.cmd}\n${f.out}\n`;
process.stderr.write(msg.length > 9000 ? `${msg.slice(0, 9000)}\n…(truncated)` : msg);
process.exit(2);
