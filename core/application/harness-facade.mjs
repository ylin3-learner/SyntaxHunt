/**
 * Harness Application Facade & Capability Discovery Contract
 *
 * Unifies use-case orchestration across MCP (JSON-RPC 2.0) and CLI (--json) adapters.
 * Zero external dependencies.
 *
 * @module core/application/harness-facade
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { getBlastRadius, resolveImpactedTests } from '#core/services/graph-engine.mjs';
import { checkState } from '#core/services/circuit-breaker.mjs';

function readJsonSafe(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

/**
 * Single Source of Truth JSON Schema for all Harness capabilities.
 * Shared identically by MCP `tools/list` and CLI `--describe`.
 */
export function describeCapabilities() {
  return {
    protocol: 'harness-facade/v1',
    transports: ['mcp-stdio', 'cli-json'],
    tools: [
      {
        name: 'inspect_impact',
        description: 'Compute dependency blast radius, risk scores, and impacted test files before editing code.',
        inputSchema: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Relative file paths to inspect (e.g., ["core/services/graph-engine.mjs"])',
            },
          },
          required: ['files'],
        },
      },
      {
        name: 'verify_integrity',
        description: 'Run all static ESM hygiene gates, CJS checks, and >=80% core V8 test coverage verification.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'sync_codebase',
        description: 'Re-index repository files with SHA-256 hashing and regenerate PROJECT_MAP.md.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_ground_truth_status',
        description: 'Generate deterministic ground-truth test, git, coverage, and circuit-breaker metrics (updates HANDOFF.md).',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
}

/**
 * Use Case 1: Inspect blast radius and impacted tests for target files.
 */
export function inspectImpact({ files = [], rootDir = process.cwd() } = {}) {
  const manifest = readJsonSafe(path.join(rootDir, '.cartographer', 'manifest.json'), { files: {} });
  const risks = readJsonSafe(path.join(rootDir, '.cartographer', 'risks.json'), { files: {} });
  const allFiles = Object.keys(manifest.files || {});

  const forward = new Map();
  for (const [f, entry] of Object.entries(manifest.files || {})) {
    forward.set(f, entry.imports || []);
  }

  const startSet = new Set(files.filter(Boolean));
  const blastSet = getBlastRadius(forward, startSet);
  const testIds = new Set(allFiles.filter(f => f.endsWith('.test.mjs') || f.endsWith('.spec.mjs')));
  const impactedTests = [...resolveImpactedTests(forward, blastSet, testIds)];

  const targets = [...startSet].map(file => {
    const node = manifest.files?.[file] || { imports: [], importedBy: [] };
    const risk = risks.files?.[file] || risks[file] || null;
    return {
      file,
      riskScore: risk?.score ?? null,
      directImports: node.imports || [],
      upstreamDependents: node.importedBy || [],
    };
  });

  return {
    ok: true,
    blastRadiusCount: blastSet.size,
    impactedFiles: [...blastSet],
    impactedTests,
    targets,
  };
}

/**
 * Use Case 2: Run deterministic verification gates.
 */
export function verifyIntegrity({ rootDir = process.cwd() } = {}) {
  const verifyScript = path.join(rootDir, '.harness', 'scripts', 'verify.mjs');
  try {
    const out = execFileSync(process.execPath, [verifyScript], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { ok: true, circuitBreaker: checkState(), output: out.trim() };
  } catch (err) {
    const combined = `${err.stdout || ''}\n${err.stderr || ''}`.trim();
    return { ok: false, circuitBreaker: checkState(), output: combined || err.message };
  }
}

/**
 * Use Case 3: Synchronize SHA-256 manifest and regenerate PROJECT_MAP.md.
 */
export function syncCodebase({ rootDir = process.cwd() } = {}) {
  const syncScript = path.join(rootDir, '.harness', 'scripts', 'sync-map.mjs');
  const mapScript = path.join(rootDir, '.harness', 'scripts', 'generate-map-md.mjs');
  const syncOut = execFileSync(process.execPath, [syncScript], { cwd: rootDir, encoding: 'utf8' }).trim();
  const mapOut = execFileSync(process.execPath, [mapScript], { cwd: rootDir, encoding: 'utf8' }).trim();
  return { ok: true, syncOutput: syncOut, mapOutput: mapOut };
}

/**
 * Use Case 4: Generate ground-truth status report (zero LLM hallucination).
 */
export function getGroundTruthStatus({ rootDir = process.cwd() } = {}) {
  const handoffScript = path.join(rootDir, '.harness', 'scripts', 'handoff-pack.mjs');
  const report = execFileSync(process.execPath, [handoffScript], { cwd: rootDir, encoding: 'utf8' });
  return { ok: true, report };
}

/**
 * Unified dispatcher for all Driving Adapters (MCP & CLI).
 */
export function executeCapability(toolName, args = {}, rootDir = process.cwd()) {
  switch (toolName) {
    case 'inspect_impact':
      return inspectImpact({ ...args, rootDir });
    case 'verify_integrity':
      return verifyIntegrity({ rootDir });
    case 'sync_codebase':
      return syncCodebase({ rootDir });
    case 'get_ground_truth_status':
      return getGroundTruthStatus({ rootDir });
    default:
      throw new Error(`Unknown harness capability: ${toolName}`);
  }
}
