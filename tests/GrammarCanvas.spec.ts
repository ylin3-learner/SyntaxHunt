import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import GrammarCanvas from '../src/components/GrammarCanvas.vue';
import type { GrammarQuestionData } from '../src/rules/types';

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

describe('GrammarCanvas', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.mocked(CloudDatabase.checkLanguageTool).mockResolvedValue([]);
  });

  it('keeps MORPH sentences fixed while students choose an allowed word form', async () => {
    vi.useFakeTimers();
    const question: GrammarQuestionData = {
      id: 'morph-test', type: 'grammar', ui_mode: 'MORPH',
      targetNoun: 'He', antecedent: { noun: 'He', number: 'singular', person: 'person' },
      correctAnswer: ['He', 'went', 'to school'],
      chunks: [
        { id: 'he', text: 'He', draggable: true },
        { id: 'go', text: 'go', draggable: true, can_morph: true, morph_options: ['go', 'went'] },
        { id: 'school', text: 'to school', draggable: true },
      ],
    };
    const wrapper = mount(GrammarCanvas, { props: { question, initialChunks: question.chunks } });

    await wrapper.find('.fixed-morph-sentence .morph-capsule').trigger('click');
    await wrapper.findAll('.morph-menu button').find(option => option.text() === 'went')!.trigger('click');
    await nextTick(); 

    expect(wrapper.findAll('.fixed-morph-sentence > .fixed-sentence-token, .fixed-morph-token').map(t => t.text())).toEqual(['He', 'went', 'to school']);
    await vi.advanceTimersByTimeAsync(1500);
    expect(wrapper.emitted('success')).toBeTruthy();
    wrapper.unmount();
  });

  it('lets students reorder retained REDUCE chunks to form the correct sentence', async () => {
    vi.useFakeTimers();
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
    const wrapper = mount(GrammarCanvas, { props: { question, initialChunks: question.chunks } });

    const buttons = wrapper.findAll('.removable-word');
    await buttons[2].trigger('dragstart');
    await buttons[1].trigger('drop');
    await nextTick();

    await wrapper.find('[aria-label="移除「which」"]').trigger('click');
    await nextTick(); 

    // 👈 關鍵：等待異步管線跑完
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
    const wrapper = mount(GrammarCanvas, { props: { question, initialChunks: question.chunks } });

    for (const token of ['I', 'like', 'banana']) {
      await wrapper.findAll('.word-bank .tile').find(tile => tile.text() === token)!.trigger('click');
    }

    await vi.waitFor(() => expect(CloudDatabase.checkLanguageTool).toHaveBeenCalled());
    await flushPromises();
    await nextTick(); 
    
    expect(wrapper.emitted('success')).toBeUndefined();
    expect(wrapper.text()).toContain('Use a different fruit.');
    wrapper.unmount();
  });

  it('lets students continue to the next question when LanguageTool times out', async () => {
    vi.useFakeTimers();
    // 👈 模擬超時：當 AbortSignal 被觸發時 reject
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
    const wrapper = mount(GrammarCanvas, { props: { question, initialChunks: question.chunks } });

    for (const token of ['I', 'eat', 'pie']) {
      await wrapper.findAll('.word-bank .tile').find(tile => tile.text() === token)!.trigger('click');
    }

    await vi.advanceTimersByTimeAsync(8000); // 觸發 8 秒超時
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
    const wrapper = mount(GrammarCanvas, { props: { question, initialChunks: question.chunks } });

    await vi.waitFor(() => expect(wrapper.find('[role="switch"]').exists()).toBe(true));
    await wrapper.find('[role="switch"]').trigger('click');
    await nextTick(); 

    expect(wrapper.find('.morph-strategy').classes()).toContain('gravity-irreal');
    expect(wrapper.find('.fixed-morph-sentence').text()).toContain('were');
    expect(wrapper.find('.fixed-morph-sentence').text()).toContain('would');
    wrapper.unmount();
  });
});
