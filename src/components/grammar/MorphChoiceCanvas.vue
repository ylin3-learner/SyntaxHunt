<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { getQuestionCanvasMode, type Chunk, type GrammarQuestionData } from '../../rules/types';
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

const selectedForms = reactive<Record<string, string>>({});
const savedRealisForms = reactive<Record<string, string>>({});
const isIrrealis = ref(false);

const optionsFor = (chunk: Chunk): string[] => {
  const options = chunk.options ?? chunk.morph_options ?? [];
  return options.includes(chunk.text) ? [...new Set(options)] : [chunk.text, ...new Set(options)];
};

const isIrrealisForm = (form: string): boolean => {
  const normalized = form.trim().toLowerCase();
  return /^(?:were|would|could|might|should|had|did|went|saw|ate|made|took|ran|was)$/.test(normalized)
    || /\w+ed$/.test(normalized);
};

const availableOptions = (chunk: Chunk): string[] => {
  const options = optionsFor(chunk);
  if (props.strategy !== 'timeline' || !isIrrealis.value
    || getQuestionCanvasMode(props.question) !== 'GRAVITY_SWITCH') return options;
  return options.filter(isIrrealisForm);
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
  const options = availableOptions(chunk);
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
  const options = availableOptions(chunk);
  const text = formValue(chunk);
  return {
    ...chunk,
    text,
    options,
    current_index: Math.max(0, options.indexOf(text)),
    can_morph: (chunk.can_morph || options.length > 1) && options.length > 0,
  };
}));

const canvasKey = computed(() =>
  adjustedChunks.value.map(chunk => `${chunk.id}:${chunk.text}`).join('|')
);

const selectForm = (chunk: Chunk, index: number) => {
  const options = orderedOptions(chunk);
  if (options[index]) selectedForms[chunk.id] = options[index];
};

const toggleGravity = () => {
  isIrrealis.value = !isIrrealis.value;
  props.initialChunks.forEach(chunk => {
    if (!chunk.can_morph && optionsFor(chunk).length < 2) return;
    if (isIrrealis.value) {
      savedRealisForms[chunk.id] = formValue(chunk);
      const eligible = optionsFor(chunk).filter(isIrrealisForm);
      if (eligible.length > 0) {
        selectedForms[chunk.id] = eligible.find(form => /^(?:were|would)$/.test(form.toLowerCase()))
          ?? eligible[0]!;
      }
    } else {
      selectedForms[chunk.id] = savedRealisForms[chunk.id] ?? chunk.text;
    }
  });
};

const strategyTitle = computed(() => props.strategy === 'timeline' ? '時態時間軸' : '情態語氣壓力計');
const strategyHint = computed(() => props.strategy === 'timeline'
  ? '沿時間軸選擇動詞形式；假設語氣可切換至失重模式。'
  : '沿語氣強度選擇情態動詞，再完成句子。');
</script>

<template>
  <section class="morph-strategy" :class="{ 'gravity-irreal': isIrrealis }">
    <header class="strategy-header">
      <strong>{{ strategyTitle }}</strong>
      <span>{{ strategyHint }}</span>
    </header>
    <div v-if="strategy === 'timeline' && ['SUBJUNCTIVE', 'CONDITIONALS'].includes(question.concept ?? '')"
      class="gravity-control">
      <span>{{ isIrrealis ? '🌌 假設模式：失重語氣' : '🌍 現實模式：腳踏實地' }}</span>
      <button type="button" role="switch" :aria-checked="isIrrealis" @click="toggleGravity">
        {{ isIrrealis ? '切回現實' : '切換假設模式' }}
      </button>
    </div>
    <div v-for="chunk in initialChunks.filter(item => item.can_morph || optionsFor(item).length > 1)"
      :key="chunk.id" class="strategy-control">
      <label :for="`morph-${chunk.id}`">
        {{ chunk.text }}
        <span class="selected-form">→ {{ formValue(chunk) }}</span>
      </label>
      <div v-if="strategy === 'timeline'" class="timeline-labels" aria-hidden="true">
        <span>過去 Past</span><span>現在 Now</span><span>未來 Future</span>
      </div>
      <div class="range-axis">
        <span>{{ strategy === 'timeline' ? (orderedOptions(chunk)[0] ?? '無可用形式') : '較委婉' }}</span>
        <input :id="`morph-${chunk.id}`" type="range" min="0"
          :max="Math.max(0, orderedOptions(chunk).length - 1)" :value="selectedIndex(chunk)"
          :disabled="orderedOptions(chunk).length === 0"
          :aria-label="`${strategyTitle}：${chunk.text}`"
          @input="selectForm(chunk, Number(($event.target as HTMLInputElement).value))" />
        <span>{{ strategy === 'timeline' ? (orderedOptions(chunk)[orderedOptions(chunk).length - 1] ?? '無可用形式') : '較堅定' }}</span>
      </div>
      <small v-if="isIrrealis && availableOptions(chunk).length === 0" class="gravity-warning">
        這個字塊沒有提供假設語氣所需的過去式／would 形式。
      </small>
    </div>
    <p v-if="!initialChunks.some(item => item.can_morph || optionsFor(item).length > 1)" class="strategy-empty">
      請先在題目中設定可變形字塊及選項。
    </p>
    <TileSentenceCanvas :key="canvasKey" :question="question" :initial-chunks="adjustedChunks"
      :speech-rate="speechRate" :fixed-morph="fixedMorph" @success="emit('success')"
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
.timeline-labels { display: grid; grid-template-columns: 1fr 1fr 1fr; color: #526879; font-size: .8rem; text-align: center; }
.timeline-labels span:first-child { text-align: left; }
.timeline-labels span:last-child { text-align: right; }
.gravity-control { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 16px; border: 1px solid #cbd5e1; border-radius: 14px; background: #e2e8f0; transition: all .3s ease; }
.gravity-control button { border: 0; border-radius: 999px; padding: 9px 14px; background: #7c3aed; color: #fff; cursor: pointer; font-weight: 700; }
.gravity-irreal { min-height: 100%; padding: 18px; border-radius: 20px; background-color: #111827; background-image: linear-gradient(135deg, #1e1b4b, #111827 60%, #312e81); color: #f8fafc; box-shadow: 0 16px 36px #0f172a55; }
.gravity-irreal .strategy-header, .gravity-irreal .strategy-control { border-color: #7c3aed; background: #312e8155; color: #f8fafc; box-shadow: 0 0 14px #8b5cf655; }
.gravity-irreal .strategy-header span, .gravity-irreal .strategy-empty, .gravity-irreal .timeline-labels { color: #c4b5fd; }
.gravity-irreal .gravity-control { border-color: #a78bfa; background: #4c1d95aa; }
.gravity-warning { color: #fca5a5; }
.strategy-empty { margin: 0; }
</style>
