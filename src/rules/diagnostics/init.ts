import { registerLayer } from './pipeline';
import { L1LocalRules } from './layers/L1_LocalRules';
import { L2CustomRules } from './layers/L2_CustomRules';
import { L3StructuralDiff } from './layers/L3_StructuralDiff';
import { L4LanguageTool } from './layers/L4_LanguageTool';
import { L5HighlightFallback } from './layers/L5_HighlightFallback';
import '../grammarRules'; // 關鍵：確保文法規則被註冊

export function initDiagnosticPipeline() {
    registerLayer(L1LocalRules);
    registerLayer(L2CustomRules);
    registerLayer(L3StructuralDiff);
    registerLayer(L4LanguageTool);
    registerLayer(L5HighlightFallback);
}