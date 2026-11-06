import { describe, expect, it } from 'vitest';
import { cleanToken, mapOffsetToChunkIndex, normalizeAnswer } from './textUtils';

describe('shared text utilities', () => {
  it('cleans bracketed tokens and normalizes answer tokens consistently', () => {
    expect(cleanToken('[WENT.]')).toBe('went');
    expect(normalizeAnswer(['[The]', 'BOY,', 'WENT.'])).toBe('the boy went');
    expect(normalizeAnswer('  The   boy went. ')).toBe('the boy went');
  });

  it('maps character offsets to text tokens and multi-word chunks', () => {
    expect(mapOffsetToChunkIndex('one two three', 4, 3)).toBe(1);
    expect(mapOffsetToChunkIndex('The writer carrying a dictionary is Mr. Lee.', 11, 8, [
      'The', 'writer', 'carrying', 'a dictionary', 'is', 'Mr. Lee.',
    ])).toBe(2);
    expect(mapOffsetToChunkIndex('one two', -1, 2)).toBe(-1);
  });
});
