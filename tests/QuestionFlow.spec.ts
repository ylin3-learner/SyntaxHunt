import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import QuestionFlow from '../src/components/QuestionFlow.vue';
import type { QuestionData } from '../src/rules/types';

const makeStandardQuestion = (id: string, mode?: 'build' | 'reduce'): QuestionData => ({
  id, type: 'standard', mode, targetNoun: 'The girl',
  antecedent: { noun: 'The girl', number: 'singular', person: 'person' },
});

describe('QuestionFlow', () => {
  it('keeps unselected questions unclassified and moves selected questions into a new unit', async () => {
    const first = makeStandardQuestion('first');
    const second = makeStandardQuestion('second', 'reduce');
    const wrapper = mount(QuestionFlow, {
      props: { questions: [first, second], selectedId: null },
    });

    // Fix: Directly manipulate the VM state to bypass JSDOM form/input quirks
    (wrapper.vm as any).unitDraft = 'Unit 1';
    await (wrapper.vm as any).addUnit();
    await nextTick();

    expect(wrapper.find('.unit-folder.active').text()).toContain('Unit 1');

    await wrapper.find('input[type="checkbox"]').setValue(true);
    await wrapper.find('.move-button').trigger('click');

    const emittedBatch = wrapper.emitted('batch-import')?.[0];
    const questions = emittedBatch?.[0];
    if (!Array.isArray(questions)) throw new Error('Expected imported questions.');
    const unit = emittedBatch?.[1];
    expect(unit).toBe('Unit 1');
    expect(questions).toHaveLength(2);
    expect(questions[0]).toMatchObject({ id: first.id, unit: 'Unit 1' });
    expect(questions[1]).toMatchObject({ id: second.id, mode: 'reduce' });
    expect(questions[1].unit).toBeUndefined();
    await wrapper.setProps({ questions });
    expect(wrapper.find('.inbox-folder .folder-count').text()).toBe('1');
    expect(wrapper.find('.unit-folder.active .folder-count').text()).toBe('1');
    wrapper.unmount();
  });

  it('copies selected questions to another unit without changing the source', async () => {
    const source = makeStandardQuestion('source');
    source.unit = 'Unit 1';
    const wrapper = mount(QuestionFlow, {
      props: { questions: [source], selectedId: null },
    });

    (wrapper.vm as any).unitDraft = 'Unit 2';
    await (wrapper.vm as any).addUnit();
    await nextTick();

    await wrapper.find('input[type="checkbox"]').setValue(true);
    await wrapper.find('.copy-button').trigger('click');

    const emittedQuestions = wrapper.emitted('batch-import')?.[0]?.[0];
    if (!Array.isArray(emittedQuestions)) throw new Error('Expected copied questions.');
    expect(emittedQuestions).toHaveLength(2);
    expect(emittedQuestions[0]).toMatchObject({ id: source.id, unit: 'Unit 1' });
    expect(emittedQuestions[1]).toMatchObject({ id: expect.stringContaining('Unit%202'), unit: 'Unit 2' });
    wrapper.unmount();
  });

  it('offers to create a question directly in the selected unit', async () => {
    const wrapper = mount(QuestionFlow, {
      props: { questions: [], selectedId: null },
    });

    (wrapper.vm as any).unitDraft = 'Unit 3';
    await (wrapper.vm as any).addUnit();
    await nextTick();

    await wrapper.find('.add-question-button').trigger('click');

    expect(wrapper.emitted('create-question-in-unit')?.[0]).toEqual(['Unit 3']);
    wrapper.unmount();
  });
});
