import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import ChunkPreview from '../src/components/ChunkPreview.vue';

vi.mock('../src/utils/useSpeech', () => ({
  useTTS: () => ({ speak: vi.fn() }),
}));

describe('ChunkPreview', () => {
  it('emits the selected distractor for an incorrect answer', async () => {
    const wrapper = mount(ChunkPreview, {
      props: {
        image: '',
        noun: 'the cat',
        chunk: 'looks after',
        zhMeaning: '照顧',
        quizOptions: [
          { text: 'looks after', isCorrect: true },
          { text: 'looks at', isCorrect: false },
        ],
      },
    });

    await wrapper.findAll('button.quiz-btn')[1].trigger('click');

    expect(wrapper.emitted('wrong-answer')).toEqual([['looks at']]);
    expect(wrapper.emitted('success')).toBeUndefined();
    wrapper.unmount();
  });
});
