<script setup lang="ts">
import { computed } from 'vue';
import type { Chunk, GrammarQuestionData } from '../../rules/types';
import { getQuestionCanvasMode } from '../../rules/types';
import { getGrammarTopic } from '../../rules/grammarTopics';
import MorphChoiceCanvas from './MorphChoiceCanvas.vue';
import TileSentenceCanvas from './TileSentenceCanvas.vue';

const props = defineProps<{
  question: GrammarQuestionData;
  initialChunks: Chunk[];
  speechRate?: number;
}>();

const isTenseConveyor = computed(() => {
  const concept = props.question.concept;
  return getQuestionCanvasMode(props.question) === 'GRAVITY_SWITCH'
    || ['TENSE_ASPECT', 'PAST_TENSE'].includes(concept ?? '')
    || ['tense-present', 'tense-past', 'tense-future', 'tense-aspect']
      .includes(props.question.grammarTopicId ?? '')
    || getGrammarTopic(props.question.grammarTopicId)?.defaultCanvasMode === 'GRAVITY_SWITCH';
});

const emit = defineEmits<{
  (e: 'success'): void;
  (e: 'misconception', code: string): void;
  (e: 'continue'): void;
}>();
</script>

<template>
  <MorphChoiceCanvas v-if="isTenseConveyor" :question="question" :initial-chunks="initialChunks"
    :speech-rate="speechRate" strategy="timeline" fixed-morph
    @success="emit('success')" @misconception="emit('misconception', $event)" @continue="emit('continue')" />
  <section v-else class="morph-choice-canvas">
    <header class="morph-choice-header">
      <strong>句子變形</strong>
      <span>點擊句中的變形字詞選擇答案。</span>
    </header>
    <TileSentenceCanvas :question="question" :initial-chunks="initialChunks" :speech-rate="speechRate"
      fixed-morph @success="emit('success')" @misconception="emit('misconception', $event)"
      @continue="emit('continue')" />
  </section>
</template>

<style scoped>
.morph-choice-canvas { display: flex; flex-direction: column; gap: 12px; }
.morph-choice-header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; padding: 14px 18px; border-radius: 14px; background: #edf7ff; color: #15507a; }
.morph-choice-header span { color: #526879; }
</style>
