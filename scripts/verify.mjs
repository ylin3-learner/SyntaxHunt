import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';

const SRC_DIR = 'src';
const ALLOWED_TEST_ROOT = join('src', 'tests');
const TEST_FILE_PATTERN = /(\.(test|spec)\.[jt]sx?$|_test\.[jt]sx?$)/i;

// 允許出現 E2E 環境變數隔離判斷的檔案白名單（若未來改用 Vite Alias 隔離，可將此陣列清空）
const ALLOWED_E2E_GUARD_FILES = [];

// 嚴禁出現在 src/（不含 src/tests/）正式代碼中的測試特徵
const FORBIDDEN_PROD_PATTERNS = [
  {
    pattern: /from\s+['"]@playwright\/test['"]/,
    reason: 'Playwright test imports are forbidden in production source',
  },
  {
    pattern: /from\s+['"](?:\.\.\/)+e2e\/|from\s+['"]@?\/?e2e\//,
    reason: 'Direct imports from e2e/ directory are forbidden in production source',
  },
  {
    pattern: /^[ \t]*(?:describe|it|test|expect)(?:\.(?:only|skip|todo|each))?\s*\(/m,
    reason: 'Test runner globals detected in production source',
  },
  {
    pattern: /VITE_E2E|__isMock__|__isMock|E2E_MOCK|__MOCK__/i,
    reason: 'E2E/Mock branching or flags are forbidden in production source; use Vite resolve.alias with identical interfaces',
    allowWhitelisted: true,
  },
  {
    pattern: /window\.__[A-Z0-9_]+/,
    reason: 'Global window test hooks are forbidden in production source',
    allowWhitelisted: true,
  },
];

const ESLINT_CONFIGS = [
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yaml',
  '.eslintrc.yml',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
];

function scanSourceDirectory(dir, state = { scatteredTests: [], boundaryViolations: [] }) {
  if (!existsSync(dir)) return state;

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const relPath = relative(process.cwd(), fullPath);

    if (relPath === ALLOWED_TEST_ROOT) continue;

    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === '__tests__') {
        state.scatteredTests.push(`${relPath}/ (forbidden __tests__ directory)`);
      } else {
        scanSourceDirectory(fullPath, state);
      }
    } else if (TEST_FILE_PATTERN.test(entry)) {
      state.scatteredTests.push(relPath);
    } else if (/\.[jt]sx?$/.test(entry)) {
      // 檢查正式程式碼是否被測試邏輯或 E2E 分支污染
      const content = readFileSync(fullPath, 'utf-8');
      const isWhitelisted = ALLOWED_E2E_GUARD_FILES.includes(relPath);

      for (const rule of FORBIDDEN_PROD_PATTERNS) {
        if (rule.allowWhitelisted && isWhitelisted) continue;
        if (rule.pattern.test(content)) {
          state.boundaryViolations.push(`${relPath}: ${rule.reason}`);
        }
      }
    }
  }
  return state;
}

function printTrimmedOutput(buf) {
  if (!buf) return;
  const lines = buf.toString().trim().split('\n');
  if (lines.length > 60) {
    console.error(`... (${lines.length - 60} earlier lines truncated) ...`);
  }
  console.error(lines.slice(-60).join('\n'));
}

function runStep(name, fn) {
  process.stdout.write(`[VERIFY] ${name}... `);
  try {
    fn();
    console.log('PASS');
  } catch (err) {
    console.log('FAIL');
    printTrimmedOutput(err.stdout);
    printTrimmedOutput(err.stderr);
    if (err.customMessage) console.error(err.customMessage);
    process.exit(1);
  }
}

console.log('=== Harness Verification Pipeline ===');

const scanResult = scanSourceDirectory(SRC_DIR);

// Gate 1: Production vs. Validation Separation (File Location)
runStep('Architecture (No scattered tests)', () => {
  const violations = scanResult.scatteredTests;
  if (violations.length > 0) {
    const err = new Error('Scattered test files detected');
    err.customMessage =
      `Found ${violations.length} test(s) outside ${ALLOWED_TEST_ROOT}:\n` +
      violations.map((v) => `  - ${v}`).join('\n') +
      `\nAction: Move them into mirrored paths under ${ALLOWED_TEST_ROOT}/ using @/ imports.`;
    throw err;
  }
});

// Gate 1.5: Production Code Purity (No E2E/Test Leakage)
runStep('Boundary (No test/E2E leakage in src/)', () => {
  const violations = scanResult.boundaryViolations;
  if (violations.length > 0) {
    const err = new Error('Test/E2E leakage detected in production code');
    err.customMessage =
      `Found ${violations.length} boundary violation(s):\n` +
      violations.map((v) => `  - ${v}`).join('\n') +
      `\nAction: Extract E2E mocks into e2e/fixtures/ or isolate via Vite resolve.alias instead of polluting src/.`;
    throw err;
  }
});

// Gate 1.6: Config Sanity Check (Vite / Playwright)
runStep('Config (No broken alias or port collision)', () => {
  if (existsSync('vite.config.ts')) {
    const viteCfg = readFileSync('vite.config.ts', 'utf-8');
    if (viteCfg.includes("'/@fs/'") || viteCfg.includes('"/@fs/"')) {
      const err = new Error('Invalid Vite resolve.alias pattern');
      err.customMessage =
        'vite.config.ts uses "/@fs/" in resolve.alias, which does not match module resolution paths. Use regex or path.resolve() instead.';
      throw err;
    }
  }
});

// Gate 2: ESLint (includes e2e/ automatically if present)
if (ESLINT_CONFIGS.some((cfg) => existsSync(cfg))) {
  runStep('Lint (ESLint)', () => {
    const lintTargets = existsSync('e2e') ? 'src e2e' : 'src';
    execSync(`npx eslint ${lintTargets} --quiet`, { stdio: 'pipe', shell: true });
  });
}

// Gate 3: TypeScript Type Check (auto-runs only if tsconfig.json exists)
if (existsSync('tsconfig.json')) {
  runStep('Typecheck (tsc --noEmit)', () => {
    execSync('npx tsc --noEmit', { stdio: 'pipe', shell: true });
    if (existsSync('tsconfig.e2e.json')) {
      execSync('npx tsc -p tsconfig.e2e.json --noEmit', { stdio: 'pipe', shell: true });
    }
  });
}

// Gate 4: Unit & Integration Test Suite
runStep('Test Suite (npm test)', () => {
  execSync('npm test', {
    stdio: 'pipe',
    shell: true,
    env: { ...process.env, CI: 'true' },
  });
});

// Gate 5: Optional E2E Suite (triggered via `npm run verify:e2e`)
if (process.argv.includes('--e2e') && existsSync('e2e')) {
  runStep('E2E Suite (Playwright)', () => {
    execSync('npx playwright test', {
      stdio: 'pipe',
      shell: true,
      env: { ...process.env, CI: 'true' },
    });
  });
}

console.log('=== ALL GATES PASSED ===');