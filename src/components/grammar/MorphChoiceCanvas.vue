<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Chunk, GrammarQuestionData } from '../../rules/types';
import TileSentenceCanvas from './TileSentenceCanvas.vue';

const props = defineProps<{
  question: GrammarQuestionData;
  initialChunks: Chunk[];
  speechRate?: number;
  strategy: 'timeline' | 'gauge';
  fixedMorph?: boolean;
}>();

const emit = defineEmits<{
  (e: 'success'): void;
  (e: 'misconception', code: string): void;
  (e: 'continue'): void;
}>();

const isIrrealis = ref(false);

const toggleGravity = () => {
  isIrrealis.value = !isIrrealis.value;
};

const adjustedChunks = computed(() => {
  return props.initialChunks.map(chunk => {
    const newChunk = { ...chunk };
    if (isIrrealis.value) {
      if (newChunk.text === 'am') newChunk.text = 'were';
      if (newChunk.text === 'will') newChunk.text = 'would';
    }
    return newChunk;
  });
});
</script>

<template>
  <section class="morph-strategy" :class="{ 'gravity-irreal': isIrrealis }">
    <div v-if="strategy === 'timeline' && ['SUBJUNCTIVE', 'CONDITIONALS'].includes(question.concept ?? '')"
      class="gravity-control">
      <span>{{ isIrrealis ? '🌌 假設模式：非現實語境' : '🌍 現實模式：真實發生' }}</span>
      <button type="button" role="switch" :aria-checked="isIrrealis" @click="toggleGravity">
        {{ isIrrealis ? '切回現實' : '切換假設模式' }}
      </button>
    </div>

    <div v-if="strategy === 'timeline'" class="grammar-landmarks">
      <div class="landmark-item" v-for="chunk in initialChunks.filter(c => c.can_morph)" :key="chunk.id">
        <span class="lm-from">{{ chunk.text }}</span>
        <span class="lm-arrow">➔</span>
        <span class="lm-to">{{ isIrrealis ? '非現實' : '現實' }}</span>
      </div>
    </div>

    <div v-if="strategy === 'timeline' || strategy === 'gauge'" class="timeline-controls">
      <input type="range" min="0" max="1" step="1" aria-label="Time Range 1" />
      <input type="range" min="0" max="1" step="1" aria-label="Time Range 2" />
    </div>
    <div v-if="question.concept === 'MODAL_VERB'" class="gauge-title">情態語氣壓力計</div>

    <TileSentenceCanvas :key="String(isIrrealis)" :question="question" :initial-chunks="adjustedChunks"
      :speech-rate="speechRate" :fixed-morph="true" @success="emit('success')"
      @misconception="emit('misconception', $event)" @continue="emit('continue')" />
  </section>
</template>

<style scoped>
.morph-strategy {
  display: flex;
  flex-direction: column;
  gap: 16px;
  transition: all .4s ease;
}

.gravity-control {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 16px;
  border: 1px solid #cbd5e1;
  border-radius: 14px;
  background: #e2e8f0;
  transition: all .4s ease;
}

.gravity-control button {
  border: 0;
  border-radius: 999px;
  padding: 9px 14px;
  background: #7c3aed;
  color: #fff;
  cursor: pointer;
  font-weight: 700;
  transition: all .2s;
}

.gravity-control button:hover {
  background: #6d28d9;
}

/* 失重模式 */
.gravity-irreal {
  padding: 18px;
  border-radius: 20px;
  background-color: #111827;
  background-image: linear-gradient(135deg, #1e1b4b, #111827 60%, #312e81);
  box-shadow: 0 16px 36px #0f172a55;
}

.gravity-irreal .gravity-control {
  border-color: #a78bfa;
  background: #4c1d95aa;
  color: #f8fafc;
}

.grammar-landmarks {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 16px;
  margin-bottom: 16px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 12px;
  border: 1px dashed #cbd5e1;
}

.landmark-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1rem;
  font-weight: bold;
}

.lm-from {
  color: #64748b;
  text-decoration: line-through;
}

.lm-arrow {
  color: #94a3b8;
}

.lm-to {
  color: #1cb0f6;
  background: #e0f2fe;
  padding: 2px 8px;
  border-radius: 6px;
}

.timeline-controls {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.gauge-title {
  font-weight: bold;
  color: #7c3aed;
  margin-bottom: 10px;
  text-align: center;
}
</style>