/**
 * Graph Engine — Pure language-agnostic dependency graph and blast radius analysis.
 *
 * Provides forward/reverse graph construction, test file resolution,
 * circular dependency detection, and god module identification.
 *
 * Design notes:
 * - Pure functions with no UI or SDK imports.
 * - Accept `now: Date` / clock as a parameter for deterministic behavior.
 * - Import-free: works in any JS environment.
 *
 * @module core/services/graph-engine
 */

/**
 * Compute the blast radius (all modules transitively affected) starting
 * from the given impacted module IDs.
 *
 * @param {Map<string, string[]>} forward  Forward dependency map.
 * @param {Set<string>} startIds          IDs of modules initially impacted.
 * @returns {Set<string>}  All module IDs in the blast radius.
 */
export function getBlastRadius(forward, startIds) {
  const visited = new Set(startIds);
  const queue = [...startIds];

  while (queue.length > 0) {
    const curr = queue.shift();
    const deps = forward.get(curr) || [];
    for (const dep of deps) {
      if (!visited.has(dep)) {
        visited.add(dep);
        queue.push(dep);
      }
    }
  }

  return visited;
}

/**
 * Resolve which test files are impacted by the given module changes,
 * based on the dependency graph.
 *
 * @param {Map<string, string[]>} forward   Forward dependency map.
 * @param {Set<string>} impactedModules    Module IDs that were changed.
 * @param {Set<string>} allTestIds          All known test module IDs.
 * @returns {Set<string>}  Test file IDs that are impacted.
 */
export function resolveImpactedTests(forward, impactedModules, allTestIds) {
  const impactedTests = new Set();

  for (const modId of impactedModules) {
    // Find all modules reachable from the impacted module (upstream deps)
    const reachable = new Set();
    const stack = [modId];
    while (stack.length > 0) {
      const curr = stack.pop();
      if (reachable.has(curr)) continue;
      reachable.add(curr);
      const deps = forward.get(curr);
      if (deps) for (const d of deps) stack.push(d);
    }

    // Match against test IDs
    for (const testId of allTestIds) {
      if (reachable.has(testId) || impactedModules.has(testId)) {
        impactedTests.add(testId);
      }
    }
  }

  return impactedTests;
}

/**
 * Detect circular dependencies in the module graph.
 *
 * @param {Map<string, string[]>} forward  Forward dependency map.
 * @returns {Array<Array<string>>}  Array of cycles, each cycle is a list of module IDs.
 */
export function detectCircularModules(forward) {
  const visited = new Set();
  const inStack = new Set();
  const cycles = [];

  function dfs(node, path) {
    visited.add(node);
    inStack.add(node);
    path.push(node);

    const deps = forward.get(node) || [];
    for (const dep of deps) {
      if (!visited.has(dep)) {
        dfs(dep, path);
      } else if (inStack.has(dep)) {
        // Found a cycle — extract the cycle portion
        const cycleStart = path.indexOf(dep);
        cycles.push(path.slice(cycleStart));
      }
    }

    path.pop();
    inStack.delete(node);
  }

  for (const node of forward.keys()) {
    if (!visited.has(node)) {
      dfs(node, []);
    }
  }

  return cycles;
}

/**
 * Detect "god modules" — modules with an excessive number of dependencies
 * that may indicate poor separation of concerns.
 *
 * @param {Map<string, string[]>} forward  Forward dependency map.
 * @param {number} threshold               Maximum allowed dependencies before flagging.
 * @returns {Array<{id: string, depsCount: number}>}  God module candidates.
 */
export function detectGodModules(forward, threshold = 15) {
  const candidates = [];

  for (const [id, deps] of forward) {
    if (deps.length > threshold) {
      candidates.push({ id, depsCount: deps.length });
    }
  }

  return candidates.sort((a, b) => b.depsCount - a.depsCount);
}

/**
 * Detect aggregate roots — modules that serve as central hubs in the
 * dependency graph. A module is tagged as an aggregate root if:
 * 1. It has high inbound coupling (importedBy count >= 3), OR
 * 2. It owns database models/schemas (indicated by runtime-db.md references).
 *
 * @param {Map<string, string[]>} forward      Forward dependency map.
 * @param {object} opts                       Optional dependencies.
 * @param {object} opts.runtimeDbFiles        Set of filenames that contain DB model references.
 * @param {number} [opts.inboundThreshold=3]  Minimum inbound imports to qualify as aggregate root.
 * @returns {Set<string>}  Set of module IDs tagged as aggregate roots.
 */
export function detectAggregateRoots(forward, { runtimeDbFiles, inboundThreshold = 3 } = {}) {
  const roots = new Set();

  // Check inbound coupling: modules with >= inboundThreshold importers
  for (const [id, deps] of forward) {
    // inbound count = number of other modules that import this one
    let inboundCount = 0;
    for (const [otherId, otherDeps] of forward) {
      if (otherId !== id && otherDeps.includes(id)) {
        inboundCount++;
      }
    }
    if (inboundCount >= inboundThreshold) {
      roots.add(id);
    }
  }

  // Check database ownership: modules that reference runtime-db.md schemas
  if (runtimeDbFiles && runtimeDbFiles.size > 0) {
    for (const [id, deps] of forward) {
      // A module 'owns' DB schemas if its deps include schema-related modules
      // We check if any of its deps are in the runtimeDbFiles set
      for (const dep of deps) {
        if (runtimeDbFiles.has(dep) || runtimeDbFiles.has(id)) {
          roots.add(id);
          break;
        }
      }
    }
  }

  return roots;
}
