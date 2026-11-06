import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import EditorFormFields from '../src/components/EditorFormFields.vue';
import type { Chunk } from '../src/rules/types';

const baseProps = {
  canvasMode: 'BUILD' as const,
  grammarSentence: '',
  grammarAnswer: '',
  targetNoun: '',
  antecedentNumber: 'singular' as const,
  grammarChunks: [] as Chunk[],
  statusGap: 1,
  npcLabel: '',
  matrixXInput: '人, 物',
  matrixYInput: '時間, 金錢',
  matrixCorrectX: 1,
  matrixCorrectY: 1,
  matrixPrompt: '',
  matrixAnswer: '',
  matrixOptionsInput: 'spend, cost',
};

describe('EditorFormFields', () => {
  it('only reveals the relevant mode-specific configuration', async () => {
    const wrapper = mount(EditorFormFields, { props: baseProps });

    expect(wrapper.find('#grammar-sentence').exists()).toBe(true);
    expect(wrapper.find('#auto-chunk').exists()).toBe(true);
    await wrapper.setProps({ canvasMode: 'MATRIX_GATE' });
    expect(wrapper.find('#matrix-axis-x').exists()).toBe(true);
    expect(wrapper.find('#auto-chunk').exists()).toBe(false);
    expect(wrapper.find('#status-gap').exists()).toBe(false);

    await wrapper.setProps({ canvasMode: 'PRAGMATIC_HP' });
    expect(wrapper.find('#status-gap').exists()).toBe(true);
    expect(wrapper.find('#matrix-axis-x').exists()).toBe(false);
    wrapper.unmount();
  });

  it('emits selected canvas modes for teacher overrides', async () => {
    const wrapper = mount(EditorFormFields, { props: baseProps });

    await wrapper.find('#grammar-interaction').setValue('GRAVITY_SWITCH');

    expect(wrapper.emitted('update:canvasMode')?.[0]).toEqual(['GRAVITY_SWITCH']);
    expect(wrapper.emitted('mode-change')).toHaveLength(1);
    wrapper.unmount();
  });
});
