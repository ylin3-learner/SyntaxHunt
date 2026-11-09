import type { DiagnosticLayer, DiagnosticContext, DiagnosticSignal } from '../../types';
import { getGrammarRules } from '../../registry';
import '../../grammarRules';

/**
 * L1 本地確定性規則層
 * 包裝既有的 grammarRules.ts 註冊規則引擎
 * 僅回傳非 UNKNOWN_ERROR 的確定性診斷
 */
export const L1LocalRules: DiagnosticLayer = {
  id: 'L1_LocalRules',
  priority: 10,

  async diagnose(ctx: DiagnosticContext): Promise<DiagnosticSignal[]> {
    const { studentTokens, correctTokens, question } = ctx;

    // 建立與舊 RuleContext 相容的上下文
    const ruleCtx = { studentTokens, correctTokens, question };

    const signals: DiagnosticSignal[] = [];
    for (const rule of getGrammarRules(question.concept)) {
      const result = rule(ruleCtx);
      signals.push(...result);
    }

    // 只回傳確定性診斷，過濾掉 UNKNOWN_ERROR
    return signals.filter((s) => s.code !== 'UNKNOWN_ERROR');
  },
};