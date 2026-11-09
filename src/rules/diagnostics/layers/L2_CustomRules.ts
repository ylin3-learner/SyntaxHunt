import type { DiagnosticLayer, DiagnosticContext, DiagnosticSignal, CustomGrammarRule } from '../../types';

/**
 * 轉義正則表達式特殊字元，避免老師輸入 '?' 或 '*' 時導致系統崩潰
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 建立具備單字邊界且容錯多空白的正則表達式
 */
function buildPhraseRegex(pattern: string): RegExp {
  const escaped = escapeRegExp(pattern.trim());
  const flexibleSpaces = escaped.replace(/\s+/g, '\\s+');
  return new RegExp(`\\b${flexibleSpaces}\\b`, 'i');
}

/**
 * L2 老師自訂規則層
 * 解析 question.customRules，進行精準的單字邊界比對
 */
// 👈 這裡確保有加上 export const
export const L2CustomRules: DiagnosticLayer = {
  id: 'L2_CustomRules',
  priority: 20,

  async diagnose(ctx: DiagnosticContext): Promise<DiagnosticSignal[]> {
    const { studentTokens, question } = ctx;
    const customRules: CustomGrammarRule[] = question.customRules ?? [];

    if (customRules.length === 0) {
      return [];
    }

    const studentStr = studentTokens.join(' ');
    const signals: DiagnosticSignal[] = [];

    // 依優先級由高到低排序 (數字大的優先)
    const sortedRules = [...customRules].sort(
      (a, b) => (b.priority ?? 100) - (a.priority ?? 100)
    );

    for (const rule of sortedRules) {
      // 檢查概念是否匹配 (空陣列表示所有概念皆適用)
      if (
        rule.concepts &&
        rule.concepts.length > 0 &&
        question.concept &&
        !rule.concepts.includes(question.concept)
      ) {
        continue;
      }

      // 使用 RegExp 進行精準比對
      const matched = rule.wrongPattern.some((pattern) => {
        try {
          const regex = buildPhraseRegex(pattern);
          return regex.test(studentStr);
        } catch (e) {
          // 若正則建立失敗，退回基本字串比對
          console.warn(`Invalid custom rule pattern: ${pattern}`, e);
          return studentStr.toLowerCase().includes(pattern.toLowerCase());
        }
      });

      if (matched) {
        signals.push({
          code: `CUSTOM:${rule.id}`,
          message: rule.message,
          hint: rule.correctForm
            ? `建議改用：「${rule.correctForm}"`
            : undefined,
          source: 'custom',
          index: 0,
        });
      }
    }

    return signals;
  },
};