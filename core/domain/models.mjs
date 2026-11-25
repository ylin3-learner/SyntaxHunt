/**
 * Core Domain Models — Factory helpers and JSDoc typedefs for canonical
 * domain entities.
 *
 * Pure functions with zero external dependencies. These factories produce
 * plain JS objects that describe domain concepts; they contain no business
 * rules (those live in services/), making them safely importable from any
 * layer including the ACL adapter.
 *
 * @module core/domain/models
 */

export function createModuleNode({
  id,
  name,
  path,
  deps = [],
  config = {},
  isTest = false,
}) {
  return {
    id: id || crypto.randomUUID(),
    name: name || 'UnnamedModule',
    path: path || '',
    deps,
    config,
    isTest,
  };
}

/**
 * Domain entity representing a runtime contract between modules or between
 * the application and its external environment (DB, filesystem, HTTP
 * endpoints, etc.).
 *
 * @typedef {Object} RuntimeContract
 * @property {string} id          Unique contract identifier.
 * @property {string} type        Classification of contract (`'db'`, `'http'`,
 *                               `'file'`, `'cache'`, `'messaging'`, etc.).
 * @property {string} name        Human-readable contract name.
 * @property {string} endpoint    Identifier or description of the contract
 *                                endpoint (e.g., collection name, SQL table,
 *                                URL path, queue name).
 * @property {string[]} required  List of identifiers of other contracts or
 *                                modules that this contract depends on.
 * @property {Record<string, any>} options  Contract-specific options (e.g.,
 *                                            connection string, timeout, TTL).
 * @property {boolean} isMock     `true` when the contract is used in a test
 *                                context and replaced by a mock/stub.
 */
export function createRuntimeContract({
  id,
  type,
  name,
  endpoint,
  required = [],
  options = {},
  isMock = false,
}) {
  return {
    id: id || crypto.randomUUID(),
    type: type || 'unknown',
    name: name || 'UnnamedContract',
    endpoint: endpoint || '',
    required,
    options,
    isMock,
  };
}

/**
 * Domain entity representing a risk assessment report generated from
 * static analysis of code. Holds the set of findings, scores, and
 * remediation recommendations.
 *
 * @typedef {Object} RiskReport
 * @property {string} id        Unique report identifier.
 * @property {string} title     Human-readable report title.
 * @property {number} score     Composite risk score (0–100), where higher
 *                              values indicate greater risk.
 * @property {number} severity  Severity level (`1` = low, `2` = medium,
 *                              `3` = high, `4` = critical).
 * @property {string[]} findings  Human-readable descriptions of each
 *                                identified risk finding.
 * @property {Record<string, any>} metadata  Additional metadata such as
 *                                             the analysis timestamp, tool
 *                                             version, or analyst notes.
 * @property {string} generatedAt  ISO 8601 timestamp when the report was
 *                                   generated.
 */
export function createRiskReport({
  title,
  score = 0,
  severity = 1,
  findings = [],
  metadata = {},
  generatedAt,
}) {
  return {
    id: crypto.randomUUID(),
    title: title || 'UntitledRiskReport',
    score,
    severity,
    findings,
    metadata,
    generatedAt: generatedAt || new Date().toISOString(),
  };
}

/**
 * Domain entity representing the verification gate state that the
 * harness runtime checks before allowing test execution or build steps
 * to proceed. This is the core "immutable contract" that the `.verify-state.json`
 * persistence model mirrors.
 *
 * @typedef {Object} VerifyGate
 * @property {string} id          Unique gate identifier (fixed as `'verify-gate'`).
 * @property {boolean} enabled    `true` when the gate is active; `false`
 *                                when manually disabled or tripped by a
 *                                circuit breaker.
 * @property {number} failureCount  Consecutive failure count that triggers
 *                                  the circuit breaker trip when it reaches 3.
 * @property {boolean} trip       `true` when the gate has tripped and is
 *                                blocking further execution.
 * @property {Record<string, any>} lastRun  Timestamp and result of the
 *                                            last verification run.
 * @property {string} lastRun.at    ISO 8601 timestamp of the last run.
 * @property {('pass'|'fail'|'skip')} lastRun.result  Outcome of the last run.
 * @property {number} lastRun.durationMs  Duration of the last run in
 *                                          milliseconds.
 */
export function createVerifyGate({
  enabled = true,
  trip = false,
  failureCount = 0,
  lastRun = {},
}) {
  return {
    id: 'verify-gate',
    enabled,
    trip,
    failureCount,
    lastRun: {
      at: lastRun.at || null,
      result: lastRun.result || null,
      durationMs: lastRun.durationMs || 0,
    },
  };
}
