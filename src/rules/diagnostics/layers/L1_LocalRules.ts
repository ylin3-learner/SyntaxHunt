import type { DiagnosticLayer, DiagnosticContext, DiagnosticSignal } from '../../types';
import { getGrammarRules } from '../../registry';
import '../../grammarRules';
import { validateSVA } from '../../validators/svaValidator';
import { validateTense } from '../../validators/tenseValidator';
import { validateGerundInfinitive } from '../../validators/gerundInfinitiveValidator';
import { validateDoubleNegative } from '../../validators/doubleNegativeValidator';

export const L1LocalRules: DiagnosticLayer = {
  id: 'L1_LocalRules',
  priority: 10,

  async diagnose(ctx: DiagnosticContext): Promise<DiagnosticSignal[]> {
    const { studentTokens, correctTokens, question } = ctx;

    const signals: DiagnosticSignal[] = [];

    // 1. 執行舊有的 Registry 規則
    const ruleCtx = { studentTokens, correctTokens, question };
    for (const rule of getGrammarRules(question.concept)) {
      const result = rule(ruleCtx);
      signals.push(...result);
    }

    // 2. 執行 NLP 增強驗證器
    signals.push(...validateSVA(studentTokens, correctTokens));
    signals.push(...validateTense(studentTokens, correctTokens));
    signals.push(...validateGerundInfinitive(studentTokens, correctTokens));
    signals.push(...validateDoubleNegative(studentTokens, correctTokens));

    // 過濾 UNKNOWN_ERROR 並回傳
    return signals.filter((s) => s.code !== 'UNKNOWN_ERROR');
  },
};