import { describe, expect, it } from 'vitest';
import { autoChunk, defaultUiModeForConcept } from './autoChunk';

describe('autoChunk', () => {
  it('keeps bracketed phrases as a single chunk before applying other tokenization', () => {
    const chunks = autoChunk('The boy [who lives here] is kind.', 'ADJECTIVE_CLAUSE');

    expect(chunks.map(chunk => chunk.text)).toEqual([
      'The',
      'boy',
      '[who lives here]',
      'is',
      'kind.',
    ]);
  });

  it('uses deterministic phrase matching for connector concepts', () => {
    const chunks = autoChunk(
      'I stayed home because of the rain.',
      'CLAUSES_CONNECTORS'
    );

    expect(chunks.map(chunk => chunk.text)).toContain('because of');
    expect(chunks.map(chunk => chunk.text).join(' ')).toBe(
      'I stayed home because of the rain.'
    );
  });

  it('adds known inflection choices for morphology concepts only', () => {
    const morphChunks = autoChunk('He went home.', 'TENSE_ASPECT');
    const buildChunks = autoChunk('He went home.', 'QUESTION_FORM');

    expect(morphChunks[1]).toMatchObject({
      can_morph: true,
      options: ['go', 'goes', 'went', 'gone', 'going'],
      current_index: 2,
    });
    expect(buildChunks[1].can_morph).toBeUndefined();
  });

  it('chooses a default interaction mode for each supported concept', () => {
    expect(defaultUiModeForConcept('TENSE_ASPECT')).toBe('MORPH');
    expect(defaultUiModeForConcept('ADJECTIVE_CLAUSE')).toBe('REDUCE');
    expect(defaultUiModeForConcept('QUESTION_FORM')).toBe('BUILD');
  });
});
