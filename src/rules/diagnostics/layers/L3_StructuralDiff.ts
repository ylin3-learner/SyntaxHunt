import type { DiagnosticLayer, DiagnosticContext, DiagnosticSignal } from '../../types';
import { computeTokenDiff, diffToSignals } from '../../../utils/textDiff';
import { findVerbPair } from '../../verbTable';

const RELATIVE_PRONOUNS = new Set(['who', 'which', 'that']);
const SUBJECT_PRONOUNS = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they']);
const AUXILIARIES = new Set([
  'is', 'are', 'was', 'were', 'am', 'do', 'does', 'did',
  'has', 'have', 'had', 'will', 'can',
]);
const DETERMINERS = new Set(['a', 'an', 'the']);
const PREPOSITIONS = new Set([
  'in', 'on', 'at', 'under', 'behind', 'with', 'by', 'next', 'across',
  'near', 'from', 'over', 'above', 'beside', 'between', 'inside', 'outside',
]);
const IRREGULAR_VERB_FORMS = new Set([
  'went', 'gone', 'saw', 'seen', 'ate', 'eaten', 'did', 'done', 'had',
  'made', 'took', 'taken', 'wrote', 'written', 'ran',
]);

/**
 * L3 結構比對層
 * 使用 LCS 演算法比對學生與正確答案的 token 差異，
 * 推斷遺漏 (M:)、多餘 (U:)、替換 (R:)、語序 (O:) 錯誤
 */
export const L3StructuralDiff: DiagnosticLayer = {
  id: 'L3_StructuralDiff',
  priority: 30,

  async diagnose(ctx: DiagnosticContext): Promise<DiagnosticSignal[]> {
    const { studentTokens, correctTokens } = ctx;

    const diff = computeTokenDiff(studentTokens, correctTokens);
    const rawSignals = diffToSignals(diff, studentTokens, correctTokens, {
      relativePronouns: RELATIVE_PRONOUNS,
      subjectPronouns: SUBJECT_PRONOUNS,
      auxiliaries: AUXILIARIES,
      determiners: DETERMINERS,
      prepositions: PREPOSITIONS,
      findVerbPair,
      irregularVerbForms: IRREGULAR_VERB_FORMS,
    });

    return rawSignals.map((s) => ({
      code: s.code,
      sst: s.sst,
      index: s.index,
      message: s.message,
      hint: s.hint,
      source: 'structural' as const,
    })).filter((s) => s.code !== 'UNKNOWN_ERROR');
  },
};