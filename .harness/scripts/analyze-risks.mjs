#!/usr/bin/env node
// Thin CLI wrapper — delegates risk analysis to core services
import fs from 'node:fs';
import path from 'node:path';

let recordFailure, reset, checkState, antiCheat;
try {
  const m = await import('#core/services/circuit-breaker.mjs');
  recordFailure = m.recordFailure;
  reset = m.reset;
  checkState = m.checkState;
  antiCheat = m.antiCheat;
} catch (_) {
  // Optional core helper fallback
}

const ROOT = process.cwd();
const CART_DIR = path.join(ROOT, '.cartographer');
const MANIFEST_PATH = path.join(CART_DIR, 'manifest.json');
const RISKS_PATH = path.join(CART_DIR, 'risks.json');

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return { files: {}, version: 1 };
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (_) {
    return { files: {}, version: 1 };
  }
}

function buildGraph(manifest) {
  const files = manifest.files || {};
  const graph = {};
  for (const [rel, entry] of Object.entries(files)) {
    if (!graph[rel]) graph[rel] = { imports: new Set(), importedBy: new Set() };
    const imports = entry.imports || [];
    for (const imp of imports) {
      const target = files[imp] ? imp : (files[rel] ? rel : null);
      if (target && files[target]) {
        graph[rel].imports.add(target);
        if (!graph[target]) graph[target] = { imports: new Set(), importedBy: new Set() };
        graph[target].importedBy.add(rel);
      }
    }
  }
  return graph;
}

function findCycles(graph) {
  const cycles = [];
  const visited = new Set();
  const recStack = new Set();
  const currentPath = [];

  function dfs(node) {
    visited.add(node);
    recStack.add(node);
    currentPath.push(node);
    const imports = graph[node]?.imports || [];
    for (const neighbor of imports) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recStack.has(neighbor)) {
        const cycleStart = currentPath.indexOf(neighbor);
        cycles.push([...currentPath.slice(cycleStart), neighbor]);
      }
    }
    currentPath.pop();
    recStack.delete(node);
  }

  for (const node of Object.keys(graph)) {
    if (!visited.has(node)) dfs(node);
  }

  const seen = new Set();
  return cycles.filter(c => {
    const key = [...c].sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findOrphans(graph) {
  const orphans = [];
  for (const [node, data] of Object.entries(graph)) {
    if (data.imports.size === 0 && data.importedBy.size === 0) {
      orphans.push(node);
    }
  }
  return orphans;
}

function findGodModules(graph, manifest) {
  const gods = [];
  const files = manifest.files || {};
  const GOD_MODULE_THRESHOLD = 15;
  for (const [node, data] of Object.entries(graph)) {
    const entry = files[node] || {};
    const importCount = data.imports.size;
    const exportCount = (entry.signatures || []).length;
    if (importCount > GOD_MODULE_THRESHOLD || exportCount > GOD_MODULE_THRESHOLD) {
      gods.push({
        file: node,
        imports: importCount,
        exports: exportCount,
        reason: importCount > GOD_MODULE_THRESHOLD
          ? `high import count (${importCount})`
          : `high export count (${exportCount})`,
      });
    }
  }
  return gods;
}

function main() {
  const manifest = loadManifest();
  const graph = buildGraph(manifest);
  const cycles = findCycles(graph);
  const orphans = findOrphans(graph);
  const gods = findGodModules(graph, manifest);

  const risks = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalFiles: Object.keys(graph).length,
      circularDependencies: cycles.length,
      orphanFiles: orphans.length,
      godModules: gods.length,
    },
    circularDependencies: cycles,
    orphanFiles: orphans,
    godModules: gods,
  };

  fs.mkdirSync(CART_DIR, { recursive: true });
  const prevRaw = fs.existsSync(RISKS_PATH) ? fs.readFileSync(RISKS_PATH, "utf8") : "";
  const stripTs = (s) => s.replace(/"generatedAt":\s*"[^"]*"/g, "");
  const nextRaw = JSON.stringify(risks, null, 2) + "\n";
  if (!prevRaw || stripTs(prevRaw) !== stripTs(nextRaw)) {
    fs.writeFileSync(RISKS_PATH, nextRaw, "utf8");
  }

  const out = [
    '# Risk Analysis',
    `- Total files scanned: ${risks.summary.totalFiles}`,
    `- Circular dependencies: ${risks.summary.circularDependencies}`,
    `- Orphan files: ${risks.summary.orphanFiles}`,
    `- God modules: ${risks.summary.godModules}`,
  ];

  if (cycles.length > 0) {
    out.push('\n## Circular Dependencies');
    for (const cycle of cycles) out.push('- ' + cycle.join(' -> '));
  }
  if (orphans.length > 0) {
    out.push('\n## Orphan Files');
    for (const f of orphans) out.push('- ' + f);
  }
  if (gods.length > 0) {
    out.push(`\n## God Modules (>${15} imports/exports)`);
    for (const g of gods) out.push(`- ${g.file}: ${g.reason}`);
  }

  console.log(out.join('\n'));
}

main();
