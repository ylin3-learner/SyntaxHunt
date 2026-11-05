import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import QuestionFlow from '../src/components/QuestionFlow.vue';
import type { QuestionData } from '../src/rules/types';

const makeStandardQuestion = (id: string, mode?: 'build' | 'reduce'): QuestionData => ({
  id,
  type: 'standard',
  mode,
  targetNoun: 'The girl',
  antecedent: { noun: 'The girl', number: 'singular', person: 'person' },
});

describe('QuestionFlow', () => {
  it('shows Build or Reduce semantic labels on standard questions', () => {
    const wrapper = mount(QuestionFlow, {
      props: {
        questions: [makeStandardQuestion('build-question'), makeStandardQuestion('reduce-question', 'reduce')],
        selectedId: null,
      },
    });

    expect(wrapper.findAll('.node-mode').map(node => node.text())).toEqual(['Build', 'Reduce']);
    expect(wrapper.findAll('.node-mode.build')).toHaveLength(1);
    expect(wrapper.findAll('.node-mode.reduce')).toHaveLength(1);
    wrapper.unmount();
  });
});
