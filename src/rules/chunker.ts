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
  'COMPARISON',
  'PASSIVE_VOICE',
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

  PREPOSITION: 'BUILD',
  ARTICLE: 'BUILD',
  VERB: 'BUILD',
  GERUND: 'BUILD',
  COMPARISON: 'MORPH',
  PASSIVE_VOICE: 'MORPH',
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

// 新增：針對形容詞比較級的簡易推論 (基於常見字尾規則)
const getAdjectiveForms = (word: string): string[] | undefined => {
  const normalized = word.trim().toLowerCase().replace(/^[^\w']+|[^\w']+$/g, '');
  // 基本過濾：太短的字或明顯不是形容詞的字
  if (normalized.length < 3) return undefined;

  // 假設原形 (透過去除 er/est)
  let base = normalized;
  if (base.endsWith('er')) base = base.slice(0, -2);
  else if (base.endsWith('est')) base = base.slice(0, -3);

  // 處理雙寫子音 (big -> bigger -> biggest)
  if (base.endsWith(base.slice(-1))) base = base.slice(0, -1);

  return [base, `${base}er`, `${base}est`];
};

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
  if (!morphologyConcepts.has(concept) || text.startsWith('[')) {
    return { id: `auto-${index}`, text, draggable: true };
  }

  // 針對比較級 (Ch 9) 使用形容詞規則
  if (concept === 'COMPARISON') {
    const adjOptions = getAdjectiveForms(text);
    if (adjOptions) {
      return {
        id: `auto-${index}`,
        text,
        draggable: true,
        can_morph: true,
        options: adjOptions,
        current_index: Math.max(0, adjOptions.findIndex(o => o.toLowerCase() === text.toLowerCase())),
      };
    }
  }

  // 其他章節使用動詞規則 (時態、被動、SVA)
  const verbForms = getVerbForms(text.replace(/[.,!?;:]+$/, ''));
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