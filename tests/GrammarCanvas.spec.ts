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
    vi.restoreAllMocks();
    vi.mocked(CloudDatabase.checkLanguageTool).mockResolvedValue([]);
  });

  it('keeps MORPH sentences fixed while students choose an allowed word form', async () => {
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

    expect(wrapper.findAll('.fixed-morph-sentence > .fixed-sentence-token, .fixed-morph-token')
      .map(token => token.text())).toEqual(['He', 'go', 'to school']);
    expect(wrapper.find('.word-bank').exists()).toBe(false);

    await wrapper.find('.fixed-morph-sentence .can-morph').trigger('click');
    await wrapper.findAll('.morph-menu button').find(option => option.text() === 'went')!.trigger('click');
    expect(wrapper.findAll('.fixed-morph-sentence > .fixed-sentence-token, .fixed-morph-token')
      .map(token => token.text())).toEqual(['He', 'went', 'to school']);

    await vi.advanceTimersByTimeAsync(1500);
    expect(wrapper.emitted('success')).toBeTruthy();
    wrapper.unmount();
  });

  it('shuffles BUILD word cards without mutating the authored answer data', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const question: GrammarQuestionData = {
      id: 'build-shuffle-test',
      type: 'grammar',
      ui_mode: 'BUILD',
      targetNoun: 'The student',
      antecedent: { noun: 'The student', number: 'singular', person: 'person' },
      correctAnswer: ['The', 'student', 'writes'],
      chunks: ['The', 'student', 'writes'].map((text, index) => ({
        id: `build-${index}`, text, draggable: true,
      })),
    };
    const originalChunks = structuredClone(question.chunks);
    const wrapper = mount(GrammarCanvas, {
      props: { question, initialChunks: question.chunks },
    });

    const displayedCards = wrapper.findAll('.word-bank .tile').map(tile => tile.text());
    expect(displayedCards).not.toEqual(question.correctAnswer);
    expect([...displayedCards].sort()).toEqual([...question.correctAnswer].sort());
    expect(question.chunks).toEqual(originalChunks);
    expect(question.correctAnswer).toEqual(['The', 'student', 'writes']);
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

    await wrapper.find('[aria-label="移除「which」"]').trigger('click');
    await wrapper.find('[aria-label="將「with」往左移"]').trigger('click');

    expect(wrapper.findAll('.answer-area .tile span').map(tile => tile.text())).toEqual([
      'The writer', 'with', 'a dictionary', 'is', 'Mr. Lee.',
    ]);
    expect(wrapper.find('.answer-area').classes()).toContain('success-bg');
    await vi.advanceTimersByTimeAsync(1500);
    expect(wrapper.emitted('success')).toBeTruthy();
    wrapper.unmount();
  });

  it('shows only one local diagnosis for each REDUCE deletion', async () => {
    const question: GrammarQuestionData = {
      id: 'reduce-single-diagnosis-test',
      type: 'grammar',
      ui_mode: 'REDUCE',
      targetNoun: 'The writer',
      antecedent: { noun: 'The writer', number: 'singular', person: 'person' },
      correctAnswer: ['with', '[a dictionary]'],
      chunks: [
        { id: 'who', text: 'who', draggable: true },
        { id: 'he', text: 'he', draggable: true },
        { id: 'is', text: 'is', draggable: true },
        { id: 'dictionary', text: '[a dictionary]', draggable: true },
      ],
    };
    const wrapper = mount(GrammarCanvas, {
      props: { question, initialChunks: question.chunks },
    });

    expect(wrapper.text()).toContain('用 ← → 調整詞序');
    await wrapper.find('.answer-area .is-reduce-mode').trigger('click');
    expect(wrapper.findAll('.answer-area .is-reduce-mode')).toHaveLength(4);

    await wrapper.find('[aria-label="移除「a dictionary」"]').trigger('click');

    expect(wrapper.findAll('.alert-messages > div')).toHaveLength(1);
    expect(wrapper.emitted('misconception')).toHaveLength(1);
    expect(wrapper.text()).toContain('已移除的字塊（1）');
    await wrapper.find('[aria-label="還原「a dictionary」"]').trigger('click');
    expect(wrapper.findAll('.answer-area .is-reduce-mode')).toHaveLength(4);
    expect(wrapper.text()).toContain('尚未移除字塊');
    wrapper.unmount();
  });

  it('shows only one LanguageTool result for a REDUCE deletion', async () => {
    vi.mocked(CloudDatabase.checkLanguageTool).mockResolvedValueOnce([
      {
        message: 'First suggestion',
        offset: 0,
        length: 5,
        replacements: [{ value: 'with' }],
        rule: { id: 'FIRST_RULE', category: { name: 'Grammar' } },
      },
      {
        message: 'Second suggestion',
        offset: 0,
        length: 5,
        replacements: [{ value: 'with' }],
        rule: { id: 'SECOND_RULE', category: { name: 'Grammar' } },
      },
    ]);
    const question: GrammarQuestionData = {
      id: 'reduce-single-lt-diagnosis-test',
      type: 'grammar',
      ui_mode: 'REDUCE',
      targetNoun: 'The writer',
      antecedent: { noun: 'The writer', number: 'singular', person: 'person' },
      correctAnswer: ['paintbrush', 'dictionary'],
      chunks: [
        { id: 'wrong', text: 'banana', draggable: true },
        { id: 'dictionary', text: 'dictionary', draggable: true },
      ],
    };
    const wrapper = mount(GrammarCanvas, {
      props: { question, initialChunks: question.chunks },
    });

    await wrapper.find('[aria-label="移除「dictionary」"]').trigger('click');
    await vi.waitFor(() => expect(wrapper.text()).toContain('First suggestion'));

    expect(wrapper.findAll('.alert-messages > div')).toHaveLength(1);
    expect(wrapper.text()).not.toContain('Second suggestion');
    expect(CloudDatabase.logEvent).toHaveBeenCalledTimes(1);
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

    for (const token of ['I', 'eat', 'pie']) {
      await wrapper.findAll('.word-bank .tile').find(tile => tile.text() === token)!.trigger('click');
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

    for (const token of ['I', 'eat', 'room']) {
      await wrapper.findAll('.word-bank .tile').find(tile => tile.text() === token)!.trigger('click');
    }
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

    for (const token of ['I', 'eat', 'pie']) {
      await wrapper.findAll('.word-bank .tile').find(tile => tile.text() === token)!.trigger('click');
    }
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

    for (const token of ['I', 'eat', 'pie']) {
      await wrapper.findAll('.word-bank .tile').find(tile => tile.text() === token)!.trigger('click');
    }
    await vi.advanceTimersByTimeAsync(8000);

    expect(wrapper.text()).toContain('系統連線中，暫無法提供進階文法建議');
    await wrapper.find('.continue-button').trigger('click');
    expect(wrapper.emitted('continue')).toBeTruthy();
    wrapper.unmount();
  });

  it('uses fixed sentence morph choices with a time-conveyor range', async () => {
    vi.useFakeTimers();
    const question: GrammarQuestionData = {
      id: 'timeline-test',
      type: 'grammar',
      ui_mode: 'MORPH',
      concept: 'TENSE_ASPECT',
      targetNoun: 'They',
      antecedent: { noun: 'They', number: 'plural', person: 'person' },
      correctAnswer: ['They', 'will', 'do', 'it'],
      chunks: [
        { id: 'they', text: 'They', draggable: true },
        { id: 'will', text: 'would', draggable: true, can_morph: true, options: ['will', 'would'] },
        { id: 'do', text: 'did', draggable: true, can_morph: true, options: ['do', 'did'] },
        { id: 'it', text: 'it', draggable: true },
      ],
    };
    const wrapper = mount(GrammarCanvas, {
      props: { question, initialChunks: question.chunks },
    });

    await vi.waitFor(() => expect(wrapper.find('.fixed-morph-sentence').exists()).toBe(true));
    expect(wrapper.find('.fixed-morph-sentence').text()).toContain('They');
    expect(wrapper.findAll('.fixed-morph-token')).toHaveLength(2);
    expect(wrapper.find('.word-bank').exists()).toBe(false);
    expect(wrapper.find('.answer-slot').exists()).toBe(false);
    expect(wrapper.findAll('input[type="range"]')).toHaveLength(2);

    await wrapper.find('[aria-label="變形字詞：would"]').trigger('click');
    await wrapper.findAll('.morph-menu button').find(option => option.text() === 'will')!.trigger('click');
    expect(wrapper.find('.fixed-morph-sentence').text()).toContain('will');
    expect(wrapper.emitted('success')).toBeUndefined();

    await wrapper.find('[aria-label="變形字詞：did"]').trigger('click');
    await wrapper.findAll('.morph-menu button').find(option => option.text() === 'do')!.trigger('click');
    await vi.advanceTimersByTimeAsync(1500);
    expect(wrapper.emitted('success')).toBeTruthy();
    wrapper.unmount();
  });

  it('routes a catalog-recommended morphology topic to the fixed-sentence interaction', async () => {
    const question: GrammarQuestionData = {
      id: 'comparison-topic',
      type: 'grammar',
      grammarTopicId: 'comparison',
      ui_mode: 'MORPH',
      concept: 'SENTENCE_PATTERN',
      targetNoun: 'The car',
      antecedent: { noun: 'The car', number: 'singular', person: 'thing' },
      correctAnswer: ['The car', 'is', 'faster'],
      chunks: [
        { id: 'car', text: 'The car', draggable: true },
        { id: 'is', text: 'is', draggable: true },
        { id: 'fast', text: 'fast', draggable: true, can_morph: true, options: ['fast', 'faster', 'fastest'] },
      ],
    };
    const wrapper = mount(GrammarCanvas, {
      props: { question, initialChunks: question.chunks },
    });

    await vi.waitFor(() => expect(wrapper.find('.fixed-morph-sentence').exists()).toBe(true));
    expect(wrapper.find('.word-bank').exists()).toBe(false);
    expect(wrapper.findAll('.fixed-morph-token')).toHaveLength(1);
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

  it('requires both feature axes before unlocking the correct matrix card', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const question: GrammarQuestionData = {
      id: 'matrix-test',
      type: 'grammar',
      ui_mode: 'BUILD',
      targetNoun: 'The ticket',
      antecedent: { noun: 'The ticket', number: 'singular', person: 'thing' },
      correctAnswer: ['The', 'ticket', 'cost', 'me', '100', 'dollars', 'to', 'buy.'],
      matrix_x: ['人', '物 / It'],
      matrix_y: ['時間', '金錢'],
      correct_x: 1,
      correct_y: 1,
      matrix_prompt: 'The ticket ______ me 100 dollars to buy.',
      matrix_answer: 'cost',
      matrix_options: ['spend', 'cost', 'take', 'pay'],
      chunks: ['The', 'ticket', 'cost', 'me', '100', 'dollars', 'to', 'buy.'].map((text, index) => ({
        id: `matrix-${index}`, text, draggable: true,
      })),
    };
    const wrapper = mount(GrammarCanvas, {
      props: { question, initialChunks: question.chunks },
    });

    await vi.waitFor(() => expect(wrapper.find('.matrix-prompt').exists()).toBe(true));
    expect(wrapper.find('.matrix-prompt').text()).toContain('The ticket');
    expect(wrapper.findAll('.matrix-word-bank button').every(button => button.attributes('disabled') !== undefined)).toBe(true);

    await wrapper.findAll('fieldset').at(0)!.findAll('button')[1]!.trigger('click');
    await wrapper.findAll('fieldset').at(1)!.findAll('button')[0]!.trigger('click');
    await wrapper.find('.decode-button').trigger('click');
    expect(wrapper.find('.matrix-hint').text()).toContain('仍維持鎖定');
    expect(wrapper.findAll('.matrix-word-bank button').every(button => button.attributes('disabled') !== undefined)).toBe(true);

    await wrapper.findAll('fieldset').at(1)!.findAll('button')[1]!.trigger('click');
    await wrapper.find('.decode-button').trigger('click');
    const matrixCards = wrapper.findAll('.matrix-word-bank button').map(button => button.text());
    expect(matrixCards).not.toEqual(['spend', 'cost', 'take', 'pay']);
    expect([...matrixCards].sort()).toEqual(['spend', 'cost', 'take', 'pay'].sort());
    const correctCard = wrapper.findAll('.matrix-word-bank button').find(button => button.text() === 'cost')!;
    expect(correctCard.attributes('disabled')).toBeUndefined();
    expect(wrapper.findAll('.matrix-word-bank button').find(button => button.text() === 'spend')!.attributes('disabled')).toBeDefined();
    await correctCard.trigger('click');
    expect(wrapper.find('.matrix-result').text()).toContain(question.correctAnswer.join(' '));
    expect(wrapper.find('.word-bank').exists()).toBe(false);

    await vi.advanceTimersByTimeAsync(900);
    expect(wrapper.emitted('success')).toBeTruthy();
    wrapper.unmount();
  });

  it('scores pragmatic language locally and lets students repair a harsh sentence', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const question: GrammarQuestionData = {
      id: 'pragmatic-test',
      type: 'grammar',
      ui_mode: 'BUILD',
      status_gap: 1,
      targetNoun: 'You',
      antecedent: { noun: 'You', number: 'singular', person: 'person' },
      correctAnswer: ['Could', 'you', 'please', 'check', 'this', 'data?'],
      chunks: ['You', 'must', 'check', 'this', 'data', 'right', 'now.'].map((text, index) => ({
        id: `pragmatic-${index}`, text, draggable: true,
      })),
    };
    const wrapper = mount(GrammarCanvas, {
      props: { question, initialChunks: question.chunks },
    });
    await vi.waitFor(() => expect(wrapper.find('.pragmatic-word-bank').exists()).toBe(true));
    const displayedCards = wrapper.findAll('.pragmatic-word-bank button').map(button => button.text());
    expect(displayedCards).not.toEqual(question.chunks.map(chunk => chunk.text));
    const choose = async (text: string) => {
      const tile = wrapper.findAll('.pragmatic-word-bank button').find(button =>
        button.text().toLowerCase().replace(/[.,!?;:]+$/, '') === text.toLowerCase().replace(/[.,!?;:]+$/, '')
      );
      if (!tile) throw new Error(`Missing word card: ${text}`);
      await tile.trigger('click');
    };

    for (const token of ['You', 'must', 'check', 'this', 'data', 'right', 'now.']) await choose(token);
    await wrapper.find('.submit-button').trigger('click');
    expect(wrapper.find('.meter-track').attributes('aria-valuenow')).toBe('15');
    expect(wrapper.find('.impact').text()).toBe('-85 HP');
    expect(wrapper.emitted('misconception')?.[0]).toEqual(['PRAGMATIC_TONE']);

    await wrapper.find('.pragmatic-actions button:last-child').trigger('click');
    for (const token of question.correctAnswer) await choose(token);
    await wrapper.find('.submit-button').trigger('click');
    expect(wrapper.find('.meter-track').attributes('aria-valuenow')).toBe('35');
    expect(wrapper.find('.impact').text()).toBe('+20 HP');
    await vi.advanceTimersByTimeAsync(900);
    expect(wrapper.emitted('success')).toBeTruthy();
    wrapper.unmount();
  });

  it('switches subjunctive and conditional morphology into an irrealis gravity mode', async () => {
    const question: GrammarQuestionData = {
      id: 'gravity-test',
      type: 'grammar',
      ui_mode: 'MORPH',
      concept: 'SUBJUNCTIVE',
      targetNoun: 'I',
      antecedent: { noun: 'I', number: 'singular', person: 'person' },
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
    const wrapper = mount(GrammarCanvas, {
      props: { question, initialChunks: question.chunks },
    });

    await vi.waitFor(() => expect(wrapper.find('[role="switch"]').exists()).toBe(true));
    const gravitySwitch = wrapper.find('[role="switch"]');
    await gravitySwitch.trigger('click');
    expect(wrapper.find('.morph-strategy').classes()).toContain('gravity-irreal');
    expect(wrapper.find('.fixed-morph-sentence').text()).toContain('were');
    expect(wrapper.find('.fixed-morph-sentence').text()).toContain('would');
    expect(wrapper.text()).toContain('假設模式：失重語氣');
    wrapper.unmount();
  });
});
