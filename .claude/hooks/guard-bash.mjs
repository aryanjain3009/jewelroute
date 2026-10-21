#!/usr/bin/env node
// PreToolUse(Bash) guard. Blocks destructive or secret-leaking commands with exit 2 (the reason goes to Claude).
// Covers: rm -rf outside tmp/scratch · git push --force · git reset --hard on main · psql DROP/TRUNCATE ·
// prisma db push / migrate reset · non-local database hosts · curl|sh · printing .env files · editing applied migrations.
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import { block, dbHosts, LOCAL_DB_HOSTS, projectDir, readInput } from './lib.mjs';

const input = readInput();
const command = String(input?.tool_input?.command ?? '');
const cwd = input?.cwd || projectDir();
if (!command.trim()) process.exit(0);

// ---------- tokenizer: words + operators, quotes respected ----------
function tokenize(s) {
  const out = [];
  let cur = '';
  let has = false;
  const push = () => {
    if (has) out.push(cur);
    cur = '';
    has = false;
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'") {
      const j = s.indexOf("'", i + 1);
      cur += s.slice(i + 1, j < 0 ? s.length : j);
      has = true;
      i = j < 0 ? s.length : j;
    } else if (c === '"') {
      let j = i + 1;
      while (j < s.length && s[j] !== '"') j += s[j] === '\\' ? 2 : 1;
      cur += s.slice(i + 1, j).replace(/\\(.)/g, '$1');
      has = true;
      i = j;
    } else if (c === '\\' && i + 1 < s.length) {
      cur += s[++i];
      has = true;
    } else if (/\s/.test(c) && c !== '\n') {
      push();
    } else if (c === '\n' || c === ';' || c === '|' || c === '&' || c === '(' || c === ')') {
      push();
      const two = s.slice(i, i + 2);
      if (two === '&&' || two === '||' || two === '|&') i++;
      out.push({ sep: true });
    } else if (c === '>' || c === '<') {
      if (/^\d$/.test(cur)) cur = '';
      push();
      if (s[i + 1] === '>') i++;
      out.push({ redir: c });
    } else {
      cur += c;
      has = true;
    }
  }
  push();
  return out;
}

function segments(tokens) {
  const segs = [[]];
  for (const t of tokens) {
    if (typeof t === 'object' && t.sep) segs.push([]);
    else segs.at(-1).push(t);
  }
  return segs.filter((s) => s.length);
}

const WRAPPERS = new Set(['sudo', 'command', 'builtin', 'time', 'nice', 'nohup', 'timeout', 'xargs', 'exec', 'env', 'stdbuf']);
/** Program and its args, skipping VAR=value assignments and wrappers like sudo/xargs/timeout. */
function programOf(seg) {
  const words = seg.filter((t) => typeof t === 'string');
  let i = 0;
  while (i < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]) || WRAPPERS.has(words[i]) || (words[i - 1] === 'timeout' && /^\d/.test(words[i])))) i++;
  return { prog: basename(words[i] ?? ''), args: words.slice(i + 1), words };
}

const tokens = tokenize(command);
const segs = segments(tokens);
const deny = (why, fix) => block(`Blocked by .claude/hooks/guard-bash.mjs: ${why}.${fix ? ` ${fix}` : ''}`);

// ---------- 1. curl | sh (whole command; the pipe is the point) ----------
if (/\b(curl|wget)\b[^|;&]*\|\s*(sudo\s+)?(ba|z|da|k)?sh\b/.test(command) || /\b(ba|z)?sh\s+<\(\s*(curl|wget)\b/.test(command)) {
  deny('piping a downloaded script into a shell', 'Download it, read it, then run it explicitly if the human agrees.');
}

// ---------- 2. non-local database hosts ----------
for (const { host } of dbHosts(command)) {
  if (!LOCAL_DB_HOSTS.has(host)) deny(`database host "${host}" is not local`, 'Agents only touch the local Postgres. Hosted DB changes go through the Vercel build (docs/brain/learnings.md L0002).');
}
if (/neon\.tech\b/i.test(command)) deny('the command references a hosted Neon database', 'Use the local Postgres.');
for (const seg of segs) {
  const { prog, args, words } = programOf(seg);
  const pgTool = /^(psql|pg_dump|pg_restore|pg_dumpall|createdb|dropdb|pgcli)$/.test(prog);
  for (const w of words) {
    const m = w.match(/^(?:PGHOST|DB_HOST)=(.+)$/);
    if (m && !LOCAL_DB_HOSTS.has(m[1].toLowerCase())) deny(`PGHOST "${m[1]}" is not local`);
  }
  if (pgTool) {
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      const h = a === '-h' || a === '--host' ? args[i + 1] : a.startsWith('--host=') ? a.slice(7) : /^-h.+/.test(a) ? a.slice(2) : null;
      if (h && !LOCAL_DB_HOSTS.has(h.toLowerCase())) deny(`${prog} host "${h}" is not local`);
    }
  }
}

// ---------- 3. destructive SQL / schema tools ----------
const sqlText = segs.filter((sg) => programOf(sg).prog !== 'git').map((sg) => sg.filter((t) => typeof t === 'string').join(' ')).join(' ');
if (segs.some((sg) => programOf(sg).prog === 'psql') && /\b(drop|truncate)\b/i.test(sqlText)) {
  deny('DROP/TRUNCATE through psql', 'Schema changes are forward-only migrations (.claude/rules/migrations.md); ask the human for data wipes.');
}
for (const seg of segs) {
  const { prog, args } = programOf(seg);
  if (prog === 'dropdb') deny('dropdb');
  const line = [prog, ...args].join(' ');
  if (/\bprisma\b.*\b(db\s+push|migrate\s+reset)\b/.test(line) || /--force-reset\b/.test(line)) {
    deny('prisma db push / migrate reset bypass or destroy migration history', 'Write a migration with `prisma migrate dev --create-only` (write-migration skill).');
  }
}

// ---------- 4. git push --force, git reset --hard on main ----------
function currentBranch(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }).trim();
  } catch {
    return '';
  }
}
for (const seg of segs) {
  const { prog, args } = programOf(seg);
  if (prog !== 'git') continue;
  let dir = cwd;
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-C') dir = resolve(cwd, args[++i] ?? '.');
    else if (args[i] === '-c') i++;
    else rest.push(args[i]);
  }
  const sub = rest.find((a) => !a.startsWith('-'));
  const subArgs = rest.slice(rest.indexOf(sub) + 1);
  if (sub === 'push' && subArgs.some((a) => /^(-f|--force|--force-with-lease(=.*)?|--force-if-includes|--mirror)$/.test(a) || /^-[a-eg-zA-Z]*f/.test(a) || (/^\+/.test(a) && a.length > 1))) {
    deny('force push', 'Push a new commit instead; history on shared branches is never rewritten.');
  }
  if (sub === 'reset' && subArgs.includes('--hard')) {
    const branch = currentBranch(dir);
    if (branch === 'main' || branch === 'master') deny(`git reset --hard on ${branch}`, 'Other agents may have uncommitted work here. Use `git stash` or a branch.');
  }
}

// ---------- 5. rm -rf outside tmp/scratch ----------
const TMP_ROOTS = [...new Set(['/tmp', tmpdir(), process.env.TMPDIR].filter(Boolean).map((p) => resolve(p)))];
function rmTargetIsSafe(t) {
  if (/[`]|\$\(/.test(t) || t.startsWith('~')) return false;
  let p = t.replace(/\$\{?TMPDIR\}?/g, tmpdir());
  if (p.includes('$')) return false;
  p = resolve(cwd, p);
  if (TMP_ROOTS.some((r) => p.startsWith(r + sep))) return true;
  const rel = relative(projectDir(), p);
  const parts = (isAbsolute(rel) || rel.startsWith('..') ? p : rel).split(sep);
  const i = parts.findIndex((x) => /^(\.?tmp|temp|scratch|scratchpad)$/i.test(x));
  return i >= 0 && i < parts.length - 1;
}
for (const seg of segs) {
  const { prog, args } = programOf(seg);
  if (prog !== 'rm') continue;
  let rec = false;
  let force = false;
  const targets = [];
  let flagsDone = false;
  for (const a of args) {
    if (!flagsDone && a === '--') flagsDone = true;
    else if (!flagsDone && /^--/.test(a)) {
      if (a === '--recursive') rec = true;
      if (a === '--force') force = true;
    } else if (!flagsDone && /^-[a-zA-Z]+$/.test(a)) {
      if (/[rR]/.test(a)) rec = true;
      if (/f/.test(a)) force = true;
    } else targets.push(a);
  }
  if (rec && force) {
    const bad = targets.filter((t) => !rmTargetIsSafe(t));
    if (bad.length || !targets.length) deny(`rm -rf outside a tmp/scratch directory (${bad.join(' ') || 'no target'})`, 'Delete inside /tmp or a tmp/ or scratch/ folder, or ask the human.');
  }
}

// ---------- 6. printing .env files ----------
const isEnvFile = (w) => {
  const b = basename(w);
  if (/\.(example|sample|template|dist)$/i.test(b)) return false;
  return b === '.env' || b.startsWith('.env.') || /\.env$/.test(b);
};
const READERS = new Set(['cat', 'less', 'more', 'head', 'tail', 'bat', 'batcat', 'grep', 'rg', 'egrep', 'fgrep', 'ag', 'awk', 'gawk', 'sed', 'strings', 'xxd', 'od', 'hexdump', 'nl', 'tac', 'cut', 'sort', 'uniq', 'base64', 'jq', 'vi', 'vim', 'nvim', 'nano', 'emacs', 'code', 'diff', 'source', '.', 'node', 'python', 'python3', 'ruby', 'perl', 'curl', 'scp', 'rsync', 'tr', 'paste', 'column', 'dotenv', 'openssl', 'gpg', 'zip', 'tar']);
const INTERPRETERS = new Set(['node', 'python', 'python3', 'ruby', 'perl']);
for (const seg of segs) {
  const { prog, args } = programOf(seg);
  for (let i = 0; i < seg.length; i++) {
    const t = seg[i];
    if (typeof t === 'object' && t.redir === '<' && typeof seg[i + 1] === 'string' && isEnvFile(seg[i + 1])) deny('reading a .env file', 'Ask the human for the variable name you need, never its value.');
  }
  if (INTERPRETERS.has(prog) && args.some((a) => /(^|[\s'"`/(])\.env(\.(?!example|sample|template)[A-Za-z]+)?(?=[\s'"`),]|$)/.test(a) && !a.startsWith('--env-file'))) {
    deny('inline code reading a .env file', 'Ask the human for the variable name you need, never its value.');
  }
  const envArgs = args.filter((a) => !a.startsWith('--env-file') && isEnvFile(a.replace(/^.*[=@]/, '')));
  if (!envArgs.length) continue;
  if (prog === 'cp' || prog === 'mv' || prog === 'install') {
    if (args.filter((a) => !a.startsWith('-')).slice(0, -1).some((a) => isEnvFile(a))) deny('copying a .env file somewhere it can be read', 'Copy .env.example instead.');
    continue;
  }
  if (INTERPRETERS.has(prog) && !args.some((a) => /^(-e|-c|-p|--eval|--print|-pe|-ne)$/.test(a))) continue;
  if (READERS.has(prog)) deny(`printing a .env file (${envArgs.join(' ')})`, 'Secrets never enter the transcript. Ask the human for the variable name you need, never its value.');
}

// ---------- 7. editing an applied (committed) migration through the shell ----------
const MIG = /(^|\/)apps\/api\/prisma\/migrations\/(\d{14}_[^/\s]+|migration_lock\.toml)/;
function tracked(p) {
  try {
    execFileSync('git', ['-C', projectDir(), 'ls-files', '--error-unmatch', resolve(cwd, p)], { stdio: 'ignore', timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}
for (const seg of segs) {
  const { prog, args } = programOf(seg);
  const redirTargets = seg.filter((t, i) => i > 0 && typeof t === 'string' && typeof seg[i - 1] === 'object' && seg[i - 1].redir === '>');
  const inPlace = (prog === 'sed' || prog === 'perl') && args.some((a) => /^-[a-zA-Z]*i/.test(a));
  const writer = inPlace || ['rm', 'mv', 'truncate', 'tee', 'dd', 'unlink', 'shred'].includes(prog);
  const cpDest = prog === 'cp' ? args.filter((a) => !a.startsWith('-')).slice(-1) : [];
  const touched = [...(writer ? args : []), ...redirTargets, ...cpDest].filter((a) => MIG.test(a));
  const applied = touched.filter((a) => tracked(a.replace(/\/+$/, '')));
  if (applied.length) deny(`modifying an applied migration (${applied.join(' ')})`, 'Migrations are forward-only: write a new one (.claude/rules/migrations.md).');
}

process.exit(0);
