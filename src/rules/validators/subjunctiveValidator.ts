import type { GrammarConcept } from '../types';
import type { RuleContext, RuleValidator } from '../grammarRules';
import { registerGrammarRule } from '../registry';

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

registerGrammarRule({ id: 'subjunctive-mood', validate: diagnoseSubjunctiveMood });