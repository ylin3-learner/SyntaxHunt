import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudDatabase } from '../src/services/CloudDatabase';
import type { QuestionData } from '../src/rules/types';

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
  insert: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  in: vi.fn(),
  invoke: vi.fn(),
  getUser: vi.fn(), // 新增 mock
}));

vi.mock('../src/services/supabaseClient', () => ({
  supabase: {
    from: supabaseMocks.from,
    functions: {
      invoke: supabaseMocks.invoke,
    },
    auth: {
      getUser: supabaseMocks.getUser, // 綁定 mock
    },
  },
}));

describe('CloudDatabase LanguageTool warm-up', () => {
  beforeEach(() => {
    supabaseMocks.invoke.mockReset();
    supabaseMocks.invoke.mockResolvedValue({ data: { matches: [] }, error: null });
  });

  it('sends a valid check through the lt-proxy without creating a learning log', async () => {
    await CloudDatabase.warmLanguageTool();

    expect(supabaseMocks.invoke).toHaveBeenCalledTimes(1);
    expect(supabaseMocks.invoke).toHaveBeenCalledWith(
      'lt-proxy',
      expect.objectContaining({
        body: { text: 'The quick brown fox jumps over the lazy dog.' },
        signal: expect.any(AbortSignal),
      })
    );
  });

  it('surfaces warm-up failures without rejecting the caller', async () => {
    const error = new Error('proxy unavailable');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => { });
    supabaseMocks.invoke.mockResolvedValue({ data: null, error });

    await expect(CloudDatabase.warmLanguageTool()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith('LanguageTool 預熱失敗:', error);
    consoleError.mockRestore();
  });
});

describe('CloudDatabase learning logs', () => {
  beforeEach(() => {
    // 補上 getUser 的 Mock，否則 logEvent 會崩潰
    supabaseMocks.getUser.mockResolvedValue({
      data: { user: { id: 'test-teacher-id' } },
      error: null
    });
    supabaseMocks.from.mockReset().mockReturnValue({ insert: supabaseMocks.insert });
    supabaseMocks.insert.mockReset();
  });

  it('logs Supabase error details when a learning log insert fails', async () => {
    const error = {
      code: 'PGRST204',
      message: "Could not find the 'sst' column of 'learning_logs' in the schema cache",
      details: null,
      hint: null,
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => { });
    supabaseMocks.insert.mockResolvedValue({ error });

    await CloudDatabase.logEvent({
      student_name: '匿名學生',
      question_id: 'q-test',
      error_code: 'M:VERB',
      sst: 'Omission',
    });

    expect(consoleError).toHaveBeenCalledWith('寫入紀錄失敗:', error);
    consoleError.mockRestore();
  });
});

describe('CloudDatabase question order', () => {
  let cloudRows: Array<{ data: QuestionData; created_at: string }>;
  let cloudIds: string[];

  beforeEach(() => {
    cloudRows = [];
    cloudIds = [];

    // 預設為已登入狀態
    supabaseMocks.getUser.mockResolvedValue({
      data: { user: { id: 'test-teacher-id' } },
      error: null
    });

    supabaseMocks.from.mockReset().mockReturnValue({
      select: supabaseMocks.select,
      upsert: supabaseMocks.upsert,
      delete: supabaseMocks.delete,
    });

    // 支援鏈式呼叫：select(...).eq(...).order(...)
    supabaseMocks.select.mockImplementation((columns: string) => {
      const selection = columns === 'id'
        ? { data: cloudIds.map(id => ({ id })), error: null }
        : { data: cloudRows, error: null };

      const mockChain = {
        eq: vi.fn(() => mockChain),
        order: supabaseMocks.order,
        then: (onFulfilled: any, onRejected: any) => Promise.resolve(selection).then(onFulfilled, onRejected)
      };
      return mockChain;
    });

    supabaseMocks.order.mockImplementation(() => Promise.resolve({ data: cloudRows, error: null }));
    supabaseMocks.upsert.mockResolvedValue({ error: null });

    // 支援 delete().in(...).eq(...)
    const deleteChain = {
      in: vi.fn(() => deleteChain),
      eq: vi.fn().mockResolvedValue({ error: null }),
      then: (onFulfilled: any, onRejected: any) => Promise.resolve({ error: null }).then(onFulfilled, onRejected)
    };
    supabaseMocks.delete.mockReturnValue(deleteChain);
    supabaseMocks.in.mockReturnValue(deleteChain);
  });

  it('restores questions in their persisted sort order', async () => {
    cloudRows = [
      { data: { id: 'later', sortOrder: 1 } as QuestionData, created_at: '2026-01-02' },
      { data: { id: 'first', sortOrder: 0 } as QuestionData, created_at: '2026-01-01' },
    ];

    const questions = await CloudDatabase.fetchQuestions();

    expect(supabaseMocks.select).toHaveBeenCalledWith('data, created_at');
    expect(questions?.map(question => question.id)).toEqual(['first', 'later']);
  });

  it('keeps the existing created-at order for questions without saved positions', async () => {
    cloudRows = [
      { data: { id: 'old-first' } as QuestionData, created_at: '2026-01-01' },
      { data: { id: 'old-later' } as QuestionData, created_at: '2026-01-02' },
    ];

    const questions = await CloudDatabase.fetchQuestions();

    expect(questions?.map(question => question.id)).toEqual(['old-first', 'old-later']);
    expect(questions?.map(question => question.sortOrder)).toEqual([0, 1]);
  });

  it('persists each question position in its data on save', async () => {
    cloudIds = ['first', 'later'];
    const questions = [
      { id: 'later', type: 'standard', targetNoun: 'Later', antecedent: { noun: 'Later', number: 'singular', person: 'person' } },
      { id: 'first', type: 'standard', targetNoun: 'First', antecedent: { noun: 'First', number: 'singular', person: 'person' } },
    ] as QuestionData[];

    await expect(CloudDatabase.saveQuestions(questions)).resolves.toBe(true);

    // 預期參數新增了 teacher_id
    expect(supabaseMocks.upsert).toHaveBeenCalledWith([
      { id: 'later', data: { ...questions[0], sortOrder: 0 }, teacher_id: 'test-teacher-id' },
      { id: 'first', data: { ...questions[1], sortOrder: 1 }, teacher_id: 'test-teacher-id' },
    ], { onConflict: 'id' });
  });
});