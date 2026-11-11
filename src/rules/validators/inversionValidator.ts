import type { DiagnosticSignal } from '../types';
import { cleanToken } from '../../utils/textUtils';

// 常見的置首否定副詞
const NEGATIVE_TRIGGERS = new Set(['never', 'hardly', 'seldom', 'rarely', 'scarcely', 'barely', 'not']);
// 主格代名詞
const SUBJECT_PRONOUNS = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they']);
// 助動詞
const AUXILIARIES = new Set([
  'is', 'are', 'was', 'were', 'am', 'do', 'does', 'did', 
  'has', 'have', 'had', 'will', 'would', 'can', 'could', 
  'shall', 'should', 'may', 'might', 'must'
]);

export function validateInversion(
  studentTokens: string[],
  correctTokens: string[]
): DiagnosticSignal[] {
  const signals: DiagnosticSignal[] = [];
  if (studentTokens.length < 2) return signals;

  const firstWord = cleanToken(studentTokens[0]).toLowerCase();
  const secondWord = cleanToken(studentTokens[1]).toLowerCase();

  // 1. 檢查否定副詞置首 (如 Never, Hardly)
  if (NEGATIVE_TRIGGERS.has(firstWord)) {
    // 正確答案中，第二個字應該是助動詞 (如 Never have I...)
    const correctSecondWord = correctTokens.length > 1 ? cleanToken(correctTokens[1]).toLowerCase() : '';
    
    // 如果學生把主詞放在第二位 (如 Never I have...)
    if (SUBJECT_PRONOUNS.has(secondWord) || secondWord === 'the') {
      signals.push({
        code: 'O:INVERSION',
        sst: 'Misordering',
        index: 1,
        message: `否定副詞「${firstWord}」置首時，必須使用倒裝句型。`,
        hint: `請將助動詞移到主詞前面，例如「${firstWord} ${correctSecondWord} ${secondWord}...」。`,
        source: 'local',
      });
    }
  }

  // 2. 檢查 Not only 句型
  if (firstWord === 'not' && secondWord === 'only') {
    const thirdWord = studentTokens.length > 2 ? cleanToken(studentTokens[2]).toLowerCase() : '';
    if (SUBJECT_PRONOUNS.has(thirdWord) || thirdWord === 'the') {
      signals.push({
        code: 'O:INVERSION',
        sst: 'Misordering',
        index: 2,
        message: `「Not only」置首時，後面的子句必須倒裝！`,
        hint: `請改成「Not only + 助動詞 + 主詞 + 動詞」的語序。`,
        source: 'local',
      });
    }
  }

  // 3. 檢查一般問句 (如 He can go? 應為 Can he go?)
  const correctFirstWord = correctTokens.length > 0 ? cleanToken(correctTokens[0]).toLowerCase() : '';
  if (AUXILIARIES.has(correctFirstWord)) {
    // 正確答案是助動詞開頭，但學生寫了主詞開頭
    if (SUBJECT_PRONOUNS.has(firstWord) || firstWord === 'the') {
      const correctSecondWord = correctTokens.length > 1 ? cleanToken(correctTokens[1]).toLowerCase() : '';
      if (SUBJECT_PRONOUNS.has(correctSecondWord) || correctSecondWord === 'the') {
        signals.push({
          code: 'O:INVERSION',
          sst: 'Misordering',
          index: 0,
          message: `這是一個問句，助動詞應放在主詞前面。`,
          hint: `請將助動詞「${correctFirstWord}」移到句首。`,
          source: 'local',
        });
      }
    }
  }

  return signals;
}