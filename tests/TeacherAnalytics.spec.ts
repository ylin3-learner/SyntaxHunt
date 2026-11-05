import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import TeacherAnalytics from '../src/components/TeacherAnalytics.vue';

const realtime = vi.hoisted(() => ({
  callback: undefined as unknown,
  statusCallback: undefined as unknown,
}));
const localLog = {
  id: 7,
  student_name: '匿名學生',
  question_id: 'q-local',
  error_code: 'R:VERB:FORM',
  sst: 'Misformation' as const,
  source: 'local' as const,
};
const languageToolLog = {
  id: 8,
  student_name: '匿名學生',
  question_id: 'q-language-tool',
  error_code: 'HE_VERB_AGR',
  source: 'languagetool' as const,
  category: 'Grammar',
  rule_id: 'HE_VERB_AGR',
};
const chunkDistractorLogs = [
  {
    id: 9,
    student_name: '匿名學生',
    question_id: 'q-chunk',
    error_code: 'CHUNK_DISTRACTOR',
    source: 'local' as const,
    category: 'chunk_distractor',
    rule_id: 'look after',
  },
  {
    id: 10,
    student_name: '匿名學生',
    question_id: 'q-chunk',
    error_code: 'CHUNK_DISTRACTOR',
    source: 'local' as const,
    category: 'chunk_distractor',
    rule_id: 'look after',
  },
];

vi.mock('../src/services/CloudDatabase', () => ({
  CloudDatabase: {
    fetchLogs: vi.fn(async () => [localLog, languageToolLog, ...chunkDistractorLogs]),
    clearAllLogs: vi.fn(async () => true),
  },
}));

vi.mock('../src/services/supabaseClient', () => ({
  supabase: {
    channel: vi.fn(() => {
      const channel = {
        on: vi.fn((_event: string, _filter: unknown, callback: unknown) => {
          realtime.callback = callback;
          return channel;
        }),
        subscribe: vi.fn((callback: unknown) => {
          realtime.statusCallback = callback;
          return channel;
        }),
      };
      return channel;
    }),
    removeChannel: vi.fn(async () => 'ok'),
  },
}));

describe('TeacherAnalytics realtime diagnosis updates', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('separates local SST data from LanguageTool categories and rule IDs', async () => {
    const wrapper = mount(TeacherAnalytics, { props: { questionBank: [] } });
    await flushPromises();

    expect(wrapper.text()).toContain('動詞形式錯誤');
    expect(wrapper.text()).toContain('HE_VERB_AGR');
    expect(wrapper.text()).toContain('Grammar');
    expect(wrapper.text()).toContain('片語題錯誤選項');
    expect(wrapper.text()).toContain('look after');
    expect(wrapper.text()).toContain('2 次');
    expect(wrapper.text()).toContain('1 次（100%）');

    const receive = realtime.callback as (payload: {
      eventType: string;
      new: Record<string, unknown>;
      old: Record<string, unknown>;
    }) => void;
    receive({
      eventType: 'UPDATE',
      new: { ...languageToolLog, category: 'Style', rule_id: 'STYLE_WORDINESS' },
      old: languageToolLog,
    });
    await flushPromises();

    expect(wrapper.text()).toContain('STYLE_WORDINESS');
    expect(wrapper.text()).toContain('Style');
    expect(wrapper.text()).not.toContain('HE_VERB_AGR');
    expect(wrapper.text()).toContain('1 次（100%）');
    wrapper.unmount();
  });

  it('immediately adds newly inserted incorrect-answer records', async () => {
    const wrapper = mount(TeacherAnalytics, { props: { questionBank: [] } });
    await flushPromises();

    const receive = realtime.callback as (payload: {
      eventType: string;
      new: Record<string, unknown>;
      old: Record<string, unknown>;
    }) => void;
    receive({
      eventType: 'INSERT',
      new: {
        id: 11,
        student_name: '匿名學生',
        question_id: 'q-new',
        error_code: 'M:VERB',
        source: 'local',
      },
      old: {},
    });
    await flushPromises();

    expect(wrapper.text()).toContain('遺漏動詞');
    expect(wrapper.text()).toContain('總計收集 5 筆學習紀錄');
    wrapper.unmount();
  });

  it('reloads records after the Realtime channel reconnects', async () => {
    const wrapper = mount(TeacherAnalytics, { props: { questionBank: [] } });
    await flushPromises();

    const updateStatus = realtime.statusCallback as (status: string) => void;
    updateStatus('SUBSCRIBED');
    updateStatus('CHANNEL_ERROR');
    updateStatus('SUBSCRIBED');
    await flushPromises();

    const { CloudDatabase } = await import('../src/services/CloudDatabase');
    expect(CloudDatabase.fetchLogs).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});
