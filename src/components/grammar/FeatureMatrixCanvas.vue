<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import type { Chunk, GrammarQuestionData } from '../../rules/types';
import { shuffleArray } from '../../utils/shuffle';

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

const selectedX = ref<number | null>(null);
const selectedY = ref<number | null>(null);
const unlocked = ref(false);
const selectedAnswer = ref(false);
const hint = ref('');
const matrixConfig = computed(() => props.question.matrix_config);
const matrixAnswer = computed(() => matrixConfig.value?.answer ?? props.question.matrix_answer ?? '');
const correctX = computed(() => matrixConfig.value?.correctX ?? props.question.correct_x);
const correctY = computed(() => matrixConfig.value?.correctY ?? props.question.correct_y);

const axisX = computed(() => matrixConfig.value?.xOptions ?? props.question.matrix_x ?? []);
const axisY = computed(() => matrixConfig.value?.yOptions ?? props.question.matrix_y ?? []);
const isConfigured = computed(() => axisX.value.length === 2
  && axisY.value.length === 2
  && (correctX.value === 0 || correctX.value === 1)
  && (correctY.value === 0 || correctY.value === 1)
  && Boolean(matrixAnswer.value.trim())
  && (matrixConfig.value?.options ?? props.question.matrix_options ?? [])
    .some(option => option.trim().toLowerCase() === matrixAnswer.value.trim().toLowerCase()));
const options = computed(() => shuffleArray([...new Set([
  ...(matrixConfig.value?.options ?? props.question.matrix_options ?? []),
  matrixAnswer.value,
].filter(Boolean))]));

let successTimeout: ReturnType<typeof setTimeout> | undefined;

onBeforeUnmount(() => {
  if (successTimeout) clearTimeout(successTimeout);
});

const selectAxis = (axis: 'x' | 'y', index: number) => {
  if (axis === 'x') selectedX.value = index;
  else selectedY.value = index;
  unlocked.value = false;
  selectedAnswer.value = false;
  hint.value = '';
};

const checkMatrix = () => {
  const isCorrect = selectedX.value === correctX.value && selectedY.value === correctY.value;
  if (!isCorrect) {
    hint.value = '🔍 觀察句子線索，再判斷兩個特徵。字卡仍維持鎖定。';
    return;
  }
  unlocked.value = true;
  hint.value = '🔓 特徵解碼正確！選擇符合這組特徵的動詞。';
};

const chooseAnswer = (choice: string) => {
  if (!unlocked.value || selectedAnswer.value
    || choice.trim().toLowerCase() !== matrixAnswer.value.trim().toLowerCase()) return;
  selectedAnswer.value = true;
  hint.value = '';
  successTimeout = setTimeout(() => emit('success'), 900);
};
</script>

<template>
  <section class="feature-matrix">
    <header class="matrix-header">
      <strong>特徵解鎖矩陣</strong>
      <span>先判斷句子中的主詞與花費類型，再解鎖動詞卡。</span>
    </header>

    <p v-if="!isConfigured" class="matrix-error" role="alert">
      此題的特徵矩陣設定不完整，請回到教師端檢查兩軸、正解與選項字卡。
    </p>
    <template v-else>
    <p class="matrix-prompt">{{ matrixConfig?.prompt || question.matrix_prompt || '請根據句子判斷兩個特徵。' }}</p>
    <div class="matrix-axes" :class="{ unlocked }">
      <fieldset>
        <legend>特徵 X</legend>
        <button v-for="(label, index) in axisX" :key="`x-${index}`" type="button"
          :aria-pressed="selectedX === index" :class="{ selected: selectedX === index }"
          @click="selectAxis('x', index)">
          {{ label }}
        </button>
      </fieldset>
      <fieldset>
        <legend>特徵 Y</legend>
        <button v-for="(label, index) in axisY" :key="`y-${index}`" type="button"
          :aria-pressed="selectedY === index" :class="{ selected: selectedY === index }"
          @click="selectAxis('y', index)">
          {{ label }}
        </button>
      </fieldset>
      <button type="button" class="decode-button" :disabled="selectedX === null || selectedY === null"
        @click="checkMatrix">
        {{ unlocked ? '特徵已解鎖' : '解碼特徵' }}
      </button>
    </div>

    <p v-if="hint" class="matrix-hint" :class="{ success: unlocked }" role="status">{{ hint }}</p>
    <div class="matrix-word-bank" aria-label="特徵動詞字卡">
      <button v-for="option in options" :key="option" type="button"
        :disabled="!unlocked || option.trim().toLowerCase() !== matrixAnswer.trim().toLowerCase()"
        :class="{ correct: unlocked && option.trim().toLowerCase() === matrixAnswer.trim().toLowerCase(), selected: selectedAnswer && option.trim().toLowerCase() === matrixAnswer.trim().toLowerCase() }"
        @click="chooseAnswer(option)">
        {{ option }}
      </button>
    </div>
    <p v-if="selectedAnswer" class="matrix-result" role="status">
      ✅ 正確句型：{{ question.correctAnswer.join(' ') }}
    </p>
    </template>
  </section>
</template>

<style scoped>
.feature-matrix { display: flex; flex-direction: column; gap: 14px; }
.matrix-header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; padding: 14px 18px; border-radius: 14px; background: #fff1f2; color: #9f1239; }
.matrix-header span, .matrix-hint { color: #526879; }
.matrix-error { margin: 0; padding: 12px; border-radius: 12px; background: #fee2e2; color: #991b1b; }
.matrix-prompt { margin: 0; padding: 12px 16px; border-radius: 12px; background: #f8fafc; font-weight: 700; }
.matrix-axes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 14px; border: 2px solid #ef4444; border-radius: 16px; background: #fff7f7; }
.matrix-axes.unlocked { border-color: #22c55e; background: #f0fdf4; }
.matrix-axes fieldset { display: flex; flex-wrap: wrap; gap: 8px; min-width: 0; border: 0; padding: 0; }
.matrix-axes legend { width: 100%; margin-bottom: 8px; font-weight: 700; }
.matrix-axes button, .matrix-word-bank button { padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 12px; background: #fff; cursor: pointer; }
.matrix-axes button.selected { border-color: #7c3aed; background: #ede9fe; color: #5b21b6; }
.matrix-axes .decode-button { grid-column: 1 / -1; border: 0; background: #7c3aed; color: #fff; font-weight: 700; }
.matrix-axes .decode-button:disabled { opacity: .5; cursor: not-allowed; }
.matrix-hint { margin: 0; }
.matrix-hint.success { color: #15803d; font-weight: 700; }
.matrix-word-bank { display: flex; flex-wrap: wrap; gap: 8px; }
.matrix-word-bank button:disabled { opacity: .35; filter: grayscale(1); cursor: not-allowed; }
.matrix-word-bank button.correct { border-color: #38bdf8; background: #e0f2fe; color: #0369a1; box-shadow: 0 0 14px #7dd3fc; }
.matrix-word-bank button.selected { outline: 2px solid #0284c7; }
.matrix-result { margin: 0; padding: 14px 18px; border-radius: 12px; background: #f0fdf4; color: #166534; font-weight: 700; }
@media (max-width: 560px) { .matrix-axes { grid-template-columns: 1fr; } }
</style>
