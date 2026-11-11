import type { DiagnosticLayer, DiagnosticContext, DiagnosticSignal, CustomGrammarRule } from '../../types';
import nlp from 'compromise'; // 修正：使用 ES Module 匯入

export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildPhraseRegex(pattern: string): RegExp {
  const escaped = escapeRegExp(pattern.trim());
  const flexibleSpaces = escaped.replace(/\s+/g, '\\s+');
  return new RegExp(`\\b${flexibleSpaces}\\b`, 'i');
}

/**
 * 使用 compromise.js 自動展開動詞變體
 * 例如：輸入 'go' -> 回傳 ['go', 'goes', 'went', 'gone', 'going']
 * 輸入 'He go' -> 回傳 ['He go', 'He goes', 'He went', ...]
 */
function expandPatternWithCompromise(pattern: string): string[] {
  const trimmed = pattern.trim();
  
  // 關鍵修正：如果只有單一單字，只做精確匹配，不展開變體
  if (!trimmed.includes(' ')) {
    return [trimmed.toLowerCase()];
  }

  const doc = nlp(trimmed);
  const verbs = doc.verbs();

  if (!verbs.found) {
    return [trimmed.toLowerCase()];
  }

  const conjugations = verbs.conjugate();
  if (!conjugations || conjugations.length === 0) {
    return [trimmed.toLowerCase()];
  }

  const expanded = new Set<string>([trimmed.toLowerCase()]);
  const originalVerb = verbs.out('text').toLowerCase();

  conjugations.forEach((conj) => {
    Object.values(conj).forEach((form) => {
      if (typeof form === 'string' && form.trim() !== '') {
        const regex = new RegExp(`\\b${originalVerb}\\b`, 'gi');
        const newPattern = trimmed.replace(regex, form);
        expanded.add(newPattern.toLowerCase());
      }
    });
  });

  return Array.from(expanded);
}

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

    // 依優先級由高到低排序
    const sortedRules = [...customRules].sort(
      (a, b) => (b.priority ?? 100) - (a.priority ?? 100)
    );

    for (const rule of sortedRules) {
      // 檢查概念是否匹配
      if (
        rule.concepts &&
        rule.concepts.length > 0 &&
        question.concept &&
        !rule.concepts.includes(question.concept)
      ) {
        continue;
      }

      // 展開變體
      const expandedPatterns = rule.wrongPattern.flatMap((p) => expandPatternWithCompromise(p));

      const matched = expandedPatterns.some((pattern) => {
        try {
          const regex = buildPhraseRegex(pattern);
          return regex.test(studentStr);
        } catch (e) {
          console.warn(`Invalid custom rule pattern: ${pattern}`, e);
          return studentStr.toLowerCase().includes(pattern.toLowerCase());
        }
      });

      if (matched) {
        signals.push({
          code: `CUSTOM:${rule.id}`,
          message: rule.message,
          hint: rule.correctForm ? `建議改用：「${rule.correctForm}"` : undefined,
          source: 'custom',
          index: 0,
        });
      }
    }

    return signals;
  },
};