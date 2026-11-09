import type { DiagnosticLayer, DiagnosticContext, DiagnosticSignal } from '../../types';
import { findDiffIndices } from '../../../utils/textDiff';

/**
 * L5 終極兜底層
 * 當所有前置層皆無法給出確定性診斷時，
 * 使用純 token 差異找出第一個不同的索引並標記高亮
 * 回傳 code='HIGHLIGHT_ONLY'，讓 UI 層知道只需要標紅而不顯示具體錯誤代碼
 */
export const L5HighlightFallback: DiagnosticLayer = {
  id: 'L5_HighlightFallback',
  priority: 50,

  async diagnose(ctx: DiagnosticContext): Promise<DiagnosticSignal[]> {
    const { studentTokens, correctTokens } = ctx;

    const diffIndices = findDiffIndices(studentTokens, correctTokens);

    if (diffIndices.length === 0) {
      return [];
    }

    return [
      {
        code: 'HIGHLIGHT_ONLY',
        message: '這裡的單字形式或順序好像不太對喔，再檢查看看！',
        hint: '請檢查該字塊的形式或位置是否正確。',
        source: 'fallback' as const,
        index: diffIndices[0],
      },
    ];
  },
};