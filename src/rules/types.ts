import { getGrammarTopic } from './grammarTopics';

// ==========================================
// 1. 雙軸診斷與錯誤標籤定義 (ERRANT + SST)
// ==========================================

export type ErrOperation = 'M' | 'R' | 'U' | 'O';

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
  | 'PAST_TENSE'
  | 'PREPOSITION'
  | 'ARTICLE'
  | 'VERB'
  | 'GERUND'
  | 'COMPARISON'
  | 'PASSIVE_VOICE';

export type DiagnosticCode =
  | 'DUPLICATE_PRONOUN' | 'SV_AGREEMENT' | 'WRONG_RELATIVE' | 'NOT_REDUCED' | 'INCOMPLETE_REDUCTION'
  | 'M:VERB' | 'M:AUX' | 'M:DET' | 'M:PREP'
  | 'M:CONJ'
  | 'R:VERB:TENSE' | 'R:VERB:FORM' | 'R:VERB:SVA' | 'R:VERB:MOOD'
  | 'R:PREP' | 'R:DET' | 'R:NOUN:NUM' | 'R:CONJ'
  | 'R:RELATIVE'
  | 'U:PRON' | 'U:VERB' | 'U:RELATIVE' | 'U:CONJ'
  | 'O:WRONG_ORDER' | 'O:INVERSION'
  | 'UNKNOWN_ERROR';

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
  source?: 'local' | 'languagetool' | 'custom' | 'structural' | 'fallback';
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
  id: string;
  text: string;
  draggable?: boolean;
  isTargetKeep?: boolean; // 新增：標記為不可移除的目標保留片語
  can_morph?: boolean;
  morph_options?: string[];
  options?: string[];
  current_index?: number;
  hint?: string;
}

export interface Antecedent {
  noun: string;
  number: 'singular' | 'plural';
  person: 'person' | 'thing';
}

/** 統一的教學階段型別 (涵蓋全部階段) */
export type TeachingStage =
  | 'preview'
  | 'input'
  | 'macro'
  | 'micro'
  | 'pronunciation'
  | 'noticing'
  | 'success';

export type UIMode = 'BUILD' | 'REDUCE' | 'MORPH';
export type CanvasMode = UIMode | 'MATRIX_GATE' | 'PRAGMATIC_HP' | 'GRAVITY_SWITCH';

export interface MatrixConfig {
  xOptions: [string, string];
  yOptions: [string, string];
  correctX: 0 | 1;
  correctY: 0 | 1;
  prompt: string;
  answer: string;
  options: string[];
}

export interface PragmaticTarget {
  statusGap: number;
  npcLabel?: string;
}

export interface NoticingData {
  examples?: string[];
  question?: string;
  options?: Array<{ text: string; isCorrect: boolean }>;
  explanation?: string;
}

export interface ContrastData {
  chineseSentence: string;
  chineseHighlight: string;
  modifierImage: string;
  layout?: 'modifier-left' | 'modifier-right';
  nounImage?: string;
}

export interface CustomGrammarRule {
  id: string;
  wrongPattern: string[];
  correctForm?: string;
  message: string;
  concepts?: GrammarConcept[];
  priority?: number;
}

export interface DiagnosticContext {
  studentTokens: string[];
  correctTokens: string[];
  question: QuestionData;
}

export interface DiagnosticLayer {
  id: string;
  priority: number;
  diagnose(ctx: DiagnosticContext): Promise<DiagnosticSignal[]>;
}

export interface QuestionData {
  id: string;
  sortOrder?: number;
  unit?: string;
  grammarTopicId?: string;
  canvas_mode?: CanvasMode;
  matrix_config?: MatrixConfig;
  pragmatic_target?: PragmaticTarget;
  status_gap?: number;
  matrix_x?: string[];
  matrix_y?: string[];
  correct_x?: number;
  correct_y?: number;
  matrix_prompt?: string;
  matrix_answer?: string;
  matrix_options?: string[];

  type: 'grammar' | 'standard' | 'contrast' | 'chunk';

  ui_mode?: UIMode;
  concept?: GrammarConcept;
  enabledStages?: TeachingStage[];

  targetNoun: string;
  antecedent: Antecedent;
  chunks?: Chunk[];
  correctAnswer?: string[];

  mode?: 'build' | 'reduce';
  contextCloze?: { prefix: string; suffix: string };

  imageUrl?: string;
  speechRate?: number;
  isTimed?: boolean;
  timeLimit?: number;

  explanation?: { title: string; desc: string };
  tags?: string[];
  customRules?: CustomGrammarRule[];

  grammarFeature?: {
    relative: { label: string; tiles: string[]; correctAnswer: string[]; distractors?: string[] };
    preposition: { label: string; tiles: string[]; correctAnswer: string[] };
  };
  inputData?: { audioText: string; options: { image: string; text: string; isCorrect: boolean }[] };
  noticingData?: NoticingData;
  contrastData?: ContrastData;
  previewData?: { targetImage: string; targetNoun: string; chunkText: string; chunkZh: string; quizOptions?: { text: string; isCorrect: boolean }[] };
}

export type GrammarQuestionData = QuestionData & {
  type: 'grammar';
  ui_mode: UIMode;
  chunks: Chunk[];
  correctAnswer: string[];
};

export function getQuestionCanvasMode(question: QuestionData): CanvasMode {
  if (question.canvas_mode) return question.canvas_mode;
  if (question.pragmatic_target || typeof question.status_gap === 'number') return 'PRAGMATIC_HP';
  if (question.matrix_config || question.matrix_x || question.matrix_y) return 'MATRIX_GATE';
  if (question.concept === 'SUBJUNCTIVE' || question.concept === 'CONDITIONALS') return 'GRAVITY_SWITCH';
  const topicMode = getGrammarTopic(question.grammarTopicId)?.defaultCanvasMode;
  if (topicMode) return topicMode;
  return getQuestionUiMode(question);
}

export function getQuestionUiMode(question: QuestionData): UIMode {
  return question.ui_mode ?? (question.mode === 'reduce' ? 'REDUCE' : 'BUILD');
}

export function getQuestionAnswer(question: QuestionData, legacyFeature: 'relative' | 'preposition' = 'relative'): string[] {
  if (question.correctAnswer) return question.correctAnswer;
  if (question.mode === 'reduce') return question.grammarFeature?.preposition.correctAnswer ?? [];
  return question.grammarFeature?.[legacyFeature].correctAnswer ?? [];
}

export function getQuestionChunks(question: QuestionData, legacyFeature: 'relative' | 'preposition' = 'relative'): Chunk[] {
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