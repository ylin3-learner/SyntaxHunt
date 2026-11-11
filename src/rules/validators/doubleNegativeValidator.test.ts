import { describe, it, expect } from 'vitest';
import { validateDoubleNegative } from './doubleNegativeValidator';

describe('doubleNegativeValidator', () => {
  it('should flag "don\'t never"', () => {
    const signals = validateDoubleNegative(["I", "don't", "never", "go"], []);
    expect(signals).toHaveLength(1);
    expect(signals[0].code).toBe('R:DOUBLE_NEG');
  });

  it('should NOT flag single negatives', () => {
    expect(validateDoubleNegative(["I", "don't", "know"], [])).toHaveLength(0);
  });
});