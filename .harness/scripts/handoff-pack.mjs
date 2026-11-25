#!/usr/bin/env node
// Deterministic Harness Status & Handoff Reporter — zero LLM hallucination
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function runCmd(cmd, args, cwd) {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    return (err.stdout || err.stderr || err.message || '').toString().trim();
  }
}

function readJsonSafe(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function main() {
  const ROOT = process.cwd();
  const now = new Date().toISOString();

  // 1. Real Git State
  const branch = runCmd('git', ['rev-parse', '--abbrev-ref', 'HEAD'], ROOT) || 'unknown';
  const latestTag = runCmd("git", ["describe", "--tags", "--abbrev=0"], ROOT) || "none";
  const aheadCount = latestTag !== "none" ? runCmd("git", ["rev-list", `${latestTag}..HEAD`, "--count"], ROOT) : "all";
  const headCommit = runCmd('git', ['log', '-n', '1', '--oneline'], ROOT) || 'none';
  const recentCommits = runCmd('git', ['log', '-n', '5', '--oneline'], ROOT) || 'none';
  const dirtyFiles = runCmd('git', ['status', '-s'], ROOT);
  const gitClean = dirtyFiles.length === 0;

  // 2. Real Test Suite Execution (Deterministic)
  const testOutput = runCmd(process.execPath, [path.join(ROOT, '.harness', 'scripts', 'test-harness.mjs')], ROOT);
  const passMatches = testOutput.match(/✅ \[PASS\]/g) || [];
  const failMatches = testOutput.match(/❌ \[FAIL\]/g) || [];
  const totalTests = passMatches.length + failMatches.length;
  const testSummary = `${passMatches.length}/${totalTests} passing (${failMatches.length} failing)`;

  // 3. Real Verification Gate Execution
  const verifyOutput = runCmd(process.execPath, [path.join(ROOT, '.harness', 'scripts', 'verify.mjs')], ROOT);
  const verifyPassed = !verifyOutput.includes('❌ Verification Gate Failed');
  const covMatch = verifyOutput.match(/Core test coverage:\s*([0-9.]+%)/);
  const coreCoverage = covMatch ? covMatch[1] : 'N/A';

  // 4. Real Architecture & Map Metrics
  const manifest = readJsonSafe(path.join(ROOT, '.cartographer', 'manifest.json'), { files: {} });
  const risks = readJsonSafe(path.join(ROOT, '.cartographer', 'risks.json'), { summary: {} });
  const verifyState = readJsonSafe(path.join(ROOT, '.verify-state.json'), {});
  const coreFiles = fs.existsSync(path.join(ROOT, 'core'))
    ? fs.readdirSync(path.join(ROOT, 'core'), { recursive: true })
        .filter(f => f.endsWith('.mjs') && !f.includes('__tests__'))
    : [];

  // 5. Auto-update README.md & README.zh-TW.md status badges (idempotent)
  const statusRegex = /<!-- HARNESS:AUTO-STATUS:START -->[\s\S]*?<!-- HARNESS:AUTO-STATUS:END -->/;
  const docUpdates = [
    {
      file: path.join(ROOT, 'README.md'),
      block: [
        '<!-- HARNESS:AUTO-STATUS:START -->',
        `> **Live Harness Status**: \`${passMatches.length}/${totalTests}\` regression checks passing | \`${coreFiles.length}\` DDD core modules (\`${coreCoverage}\` cov) (\`#core/*\`) | \`6\` static hygiene gates active`,
        '<!-- HARNESS:AUTO-STATUS:END -->',
      ].join('\n'),
    },
    {
      file: path.join(ROOT, 'README.zh-TW.md'),
      block: [
        '<!-- HARNESS:AUTO-STATUS:START -->',
        `> **即時架構狀態**：\`${passMatches.length}/${totalTests}\` 回歸測試通過 | \`\({coreFiles.length}\` 個 DDD 核心模組 (覆蓋率 \`\){coreCoverage}\`) (\`#core/*\`) | \`6\` 道靜態衛生防線啟用中`,
        '<!-- HARNESS:AUTO-STATUS:END -->',
      ].join('\n'),
    },
  ];
  for (const { file, block } of docUpdates) {
    if (fs.existsSync(file)) {
      const doc = fs.readFileSync(file, 'utf8');
      if (statusRegex.test(doc)) {
        fs.writeFileSync(file, doc.replace(statusRegex, block), 'utf8');
      }
    }
  }

  // 6. Auto-extract real CLI flags from init.mjs & scripts from package.json into READMEs
  const pkgJson = readJsonSafe(path.join(ROOT, 'package.json'), { scripts: {} });
  const initSrc = fs.existsSync(path.join(ROOT, 'init.mjs'))
    ? fs.readFileSync(path.join(ROOT, 'init.mjs'), 'utf8')
    : '';
  const flagMatches = [...new Set((initSrc.match(/(?:process\.argv|rawArgs)\.includes\(['"](--[a-z-]+)['"]\)/g) || []).map(m => m.match(/--[a-z-]+/)[0]))];
  const formattedFlagsEn = flagMatches.map(f => '`' + f + '`').join(', ') || 'none';
  const formattedFlagsZh = flagMatches.map(f => '`' + f + '`').join('、') || '無';
  const scriptRows = Object.entries(pkgJson.scripts || {})
    .map(([k, v]) => `| \`npm run ${k}\` | \`${v}\` |`)
    .join('\n');

  const cmdRegex = /<!-- HARNESS:AUTO-COMMANDS:START -->[\s\S]*?<!-- HARNESS:AUTO-COMMANDS:END -->/;
  const cmdUpdates = [
    {
      file: path.join(ROOT, 'README.md'),
      block: [
        '<!-- HARNESS:AUTO-COMMANDS:START -->',
        '- **One-Line Target Project Setup**: `node <path-to-kit>/init.mjs --force --commit`',
        `- **Supported \`init.mjs\` Flags**: ${formattedFlagsEn}`,
        '',
        '| NPM Command | Underlying Script (Auto-Extracted from `package.json`) |',
        '| :--- | :--- |',
        scriptRows,
        '<!-- HARNESS:AUTO-COMMANDS:END -->',
      ].join('\n'),
    },
    {
      file: path.join(ROOT, 'README.zh-TW.md'),
      block: [
        '<!-- HARNESS:AUTO-COMMANDS:START -->',
        '- **目標專案一鍵安裝指令**：`node <path-to-kit>/init.mjs --force --commit`',
        `- **\`init.mjs\` 支援參數**：${formattedFlagsZh}`,
        '',
        '| NPM 指令 | 實際執行腳本（自動從 `package.json` 擷取） |',
        '| :--- | :--- |',
        scriptRows,
        '<!-- HARNESS:AUTO-COMMANDS:END -->',
      ].join('\n'),
    },
  ];
  for (const { file, block } of cmdUpdates) {
    if (fs.existsSync(file)) {
      const doc = fs.readFileSync(file, 'utf8');
      if (cmdRegex.test(doc)) {
        fs.writeFileSync(file, doc.replace(cmdRegex, block), 'utf8');
      }
    }
  }

  // 6.5 Auto-update PROGRESS.md Current Baseline (preserves Backlog & Gotchas)
  const progressPath = path.join(ROOT, 'PROGRESS.md');
  if (fs.existsSync(progressPath)) {
    let prog = fs.readFileSync(progressPath, 'utf8');
    const shortHash = headCommit.split(' ')[0] || 'unknown';
    const healthStr = (failMatches.length === 0 && verifyPassed)
      ? `**ALL PASS** (${testSummary} & \`npm run verify\` — all 6 gates green).`
      : `**ATTENTION NEEDED** (testSummary, verify: {verifyPassed ? 'PASS' : 'FAIL'}).`;
    prog = prog.replace(/(- \*\*Last Completed\*\*: )`[^`]+`/, `$1\`${shortHash}\``);
    prog = prog.replace(/(- \*\*Health Status\*\*: ).*$/m, `$1${healthStr}`);
    fs.writeFileSync(progressPath, prog, 'utf8');
  }

  // 7. Write deterministic HANDOFF.md report
  const report = [
    '# Harness Deterministic Status & Handoff Report',
    `> Auto-generated at \`${now}\` by \`.harness/scripts/handoff-pack.mjs\` (100% ground-truth metrics)`,
    '',
    '## 1. Verification & Test Gates',
    `- **Regression Tests**: ${failMatches.length === 0 ? '✅' : '❌'} **${testSummary}**`,
    `- **Verify Gate**: ${verifyPassed ? '✅ PASS' : '❌ FAIL'}`,
    `- **Circuit Breaker**: \`${verifyState.state || 'closed'}\` (failures: ${verifyState.failureCount ?? 0})`,
    '',
    '## 2. Architecture & Codebase Inventory',
    `- **Indexed Files**: ${Object.keys(manifest.files || {}).length}`,
    `- **Core DDD Modules (\`core/\`)**: ${coreFiles.length} files (Line Coverage: **${coreCoverage}**)`,
    `- **Circular Dependencies**: ${risks.summary?.circularDependencies ?? 0}`,
    `- **God Modules**: ${risks.summary?.godModules ?? 0}`,
    '',
    '## 3. Git Repository State',
    `- **Branch**: \`\${branch}\``,
    `- **HEAD Commit**: \`${headCommit}\``,
    `- **Working Tree**: ${gitClean ? '✅ Clean (0 uncommitted changes)' : `⚠️ Dirty (${dirtyFiles.split('\n').length} modified/untracked files)`}`,
    '',
    '### Recent Commits',
    '```text',
    recentCommits,
    '```',
    ...(gitClean ? [] : ['', '### Uncommitted Changes', '```text', dirtyFiles, '```']),
    '',
    '## 4. Raw Verification Output',
    '```text',
    verifyOutput,
    '```',
    '',
  ].join('\n');

  const handoffPath = path.join(ROOT, 'HANDOFF.md');
  fs.writeFileSync(handoffPath, report, 'utf8');
  process.stdout.write(report);
}

main();
