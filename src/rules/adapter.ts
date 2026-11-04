import {
  getQuestionAnswer,
  getQuestionChunks,
  type GrammarQuestionData,
  type QuestionData,
} from './types';

type LegacyFeature = 'relative' | 'preposition';

export function formatAnswerForDisplay(tokens: string[]): string {
  return tokens
    .map(token => token.replace(/[\[\]]/g, '').trim())
    .filter(Boolean)
    .join(' ');
}

export function mapOffsetToChunkIndex(
  text: string,
  offset: number,
  length: number,
  chunks?: string[]
): number {
  if (!Number.isFinite(offset) || !Number.isFinite(length) || offset < 0 || length < 0) return -1;

  const spans: Array<{ start: number; end: number }> = [];
  if (chunks) {
    let cursor = 0;
    chunks.forEach((chunk, index) => {
      const visibleText = chunk.replace(/[\[\]]/g, '');
      const start = cursor;
      const end = start + visibleText.length;
      spans.push({ start, end });
      cursor = end + (index < chunks.length - 1 ? 1 : 0);
    });
  } else {
    const words = /\S+/g;
    let match: RegExpExecArray | null;
    while ((match = words.exec(text)) !== null) {
      spans.push({ start: match.index, end: match.index + match[0].length });
    }
  }

  const endOffset = offset + length;
  return spans.findIndex(({ start, end }) =>
    length === 0 ? offset >= start && offset <= end : offset < end && endOffset > start
  );
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
    chunks: chunks.map(normalizeMorphChunk),
    correctAnswer: [...correctAnswer],
  };
}
