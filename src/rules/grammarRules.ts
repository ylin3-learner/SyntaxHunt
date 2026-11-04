import type { Antecedent, DiagnosticCode, DiagnosticSignal, QuestionData } from './types';
import { distance } from 'fastest-levenshtein';
import { findVerbPair, expectedForm } from './verbTable';
import { getGrammarRules, registerGrammarRule } from './registry';

const pluginModules = import.meta.glob('./validators/*.ts', { eager: true });
void pluginModules;

// ==========================================
// 核心驗證器介面
// ==========================================
export interface RuleContext {
  studentTokens: string[];
  correctTokens: string[];
  question: QuestionData;
}

export type RuleValidator = (ctx: RuleContext) => DiagnosticSignal[];

// 輔助函數
const cleanToken = (text: string) =>
  text.replace(/[\[\]]/g, '').trim().toLowerCase().replace(/^[.,!?;:]+|[.,!?;:]+$/g, '');
const RELATIVE_PRONOUNS = new Set(['who', 'which', 'that']);
const SUBJECT_PRONOUNS = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they']);
const BE_VERBS = new Set(['is', 'are', 'was', 'were', 'am']);
const AUXILIARIES = new Set(['is', 'are', 'was', 'were', 'am', 'do', 'does', 'did', 'has', 'have', 'had', 'will', 'can']);
const DETERMINERS = new Set(['a', 'an', 'the']);
const IRREGULAR_VERB_FORMS = new Set(['went', 'gone', 'saw', 'seen', 'ate', 'eaten', 'did', 'done', 'had', 'made', 'took', 'taken', 'wrote', 'written', 'ran']);
const PREPOSITIONS = new Set([
  'in', 'on', 'at', 'under', 'behind', 'with', 'by', 'next', 'across',
  'near', 'from', 'over', 'above', 'beside', 'between', 'inside', 'outside',
]);

interface TokenDifference {
  studentOnly: Array<{ token: string; index: number }>;
  correctOnly: Array<{ token: string; index: number }>;
}

const getTokenDifference = (studentTokens: string[], correctTokens: string[]): TokenDifference => {
  const student = studentTokens.map(cleanToken);
  const correct = correctTokens.map(cleanToken);
  const lcs = Array.from({ length: student.length + 1 }, () =>
    Array<number>(correct.length + 1).fill(0)
  );

  for (let i = student.length - 1; i >= 0; i--) {
    for (let j = correct.length - 1; j >= 0; j--) {
      lcs[i][j] = student[i] === correct[j]
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const studentOnly: TokenDifference['studentOnly'] = [];
  const correctOnly: TokenDifference['correctOnly'] = [];
  let i = 0;
  let j = 0;
  while (i < student.length && j < correct.length) {
    if (student[i] === correct[j]) {
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      studentOnly.push({ token: studentTokens[i], index: i++ });
    } else {
      correctOnly.push({ token: correctTokens[j], index: j++ });
    }
  }
  while (i < student.length) studentOnly.push({ token: studentTokens[i], index: i++ });
  while (j < correct.length) correctOnly.push({ token: correctTokens[j], index: j++ });
  return { studentOnly, correctOnly };
};

export const checkCommonPatterns: RuleValidator = (ctx) => {
  const { studentTokens } = ctx;
  const signals: DiagnosticSignal[] = [];

  for (let i = 0; i < studentTokens.length - 1; i++) {
    const subject = cleanToken(studentTokens[i]);
    const verb = cleanToken(studentTokens[i + 1]);
    const subjectNumber = subject === 'he' || subject === 'she' || subject === 'it'
      ? 'singular'
      : subject === 'i' || subject === 'you' || subject === 'we' || subject === 'they'
        ? 'plural'
        : null;
    const pair = findVerbPair(verb);

    if (subjectNumber && pair) {
      const expected = expectedForm(pair, subjectNumber);
      if (verb !== expected) {
        signals.push({
          code: 'R:VERB:SVA',
          sst: 'Misformation',
          index: i + 1,
          message: `主詞「${studentTokens[i]}」後面應使用「${expected}」。`,
          hint: `檢查主詞與動詞的單複數是否一致。`,
        });
      }
    }

    if ((subject === 'does' || subject === 'did' || subject === 'to') && pair && verb !== pair.plural) {
      signals.push({
        code: 'R:VERB:TENSE',
        sst: 'Misformation',
        index: i + 1,
        message: `「${studentTokens[i]}」後面應接動詞原形「${pair.plural}」。`,
        hint: `請把「${studentTokens[i + 1]}」改成「${pair.plural}」。`,
      });
    }

    if (subject === 'a' || subject === 'an') {
      const nextWord = cleanToken(studentTokens[i + 1]).replace(/^[^a-z]+/i, '');
      const shouldUseAn = /^[aeiou]/i.test(nextWord);
      if ((subject === 'a' && shouldUseAn) || (subject === 'an' && !shouldUseAn)) {
        const expected = shouldUseAn ? 'an' : 'a';
        signals.push({
          code: 'R:DET',
          sst: 'Misformation',
          index: i,
          message: `「${studentTokens[i]}」應改成「${expected}」。`,
          hint: 'a/an 要依照後面單字的發音選擇。',
        });
      }
    }
  }
  return signals;
};

const diagnoseTokenDifference = (
  studentTokens: string[],
  correctTokens: string[]
): DiagnosticSignal[] => {
  const difference = getTokenDifference(studentTokens, correctTokens);

  if (difference.studentOnly.length === 0 && difference.correctOnly.length === 0) {
    return [];
  }

  if (difference.studentOnly.length > 0 && difference.correctOnly.length === 0) {
    const extra = difference.studentOnly[0];
    const token = cleanToken(extra.token);
    const code: DiagnosticCode = RELATIVE_PRONOUNS.has(token)
      ? 'U:RELATIVE'
      : SUBJECT_PRONOUNS.has(token)
        ? 'U:PRON'
        : AUXILIARIES.has(token) || findVerbPair(token)
          ? 'U:VERB'
          : 'UNKNOWN_ERROR';
    return [{
      code,
      sst: 'Addition',
      index: extra.index,
      message: `「${extra.token}」可能是多餘的字，請檢查是否需要保留。`,
      hint: '留意句子中重複或不需要的字。',
    }];
  }

  if (difference.correctOnly.length > 0 && difference.studentOnly.length === 0) {
    const missing = difference.correctOnly[0];
    const token = cleanToken(missing.token);
    const code: DiagnosticCode = AUXILIARIES.has(token)
      ? 'M:AUX'
      : DETERMINERS.has(token)
        ? 'M:DET'
        : PREPOSITIONS.has(token)
          ? 'M:PREP'
        : findVerbPair(token)
          ? 'M:VERB'
          : 'UNKNOWN_ERROR';
    return [{
      code,
      sst: 'Omission',
      index: Math.min(missing.index, Math.max(0, studentTokens.length - 1)),
      message: `少了「${missing.token}」，請再檢查一次句子。`,
      hint: '確認答案沒有漏掉必要的單字。',
    }];
  }

  if (studentTokens.length === correctTokens.length) {
    const studentSorted = studentTokens.map(cleanToken).sort();
    const correctSorted = correctTokens.map(cleanToken).sort();
    if (studentSorted.every((token, index) => token === correctSorted[index])) {
      return [{
        code: 'O:WRONG_ORDER',
        sst: 'Misordering',
        index: -1,
        message: '單字都對了，但順序好像怪怪的喔！',
        hint: '檢查一下主詞、動詞與修飾語的位置。',
      }];
    }
  }

  const studentWord = difference.studentOnly[0];
  const correctWord = difference.correctOnly[0];
  const studentToken = cleanToken(studentWord.token);
  const correctToken = cleanToken(correctWord.token);
  const isVerbSubstitution = !!findVerbPair(studentToken)
    || !!findVerbPair(correctToken)
    || IRREGULAR_VERB_FORMS.has(studentToken)
    || IRREGULAR_VERB_FORMS.has(correctToken)
    || /(?:ed|ing)$/.test(studentToken)
    || /(?:ed|ing)$/.test(correctToken);
  const isPrepositionSubstitution = PREPOSITIONS.has(studentToken) || PREPOSITIONS.has(correctToken);
  const isNumberSubstitution = studentToken.replace(/s$/, '') === correctToken.replace(/s$/, '');
  const code: DiagnosticCode = isVerbSubstitution
    ? 'R:VERB:TENSE'
    : isPrepositionSubstitution
      ? 'R:PREP'
      : DETERMINERS.has(studentToken) || DETERMINERS.has(correctToken)
        ? 'R:DET'
      : isNumberSubstitution
        ? 'R:NOUN:NUM'
        : 'UNKNOWN_ERROR';
  const similar = distance(cleanToken(studentWord.token), cleanToken(correctWord.token));
  return [{
    code,
    sst: 'Misformation',
    index: studentWord.index,
    message: similar <= 2
      ? `「${studentWord.token}」的拼字或形式可能有誤。`
      : `「${studentWord.token}」可能要改成「${correctWord.token}」。`,
    hint: '請檢查單字的拼字、時態或詞性。',
  }];
};

// ==========================================
// 模組化規則 (Validators)
// ==========================================

export const checkDuplicatePronoun: RuleValidator = (ctx) => {
  const signals: DiagnosticSignal[] = [];
  const { studentTokens } = ctx;
  for (let i = 0; i < studentTokens.length - 1; i++) {
    const cur = cleanToken(studentTokens[i]);
    const next = cleanToken(studentTokens[i + 1]);
    if (RELATIVE_PRONOUNS.has(cur) && SUBJECT_PRONOUNS.has(next)) {
      signals.push({
        code: 'U:PRON', sst: 'Addition', index: i + 1,
        message: `「${studentTokens[i]}」已經代替了「${studentTokens[i + 1]}」，不可重複喔！`,
        hint: `刪掉「${studentTokens[i + 1]}」，改成「${studentTokens[i]} + 動詞」`,
      });
    }
  }
  return signals;
};

export const checkSVAgreement: RuleValidator = (ctx) => {
  const signals: DiagnosticSignal[] = [];
  const { studentTokens, question } = ctx;
  for (let i = 0; i < studentTokens.length - 1; i++) {
    if (!RELATIVE_PRONOUNS.has(cleanToken(studentTokens[i]))) continue;
    let j = i + 1;
    while (j < studentTokens.length && SUBJECT_PRONOUNS.has(cleanToken(studentTokens[j]))) j++;
    if (j >= studentTokens.length) continue;

    const verb = cleanToken(studentTokens[j]);
    const pair = findVerbPair(verb);
    if (!pair) continue;

    const expected = expectedForm(pair, question.antecedent.number);
    if (verb !== expected) {
      signals.push({
        code: 'R:VERB:SVA', sst: 'Misformation', index: j,
        message: `先行詞「${question.antecedent.noun}」是${question.antecedent.number === 'singular' ? '單數' : '複數'}，動詞要用「${expected}」`,
        hint: `把「${studentTokens[j]}」改成「${expected}」`,
      });
    }
  }
  return signals;
};

export const checkRelativeChoice: RuleValidator = (ctx) => {
  const signals: DiagnosticSignal[] = [];
  const { studentTokens, question } = ctx;
  studentTokens.forEach((tile, i) => {
    const t = cleanToken(tile);
    if (t === 'who' && question.antecedent.person === 'thing') {
      signals.push({
        code: 'R:RELATIVE', sst: 'Misformation', index: i,
        message: `「${question.antecedent.noun}」是物，不能用「${tile}」`,
        hint: `先行詞是物 → 用 which（或 that）`,
      });
    } else if (t === 'which' && question.antecedent.person === 'person') {
      signals.push({
        code: 'R:RELATIVE', sst: 'Misformation', index: i,
        message: `「${question.antecedent.noun}」是人，不能用「${tile}」`,
        hint: `先行詞是人 → 用 who（或 that）`,
      });
    }
  });
  return signals;
};

export const checkReduced: RuleValidator = (ctx) => {
  const { studentTokens, correctTokens, question } = ctx;
  if (question.ui_mode !== 'REDUCE') return [];

  const isExcessToken = (token: string, index: number) => {
    const normalized = cleanToken(token);
    const occurrence = studentTokens
      .slice(0, index + 1)
      .filter(studentToken => cleanToken(studentToken) === normalized).length;
    const targetCount = correctTokens.filter(correctToken => cleanToken(correctToken) === normalized).length;
    return occurrence > targetCount;
  };

  const idx = studentTokens.findIndex((token, index) =>
    RELATIVE_PRONOUNS.has(cleanToken(token)) && isExcessToken(token, index)
  );

  // 情況 1：關代還在，代表沒簡化
  if (idx !== -1) {
    return [{
      code: 'U:RELATIVE', sst: 'Addition', index: idx,
      message: `這題要把關係子句簡化，「${studentTokens[idx]}」要拿掉喔！`,
      hint: `關代＋be 動詞可以一起省略（that is under → under）`,
    }];
  }

  // 情況 2：關代刪了，但留下了多餘的 Be 動詞 (如 is/are)
  const beIndex = studentTokens.findIndex((token, index) =>
    BE_VERBS.has(cleanToken(token)) && isExcessToken(token, index)
  );
  if (beIndex !== -1) {
    return [{
      code: 'U:VERB', sst: 'Addition', index: beIndex,
      message: `「${studentTokens[beIndex]}」是多餘的喔！`,
      hint: `關代和 be 動詞要一起省略。請把「${studentTokens[beIndex]}」拿掉。`,
    }];
  }

  return [];
};

export const checkVerbForm: RuleValidator = (ctx) => {
  const { studentTokens, correctTokens, question } = ctx;
  const signals: DiagnosticSignal[] = [];

  // 只有在 MORPH 模式下，且長度一致時，才進行嚴格的逐字比對
  if (question.ui_mode === 'MORPH' && studentTokens.length === correctTokens.length) {
    for (let i = 0; i < studentTokens.length; i++) {
      const studentT = cleanToken(studentTokens[i]);
      const correctT = cleanToken(correctTokens[i]);
      const morphableChunk = question.chunks?.find(chunk =>
        chunk.can_morph
        && [chunk.text, ...(chunk.options ?? chunk.morph_options ?? [])]
          .some(option => cleanToken(option) === studentT)
      );

      if (morphableChunk && studentT !== correctT) {
        signals.push({
          code: findVerbPair(studentT) || findVerbPair(correctT) || IRREGULAR_VERB_FORMS.has(studentT) || IRREGULAR_VERB_FORMS.has(correctT)
            ? 'R:VERB:TENSE'
            : 'R:NOUN:NUM',
          sst: 'Misformation',
          index: i,
          message: `這裡應該用「${correctTokens[i]}」而不是「${studentTokens[i]}」喔。`,
          hint: '請點擊字塊，切換成正確的時態或形式。',
        });
      }
    }
  }

  return signals;
};

// // 未來擴充範例：檢查時態 (若學生答案包含 yesterday，動詞必須是過去式)
// export const checkTense: RuleValidator = (ctx) => {
//   const { studentTokens } = ctx;
//   const hasYesterday = studentTokens.some(t => t.toLowerCase() === 'yesterday');
//   if (!hasYesterday) return [];

//   // 這裡可以加入更嚴謹的 NLP 判斷，目前先用簡單示範
//   const verbIndex = studentTokens.findIndex(t => findVerbPair(t) !== undefined);
//   if (verbIndex !== -1) {
//     const verb = studentTokens[verbIndex];
//     const pair = findVerbPair(verb);
//     if (pair && verb === pair.base) {
//       return [{
//         code: 'R:VERB:TENSE', sst: 'Misformation', index: verbIndex,
//         message: `句子有 yesterday，動詞要用過去式喔！`,
//         hint: `把「${verb}」改成過去式。`,
//       }];
//     }
//   }
//   return [];
// };


registerGrammarRule({ id: 'duplicate-pronoun', validate: checkDuplicatePronoun });
registerGrammarRule({ id: 'subject-verb-agreement', validate: checkSVAgreement });
registerGrammarRule({ id: 'common-patterns', validate: checkCommonPatterns });
registerGrammarRule({ id: 'relative-choice', validate: checkRelativeChoice });
registerGrammarRule({ id: 'reduced-form', validate: checkReduced });
registerGrammarRule({ id: 'verb-form', validate: checkVerbForm });

export function diagnoseGrammar(
  studentTokens: string[],
  correctTokens: string[],
  question: QuestionData
): DiagnosticSignal[] {
  const ctx: RuleContext = { studentTokens, correctTokens, question };
  let allSignals: DiagnosticSignal[] = [];

  for (const rule of getGrammarRules(question.concept)) {
    allSignals = allSignals.concat(rule(ctx));
  }

  // LCS aligns the two token sequences to distinguish omissions, additions and reordering.
  if (allSignals.length === 0) {
    const studentStr = studentTokens.map(cleanToken).join(' ');
    const correctStr = correctTokens.map(cleanToken).join(' ');
    if (studentStr !== correctStr) {
      allSignals.push(...diagnoseTokenDifference(studentTokens, correctTokens));
    }
  }

  return allSignals;
}