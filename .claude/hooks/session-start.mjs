#!/usr/bin/env node
// SessionStart(startup|resume|clear|compact): print the repo memory so every session starts oriented.
// stdout = context. Hard cap 6,000 chars (Claude Code swaps output >10,000 chars for a file path).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectDir, readInput } from './lib.mjs';

const CAP = 6000;
const input = readInput();
const root = projectDir();
const read = (p) => {
  try {
    return readFileSync(join(root, p), 'utf8');
  } catch {
    return '';
  }
};

const memory = read('docs/brain/MEMORY.md').trim() || '(docs/brain/MEMORY.md missing)';

let git = '';
try {
  git = execFileSync('git', ['-C', root, 'status', '-sb'], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trimEnd();
  const lines = git.split('\n');
  if (lines.length > 21) git = [...lines.slice(0, 21), `… ${lines.length - 21} more`].join('\n');
} catch {
  git = '(git status unavailable)';
}

// Confirmed learnings → "L0001 title — rule"
const learnings = [];
for (const block of read('docs/brain/learnings.md').split(/\n(?=## L\d{4})/)) {
  const head = block.match(/^## (L\d{4}) · (.+)$/m);
  if (!head || !/status:\s*confirmed/.test(block)) continue;
  const rule = (block.match(/^- rule:\s*(.+)$/m)?.[1] ?? '').trim();
  learnings.push(`- ${head[1]} ${head[2]}${rule ? ` — ${rule}` : ''}`);
}

const parts = [
  `# JewelRoute session brief (${input?.source ?? 'startup'}) — from .claude/hooks/session-start.mjs`,
  '## docs/brain/MEMORY.md',
  memory,
  '## git status -sb',
  git,
  '## Confirmed learnings (docs/brain/learnings.md)',
];
let out = parts.join('\n\n');
let dropped = 0;
for (const l of learnings) {
  if (out.length + l.length + 120 > CAP) {
    dropped++;
    continue;
  }
  out += `\n${l}`;
}
if (dropped) out += `\n… ${dropped} more confirmed learnings: grep -n "status: confirmed" docs/brain/learnings.md`;
if (out.length > CAP) out = `${out.slice(0, CAP - 80)}\n…(truncated at ${CAP} chars; read docs/brain/MEMORY.md)`;
process.stdout.write(`${out}\n`);
process.exit(0);
