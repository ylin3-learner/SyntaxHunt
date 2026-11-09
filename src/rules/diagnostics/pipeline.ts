import type { DiagnosticLayer, DiagnosticContext, DiagnosticSignal } from '../types';

// 全局注册池
const globalLayers: DiagnosticLayer[] = [];

export function registerLayer(layer: DiagnosticLayer): () => void {
  globalLayers.push(layer);
  globalLayers.sort((a, b) => a.priority - b.priority);
  return () => {
    const idx = globalLayers.indexOf(layer);
    if (idx !== -1) globalLayers.splice(idx, 1);
  };
}

export function getRegisteredLayers(): DiagnosticLayer[] {
  return [...globalLayers];
}

/**
 * 执行诊断管線
 * @param ctx 诊断上下文
 * @param injectedLayers 测试或特殊场景可传入自订层级，若为空则使用全局注册池
 */
export async function runDiagnosisPipeline(
  ctx: DiagnosticContext,
  injectedLayers?: DiagnosticLayer[]
): Promise<DiagnosticSignal[]> {
  const layersToRun = injectedLayers ? [...injectedLayers].sort((a, b) => a.priority - b.priority) : globalLayers;

  for (const layer of layersToRun) {
    const signals = await layer.diagnose(ctx);

    // 忽略 UNKNOWN_ERROR 與 LT_ERROR，繼續往下層尋找；HIGHLIGHT_ONLY 是有效訊號，應直接回傳
    const validSignals = signals.filter(
      (s) => !['UNKNOWN_ERROR', 'LT_ERROR'].includes(s.code)
    );

    if (validSignals.length > 0) {
      return validSignals; // 命中確定性錯誤或特殊訊號，短路
    }
  }

  // 強制兜底：若所有層都回傳 UNKNOWN_ERROR（或空陣列），執行 L5
  const l5 = layersToRun.find((l) => l.id === 'L5_HighlightFallback') || globalLayers.find((l) => l.id === 'L5_HighlightFallback');
  if (l5) return l5.diagnose(ctx);

  return [];
}