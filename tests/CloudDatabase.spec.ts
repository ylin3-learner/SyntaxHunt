import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudDatabase } from '../src/services/CloudDatabase';
import type { QuestionData } from '../src/rules/types';

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  in: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('../src/services/supabaseClient', () => ({
  supabase: {
    from: supabaseMocks.from,
    functions: {
      invoke: supabaseMocks.invoke,
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
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseMocks.invoke.mockResolvedValue({ data: null, error });

    await expect(CloudDatabase.warmLanguageTool()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith('LanguageTool 預熱失敗:', error);
    consoleError.mockRestore();
  });
});

describe('CloudDatabase question order', () => {
  let cloudRows: Array<{ data: QuestionData; created_at: string }>;
  let cloudIds: string[];

  beforeEach(() => {
    cloudRows = [];
    cloudIds = [];
    supabaseMocks.from.mockReset().mockReturnValue({
      select: supabaseMocks.select,
      upsert: supabaseMocks.upsert,
      delete: supabaseMocks.delete,
    });
    supabaseMocks.select.mockImplementation((columns: string) => {
      const selection = columns === 'id'
        ? { data: cloudIds.map(id => ({ id })), error: null }
        : { data: cloudRows, error: null };
      return Object.assign(Promise.resolve(selection), { order: supabaseMocks.order });
    });
    supabaseMocks.order.mockImplementation(() => Promise.resolve({ data: cloudRows, error: null }));
    supabaseMocks.upsert.mockResolvedValue({ error: null });
    supabaseMocks.delete.mockReturnValue({ in: supabaseMocks.in });
    supabaseMocks.in.mockResolvedValue({ error: null });
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

    expect(supabaseMocks.upsert).toHaveBeenCalledWith([
      { id: 'later', data: { ...questions[0], sortOrder: 0 } },
      { id: 'first', data: { ...questions[1], sortOrder: 1 } },
    ], { onConflict: 'id' });
  });
});
