import type { GrammarConcept } from '../types';
import type { RuleContext, RuleValidator } from '../grammarRules';
import { registerGrammarRule } from '../registry';
import { findVerbPair } from '../verbTable';

const modals = new Set([
  'can', 'could', 'may', 'might', 'must', 'shall', 'should', 'will', 'word',
]);
const clean = (token: string) => token.toLowerCase().replace(/^[.,!?;:]+|[.,!?;:]+$/g, '');

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

registerGrammarRule({ id: 'modal-base-form', validate: diagnoseModalVerb });