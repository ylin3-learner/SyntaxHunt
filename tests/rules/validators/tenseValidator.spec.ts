import { describe, it, expect } from 'vitest';
import { validateTense } from '@/rules/validators/tenseValidator';

describe('tenseValidator', () => {
  it('should flag present tense with past adverb', () => {
    const signals = validateTense(['I', 'go', 'yesterday'], ['I', 'went', 'yesterday']);
    expect(signals).toHaveLength(1);
    expect(signals[0].code).toBe('R:VERB:TENSE');
  });

  it('should NOT flag without past adverb', () => {
    expect(validateTense(['I', 'go'], ['I', 'went'])).toHaveLength(0);
  });
});

describe('tenseValidator – Comprehensive Tense Check', () => {
  it('should flag Future Perfect (will have + p.p.)', () => {
    const signals = validateTense(['He', 'finishes'], ['He', 'will', 'have', 'finished']);
    expect(signals).toHaveLength(1);
    expect(signals[0].hint).toContain('未來完成式');
  });

  it('should flag Present Continuous (am/is/are + V-ing)', () => {
    const signals = validateTense(['He', 'works'], ['He', 'is', 'working']);
    expect(signals).toHaveLength(1);
    expect(signals[0].hint).toContain('進行式');
  });

  it('should flag Past Perfect (had + p.p.)', () => {
    const signals = validateTense(['He', 'finished'], ['He', 'had', 'finished']);
    expect(signals).toHaveLength(1);
    expect(signals[0].hint).toContain('完成式');
  });
});