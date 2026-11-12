/// <reference types="vitest" />
import { describe, it, expect } from 'vitest';
import { diagnoseSubjunctiveMood } from '@/rules/validators/specialStructures';
import type { QuestionData } from '@/rules/types'; // 引入型別

// 建立完整的 Mock QuestionData
const mockQuestion: QuestionData = {
  id: 'test-q',
  type: 'grammar',
  targetNoun: 'I',
  antecedent: { noun: 'I', number: 'singular', person: 'person' },
} as QuestionData;

describe('subjunctiveValidator – Subjunctive Mood', () => {
  it('should flag missing subjunctive cue when "if" absent', () => {
    const student = ['I', 'wish', 'he', 'were', 'here'];
    const correct = ['I', 'wish', 'he', 'were', 'here'];
    const signals = diagnoseSubjunctiveMood({ studentTokens: student, correctTokens: correct, question: mockQuestion });
    
    expect(signals).toHaveLength(0); 
  });

  it('should NOT flag when no subjunctive cue present', () => {
    const student = ['I', 'think', 'that', 'he', 'is', 'here'];
    const correct = ['I', 'think', 'that', 'he', 'is', 'here'];
    const signals = diagnoseSubjunctiveMood({ studentTokens: student, correctTokens: correct, question: mockQuestion });
    expect(signals).toHaveLength(0);
  });

  it('should flag wrong "was" / "were" form after "if"', () => {
    const student = ['if', 'I', 'was', 'there'];
    const correct = ['if', 'I', 'were', 'there'];
    const signals = diagnoseSubjunctiveMood({ studentTokens: student, correctTokens: correct, question: mockQuestion });
    expect(signals).toHaveLength(1);
    expect(signals[0].code).toBe('R:VERB:MOOD');
  });
});