#!/usr/bin/env node
// Zero-dependency deterministic release & intelligent git tag pipeline
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function run(cmd, args, cwd = process.cwd(), stdio = 'inherit') {
  const useShell = process.platform === 'win32' && (cmd === 'npm' || cmd === 'npx');
  return execFileSync(cmd, args, { cwd, stdio, encoding: 'utf8', shell: useShell });
}

function getLatestTag(cwd) {
  try {
    return run('git', ['describe', '--tags', '--abbrev=0'], cwd, 'pipe').trim();
  } catch {
    return '';
  }
}

function suggestNextVersion(cwd, pkgVersion) {
  const latestTag = getLatestTag(cwd);
  const baseVer = (latestTag ? latestTag.replace(/^v/, '') : pkgVersion || '1.0.0').trim();
  const range = latestTag ? `${latestTag}..HEAD` : 'HEAD';
  let commits = [];
  try {
    const logOut = run('git', ['log', range, '--pretty=format:%s'], cwd, 'pipe').trim();
    commits = logOut ? logOut.split(/\r?\n/).filter(Boolean) : [];
  } catch {}

  let bump = 'patch';
  let reason = 'maintenance / fixes only';
  if (commits.some(c => /BREAKING CHANGE|^[a-z]+(?:\([^)]+\))?!:/i.test(c))) {
    bump = 'major';
    reason = 'detected BREAKING CHANGE commit';
  } else if (commits.some(c => /^feat(?:\([^)]+\))?:/i.test(c))) {
    bump = 'minor';
    reason = 'detected new feature (feat:) commits';
  }

  const parts = baseVer.split('.').map(Number);
  const [major, minor, patch] = parts.length === 3 && !parts.some(Number.isNaN) ? parts : new Array(0, 0, 0);
  let suggested = `${major}.${minor}.${patch + 1}`;
  if (!latestTag && baseVer === '1.0.0') {
    suggested = '1.0.0';
    reason = 'initial v1.0.0 baseline release';
  } else if (bump === 'major') {
    suggested = `${major + 1}.0.0`;
  } else if (bump === 'minor') {
    suggested = `${major}.${minor + 1}.0`;
  }

  return { latestTag: latestTag || 'none', baseVer, commits, bump, reason, suggested };
}

function bumpSemver(baseVer, bumpArg) {
  if (/^\d+\.\d+\.\d+$/.test(bumpArg)) return bumpArg;
  const parts = baseVer.split('.').map(Number);
  const [major, minor, patch] = parts.length === 3 && !parts.some(Number.isNaN) ? parts : new Array(0, 0, 0);
  if (bumpArg === 'major') return `${major + 1}.0.0`;
  if (bumpArg === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function runNpxSandboxSmoke(kitRoot) {
  if (!fs.existsSync(path.join(kitRoot, 'init.mjs'))) return;
  console.log('[release] Running cross-repo npx sandbox smoke test...');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-release-'));
  try {
    run('git', ['init', '-q'], tmpDir);
    run('git', ['config', 'user.email', 'release@harness.local'], tmpDir);
    run('git', ['config', 'user.name', 'Harness Release Bot'], tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'sandbox-app', type: 'module' }, null, 2) + '\n');
    run('git', ['add', '.'], tmpDir);
    run('git', ['commit', '-qm', 'init'], tmpDir);
    const npxBin = 'npx';
    run(npxBin, [kitRoot, '--force', '--commit'], tmpDir);
    const npmBin = 'npm';
    run(npmBin, ['test'], tmpDir);
    run(npmBin, ['run', 'verify', '--', '--targeted'], tmpDir);
    console.log('[release] Cross-repo npx sandbox passed 100%.');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function main() {
  const ROOT = process.cwd();
  const positionalArg = process.argv.slice(2).find(a => !a.startsWith('--'));
  const DRY_RUN = process.argv.includes('--dry-run');
  const NO_PUSH = process.argv.includes('--no-push');

  const pkgPath = path.join(ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const advice = suggestNextVersion(ROOT, pkg.version);
  const nextVersion = positionalArg ? bumpSemver(advice.baseVer, positionalArg) : advice.suggested;
  const tagName = `v${nextVersion}`;

  console.log(`\n📦 [release-advisor] Latest Tag: ${advice.latestTag} | Unreleased Commits: ${advice.commits.length}`);
  console.log(`💡 [release-advisor] Recommended: ${tagName} (${advice.bump.toUpperCase()} — ${advice.reason})`);
  if (advice.commits.length > 0) {
    console.log('   Recent unreleased commits:');
    for (const c of advice.commits.slice(0, 5)) console.log(`   - ${c}`);
  }

  if (DRY_RUN) {
    console.log('\n[release --dry-run] Preview complete. Run `npm run release` to execute.');
    process.exit(0);
  }

  const dirty = run('git', ['status', '--porcelain'], ROOT, 'pipe').trim();
  if (dirty) {
    console.error('❌ [release] Aborted: working tree is dirty. Commit or stash changes first.\n' + dirty);
    process.exit(1);
  }

  const existingTags = run('git', ['tag', '-l', tagName], ROOT, 'pipe').trim();
  if (existingTags === tagName) {
    console.error(`❌ [release] Aborted: Git tag ${tagName} already exists.`);
    process.exit(1);
  }

  console.log(`\n🚀 [release] Cutting release ${tagName}...`);
  const npmBin = 'npm';
  run(npmBin, ['test'], ROOT);
  run(npmBin, ['run', 'verify'], ROOT);
  runNpxSandboxSmoke(ROOT);

  pkg.version = nextVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  const progPath = path.join(ROOT, 'PROGRESS.md');
  if (fs.existsSync(progPath)) {
    let prog = fs.readFileSync(progPath, 'utf8');
    prog = prog.replace(
      /## 2\. Active Target[\s\S]*?(?=## 3\.)/,
      `## 2. Active Target (Single-Batch Scope)\n- **Objective**: **${tagName} Released** — Automated release pipeline verified all gates, docs, and cross-repo \`npx\` installation.\n- **Acceptance Criteria**: All regression tests green; \`${tagName}\` tagged and pushed.\n\n`
    );
    fs.writeFileSync(progPath, prog, 'utf8');
  }

  if (pkg.scripts?.['harness:sync']) {
    run(npmBin, ['run', 'harness:sync'], ROOT);
  } else if (pkg.scripts?.['sync-map']) {
    run(npmBin, ['run', 'sync-map'], ROOT);
  }

  run('git', ['add', '-A'], ROOT);
  const staged = run('git', ['diff', '--cached', '--name-only'], ROOT, 'pipe').trim();
  if (staged) {
    run('git', ['commit', '--no-verify', '-m', `chore(release): ${tagName}`], ROOT);
  }
  run('git', ['tag', '-a', tagName, '-m', `Release ${tagName}`], ROOT);
  console.log(`✅ [release] Created annotated tag ${tagName}.`);

  if (!NO_PUSH) {
    const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], ROOT, 'pipe').trim() || 'main';
    run('git', ['push', 'origin', branch, '--tags'], ROOT);
    console.log(`🎉 [release] Pushed ${branch} and ${tagName} to origin.`);
  }
}

main();
