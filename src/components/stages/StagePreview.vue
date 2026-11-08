<script setup lang="ts">
import { computed } from 'vue';
import ChunkPreview from '../ChunkPreview.vue';
import type { QuestionData } from '../../rules/types';

interface Props {
  question: QuestionData;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'success'): void;
  (e: 'wrong-answer', option: string): void;
}>();

const previewData = computed(() => props.question.previewData);
const targetNoun = computed(() => props.question.targetNoun);
const speechRate = computed(() => props.question.speechRate || 0.8);
</script>

<template>
  <ChunkPreview
    v-if="previewData"
    :image="previewData.targetImage"
    :noun="targetNoun"
    :chunk="previewData.chunkText"
    :zh-meaning="previewData.chunkZh"
    :quiz-options="previewData.quizOptions"
    :speech-rate="speechRate"
    @success="emit('success')"
    @wrong-answer="emit('wrong-answer', $event)"
  />
</template>

<style scoped></style>
