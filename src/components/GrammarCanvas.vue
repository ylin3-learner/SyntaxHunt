<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import type { Chunk, GrammarQuestionData } from '../rules/types';
import { getQuestionCanvasMode } from '../rules/types';
import TileSentenceCanvas from './grammar/TileSentenceCanvas.vue';

const MagneticBuildCanvas = defineAsyncComponent(() => import('./grammar/MagneticBuildCanvas.vue'));
const FeatureMatrixCanvas = defineAsyncComponent(() => import('./grammar/FeatureMatrixCanvas.vue'));
const PragmaticHpCanvas = defineAsyncComponent(() => import('./grammar/PragmaticHpCanvas.vue'));
const ShredderReduceCanvas = defineAsyncComponent(() => import('./grammar/ShredderReduceCanvas.vue'));
const TimelineMorphCanvas = defineAsyncComponent(() => import('./grammar/TimelineMorphCanvas.vue'));
const ModalGaugeCanvas = defineAsyncComponent(() => import('./grammar/ModalGaugeCanvas.vue'));

const props = defineProps<{
  question: GrammarQuestionData;
  initialChunks: Chunk[];
  speechRate?: number;
}>();

const emit = defineEmits<{
  (e: 'success'): void;
  (e: 'misconception', code: string): void;
  (e: 'continue'): void;
}>();

const canvasMode = computed(() => getQuestionCanvasMode(props.question));

const selectedCanvas = computed(() => {
  const mode = canvasMode.value;
  const q = props.question;

  // 1. 明確 canvas_mode 指派（特殊畫布優先）
  if (mode === 'MATRIX_GATE') return FeatureMatrixCanvas;
  if (mode === 'PRAGMATIC_HP') return PragmaticHpCanvas;
  if (mode === 'GRAVITY_SWITCH') return TimelineMorphCanvas;

  // 檢查是否有 chunks
  const hasChunks = q.chunks && q.chunks.length > 0;

  // 2. 如果沒有 chunks，走專用的 REDUCE / BUILD 元件
  if (mode === 'REDUCE' && !hasChunks) return ShredderReduceCanvas;
  if (mode === 'BUILD' && !hasChunks) return MagneticBuildCanvas;

  // 3. 如果有 chunks，依賴 ui_mode 決定，但也保留 chunks 條件作為舊題庫相容
  if (q.ui_mode === 'REDUCE' && !hasChunks) return ShredderReduceCanvas;
  if (q.ui_mode === 'BUILD' && !hasChunks) return MagneticBuildCanvas;

  // 4. 保留部分舊題庫回退條件（有 chunks 的舊題目）
  const isUnspecifiedLegacyCanvas = !q.canvas_mode
    && !q.grammarTopicId
    && !q.concept
    && !q.matrix_config
    && !q.pragmatic_target
    && typeof q.status_gap !== 'number';

  if (isUnspecifiedLegacyCanvas) return TileSentenceCanvas;

  // 5. 最終預設
  return TileSentenceCanvas;
});
</script>

<template>
  <component :is="selectedCanvas" :question="question" :initial-chunks="initialChunks" :speech-rate="speechRate"
    @success="emit('success')" @misconception="emit('misconception', $event)" @continue="emit('continue')" />
</template>