import { describe, expect, it } from 'vitest';
import { autoChunk, defaultUiModeForConcept, getVerbForms } from '@/rules/autoChunk';

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

  it('does not morph a manually bracketed phrase', () => {
    const chunks = autoChunk('He [is carrying a dictionary].', 'PAST_TENSE');

    expect(chunks[1].text).toBe('[is carrying a dictionary].');
    expect(chunks[1].can_morph).toBeUndefined();
  });

  it('adds known inflection choices for morphology concepts only', () => {
    const morphChunks = autoChunk('He went home.', 'TENSE_ASPECT');
    const buildChunks = autoChunk('He went home.', 'QUESTION_FORM');

    expect(morphChunks[1]).toMatchObject({
      can_morph: true,
      options: ['go', 'goes', 'went', 'gone', 'going', 'will go'],
      current_index: 2,
    });
    expect(buildChunks[1].can_morph).toBeUndefined();
  });

  it('adds a three-time future form and unreal-subjunctive choices for the grammar canvases', () => {
    const tenseChunks = autoChunk('He goes to school.', 'TENSE_ASPECT');
    const subjunctiveChunks = autoChunk('If I am you, I will go.', 'SUBJUNCTIVE');

    expect(tenseChunks.find(chunk => chunk.text === 'goes')?.options).toContain('will go');
    expect(subjunctiveChunks.find(chunk => chunk.text === 'am')?.options).toContain('were');
    expect(subjunctiveChunks.find(chunk => chunk.text === 'will')?.options).toContain('would');
  });

  it('uses the irregular verb table first and compromise for regular verbs', () => {
    expect(getVerbForms('went')).toMatchObject({
      infinitive: 'go',
      present: 'goes',
      past: 'went',
      participle: 'gone',
      gerund: 'going',
    });
    expect(getVerbForms('walked')).toMatchObject({
      infinitive: 'walk',
      present: 'walks',
      past: 'walked',
      participle: 'walked',
      gerund: 'walking',
    });
  });

  it('chooses a default interaction mode for each supported concept', () => {
    expect(defaultUiModeForConcept('TENSE_ASPECT')).toBe('MORPH');
    expect(defaultUiModeForConcept('PAST_TENSE')).toBe('MORPH');
    expect(defaultUiModeForConcept('ADJECTIVE_CLAUSE')).toBe('REDUCE');
    expect(defaultUiModeForConcept('QUESTION_FORM')).toBe('BUILD');
  });
});
