<script setup lang="ts">
import { computed } from 'vue';
import PronunciationAnalyzer from '../PronunciationAnalyzer.vue';
import type { QuestionData } from '../../rules/types';

interface Props {
  question: QuestionData;
  fullSentenceData: { target: string; display: string; modifier: string };
  isClassMode: boolean;
  currentIndex: number;
  questionBankLength: number;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'next'): void;
}>();

const enabledStages = computed(() => props.question.enabledStages || []);
const speechRate = computed(() => props.question.speechRate || 0.8);
const isLastQuestion = computed(() => props.currentIndex >= props.questionBankLength - 1);
</script>

<template>
  <div class="success-screen">
    <div class="confetti">🎉 ✨ 🏆</div>
    <h2>角色解鎖成功！</h2>

    <PronunciationAnalyzer
      v-if="enabledStages.includes('pronunciation')"
      :target-sentence="props.fullSentenceData.target"
      :display-sentence="props.fullSentenceData.display"
      :highlight-part="props.fullSentenceData.modifier"
      :speech-rate="speechRate"
      @skip="emit('next')"
    />
    <p v-else class="skip-hint">已略過語音練習。</p>

    <button class="btn-primary mt-4" @click="emit('next')" :disabled="props.isClassMode">
      {{ props.isClassMode ? '等待老師解鎖...' : (isLastQuestion ? '完成練習 🏁' : '下一關 ➔') }}
    </button>
    <p v-if="props.isClassMode" style="color: #ff9800; margin-top: 10px; font-weight: bold;">
      ⚠️ 上課模式已啟動，請等待老師統一發送下一題。
    </p>
  </div>
</template>

<style scoped>
.confetti {
  font-size: 2rem;
  margin-bottom: 12px;
}
.skip-hint {
  color: #888;
  font-size: 0.9rem;
  margin-bottom: 16px;
}
.btn-primary {
  margin-top: 20px;
}
</style>
