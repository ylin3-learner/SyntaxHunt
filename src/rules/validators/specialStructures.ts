import type { GrammarConcept } from '../types';
import type { RuleContext, RuleValidator } from '../grammarRules';
import { registerGrammarRule } from '../registry';
import { findVerbPair } from '../verbTable';

const conjunctions = new Set([
  'and', 'but', 'or', 'nor', 'for', 'yet', 'so',
  'because', 'although', 'though', 'when', 'if', 'unless', 'while', 'that', 'whether',
]);
const auxiliaries = new Set([
  'am', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'have', 'has', 'had',
  'can', 'could', 'may', 'might', 'must', 'shall', 'should', 'will', 'would',
]);
const modals = new Set([
  'can', 'could', 'may', 'might', 'must', 'shall', 'should', 'will', 'would',
]);

const clean = (token: string) => token.toLowerCase().replace(/^[.,!?;:]+|[.,!?;:]+$/g, '');

const multisetDifference = (left: string[], right: string[]) => {
  const counts = new Map<string, number>();
  right.forEach(token => counts.set(clean(token), (counts.get(clean(token)) ?? 0) + 1));
  const onlyLeft: Array<{ token: string; index: number }> = [];
  left.forEach((token, index) => {
    const normalized = clean(token);
    const count = counts.get(normalized) ?? 0;
    if (count > 0) counts.set(normalized, count - 1);
    else onlyLeft.push({ token, index });
  });
  const onlyRight: string[] = [];
  counts.forEach((count, token) => {
    for (let index = 0; index < count; index++) onlyRight.push(token);
  });
  return { onlyLeft, onlyRight };
};

const diagnoseConjunctions: RuleValidator = ({ studentTokens, correctTokens }) => {
  const { onlyLeft, onlyRight } = multisetDifference(studentTokens, correctTokens);
  const extra = onlyLeft.find(item => conjunctions.has(clean(item.token)));
  const missing = onlyRight.find(token => conjunctions.has(token));

  if (extra && missing) {
    return [{
      code: 'R:CONJ',
      sst: 'Misformation',
      index: extra.index,
      message: `連接詞「${extra.token}」可能要改成「${missing}」。`,
      hint: '檢查兩個子句之間的邏輯關係。',
    }];
  }
  if (extra) {
    return [{
      code: 'U:CONJ',
      sst: 'Addition',
      index: extra.index,
      message: `「${extra.token}」可能是不需要的連接詞。`,
      hint: '確認句子是否已經有合適的連接詞。',
    }];
  }
  if (missing) {
    return [{
      code: 'M:CONJ',
      sst: 'Omission',
      index: Math.min(studentTokens.length, Math.max(0, correctTokens.findIndex(token => clean(token) === missing))),
      message: `少了連接詞「${missing}」。`,
      hint: '檢查子句之間是否需要連接詞。',
    }];
  }
  return [];
};

const diagnoseInversion: RuleValidator = ({ studentTokens, correctTokens }) => {
  const { onlyLeft, onlyRight } = multisetDifference(studentTokens, correctTokens);
  if (onlyLeft.length || onlyRight.length) return [];

  for (let studentIndex = 0; studentIndex < studentTokens.length - 1; studentIndex++) {
    const first = clean(studentTokens[studentIndex]);
    const second = clean(studentTokens[studentIndex + 1]);
    if (!auxiliaries.has(second) || auxiliaries.has(first)) continue;
    const correctAuxiliaryIndex = correctTokens.findIndex(token => clean(token) === second);
    const correctSubjectIndex = correctTokens.findIndex(token => clean(token) === first);
    if (correctAuxiliaryIndex !== -1 && correctSubjectIndex !== -1
      && correctAuxiliaryIndex < correctSubjectIndex) {
      return [{
        code: 'O:INVERSION',
        sst: 'Misordering',
        index: studentIndex,
        message: '問句或倒裝句的助動詞位置不正確。',
        hint: '確認句型是否需要將助動詞放在主詞前面。',
      }];
    }
  }
  return [];
};

const diagnoseModalVerb: RuleValidator = ({ studentTokens }) => {
  for (let index = 0; index < studentTokens.length - 1; index++) {
    if (!modals.has(clean(studentTokens[index]))) continue;
    const verb = clean(studentTokens[index + 1]);
    const pair = findVerbPair(verb);
    if (pair && verb !== pair.plural) {
      return [{
        code: 'R:VERB:FORM',
        sst: 'Misformation',
        index: index + 1,
        message: `情態動詞「${studentTokens[index]}」後面應接原形動詞「${pair.plural}」。`,
        hint: '情態動詞後方的主要動詞使用原形。',
      }];
    }
  }
  return [];
};

const diagnoseSubjunctiveMood: RuleValidator = ({ studentTokens, correctTokens }) => {
  const hasSubjunctiveCue = studentTokens.some(token => ['if', 'wish'].includes(clean(token)));
  if (!hasSubjunctiveCue) return [];
  const { onlyLeft, onlyRight } = multisetDifference(studentTokens, correctTokens);
  const wrongForm = onlyLeft.find(({ token }) => ['was', 'were'].includes(clean(token)));
  const correctForm = onlyRight.find(token => ['was', 'were'].includes(token));
  if (!wrongForm || !correctForm) return [];

  return [{
    code: 'R:VERB:MOOD',
    sst: 'Misformation',
    index: wrongForm.index,
    message: `這個假設語境中應使用「${correctForm}」。`,
    hint: '檢查句子表達的是事實還是假設。',
  }];
};

const registerConceptRule = (
  id: string,
  concepts: readonly GrammarConcept[],
  validate: RuleValidator
) => registerGrammarRule({ id, concepts, validate });

registerConceptRule(
  'conjunction-choice',
  ['CLAUSES_CONNECTORS', 'NOUN_CLAUSE', 'ADVERB_CLAUSE'],
  diagnoseConjunctions
);
registerConceptRule('inversion-order', ['QUESTION_FORM', 'INVERSION'], diagnoseInversion);
registerConceptRule('modal-base-form', ['MODAL_VERB'], diagnoseModalVerb);
registerConceptRule('subjunctive-mood', ['SUBJUNCTIVE', 'CONDITIONALS'], diagnoseSubjunctiveMood);
