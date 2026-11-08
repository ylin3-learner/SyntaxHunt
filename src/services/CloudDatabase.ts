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
  seat_code?: string;
  status?: 'PENDING' | 'SUCCESS' | 'FAILED' | null;
  diagnosis?: DiagnosticSignal | null;
  created_at?: string;
}

export type LanguageToolMatch = LanguageToolDiagnosticData;

export const CloudDatabase = {
  // 從雲端抓取題庫
  async fetchQuestions(): Promise<QuestionData[] | null> {
    // 👈 改用 getUser 檢查真實登入狀態
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.log('💡 未登入教師身分，使用本機題庫。');
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('questions')
        .select('data, created_at')
        .eq('teacher_id', user.id) // 👈 使用 user.id
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (!data || data.length === 0) return null;

      const questions = data.map((row, index) => {
        const question = row.data as QuestionData;
        return {
          ...question,
          sortOrder: Number.isFinite(question.sortOrder) ? question.sortOrder : index,
        };
      });
      questions.sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0));
      console.log('☁️ 雲端題庫讀取順序:', questions.map(q => ({ id: q.id, sortOrder: q.sortOrder })));
      return questions;
    } catch (error) {
      console.error('無法連線到雲端資料庫:', error);
      return null;
    }
  },

  // 將題庫存到雲端（包含同步刪除）
  async saveQuestions(questions: QuestionData[]): Promise<boolean> {
    // 👈 改用 getUser 檢查真實登入狀態
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.log('💡 未登入教師身分（或 Session 已過期），已跳過雲端儲存，僅保留本機進度。');
      return true;
    }

    const teacherId = user.id;

    try {
      // 1. 先取得「該老師」雲端現有的所有題目 ID
      const { data: cloudData, error: fetchError } = await supabase
        .from('questions')
        .select('id')
        .eq('teacher_id', teacherId);

      if (fetchError) throw fetchError;

      const cloudIds = cloudData?.map(d => d.id) || [];
      const localIds = questions.map(q => q.id);

      // 2. 組裝寫入資料，補上 teacher_id
      const rows = questions.map((question, sortOrder) => ({
        id: question.id,
        data: { ...question, sortOrder },
        teacher_id: teacherId,
      }));

      console.log('☁️ 準備儲存題庫順序:', rows.map(row => ({
        id: row.id,
        sortOrder: row.data.sortOrder,
      })));

      // 3. 找出「該老師的雲端有，但本地已經被刪除」的 ID
      const idsToDelete = cloudIds.filter(id => !localIds.includes(id));

      // 4. 執行批次刪除 (只會刪到自己的)
      if (idsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('questions')
          .delete()
          .in('id', idsToDelete)
          .eq('teacher_id', teacherId);

        if (deleteError) throw deleteError;
      }

      // 5. 執行 upsert
      if (questions.length > 0) {
        const { error: upsertError } = await supabase
          .from('questions')
          .upsert(rows, { onConflict: 'id' });

        if (upsertError) throw upsertError;
      }

      console.log('☁️ 題庫順序儲存完成:', rows.map(row => ({
        id: row.id,
        sortOrder: row.data.sortOrder,
      })));
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
      // 如果 learning_logs 也有 RLS，你可能需要根據 schema 決定是否補上 teacher_id
      const { error } = await supabase.from('learning_logs').insert([log]);
      if (error) {
        console.error('寫入紀錄失敗:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        return;
      }
      console.info('[作答紀錄] 寫入成功:', {
        questionId: log.question_id,
        errorCode: log.error_code,
      });
    } catch (e) {
      console.error('連線錯誤:', e);
    }
  },

  // 讀取所有學習軌跡
  async fetchLogs(): Promise<LearningLog[]> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      let query = supabase
        .from('learning_logs')
        .select('*')
        .order('created_at', { ascending: false });

      // 如果有登入，且你的 learning_logs 有 teacher_id 欄位，可以加上過濾
      // if (session) {
      //   query = query.eq('teacher_id', session.user.id);
      // }

      const { data, error } = await query;
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
      const { data: { session } } = await supabase.auth.getSession();

      let query = supabase
        .from('learning_logs')
        .delete()
        .neq('id', 0);

      // 如果有登入，且你的 learning_logs 有 teacher_id 欄位，可以加上過濾
      // if (session) {
      //   query = query.eq('teacher_id', session.user.id);
      // }

      const { error } = await query;
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