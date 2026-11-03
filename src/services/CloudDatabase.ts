import { supabase } from './supabaseClient';
import type { DiagnosticCode, DiagnosticSignal, QuestionData, SSTCategory } from '../rules/types';

// 學習軌跡型別
export interface LearningLog {
  id?: number;
  student_name: string;
  question_id: string;
  error_code: string;
  sst?: DiagnosticSignal['sst'];
  status?: 'PENDING' | 'SUCCESS' | 'FAILED' | null;
  diagnosis?: DiagnosticSignal | null;
  created_at?: string;
}

export interface GrammarAssistantChunk {
  text: string;
  can_morph?: boolean;
  morph_options?: string[];
  draggable?: boolean;
}

export interface GrammarDiagnosisCacheEntry {
  answer: string;
  diagnosis: Omit<DiagnosticSignal, 'index'>;
}

type GrammarAssistantAction = 'decompose' | 'prepare_question' | 'diagnose';

const normalizeAnswer = (answer: string[]) =>
  answer.join(' ').replace(/[\[\]]/g, '').trim().toLowerCase().replace(/[.,!?;:]+/g, '').replace(/\s+/g, ' ');

const validDiagnosticCodes: ReadonlySet<string> = new Set<DiagnosticCode>([
  'DUPLICATE_PRONOUN', 'SV_AGREEMENT', 'WRONG_RELATIVE', 'NOT_REDUCED', 'INCOMPLETE_REDUCTION',
  'M:VERB', 'M:AUX', 'M:DET', 'M:PREP', 'M:CONJ', 'R:VERB:TENSE', 'R:VERB:FORM', 'R:VERB:SVA',
  'R:VERB:MOOD', 'R:CONJ', 'U:CONJ', 'R:PREP', 'R:DET',
  'R:NOUN:NUM', 'R:RELATIVE', 'U:PRON', 'U:VERB', 'U:RELATIVE',
  'O:WRONG_ORDER', 'O:INVERSION', 'UNKNOWN_ERROR',
]);
const validSstCategories: ReadonlySet<string> = new Set<SSTCategory>([
  'Omission', 'Addition', 'Misformation', 'Misordering',
]);

const isDiagnosticSignal = (value: unknown): value is DiagnosticSignal => {
  if (!value || typeof value !== 'object') return false;
  const signal = value as Record<string, unknown>;
  return typeof signal.code === 'string'
    && validDiagnosticCodes.has(signal.code)
    && typeof signal.sst === 'string'
    && validSstCategories.has(signal.sst)
    && Number.isInteger(signal.index)
    && typeof signal.message === 'string'
    && (signal.hint === undefined || typeof signal.hint === 'string');
};

async function callGrammarAssistant<T>(
  action: GrammarAssistantAction,
  payload: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('grammar-assistant', {
    body: { action, ...payload },
  });
  if (error) throw error;
  if (!data) throw new Error('文法診斷服務未回傳資料。');
  return data as T;
}

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

  async createPendingDiagnosisLog(questionId: string): Promise<number> {
    const { data, error } = await supabase
      .from('learning_logs')
      .insert([{
        student_name: '匿名學生',
        question_id: questionId,
        error_code: 'UNKNOWN_ERROR',
        sst: 'Misformation',
        status: 'PENDING',
      }])
      .select('id')
      .single();

    if (error) throw error;
    if (!data || !Number.isInteger(data.id)) {
      throw new Error('建立待批改紀錄時未取得有效的紀錄 ID。');
    }
    return data.id;
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

  async lookupDiagnosis(questionId: string, answer: string[]): Promise<DiagnosticSignal | null> {
    const { data, error } = await supabase
      .from('diagnosis_cache')
      .select('diagnosis')
      .eq('question_id', questionId)
      .eq('answer_normalized', normalizeAnswer(answer))
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    if (!isDiagnosticSignal(data.diagnosis)) {
      throw new Error('診斷快取資料格式無效。');
    }
    return data.diagnosis;
  },

  async decomposeGrammarSentence(
    sentence: string,
    uiMode: string,
    correctAnswer: string[]
  ): Promise<GrammarAssistantChunk[]> {
    const result = await callGrammarAssistant<{ chunks: GrammarAssistantChunk[] }>('decompose', {
      sentence,
      ui_mode: uiMode,
      correct_answer: correctAnswer,
    });
    if (!Array.isArray(result.chunks) || result.chunks.length === 0) {
      throw new Error('AI 沒有產生有效的字塊，請檢查句子後重試。');
    }
    return result.chunks;
  },

  async prepareDiagnosisCache(question: QuestionData): Promise<number> {
    const result = await callGrammarAssistant<{ cached: number }>('prepare_question', {
      question: {
        id: question.id,
        ui_mode: question.ui_mode,
        targetNoun: question.targetNoun,
        antecedent: question.antecedent,
        correctAnswer: question.correctAnswer,
        chunks: question.chunks?.map(({ text, can_morph, morph_options }) => ({
          text,
          can_morph,
          morph_options,
        })),
      },
    });
    return result.cached;
  },

  async diagnoseWithAI(
    studentAnswer: string[],
    correctAnswer: string[],
    question: QuestionData,
    pendingLogId?: number
  ): Promise<DiagnosticSignal> {
    const result = await callGrammarAssistant<{ diagnosis: DiagnosticSignal }>('diagnose', {
      student_answer: studentAnswer,
      correct_answer: correctAnswer,
      question,
      log_id: pendingLogId,
    });
    if (!isDiagnosticSignal(result.diagnosis)) {
      throw new Error('AI 回傳的診斷格式不符合規範。');
    }
    return result.diagnosis;
  }
};