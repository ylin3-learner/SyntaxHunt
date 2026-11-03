import {
  getQuestionAnswer,
  getQuestionChunks,
  type GrammarQuestionData,
  type QuestionData,
} from './types';

type LegacyFeature = 'relative' | 'preposition';

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
  const chunks = question.chunks ?? getQuestionChunks(question, legacyFeature);
  const correctAnswer = question.correctAnswer ?? getQuestionAnswer(question, legacyFeature);

  return {
    ...question,
    type: 'grammar',
    ui_mode: question.ui_mode ?? (question.mode === 'reduce' ? 'REDUCE' : 'BUILD'),
    chunks: chunks.map(normalizeMorphChunk),
    correctAnswer: [...correctAnswer],
  };
}
