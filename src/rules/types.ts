// ==========================================
// 1. 雙軸診斷與錯誤標籤定義 (ERRANT + SST)
// ==========================================

/**
 * 編輯操作類型 (ERRANT 框架)
 * M: Missing (遺漏) / R: Replacement (替換) / U: Unnecessary (多餘) / O: Order (語序)
 */
export type ErrOperation = 'M' | 'R' | 'U' | 'O';

/**
 * 表面策略分類法 (Surface Strategy Taxonomy)
 * 對應學生的認知行為，用於後台圓餅圖統計
 */
export type SSTCategory = 'Omission' | 'Addition' | 'Misformation' | 'Misordering';

export type GrammarConcept =
  | 'SENTENCE_PATTERN'
  | 'SUBJECT_VERB_AGREEMENT'
  | 'QUESTION_FORM'
  | 'TENSE_ASPECT'
  | 'CLAUSES_CONNECTORS'
  | 'NOUN_CLAUSE'
  | 'ADJECTIVE_CLAUSE'
  | 'ADVERB_CLAUSE'
  | 'INVERSION'
  | 'SUBJUNCTIVE'
  | 'CONDITIONALS'
  | 'MODAL_VERB'
  | 'PAST_TENSE';

/** 統一的錯誤代碼定義 (結合 ERRANT 標準與自訂擴充) */
export type DiagnosticCode =
  // --- 原有後位修飾相關 (保留或替換) ---
  | 'DUPLICATE_PRONOUN' | 'SV_AGREEMENT' | 'WRONG_RELATIVE' | 'NOT_REDUCED' | 'INCOMPLETE_REDUCTION'
  // --- 新增通用文法 (採用 ERRANT 格式) ---
  | 'M:VERB' | 'M:AUX' | 'M:DET' | 'M:PREP'
  | 'M:CONJ'
  | 'R:VERB:TENSE' | 'R:VERB:FORM' | 'R:VERB:SVA' | 'R:VERB:MOOD'
  | 'R:PREP' | 'R:DET' | 'R:NOUN:NUM' | 'R:CONJ'
  | 'R:RELATIVE' // 加入這個，解決 TS 報錯
  | 'U:PRON' | 'U:VERB' | 'U:RELATIVE' | 'U:CONJ'
  | 'O:WRONG_ORDER' | 'O:INVERSION'
  | 'UNKNOWN_ERROR';                     // 本地規則無法分類，交由進階診斷處理

export interface LanguageToolDiagnosticData {
  message: string;
  offset: number;
  length: number;
  replacements: Array<{
    value: string;
    context?: { text: string; offset: number; length: number };
  }>;
  rule: {
    id: string;
    description?: string;
    category: { id?: string; name: string };
  };
  context?: { text: string; offset: number; length: number };
}

export interface DiagnosticSignal {
  code: string;
  sst?: SSTCategory;
  index?: number;
  message: string;
  hint?: string;
  source?: 'local' | 'languagetool';
  ruleId?: string;
  category?: string;
  offset?: number;
  length?: number;
  replacements?: Array<{ value: string; context?: { text: string; offset: number; length: number } }>;
  nativeMatch?: LanguageToolDiagnosticData;
}

// ==========================================
// 2. 核心字塊 (Chunk) 結構
// ==========================================

export interface Chunk {
  id: string;           // 唯一識別碼 (前端拖拉與變形依賴此 ID)
  text: string;         // 顯示的文字 (例如："go", "[in a blue uniform]")
  draggable?: boolean;  // 是否允許拖拉 (某些題型可能固定某些字)

  // --- MORPH (字形變形) 專屬屬性 ---
  can_morph?: boolean;  // 是否允許點擊變形 (例如動詞、名詞單複數)
  morph_options?: string[]; // 變形選項池 (例如：['go', 'goes', 'went', 'gone'])
  options?: string[];   // 新版變形選項；保留 morph_options 以相容既有題庫
  current_index?: number; // 初始選項索引；作答中的選取狀態由畫布持有
}

// ==========================================
// 3. 題目資料結構 (Data-Driven UI)
// ==========================================

export interface Antecedent {
  noun: string;
  number: 'singular' | 'plural';
  person: 'person' | 'thing';
}

/** 決定前端要用哪種 UI 模組來渲染這道題 */
export type UIMode =
  | 'BUILD'   // 空間排序與插入 (原組句題)
  | 'REDUCE'  // 減法與替代 (原垃圾桶題)
  | 'MORPH';  // 動態字塊變形 (新增：時態、單複數題)

export interface QuestionData {
  id: string;
  sortOrder?: number;
  unit?: string;
  grammarTopicId?: string;

  /**
   * 題型分類
   * grammar: 7-9 年級通用文法題 (靠 chunks 與 correctAnswer 驅動)
   * standard: 舊版標準題 (保留舊題庫相容性)
   * contrast: 對比拼圖題 (舊版)
   * chunk: 片語預覽題 (舊版)
   */
  type: 'grammar' | 'standard' | 'contrast' | 'chunk';

  /** 核心：決定 UI 渲染邏輯 */
  ui_mode?: UIMode;

  /** 文法概念決定情境式教學畫布與對應診斷規則 */
  concept?: GrammarConcept;

  /** 教學流程控制 */
  enabledStages?: ('input' | 'macro' | 'micro' | 'pronunciation' | 'noticing')[];

  /** 題目目標資訊 (用於關係子句的先行詞判斷) */
  targetNoun: string;
  antecedent: Antecedent;

  /** 通用字塊庫 (取代原本的 initialTiles) */
  chunks?: Chunk[];

  /** 正確答案的字串陣列 (例如：['He', 'went', 'to', 'school']) */
  correctAnswer?: string[];

  /** 舊版標準題的 UI 模式，載入舊題庫時保留相容性 */
  mode?: 'build' | 'reduce';

  /** 克漏字上下文 (若為空則不顯示句子框) */
  contextCloze?: { prefix: string; suffix: string };

  /** 語音、圖片與計時 */
  imageUrl?: string;
  speechRate?: number;
  isTimed?: boolean;
  timeLimit?: number;

  /** 教學輔助與回饋 */
  explanation?: { title: string; desc: string };
  tags?: string[]; // 對應心智圖標籤 (例如：時態、主被動)

  // ==========================================
  // 以下為舊版專屬欄位 (為了相容 9 年級舊題庫，新題目不需要填)
  // ==========================================
  grammarFeature?: {
    relative: { label: string; tiles: string[]; correctAnswer: string[]; distractors?: string[] };
    preposition: { label: string; tiles: string[]; correctAnswer: string[] };
  };
  inputData?: { audioText: string; options: { image: string; text: string; isCorrect: boolean }[] };
  noticingData?: any;
  contrastData?: any;
  previewData?: { targetImage: string; targetNoun: string; chunkText: string; chunkZh: string; quizOptions?: { text: string; isCorrect: boolean }[] };
}

export type GrammarQuestionData = QuestionData & {
  type: 'grammar';
  ui_mode: UIMode;
  chunks: Chunk[];
  correctAnswer: string[];
};

export function getQuestionUiMode(question: QuestionData): UIMode {
  return question.ui_mode ?? (question.mode === 'reduce' ? 'REDUCE' : 'BUILD');
}

export function getQuestionAnswer(
  question: QuestionData,
  legacyFeature: 'relative' | 'preposition' = 'relative'
): string[] {
  if (question.correctAnswer) return question.correctAnswer;
  if (question.mode === 'reduce') {
    return question.grammarFeature?.preposition.correctAnswer ?? [];
  }
  return question.grammarFeature?.[legacyFeature].correctAnswer ?? [];
}

export function getQuestionChunks(
  question: QuestionData,
  legacyFeature: 'relative' | 'preposition' = 'relative'
): Chunk[] {
  if (question.chunks) return question.chunks;

  const legacyTiles = question.mode === 'reduce'
    ? question.grammarFeature?.relative.tiles
    : question.grammarFeature?.[legacyFeature].tiles;

  return (legacyTiles ?? []).map((text, index) => ({
    id: `${question.id}-chunk-${index}`,
    text,
    draggable: true,
  }));
}