<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { GrammarQuestionData, Chunk } from '../../rules/types';
import { useSound } from '../../utils/useSound';
import { useTTS } from '../../utils/useSpeech';

const { playSuccess } = useSound();
const { speak } = useTTS();

const props = withDefaults(defineProps<{
  question: GrammarQuestionData;
  initialChunks: Chunk[];
  speechRate?: number;
  fixedMorph?: boolean;
  shuffleWordBank?: boolean;
}>(), { shuffleWordBank: true });

const emit = defineEmits<{
  (e: 'success'): void;
  (e: 'misconception', code: string): void;
  (e: 'continue'): void;
}>();

const answerArea = ref<Chunk[]>([]);
const isSuccess = ref(false);
const activeMorphId = ref<string | null>(null);
const morphFeedback = ref<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

const initTiles = () => {
  answerArea.value = JSON.parse(JSON.stringify(props.initialChunks.map(chunk => ({ ...chunk }))));
};

initTiles();

watch(() => props.initialChunks, () => {
  answerArea.value = JSON.parse(JSON.stringify(props.initialChunks));
  isSuccess.value = false;
}, { deep: true });

let successTimeout: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => { if (successTimeout) clearTimeout(successTimeout); });

const toggleMorphMenu = (chunk: Chunk) => {
  if (!chunk.can_morph || isSuccess.value) return;
  activeMorphId.value = activeMorphId.value === chunk.id ? null : chunk.id;
};

const selectMorph = (chunk: Chunk, newText: string, hintText?: string) => {
  chunk.text = newText;
  const options = chunk.options ?? chunk.morph_options ?? [];
  chunk.current_index = Math.max(0, options.indexOf(newText));
  const isCorrect = (props.question.correctAnswer ?? []).includes(newText);
  morphFeedback.value = {
    text: hintText || (isCorrect ? `✅ Correct! Using ${newText} here.` : `❌ This doesn't fit the context, try again.`),
    type: isCorrect ? 'success' : 'error'
  };
  activeMorphId.value = null;
  checkAnswer();
};

const checkAnswer = () => {
  const studentTokens = answerArea.value.map(t => t.text);
  const correctTokens = props.question.correctAnswer ?? [];

  if (studentTokens.join(' ') === correctTokens.join(' ')) {
    playSuccess();
    isSuccess.value = true;
    speak(studentTokens.map(token => token.replace(/[\[\]]/g, '')).join(' '), { rate: props.speechRate ?? 0.8 });
    successTimeout = setTimeout(() => emit('success'), 1500);
  }
};

const handleOutsideClick = () => { activeMorphId.value = null; };
</script>

<template>
  <div class="grammar-canvas" @click="handleOutsideClick">
    <div class="fixed-morph-sentence" :class="{ 'success-bg': isSuccess }">
      <span v-if="question.contextCloze" class="fixed-context">{{ question.contextCloze.prefix }}</span>
      <template v-for="(chunk, index) in answerArea" :key="chunk.id">
        <span v-if="index > 0 && !question.contextCloze" class="fixed-word-space"> </span>
        <span v-if="chunk.can_morph" class="fixed-morph-token can-morph">
          <button type="button" class="morph-capsule" @click.stop="toggleMorphMenu(chunk)">
            {{ chunk.text.replace(/[\[\]]/g, '') }}
          </button>
          <div v-if="activeMorphId === chunk.id" class="morph-menu explicit-menu">
            <div class="menu-title">Select correct form:</div>
            <button v-for="option in (chunk.options ?? chunk.morph_options)" :key="option" type="button"
              @click.stop="selectMorph(chunk, option, option === 'were' ? 'Subjunctive mood for unreal conditions requires the form were.' : undefined)">
              <strong class="option-text">{{ option }}</strong>
            </button>
          </div>
        </span>
        <span v-else class="fixed-sentence-token" :class="{ 'tile-success': isSuccess }">
          {{ chunk.text.replace(/[\[\]]/g, '') }}
        </span>
      </template>
      <span v-if="question.contextCloze" class="fixed-context">{{ question.contextCloze.suffix }}</span>

      <Transition name="fade">
        <div v-if="morphFeedback" class="morph-feedback" :class="morphFeedback.type">
          {{ morphFeedback.text }}
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
/* 保留 MORPH 專用的樣式 */
.grammar-canvas {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 200px;
  position: relative;
}

.fixed-morph-sentence {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 6px;
  padding: 20px;
  border: 2px solid #d5e0e8;
  border-radius: 16px;
  background: #ffffff;
  font-size: clamp(1.2rem, 3vw, 1.8rem);
  line-height: 1.6;
  transition: all 0.2s;
}

.fixed-context {
  color: #526879;
}

.fixed-sentence-token {
  padding: 4px 2px;
}

.fixed-morph-token {
  position: relative;
  display: inline-flex;
}

.morph-capsule {
  padding: 2px 16px;
  border: 2px solid #9c27b0;
  border-radius: 999px;
  background: #f3e8ff;
  color: #9c27b0;
  font-size: inherit;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.morph-capsule:hover {
  background: #e9d5ff;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(156, 39, 176, 0.2);
}

.tile-success {
  background-color: #d7ffb8 !important;
  border-color: #58cc02 !important;
  color: #58cc02 !important;
}

.success-bg {
  background-color: #f0fff0;
  border-color: #58cc02;
}

.morph-menu {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 8px;
  background: white;
  border: 2px solid #9c27b0;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 10;
  overflow: hidden;
  min-width: 100%;
  max-height: 240px;
  overflow-y: auto;
}

.morph-menu button {
  display: block;
  width: 100%;
  padding: 10px 20px;
  border: 0;
  background: #ffffff;
  font-weight: bold;
  cursor: pointer;
  text-align: center;
  color: #333;
  transition: background 0.2s;
}

.morph-menu button:hover {
  background: #f3e8ff;
  color: #9c27b0;
}

.explicit-menu {
  min-width: 220px;
  padding: 8px;
  background: #ffffff;
  border: 2px solid #9c27b0;
  border-radius: 12px;
}

.menu-title {
  font-size: 0.8rem;
  color: #777;
  margin-bottom: 8px;
  padding-left: 8px;
}

.explicit-menu button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid transparent;
}

.explicit-menu button:hover {
  background: #f3e8ff;
  border-color: #d8b4fe;
}

.option-text {
  font-size: 1.2rem;
  color: #333;
}

.morph-feedback {
  margin-top: 16px;
  padding: 12px 16px;
  border-radius: 8px;
  font-weight: bold;
  font-size: 1rem;
  flex-basis: 100%;
  box-sizing: border-box;
}

.morph-feedback.success {
  background: #dcfce7;
  color: #166534;
}

.morph-feedback.error {
  background: #fee2e2;
  color: #991b1b;
}
</style>