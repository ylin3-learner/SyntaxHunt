import { describe, it, expect } from 'vitest';
import { diagnoseGrammar } from '@/rules/grammarRules';
import type { QuestionData, Chunk } from '@/rules/types';

// 建立一個通用的 Mock 題目資料
const mockQuestion: QuestionData = {
  id: 'q_test_1',
  type: 'grammar', // 將 'standard' 改為 'grammar'
  ui_mode: 'BUILD',
  targetNoun: 'The boy',
  antecedent: { noun: 'The boy', number: 'singular', person: 'person' },
  correctAnswer: ['who', 'is', '[looking up words]'],
  chunks: [], // 根據新 Schema，補上必填的 chunks 陣列
};

describe('Grammar Engine - diagnoseGrammar', () => {

  // 測試 1：完全正確
  it('應該回傳空陣列，如果答案完全正確', () => {
    const studentTokens = ['who', 'is', '[looking up words]'];
    const signals = diagnoseGrammar(studentTokens, mockQuestion.correctAnswer!, mockQuestion);
    expect(signals).toHaveLength(0);
  });

  // 測試 2：重複代名詞 (U:PRON)
  it('應該抓出重複代名詞 (U:PRON / Addition)', () => {
    const studentTokens = ['who', 'he', 'is', '[looking up words]'];
    const signals = diagnoseGrammar(studentTokens, mockQuestion.correctAnswer!, mockQuestion);
    
    expect(signals.some(s => s.code === 'U:PRON')).toBe(true);
    expect(signals[0].sst).toBe('Addition');
  });

  // 測試 3：主謂不一致 (R:VERB:SVA)
  it('應該抓出主謂不一致 (R:VERB:SVA / Misformation)', () => {
    // 假設 mockQuestion 先行詞是單數 The boy
    const studentTokens = ['who', 'are', '[looking up words]']; // 錯誤：用了 are
    const signals = diagnoseGrammar(studentTokens, mockQuestion.correctAnswer!, mockQuestion);
    
    expect(signals.some(s => s.code === 'R:VERB:SVA')).toBe(true);
    expect(signals[0].sst).toBe('Misformation');
    expect(signals[0].index).toBe(1); // 錯誤應該標記在 are 上
  });

  // 測試 4：關代選擇錯誤 (R:RELATIVE)
  it('應該抓出先行詞是人卻用了 which (R:RELATIVE)', () => {
    const studentTokens = ['which', 'is', '[looking up words]'];
    const signals = diagnoseGrammar(studentTokens, mockQuestion.correctAnswer!, mockQuestion);
    
    expect(signals.some(s => s.code === 'R:RELATIVE')).toBe(true);
    expect(signals[0].index).toBe(0); // 錯誤在 which
  });

  // 測試 5：語序錯誤 (O:WRONG_ORDER)
  it('應該抓出文法全對但順序錯 (O:WRONG_ORDER / Misordering)', () => {
    const studentTokens = ['is', 'who', '[looking up words]']; // 順序反了
    const signals = diagnoseGrammar(studentTokens, mockQuestion.correctAnswer!, mockQuestion);
    
    // 因為沒有觸發其他文法錯誤，應該會被泛用語序規則抓到
    expect(signals.some(s => s.code === 'O:WRONG_ORDER')).toBe(true);
    expect(signals[0].sst).toBe('Misordering');
  });

  // 測試 6：Reduce 模式簡化不完全 (U:RELATIVE)
  it('應該抓出 Reduce 模式下未刪除關代 (U:RELATIVE)', () => {
    const reduceQuestion: QuestionData = {
      ...mockQuestion,
      ui_mode: 'REDUCE',
      correctAnswer: ['[looking up words]'],
    };
    const studentTokens = ['who', 'is', '[looking up words]']; // 沒刪乾淨
    const signals = diagnoseGrammar(studentTokens, reduceQuestion.correctAnswer!, reduceQuestion);
    
    expect(signals.some(s => s.code === 'U:RELATIVE')).toBe(true);
    expect(signals[0].sst).toBe('Addition');
  });

  // 測試 7：Reduce 模式留下多餘的 be 動詞
  it('應該抓出 Reduce 模式下留下多餘的 be 動詞 (U:VERB)', () => {
    const reduceQuestion: QuestionData = {
      ...mockQuestion,
      ui_mode: 'REDUCE',
      correctAnswer: ['[under the chair]'],
    };
    const studentTokens = ['is', '[under the chair]']; // 關代刪了，但 is 沒刪
    const signals = diagnoseGrammar(studentTokens, reduceQuestion.correctAnswer!, reduceQuestion);
    
    expect(signals.some(s => s.code === 'U:VERB')).toBe(true);
    expect(signals[0].sst).toBe('Addition');
  });

  it('不會把正解需要的 be 動詞誤判為 REDUCE 多餘詞', () => {
    const reduceQuestion: QuestionData = {
      ...mockQuestion,
      ui_mode: 'REDUCE',
      correctAnswer: ['The writer', 'with', '[a dictionary]', 'is', 'Mr. Lee.'],
    };
    const studentTokens = ['The writer', '[a dictionary]', 'with', 'is', 'Mr. Lee.'];
    const signals = diagnoseGrammar(studentTokens, reduceQuestion.correctAnswer!, reduceQuestion);

    expect(signals.some(signal => signal.code === 'U:VERB')).toBe(false);
    expect(signals.some(signal => signal.code === 'O:WRONG_ORDER')).toBe(true);
  });

  // 測試 8：MORPH 模式 - 時態錯誤 (R:VERB:TENSE)
  it('應該抓出 MORPH 模式下時態未變化的錯誤 (R:VERB:TENSE)', () => {
    const morphQuestion: QuestionData = {
      ...mockQuestion,
      ui_mode: 'MORPH',
      // 將 correctAnswer 改為長度 3，與下方的 studentTokens 對齊
      correctAnswer: ['He', 'went', 'to school'], 
      chunks: [
        { id: '1', text: 'He', draggable: true },
        { id: '2', text: 'go', draggable: true, can_morph: true, morph_options: ['go', 'went', 'gone'] },
        { id: '3', text: 'to school', draggable: true }
      ]
    };
    // 學生沒變形，直接排了 He go to school
    const studentTokens = ['He', 'go', 'to school']; 
    const signals = diagnoseGrammar(studentTokens, morphQuestion.correctAnswer!, morphQuestion);
    
    expect(signals.some(s => s.code === 'R:VERB:TENSE')).toBe(true);
    expect(signals[0].sst).toBe('Misformation');
    expect(signals[0].index).toBe(1); // 錯誤應該標記在 go 上
  });

  it('使用 LCS 對齊找出遺漏的助動詞', () => {
    const signals = diagnoseGrammar(
      ['who', '[looking up words]'],
      mockQuestion.correctAnswer!,
      mockQuestion
    );

    expect(signals[0].code).toBe('M:AUX');
    expect(signals[0].sst).toBe('Omission');
  });

  it('找出全空的 REDUCE 答案遺漏了必要介系詞', () => {
    const reduceQuestion: QuestionData = {
      ...mockQuestion,
      ui_mode: 'REDUCE',
      correctAnswer: ['in', 'the', 'room'],
    };
    const signals = diagnoseGrammar([], reduceQuestion.correctAnswer!, reduceQuestion);

    expect(signals[0].code).toBe('M:PREP');
    expect(signals[0].sst).toBe('Omission');
  });

  it('辨識字塊中的多餘代名詞', () => {
    const signals = diagnoseGrammar(
      ['who', 'he', 'is', '[looking up words]'],
      mockQuestion.correctAnswer!,
      mockQuestion
    );

    expect(signals[0].code).toBe('U:PRON');
    expect(signals[0].sst).toBe('Addition');
  });

  it('辨識常見主詞動詞一致錯誤 He go', () => {
    const signals = diagnoseGrammar(
      ['He', 'go'],
      ['He', 'goes'],
      { ...mockQuestion, ui_mode: 'BUILD' }
    );

    expect(signals[0].code).toBe('R:VERB:SVA');
    expect(signals[0].sst).toBe('Misformation');
  });

  it('辨識 a/an 冠詞選用錯誤', () => {
    const signals = diagnoseGrammar(
      ['a', 'apple'],
      ['an', 'apple'],
      { ...mockQuestion, ui_mode: 'BUILD' }
    );

    expect(signals[0].code).toBe('R:DET');
    expect(signals[0].sst).toBe('Misformation');
  });

  it('依概念註冊規則辨識情態動詞後的非原形動詞', () => {
    const signals = diagnoseGrammar(
      ['They', 'could', 'goes'],
      ['They', 'could', 'go'],
      { ...mockQuestion, concept: 'MODAL_VERB' }
    );

    expect(signals[0].code).toBe('R:VERB:FORM');
    expect(signals[0].index).toBe(2);
  });

  it('依概念註冊規則辨識問句倒裝錯誤', () => {
    const signals = diagnoseGrammar(
      ['Where', 'you', 'are'],
      ['Where', 'are', 'you'],
      { ...mockQuestion, concept: 'QUESTION_FORM' }
    );

    expect(signals[0].code).toBe('O:INVERSION');
  });

  it('依概念註冊規則辨識遺漏的子句連接詞', () => {
    const signals = diagnoseGrammar(
      ['I', 'stayed', 'home'],
      ['I', 'stayed', 'home', 'because', 'it', 'rained'],
      { ...mockQuestion, concept: 'CLAUSES_CONNECTORS' }
    );

    expect(signals[0].code).toBe('M:CONJ');
  });

});