import { describe, it, expect } from 'vitest';
import { validateInversion } from './inversionValidator'; // 修正 Import

describe('inversionValidator', () => {
  it('should flag "Never I have" vs "Never have I"', () => {
    const signals = validateInversion(['Never', 'I', 'have', 'seen'], ['Never', 'have', 'I', 'seen']);
    expect(signals).toHaveLength(1);
    expect(signals[0].code).toBe('O:INVERSION');
  });

  it('should flag "Not only he can"', () => {
    const signals = validateInversion(['Not', 'only', 'he', 'can', 'swim'], ['Not', 'only', 'can', 'he', 'swim']);
    expect(signals).toHaveLength(1);
    expect(signals[0].code).toBe('O:INVERSION');
  });

  it('should NOT flag correct inversions', () => {
    expect(validateInversion(['Never', 'have', 'I', 'seen'], ['Never', 'have', 'I', 'seen'])).toHaveLength(0);
  });
});