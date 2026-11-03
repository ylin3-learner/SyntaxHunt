<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import type { Chunk, GrammarQuestionData } from '../rules/types';
import LegacyGrammarCanvas from './LegacyGrammarCanvas.vue';

const MagneticBuildCanvas = defineAsyncComponent(() => import('./grammar/MagneticBuildCanvas.vue'));
const ModalGaugeCanvas = defineAsyncComponent(() => import('./grammar/ModalGaugeCanvas.vue'));
const ShredderReduceCanvas = defineAsyncComponent(() => import('./grammar/ShredderReduceCanvas.vue'));
const TimelineMorphCanvas = defineAsyncComponent(() => import('./grammar/TimelineMorphCanvas.vue'));

const props = defineProps<{
  question: GrammarQuestionData;
  initialChunks: Chunk[];
  speechRate?: number;
}>();

const emit = defineEmits<{
  (e: 'success'): void;
  (e: 'misconception', code: string): void;
}>();

const selectedCanvas = computed(() => {
  const { concept, ui_mode: uiMode } = props.question;
  if (!concept) return LegacyGrammarCanvas;
  if (concept === 'MODAL_VERB') return ModalGaugeCanvas;
  if (uiMode === 'REDUCE') return ShredderReduceCanvas;
  if (uiMode === 'MORPH' && [
    'SUBJECT_VERB_AGREEMENT',
    'TENSE_ASPECT',
    'SUBJUNCTIVE',
    'CONDITIONALS',
  ].includes(concept)) return TimelineMorphCanvas;
  if (uiMode === 'BUILD') return MagneticBuildCanvas;
  return LegacyGrammarCanvas;
});
</script>

<template>
  <component
    :is="selectedCanvas"
    :question="question"
    :initial-chunks="initialChunks"
    :speech-rate="speechRate"
    @success="emit('success')"
    @misconception="emit('misconception', $event)"
  />
</template>
