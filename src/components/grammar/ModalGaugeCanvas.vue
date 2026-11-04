<script setup lang="ts">
import type { Chunk, GrammarQuestionData } from '../../rules/types';
import MorphChoiceCanvas from './MorphChoiceCanvas.vue';

defineProps<{
  question: GrammarQuestionData;
  initialChunks: Chunk[];
  speechRate?: number;
}>();

const emit = defineEmits<{
  (e: 'success'): void;
  (e: 'misconception', code: string): void;
  (e: 'continue'): void;
}>();
</script>

<template>
  <MorphChoiceCanvas :question="question" :initial-chunks="initialChunks" :speech-rate="speechRate"
    strategy="gauge" @success="emit('success')" @misconception="emit('misconception', $event)"
    @continue="emit('continue')" />
</template>
