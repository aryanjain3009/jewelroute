// Shared helpers for JewelRoute Claude Code hooks. Node built-ins only; every hook must finish in well under a second.
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repo root: CLAUDE_PROJECT_DIR when Claude Code runs us, else two levels above this file. */
export const projectDir = () => process.env.CLAUDE_PROJECT_DIR || resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Read the hook's stdin JSON. Invalid or empty input → {} (the hook then permits; it never crashes the session). */
export function readInput() {
  try {
    const raw = readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Block the tool call (PreToolUse) or the stop (Stop): exit 2, the reason goes to Claude via stderr. */
export function block(reason) {
  process.stderr.write(`${reason}\n`);
  process.exit(2);
}

export const LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'db', 'postgres', 'host.docker.internal']);

/** Hostnames of every database connection string in `text`. */
export function dbHosts(text) {
  const out = [];
  const re = /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|rediss?):\/\/([^\s'"`]+)/gi;
  for (const m of text.matchAll(re)) {
    const authority = m[1].split(/[/?#]/)[0];
    const at = authority.lastIndexOf('@');
    const userinfo = at >= 0 ? authority.slice(0, at) : '';
    const hostPort = authority.slice(at + 1);
    const host = hostPort.startsWith('[') ? hostPort.slice(0, hostPort.indexOf(']') + 1) : hostPort.split(':')[0];
    const colon = userinfo.indexOf(':');
    out.push({ host: host.toLowerCase(), url: m[0], password: colon >= 0 ? userinfo.slice(colon + 1) : null });
  }
  return out;
}

export const statePath = (...p) => join(projectDir(), '.claude', 'state', ...p);

export function readJson(path, fallback) {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

/** Map a repo-relative file to the package whose checks must re-run. */
export function packageOf(rel) {
  if (rel.startsWith('apps/api/')) return 'apps/api';
  if (rel.startsWith('apps/web/')) return 'apps/web';
  if (rel.startsWith('packages/shared/')) return 'packages/shared';
  if (rel.startsWith('.claude/hooks/') || rel.startsWith('scripts/harness/') || rel.startsWith('scripts/mcp/') || rel === '.claude/settings.json' || rel === '.mcp.json') return 'harness';
  return null;
}
