import { describe, expect, it } from 'vitest';
import { splitGrammarSentenceManually } from '@/utils/morphSentence';

describe('splitGrammarSentenceManually', () => {
  it('splits on whitespace for plain sentences', () => {
    expect(splitGrammarSentenceManually('The boy is kind.')).toEqual([
      'The',
      'boy',
      'is',
      'kind.',
    ]);
  });

  it('collapses repeated whitespace', () => {
    expect(splitGrammarSentenceManually('The   boy\nis')).toEqual([
      'The',
      'boy',
      'is',
    ]);
  });

  it('keeps bracketed phrases as a single chunk including their spaces', () => {
    expect(
      splitGrammarSentenceManually('He [is carrying a dictionary].'),
    ).toEqual(['He', '[is carrying a dictionary].']);
  });

  it('treats text after a closing bracket as a new word', () => {
    expect(
      splitGrammarSentenceManually('The [very tall] building is here.'),
    ).toEqual(['The', '[very tall]', 'building', 'is', 'here.']);
  });

  it('does not split on spaces inside nested brackets', () => {
    expect(splitGrammarSentenceManually('a [b [c d] e] f')).toEqual([
      'a',
      '[b [c d] e]',
      'f',
    ]);
  });

  it('returns an empty array for blank input', () => {
    expect(splitGrammarSentenceManually('')).toEqual([]);
    expect(splitGrammarSentenceManually('   ')).toEqual([]);
  });
});