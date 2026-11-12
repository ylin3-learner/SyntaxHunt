<script setup lang="ts">
import { computed } from 'vue';
import StructuredInput from '../StructuredInput.vue';
import type { QuestionData } from '../../rules/types';

interface Props {
  question: QuestionData;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'success'): void;
}>();

const inputData = computed(() => props.question.inputData);
const speechRate = computed(() => props.question.speechRate || 0.8);
</script>

<template>
  <!-- Fallback when inputData is not available -->
  <div v-if="!inputData" class="fallback-empty">⚠️ 此題目未設定聽力測驗資料，請聯絡老師。</div>
  
  <!-- Normal structured input when inputData is available -->
  <StructuredInput
    v-else
    :audio-text="inputData.audioText"
    :options="inputData.options"
    :speech-rate="speechRate"
    @success="emit('success')"
  />
</template>

<style scoped></style>
