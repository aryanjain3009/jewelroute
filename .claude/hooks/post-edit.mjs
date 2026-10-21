#!/usr/bin/env node
// PostToolUse(Edit|Write|MultiEdit): record which package the edit dirtied, so stop-verify knows what to check.
// State: .claude/state/dirty.json  { packages: { "apps/api": ["src/x.ts", ...] }, updatedAt }  (gitignored)
import { isAbsolute, relative, resolve } from 'node:path';
import { packageOf, projectDir, readInput, readJson, statePath, writeJson } from './lib.mjs';

const input = readInput();
const filePath = String(input?.tool_input?.file_path ?? '');
if (!filePath) process.exit(0);

const root = projectDir();
const abs = isAbsolute(filePath) ? filePath : resolve(input?.cwd || root, filePath);
const rel = relative(root, abs).split('\\').join('/');
if (rel.startsWith('..')) process.exit(0);

const pkg = packageOf(rel);
if (!pkg) process.exit(0); // docs, brain, rules: nothing to typecheck

const path = statePath('dirty.json');
const state = readJson(path, { packages: {} });
state.packages ??= {};
const files = new Set(state.packages[pkg] ?? []);
files.add(rel);
state.packages[pkg] = [...files].slice(-200);
state.updatedAt = new Date().toISOString();
writeJson(path, state);
process.exit(0);
