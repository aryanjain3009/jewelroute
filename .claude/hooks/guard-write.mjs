#!/usr/bin/env node
// PreToolUse(Edit|Write|MultiEdit) guard. Exit 2 blocks the write; stderr tells Claude why.
//  1. secrets in the new content (keys, tokens, private keys, JWTs, connection strings with real passwords)
//  2. edits to already-applied migrations (any committed folder under apps/api/prisma/migrations, or migration_lock.toml)
import { execFileSync } from 'node:child_process';
import { basename, isAbsolute, relative, resolve } from 'node:path';
import { block, dbHosts, LOCAL_DB_HOSTS, projectDir, readInput } from './lib.mjs';

const input = readInput();
const ti = input?.tool_input ?? {};
const filePath = String(ti.file_path ?? '');
if (!filePath) process.exit(0);

const root = projectDir();
const abs = isAbsolute(filePath) ? filePath : resolve(input?.cwd || root, filePath);
const rel = relative(root, abs).split('\\').join('/');
const content = [ti.content, ti.new_string, ...(Array.isArray(ti.edits) ? ti.edits.map((e) => e?.new_string) : [])]
  .filter((x) => typeof x === 'string')
  .join('\n');

// ---------- 1. applied migrations are immutable ----------
const mig = rel.match(/^apps\/api\/prisma\/migrations\/(\d{14}_[^/]+)\//);
if (rel === 'apps/api/prisma/migrations/migration_lock.toml') {
  block('Blocked by guard-write: migration_lock.toml is managed by Prisma. Never edit it.');
}
if (mig) {
  let committed = false;
  try {
    const out = execFileSync('git', ['-C', root, 'ls-files', '--', `apps/api/prisma/migrations/${mig[1]}`], { encoding: 'utf8', timeout: 2000 });
    committed = out.trim().length > 0;
  } catch {
    committed = false;
  }
  if (committed) {
    block(
      `Blocked by guard-write: ${mig[1]} is committed, so it is applied (Vercel runs prisma migrate deploy on every build). ` +
        'Migrations are forward-only. Create a new migration with `pnpm --filter @jewelroute/api exec prisma migrate dev --create-only --name <slug>` (write-migration skill).',
    );
  }
}

// ---------- 2. secrets ----------
// Local .env files are gitignored and are the designated place for local secrets; everything else is scanned.
const name = basename(rel);
const isLocalEnv = (name === '.env' || name.startsWith('.env.')) && !/\.(example|sample|template)$/.test(name);
if (!content || isLocalEnv) process.exit(0);

const PATTERNS = [
  [/-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY-----/, 'a private key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key id'],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}/, 'a GitHub token'],
  [/\bglpat-[A-Za-z0-9_-]{20,}/, 'a GitLab token'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
  [/\b(?:sk|rk)_live_[A-Za-z0-9]{16,}/, 'a Stripe live key'],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/, 'an Anthropic API key'],
  [/\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b/, 'an OpenAI-style API key'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'a Google API key'],
  [/\bvercel_blob_rw_[A-Za-z0-9]{16,}/, 'a Vercel Blob token'],
  [/\bnpm_[A-Za-z0-9]{36}\b/, 'an npm token'],
  [/\bwhsec_[A-Za-z0-9_-]{24,}/, 'a webhook signing secret'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'a JWT'],
];
for (const [re, what] of PATTERNS) {
  if (re.test(content)) block(`Blocked by guard-write: the new content of ${rel} contains ${what}. Secrets live only in gitignored .env files or the deploy platform; reference them as process.env.NAME or \${NAME}.`);
}

// Connection strings with a real password to a non-local host (local dev creds like postgres:postgres@127.0.0.1 are fine).
const PLACEHOLDER = /^(\$\{?[A-Z_][A-Z0-9_]*\}?|<[^>]+>|\*+|x+|password|pass|postgres|secret|changeme|change-me|user|username)$/i;
for (const { host, password } of dbHosts(content)) {
  if (password && !PLACEHOLDER.test(password) && !LOCAL_DB_HOSTS.has(host)) {
    block(`Blocked by guard-write: ${rel} would contain a connection string with a password for "${host}". Use an environment variable (\${DATABASE_URL}).`);
  }
}

// High-entropy values assigned to secret-looking names (KEY/SECRET/TOKEN/PASSWORD).
const entropy = (s) => {
  const f = {};
  for (const c of s) f[c] = (f[c] ?? 0) + 1;
  return Object.values(f).reduce((h, n) => h - (n / s.length) * Math.log2(n / s.length), 0);
};
const ASSIGN = /\b([A-Z0-9_]*(?:SECRET|TOKEN|API_KEY|APIKEY|PASSWORD|PRIVATE_KEY|ACCESS_KEY)[A-Z0-9_]*)\b\s*[:=]\s*['"]?([A-Za-z0-9+/=_\-.]{24,})['"]?/g;
for (const m of content.matchAll(ASSIGN)) {
  const v = m[2];
  if (/test|example|dummy|fake|sample|change-?me|ci-|dev-|local|placeholder|0123456789/i.test(v)) continue;
  if (entropy(v) >= 4.2) block(`Blocked by guard-write: ${m[1]} in ${rel} looks like a real secret (high-entropy value). Put it in a gitignored .env and reference process.env.${m[1]}.`);
}

process.exit(0);
