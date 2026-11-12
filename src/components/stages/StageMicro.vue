<script setup lang="ts">
import GrammarCanvas from '../GrammarCanvas.vue';
import type { GrammarQuestionData } from '../../rules/types';
import { onMounted } from 'vue';

interface Props {
  question: GrammarQuestionData;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'success'): void;
  (e: 'continue', allowClassModeSkip: boolean): void;
  (e: 'misconception', code: string): void;
}>();

onMounted(() => {
  console.log('[DEBUG StageMicro] mounted');
  console.log('[DEBUG StageMicro] question:', props.question);
  console.log('[DEBUG StageMicro] question.chunks:', props.question.chunks);
  console.log('[DEBUG StageMicro] question.ui_mode:', props.question.ui_mode);
  console.log('[DEBUG StageMicro] question.canvas_mode:', props.question.canvas_mode);
});
</script>

<template>
  <GrammarCanvas :question="props.question" :initial-chunks="props.question.chunks || []"
    :speech-rate="props.question.speechRate || 0.8" @success="emit('success')" @continue="emit('continue', true)"
    @misconception="emit('misconception', $event)" />
</template>

<style scoped></style>
