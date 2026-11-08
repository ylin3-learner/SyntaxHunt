<script setup lang="ts">
import { computed } from 'vue';
import ContrastPuzzle from '../ContrastPuzzle.vue';
import type { QuestionData } from '../../rules/types';

interface Props {
  question: QuestionData;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'success'): void;
  (e: 'misconception', code: string): void;
}>();

const contrastData = computed(() => props.question.contrastData);
const grammarFeature = computed(() => props.question.grammarFeature);
const targetNoun = computed(() => props.question.targetNoun);
const antecedent = computed(() => props.question.antecedent);
const explanationTitle = computed(() => props.question.explanation?.title);
const explanationDesc = computed(() => props.question.explanation?.desc);
</script>

<template>
  <ContrastPuzzle
    v-if="contrastData && grammarFeature"
    :chinese-sentence="contrastData.chineseSentence"
    :chinese-highlight="contrastData.chineseHighlight"
    :noun-image="contrastData.nounImage"
    :modifier-image="contrastData.modifierImage"
    :english-noun="targetNoun"
    :modifier-label="grammarFeature.relative.label"
    :antecedent="antecedent"
    :layout="contrastData.layout"
    :explanation-title="explanationTitle"
    :explanation-desc="explanationDesc"
    @success="emit('success')"
    @misconception="emit('misconception', $event)"
  />
</template>

<style scoped></style>
