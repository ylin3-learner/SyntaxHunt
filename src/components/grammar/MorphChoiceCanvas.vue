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

// 切換現實/假設模式 (只有 GRAVITY_SWITCH 會用到)
const toggleGravity = () => {
  isIrrealis.value = !isIrrealis.value;
};

// 根據是否為假設模式，調整傳入底層的字塊
const adjustedChunks = computed(() => {
  return props.initialChunks.map(chunk => {
    return { ...chunk };
  });
});
</script>

<template>
  <section class="morph-strategy" :class="{ 'gravity-irreal': isIrrealis }">
    <!-- 只有在 GRAVITY_SWITCH 情境才顯示切換開關 -->
    <div v-if="strategy === 'timeline' && ['SUBJUNCTIVE', 'CONDITIONALS'].includes(question.concept ?? '')"
      class="gravity-control">
      <span>{{ isIrrealis ? '🌌 假設模式：非現實語境' : '🌍 現實模式：真實發生' }}</span>
      <button type="button" role="switch" :aria-checked="isIrrealis" @click="toggleGravity">
        {{ isIrrealis ? '切回現實' : '切換假設模式' }}
      </button>
    </div>

    <!-- 這裡原本的 grammar-landmarks (go -> 現實) 已移除 -->

    <!-- 其他全部交給底層的 TileSentenceCanvas，它會處理膠囊與下拉選單 -->
    <TileSentenceCanvas :question="question" :initial-chunks="adjustedChunks" :speech-rate="speechRate"
      :fixed-morph="true" :is-irrealis="isIrrealis" @success="emit('success')"
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
</style>