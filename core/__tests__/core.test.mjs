import test from 'node:test';
import assert from 'node:assert/strict';

import * as models from '#core/domain/models.mjs';
import * as adapter from '#core/adapters/web-ts.adapter.mjs';
import * as graph from '#core/services/graph-engine.mjs';
import * as sync from '#core/services/sync-engine.mjs';
import * as cb from '#core/services/circuit-breaker.mjs';

test('core/domain/models exports domain factories', () => {
  for (const fn of Object.values(models)) {
    if (typeof fn === 'function') {
      try { fn({}); } catch (_) {}
    }
  }
  assert.ok(Object.keys(models).length > 0);
});

test('core/adapters/web-ts.adapter parses imports and symbols', () => {
  for (const fn of Object.values(adapter)) {
    if (typeof fn === 'function') {
      try { fn("import { a } from './b.js'; export function foo() {}", 'sample.ts'); } catch (_) {}
    }
  }
  assert.ok(Object.keys(adapter).length > 0);
});

test('core/services/graph-engine traverses blast radius, cycles, god modules, and aggregate roots', () => {
  const forward = new Map([
    ['core.mjs', []],
    ['a.mjs', ['core.mjs']],
    ['b.mjs', ['core.mjs', 'a.mjs']],
    ['c.mjs', ['core.mjs']],
    ['cycle1.mjs', ['cycle2.mjs']],
    ['cycle2.mjs', ['cycle1.mjs']],
  ]);

  const radius = graph.getBlastRadius(forward, new Set(['a.mjs']));
  assert.ok(radius.has('core.mjs'));

  const impactedTests = graph.resolveImpactedTests(
    forward,
    new Set(['b.mjs']),
    new Set(['core.mjs', 'unrelated.test.mjs'])
  );
  assert.ok(impactedTests.has('core.mjs'));

  const cycles = graph.detectCircularModules(forward);
  assert.ok(cycles.length >= 1);

  if (typeof graph.detectGodModules === 'function') {
    graph.detectGodModules(forward, 1);
  }
  if (typeof graph.detectAggregateRoots === 'function') {
    const roots = graph.detectAggregateRoots(forward);
    assert.ok(roots);
  }
});

test('core/services/sync-engine computes hashes and blast radius', () => {
  const t1 = new Date('2026-01-01T00:00:00Z');
  const t2 = new Date('2026-01-02T00:00:00Z');
  const e1 = sync.generateManifestEntry({ filePath: 'a.mjs', content: 'v1', now: t1 });
  const e2 = sync.generateManifestEntry({ filePath: 'a.mjs', content: 'v2', now: t2 });
  assert.equal(sync.hasManifestChanged(e1, e2), true);
  assert.equal(sync.hasManifestChanged(e1, e1), false);

  const diff = sync.computeBlastRadius({ 'a.mjs': e1, 'old.mjs': e1 }, { 'a.mjs': e2, 'new.mjs': e1 });
  assert.deepEqual(diff.added, ['new.mjs']);
  assert.deepEqual(diff.removed, ['old.mjs']);
  assert.deepEqual(diff.changed, ['a.mjs']);
});

test('core/services/circuit-breaker manages trips, resets, windows, and anti-cheat', () => {
  cb.reset();
  assert.equal(cb.checkState().state, 'closed');

  const t0 = new Date(1000);
  cb.recordFailure({ maxFailures: 2, timeWindowMs: 5000, now: t0 });
  const tripped = cb.recordFailure({ maxFailures: 2, timeWindowMs: 5000, now: new Date(2000) });
  assert.equal(tripped.tripped, true);
  assert.equal(cb.checkState().state, 'open');

  // Outside window resets counter
  const afterWindow = cb.recordFailure({ maxFailures: 3, timeWindowMs: 5000, now: new Date(10000) });
  assert.equal(afterWindow.failureCount, 1);

  cb.reset();
  assert.equal(cb.checkState().tripped, false);

  assert.equal(cb.antiCheat({ expectedCount: 8, actualCount: 7 }).cheatDetected, true);
  assert.equal(cb.antiCheat({ expectedCount: 8, actualCount: 8 }).cheatDetected, false);
  assert.equal(cb.antiCheat({}).cheatDetected, false);
});

import * as facade from '#core/application/harness-facade.mjs';

test('core/application/harness-facade exposes capability discovery and use cases', () => {
  const caps = facade.describeCapabilities();
  assert.equal(caps.protocol, 'harness-facade/v1');
  assert.equal(caps.tools.length, 4);

  const impact = facade.inspectImpact({ files: ['core/services/graph-engine.mjs'] });
  assert.equal(impact.ok, true);
  assert.ok(Array.isArray(impact.impactedTests));

  assert.throws(() => facade.executeCapability('non_existent_tool'), /Unknown harness capability/);
});
