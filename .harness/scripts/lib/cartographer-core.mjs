import fs from 'node:fs';
import path from 'node:path';

/**
 * 1. .gitignore Parser & Pattern Matcher
 */
export function gitignoreToRegExp(pattern, baseRelativeDir = '') {
  let p = pattern.trim();
  if (!p || p.startsWith('#')) return null;

  const isNegated = p.startsWith('!');
  if (isNegated) p = p.slice(1);

  const dirOnly = p.endsWith('/');
  if (dirOnly) p = p.slice(0, -1);

  let isAnchored = p.startsWith('/');
  if (isAnchored) p = p.slice(1);
  else if (p.includes('/')) isAnchored = true;

  let regexStr = '';
  let i = 0;
  while (i < p.length) {
    const char = p[i];
    if (char === '*') {
      if (p[i + 1] === '*') {
        if (p[i + 2] === '/') {
          regexStr += '(?:.*/)?';
          i += 3;
          continue;
        } else {
          regexStr += '.*';
          i += 2;
          continue;
        }
      } else {
        regexStr += '[^/]*';
        i++;
        continue;
      }
    } else if (char === '?') {
      regexStr += '[^/]';
      i++;
      continue;
    } else if ('[].+^$()|{}#\\'.includes(char)) {
      regexStr += '\\' + char;
      i++;
    } else {
      regexStr += char;
      i++;
    }
  }

  const prefix = baseRelativeDir ? baseRelativeDir.replace(/\\/g, '/').replace(/\/$/, '') + '/' : '';
  let fullPattern;

  if (isAnchored) {
    fullPattern = '^' + escapeRegExp(prefix) + regexStr + (dirOnly ? '(?:/.*)?$' : '(?:/.*)?$');
  } else {
    fullPattern = '(?:^|/)' + regexStr + (dirOnly ? '(?:/.*)?$' : '(?:/.*)?$');
  }

  return {
    negated: isNegated,
    regex: new RegExp(fullPattern),
    raw: pattern,
    baseDir: baseRelativeDir
  };
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class GitIgnoreFilter {
  constructor(rootDir = process.cwd()) {
    this.rootDir = path.resolve(rootDir);
    this.rules = [];
  }

  addGitignore(filePath, relativeDir = '') {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const rule = gitignoreToRegExp(line, relativeDir);
      if (rule) this.rules.push(rule);
    }
  }

  isIgnored(relativeFilePath, isDirectory = false) {
    const normalized = relativeFilePath.replace(/\\/g, '/').replace(/^\//, '');
    let ignored = false;

    for (const rule of this.rules) {
      const target = isDirectory && !normalized.endsWith('/') ? normalized + '/' : normalized;
      if (rule.regex.test(target) || rule.regex.test(normalized)) {
        ignored = !rule.negated;
      }
    }
    return ignored;
  }
}

/**
 * 2. Repo-wide Source Scanner
 */
const DEFAULT_IGNORES = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);
const DEFAULT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

export function scanSourceFiles(rootDir, options = {}) {
  const root = path.resolve(rootDir);
  const extensions = options.extensions ? new Set(options.extensions) : DEFAULT_EXTENSIONS;
  const filter = new GitIgnoreFilter(root);

  filter.addGitignore(path.join(root, '.gitignore'), '');

  const files = [];

  function walk(currentDir) {
    const relDir = path.relative(root, currentDir).replace(/\\/g, '/');
    const gitignorePath = path.join(currentDir, '.gitignore');
    if (fs.existsSync(gitignorePath) && relDir !== '') {
      filter.addGitignore(gitignorePath, relDir);
    }

    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(root, fullPath).replace(/\\/g, '/');

      if (DEFAULT_IGNORES.has(entry.name)) continue;

      if (entry.isDirectory()) {
        if (filter.isIgnored(relPath, true)) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.has(ext)) {
          if (!filter.isIgnored(relPath, false)) {
            files.push(fullPath);
          }
        }
      }
    }
  }

  walk(root);
  return files;
}


/**
 * 3. Import & Signature Extractor
 */
export function extractImportsAndExports(code) {
  const imports = [];
  const exports = [];

  const cleanCode = code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

  const importRegexes = [
    /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  ];

  for (const regex of importRegexes) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(cleanCode)) !== null) {
      if (match[1]) {
        imports.push({ specifier: match[1], raw: match[0] });
      }
    }
  }

  const uniqueImports = [];
  const seenSpecifiers = new Set();
  for (const imp of imports) {
    if (!seenSpecifiers.has(imp.specifier)) {
      seenSpecifiers.add(imp.specifier);
      uniqueImports.push(imp);
    }
  }

  const exportRegexes = [
    { type: 'function', regex: /export\s+(?:async\s+)?function\s*([a-zA-Z0-9_$]+)?/g },
    { type: 'const/let/var', regex: /export\s+(?:const|let|var)\s+([a-zA-Z0-9_$]+)/g },
    { type: 'class', regex: /export\s+class\s+([a-zA-Z0-9_$]+)/g },
    { type: 'interface', regex: /export\s+interface\s+([a-zA-Z0-9_$]+)/g },
    { type: 'type', regex: /export\s+type\s+([a-zA-Z0-9_$]+)/g },
    { type: 'default', regex: /export\s+default\s+(?:function|class)?\s*([a-zA-Z0-9_$]+)?/g },
    { type: 'named_group', regex: /export\s+\{([^}]+)\}/g }
  ];

  for (const { type, regex } of exportRegexes) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(cleanCode)) !== null) {
      if (type === 'named_group') {
        const namedList = match[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
        for (const name of namedList) {
          exports.push({ type: 'named', name });
        }
      } else {
        exports.push({ type, name: match[1] || 'default' });
      }
    }
  }

  return { imports: uniqueImports, exports };
}

/**
 * 4. Module Resolver
 */
export function loadTsconfigPaths(rootDir) {
  const tsconfigPath = path.join(rootDir, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) return { baseUrl: '.', paths: {} };

  try {
    const raw = fs.readFileSync(tsconfigPath, 'utf-8');
    const jsonStr = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
    const parsed = JSON.parse(jsonStr);
    const compilerOptions = parsed.compilerOptions || {};
    return {
      baseUrl: compilerOptions.baseUrl || '.',
      paths: compilerOptions.paths || {}
    };
  } catch {
    return { baseUrl: '.', paths: {} };
  }
}

export function resolveModule(specifier, currentFilePath, rootDir, tsconfigInfo = null) {
  if (!specifier) return null;

  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.d.ts'];
  const root = path.resolve(rootDir);
  const currentDir = path.dirname(path.resolve(currentFilePath));

  const checkFileCandidates = (basePath) => {
    if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) {
      return path.resolve(basePath);
    }

    const ext = path.extname(basePath);
    const basePathNoExt = ext ? basePath.slice(0, -ext.length) : basePath;

    for (const testExt of extensions) {
      const candidate = basePathNoExt + testExt;
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return path.resolve(candidate);
      }
    }

    for (const testExt of extensions) {
      const indexCandidate = path.join(basePath, 'index' + testExt);
      if (fs.existsSync(indexCandidate) && fs.statSync(indexCandidate).isFile()) {
        return path.resolve(indexCandidate);
      }
    }

    return null;
  };

  if (specifier.startsWith('@/') || specifier.startsWith('~/')) {
    const subPath = specifier.slice(2);
    const target = path.join(root, subPath);
    const res = checkFileCandidates(target);
    if (res) return res;

    const srcTarget = path.join(root, 'src', subPath);
    const srcRes = checkFileCandidates(srcTarget);
    if (srcRes) return srcRes;
  }

  if (tsconfigInfo && tsconfigInfo.paths) {
    const baseUrl = path.resolve(root, tsconfigInfo.baseUrl || '.');
    for (const [pattern, mappings] of Object.entries(tsconfigInfo.paths)) {
      const prefix = pattern.replace(/\*$/, '');
      if (specifier.startsWith(prefix)) {
        const remainder = specifier.slice(prefix.length);
        for (const mapping of mappings) {
          const mappedPath = mapping.replace(/\*$/, '') + remainder;
          const target = path.resolve(baseUrl, mappedPath);
          const res = checkFileCandidates(target);
          if (res) return res;
        }
      }
    }
  }

  if (specifier.startsWith('.')) {
    const target = path.resolve(currentDir, specifier);
    return checkFileCandidates(target);
  }

  return null;
}

/**
 * 5. Dependency Graph & Cycle Detection
 */
export function buildDependencyGraph(files, rootDir) {
  const tsconfigInfo = loadTsconfigPaths(rootDir);
  const graph = new Map();
  const fileSet = new Set(files.map(f => path.resolve(f)));

  for (const file of fileSet) {
    graph.set(file, new Set());
  }

  for (const file of fileSet) {
    let code = '';
    try {
      code = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }

    const { imports } = extractImportsAndExports(code);
    const deps = graph.get(file);

    for (const imp of imports) {
      const resolved = resolveModule(imp.specifier, file, rootDir, tsconfigInfo);
      if (resolved && fileSet.has(resolved) && resolved !== file) {
        deps.add(resolved);
      }
    }
  }

  return graph;
}

export function detectCycles(graph) {
  const cycles = [];
  const visited = new Set();
  const stack = new Set();
  const pathStack = [];

  function dfs(node) {
    visited.add(node);
    stack.add(node);
    pathStack.push(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (stack.has(neighbor)) {
        const cycleStartIndex = pathStack.indexOf(neighbor);
        if (cycleStartIndex !== -1) {
          const cycle = pathStack.slice(cycleStartIndex).concat(neighbor);
          cycles.push(cycle);
        }
      }
    }

    stack.delete(node);
    pathStack.pop();
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
}
