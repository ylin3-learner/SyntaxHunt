#!/usr/bin/env node
// Thin CLI wrapper — verification gate runner
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';


import { resolveTargetedContext } from "./inject-context.mjs";

function detectChangedFiles(rootDir) {
  const filesArg = process.argv.find(a => a.startsWith("--files="));
  if (filesArg) {
    return filesArg.slice("--files=".length).split(",").map(s => s.trim()).filter(Boolean);
  }
  try {
    const statusOut = execFileSync("git", ["status", "--porcelain"], { cwd: rootDir, encoding: "utf8" });
    const changed = statusOut
      .split(/\r?\n/)
      .filter(Boolean)
      .map(line => line.slice(3).trim().replace(/^"|"$/g, ""))
      .filter(f => !f.startsWith(".cartographer/") && f !== "PROJECT_MAP.md" && f !== "HANDOFF.md");
    if (changed.length > 0) return changed;
    const diffOut = execFileSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"], { cwd: rootDir, encoding: "utf8" });
    return diffOut.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function runTargetedTests(rootDir) {
  const changed = detectChangedFiles(rootDir);
  const { impactedFiles, impactedTests } = resolveTargetedContext(rootDir, changed);
  console.log(`[verify --targeted] Changed: ${changed.length} | Blast Radius: ${impactedFiles.length} | Impacted Tests: ${impactedTests.length}`);
  if (impactedTests.length === 0) {
    console.log("[verify --targeted] No impacted test files matched (0 tests executed).");
    return null;
  }
  const pkgPath = path.join(rootDir, "package.json");
  const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, "utf8")) : {};
  const hasVitest = Boolean(pkg.devDependencies?.vitest || pkg.dependencies?.vitest);
  try {
    if (hasVitest) {
      execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vitest", "run", ...impactedTests], { cwd: rootDir, stdio: "inherit" });
    } else {
      execFileSync(process.execPath, ["--test", ...impactedTests], { cwd: rootDir, stdio: "inherit" });
    }
    return null;
  } catch (err) {
    return `[Targeted Tests] Failed on: ${impactedTests.join(", ")}`;
  }
}

function runHarnessHygieneGates(rootDir) {
  const errors = [];
  const scriptDirs = [
    path.join(rootDir, '.harness', 'scripts'),
    path.join(rootDir, 'templates', '.harness', 'scripts'),
    path.join(rootDir, 'core', 'domain'),
    path.join(rootDir, 'core', 'adapters'),
    path.join(rootDir, 'core', 'services'),
    path.join(rootDir, 'core', 'application'),
  ];

  const legacyImportRegex = new RegExp('[\'"]\\.\\./(?:\\.\\./)?' + 'core/');
  const heredocArtifactRegex = new RegExp('END' + 'TEMPLATE');

  for (const dir of scriptDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.mjs'));
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
      const content = fs.readFileSync(fullPath, 'utf8');

      // Gate 1: Strict ESM syntax check
      try {
        execFileSync(process.execPath, ['--check', fullPath], { stdio: 'pipe' });
      } catch (err) {
        errors.push(`[ESM Syntax Error] ${relPath}: ${err.stderr?.toString().trim() || err.message}`);
      }

      // Gate 2: Ban legacy relative core imports (enforce #core/* subpath imports)
      if (legacyImportRegex.test(content)) {
        errors.push(`[Legacy Import] ${relPath}: Found relative core import. Use '#core/*' instead.`);
      }

      // Gate 3: Ban leftover heredoc artifacts
      if (heredocArtifactRegex.test(content)) {
        errors.push(`[Heredoc Artifact] ${relPath}: Found leftover heredoc marker.`);
      }


      // Gate 5: Ban CommonJS import inside ESM (.mjs) files
      if (new RegExp("\\b" + "require\\s*\\(").test(content)) {
        errors.push(`[CJS in ESM] ${relPath}: Found CommonJS import in .mjs file. Use ESM import instead.`);
      }

      // Gate 4: Ban single-line minified dumps (> 500 chars per line)
      const lines = content.split(/\r?\n/);
      const longLineIdx = lines.findIndex(line => line.length > 500);
      if (longLineIdx !== -1) {
        errors.push(`[Minified Dump] ${relPath}:${longLineIdx + 1}: Line exceeds 500 chars (${lines[longLineIdx].length} chars). Keep code properly formatted.`);
      }
    }
  }

  return errors;
}


function runCoreCoverageGate(rootDir, minLinePct = 80) {
  const testFile = path.join(rootDir, "core", "__tests__", "core.test.mjs");
  if (!fs.existsSync(testFile)) {
    return { linePct: 0, error: "[Core Coverage] Missing core/__tests__/core.test.mjs" };
  }
  try {
    const res = execFileSync(
      process.execPath,
      [
        "--test",
        "--experimental-test-coverage",
        "--test-coverage-include=core/**/*.mjs",
        "--test-coverage-exclude=core/__tests__/**",
        testFile,
      ],
      { cwd: rootDir, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    );
    const clean = res.replace(/\x1b\[[0-9;]*m/g, "");
    const match = clean.match(/all files\s*\|\s*([0-9.]+)/i);
    const linePct = match ? parseFloat(match[1]) : 0;
    if (linePct < minLinePct) {
      return {
        linePct,
        error: `[Core Coverage] Line coverage ${linePct.toFixed(1)}% is below required ${minLinePct}%`,
      };
    }
    return { linePct, error: null };
  } catch (err) {
    const combined = ((err.stdout || "") + "\n" + (err.stderr || "")).replace(/\x1b\[[0-9;]*m/g, "");
    const match = combined.match(/all files\s*\|\s*([0-9.]+)/i);
    if (match) {
      const linePct = parseFloat(match[1]);
      return linePct >= minLinePct
        ? { linePct, error: null }
        : { linePct, error: `[Core Coverage] Line coverage ${linePct.toFixed(1)}% is below required ${minLinePct}%` };
    }
    return {
      linePct: 0,
      error: `[Core Coverage] Test execution failed: ${combined.trim() || err.message}`,
    };
  }
}


function runMermaidSyntaxGate(rootDir) {
  const mapPath = path.join(rootDir, "PROJECT_MAP.md");
  if (!fs.existsSync(mapPath)) return [];
  const content = fs.readFileSync(mapPath, "utf8");
  const blocks = [...content.matchAll(/```mermaid\r?\n([\s\S]*?)```/g)];
  const errors = [];

  for (const match of blocks) {
    const body = match[1];
    const lines = body.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (/^(graph|flowchart|subgraph|end|style|classDef|class|click|%%)/i.test(line)) continue;
      // 1. 攔截以引號字串開頭的非法節點 (got STR 錯誤)
      if (/^["']/.test(line) || /-->\s*["']/.test(line)) {
        errors.push(`[Mermaid Syntax] PROJECT_MAP.md: Quoted string used directly as node ID in "${line}". Prefix with alphanumeric ID like id["label"].`);
      }
      // 2. 攔截未加引號方括號的裸露路徑斜線/點號
      const stripped = line.replace(/\["[^"]*"\]/g, "");
      if (/[a-zA-Z0-9_]+\/[a-zA-Z0-9_./-]+/.test(stripped)) {
        errors.push(`[Mermaid Syntax] PROJECT_MAP.md: Unquoted path slash in node ID "${line}". Wrap label in id["..."].`);
      }
    }
  }
  return errors;
}

async function main() {
  const ROOT = process.cwd();
  const cartDir = path.join(ROOT, '.cartographer');
  const manifestPath = path.join(cartDir, 'manifest.json');
  const risksPath = path.join(cartDir, 'risks.json');
  const verifyPath = path.join(ROOT, '.verify-state.json');

  let manifest = { files: {} };
  if (fs.existsSync(manifestPath)) {
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (_) {}
  }

  let risks = {
    summary: { totalFiles: 0, circularDependencies: 0, orphanFiles: 0, godModules: 0 },
    circularDependencies: [],
    orphanFiles: [],
    godModules: [],
  };
  if (fs.existsSync(risksPath)) {
    try { risks = JSON.parse(fs.readFileSync(risksPath, 'utf8')); } catch (_) {}
  }

  let state = { failureCount: 0, tripped: false, state: 'closed' };
  if (fs.existsSync(verifyPath)) {
    try { state = JSON.parse(fs.readFileSync(verifyPath, 'utf8')); } catch (_) {}
  }

  // Load core circuit breaker via standardized #core/* subpath import
  let recordFailure, reset, checkState, antiCheat;
  try {
    const m = await import('#core/services/circuit-breaker.mjs');
    recordFailure = m.recordFailure;
    reset = m.reset;
    checkState = m.checkState;
    antiCheat = m.antiCheat;
  } catch (_) {}

  // --tests-only mode
  if (process.argv.includes('--tests-only')) {
    const testFiles = Object.keys(manifest.files || {}).filter(
      f => f.endsWith('.test.mjs') || f.endsWith('.spec.mjs')
    );
    console.log(testFiles.join(' '));
    process.exit(0);
  }

  // --run-failure mode
  if (process.argv.includes('--run-failure') && recordFailure && checkState) {
    const { failureCount: newCount } = recordFailure({ maxFailures: 3 });
    state.failureCount = newCount;
    const { tripped } = checkState();
    state.tripped = tripped;
    state.state = tripped ? 'open' : 'closed';
    fs.writeFileSync(verifyPath, JSON.stringify(state) + '\n');
    process.exit(0);
  }

  // Run automated Harness Hygiene Gates
  const hygieneErrors = [
    ...runHarnessHygieneGates(ROOT),
    ...runMermaidSyntaxGate(ROOT),
  ];
  if (process.argv.includes("--targeted")) {
    const targetedErr = runTargetedTests(ROOT);
    if (targetedErr) hygieneErrors.push(targetedErr);
  }
  const covResult = runCoreCoverageGate(ROOT, 80);
  if (covResult.error) hygieneErrors.push(covResult.error);

  // Print summary
  const lines = [
    '## Verification Summary',
    `- Total files: ${manifest.files ? Object.keys(manifest.files).length : 0}`,
    `- Circular deps: ${risks.summary.circularDependencies || 0}`,
    `- Orphan files: ${risks.summary.orphanFiles || 0}`,
    `- God modules: ${risks.summary.godModules || 0}`,
    `- Verification state: ${state.state || "closed"}`,
    `- Failure count: ${state.failureCount ?? 0}`,
    `- Core test coverage: ${covResult.linePct.toFixed(1)}%`,
    `- Harness hygiene errors: ${hygieneErrors.length}`,
  ];
  process.stdout.write(lines.join('\n') + '\n');

  if (hygieneErrors.length > 0) {
    console.error('\n❌ Verification Gate Failed:');
    for (const err of hygieneErrors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }
}

main();
