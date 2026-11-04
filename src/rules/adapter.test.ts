import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convertLegacyQuestion, mapOffsetToChunkIndex } from './adapter';
import type { QuestionData } from './types';

const parseCsvLine = (line: string): string[] => {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"' && inQuotes && line[index + 1] === '"') {
      field += '"';
      index++;
    } else if (character === '"') {
      inQuotes = !inQuotes;
    } else if (character === ',' && !inQuotes) {
      fields.push(field);
      field = '';
    } else {
      field += character;
    }
  }
  fields.push(field);
  return fields;
};

const exportedLegacyQuestions = readFileSync(
  resolve(process.cwd(), 'questions_rows.csv'),
  'utf8'
).trim().split(/\r?\n/).slice(1).map(line => {
  const [, data] = parseCsvLine(line);
  return JSON.parse(data) as QuestionData;
});

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
  it('maps LanguageTool character ranges to the corresponding chunk including phrases', () => {
    const text = 'The writer carrying a dictionary is Mr. Lee.';

    expect(mapOffsetToChunkIndex(text, 11, 8, [
      'The',
      'writer',
      'carrying',
      'a dictionary',
      'is',
      'Mr. Lee.',
    ])).toBe(2);
    expect(mapOffsetToChunkIndex(text, 25, 10, [
      'The',
      'writer',
      'carrying',
      'a dictionary',
      'is',
      'Mr. Lee.',
    ])).toBe(3);
    expect(mapOffsetToChunkIndex('one two three', 4, 3)).toBe(1);
    expect(mapOffsetToChunkIndex('one two', -1, 2)).toBe(-1);
  });

  it('adapts all 20 exported legacy questions without mutating their stored data', () => {
    expect(exportedLegacyQuestions).toHaveLength(20);

    exportedLegacyQuestions.forEach(question => {
      const original = structuredClone(question);
      const converted = convertLegacyQuestion(question);
      const legacyTiles = question.grammarFeature?.relative.tiles ?? [];

      expect(converted.ui_mode).toBe(question.mode === 'reduce' ? 'REDUCE' : 'BUILD');
      expect(converted.correctAnswer).toEqual(
        question.mode === 'reduce'
          ? question.grammarFeature?.preposition.correctAnswer
          : question.grammarFeature?.relative.correctAnswer
      );
      expect(converted.chunks.slice(0, legacyTiles.length).map(chunk => chunk.text)).toEqual(legacyTiles);
      expect(new Set(converted.chunks.map(chunk => chunk.id)).size).toBe(converted.chunks.length);
      expect(question).toEqual(original);
    });
  });

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
      [...(legacyQuestion.grammarFeature?.relative.tiles ?? []), 'in']
    );
    expect(converted.correctAnswer).toEqual(
      legacyQuestion.grammarFeature?.preposition.correctAnswer
    );
  });

  it('adds replacement words missing from the source tiles in Reduce mode', () => {
    const question: QuestionData = {
      ...legacyQuestion,
      id: 'legacy-reduce-replacement',
      mode: 'reduce',
      grammarFeature: {
        relative: {
          label: 'who is carrying [a dictionary]',
          tiles: ['who', 'is', 'carrying', '[a dictionary]'],
          correctAnswer: ['who', 'is', 'carrying', '[a dictionary]'],
        },
        preposition: {
          label: '[with a dictionary]',
          tiles: ['[with a dictionary]'],
          correctAnswer: ['[with a dictionary]'],
        },
      },
    };

    const converted = convertLegacyQuestion(question);

    expect(converted.chunks.map(chunk => chunk.text)).toEqual([
      'who', 'is', 'carrying', '[a dictionary]', 'with',
    ]);
    expect(converted.correctAnswer).toEqual(['[with a dictionary]']);
  });

  it('adds missing replacement words when Reduce questions provide explicit chunks', () => {
    const question: QuestionData = {
      ...legacyQuestion,
      id: 'modern-reduce-replacement',
      ui_mode: 'REDUCE',
      chunks: [{ id: 'phrase', text: '[a dictionary]' }],
      correctAnswer: ['[with a dictionary]'],
    };

    const converted = convertLegacyQuestion(question);

    expect(converted.chunks.map(chunk => chunk.text)).toEqual(['[a dictionary]', 'with']);
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
