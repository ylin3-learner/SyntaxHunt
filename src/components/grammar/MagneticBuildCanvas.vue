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
}>();
</script>

<template>
  <section class="magnetic-canvas">
    <div class="magnetic-prompt"><span aria-hidden="true">🧲</span>將語序卡片吸附到正確句型位置</div>
    <LegacyGrammarCanvas :question="question" :initial-chunks="initialChunks" :speech-rate="speechRate"
      @success="emit('success')" @misconception="emit('misconception', $event)" />
  </section>
</template>

<style scoped>
.magnetic-canvas { display: flex; flex-direction: column; gap: 10px; }
.magnetic-prompt { padding: 12px 16px; border: 1px solid #cad6f0; border-radius: 14px; background: #f0f3ff; color: #4352a3; font-weight: 700; }
.magnetic-prompt span { margin-right: 8px; }
.magnetic-canvas :deep(.answer-slot) { border: 1px dashed #9ca9db; border-radius: 12px; background: #f7f8ff; }
.magnetic-canvas :deep(.tile) { box-shadow: 0 5px 0 #bac6e8; }
</style>
