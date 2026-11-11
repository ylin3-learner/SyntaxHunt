/// <reference types="vitest" />
import { describe, it, expect } from 'vitest';
import { diagnoseModalVerb } from './specialStructures';
import type { QuestionData } from '../types'; // 引入型別

// 建立完整的 Mock QuestionData
const mockQuestion: QuestionData = {
  id: 'test-q',
  type: 'grammar',
  targetNoun: 'I',
  antecedent: { noun: 'I', number: 'singular', person: 'person' },
} as QuestionData;

describe('modalValidator – Modal Verb', () => {
  it('should flag wrong verb form after modal "can"', () => {
    const student = ['can', 'goes'];
    const correct = ['can', 'go'];
    const signals = diagnoseModalVerb({ studentTokens: student, correctTokens: correct, question: mockQuestion });
    expect(signals).toHaveLength(1);
    expect(signals[0].code).toBe('R:VERB:FORM');
  });

  it('should NOT flag correct modal + base form', () => {
    const student = ['can', 'go'];
    const correct = ['can', 'go'];
    const signals = diagnoseModalVerb({ studentTokens: student, correctTokens: correct, question: mockQuestion });
    expect(signals).toHaveLength(0);
  });

  it('should flag wrong form after "must"', () => {
    const student = ['must', 'running'];
    const correct = ['must', 'run'];
    const signals = diagnoseModalVerb({ studentTokens: student, correctTokens: correct, question: mockQuestion });
    expect(signals).toHaveLength(1);
    expect(signals[0].code).toBe('R:VERB:FORM');
  });
});