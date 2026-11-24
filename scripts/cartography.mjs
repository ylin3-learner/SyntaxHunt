import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join as pjoin, relative as prelative } from 'node:path/posix';

const ROOT = process.cwd().replace(/\\/g, '/');
const MAX_DEPTH = 3;
const MAX_ENTRIES_PER_DIR = 30;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next']);
const API_PATTERNS = [
  /\bfetch\s*\(/,
  /\baxios\.(get|post|put|delete|patch|request)\s*\(/,
  /\bcreateClient\s*\(/,
  /\bsupabase\b/,
  /\bfirebase\b/,
];
const ROUTE_NAME_HINTS = /route/i;
const TYPE_NAME_HINTS = /\/(types?|interfaces?|schemas?|models?)\/|(types?|interface|schema|model)\.[jt]sx?$|\.d\.ts$/i;

function detectSrcDir() {
  for (const d of ['src', 'app', 'source', 'lib']) {
    if (existsSync(pjoin(ROOT, d))) return d;
  }
  return '.';
}

function detectPkgManager() {
  if (existsSync(pjoin(ROOT, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(pjoin(ROOT, 'yarn.lock'))) return 'yarn';
  if (existsSync(pjoin(ROOT, 'bun.lockb'))) return 'bun';
  if (existsSync(pjoin(ROOT, 'package-lock.json'))) return 'npm';
  return 'unknown';
}

function scanDir(dir, depth, lines) {
  if (depth > MAX_DEPTH) return;
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  entries.sort();
  let shown = 0;
  for (const entry of entries) {
    if (shown >= MAX_ENTRIES_PER_DIR) break;
    if (SKIP_DIRS.has(entry)) continue;
    const full = pjoin(dir, entry);
    let stat;
    try { stat = statSync(full); } catch { continue; }
    const rel = prelative(ROOT, full).split('\\').join('/');
    const indent = '  '.repeat(depth);
    if (stat.isDirectory()) {
      lines.push(`${indent}${entry}/`);
      scanDir(full, depth + 1, lines);
    } else {
      lines.push(`${indent}${entry}`);
    }
    shown++;
  }
}

function findFiles(dir, namePattern, max = 8) {
  const results = [];
  function walk(d) {
    if (results.length >= max) return;
    let entries;
    try { entries = readdirSync(d); } catch { return; }
    for (const e of entries) {
      if (results.length >= max) return;
      if (e.startsWith('.') || SKIP_DIRS.has(e)) continue;
      const full = pjoin(d, e);
      let stat;
      try { stat = statSync(full); } catch { continue; }
      if (stat.isDirectory()) walk(full);
      else if (namePattern.test(e) || namePattern.test(full)) results.push(full);
    }
  }
  walk(dir);
  return results;
}

function scanApiCalls(srcDir, max = 8) {
  const hits = [];
  const files = findFiles(srcDir, /\.[jt]sx?$/, 60);
  for (const f of files) {
    if (hits.length >= max) break;
    let content;
    try { content = readFileSync(pjoin(ROOT, f), 'utf8'); } catch { continue; }
    for (const pat of API_PATTERNS) {
      const m = content.match(pat);
      if (m) {
        hits.push(`${f}: ${m[0]}`);
        break;
      }
    }
  }
  return hits;
}

const srcDir = detectSrcDir();
const pkgMgr = detectPkgManager();

const topo = [`${srcDir}/`];
scanDir(pjoin(ROOT, srcDir), 1, topo);

const routes = findFiles(srcDir, ROUTE_NAME_HINTS, 8);
const apiCalls = scanApiCalls(srcDir, 8);
const types = findFiles(srcDir, TYPE_NAME_HINTS, 8);

const out = [];
out.push('# Project Cartography');
out.push('');
out.push(`- **Source root**: \`${srcDir}/\` (auto-detected)`);
out.push(`- **Package manager**: ${pkgMgr}`);
out.push('');
out.push('## Directory Topology');
for (const line of topo) out.push(line);
out.push('');
out.push('## Route Definitions');
if (routes.length) for (const r of routes) out.push(`- \`${r}\``);
else out.push('(none detected)');
out.push('');
out.push('## External API Call Points');
if (apiCalls.length) for (const a of apiCalls) out.push(`- ${a}`);
else out.push('(none detected)');
out.push('');
out.push('## Core Type Definitions');
if (types.length) for (const t of types) out.push(`- \`${t}\``);
else out.push('(none detected)');

console.log(out.join('\n'));
