<script setup lang="ts">
import GrammarCanvas from '../GrammarCanvas.vue';
import type { GrammarQuestionData } from '../../rules/types';

interface Props {
  question: GrammarQuestionData;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'success'): void;
  (e: 'continue', allowClassModeSkip: boolean): void;
  (e: 'misconception', code: string): void;
}>();
</script>

<template>
  <GrammarCanvas
    :question="props.question"
    :initial-chunks="props.question.chunks"
    :speech-rate="props.question.speechRate || 0.8"
    @success="emit('success')"
    @continue="emit('continue', true)"
    @misconception="emit('misconception', $event)"
  />
</template>

<style scoped></style>
