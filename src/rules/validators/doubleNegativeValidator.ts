import { cleanToken } from '../../utils/textUtils';
import type { DiagnosticSignal } from '../types'; // 修正路徑並改用 import type

export function validateDoubleNegative(
  studentTokens: string[],
  correctTokens: string[]
): DiagnosticSignal[] {
  const signals: DiagnosticSignal[] = [];
  const studentStr = studentTokens.join(' ').toLowerCase();

  // 檢查 "don't never" 的雙重否定
  const dontNeverMatch = studentStr.match(/don't\s+never/i);
  if (dontNeverMatch) {
    signals.push({
      code: 'R:DOUBLE_NEG',
      sst: 'Misformation',
      index: studentTokens.findIndex(t => cleanToken(t).toLowerCase() === "don't"),
      message: `「don't never」是雙重否定錯誤，請改用「don't any」或「never」單獨使用。`,
      hint: '避免雙重否定，只需使用單一否定詞。',
      source: 'local',
    });
  }

  // 檢查 "didn't no" 的雙重否定
  const didntNoMatch = studentStr.match(/didn't\s+no/i);
  if (didntNoMatch) {
    signals.push({
      code: 'R:DOUBLE_NEG',
      sst: 'Misformation',
      index: studentTokens.findIndex(t => cleanToken(t).toLowerCase() === "didn't"),
      message: `「didn't no」是雙重否定錯誤，請改用「didn't any」或「didn't anywhere」。`,
      hint: '避免雙重否定，只需使用單一否定詞。',
      source: 'local',
    });
  }

  return signals;
}