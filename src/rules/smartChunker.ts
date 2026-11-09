import type { Chunk, GrammarConcept, CustomGrammarRule, UIMode } from './types';
import { autoChunk, getVerbForms } from './chunker';
import { inferGrammarRules } from './autoInfer';

export interface SmartChunkResult {
  chunks: Chunk[];
  suggestedRules: CustomGrammarRule[];
  recommendedUiMode: UIMode;
}

// 定義切詞策略介面
interface ChunkingStrategy {
  name: string;
  execute: (
    sentence: string, 
    concept: GrammarConcept, 
    chunks: Chunk[], 
    correctAnswer: string[]
  ) => { chunks: Chunk[]; rules: CustomGrammarRule[] };
}

/**
 * 策略一：基礎切詞策略 (原有邏輯，優雅降級保底)
 */
const baseStrategy: ChunkingStrategy = {
  name: 'base',
  execute: (sentence, concept, _chunks, _correctAnswer) => {
    return { chunks: autoChunk(sentence, concept), rules: [] };
  }
};

/**
 * 策略二：自動推演增強策略 (結合 autoInfer)
 */
const autoInferStrategy: ChunkingStrategy = {
  name: 'autoInfer',
  execute: (sentence, concept, chunks, correctAnswer) => {
    const inferResult = inferGrammarRules(concept, correctAnswer, chunks);
    
    // 基於推演結果，動態增強 Chunks 的屬性
    const enhancedChunks = chunks.map(chunk => {
      // 尋找是否有針對該 chunk 的 morph 規則 (如 SVA、時態)
      const relevantRule = inferResult.suggestedRules.find(r => 
        r.id.includes('morphology') && r.wrongPattern.includes(chunk.text.toLowerCase())
      );

      if (relevantRule && !chunk.can_morph) {
        // 自動將該字塊升級為可變形狀態
        const verbForms = getVerbForms(chunk.text.replace(/[.,!?;:]+$/, ''));
        if (verbForms) {
          return {
            ...chunk,
            can_morph: true,
            options: [verbForms.infinitive, verbForms.present, verbForms.past, verbForms.participle, verbForms.gerund].filter(Boolean)
          };
        }
      }
      return chunk;
    });

    return { chunks: enhancedChunks, rules: inferResult.suggestedRules };
  }
};

/**
 * 策略三：UI 模式推薦 (可根據 concept 自動推薦)
 */
const getRecommendedMode = (concept: GrammarConcept): UIMode => {
  if (['PAST_TENSE', 'SUBJECT_VERB_AGREEMENT', 'COMPARISON', 'SUBJUNCTIVE', 'CONDITIONALS'].includes(concept)) return 'MORPH';
  if (['ADJECTIVE_CLAUSE', 'INVERSION'].includes(concept)) return 'REDUCE';
  return 'BUILD';
};

/**
 * 🚀 核心協調函數：優雅組合多個策略
 */
export function autoChunkSmart(
  sentence: string,
  concept: GrammarConcept,
  correctAnswerStr: string = ''
): SmartChunkResult {
  const correctAnswer = correctAnswerStr.split(/\s+/).filter(Boolean);
  
  // 1. 執行基礎策略 (確保一定會有 chunks)
  let currentResult = baseStrategy.execute(sentence, concept, [], correctAnswer);
  
  // 2. 執行推演增強策略 (若不需增強，會自動降級回傳原本的 chunks)
  if (correctAnswer.length > 0) {
    const enhancedResult = autoInferStrategy.execute(sentence, concept, currentResult.chunks, correctAnswer);
    currentResult.chunks = enhancedResult.chunks;
    currentResult.rules = enhancedResult.rules;
  }

  // 3. 推薦 UI 模式
  const recommendedUiMode = getRecommendedMode(concept);

  return {
    chunks: currentResult.chunks,
    suggestedRules: currentResult.rules,
    recommendedUiMode
  };
}