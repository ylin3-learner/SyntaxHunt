#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = process.cwd();
const TIMEOUT_MS = 4000;

const checks = [
  { name: 'Syntax: init.mjs', args: ['--check', 'init.mjs'], skipIfMissing: true },
  { name: 'Pipeline: extract-skeleton', args: ['.harness/scripts/extract-skeleton.mjs'] },
  { name: 'Pipeline: analyze-risks', args: ['.harness/scripts/analyze-risks.mjs'] },
  { name: 'Pipeline: generate-map-md', args: ['.harness/scripts/generate-map-md.mjs'] },
  { name: 'Pipeline: inject-context', args: ['.harness/scripts/inject-context.mjs', '.harness/scripts/sync-map.mjs'] },
  { name: 'Pipeline: extract-runtime', args: ['.harness/scripts/extract-runtime.mjs'] },
  { name: 'Pipeline: sync-map', args: ['.harness/scripts/sync-map.mjs'] },
  { name: 'Gate: verify --targeted', args: ['.harness/scripts/verify.mjs', '--targeted', 'init.mjs'] }
];

console.log('🧪 Running Harness Smoke & Regression Tests...\n');
let passed = 0;

for (const c of checks) {
  if (c.skipIfMissing && !existsSync(join(ROOT, c.args[c.args.length - 1]))) continue;
  const start = Date.now();
  try {
    execFileSync(process.execPath, c.args, { cwd: ROOT, timeout: TIMEOUT_MS, stdio: 'pipe' });
    console.log('✅ [PASS] ' + c.name + ' (' + (Date.now() - start) + 'ms)');
    passed++;
  } catch (err) {
    console.error('❌ [FAIL] ' + c.name + ' (' + (err.killed ? 'TIMEOUT > 4s' : 'EXIT ' + err.status) + ')');
    if (err.stderr) console.error(err.stderr.toString().trim());
    process.exit(1);
  }
}

// Test init.mjs target project setup & stack auto-detection in isolated temp dir
const initScript = join(ROOT, 'init.mjs');
if (existsSync(initScript)) {
  const wizardStart = Date.now();
  const tempTarget = mkdtempSync(join(tmpdir(), 'harness-wizard-test-'));
  try {
    mkdirSync(join(tempTarget, 'src'), { recursive: true });
    writeFileSync(
      join(tempTarget, 'package.json'),
      JSON.stringify({ name: 'mock-next-app', dependencies: { next: '15.0.0' } }, null, 2)
    );
    execFileSync(process.execPath, [initScript, '--force', '--mcp'], {
      cwd: tempTarget,
      timeout: TIMEOUT_MS,
      stdio: 'pipe',
    });

    const stackFile = join(tempTarget, '.clinerules', '03-project-stack.md');
    const mcpFile = join(tempTarget, '.vscode', 'mcp.json');
    const targetCore = join(tempTarget, 'core', 'application', 'harness-facade.mjs');
    const targetMap = join(tempTarget, 'PROJECT_MAP.md');

    if (!existsSync(stackFile) || !readFileSync(stackFile, 'utf8').includes('Next.js')) {
      throw new Error('Failed to detect Next.js stack profile');
    }
    if (!existsSync(mcpFile) || !readFileSync(mcpFile, 'utf8').includes('mcp-server.mjs')) {
      throw new Error('Failed to generate .vscode/mcp.json');
    }
    if (!existsSync(targetCore) || !existsSync(targetMap)) {
      throw new Error('Failed to sync core/ or auto-generate PROJECT_MAP.md');
    }

    console.log('✅ [PASS] Wizard: init.mjs target setup & stack detection (' + (Date.now() - wizardStart) + 'ms)');
    passed++;
  } catch (err) {
    console.error('❌ [FAIL] Wizard: init.mjs target setup (' + err.message + ')');
    process.exit(1);
  } finally {
    rmSync(tempTarget, { recursive: true, force: true });
  }
}

// Verify critical artifacts exist and are non-empty
for (const artifact of ['.cartographer/manifest.json', '.cartographer/raw/runtime-db.md', '.cartographer/raw/runtime-api.md', 'PROJECT_MAP.md']) {
  const fullPath = join(ROOT, artifact);
  if (!existsSync(fullPath) || readFileSync(fullPath, 'utf8').trim().length === 0) {
    console.error('❌ [FAIL] Missing or empty artifact: ' + artifact);
    process.exit(1);
  }
}

console.log('\n🎉 All ' + passed + ' harness regression checks passed!');
