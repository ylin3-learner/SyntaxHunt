<script setup lang="ts">
import { computed, reactive } from 'vue';
import type { Chunk, GrammarQuestionData } from '../../rules/types';
import LegacyGrammarCanvas from '../LegacyGrammarCanvas.vue';

const props = defineProps<{
  question: GrammarQuestionData;
  initialChunks: Chunk[];
  speechRate?: number;
  strategy: 'timeline' | 'gauge';
}>();

const emit = defineEmits<{
  (e: 'success'): void;
  (e: 'misconception', code: string): void;
  (e: 'continue'): void;
}>();

const selectedForms = reactive<Record<string, string>>({});

const optionsFor = (chunk: Chunk): string[] => {
  const options = chunk.options ?? chunk.morph_options ?? [];
  return options.includes(chunk.text) ? [...new Set(options)] : [chunk.text, ...new Set(options)];
};

const modalStrength: Record<string, number> = {
  might: 1,
  could: 2,
  may: 3,
  can: 4,
  would: 5,
  should: 6,
  will: 7,
  must: 8,
};

const tenseRank = (form: string): number => {
  const normalized = form.toLowerCase();
  if (/\bwill\b/.test(normalized)) return 4;
  if (/\b(?:gone|eaten|seen|done|written|taken)\b/.test(normalized)) return 3;
  if (/\b\w+ing\b/.test(normalized)) return 2;
  if (/\b(?:went|ate|saw|did|made|took|ran|was|were)\b/.test(normalized) || /\w+ed\b/.test(normalized)) return 0;
  return 1;
};

const orderedOptions = (chunk: Chunk): string[] => {
  const options = optionsFor(chunk);
  return props.strategy === 'gauge'
    ? options.sort((left, right) =>
        (modalStrength[left.toLowerCase()] ?? 0) - (modalStrength[right.toLowerCase()] ?? 0)
      )
    : options.sort((left, right) => tenseRank(left) - tenseRank(right));
};

const formValue = (chunk: Chunk): string => selectedForms[chunk.id] ?? chunk.text;

const selectedIndex = (chunk: Chunk): number => {
  const options = orderedOptions(chunk);
  const index = options.indexOf(formValue(chunk));
  return index < 0 ? 0 : index;
};

const adjustedChunks = computed(() => props.initialChunks.map(chunk => {
  const options = optionsFor(chunk);
  const text = formValue(chunk);
  return {
    ...chunk,
    text,
    options,
    current_index: Math.max(0, options.indexOf(text)),
    can_morph: chunk.can_morph || options.length > 1,
  };
}));

const canvasKey = computed(() =>
  adjustedChunks.value.map(chunk => `${chunk.id}:${chunk.text}`).join('|')
);

const selectForm = (chunk: Chunk, index: number) => {
  const options = orderedOptions(chunk);
  selectedForms[chunk.id] = options[index] ?? chunk.text;
};

const strategyTitle = computed(() => props.strategy === 'timeline' ? '時態時間軸' : '情態語氣壓力計');
const strategyHint = computed(() => props.strategy === 'timeline'
  ? '沿時間軸選擇動詞形式，再完成句子。'
  : '沿語氣強度選擇情態動詞，再完成句子。');
</script>

<template>
  <section class="morph-strategy">
    <header class="strategy-header">
      <strong>{{ strategyTitle }}</strong>
      <span>{{ strategyHint }}</span>
    </header>
    <div v-for="chunk in initialChunks.filter(item => item.can_morph || optionsFor(item).length > 1)"
      :key="chunk.id" class="strategy-control">
      <label :for="`morph-${chunk.id}`">
        {{ chunk.text }}
        <span class="selected-form">→ {{ formValue(chunk) }}</span>
      </label>
      <div class="range-axis">
        <span>{{ strategy === 'timeline' ? '過去' : '較委婉' }}</span>
        <input :id="`morph-${chunk.id}`" type="range" min="0"
          :max="Math.max(0, orderedOptions(chunk).length - 1)" :value="selectedIndex(chunk)"
          :aria-label="`${strategyTitle}：${chunk.text}`"
          @input="selectForm(chunk, Number(($event.target as HTMLInputElement).value))" />
        <span>{{ strategy === 'timeline' ? '未來／持續' : '較堅定' }}</span>
      </div>
    </div>
    <p v-if="!initialChunks.some(item => item.can_morph || optionsFor(item).length > 1)" class="strategy-empty">
      請先在題目中設定可變形字塊及選項。
    </p>
    <LegacyGrammarCanvas :key="canvasKey" :question="question" :initial-chunks="adjustedChunks"
      :speech-rate="speechRate" @success="emit('success')"
      @misconception="emit('misconception', $event)" @continue="emit('continue')" />
  </section>
</template>

<style scoped>
.morph-strategy { display: flex; flex-direction: column; gap: 16px; }
.strategy-header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; padding: 14px 18px; border-radius: 14px; background: #edf7ff; color: #15507a; }
.strategy-header span, .strategy-empty { color: #526879; }
.strategy-control { display: grid; gap: 8px; padding: 12px 16px; border: 1px solid #d5e0e8; border-radius: 14px; background: #fff; }
.strategy-control label { font-weight: 700; }
.selected-form { color: #7d3cb5; }
.range-axis { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; font-size: .85rem; }
.range-axis input { width: 100%; accent-color: #7d3cb5; }
.strategy-empty { margin: 0; }
</style>
