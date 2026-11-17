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
  teacher_id?: string;
}

export type LanguageToolMatch = LanguageToolDiagnosticData;

export const CloudDatabase = {
  // 從雲端抓取題庫
  // 修正 1：允許傳入 teacherId (學生端會傳入老師的 ID)
  async fetchQuestions(targetTeacherId?: string): Promise<QuestionData[] | null> {
    try {
      let teacherId = targetTeacherId;

      // 如果沒傳入 targetTeacherId，代表是老師端，檢查登入狀態
      if (!teacherId) {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          console.log('💡 未登入且無指定老師 ID，使用本機題庫。');
          return null;
        }
        teacherId = user.id;
      }

      const { data, error } = await supabase
        .from('questions')
        .select('data, created_at')
        .eq('teacher_id', teacherId) // 使用找到的 teacherId
        .order('created_at', { ascending: true });

      if (error) {
        console.error('🚨 [CloudDatabase] 讀取題庫失敗:', error);
        return null; // 或 []
      }
      if (!data || data.length === 0) return null;

      const questions = data.map((row, index) => {
        const question = row.data as QuestionData;
        return {
          ...question,
          sortOrder: Number.isFinite(question.sortOrder) ? question.sortOrder : index,
        };
      });
      questions.sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0));
      console.log(`☁️ 雲端題庫讀取順序 (Teacher: ${teacherId}):`, questions.map(q => ({ id: q.id, sortOrder: q.sortOrder })));
      return questions;
    } catch (error) {
      console.error('無法連線到雲端資料庫:', error);
      return null;
    }
  },

  // 將單題新增到雲端
  async addQuestion(question: QuestionData): Promise<boolean> {
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.log('💡 未登入教師身分，無法新增題目到雲端。');
      return false;
    }

    const teacherId = user.id;

    try {
      const { error } = await supabase
        .from('questions')
        .insert({
          id: question.id,
          data: { ...question, sortOrder: question.sortOrder ?? 0, teacher_id: teacherId },
        });

      if (error) throw error;
      console.log('☁️ [CloudDatabase] 單題新增成功:', question.id);
      return true;
    } catch (error) {
      console.error('新增單題失敗:', error);
      return false;
    }
  },

  // 更新單題到雲端
  async updateQuestion(question: QuestionData): Promise<boolean> {
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.log('💡 未登入教師身分，無法更新題目到雲端。');
      return false;
    }

    const teacherId = user.id;

    try {
      const { error } = await supabase
        .from('questions')
        .upsert({
          id: question.id,
          data: { ...question, teacher_id: teacherId },
        }, { onConflict: 'id' });

      if (error) throw error;
      console.log('☁️ [CloudDatabase] 單題更新成功:', question.id);
      return true;
    } catch (error) {
      console.error('更新單題失敗:', error);
      return false;
    }
  },

  // 刪除單題（軟刪除：標記 is_deleted=true，永久資料不流失）
  async deleteQuestion(id: string): Promise<boolean> {
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.log('💡 未登入教師身分，無法刪除題目。');
      return false;
    }

    try {
      const { error } = await supabase
        .from('questions')
        .update({ is_deleted: true })
        .eq('id', id);

      if (error) throw error;
      console.log('☁️ [CloudDatabase] 單題軟刪除成功:', id);
      return true;
    } catch (error) {
      console.error('刪除單題失敗:', error);
      return false;
    }
  },

  // 將當前問題派送到教室（只更新 classroom_state，不觸動 questions 表）
  // 這是「派送」與「儲存」徹底解耦的關鍵
  async pushQuestionToClassroom({
    classroomId,
    questionId,
  }: {
    classroomId: string;
    questionId: string;
  }): Promise<boolean> {
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.log('💡 未登入教師身分，無法派送題目到教室。');
      return false;
    }

    try {
      const { error } = await supabase
        .from('classroom_state')
        .upsert({
          room_code: classroomId,
          current_question_id: questionId,
          teacher_id: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'room_code' });

      if (error) {
        // If onConflict fails (no unique constraint on room_code), try updating by teacher_id
        console.log('onConflict failed, trying update by teacher_id:', error.message);
        const { error: updateError } = await supabase
          .from('classroom_state')
          .update({
            current_question_id: questionId,
            updated_at: new Date().toISOString(),
          })
          .eq('teacher_id', user.id);

        if (updateError) throw updateError;
      }
      console.log('☁️ [CloudDatabase] 已派送題目到教室:', { classroomId, questionId });
      return true;
    } catch (error) {
      console.error('派送題目到教室失敗:', error);
      return false;
    }
  },

  // 批次儲存題庫（僅在老師明確點擊「儲存題庫」時呼叫）
  // 相比原 saveQuestions，此版本移除了「本地沒的就刪雲端」的危險邏輯
  async saveQuestionsBatch(questions: QuestionData[]): Promise<boolean> {
    // 防呆 1：如果題庫是空的，絕對不允許寫入雲端！
    if (!questions || questions.length === 0) {
      console.warn('🚨 [Guard] 題庫為空，已攔截雲端覆寫動作！');
      return false;
    }

    // 防呆 2：如果題庫只有 1 題，而且 ID 是 'q1'（系統預設假題），絕對不允許寫入！
    if (questions.length === 1 && questions[0].id === 'q1') {
      console.warn('🚨 [Guard] 偵測到只有預設題庫，已攔截雲端覆寫動作！');
      return false;
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.log('💡 未登入教師身分，已跳過雲端儲存，僅保留本機進度。');
      return false;
    }

    const teacherId = user.id;

    try {
      // 1. 組裝寫入資料，補上 teacher_id（只 upsert 有效題目）
      const rows = questions.map((question, sortOrder) => ({
        id: question.id,
        data: { ...question, sortOrder: sortOrder ?? 0, teacher_id: teacherId },
      }));

      // 2. 批次 upsert (新增與更新)
      // 注意：我們不再嘗試偵測「本地沒有的就刪雲端」，改為只新增/更新
      const { error: upsertError } = await supabase
        .from('questions')
        .upsert(rows, { onConflict: 'id' });

      if (upsertError) throw upsertError;

      console.log('☁️ [CloudDatabase] 批次題庫儲存完成:', rows.length, '題');
      return true;
    } catch (error) {
      console.error('批次儲存到雲端失敗:', error);
      return false;
    }
  },

  // 從雲端抓取「單一題目」（減少 Read Storm：相同 ID 重推時不需拉整個題庫）
  async fetchQuestionById(questionId: string, targetTeacherId?: string): Promise<QuestionData | null> {
    try {
      let teacherId = targetTeacherId;

      // 如果沒傳入 targetTeacherId，代表是老師端，檢查登入狀態
      if (!teacherId) {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return null;
        teacherId = user.id;
      }

      const { data, error } = await supabase
        .from('questions')
        .select('data')
        .eq('teacher_id', teacherId)
        .eq('id', questionId)
        .maybeSingle();

      if (error) {
        console.error('🚨 [CloudDatabase] 讀取單題失敗:', error);
        return null;
      }
      if (!data) return null;

      const question = data.data as QuestionData;
      return {
        ...question,
        sortOrder: Number.isFinite(question.sortOrder) ? question.sortOrder : 0,
      };
    } catch (error) {
      console.error('無法連線到雲端資料庫:', error);
      return null;
    }
  },

  // 將題庫存到雲端（包含同步刪除）—— 保留舊函數名稱以保持相容性
  // 但已移除「本地沒的就刪雲端」的邏輯，改為只 upsert
  async saveQuestions(questions: QuestionData[]): Promise<boolean> {
    // 直接改用新的安全版本
    return this.saveQuestionsBatch(questions);
  },

  // 寫入學習軌跡
  async logEvent(log: LearningLog): Promise<void> {
    try {
      // 1. 優先從 sessionStorage 拿 (學生端)
      let teacherId = sessionStorage.getItem('teacher_id');

      // 2. 如果沒有，嘗試從 Auth 拿 (老師端)
      if (!teacherId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) teacherId = user.id;
      }

      // 3. 如果真的都沒有，就放棄寫入，避免寫入 NULL
      if (!teacherId) {
        console.warn('⚠️ 找不到 teacher_id，取消寫入軌跡。');
        return;
      }

      // 4. 把 teacher_id 補進資料中
      const logWithTeacher = { ...log, teacher_id: teacherId };

      console.log('🚀 準備寫入軌跡:', logWithTeacher);
      const { error } = await supabase.from('learning_logs').insert([logWithTeacher]);

      if (error) {
        console.error('寫入紀錄失敗:', error);
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

  // 讀取軌跡：只抓自己的
  async fetchLogs(): Promise<LearningLog[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return []; // 老師未登入不給看

      const { data, error } = await supabase
        .from('learning_logs')
        .select('*')
        .eq('teacher_id', user.id) // 嚴格過濾
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase
        .from('learning_logs')
        .delete()
        .eq('teacher_id', user.id); // 嚴格過濾

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