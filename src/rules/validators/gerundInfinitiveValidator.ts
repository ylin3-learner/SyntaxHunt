import type { DiagnosticSignal } from '../types';
import { cleanToken } from '../../utils/textUtils';

// 只能接 V-ing 的動詞
const GERUND_VERBS = new Set(['enjoy', 'avoid', 'finish', 'mind', 'practice', 'suggest', 'keep', 'dislike', 'miss', 'quit']);
// 只能接 to + V 的動詞
const INFINITIVE_VERBS = new Set(['want', 'decide', 'hope', 'plan', 'agree', 'promise', 'refuse', 'need', 'try']);

const ingExceptions = new Set(['something', 'anything', 'nothing', 'everything', 'thing', 'morning', 'evening', 'during', 'king', 'ring', 'string']);

export function validateGerundInfinitive(
  studentTokens: string[],
  correctTokens: string[]
): DiagnosticSignal[] {
  const signals: DiagnosticSignal[] = [];

  for (let i = 0; i < studentTokens.length - 1; i++) {
    const verb = cleanToken(studentTokens[i]).toLowerCase();
    const nextWord = cleanToken(studentTokens[i + 1]).toLowerCase();

    // 1. 檢查「只能接 V-ing」的動詞是否誤接了 to
    if (GERUND_VERBS.has(verb) && nextWord === 'to') {
      signals.push({
        code: 'R:VERB:FORM',
        sst: 'Misformation',
        index: i + 1,
        message: `「${verb}」後面必須接動名詞 (V-ing)，不能接 to V 喔！`,
        hint: `請改成 ${verb} + V-ing。`,
        source: 'local',
      });
    }

    
    // 2. 檢查「只能接 to V」的動詞是否誤接了 V-ing
    if (INFINITIVE_VERBS.has(verb) && nextWord.endsWith('ing') && !ingExceptions.has(nextWord)) {
      signals.push({
        code: 'R:VERB:FORM',
        sst: 'Misformation',
        index: i + 1,
        message: `「${verb}」後面必須接不定詞 (to V)，不能接 V-ing 喔！`,
        hint: `請改成 ${verb} to + 原形動詞。`,
        source: 'local',
      });
    }
  }

  return signals;
}