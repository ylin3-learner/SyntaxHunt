import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import TeacherAnalytics from '../src/components/TeacherAnalytics.vue';

const realtime = vi.hoisted(() => ({ callback: undefined as unknown }));
const pendingLog = {
  id: 7,
  student_name: '匿名學生',
  question_id: 'q-async',
  error_code: 'UNKNOWN_ERROR',
  sst: 'Misformation' as const,
  status: 'PENDING' as const,
};

vi.mock('../src/services/CloudDatabase', () => ({
  CloudDatabase: {
    fetchLogs: vi.fn(async () => [pendingLog]),
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
        subscribe: vi.fn(() => channel),
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

  it('shows pending AI work and refreshes the error chart when the log completes', async () => {
    const wrapper = mount(TeacherAnalytics, { props: { questionBank: [] } });
    await flushPromises();

    expect(wrapper.text()).toContain('AI 批改中');
    expect(wrapper.text()).not.toContain('1 次（100%）');

    const receive = realtime.callback as (payload: {
      eventType: string;
      new: Record<string, unknown>;
      old: Record<string, unknown>;
    }) => void;
    receive({
      eventType: 'UPDATE',
      new: { ...pendingLog, error_code: 'R:VERB:FORM', status: 'SUCCESS' },
      old: pendingLog,
    });
    await flushPromises();

    expect(wrapper.text()).not.toContain('AI 批改中');
    expect(wrapper.text()).toContain('形式錯誤');
    expect(wrapper.text()).toContain('1 次（100%）');
    wrapper.unmount();
  });
});
