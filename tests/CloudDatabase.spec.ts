import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudDatabase } from '../src/services/CloudDatabase';

const languageToolInvoke = vi.hoisted(() => vi.fn());

vi.mock('../src/services/supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: languageToolInvoke,
    },
  },
}));

describe('CloudDatabase LanguageTool warm-up', () => {
  beforeEach(() => {
    languageToolInvoke.mockReset();
    languageToolInvoke.mockResolvedValue({ data: { matches: [] }, error: null });
  });

  it('sends a valid check through the lt-proxy without creating a learning log', async () => {
    await CloudDatabase.warmLanguageTool();

    expect(languageToolInvoke).toHaveBeenCalledTimes(1);
    expect(languageToolInvoke).toHaveBeenCalledWith(
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
    languageToolInvoke.mockResolvedValue({ data: null, error });

    await expect(CloudDatabase.warmLanguageTool()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith('LanguageTool 預熱失敗:', error);
    consoleError.mockRestore();
  });
});
