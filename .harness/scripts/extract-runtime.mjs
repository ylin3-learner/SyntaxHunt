#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const IGNORE_DIRS = new Set(['node_modules', '.git', '.cartographer', 'dist', 'build', '.next', 'coverage', '__pycache__', 'out', 'templates', 'playwright-report', 'test-results', 'backups']);

function walk(root) {
  if (!existsSync(root)) return [];
  const results = [];
  for (const entry of readdirSync(root, { recursive: true })) {
    const rel = entry.replace(/\\/g, '/');
    if (rel.split('/').some(p => IGNORE_DIRS.has(p))) continue;
    const abs = join(root, rel);
    if (statSync(abs).isFile()) results.push({ rel, abs });
  }
  return results;
}

function detectStack(root) {
  const pkgPath = join(root, 'package.json');
  if (!existsSync(pkgPath)) return new Set();
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return new Set([
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.devDependencies || {})
    ]);
  } catch {
    return new Set();
  }
}

function extractBalancedBlock(str, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < str.length; i++) {
    if (str[i] === '(') depth++;
    else if (str[i] === ')') {
      depth--;
      if (depth === 0) return str.slice(openIdx + 1, i);
    }
  }
  return '';
}

function extractDbSchemas(files, stack) {
  const sections = [];
  const summary = [];
  const seenTables = new Map();

  for (const { rel, abs } of files) {
    const ext = extname(rel);

    if (rel.endsWith('schema.prisma')) {
      const src = readFileSync(abs, 'utf8').replace(/\/\/.*$/gm, '');
      for (const [, name, body] of src.matchAll(/model\s+(\w+)\s*\{([^}]*)\}/g)) {
        const cols = body.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('@@'));
        sections.push(`### Prisma Model: \`${name}\` (${rel})\n${cols.map(c => `- ${c}`).join('\n')}`);
        summary.push(`Prisma:${name}`);
      }
    }

    if (/schema.*\.(ts|js)$/i.test(rel)) {
      const src = readFileSync(abs, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      for (const [, tName, body] of src.matchAll(/(?:pgTable|mysqlTable|sqliteTable)\s*\(\s*['"]([^'"]+)['"]\s*,\s*\{([^}]*)\}/g)) {
        const cols = body.split(',').map(l => l.trim().replace(/\s+/g, ' ')).filter(Boolean);
        sections.push(`### Drizzle Table: \`${tName}\` (${rel})\n${cols.map(c => `- ${c}`).join('\n')}`);
        summary.push(`Drizzle:${tName}`);
      }
    }

    if (ext === '.sql') {
      const src = readFileSync(abs, 'utf8').replace(/--.*$/gm, '');
      const createRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?[`"']?(\w+)[`"']?\s*\(/gi;
      let match;
      while ((match = createRegex.exec(src)) !== null) {
        const tName = match[1];
        const openIdx = match.index + match[0].length - 1;
        const body = extractBalancedBlock(src, openIdx);
        const cols = body
          .split(/,(?![^(]*\))/)
          .map(l => l.trim().replace(/\s+/g, ' '))
          .filter(l => l && !/^(?:PRIMARY|UNIQUE|KEY|INDEX|CONSTRAINT|CHECK|FOREIGN)/i.test(l));
        if (!seenTables.has(tName)) seenTables.set(tName, { source: rel, cols: [] });
        seenTables.get(tName).cols.push(...cols);
      }

      const alterRegex = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\.)?[`"']?(\w+)[`"']?\s+ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([^;]+)/gi;
      for (const [, tName, added] of src.matchAll(alterRegex)) {
        if (!seenTables.has(tName)) seenTables.set(tName, { source: rel, cols: [] });
        seenTables.get(tName).cols.push(`+ ${added.trim().replace(/\s+/g, ' ')}`);
      }
    }

    if (/\.(ts|tsx|js|jsx|vue|mjs)$/.test(rel) && (stack.has('@supabase/supabase-js') || stack.has('firebase'))) {
      const src = readFileSync(abs, 'utf8');
      for (const [, tbl] of src.matchAll(/\.from\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/g)) {
        if (!seenTables.has(tbl)) seenTables.set(tbl, { source: `client:${rel}`, cols: ['(inferred via BaaS client query)'] });
      }
      for (const [, col] of src.matchAll(/\bcollection\(\s*[^,]+,\s*['"]([a-zA-Z0-9_-]+)['"]\s*\)/g)) {
        if (!seenTables.has(col)) seenTables.set(col, { source: `firestore:${rel}`, cols: ['(inferred via Firestore collection)'] });
      }
    }
  }

  for (const [tName, info] of seenTables.entries()) {
    const uniqueCols = [...new Set(info.cols)];
    sections.push(`### Table: \`${tName}\` (${info.source})\n${uniqueCols.map(c => `- ${c}`).join('\n')}`);
    summary.push(`Table:${tName}`);
  }

  return {
    markdown: sections.length ? sections.join('\n\n') : 'No database schemas detected.',
    summary
  };
}

function extractApiContracts(files) {
  const lines = [];
  const summary = [];
  const seen = new Set();

  const addEndpoint = (method, routePath, source) => {
    const key = `${method} ${routePath}`;
    if (seen.has(key)) return;
    seen.add(key);
    lines.push(`- **${method}** \`${routePath}\` (${source})`);
    summary.push(key);
  };

  for (const { rel, abs } of files) {
    if (rel.endsWith('openapi.json') || rel.endsWith('swagger.json')) {
      try {
        const spec = JSON.parse(readFileSync(abs, 'utf8'));
        for (const [p, methods] of Object.entries(spec.paths || {})) {
          addEndpoint(Object.keys(methods).map(m => m.toUpperCase()).join(', '), p, rel);
        }
      } catch {}
    }

    if (/(?:app|src\/app)\/api\/.+\/route\.(ts|js)$/.test(rel)) {
      const src = readFileSync(abs, 'utf8');
      const methods = [...src.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)\b/g)].map(m => m[1]);
      const routePath = '/' + rel.replace(/^.*?app\//, '').replace(/\/route\.(ts|js)$/, '');
      if (methods.length) addEndpoint(methods.join(', '), routePath, rel);
    } else if (/(?:pages|src\/pages)\/api\/.+\.(ts|js)$/.test(rel)) {
      const routePath = '/' + rel.replace(/^.*?pages\//, '').replace(/\.(ts|js)$/, '').replace(/\/index$/, '');
      addEndpoint('HANDLER', routePath, rel);
    }

    if (/supabase\/functions\/([^/]+)\/index\.(ts|js)$/.test(rel)) {
      const fnName = rel.match(/supabase\/functions\/([^/]+)\//)[1];
      addEndpoint('EDGE_FN', `/functions/v1/${fnName}`, rel);
    } else if (/(?:netlify\/functions|api)\/([^/]+)\.(ts|js)$/.test(rel) && !rel.startsWith('src/')) {
      const fnName = basename(rel, extname(rel));
      addEndpoint('SERVERLESS', `/api/${fnName}`, rel);
    }

    if (/\.(ts|tsx|js|jsx|vue|mjs)$/.test(rel)) {
      const src = readFileSync(abs, 'utf8');
      for (const [, method, routePath] of src.matchAll(/\b(?:app|router|fastify|hono)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/gi)) {
        addEndpoint(method.toUpperCase(), routePath, rel);
      }
      for (const [, fnName] of src.matchAll(/\.functions\.invoke\(\s*['"]([^'"]+)['"]/g)) {
        addEndpoint('INVOKE_FN', `/functions/v1/${fnName}`, rel);
      }
      for (const [, url] of src.matchAll(/\bfetch\(\s*['"`]((?:https?:\/\/|\/api\/)[^'"`\s$]+)['"`]/g)) {
        addEndpoint('FETCH', url, rel);
      }
    }
  }

  return {
    markdown: lines.length ? lines.join('\n') : 'No API contracts detected.',
    summary
  };
}

export function extractRuntimeContext(root = process.cwd()) {
  const files = walk(root);
  const stack = detectStack(root);
  const rawDir = join(root, '.cartographer', 'raw');
  mkdirSync(rawDir, { recursive: true });
  const db = extractDbSchemas(files, stack);
  const api = extractApiContracts(files);
  writeFileSync(join(rawDir, 'runtime-db.md'), `# Runtime DB Schemas\n\n${db.markdown}\n`);
  writeFileSync(join(rawDir, 'runtime-api.md'), `# Runtime API Contracts\n\n${api.markdown}\n`);
  console.log(`[extract-runtime] DB: ${db.summary.length} models | API: ${api.summary.length} endpoints.`);
  return { db: db.summary, api: api.summary };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('extract-runtime.mjs')) {
  extractRuntimeContext();
}
