import { describe, it, expect } from 'vitest';
import { buildQuestion } from '../src/domain/QuestionBuilder';

describe('QuestionBuilder', () => {
  it('缺少目標名詞時應該回傳錯誤', () => {
    const form = { questionType: 'standard', targetNoun: '', relativeSentence: 'test' } as any;
    const { question, errors } = buildQuestion(form);
    expect(question).toBeUndefined();
    expect(errors).toContain('請填寫目標名詞！');
  });
});