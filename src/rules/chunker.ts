import nlp from 'compromise';
import irregularVerbs from 'english-verbs-irregular/resources/irregularVerbs.json';
import type { Chunk, GrammarConcept, UIMode } from './types';

type VerbForms = {
  infinitive: string;
  present: string;
  past: string;
  participle: string;
  gerund: string;
};

const phraseDictionary: Partial<Record<GrammarConcept, readonly string[]>> = {
  CLAUSES_CONNECTORS: ['even though', 'as soon as', 'in order to', 'so that', 'because of'],
  NOUN_CLAUSE: ['whether or not', 'what kind of', 'how many'],
  ADVERB_CLAUSE: ['even though', 'as soon as', 'so that', 'because of'],
  ADJECTIVE_CLAUSE: ['in front of', 'next to'],
  SENTENCE_PATTERN: ['in front of', 'next to'],
};

const morphologyConcepts = new Set<GrammarConcept>([
  'SUBJECT_VERB_AGREEMENT',
  'TENSE_ASPECT',
  'SUBJUNCTIVE',
  'CONDITIONALS',
  'MODAL_VERB',
  'PAST_TENSE',
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
  PAST_TENSE: 'MORPH',
};

const irregularForms = irregularVerbs as Record<string, string[][]>;
const irregularVerbIndex = new Map<string, string>();
Object.entries(irregularForms).forEach(([infinitive, forms]) => {
  irregularVerbIndex.set(infinitive.toLowerCase(), infinitive);
  forms.flat().forEach(form => {
    const key = form.toLowerCase();
    if (!irregularVerbIndex.has(key)) irregularVerbIndex.set(key, infinitive);
  });
});

const getCompromiseForms = (verb: string): VerbForms | undefined => {
  const parsedVerb = nlp(verb).verbs();
  const infinitive = parsedVerb.toInfinitive().out('array')[0];
  if (!infinitive) return undefined;

  const conjugation = nlp(infinitive).verbs().conjugate()[0] as
    | Record<string, string | undefined>
    | undefined;
  if (!conjugation) return undefined;

  const pick = (...keys: string[]) =>
    keys.map(key => conjugation[key]).find((value): value is string => Boolean(value));
  const past = pick('PastTense', 'Past');
  const participle = pick('Participle', 'PastParticiple') ?? past;
  const present = pick('PresentTense', 'Present');
  const gerund = pick('Gerund', 'PresentParticiple');

  if (!past || !participle || !present || !gerund) return undefined;
  return { infinitive, present, past, participle, gerund };
};

export function getVerbForms(verb: string): VerbForms | undefined {
  const normalizedVerb = verb.trim().toLowerCase().replace(/^[^\w']+|[^\w']+$/g, '');
  if (!normalizedVerb) return undefined;

  const irregularEntry = irregularVerbIndex.get(normalizedVerb);
  const parsedVerb = nlp(normalizedVerb).verbs().toInfinitive().out('array')[0]?.toLowerCase();
  const infinitive = irregularEntry || parsedVerb || normalizedVerb;
  const irregular = irregularForms[infinitive];

  if (irregular?.length) {
    const [past, participle] = irregular[0];
    const regularForms = getCompromiseForms(infinitive);
    if (past && participle && regularForms) {
      return { ...regularForms, past, participle };
    }
  }

  return getCompromiseForms(infinitive);
}

const tokenizeWithCompromise = (sentence: string): string[] => {
  const chunks: string[] = [];
  const parts = sentence.split(/(\[[^\]]+\][.,!?;:]*)/g);

  for (const part of parts) {
    if (!part) continue;
    if (/^\[[^\]]+\][.,!?;:]*$/.test(part)) {
      chunks.push(part);
    } else {
      chunks.push(...nlp(part).terms().out('array'));
    }
  }

  return chunks;
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
  const verbForms = morphologyConcepts.has(concept) && !text.startsWith('[')
    ? getVerbForms(text.replace(/[.,!?;:]+$/, ''))
    : undefined;
  if (!verbForms) return { id: `auto-${index}`, text, draggable: true };

  const options = [
    verbForms.infinitive,
    verbForms.present,
    verbForms.past,
    verbForms.participle,
    verbForms.gerund,
  ];
  if (['TENSE_ASPECT', 'PAST_TENSE'].includes(concept)) {
    options.push(`will ${verbForms.infinitive}`);
  }
  if (['SUBJUNCTIVE', 'CONDITIONALS'].includes(concept)) {
    if (verbForms.infinitive === 'be') options.push('were');
    if (verbForms.infinitive === 'will') options.push('would');
  }
  const uniqueOptions = [...new Set(options)];
  const currentIndex = uniqueOptions.findIndex(option => option.toLowerCase() === text.toLowerCase());
  return {
    id: `auto-${index}`,
    text,
    draggable: true,
    can_morph: true,
    options: uniqueOptions,
    current_index: currentIndex < 0 ? 0 : currentIndex,
  };
};

export function autoChunk(sentence: string, concept: GrammarConcept): Chunk[] {
  const tokens = tokenizeWithCompromise(sentence.trim());
  return applyPhraseDictionary(tokens, concept)
    .map((text, index) => makeChunk(text, index, concept));
}

export function defaultUiModeForConcept(concept: GrammarConcept): UIMode {
  return defaultModes[concept];
}
