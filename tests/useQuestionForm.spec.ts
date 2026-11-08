import { describe, it, expect, vi } from 'vitest';
import { useQuestionForm } from '../src/composables/useQuestionForm';

describe('useQuestionForm', () => {
  it('resetForm 應該要把表單清空', () => {
    const emit = vi.fn();
    const { form, resetForm } = useQuestionForm(emit, { currentQuestions: [] });
    
    // 隨便填一些值
    form.value.unitName = 'Test Unit';
    form.value.targetNoun = 'The boy';
    
    resetForm();
    
    expect(form.value.unitName).toBe('');
    expect(form.value.targetNoun).toBe('');
    expect(form.value.editingId).toBeNull();
  });

  it('saveQuestion 驗證失敗時不應該發出事件', () => {
    const emit = vi.fn();
    const { saveQuestion } = useQuestionForm(emit, { currentQuestions: [] });
    
    // 故意不填必填欄位
    saveQuestion();
    
    // 應該不會發出 save-question
    expect(emit).not.toHaveBeenCalledWith('save-question', expect.anything());
  });
});