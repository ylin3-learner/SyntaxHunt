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
    lookupDiagnosis: vi.fn(async () => null),
    createPendingDiagnosisLog: vi.fn(async () => 1),
    diagnoseWithAI: vi.fn(),
  },
}));

import { CloudDatabase } from '../src/services/CloudDatabase';

describe('GrammarCanvas', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
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

  it('lets an unknown wrong answer proceed while AI diagnosis runs in the background', async () => {
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

    expect(wrapper.emitted('success')).toBeTruthy();
    await vi.waitFor(() => {
      expect(CloudDatabase.createPendingDiagnosisLog).toHaveBeenCalledWith(question.id);
      expect(CloudDatabase.diagnoseWithAI).toHaveBeenCalledWith(
        ['I', 'eat', 'pie'],
        question.correctAnswer,
        question,
        1
      );
    });
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
