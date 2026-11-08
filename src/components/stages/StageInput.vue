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
  <StructuredInput
    v-if="inputData"
    :audio-text="inputData.audioText"
    :options="inputData.options"
    :speech-rate="speechRate"
    @success="emit('success')"
  />
</template>

<style scoped></style>
