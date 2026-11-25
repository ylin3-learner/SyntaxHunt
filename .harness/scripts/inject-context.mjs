#!/usr/bin/env node
// Thin CLI wrapper — injects context for impacted test analysis
import fs from 'node:fs';
import path from 'node:path';

let injectRuntimeContext;
try {
  const m = await import('#core/domain/models.mjs');
  injectRuntimeContext = m.extractRuntimeContext;
} catch (_) {
  // Optional core helper fallback
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return {};
  }
}

function main() {
  const ROOT = process.cwd();
  const TESTS_ONLY = process.argv.includes('--tests-only');
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const targetFiles = args.map(f => f.trim()).filter(Boolean);

  if (targetFiles.length === 0) {
    console.error('Usage: node inject-context.mjs [--tests-only] <file1> [file2 ...]');
    process.exit(1);
  }

  const manifest = readJson(path.join(ROOT, '.cartographer', 'manifest.json'));
  const risks = readJson(path.join(ROOT, '.cartographer', 'risks.json'));
  const allFiles = Object.keys(manifest.files || {});

  function getBlastRadius(startFiles) {
    const visited = new Set();
    const queue = [...startFiles];
    while (queue.length > 0) {
      const curr = queue.shift();
      if (visited.has(curr)) continue;
      visited.add(curr);
      for (const parent of (manifest.files[curr]?.imports || [])) {
        if (!visited.has(parent)) queue.push(parent);
      }
    }
    return [...visited];
  }

  function resolveImpactedTests(impactedFiles) {
    const testFiles = allFiles.filter(f => f.endsWith('.test.mjs') || f.endsWith('.spec.mjs'));
    const matched = new Set();
    for (const tf of testFiles) {
      const tfImports = manifest.files[tf]?.imports || [];
      if (impactedFiles.some(imp => imp === tf || tfImports.includes(imp))) {
        matched.add(tf);
      } else {
        for (const imp of impactedFiles) {
          const stem = path.basename(imp, path.extname(imp));
          if (tf.includes(stem + '.test.') || tf.includes(stem + '.spec.')) {
            matched.add(tf);
          }
        }
      }
    }
    return [...matched];
  }

  const impacted = targetFiles.length ? getBlastRadius(targetFiles) : [];
  const impactedTests = resolveImpactedTests(impacted);

  if (TESTS_ONLY) {
    console.log(impactedTests.join(' '));
    process.exit(0);
  }

  console.log('# Impact Analysis Context');
  for (const file of targetFiles) {
    const entry = manifest.files?.[file];
    const node = manifest.files[file] || { imports: [], importedBy: [] };
    const riskInfo = risks?.files?.[file] || risks?.[file];
    console.log('## Target: ' + file);
    if (riskInfo) {
      console.log('- **Risk Score**: ' + (riskInfo.score ?? 'N/A') + ' (' + ((riskInfo.reasons || []).join(', ') || 'standard') + ')');
    }
    console.log('- **Direct Imports (' + node.imports.length + ')**: ' + (node.imports.map(i => '`' + i + '`').join(', ') || 'None'));
    console.log('- **Upstream Dependents / Blast Radius (' + node.importedBy.length + ')**: ' + (node.importedBy.map(i => '`' + i + '`').join(', ') || 'None'));
    console.log('- **Impacted Tests (' + impactedTests.length + ')**: ' + (impactedTests.map(t => '`' + t + '`').join(', ') || 'None'));
    if (entry?.symbols?.length) {
      console.log('- **Symbols**: ' + entry.symbols.map(s => '`' + s.name + '`').join(', '));
    }
  }
  console.log('');
}

main();
