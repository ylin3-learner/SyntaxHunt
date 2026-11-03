import { describe, expect, it } from 'vitest';
import { convertLegacyQuestion } from './adapter';
import type { QuestionData } from './types';

const legacyQuestion: QuestionData = {
  id: 'legacy-build',
  type: 'standard',
  mode: 'build',
  targetNoun: 'The girl',
  antecedent: { noun: 'The girl', number: 'singular', person: 'person' },
  grammarFeature: {
    relative: {
      label: 'who wears a blue uniform',
      tiles: ['wears', 'uniform', 'who', 'blue', 'a', 'she'],
      correctAnswer: ['who', 'wears', 'a', 'blue', 'uniform'],
      distractors: ['she'],
    },
    preposition: {
      label: 'in a blue uniform',
      tiles: ['uniform', 'in', 'blue', 'a'],
      correctAnswer: ['in', 'a', 'blue', 'uniform'],
    },
  },
};

describe('convertLegacyQuestion', () => {
  it('adapts a legacy build question for the requested feature without mutating it', () => {
    const original = structuredClone(legacyQuestion);

    const converted = convertLegacyQuestion(legacyQuestion, 'preposition');

    expect(converted.type).toBe('grammar');
    expect(converted.ui_mode).toBe('BUILD');
    expect(converted.chunks.map(chunk => chunk.text)).toEqual(
      legacyQuestion.grammarFeature?.preposition.tiles
    );
    expect(converted.correctAnswer).toEqual(
      legacyQuestion.grammarFeature?.preposition.correctAnswer
    );
    expect(legacyQuestion).toEqual(original);
  });

  it('maps legacy reduce mode to REDUCE while keeping its starting tiles and target answer', () => {
    const question: QuestionData = {
      ...legacyQuestion,
      id: 'legacy-reduce',
      mode: 'reduce',
    };

    const converted = convertLegacyQuestion(question);

    expect(converted.ui_mode).toBe('REDUCE');
    expect(converted.chunks.map(chunk => chunk.text)).toEqual(
      legacyQuestion.grammarFeature?.relative.tiles
    );
    expect(converted.correctAnswer).toEqual(
      legacyQuestion.grammarFeature?.preposition.correctAnswer
    );
  });

  it('preserves explicit modern data and initializes morph options safely', () => {
    const question: QuestionData = {
      ...legacyQuestion,
      type: 'grammar',
      ui_mode: 'MORPH',
      chunks: [{
        id: 'verb',
        text: 'went',
        can_morph: true,
        morph_options: ['go', 'went', 'gone'],
      }],
      correctAnswer: ['went'],
    };

    const converted = convertLegacyQuestion(question);

    expect(converted.chunks[0]).toMatchObject({
      text: 'went',
      options: ['go', 'went', 'gone'],
      current_index: 1,
    });
    expect(converted.correctAnswer).toEqual(['went']);
    expect(converted.ui_mode).toBe('MORPH');
  });

  it('does not replace explicitly provided chunks or answers with legacy values', () => {
    const question: QuestionData = {
      ...legacyQuestion,
      chunks: [{ id: 'custom', text: 'custom chunk' }],
      correctAnswer: ['custom', 'answer'],
    };

    const converted = convertLegacyQuestion(question);

    expect(converted.chunks.map(chunk => chunk.text)).toEqual(['custom chunk']);
    expect(converted.correctAnswer).toEqual(['custom', 'answer']);
  });
});
