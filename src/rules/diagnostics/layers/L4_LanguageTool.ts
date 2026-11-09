import type { DiagnosticLayer, DiagnosticContext, DiagnosticSignal } from '../../types';
import { CloudDatabase } from '../../../services/CloudDatabase';
import { mapOffsetToChunkIndex } from '../../../utils/textUtils';

const LANGUAGE_TOOL_TIMEOUT_MS = 8000;

/**
 * L4 遠端 LanguageTool 層
 * 呼叫自架的 LanguageTool 進行深層語意檢查
 * 超時或錯誤時回傳空陣列，不拋出例外，讓管線繼續往下走
 */
export const L4LanguageTool: DiagnosticLayer = {
  id: 'L4_LanguageTool',
  priority: 40,

  async diagnose(ctx: DiagnosticContext): Promise<DiagnosticSignal[]> {
    const { studentTokens, question } = ctx;

    // 組裝提交文字 (去除中括號)
    const answerText = studentTokens.map((t) => t.replace(/[\[\]]/g, '')).join(' ');

    let submittedText = answerText;
    const cloze = question?.contextCloze;
    if (cloze) {
      const prefix = cloze.prefix || '';
      const suffix = cloze.suffix || '';
      submittedText = `${prefix} ${answerText} ${suffix}`.replace(/\s+/g, ' ').trim();
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LANGUAGE_TOOL_TIMEOUT_MS);

    try {
      const matches = await CloudDatabase.checkLanguageTool(
        submittedText,
        controller.signal
      );

      const prefixLength = cloze && cloze.prefix ? cloze.prefix.length + 1 : 0;

      return matches.map((match) => {
        const relativeOffset = Math.max(0, match.offset - prefixLength);
        return {
          code: match.rule.id,
          source: 'languagetool' as const,
          ruleId: match.rule.id,
          category: match.rule.category?.name,
          offset: relativeOffset,
          length: match.length,
          index: mapOffsetToChunkIndex(
            submittedText,
            relativeOffset,
            match.length,
            studentTokens.map((t) => t.replace(/[\[\]]/g, ''))
          ),
          message: match.message,
          replacements: match.replacements,
          nativeMatch: match,
        } as DiagnosticSignal;
      });
    } catch (error) {
      // 超時或網路錯誤：回傳空陣列，讓管線繼續往下走到 L5 進行兜底高亮
      return [];
    } finally {
      clearTimeout(timeout);
    }
  },
};