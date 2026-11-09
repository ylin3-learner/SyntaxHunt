import { cleanToken } from './textUtils';

export interface TokenDiff {
  studentOnly: Array<{ token: string; index: number }>;
  correctOnly: Array<{ token: string; index: number }>;
}

export function computeTokenDiff(
  studentTokens: string[],
  correctTokens: string[]
): TokenDiff {
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

  const studentOnly: TokenDiff['studentOnly'] = [];
  const correctOnly: TokenDiff['correctOnly'] = [];
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
}

/**
 * 找出學生答案與正確答案不同的 Tile 索引 (用於 L5 高亮兜底)
 */
export function findDiffIndices(
  studentTokens: string[],
  correctTokens: string[]
): number[] {
  const cleanStudent = studentTokens.map(cleanToken);
  const cleanCorrect = correctTokens.map(cleanToken);

  const minLen = Math.min(cleanStudent.length, cleanCorrect.length);
  for (let i = 0; i < minLen; i++) {
    if (cleanStudent[i] !== cleanCorrect[i]) {
      return [i];
    }
  }

  if (cleanStudent.length > cleanCorrect.length) {
    return [minLen];
  }
  if (cleanCorrect.length > cleanStudent.length) {
    return [minLen];
  }

  return [];
}

/**
 * 將 token diff 轉換為結構性診斷訊號 (L3 使用)
 */
export function diffToSignals(
  diff: TokenDiff,
  studentTokens: string[],
  correctTokens: string[],
  deps: {
    relativePronouns: Set<string>;
    subjectPronouns: Set<string>;
    auxiliaries: Set<string>;
    determiners: Set<string>;
    prepositions: Set<string>;
    findVerbPair: (verb: string) => { singular: string; plural: string } | undefined;
    irregularVerbForms: Set<string>;
  }
): Array<{ code: string; sst: 'Omission' | 'Addition' | 'Misformation' | 'Misordering'; index: number; message: string; hint: string }> {
  const { studentOnly, correctOnly } = diff;

  if (studentOnly.length === 0 && correctOnly.length === 0) {
    return [];
  }

  if (studentOnly.length > 0 && correctOnly.length === 0) {
    const extra = studentOnly[0];
    const token = cleanToken(extra.token);
    let code: string;
    if (deps.relativePronouns.has(token)) code = 'U:RELATIVE';
    else if (deps.subjectPronouns.has(token)) code = 'U:PRON';
    else if (deps.auxiliaries.has(token) || deps.findVerbPair(token)) code = 'U:VERB';
    else code = 'UNKNOWN_ERROR';

    return [{
      code,
      sst: 'Addition',
      index: extra.index,
      message: `「${extra.token}」可能是多餘的字，請檢查是否需要保留。`,
      hint: '留意句子中重複或不需要的字。',
    }];
  }

  if (correctOnly.length > 0 && studentOnly.length === 0) {
    const missing = correctOnly[0];
    const token = cleanToken(missing.token);
    let code: string;
    if (deps.auxiliaries.has(token)) code = 'M:AUX';
    else if (deps.determiners.has(token)) code = 'M:DET';
    else if (deps.prepositions.has(token)) code = 'M:PREP';
    else if (deps.findVerbPair(token)) code = 'M:VERB';
    else code = 'UNKNOWN_ERROR';

    return [{
      code,
      sst: 'Omission',
      index: Math.min(missing.index, Math.max(0, studentTokens.length - 1)),
      message: `少了「${missing.token}」，請再檢查一次句子。`,
      hint: '確認答案沒有漏掉必要的單字。',
    }];
  }

  if (studentTokens.length === correctTokens.length) {
    const studentSorted = studentTokens.map(cleanToken).slice().sort();
    const correctSorted = correctTokens.map(cleanToken).slice().sort();
    if (studentSorted.every((t, idx) => t === correctSorted[idx])) {
      return [{
        code: 'O:WRONG_ORDER',
        sst: 'Misordering',
        index: -1,
        message: '單字都對了，但順序好像怪怪的喔！',
        hint: '檢查一下主詞、動詞與修飾語的位置。',
      }];
    }
  }

  const studentWord = studentOnly[0];
  const correctWord = correctOnly[0];
  if (!studentWord || !correctWord) return [];

  const studentToken = cleanToken(studentWord.token);
  const correctToken = cleanToken(correctWord.token);
  const isVerbSubstitution = !!deps.findVerbPair(studentToken)
    || !!deps.findVerbPair(correctToken)
    || deps.irregularVerbForms.has(studentToken)
    || deps.irregularVerbForms.has(correctToken)
    || /(?:ed|ing)$/.test(studentToken)
    || /(?:ed|ing)$/.test(correctToken);
  const isPrepositionSubstitution = deps.prepositions.has(studentToken) || deps.prepositions.has(correctToken);
  const isNumberSubstitution = studentToken.replace(/s$/, '') === correctToken.replace(/s$/, '');

  let code: string;
  if (isVerbSubstitution) code = 'R:VERB:TENSE';
  else if (isPrepositionSubstitution) code = 'R:PREP';
  else if (deps.determiners.has(studentToken) || deps.determiners.has(correctToken)) code = 'R:DET';
  else if (isNumberSubstitution) code = 'R:NOUN:NUM';
  else code = 'UNKNOWN_ERROR';

  const distance = (a: string, b: string): number => {
    const m = a.length, n = b.length;
    const dp: number[][] = [];
    for (let i = 0; i <= m; i++) dp[i] = [i];
    for (let j = 0; j <= n; j++) dp[0] = dp[0] || [];
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
        else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  };

  const similar = distance(studentToken, correctToken);

  return [{
    code,
    sst: 'Misformation',
    index: studentWord.index,
    message: similar <= 2
      ? `「${studentWord.token}」的拼字或形式可能有誤。`
      : `「${studentWord.token}」可能要改成「${correctWord.token}」。`,
    hint: '請檢查單字的拼字、時態或詞性。',
  }];
}