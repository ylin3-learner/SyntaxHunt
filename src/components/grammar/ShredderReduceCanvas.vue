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
  <section class="shredder-canvas">
    <div class="shredder-prompt" aria-hidden="true">
      <span>保留必要結構</span><span class="shredder-icon">▤</span><span>碎紙機：移除多餘片語</span>
    </div>
    <LegacyGrammarCanvas :question="question" :initial-chunks="initialChunks" :speech-rate="speechRate"
      @success="emit('success')" @misconception="emit('misconception', $event)"
      @continue="emit('continue')" />
  </section>
</template>

<style scoped>
.shredder-canvas { display: flex; flex-direction: column; gap: 10px; }
.shredder-prompt { display: flex; justify-content: center; align-items: center; gap: 14px; color: #536276; font-weight: 700; }
.shredder-icon { display: grid; place-items: center; width: 56px; height: 40px; border-radius: 7px 7px 14px 14px; background: repeating-linear-gradient(90deg, #f8a4a4 0 5px, #f4d0d0 5px 9px); color: #9e2525; font-size: 1.5rem; }
</style>
