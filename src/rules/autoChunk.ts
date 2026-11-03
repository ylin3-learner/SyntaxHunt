import type { Chunk, GrammarConcept, UIMode } from './types';
import { VERB_PAIRS } from './verbTable';

const phraseDictionary: Partial<Record<GrammarConcept, readonly string[]>> = {
  CLAUSES_CONNECTORS: ['even though', 'as soon as', 'in order to', 'so that', 'because of'],
  NOUN_CLAUSE: ['whether or not', 'what kind of', 'how many'],
  ADVERB_CLAUSE: ['even though', 'as soon as', 'so that', 'because of'],
  ADJECTIVE_CLAUSE: ['in front of', 'next to'],
  SENTENCE_PATTERN: ['in front of', 'next to'],
};

const verbMorphology: ReadonlyMap<string, readonly string[]> = (() => {
  const forms = new Map<string, readonly string[]>();
  for (const pair of VERB_PAIRS) {
    const options = [pair.plural, pair.singular];
    forms.set(pair.plural, options);
    forms.set(pair.singular, options);
  }

  for (const options of [
    ['go', 'goes', 'went', 'gone', 'going'],
    ['eat', 'eats', 'ate', 'eaten', 'eating'],
    ['be', 'am', 'is', 'are', 'was', 'were', 'been', 'being'],
    ['do', 'does', 'did', 'done', 'doing'],
    ['see', 'sees', 'saw', 'seen', 'seeing'],
    ['write', 'writes', 'wrote', 'written', 'writing'],
    ['take', 'takes', 'took', 'taken', 'taking'],
    ['make', 'makes', 'made', 'making'],
    ['run', 'runs', 'ran', 'running'],
    ['study', 'studies', 'studied', 'studying'],
  ]) {
    for (const form of options) forms.set(form, options);
  }

  const modalOptions = ['might', 'could', 'may', 'can', 'would', 'should', 'will', 'must'];
  for (const form of modalOptions) forms.set(form, modalOptions);

  return forms;
})();

const morphologyConcepts = new Set<GrammarConcept>([
  'SUBJECT_VERB_AGREEMENT',
  'TENSE_ASPECT',
  'SUBJUNCTIVE',
  'CONDITIONALS',
  'MODAL_VERB',
]);

const defaultModes: Record<GrammarConcept, UIMode> = {
  SENTENCE_PATTERN: 'BUILD',
  SUBJECT_VERB_AGREEMENT: 'MORPH',
  QUESTION_FORM: 'BUILD',
  TENSE_ASPECT: 'MORPH',
  CLAUSES_CONNECTORS: 'BUILD',
  NOUN_CLAUSE: 'BUILD',
  ADJECTIVE_CLAUSE: 'REDUCE',
  ADVERB_CLAUSE: 'BUILD',
  INVERSION: 'BUILD',
  SUBJUNCTIVE: 'MORPH',
  CONDITIONALS: 'MORPH',
  MODAL_VERB: 'MORPH',
};

const tokenize = (sentence: string): string[] => {
  if (/\[[^\]]+\]/.test(sentence)) {
    return sentence.match(/\[[^\]]+\]|\S+/g) ?? [];
  }

  return sentence.match(/[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*(?:[.,!?;:]+)?|[^\s]/g) ?? [];
};

const applyPhraseDictionary = (tokens: string[], concept: GrammarConcept): string[] => {
  const phrases = (phraseDictionary[concept] ?? [])
    .map(phrase => phrase.toLowerCase().split(' '))
    .sort((left, right) => right.length - left.length);
  if (phrases.length === 0) return tokens;

  const result: string[] = [];
  for (let index = 0; index < tokens.length;) {
    const match = phrases.find(parts =>
      parts.every((part, offset) =>
        tokens[index + offset]?.replace(/[.,!?;:]+$/, '').toLowerCase() === part
      )
    );
    if (!match) {
      result.push(tokens[index]);
      index++;
      continue;
    }

    result.push(tokens.slice(index, index + match.length).join(' '));
    index += match.length;
  }
  return result;
};

const makeChunk = (text: string, index: number, concept: GrammarConcept): Chunk => {
  const options = morphologyConcepts.has(concept)
    ? verbMorphology.get(text.replace(/[.,!?;:]+$/, '').toLowerCase())
    : undefined;
  if (!options) return { id: `auto-${index}`, text, draggable: true };

  const normalizedOptions = [...options];
  const textIndex = normalizedOptions.findIndex(option => option.toLowerCase() === text.toLowerCase());
  return {
    id: `auto-${index}`,
    text,
    draggable: true,
    can_morph: true,
    options: normalizedOptions,
    current_index: textIndex < 0 ? 0 : textIndex,
  };
};

export function autoChunk(sentence: string, concept: GrammarConcept): Chunk[] {
  const tokens = tokenize(sentence.trim());
  const chunks = /\[[^\]]+\]/.test(sentence)
    ? tokens
    : applyPhraseDictionary(tokens, concept);
  return chunks.map((text, index) => makeChunk(text, index, concept));
}

export function defaultUiModeForConcept(concept: GrammarConcept): UIMode {
  return defaultModes[concept];
}
