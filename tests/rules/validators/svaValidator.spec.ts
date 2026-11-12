import { describe, it, expect } from 'vitest';
import { validateSVA } from '@/rules/validators/svaValidator';

describe('svaValidator', () => {
  it('should flag "He go" vs "He goes"', () => {
    const signals = validateSVA(['He', 'go'], ['He', 'goes']);
    expect(signals).toHaveLength(1);
    expect(signals[0].code).toBe('R:VERB:SVA');
  });

  it('should NOT flag correct sentences', () => {
    expect(validateSVA(['He', 'goes'], ['He', 'goes'])).toHaveLength(0);
    expect(validateSVA(['I', 'go'], ['I', 'go'])).toHaveLength(0);
  });

  it('should flag be-verb mismatches', () => {
    const signals = validateSVA(['He', 'am'], ['He', 'is']);
    expect(signals).toHaveLength(1);
    expect(signals[0].code).toBe('R:VERB:SVA');
  });
});