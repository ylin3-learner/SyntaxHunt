<script setup lang="ts">
import type { Chunk, GrammarQuestionData } from '../../rules/types';
import LegacyGrammarCanvas from '../LegacyGrammarCanvas.vue';

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
  <section class="timeline-morph-canvas">
    <header class="timeline-morph-header">
      <strong>句子變形</strong>
      <span>點擊句中的變形字詞選擇答案。</span>
    </header>
    <LegacyGrammarCanvas :question="question" :initial-chunks="initialChunks" :speech-rate="speechRate"
      fixed-morph @success="emit('success')" @misconception="emit('misconception', $event)"
      @continue="emit('continue')" />
  </section>
</template>

<style scoped>
.timeline-morph-canvas {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.timeline-morph-header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px;
  padding: 14px 18px;
  border-radius: 14px;
  background: #edf7ff;
  color: #15507a;
}

.timeline-morph-header span {
  color: #526879;
}
</style>
