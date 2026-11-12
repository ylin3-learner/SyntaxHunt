import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import MagneticBuildCanvas from '../src/components/grammar/MagneticBuildCanvas.vue';
import ShredderReduceCanvas from '../src/components/grammar/ShredderReduceCanvas.vue';
import MorphChoiceCanvas from '../src/components/grammar/MorphChoiceCanvas.vue';
import type { GrammarQuestionData } from '../src/rules/types';

// ❌ 移除 initDiagnosticPipeline 的 Mock，讓 Pipeline 正常註冊 L1~L5
// ✅ 只 Mock 外部依賴
vi.mock('../src/utils/useSound', () => ({
  useSound: () => ({ playError: vi.fn(), playSuccess: vi.fn() }),
}));
vi.mock('../src/utils/useSpeech', () => ({
  useTTS: () => ({ speak: vi.fn() }),
}));
vi.mock('../src/services/CloudDatabase', () => ({
  CloudDatabase: {
    checkLanguageTool: vi.fn(async () => []),
    logEvent: vi.fn(),
  },
}));

import { CloudDatabase } from '../src/services/CloudDatabase';

describe('GrammarCanvas UI Interactions (Sub-components)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.mocked(CloudDatabase.checkLanguageTool).mockResolvedValue([]);
  });

  it('lets students reorder retained REDUCE chunks to form the correct sentence', async () => {
    const question: GrammarQuestionData = {
      id: 'reduce-reorder-test', type: 'grammar', ui_mode: 'REDUCE',
      targetNoun: 'The writer', antecedent: { noun: 'The writer', number: 'singular', person: 'person' },
      correctAnswer: ['The writer', 'with', '[a dictionary]', 'is', 'Mr. Lee.'],
      chunks: [
        { id: 'writer', text: 'The writer', draggable: true },
        { id: 'dictionary', text: '[a dictionary]', draggable: true },
        { id: 'with', text: 'with', draggable: true },
        { id: 'is', text: 'is', draggable: true },
        { id: 'lee', text: 'Mr. Lee.', draggable: true },
        { id: 'which', text: 'which', draggable: true },
      ],
    };

    const wrapper = mount(ShredderReduceCanvas, { props: { question, initialChunks: question.chunks } });
    await nextTick();
    vi.useFakeTimers();

    const buttons = wrapper.findAll('.removable-word');
    expect(buttons.length).toBeGreaterThan(0);

    await buttons[2].trigger('dragstart');
    await buttons[1].trigger('drop');
    await nextTick();

    await wrapper.find('[aria-label="移除「which」"]').trigger('click');
    await nextTick();

    await flushPromises();
    await nextTick();

    expect(wrapper.find('.success-bg').exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(1500);
    expect(wrapper.emitted('success')).toBeTruthy();
    wrapper.unmount();
  });

  it('uses LanguageTool for an incorrect answer that local rules cannot classify', async () => {
    vi.mocked(CloudDatabase.checkLanguageTool).mockResolvedValueOnce([{
      message: 'Use a different fruit.', offset: 7, length: 6,
      replacements: [{ value: 'apple' }],
      rule: { id: 'FRUIT_RULE', category: { name: 'Grammar' } },
    }]);

    const question: GrammarQuestionData = {
      id: 'unknown-error-test', type: 'grammar', ui_mode: 'BUILD',
      targetNoun: 'I', antecedent: { noun: 'I', number: 'singular', person: 'person' },
      correctAnswer: ['I', 'like', 'apple'],
      chunks: [
        { id: 'i', text: 'I', draggable: true },
        { id: 'like', text: 'like', draggable: true },
        { id: 'banana', text: 'banana', draggable: true },
      ],
    };

    const wrapper = mount(MagneticBuildCanvas, { props: { question, initialChunks: question.chunks } });
    await nextTick();

    for (const token of ['I', 'like', 'banana']) {
      const tile = wrapper.findAll('.word-bank .tile').find(t => t.text() === token);
      expect(tile).toBeDefined();
      await tile!.trigger('click');
    }

    await wrapper.find('.check-answer-button').trigger('click');
    await nextTick();

    expect(wrapper.text()).toContain('好像還差一點點');
    expect(CloudDatabase.checkLanguageTool).not.toHaveBeenCalled();

    await wrapper.find('.check-answer-button').trigger('click');

    // 等待 Pipeline 完成，確保 L4 被觸發
    await flushPromises();
    await nextTick();

    expect(CloudDatabase.checkLanguageTool).toHaveBeenCalled();
    expect(wrapper.emitted('success')).toBeUndefined();
    expect(wrapper.text()).toContain('Use a different fruit.');
    wrapper.unmount();
  });

  it('lets students continue to the next question when LanguageTool times out', async () => {
    vi.mocked(CloudDatabase.checkLanguageTool).mockImplementationOnce((text, signal) => {
      return new Promise((_, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('Aborted')));
      });
    });

    const question: GrammarQuestionData = {
      id: 'lt-timeout-test', type: 'grammar', ui_mode: 'BUILD',
      targetNoun: 'I', antecedent: { noun: 'I', number: 'singular', person: 'person' },
      correctAnswer: ['I', 'eat', 'cake'],
      chunks: [
        { id: 'i', text: 'I', draggable: true },
        { id: 'eat', text: 'eat', draggable: true },
        { id: 'pie', text: 'pie', draggable: true },
      ],
    };

    const wrapper = mount(MagneticBuildCanvas, { props: { question, initialChunks: question.chunks } });
    await nextTick();
    vi.useFakeTimers();

    for (const token of ['I', 'eat', 'pie']) {
      const tile = wrapper.findAll('.word-bank .tile').find(t => t.text() === token);
      expect(tile).toBeDefined();
      await tile!.trigger('click');
    }

    await wrapper.find('.check-answer-button').trigger('click');
    await nextTick();
    await wrapper.find('.check-answer-button').trigger('click');

    // 觸發 8 秒超時
    await vi.advanceTimersByTimeAsync(8000);
    await flushPromises();
    await nextTick();

    expect(wrapper.text()).toContain('這裡的單字形式或順序好像不太對喔');
    await wrapper.find('.continue-button').trigger('click');
    expect(wrapper.emitted('continue')).toBeTruthy();
    wrapper.unmount();
  });

  it('switches subjunctive and conditional morphology into an irrealis gravity mode', async () => {
    const question: GrammarQuestionData = {
      id: 'gravity-test', type: 'grammar', ui_mode: 'MORPH', concept: 'SUBJUNCTIVE',
      targetNoun: 'I', antecedent: { noun: 'I', number: 'singular', person: 'person' },
      correctAnswer: ['If', 'I', 'were', 'you', 'I', 'would', 'go.'],
      chunks: [
        { id: 'if', text: 'If', draggable: true },
        { id: 'i', text: 'I', draggable: true },
        { id: 'am', text: 'am', draggable: true, can_morph: true, options: ['am', 'were'] },
        { id: 'you', text: 'you', draggable: true },
        { id: 'i2', text: 'I', draggable: true },
        { id: 'will', text: 'will', draggable: true, can_morph: true, options: ['will', 'would'] },
        { id: 'go', text: 'go.', draggable: true },
      ],
    };

    const wrapper = mount(MorphChoiceCanvas, {
      props: { question, initialChunks: question.chunks, strategy: 'timeline', fixedMorph: true }
    });
    await nextTick();

    const toggleBtn = wrapper.findAll('button').find(b => b.text().includes('切換假設模式'));
    expect(toggleBtn).toBeDefined();

    await toggleBtn!.trigger('click');
    await nextTick();

    expect(wrapper.find('.gravity-irreal').exists()).toBe(true);
    expect(wrapper.find('.fixed-morph-sentence').text()).toContain('were');
    expect(wrapper.find('.fixed-morph-sentence').text()).toContain('would');
    wrapper.unmount();
  });
});