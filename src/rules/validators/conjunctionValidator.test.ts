/// <reference types="vitest" />
import { describe, it, expect } from 'vitest';
import { diagnoseConjunctions } from './specialStructures';
import type { QuestionData } from '../types'; // 引入型別

// 建立完整的 Mock QuestionData
const mockQuestion: QuestionData = {
  id: 'test-q',
  type: 'grammar',
  targetNoun: 'I',
  antecedent: { noun: 'I', number: 'singular', person: 'person' },
} as QuestionData;

describe('conjunctionValidator – Conjunction', () => {
  it('should flag extra conjunction "and"', () => {
    const student = ['I', 'and', 'you', 'and', 'we'];
    const correct = ['I', 'and', 'you', 'we'];
    const signals = diagnoseConjunctions({ studentTokens: student, correctTokens: correct, question: mockQuestion });
    expect(signals).toHaveLength(1);
    expect(signals[0].code).toBe('U:CONJ'); //（因為多了一個 and，本來就是 U:CONJ）
  });

  it('should NOT flag when no conjunction differences', () => {
    const student = ['I', 'and', 'you'];
    const correct = ['I', 'and', 'you'];
    const signals = diagnoseConjunctions({ studentTokens: student, correctTokens: correct, question: mockQuestion });
    expect(signals).toHaveLength(0);
  });

  it('should flag missing conjunction', () => {
    const student = ['I', 'you'];
    const correct = ['I', 'and', 'you'];
    const signals = diagnoseConjunctions({ studentTokens: student, correctTokens: correct, question: mockQuestion });
    expect(signals).toHaveLength(1);
    expect(signals[0].code).toBe('M:CONJ');
  });
});