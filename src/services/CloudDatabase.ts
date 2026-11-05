import { supabase } from './supabaseClient';
import type {
  DiagnosticSignal,
  LanguageToolDiagnosticData,
  QuestionData,
  SSTCategory,
} from '../rules/types';

// 學習軌跡型別
export interface LearningLog {
  id?: number;
  student_name: string;
  question_id: string;
  error_code: string;
  sst?: DiagnosticSignal['sst'];
  source?: DiagnosticSignal['source'];
  category?: string;
  rule_id?: string;
  status?: 'PENDING' | 'SUCCESS' | 'FAILED' | null;
  diagnosis?: DiagnosticSignal | null;
  created_at?: string;
}

export type LanguageToolMatch = LanguageToolDiagnosticData;

export const CloudDatabase = {
  // 從雲端抓取題庫
  async fetchQuestions(): Promise<QuestionData[] | null> {
    try {
      const { data, error } = await supabase
        .from('questions')
        .select('data')
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (!data || data.length === 0) return null;

      return data.map((row: any) => row.data) as QuestionData[];
    } catch (error) {
      console.error('無法連線到雲端資料庫:', error);
      return null;
    }
  },

  // 將題庫存到雲端（包含同步刪除）
  async saveQuestions(questions: QuestionData[]): Promise<boolean> {
    try {
      // 1. 先取得雲端現有的所有題目 ID
      const { data: cloudData, error: fetchError } = await supabase
        .from('questions')
        .select('id');
      
      if (fetchError) throw fetchError;

      const cloudIds = cloudData?.map(d => d.id) || [];
      const localIds = questions.map(q => q.id);

      // 2. 找出「雲端有，但本地已經被刪除」的 ID
      const idsToDelete = cloudIds.filter(id => !localIds.includes(id));

      // 3. 如果有需要刪除的題目，執行批次刪除
      if (idsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('questions')
          .delete()
          .in('id', idsToDelete);
        
        if (deleteError) throw deleteError;
      }

      // 4. 執行 upsert（更新既有的，插入新的）
      if (questions.length > 0) {
        const rows = questions.map(q => ({
          id: q.id,
          data: q
        }));

        const { error: upsertError } = await supabase
          .from('questions')
          .upsert(rows, { onConflict: 'id' });

        if (upsertError) throw upsertError;
      }

      return true;
    } catch (error) {
      console.error('儲存到雲端失敗:', error);
      return false;
    }
  },

  // 寫入學習軌跡
  async logEvent(log: LearningLog): Promise<void> {
    try {
      console.log('🚀 準備寫入軌跡:', log);
      const { error } = await supabase.from('learning_logs').insert([log]);
      if (error) console.error('寫入紀錄失敗:', error);
    } catch (e) {
      console.error('連線錯誤:', e);
    }
  },

  // 讀取所有學習軌跡
  async fetchLogs(): Promise<LearningLog[]> {
    try {
      const { data, error } = await supabase
        .from('learning_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('無法取得紀錄:', e);
      return [];
    }
  },

  // 批次刪除所有學習軌跡
  async clearAllLogs(): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('learning_logs')
        .delete()
        .neq('id', 0);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('清空軌跡失敗:', error);
      return false;
    }
  },

  async checkLanguageTool(text: string, signal: AbortSignal): Promise<LanguageToolMatch[]> {
    const { data, error } = await supabase.functions.invoke<{ matches: LanguageToolMatch[] }>(
      'lt-proxy',
      { body: { text }, signal }
    );
    if (error) throw error;
    if (!data || !Array.isArray(data.matches)) {
      throw new Error('LanguageTool 服務回傳的資料格式無效。');
    }
    return data.matches;
  },

  async warmLanguageTool(): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      await this.checkLanguageTool(
        'The quick brown fox jumps over the lazy dog.',
        controller.signal
      );
      console.info('LanguageTool 預熱完成。');
    } catch (error) {
      console.error('LanguageTool 預熱失敗:', error);
    } finally {
      clearTimeout(timeout);
    }
  }
};