import { describe, it, expect } from 'vitest';
import { validateGerundInfinitive } from './gerundInfinitiveValidator';

describe('gerundInfinitiveValidator', () => {
  it('should flag "enjoy to V"', () => {
    const signals = validateGerundInfinitive(['I', 'enjoy', 'to', 'read'], ['I', 'enjoy', 'reading']);
    expect(signals[0].code).toBe('R:VERB:FORM');
  });

  it('should flag "want V-ing"', () => {
    const signals = validateGerundInfinitive(['I', 'want', 'reading'], ['I', 'want', 'to', 'read']);
    expect(signals[0].code).toBe('R:VERB:FORM');
  });

  it('should NOT flag words ending in "ing" that are not verbs (e.g. something)', () => {
    // 這行目前會報錯，因為我們的 Validator 只檢查 .endsWith('ing')
    const signals = validateGerundInfinitive(['I', 'want', 'something'], ['I', 'want', 'something']);
    expect(signals).toHaveLength(0); 
  });
});