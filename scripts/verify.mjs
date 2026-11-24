import { readdirSync, statSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';

const SRC_DIR = 'src';
const ALLOWED_TEST_ROOT = join('src', 'tests');
const TEST_FILE_PATTERN = /(\.(test|spec)\.[jt]sx?$|_test\.[jt]sx?$)/i;
const TIMEZONE_OFFSET_PATTERN = /[+-](?:0[0-9]|1[0-4]):[0-5][0-9]/;

// 允許出現 E2E 環境變數隔離判斷的檔案白名單（若未來改用 Vite Alias 隔離，可將此陣列清空）
const ALLOWED_E2E_GUARD_FILES = [];

// 允許跳過 Cost & Quota Gate 的行內註解
const COST_IGNORE_PATTERN = /\/\/ verify-ignore: cost/;

// 允許跳過 E2E Boundary Guard 的行內註解
const E2E_IGNORE_PATTERN = /\/\/ verify-ignore: e2e/;

// Cost & Quota Gate patterns (unbounded queries, missing limits, missing rate limits)
const COST_QUOTA_PATTERNS = [
  {
    pattern: /\b(?:getDocs|onSnapshot)\s*\(\s*collection\s*\(/,
    reason: '[Fix Hint] Use query(collection(...), where(...), limit(N)) or read pre-aggregated snapshot docs.',
  },
  {
    pattern: /\.from\s*\([^)]+\)\s*\.select\s*\([^)]*\)(?![\s\S]{0,120}\.(?:limit|single|maybeSingle|eq|in|range|match|contains)\s*\()/,
    reason: '[Fix Hint] Add .limit(N), .range(), or explicit filters (.eq / .in / .single).',
  },
  {
    pattern: /^\s*import\s+[\s\S]*?\s+from\s+['"](?:jspdf|html2canvas|exceljs|xlsx|pdfmake)['"]/m,
    reason: '[Fix Hint] Use dynamic import() inside the export handler instead of top-level static import.',
  },
  {
    pattern: /\b(?:for\s*\(|forEach\s*\(|map\s*\()[\s\S]{0,250}?\b(?:addDoc|setDoc|updateDoc|deleteDoc|\.insert\s*\(|\.upsert\s*\()/,
    reason: '[Fix Hint] Batch writes with writeBatch() or single array .insert([...]) / .upsert([...]).',
  },
];

// E2E Boundary Guard patterns (additional to FORBIDDEN_PROD_PATTERNS)
const E2E_BOUNDARY_PATTERNS = [
  {
    pattern: /window\.__[A-Z0-9_]+/,
    reason: '[Fix Hint] Isolate E2E mocks via bundler resolve.alias in e2e/fixtures/.',
  },
  {
    pattern: /import\.meta\.env\.VITE_E2E/,
    reason: '[Fix Hint] Isolate E2E mocks via bundler resolve.alias in e2e/fixtures/.',
  },
  {
    pattern: /E2E_MOCK/,
    reason: '[Fix Hint] Isolate E2E mocks via bundler resolve.alias in e2e/fixtures/.',
  },
];

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

// Deterministic checks for UI/interaction patterns (scanning src/ production files, excluding tests, with verify-ignore: ui bypass)
const UI_INTERACTION_PATTERNS = [
  {
    pattern: /URL\.createObjectURL\s*\(/,
    reason: '[Fix Hint] Use FileReader.readAsDataURL() for pasted/uploaded images to avoid revokeObjectURL race conditions.'
  },
  {
    pattern: /onTouchStart|onTouchMove|addEventListener\('touch/,
    reason: '[Fix Hint] Remove e.preventDefault() in passive touch handlers and use CSS touch-action: none instead.'
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

function scanSourceDirectory(
  dir,
  state = { scatteredTests: [], boundaryViolations: [], timezoneViolations: [], costViolations: [], e2eViolations: [] }
) {
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
      const lines = content.split('\n');
      const isWhitelisted = ALLOWED_E2E_GUARD_FILES.includes(relPath);

      for (const rule of FORBIDDEN_PROD_PATTERNS) {
        if (rule.allowWhitelisted && isWhitelisted) continue;
        if (rule.pattern.test(content)) {
          state.boundaryViolations.push(`${relPath}: ${rule.reason}`);
        }
      }

      // Cost & Quota Gate
      for (const rule of COST_QUOTA_PATTERNS) {
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (rule.pattern.test(line) && !COST_IGNORE_PATTERN.test(line)) {
            state.costViolations.push(`${relPath}:${i + 1}: ${rule.reason}`);
          }
        }
      }

      // E2E Boundary Gate
      for (const rule of E2E_BOUNDARY_PATTERNS) {
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (rule.pattern.test(line) && !E2E_IGNORE_PATTERN.test(line)) {
            state.e2eViolations.push(`${relPath}:${i + 1}: ${rule.reason}`);
          }
        }
      }

      // 檢查時區偏移時，必須排除測試檔案與 __tests__ 目錄中的程式碼
      const isTestFile =
        TEST_FILE_PATTERN.test(entry) ||
        relPath.includes('__tests__') ||
        relPath.includes('.test.') ||
        relPath.includes('.spec.');

      if (!isTestFile) {
        const tzMatch = content.match(TIMEZONE_OFFSET_PATTERN);
        if (tzMatch) {
          state.timezoneViolations.push(
            `${relPath}: Hardcoded timezone offset detected (${tzMatch[0]}); use Intl.DateTimeFormat with IANA timezone instead`
          );
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

const STATE_FILE = '.verify-state.json';

function loadState() {
  if (!existsSync(STATE_FILE)) {
    console.warning('[verify.mjs] .verify-state.json missing; starting with clean state');
    return { consecutiveFailures: 0, lastErrorSignature: '', testBaseline: null };
  }
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    console.warning('[verify.mjs] .verify-state.json corrupted (invalid JSON); starting with clean state');
    return { consecutiveFailures: 0, lastErrorSignature: '', testBaseline: null };
  }
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

function recordFailure(gate, err) {
  const state = loadState() || { gate: '', hash: '', count: 0 };
  const summary = `${gate}::${err.customMessage || err.message || String(err)}`;
  const hash = hashString(summary);
  const next = {
    gate,
    hash,
    count: state.count + 1,
    lastFailedAt: new Date().toISOString(),
  };
  writeFileSync(STATE_FILE, JSON.stringify(next, null, 2), 'utf-8');

  if (next.count >= 3) {
    console.error('');
    console.error('╔═══════════════════════════════════════════════════════╗');
    console.error('║  CIRCUIT_BREAKER_TRIPPED: Stop retrying and ask      ║');
    console.error('║  human for intervention.                             ║');
    console.error('╚═══════════════════════════════════════════════════════╝');
    console.error(`Failed gate: ${gate}`);
    console.error(`Consecutive failures: ${next.count}`);
    // Circuit Breaker Cooldown Hint
    const cooldownNotice = '💡 提示：AI 已連續 3 次無法通過驗證。建議人類介入檢查（是否為型別定義衝突或架構瓶頸），或清除上下文（Clear Context）並執行 handoff 後重新下發指令。';
    console.error(cooldownNotice);
    console.error('');

    // Append cooldown notice to HANDOFF.md for next session
    const handoffPath = 'HANDOFF.md';
    if (existsSync(handoffPath)) {
      const handoffContent = readFileSync(handoffPath, 'utf-8');
      const appendText = '\n' + cooldownNotice;
      if (!handoffContent.includes(cooldownNotice)) {
        writeFileSync(handoffPath, handoffContent + appendText, 'utf-8');
      }
    }
  }
  return next;
}

function resetVerifyState() {
  writeFileSync(
    STATE_FILE,
    JSON.stringify(
      { consecutiveFailures: 0, lastErrorSignature: '', testBaseline: null },
      null,
      2
    ),
    'utf-8'
  );
}

// Anti-Cheating Test Integrity Gate
function checkTestIntegrity(currentState) {
  const testFiles = [];
  // Collect e2e/ test files and *.test.* / *.spec.*
  if (existsSync('e2e')) {
    e2eEntries = readdirSync('e2e');
    for (const entry of e2eEntries) {
      const fullPath = join('e2e', entry);
      if (statSync(fullPath).isDirectory()) {
        // recurse into e2e subdirs
        collectTestFiles(fullPath, testFiles);
      } else if (TEST_FILE_PATTERN.test(entry)) {
        testFiles.push(fullPath);
      }
    }
  }
  // collect *.test.* and *.spec.* at root
  const rootEntries = readdirSync('.');
  for (const entry of rootEntries) {
    if (TEST_FILE_PATTERN.test(entry)) {
      testFiles.push(join('.', entry));
    }
  }

  // Count total lines and test/assertion occurrences
  let testLines = 0;
  let testAssertions = 0;
  const assertionPattern = /\b(?:it|test|describe|expect|assert)\b/g;
  for (const tf of testFiles) {
    try {
      const content = readFileSync(tf, 'utf-8');
      testLines += content.split('\n').length;
      const matches = content.match(assertionPattern);
      if (matches) testAssertions += matches.length;
    } catch {}
  }

  // Compare against baseline
  if (currentState.testBaseline) {
    const { testLines: prevLines, testAssertions: prevAssertions } = currentState.testBaseline;
    if (testLines < prevLines || testAssertions < prevAssertions) {
      if (!process.argv.includes('--allow-test-shrink')) {
        const err = new Error(
          `[Anti-Cheat Gate] Test file lines/assertions decreased compared to last passing run. Do NOT delete tests to pass verification. If intentional refactoring, run: node scripts/verify.mjs --allow-test-shrink`
        );
        err.gate = 'Anti-Cheat';
        throw err;
      }
    }
  }

  // Update baseline
  currentState.testBaseline = { testLines, testAssertions };
  return currentState;
}

function collectTestFiles(dir, files) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {}
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        collectTestFiles(fullPath, files);
      } else if (TEST_FILE_PATTERN.test(entry)) {
        files.push(fullPath);
      }
    } catch {}
  }
}

function runStep(name, fn) {
  process.stdout.write(`[VERIFY] ${name}... `);
  try {
    fn();
    console.log('PASS');
  } catch (err) {
    console.log('FAIL');
    recordFailure(name, err);
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

// Gate 1.6: Hardcoded Timezone Offset Check (Production Source)
runStep('Config (No hardcoded timezone offsets in src/)', () => {
  const violations = scanResult.timezoneViolations;
  if (violations.length > 0) {
    const err = new Error('Hardcoded timezone offsets detected in production source');
    err.customMessage =
      `Found ${violations.length} timezone violation(s):\n` +
      violations.map((v) => `  - ${v}`).join('\n') +
      `\nAction: Replace hardcoded offsets with Intl.DateTimeFormat using IANA timezone identifiers (e.g., Asia/Taipei).`;
    throw err;
  }
});

// Gate 1.7: Cost & Quota Gate (Unbounded Queries / Missing Limits)
runStep('Cost & Quota (No unbounded queries/missing limits)', () => {
  const violations = scanResult.costViolations;
  if (violations.length > 0) {
    const err = new Error('Cost & Quota violations detected');
    err.customMessage =
      `Found ${violations.length} cost/quota violation(s):\n` +
      violations.map((v) => `  - ${v}`).join('\n') +
      `\nAction: Add limit() to bound reads, or add // verify-ignore: cost to suppress if intentional.`;
    throw err;
  }
});

// Gate 1.8: E2E Boundary Gate (VITE_E2E, window.__*, etc. in src/)
runStep('E2E Boundary (No E2E leakage in src/)', () => {
  const violations = scanResult.e2eViolations;
  if (violations.length > 0) {
    const err = new Error('E2E boundary violations detected in production source');
    err.customMessage =
      `Found ${violations.length} E2E boundary violation(s):\n` +
      violations.map((v) => `  - ${v}`).join('\n') +
      `\nAction: Use Vite resolve.alias for E2E isolation; add // verify-ignore: e2e to suppress if intentional.`;
    throw err;
  }
});

// Gate 1.7: Config Sanity Check (Vite / Playwright / TSConfig / cross-env)
runStep('Config (No broken alias, cross-env, or deprecated baseUrl)', () => {
  // Check package.json for cross-env usage
  if (existsSync('package.json')) {
    const pkgContent = readFileSync('package.json', 'utf-8');
    if (pkgContent.includes('cross-env')) {
      const err = new Error('cross-env detected in package.json');
      err.customMessage =
        'package.json must NOT use cross-env; inject env vars via webServer.env in playwright.config.ts or native shell environment.';
      throw err;
    }
  }

  // Check vite.config.ts for invalid @fs alias pattern
  if (existsSync('vite.config.ts')) {
    const viteCfg = readFileSync('vite.config.ts', 'utf-8');
    if (viteCfg.includes("'/@fs/'") || viteCfg.includes('"/@fs/"')) {
      const err = new Error('Invalid Vite resolve.alias pattern');
      err.customMessage =
        'vite.config.ts uses "/@fs/" in resolve.alias, which does not match module resolution paths. Use regex or path.resolve() instead.';
      throw err;
    }
  }

  // Check playwright.config.ts and script files for cross-env usage
  const scriptFilesToCheck = ['playwright.config.ts', 'playwright.config.js'];
  for (const file of scriptFilesToCheck) {
    if (existsSync(file)) {
      const content = readFileSync(file, 'utf-8');
      if (content.includes('cross-env')) {
        const err = new Error(`cross-env detected in ${file}`);
        err.customMessage =
          `${file} must NOT use cross-env; inject env vars via webServer.env object instead.`;
        throw err;
      }
    }
  }

  // Check all tsconfig*.json files for deprecated baseUrl
  const rootFiles = readdirSync('.');
  const tsconfigFiles = rootFiles.filter((f) => /^tsconfig.*\.json$/.test(f));
  for (const tsFile of tsconfigFiles) {
    const tsCfg = readFileSync(tsFile, 'utf-8');
    const tsCfgClean = tsCfg
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    if (tsCfgClean.includes('"baseUrl"')) {
      const err = new Error(`Deprecated baseUrl detected in ${tsFile}`);
      err.customMessage =
        `${tsFile} must NOT contain "baseUrl"; use relative paths in "paths" (e.g., "./src/*") instead.`;
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

resetVerifyState();
console.log('=== ALL GATES PASSED ===');