#!/usr/bin/env node
// Thin CLI wrapper — generates compact, Mermaid-safe PROJECT_MAP.md (<= 200 lines)
import fs from 'node:fs';
import path from 'node:path';
import { detectAggregateRoots } from '#core/services/graph-engine.mjs';

const MAX_MAP_LINES = 200;

function readJsonSafe(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function escapeMermaidLabel(label) {
  const safeId = label.replace(/[^a-zA-Z0-9_]/g, "_");
  if (label.includes("/") || label.includes(".")) {
    return `${safeId}["${label.replace(/"/g, "'")}"]`;
  }
  return safeId;
}

function toDomainTerm(filePath) {
  const stem = path.basename(filePath, path.extname(filePath));
  return stem
    .replace(/[-_.]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function extractExistingGlossaryRows(existingMd) {
  const preserved = new Map();
  const sec7Match = existingMd.match(/## 7\. Ubiquitous Language Glossary[\s\S]*?(?=\n## |\n*$)/);
  if (!sec7Match) return preserved;

  const lines = sec7Match[0].split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || trimmed.startsWith('| Business Domain Term') || trimmed.startsWith('| :---')) {
      continue;
    }
    const cells = trimmed.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length >= 2) {
      const term = cells[0];
      const mod = cells[1].replace(/`/g, '');
      const agg = cells[2] || '';
      preserved.set(mod, { term, mod, agg });
    }
  }
  return preserved;
}

function foldLongTailByDirectory(foldedFiles) {
  const dirCounts = new Map();
  for (const file of foldedFiles) {
    const dir = path.dirname(file).replace(/\\/g, '/');
    const topDir = dir === '.' ? '(root)' : dir.split('/').slice(0, 3).join('/');
    dirCounts.set(topDir, (dirCounts.get(topDir) || 0) + 1);
  }
  return [...dirCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([dir, count]) => `- \`${dir}/*\` (${count} files folded — query via \`inspect_impact\`)`);
}

function buildRuntimeSection(cartDir) {
  const dbPath = path.join(cartDir, "raw", "runtime-db.md");
  const apiPath = path.join(cartDir, "raw", "runtime-api.md");
  const dbLines = fs.existsSync(dbPath)
    ? fs.readFileSync(dbPath, "utf8").split(/\r?\n/).filter(l => l.startsWith("### ")).map(l => l.replace("### ", "")).slice(0, 8)
    : [];
  const apiLines = fs.existsSync(apiPath)
    ? fs.readFileSync(apiPath, "utf8").split(/\r?\n/).filter(l => l.startsWith("- **")).slice(0, 10)
    : [];
  return [
    "## 6. Runtime Context (DB & API)",
    dbLines.length ? `**DB Schemas**: ${dbLines.join(" | ")}` : "- **DB Schemas**: None detected (see `.cartographer/raw/runtime-db.md`).",
    ...(apiLines.length ? ["**API Endpoints**:", ...apiLines] : ["- **API Endpoints**: None detected (see `.cartographer/raw/runtime-api.md`)."]),
    ""
  ];
}

export function generateMapMd(ROOT = process.cwd()) {
  const cartDir = path.join(ROOT, '.cartographer');
  const manifest = readJsonSafe(path.join(cartDir, 'manifest.json'), { files: {} });
  const risks = readJsonSafe(path.join(cartDir, 'risks.json'), { summary: {} });
  const mapPath = path.join(ROOT, 'PROJECT_MAP.md');
  const existingMd = fs.existsSync(mapPath) ? fs.readFileSync(mapPath, 'utf8') : '';

  const filesObj = manifest.files || {};
  const allFiles = Object.keys(filesObj).sort();

  // Build forward & reverse dependency maps
  const forward = new Map();
  const inboundCount = new Map();
  for (const f of allFiles) {
    forward.set(f, filesObj[f]?.imports || []);
    inboundCount.set(f, (filesObj[f]?.importedBy || []).length);
  }
  for (const [f, deps] of forward.entries()) {
    for (const d of deps) {
      if (inboundCount.has(d)) {
        inboundCount.set(d, inboundCount.get(d) + 1);
      }
    }
  }

  // Detect Aggregate Roots via pure core graph-engine
  let aggregateSet = new Set();
  try {
    const detected = detectAggregateRoots(forward);
    if (detected instanceof Set) {
      aggregateSet = detected;
    } else if (Array.isArray(detected)) {
      aggregateSet = new Set(detected);
    } else if (detected && typeof detected === 'object') {
      aggregateSet = new Set(Object.keys(detected).filter(k => detected[k]));
    }
  } catch (_) {}

  // Also include high inbound coupling (>= 3) or schema/model files
  for (const f of allFiles) {
    if ((inboundCount.get(f) || 0) >= 3 || /(schema|model|store|context)/i.test(f)) {
      aggregateSet.add(f);
    }
  }

  // Tiered sorting: Aggregate Roots first, then by inbound coupling descending
  const rankedFiles = [...allFiles].sort((a, b) => {
    const aAgg = aggregateSet.has(a) ? 1 : 0;
    const bAgg = aggregateSet.has(b) ? 1 : 0;
    if (aAgg !== bAgg) return bAgg - aAgg;
    const aIn = inboundCount.get(a) || 0;
    const bIn = inboundCount.get(b) || 0;
    if (aIn !== bIn) return bIn - aIn;
    return a.localeCompare(b);
  });

  // Dynamic line budget allocation (guarantee total lines <= 200)
  const topAggregates = rankedFiles.filter(f => aggregateSet.has(f)).slice(0, 35);
  const nonAggregates = rankedFiles.filter(f => !aggregateSet.has(f));
  const topRegular = nonAggregates.slice(0, 25);
  const foldedRegular = nonAggregates.slice(25);
  const visibleModules = [...topAggregates, ...topRegular];

  // Section 1 & 2: Overview & Mermaid Architecture Diagram (Top 12 hubs only)
  const mermaidHubs = rankedFiles.slice(0, 12);
  const mermaidEdges = [];
  for (const hub of mermaidHubs) {
    const deps = (forward.get(hub) || []).filter(d => mermaidHubs.includes(d)).slice(0, 3);
    for (const d of deps) {
      mermaidEdges.push(`  ${escapeMermaidLabel(hub)} --> ${escapeMermaidLabel(d)}`);
    }
  }

  const sections = [
    '# PROJECT_MAP.md',
    `> Auto-generated repository map (Tiered Top-N Summary, max ${MAX_MAP_LINES} lines). Total indexed files: **${allFiles.length}** | Aggregate Roots: **${aggregateSet.size}**`,
    '',
    '## 1. Repository Overview',
    `- **Total Indexed Files**: ${allFiles.length}`,
    `- **Detected Aggregate Roots**: ${aggregateSet.size}`,
    `- **Circular Dependencies**: ${risks.summary?.circularDependencies ?? 0}`,
    `- **God Modules**: ${risks.summary?.godModules ?? 0}`,
    '',
    '## 2. Core Dependency Topology (Top Hubs)',
    '```mermaid',
    'graph TD',
    ...(mermaidEdges.length > 0 ? mermaidEdges : [`  ${escapeMermaidLabel("core/application/harness-facade.mjs")} --> ${escapeMermaidLabel("core/services/graph-engine.mjs")}`]),
    '```',
    '',
    '## 3. Module Directory (Tiered Top-N & Aggregate Roots)',
    ...visibleModules.map(f => {
      const tag = aggregateSet.has(f) ? ' **`[Aggregate Root]`**' : '';
      const refs = inboundCount.get(f) || 0;
      return `- \`${f}\`${tag} (refs: ${refs})`;
    }),
    ...(foldedRegular.length > 0
      ? ['', '### Folded Long-Tail Directories', ...foldLongTailByDirectory(foldedRegular).slice(0, 25)]
      : []),
    '',
    '## 4. Verification & Risk Gates',
    '- Run `node .harness/scripts/harness.mjs inspect_impact --files=<path> --json` before editing.',
    '- Run `npm run verify` to enforce static ESM hygiene and `>=80%` core coverage.',
    '',
    ...buildRuntimeSection(cartDir),
    '## 7. Ubiquitous Language Glossary',
    '| Business Domain Term | Technical Module | Aggregate Root |',
    '| :--- | :--- | :--- |',
  ];

  // Merge preserved human-curated rows + auto-seeded Aggregate Root rows (capped at 35 rows)
  const preservedRows = extractExistingGlossaryRows(existingMd);
  const glossaryMap = new Map(preservedRows);

  for (const mod of topAggregates) {
    if (!glossaryMap.has(mod)) {
      glossaryMap.set(mod, {
        term: toDomainTerm(mod),
        mod,
        agg: '`[Aggregate Root]`',
      });
    } else {
      const existing = glossaryMap.get(mod);
      existing.agg = '`[Aggregate Root]`';
    }
  }

  const glossaryRows = [...glossaryMap.values()].slice(0, 35);
  if (glossaryRows.length === 0) {
    sections.push('| Core Application Facade | `core/application/harness-facade.mjs` | `[Aggregate Root]` |');
  } else {
    for (const row of glossaryRows) {
      sections.push(`| ${row.term} | \`${row.mod}\` | ${row.agg} |`);
    }
  }

  // Hard 200-line ceiling guardrail
  let finalLines = sections.join('\n').split(/\r?\n/);
  if (finalLines.length > MAX_MAP_LINES) {
    finalLines = [
      ...finalLines.slice(0, MAX_MAP_LINES - 2),
      '',
      `> *(Truncated at ${MAX_MAP_LINES}-line ceiling to preserve LLM context budget. Query full graph via \`inspect_impact\`.)*`,
    ];
  }

  const output = finalLines.join('\n') + '\n';
  fs.writeFileSync(mapPath, output, 'utf8');
  console.log(`[generate-map-md] PROJECT_MAP.md regenerated (${finalLines.length} lines, cap: ${MAX_MAP_LINES}).`);
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("generate-map-md.mjs")) {
  generateMapMd();
}
