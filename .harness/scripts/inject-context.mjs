#!/usr/bin/env node
// Thin CLI wrapper — injects context & resolves blast-radius tests
import fs from 'node:fs';
import path from 'node:path';

const TEST_FILE_REGEX = /(?:__tests__\/.+\.(?:mjs|js|ts|tsx|jsx)$|\.(?:test|spec)\.(?:mjs|js|ts|tsx|jsx)$)/;

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return {};
  }
}

function norm(p) {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function resolveTargetedContext(root = process.cwd(), rawTargets = []) {
  const manifest = readJson(path.join(root, '.cartographer', 'manifest.json'));
  const risks = readJson(path.join(root, '.cartographer', 'risks.json'));
  const filesMap = manifest.files || {};
  const allFiles = Object.keys(filesMap).map(norm);

  // Build bidirectional reverse-dependency map (who imports whom)
  const reverseDeps = new Map();
  for (const f of allFiles) reverseDeps.set(f, new Set());
  for (const [fRaw, entry] of Object.entries(filesMap)) {
    const f = norm(fRaw);
    for (const impRaw of (entry.imports || [])) {
      const imp = norm(impRaw);
      if (reverseDeps.has(imp)) reverseDeps.get(imp).add(f);
    }
    for (const parentRaw of (entry.importedBy || [])) {
      const parent = norm(parentRaw);
      if (reverseDeps.has(f)) reverseDeps.get(f).add(parent);
    }
  }

  const startFiles = rawTargets.map(norm).filter(Boolean);
  const visited = new Set();
  const queue = [...startFiles];
  while (queue.length > 0) {
    const curr = queue.shift();
    if (visited.has(curr)) continue;
    visited.add(curr);
    for (const dependent of (reverseDeps.get(curr) || [])) {
      if (!visited.has(dependent)) queue.push(dependent);
    }
  }
  const impactedFiles = [...visited];

  // Resolve impacted test files across JS/TS/React/Vue conventions
  const testFiles = allFiles.filter(f => TEST_FILE_REGEX.test(f));
  const matchedTests = new Set();
  for (const tf of testFiles) {
    const entry = filesMap[tf] || filesMap[tf.replace(/\//g, '\\')] || {};
    const tfImports = (entry.imports || []).map(norm);
    if (impactedFiles.some(imp => imp === tf || tfImports.includes(imp))) {
      matchedTests.add(tf);
      continue;
    }
    for (const imp of impactedFiles) {
      const stem = path.basename(imp, path.extname(imp));
      if (stem && new RegExp(`(?:^|/)${stem}\\.(?:test|spec)\\.`).test(tf)) {
        matchedTests.add(tf);
      }
    }
  }

  return {
    targetFiles: startFiles,
    impactedFiles,
    impactedTests: [...matchedTests],
    manifest,
    risks,
  };
}

function main() {
  const ROOT = process.cwd();
  const TESTS_ONLY = process.argv.includes('--tests-only');
  const JSON_OUT = process.argv.includes('--json');
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const targetFiles = args.map(f => f.trim()).filter(Boolean);

  if (targetFiles.length === 0) {
    console.error('Usage: node inject-context.mjs [--tests-only] [--json] <file1> [file2 ...]');
    process.exit(1);
  }

  const ctx = resolveTargetedContext(ROOT, targetFiles);

  if (TESTS_ONLY) {
    console.log(ctx.impactedTests.join(' '));
    process.exit(0);
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({
      targetFiles: ctx.targetFiles,
      impactedFiles: ctx.impactedFiles,
      impactedTests: ctx.impactedTests,
    }, null, 2));
    process.exit(0);
  }

  console.log('# Impact Analysis Context');
  for (const file of ctx.targetFiles) {
    const key = Object.keys(ctx.manifest.files || {}).find(k => norm(k) === file) || file;
    const node = ctx.manifest.files?.[key] || { imports: [], importedBy: [] };
    const riskInfo = ctx.risks?.files?.[key] || ctx.risks?.[key];
    console.log('## Target: ' + file);
    if (riskInfo) {
      console.log('- **Risk Score**: ' + (riskInfo.score ?? 'N/A') + ' (' + ((riskInfo.reasons || []).join(', ') || 'standard') + ')');
    }
    console.log('- **Direct Imports (' + (node.imports || []).length + ')**: ' + ((node.imports || []).map(i => '`' + i + '`').join(', ') || 'None'));
    console.log('- **Blast Radius Files (' + ctx.impactedFiles.length + ')**: ' + (ctx.impactedFiles.map(i => '`' + i + '`').join(', ') || 'None'));
    console.log('- **Impacted Tests (' + ctx.impactedTests.length + ')**: ' + (ctx.impactedTests.map(t => '`' + t + '`').join(', ') || 'None'));
  }
  console.log('');
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('inject-context.mjs')) {
  main();
}
