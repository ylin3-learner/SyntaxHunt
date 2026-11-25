import { describe, expect, it } from 'vitest';
import {
  parseMorphOptions,
  formatMorphOption,
  formatMorphOptions,
} from '@/utils/morphOptions';

describe('parseMorphOptions', () => {
  it('parses simple comma separated options', () => {
    expect(parseMorphOptions('go, goes, went')).toEqual(['go', 'goes', 'went']);
  });

  it('preserves spaces inside options grouped with square brackets', () => {
    expect(parseMorphOptions('go, [will not], won\'t')).toEqual([
      'go',
      'will not',
      "won't",
    ]);
  });

  it('strips the bracket characters but keeps the inner text', () => {
    expect(parseMorphOptions('[is carrying a dictionary]')).toEqual([
      'is carrying a dictionary',
    ]);
  });

  it('trims whitespace around each option', () => {
    expect(parseMorphOptions('  go  ,  goes  ')).toEqual(['go', 'goes']);
  });

  it('ignores empty segments produced by trailing or doubled commas', () => {
    expect(parseMorphOptions('go,, goes,')).toEqual(['go', 'goes']);
  });

  it('handles options that contain commas inside the brackets', () => {
    expect(parseMorphOptions('[one, two], three')).toEqual([
      'one, two',
      'three',
    ]);
  });

  it('keeps multi word phrases without brackets by leaving inner spaces intact', () => {
    // Spaces are only treated as separators when outside brackets; inside a
    // single option the comma boundary still splits, so multi-word text
    // without brackets is kept as-is only when the caller groups it.
    expect(parseMorphOptions('take off')).toEqual(['take off']);
  });

  it('returns an empty array for empty input', () => {
    expect(parseMorphOptions('')).toEqual([]);
    expect(parseMorphOptions('   ')).toEqual([]);
  });
});

describe('formatMorphOption', () => {
  it('leaves single word options untouched', () => {
    expect(formatMorphOption('go')).toBe('go');
    expect(formatMorphOption('went')).toBe('went');
  });

  it('wraps options that contain spaces in square brackets', () => {
    expect(formatMorphOption('will not')).toBe('[will not]');
  });

  it('wraps options that contain commas in square brackets', () => {
    expect(formatMorphOption('one, two')).toBe('[one, two]');
  });
});

describe('formatMorphOptions', () => {
  it('round-trips through parseMorphOptions', () => {
    const options = ['go', 'will not', "won't", 'one, two'];
    expect(parseMorphOptions(formatMorphOptions(options))).toEqual(options);
  });

  it('joins simple options with commas and spaces', () => {
    expect(formatMorphOptions(['go', 'goes', 'went'])).toBe('go, goes, went');
  });
});