import {
  getQuestionAnswer,
  getQuestionChunks,
  getQuestionCanvasMode,
  type GrammarQuestionData,
  type QuestionData,
} from './types';
import { getGrammarTopic } from './grammarTopics';
import { mapOffsetToChunkIndex } from '../utils/textUtils';

export { mapOffsetToChunkIndex } from '../utils/textUtils';

type LegacyFeature = 'relative' | 'preposition';

export function formatAnswerForDisplay(tokens: string[]): string {
  return tokens
    .map(token => token.replace(/[\[\]]/g, '').trim())
    .filter(Boolean)
    .join(' ');
}

const normalizeMorphChunk = (chunk: GrammarQuestionData['chunks'][number]) => {
  const providedOptions = chunk.options ?? chunk.morph_options;
  if (!chunk.can_morph && !providedOptions) return chunk;

  const options = [...(providedOptions ?? [])];
  if (!options.includes(chunk.text)) options.unshift(chunk.text);

  const indexMatchesText = Number.isInteger(chunk.current_index)
    && chunk.current_index! >= 0
    && chunk.current_index! < options.length
    && options[chunk.current_index!] === chunk.text;
  const currentIndex = indexMatchesText
    ? chunk.current_index!
    : Math.max(0, options.indexOf(chunk.text));

  return {
    ...chunk,
    options,
    current_index: currentIndex,
  };
};

/**
 * Adapts a question for the grammar canvas without mutating its stored legacy data.
 * The selected legacy feature matters for BUILD questions that can switch between
 * relative-clause and prepositional-phrase activities.
 */
export function convertLegacyQuestion(
  question: QuestionData,
  legacyFeature: LegacyFeature = 'relative'
): GrammarQuestionData {
  const chunks = [...(question.chunks ?? getQuestionChunks(question, legacyFeature))];
  const correctAnswer = question.correctAnswer ?? getQuestionAnswer(question, legacyFeature);
  const uiMode = question.ui_mode ?? (question.mode === 'reduce' ? 'REDUCE' : 'BUILD');
  const legacyMatrix = question.matrix_x?.length === 2 && question.matrix_y?.length === 2
    ? {
      xOptions: [question.matrix_x[0]!, question.matrix_x[1]!] as [string, string],
      yOptions: [question.matrix_y[0]!, question.matrix_y[1]!] as [string, string],
      correctX: question.correct_x === 0 ? 0 as const : 1 as const,
      correctY: question.correct_y === 0 ? 0 as const : 1 as const,
      prompt: question.matrix_prompt ?? '',
      answer: question.matrix_answer ?? '',
      options: question.matrix_options ?? [],
    }
    : undefined;
  const topicCanvasMode = getGrammarTopic(question.grammarTopicId)?.defaultCanvasMode;
  const canvasMode = question.canvas_mode ?? (legacyMatrix
    ? 'MATRIX_GATE'
    : question.pragmatic_target || typeof question.status_gap === 'number'
      ? 'PRAGMATIC_HP'
      : topicCanvasMode ?? getQuestionCanvasMode(question));

  if (uiMode === 'REDUCE') {
    const normalizeWord = (word: string) =>
      word.replace(/[\[\]]/g, '').trim().toLowerCase().replace(/^[.,!?;:]+|[.,!?;:]+$/g, '');
    const availableWords = new Set(
      chunks.flatMap(chunk => chunk.text.split(/\s+/).map(normalizeWord)).filter(Boolean)
    );
    const addedWords = new Set<string>();

    for (const token of correctAnswer) {
      for (const word of token.replace(/[\[\]]/g, '').split(/\s+/).filter(Boolean)) {
        const normalizedWord = normalizeWord(word);
        if (!normalizedWord || availableWords.has(normalizedWord) || addedWords.has(normalizedWord)) continue;

        addedWords.add(normalizedWord);
        chunks.push({
          id: `${question.id}-reduce-chunk-${chunks.length}`,
          text: word,
          draggable: true,
        });
      }
    }
  }

  return {
    ...question,
    type: 'grammar',
    ui_mode: uiMode,
    ...(question.canvas_mode || topicCanvasMode || legacyMatrix || question.pragmatic_target
      || typeof question.status_gap === 'number'
      ? { canvas_mode: canvasMode }
      : {}),
    ...(legacyMatrix && !question.matrix_config ? { matrix_config: legacyMatrix } : {}),
    ...(typeof question.status_gap === 'number' && !question.pragmatic_target
      ? { pragmatic_target: { statusGap: question.status_gap } }
      : {}),
    chunks: chunks.map(normalizeMorphChunk),
    correctAnswer: [...correctAnswer],
  };
}
