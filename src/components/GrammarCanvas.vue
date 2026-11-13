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

const debugMisconception = (code: string) => {
  console.log(`🚨 [Trace-3: GrammarCanvas 收到並轉發] Code: ${code}`);
  emit('misconception', code);
};

const canvasMode = computed(() => getQuestionCanvasMode(props.question));

const selectedCanvas = computed(() => {
  const mode = canvasMode.value;
  const q = props.question;

  // 1. 特殊 Canvas 優先
  if (mode === 'MATRIX_GATE') return FeatureMatrixCanvas;
  if (mode === 'PRAGMATIC_HP') return PragmaticHpCanvas;
  if (mode === 'GRAVITY_SWITCH') return TimelineMorphCanvas;

  // 2. 絕對的 REDUCE 與 BUILD 路由 - 完全不依賴 chunks
  if (mode === 'REDUCE' || q.ui_mode === 'REDUCE') return ShredderReduceCanvas;
  if (mode === 'BUILD' || q.ui_mode === 'BUILD') return MagneticBuildCanvas;

  // 3. MORPH 或其他
  return TileSentenceCanvas;
});
</script>

<template>
  <component 
    :is="selectedCanvas" 
    :question="question" 
    :initial-chunks="initialChunks" 
    :speech-rate="speechRate"
    @success="emit('success')" 
    @misconception="debugMisconception" 
    @continue="emit('continue')" 
  />
</template>