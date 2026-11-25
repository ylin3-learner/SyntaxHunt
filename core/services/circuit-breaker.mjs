/**
 * Circuit Breaker — records failure counter, anti-cheat test-shrink check,
 * and trip/reset state machine.
 *
 * @module core/services/circuit-breaker
 */

let failureCount = 0;
let tripState = false;
let lastFailureTime = null;

export function recordFailure({ maxFailures = 3, timeWindowMs, now = new Date() } = {}) {
  if (!lastFailureTime) {
    lastFailureTime = now;
  }

  const isWithinWindow =
    timeWindowMs === undefined ||
    now - lastFailureTime <= timeWindowMs;

  if (isWithinWindow) {
    failureCount++;
  } else {
    failureCount = 1;
    lastFailureTime = now;
  }

  const tripped = failureCount >= maxFailures;
  if (tripped) tripState = true;

  return { tripped, failureCount };
}

export function reset({ now = new Date() } = {}) {
  failureCount = 0;
  tripState = false;
  lastFailureTime = now;
  return { failureCount, tripState, resetAt: now.toISOString() };
}

export function checkState() {
  return {
    tripped: tripState,
    failureCount,
    state: tripState ? 'open' : 'closed',
  };
}

export function antiCheat({ expectedCount, actualCount } = {}) {
  if (expectedCount === undefined || actualCount === undefined) {
    return { cheatDetected: false, message: 'Insufficient parameters' };
  }
  const shrunk = actualCount < expectedCount;
  return {
    cheatDetected: shrunk,
    message: shrunk
      ? `Test shrink detected: ${actualCount} actual vs ${expectedCount} expected`
      : 'Test count intact',
  };
}
