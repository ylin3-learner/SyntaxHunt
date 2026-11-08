<script setup lang="ts">
import { computed } from 'vue';
import MacroDragCanvas from '../MacroDragCanvas.vue';
import type { QuestionData } from '../../rules/types';

interface Props {
  question: QuestionData;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'unpack', type: 'relative' | 'preposition'): void;
}>();

const grammarFeature = computed(() => props.question.grammarFeature);
const targetNoun = computed(() => props.question.targetNoun);
const imageUrl = computed(() => props.question.imageUrl || '');
</script>

<template>
  <div class="target-noun">
    <span class="highlight">{{ targetNoun }}</span>
  </div>
  <MacroDragCanvas v-if="grammarFeature" :target-noun="targetNoun" :grammar-feature="grammarFeature"
    :image-url="imageUrl" @unpack="emit('unpack', $event)" />
</template>

<style scoped>
.target-noun {
  text-align: center;
  margin-bottom: 16px;
}

.highlight {
  font-size: 1.5rem;
  font-weight: bold;
  color: var(--primary-color);
}
</style>