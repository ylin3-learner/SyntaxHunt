<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import type { Chunk, GrammarQuestionData } from '../../rules/types';
import { normalizeAnswer } from '../../utils/textUtils';
import { shuffleArray } from '../../utils/shuffle';

const props = defineProps<{
  question: GrammarQuestionData;
  initialChunks: Chunk[];
}>();

const emit = defineEmits<{
  (e: 'success'): void;
  (e: 'misconception', code: string): void;
  (e: 'continue'): void;
}>();

const selectedChunks = ref<Chunk[]>([]);
const hitPoints = ref(100);
const feedback = ref('');
const impact = ref('');
const isSuccess = ref(false);
const scoredSubmissions = new Set<string>();
let successTimeout: ReturnType<typeof setTimeout> | undefined;

const normalize = (text: string) => normalizeAnswer(text);
const wordBank = computed(() => {
  const chunks = props.initialChunks.map(chunk => ({ ...chunk }));
  const available = new Map<string, number>();
  chunks.forEach(chunk => {
    const key = normalize(chunk.text);
    available.set(key, (available.get(key) ?? 0) + 1);
  });
  props.question.correctAnswer.forEach((text, index) => {
    const key = normalize(text);
    const count = available.get(key) ?? 0;
    if (count > 0) {
      available.set(key, count - 1);
      return;
    }
    chunks.push({
      id: `${props.question.id}-pragmatic-answer-${index}`,
      text,
      draggable: true,
    });
  });
  return shuffleArray(chunks);
});

const sentence = computed(() => selectedChunks.value.map(chunk => chunk.text).join(' '));
const avatar = computed(() => hitPoints.value > 80 ? '😄'
  : hitPoints.value > 60 ? '🙂'
    : hitPoints.value > 40 ? '😐'
      : hitPoints.value > 20 ? '😠' : '🤬');
const barColor = computed(() => hitPoints.value > 60 ? '#22c55e'
  : hitPoints.value > 30 ? '#f59e0b' : '#ef4444');
const pragmaticTarget = computed(() => props.question.pragmatic_target
  ?? { statusGap: props.question.status_gap ?? 0 });
const statusLabel = computed(() => pragmaticTarget.value.statusGap > 0
  ? `Status: 學生 (You) ➡️ ${pragmaticTarget.value.npcLabel || '上級'} (NPC) [地位差距：高]`
  : 'Status: 同儕對話');

const scoreTone = (text: string) => {
  const normalized = text.toLowerCase();
  if (/\b(?:could|would)\s+you\b/.test(normalized) || /\bplease\b/.test(normalized)) {
    return { change: 20, message: '語氣得體，關係有所改善。' };
  }
  const strongCommand = /\b(?:must|need to|have to)\b/.test(normalized)
    || /^(?:you\s+)?(?:check|send|give|do|finish|tell|help)\b/i.test(text.trim());
  if (strongCommand && pragmaticTarget.value.statusGap > 0 && !/\bplease\b/i.test(normalized)) {
    const damage = Math.min(100, 65 + 20 * pragmaticTarget.value.statusGap);
    return { change: -damage, message: '強烈命令語氣不適合這段身分關係。' };
  }
  return { change: 0, message: '語氣中性；留意說話者身分與情境。' };
};

const selectTile = (chunk: Chunk) => {
  if (isSuccess.value) return;
  selectedChunks.value.push(chunk);
  feedback.value = '';
  impact.value = '';
};

const unselectTile = (index: number) => {
  if (isSuccess.value) return;
  selectedChunks.value.splice(index, 1);
  feedback.value = '';
  impact.value = '';
};

const submit = () => {
  if (selectedChunks.value.length === 0 || isSuccess.value) return;
  const submitted = sentence.value;
  const key = normalize(submitted);
  const isCorrectAnswer = key === normalize(props.question.correctAnswer.join(' '));
  const wasScored = scoredSubmissions.has(key);
  if (!wasScored) {
    scoredSubmissions.add(key);
    const result = scoreTone(submitted);
    hitPoints.value = Math.max(0, Math.min(100, hitPoints.value + result.change));
    impact.value = result.change > 0 ? `+${result.change} HP`
      : result.change < 0 ? `${result.change} HP` : '';
    feedback.value = result.message;
    if (result.change < 0) emit('misconception', 'PRAGMATIC_TONE');
    else if (!isCorrectAnswer) emit('misconception', 'R:VERB:MOOD');
  }

  if (isCorrectAnswer) {
    isSuccess.value = true;
    feedback.value = '句型與語氣符合情境，完成挑戰！';
    successTimeout = setTimeout(() => emit('success'), 900);
  } else {
    feedback.value = `${feedback.value} 句子尚未符合目標答案，調整字卡後再試一次。`.trim();
  }
};

const resetSentence = () => {
  selectedChunks.value = [];
  feedback.value = '';
  impact.value = '';
};

onBeforeUnmount(() => {
  if (successTimeout) clearTimeout(successTimeout);
});
</script>

<template>
  <section class="pragmatic-canvas" :class="{ shake: impact.endsWith('HP') && impact.startsWith('-') }">
    <header class="pragmatic-header">
      <strong>語情小人血條</strong>
      <span>組成合適的句子，觀察語氣如何影響社交關係。</span>
    </header>

    <div class="social-stage">
      <div class="avatar" :aria-label="`NPC 表情，關係值 ${hitPoints}`" role="img">{{ avatar }}</div>
      <div class="social-meter">
        <div class="impact" :class="{ damage: impact.startsWith('-'), healing: impact.startsWith('+') }"
          aria-live="polite">{{ impact }}</div>
        <div class="meter-track" role="progressbar" aria-label="社交關係值" :aria-valuenow="hitPoints"
          aria-valuemin="0" aria-valuemax="100">
          <div class="meter-fill" :style="{ width: `${hitPoints}%`, backgroundColor: barColor }"></div>
        </div>
        <strong>{{ hitPoints }} / 100 HP</strong>
        <span>{{ statusLabel }}</span>
      </div>
    </div>

    <div class="pragmatic-answer" aria-label="句子作答區">
      <button v-for="(chunk, index) in selectedChunks" :key="`${chunk.id}-${index}`" type="button"
        :disabled="isSuccess" @click="unselectTile(index)">
        {{ chunk.text }} <span aria-hidden="true">×</span>
      </button>
      <span v-if="selectedChunks.length === 0" class="answer-placeholder">點選下方字卡組成句子</span>
    </div>
    <div class="pragmatic-word-bank" aria-label="字卡庫">
      <button v-for="(chunk, index) in wordBank" :key="`${chunk.id}-${index}`" type="button"
        :disabled="isSuccess || selectedChunks.some(item => item.id === chunk.id)"
        @click="selectTile(chunk)">
        {{ chunk.text }}
      </button>
    </div>
    <div class="pragmatic-actions">
      <button type="button" class="submit-button" :disabled="selectedChunks.length === 0 || isSuccess"
        @click="submit">送出句子</button>
      <button type="button" :disabled="isSuccess" @click="resetSentence">清除重組</button>
    </div>
    <p v-if="feedback" class="pragmatic-feedback" role="status">{{ feedback }}</p>
  </section>
</template>

<style scoped>
.pragmatic-canvas { display: flex; flex-direction: column; gap: 14px; }
.pragmatic-header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; padding: 14px 18px; border-radius: 14px; background: #f0fdf4; color: #166534; }
.pragmatic-header span { color: #526879; }
.social-stage { display: grid; grid-template-columns: 90px 1fr; align-items: center; gap: 16px; padding: 18px; border-radius: 18px; background: linear-gradient(135deg, #f8fafc, #e0f2fe); }
.avatar { display: grid; place-items: center; width: 76px; height: 76px; border: 3px solid #fff; border-radius: 50%; background: #fff; box-shadow: 0 5px 16px #0f172a20; font-size: 2.8rem; }
.social-meter { display: grid; gap: 6px; }
.social-meter > span { color: #475569; font-size: .9rem; }
.meter-track { height: 16px; overflow: hidden; border-radius: 999px; background: #cbd5e1; }
.meter-fill { height: 100%; border-radius: inherit; transition: width .45s ease, background-color .3s ease; }
.impact { min-height: 1.4em; font-weight: 900; font-size: 1.2rem; }
.impact.damage { color: #dc2626; }
.impact.healing { color: #16a34a; }
.pragmatic-answer, .pragmatic-word-bank { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-height: 54px; padding: 12px; border: 1px solid #cbd5e1; border-radius: 14px; background: #fff; }
.pragmatic-answer { border-style: dashed; }
.pragmatic-answer button, .pragmatic-word-bank button, .pragmatic-actions button { padding: 9px 13px; border: 1px solid #bfdbfe; border-radius: 10px; background: #eff6ff; color: #1e3a8a; cursor: pointer; font-weight: 700; }
.pragmatic-word-bank button:disabled { opacity: .4; cursor: not-allowed; }
.answer-placeholder { color: #64748b; }
.pragmatic-actions { display: flex; gap: 10px; }
.pragmatic-actions .submit-button { border-color: #15803d; background: #16a34a; color: #fff; }
.pragmatic-actions button:disabled { opacity: .5; cursor: not-allowed; }
.pragmatic-feedback { margin: 0; padding: 12px 14px; border-radius: 12px; background: #f8fafc; color: #334155; }
.shake { animation: canvas-shake .35s ease-in-out; }
@keyframes canvas-shake { 25% { transform: translateX(-4px); } 50% { transform: translateX(4px); } 75% { transform: translateX(-3px); } }
@media (max-width: 500px) { .social-stage { grid-template-columns: 1fr; justify-items: center; text-align: center; } .social-meter { width: 100%; } }
</style>
