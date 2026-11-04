import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import GrammarCanvas from '../src/components/GrammarCanvas.vue';
import type { GrammarQuestionData } from '../src/rules/types';
import { diagnoseGrammar } from '../src/rules/grammarRules';

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
    vi.mocked(CloudDatabase.checkLanguageTool).mockResolvedValue([]);
  });

  it('lets students change a MORPH tile to an allowed answer form', async () => {
    vi.useFakeTimers();
    const question: GrammarQuestionData = {
      id: 'morph-test',
      type: 'grammar',
      ui_mode: 'MORPH',
      targetNoun: 'He',
      antecedent: { noun: 'He', number: 'singular', person: 'person' },
      correctAnswer: ['He', 'went', 'to school'],
      chunks: [
        { id: 'he', text: 'He', draggable: true },
        { id: 'go', text: 'go', draggable: true, can_morph: true, morph_options: ['go', 'went'] },
        { id: 'school', text: 'to school', draggable: true },
      ],
    };
    const wrapper = mount(GrammarCanvas, {
      props: { question, initialChunks: question.chunks },
    });

    await wrapper.findAll('.word-bank .tile')[0].trigger('click');
    await wrapper.findAll('.word-bank .tile')[0].trigger('click');
    await wrapper.findAll('.word-bank .tile')[0].trigger('click');
    expect(wrapper.find('.alert-bubble').text()).toContain('應該用「went」');

    await wrapper.find('.answer-area .can-morph').trigger('click');
    await wrapper.findAll('.morph-menu div').find(option => option.text() === 'went')!.trigger('click');
    expect(wrapper.find('.answer-area').text()).toContain('went');

    await vi.advanceTimersByTimeAsync(1500);
    expect(wrapper.emitted('success')).toBeTruthy();
    wrapper.unmount();
  });

  it('lets students reorder retained REDUCE chunks to form the correct sentence', async () => {
    vi.useFakeTimers();
    const question: GrammarQuestionData = {
      id: 'reduce-reorder-test',
      type: 'grammar',
      ui_mode: 'REDUCE',
      targetNoun: 'The writer',
      antecedent: { noun: 'The writer', number: 'singular', person: 'person' },
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
    const wrapper = mount(GrammarCanvas, {
      props: { question, initialChunks: question.chunks },
    });

    await wrapper.findAll('.answer-area .tile')[5].trigger('click');
    await wrapper.find('[aria-label="將「with」往左移"]').trigger('click');

    expect(wrapper.findAll('.answer-area .tile span').map(tile => tile.text())).toEqual([
      'The writer', 'with', 'a dictionary', 'is', 'Mr. Lee.',
    ]);
    expect(wrapper.find('.answer-area').classes()).toContain('success-bg');
    await vi.advanceTimersByTimeAsync(1500);
    expect(wrapper.emitted('success')).toBeTruthy();
    wrapper.unmount();
  });

  it('uses LanguageTool for an incorrect answer that local rules cannot classify', async () => {
    const question: GrammarQuestionData = {
      id: 'unknown-error-test',
      type: 'grammar',
      ui_mode: 'BUILD',
      targetNoun: 'I',
      antecedent: { noun: 'I', number: 'singular', person: 'person' },
      correctAnswer: ['I', 'eat', 'cake'],
      chunks: [
        { id: 'i', text: 'I', draggable: true },
        { id: 'eat', text: 'eat', draggable: true },
        { id: 'unknown', text: 'pie', draggable: true },
      ],
    };
    const wrapper = mount(GrammarCanvas, {
      props: { question, initialChunks: question.chunks },
    });
    expect(diagnoseGrammar(['I', 'eat', 'pie'], question.correctAnswer, question)
      .map(signal => signal.code)).toContain('UNKNOWN_ERROR');

    for (const _chunk of question.chunks) {
      await wrapper.find('.word-bank .tile').trigger('click');
    }

    await vi.waitFor(() => expect(CloudDatabase.checkLanguageTool).toHaveBeenCalledWith(
      'I eat pie',
      expect.any(AbortSignal)
    ));
    expect(wrapper.emitted('success')).toBeUndefined();
    expect(wrapper.text()).toContain('進階文法檢查目前沒有其他建議');
    expect(wrapper.find('.continue-button').exists()).toBe(true);
    wrapper.unmount();
  });

  it('lets students submit a partial answer to detect an omitted preposition', async () => {
    const question: GrammarQuestionData = {
      id: 'missing-word-test',
      type: 'grammar',
      ui_mode: 'BUILD',
      targetNoun: 'I',
      antecedent: { noun: 'I', number: 'singular', person: 'person' },
      correctAnswer: ['I', 'eat', 'in', 'room'],
      chunks: [
        { id: 'i', text: 'I', draggable: true },
        { id: 'eat', text: 'eat', draggable: true },
        { id: 'room', text: 'room', draggable: true },
      ],
    };
    const wrapper = mount(GrammarCanvas, {
      props: { question, initialChunks: question.chunks },
    });

    await wrapper.findAll('.word-bank .tile')[0].trigger('click');
    await wrapper.findAll('.word-bank .tile')[0].trigger('click');
    await wrapper.findAll('.word-bank .tile')[0].trigger('click');
    await wrapper.find('.check-answer-button').trigger('click');

    expect(wrapper.text()).toContain('少了「in」');
    expect(CloudDatabase.checkLanguageTool).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('maps LanguageTool offsets to the matching tile and displays its native suggestion', async () => {
    vi.mocked(CloudDatabase.checkLanguageTool).mockResolvedValueOnce([{
      message: 'Use the past tense.',
      offset: 6,
      length: 3,
      replacements: [{ value: 'went' }],
      rule: { id: 'HE_VERB_AGR', category: { name: 'Grammar' } },
    }]);
    const question: GrammarQuestionData = {
      id: 'lt-offset-test',
      type: 'grammar',
      ui_mode: 'BUILD',
      targetNoun: 'I',
      antecedent: { noun: 'I', number: 'singular', person: 'person' },
      correctAnswer: ['I', 'eat', 'cake'],
      chunks: [
        { id: 'i', text: 'I', draggable: true },
        { id: 'eat', text: 'eat', draggable: true },
        { id: 'pie', text: 'pie', draggable: true },
      ],
    };
    const wrapper = mount(GrammarCanvas, {
      props: { question, initialChunks: question.chunks },
    });

    await wrapper.findAll('.word-bank .tile')[0].trigger('click');
    await wrapper.findAll('.word-bank .tile')[0].trigger('click');
    await wrapper.findAll('.word-bank .tile')[0].trigger('click');
    await vi.waitFor(() => expect(wrapper.text()).toContain('Use the past tense.'));

    expect(wrapper.find('.answer-area .tile-error').text()).toBe('pie');
    expect(wrapper.text()).toContain('HE_VERB_AGR');
    expect(wrapper.text()).toContain('went');
    expect(CloudDatabase.logEvent).toHaveBeenCalledWith(expect.objectContaining({
      source: 'languagetool',
      category: 'Grammar',
      rule_id: 'HE_VERB_AGR',
    }));
    wrapper.unmount();
  });

  it('lets students continue to the next question when LanguageTool times out', async () => {
    vi.useFakeTimers();
    vi.mocked(CloudDatabase.checkLanguageTool).mockImplementationOnce(() => new Promise(() => {}));
    const question: GrammarQuestionData = {
      id: 'lt-timeout-test',
      type: 'grammar',
      ui_mode: 'BUILD',
      targetNoun: 'I',
      antecedent: { noun: 'I', number: 'singular', person: 'person' },
      correctAnswer: ['I', 'eat', 'cake'],
      chunks: [
        { id: 'i', text: 'I', draggable: true },
        { id: 'eat', text: 'eat', draggable: true },
        { id: 'pie', text: 'pie', draggable: true },
      ],
    };
    const wrapper = mount(GrammarCanvas, {
      props: { question, initialChunks: question.chunks },
    });

    for (const _chunk of question.chunks) {
      await wrapper.find('.word-bank .tile').trigger('click');
    }
    await vi.advanceTimersByTimeAsync(3000);

    expect(wrapper.text()).toContain('系統連線中，暫無法提供進階文法建議');
    await wrapper.find('.continue-button').trigger('click');
    expect(wrapper.emitted('continue')).toBeTruthy();
    wrapper.unmount();
  });

  it('routes tense concepts to the timeline morphology canvas', async () => {
    const question: GrammarQuestionData = {
      id: 'timeline-test',
      type: 'grammar',
      ui_mode: 'MORPH',
      concept: 'TENSE_ASPECT',
      targetNoun: 'They',
      antecedent: { noun: 'They', number: 'plural', person: 'person' },
      correctAnswer: ['They', 'went'],
      chunks: [
        { id: 'they', text: 'They', draggable: true },
        { id: 'go', text: 'go', draggable: true, can_morph: true, options: ['go', 'goes', 'went'] },
      ],
    };
    const wrapper = mount(GrammarCanvas, {
      props: { question, initialChunks: question.chunks },
    });

    await vi.waitFor(() => expect(wrapper.text()).toContain('時態時間軸'));
    await wrapper.find('input[type="range"]').setValue(0);
    expect(wrapper.find('.selected-form').text()).toContain('went');
    wrapper.unmount();
  });

  it('routes modal concepts to the modal strength gauge', async () => {
    const question: GrammarQuestionData = {
      id: 'modal-test',
      type: 'grammar',
      ui_mode: 'MORPH',
      concept: 'MODAL_VERB',
      targetNoun: 'You',
      antecedent: { noun: 'You', number: 'plural', person: 'person' },
      correctAnswer: ['You', 'must', 'go'],
      chunks: [
        { id: 'you', text: 'You', draggable: true },
        { id: 'must', text: 'must', draggable: true, can_morph: true, options: ['might', 'can', 'must'] },
        { id: 'go', text: 'go', draggable: true },
      ],
    };
    const wrapper = mount(GrammarCanvas, {
      props: { question, initialChunks: question.chunks },
    });

    await vi.waitFor(() => expect(wrapper.text()).toContain('情態語氣壓力計'));
    expect(wrapper.find('input[type="range"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
