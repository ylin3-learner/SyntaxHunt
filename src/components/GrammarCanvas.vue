<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import type { Chunk, GrammarQuestionData } from '../rules/types';
import { getQuestionCanvasMode } from '../rules/types';
import { getGrammarTopic } from '../rules/grammarTopics';
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

  // 👈 修正：只有 BUILD 或 REDUCE，且有 chunks，才強制走 TileSentenceCanvas
  if ((mode === 'BUILD' || mode === 'REDUCE') && props.question.chunks && props.question.chunks.length > 0) {
    return TileSentenceCanvas;
  }

  const isUnspecifiedLegacyCanvas = !props.question.canvas_mode
    && !props.question.grammarTopicId
    && (mode === 'BUILD' || mode === 'REDUCE')
    && !props.question.concept
    && !props.question.matrix_config
    && !props.question.pragmatic_target
    && typeof props.question.status_gap !== 'number';

  if (isUnspecifiedLegacyCanvas) return TileSentenceCanvas;
  if (mode === 'MATRIX_GATE') return FeatureMatrixCanvas;
  if (mode === 'PRAGMATIC_HP') return PragmaticHpCanvas;
  if (mode === 'GRAVITY_SWITCH') return TimelineMorphCanvas;

  if (mode === 'MORPH') {
    if (props.question.concept === 'MODAL_VERB'
      && !props.question.canvas_mode && !props.question.pragmatic_target
      && typeof props.question.status_gap !== 'number') return ModalGaugeCanvas;
    if (props.question.grammarTopicId || [
      'SUBJECT_VERB_AGREEMENT', 'TENSE_ASPECT', 'PAST_TENSE',
      'SUBJUNCTIVE', 'CONDITIONALS',
    ].includes(props.question.concept ?? '')) return TimelineMorphCanvas;
    return TileSentenceCanvas;
  }

  if (mode === 'REDUCE') return ShredderReduceCanvas;
  if (mode === 'BUILD') return MagneticBuildCanvas;

  return TileSentenceCanvas;
});
</script>

<template>
  <component :is="selectedCanvas" :question="question" :initial-chunks="initialChunks" :speech-rate="speechRate"
    @success="emit('success')" @misconception="emit('misconception', $event)" @continue="emit('continue')" />
</template>