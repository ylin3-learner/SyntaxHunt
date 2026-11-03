import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
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
    lookupDiagnosis: vi.fn(async () => null),
    diagnoseWithAI: vi.fn(),
  },
}));

describe('GrammarCanvas', () => {
  afterEach(() => {
    vi.useRealTimers();
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
});
