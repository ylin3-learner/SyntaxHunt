<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { runDiagnosisPipeline } from '../../rules/diagnostics/pipeline';
import { normalizeAnswer } from '../../utils/textUtils';
import type { DiagnosticSignal, GrammarQuestionData, Chunk } from '../../rules/types';
import { useSound } from '../../utils/useSound';
import { useTTS } from '../../utils/useSpeech';
import { shuffleArray } from '../../utils/shuffle';
import { initDiagnosticPipeline } from '../../rules/diagnostics/init';

initDiagnosticPipeline();

const { playError, playSuccess } = useSound();
const { speak } = useTTS();

const props = withDefaults(defineProps<{
  question: GrammarQuestionData;
  initialChunks: Chunk[];
  speechRate?: number;
  shuffleWordBank?: boolean;
}>(), { shuffleWordBank: true });

const emit = defineEmits<{
  (e: 'success'): void;
  (e: 'misconception', code: string): void;
  (e: 'continue'): void;
}>();

const answerArea = ref<Chunk[]>([]);
const wordBank = ref<Chunk[]>([]);
const signals = ref<DiagnosticSignal[]>([]);
const isSuccess = ref(false);
const isWrong = ref(false);
const attemptCount = ref(0);
const clozeDragged = ref<Chunk | null>(null);

const answerSlotCount = computed(() => Math.max(props.question.correctAnswer?.length ?? 0, answerArea.value.length));

const initTiles = () => {
  // 加上安全防護，避免 undefined
  const safeChunks = props.initialChunks || [];
  const chunks = props.shuffleWordBank ? shuffleArray(safeChunks) : safeChunks;
  wordBank.value = JSON.parse(JSON.stringify(chunks));
  answerArea.value = [];
};

initTiles();

let successTimeout: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => { if (successTimeout) clearTimeout(successTimeout); });

const selectTile = (tile: Chunk) => {
  if (isSuccess.value) return;
  const index = wordBank.value.findIndex(t => t.id === tile.id);
  if (index !== -1) {
    wordBank.value.splice(index, 1);
    answerArea.value.push(tile);
    resetState();
  }
};

const unselectTile = (tile: Chunk) => {
  if (isSuccess.value) return;
  const index = answerArea.value.findIndex(t => t.id === tile.id);
  if (index !== -1) {
    answerArea.value.splice(index, 1);
    wordBank.value.push(tile);
    resetState();
  }
};

const handleClozeDragStart = (tile: Chunk) => {
  if (isSuccess.value) return;
  clozeDragged.value = tile;
};

const handleClozeDragOver = (event: DragEvent) => {
  event.preventDefault();
};

const handleClozeDrop = (event: DragEvent) => {
  event.preventDefault();
  if (!clozeDragged.value || isSuccess.value) return;
  const tile = clozeDragged.value;
  const index = wordBank.value.findIndex(t => t.id === tile.id);
  if (index !== -1) {
    wordBank.value.splice(index, 1);
    answerArea.value.push(tile);
    resetState();
  }
  clozeDragged.value = null;
};

const resetState = () => {
  isWrong.value = false;
  signals.value = [];
};

const checkAnswer = async (force = false) => {
  const studentTokens = answerArea.value.map(t => t.text);
  const correctTokens = props.question.correctAnswer ?? [];

  if (correctTokens.length === 0) return;
  if (studentTokens.length === 0) return;

  const cleanCurrent = normalizeAnswer(studentTokens);
  const cleanTarget = normalizeAnswer(correctTokens);

  if (cleanCurrent === cleanTarget) {
    playSuccess();
    isSuccess.value = true;
    attemptCount.value = 0;
    speak(studentTokens.map(token => token.replace(/[\[\]]/g, '')).join(' '), { rate: props.speechRate ?? 0.8 });
    successTimeout = setTimeout(() => emit('success'), 1500);
    return;
  }

  if (!force && studentTokens.length < correctTokens.length) return;

  attemptCount.value++;

  if (attemptCount.value === 1) {
    signals.value = [{
      code: 'TRY_AGAIN',
      message: '好像還差一點點，檢查看看順序或單字有沒有拼對！',
      source: 'local',
      category: 'Soft Warning'
    }];
    return;
  }

  const ctx = { studentTokens, correctTokens, question: props.question };
  const pipelineSignals = await runDiagnosisPipeline(ctx);

  if (pipelineSignals.length === 0) return;

  signals.value = pipelineSignals;
  playError();
  isWrong.value = true;

  pipelineSignals.forEach((signal) => {
    if (signal.code !== 'HIGHLIGHT_ONLY' && signal.code !== 'TRY_AGAIN') {
      emit('misconception', signal.code);
    }
  });
};

const isError = (index: number) => signals.value.some(s => s.index === index);
</script>

<template>
  <section class="magnetic-canvas build-mode-wrapper">
    <!-- 克漏字上下文 UI -->
    <div class="cloze-context" v-if="question.contextCloze">
      <span class="cloze-text">{{ question.contextCloze.prefix }}</span>
      <div class="cloze-blanks-container">
        <span v-for="(_, index) in answerSlotCount" :key="index" class="cloze-blank-slot"
          :class="{ 'has-text': answerArea[index] }" @dragover="handleClozeDragOver" @drop="handleClozeDrop">
          <template v-if="answerArea[index]">
            <div class="tile"
              :class="{ 'tile-error': isError(index), 'tile-success': isSuccess, 'tile-chunk': answerArea[index].text.startsWith('[') }"
              @click.stop="unselectTile(answerArea[index])">
              {{ answerArea[index].text.replace(/[\[\]]/g, '') }}
            </div>
          </template>
          <span v-else class="blank-placeholder">_</span>
        </span>
      </div>
      <span class="cloze-text">{{ question.contextCloze.suffix }}</span>
    </div>

    <!-- 全句重排區塊 -->
    <div v-if="!question.contextCloze" class="answer-area" :class="{ 'success-bg': isSuccess, 'shake': isWrong }">
      <div v-for="(_, index) in answerSlotCount" :key="index" class="answer-slot">
        <div v-if="answerArea[index]" class="tile-wrapper">
          <div class="tile"
            :class="{ 'tile-error': isError(index), 'tile-success': isSuccess, 'tile-chunk': answerArea[index].text.startsWith('[') }"
            @click.stop="unselectTile(answerArea[index])">
            {{ answerArea[index].text.replace(/[\[\]]/g, '') }}
          </div>
        </div>
        <div v-else class="empty-slot"></div>
      </div>
    </div>

    <!-- 字磚庫 -->
    <div class="word-bank">
      <div v-for="tile in wordBank" :key="tile.id" class="tile" draggable="true" @dragstart="handleClozeDragStart(tile)"
        :class="{ 'tile-chunk': tile.text.startsWith('[') }" @click="selectTile(tile)">
        {{ tile.text.replace(/[\[\]]/g, '') }}
      </div>
    </div>

    <button class="check-answer-button" @click="checkAnswer(true)">Check Answer</button>

    <!-- Alert Bubble -->
    <div v-if="signals.length > 0" class="alert-bubble" :class="{ 'soft-warning': signals[0].code === 'TRY_AGAIN' }">
      <div class="alert-icon">{{ signals[0].code === 'TRY_AGAIN' ? '💡' : '⚠️' }}</div>
      <div class="alert-messages">
        <div v-for="(s, index) in signals" :key="`${s.code}-${index}`">
          <p>{{ s.message }}</p>
          <p v-if="s.category" class="diagnosis-meta">
            {{ s.source === 'languagetool' ? 'LanguageTool' : 'Local Diagnostic' }}
            <span v-if="s.ruleId"> · {{ s.ruleId }}</span>
          </p>
        </div>
      </div>
    </div>

    <button v-if="signals.length > 0 && (signals[0].code === 'HIGHLIGHT_ONLY' || signals[0].source === 'languagetool')"
      class="continue-button" @click="emit('continue')">
      繼續下一題 →
    </button>
  </section>
</template>

<style scoped>
.build-mode-wrapper {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.cloze-context {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 8px;
  font-size: 1.4rem;
  font-weight: bold;
  color: #333;
  margin-bottom: 10px;
  line-height: 1.6;
}

.cloze-text {
  color: #555;
}

.cloze-blanks-container {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}

.cloze-blank-slot {
  min-width: 50px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #e6f7ff;
  color: #1cb0f6;
  border-radius: 8px;
  border-bottom: 3px dashed #1cb0f6;
  padding: 4px 8px;
  transition: all 0.2s;
  box-sizing: border-box;
}

.cloze-blank-slot.has-text {
  background: #d0f0ff;
  border-bottom-style: solid;
}

.blank-placeholder {
  opacity: 0.5;
}

.answer-area {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  min-height: 80px;
  padding: 16px;
  border-radius: 16px;
  border-bottom: 4px dashed #e5e5e5;
  background: #fdfdfd;
  align-items: center;
  transition: all 0.3s;
}

.answer-area.success-bg {
  border-bottom-color: #58cc02;
  background: #f0fff0;
}

.word-bank {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  min-height: 80px;
  padding: 16px;
  border: 2px solid #e5e5e5;
  border-radius: 16px;
  background: #ffffff;
  transition: all 0.3s;
}

.answer-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 60px;
  min-height: 50px;
}

.empty-slot {
  width: 100%;
  height: 100%;
  min-width: 60px;
  min-height: 50px;
  border-bottom: 3px dashed #ccc;
  border-radius: 8px;
  background: #f4f4f4;
}

.tile-wrapper {
  position: relative;
}

.tile {
  padding: 12px 20px;
  background-color: #ffffff;
  border: 2px solid #e5e5e5;
  border-bottom-width: 4px;
  border-radius: 12px;
  cursor: pointer;
  user-select: none;
  font-size: 1.2rem;
  font-weight: 600;
  color: #4b4b4b;
  transition: all 0.1s;
  height: 100%;
  display: flex;
  align-items: center;
}

.tile:hover {
  background-color: #f7f7f7;
}

.tile:active {
  border-bottom-width: 2px;
  transform: translateY(2px);
}

.tile-chunk {
  background-color: #e6f7ff;
  border-color: #1cb0f6;
  color: #1899d6;
  border-radius: 20px;
  padding: 12px 24px;
  box-shadow: 0 2px 8px rgba(28, 176, 246, 0.15);
}

.tile-error {
  background-color: #ffdfe0 !important;
  border-color: #ff4b4b !important;
  color: #ea2b2b !important;
}

.tile-success {
  background-color: #d7ffb8 !important;
  border-color: #58cc02 !important;
  color: #58cc02 !important;
}

.check-answer-button,
.continue-button {
  align-self: flex-end;
  padding: 10px 20px;
  background: #58cc02;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: bold;
  cursor: pointer;
  margin-top: 10px;
}

.alert-bubble {
  display: flex;
  gap: 12px;
  background-color: #ffdfe0;
  color: #ea2b2b;
  padding: 16px;
  border-radius: 12px;
  border: 2px solid #ff4b4b;
  font-weight: 500;
}

.alert-bubble.soft-warning {
  background-color: #fef3c7;
  color: #92400e;
  border-color: #fcd34d;
}

.alert-icon {
  font-size: 1.5rem;
}

.alert-messages p {
  margin: 0 0 4px 0;
}

.shake {
  animation: shake 0.4s cubic-bezier(.36, .07, .19, .97) both;
}

@keyframes shake {

  10%,
  90% {
    transform: translate3d(-2px, 0, 0);
  }

  20%,
  80% {
    transform: translate3d(4px, 0, 0);
  }

  30%,
  50%,
  70% {
    transform: translate3d(-8px, 0, 0);
  }

  40%,
  60% {
    transform: translate3d(8px, 0, 0);
  }
}
</style>