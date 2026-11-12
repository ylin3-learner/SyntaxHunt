<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { runDiagnosisPipeline } from '../../rules/diagnostics/pipeline';
import { normalizeAnswer } from '../../utils/textUtils';
import type { DiagnosticSignal, GrammarQuestionData, Chunk } from '../../rules/types';
import { useSound } from '../../utils/useSound';
import { initDiagnosticPipeline } from '../../rules/diagnostics/init';

initDiagnosticPipeline();

const { playError, playSuccess } = useSound();

const props = defineProps<{
  question: GrammarQuestionData;
  initialChunks: Chunk[];
  speechRate?: number;
}>();

const emit = defineEmits<{
  (e: 'success'): void;
  (e: 'misconception', code: string): void;
  (e: 'continue'): void;
}>();

const answerArea = ref<Chunk[]>([]);
const trashArea = ref<Chunk[]>([]);
const signals = ref<DiagnosticSignal[]>([]);
const isSuccess = ref(false);
const isWrong = ref(false);
const draggedTileIndex = ref<number | null>(null);

const initTiles = () => {
  // 加上安全防護，避免 undefined
  const safeChunks = props.initialChunks || [];
  answerArea.value = JSON.parse(JSON.stringify(safeChunks));
  trashArea.value = [];
};
initTiles();

let successTimeout: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => { if (successTimeout) clearTimeout(successTimeout); });

const discardTile = (tile: Chunk) => {
  if (isSuccess.value) return;
  const index = answerArea.value.findIndex(t => t.id === tile.id);
  if (index !== -1) {
    const [removed] = answerArea.value.splice(index, 1);
    trashArea.value.push(removed);
    resetState();
    void checkAnswer();
  }
};

const handleDragStart = (index: number) => {
  if (isSuccess.value) return;
  draggedTileIndex.value = index;
};

const handleDrop = (dropIndex: number) => {
  if (draggedTileIndex.value === null || isSuccess.value) return;
  const startIndex = draggedTileIndex.value;
  if (startIndex === dropIndex) return;

  const item = answerArea.value.splice(startIndex, 1)[0];
  answerArea.value.splice(dropIndex, 0, item);
  draggedTileIndex.value = null;
  resetState();
  void checkAnswer();
};

const restoreTile = (tile: Chunk) => {
  if (isSuccess.value) return;
  const index = trashArea.value.findIndex(t => t.id === tile.id);
  if (index !== -1) {
    const [restored] = trashArea.value.splice(index, 1);
    answerArea.value.push(restored);
    answerArea.value.sort((a, b) => props.initialChunks.findIndex(c => c.id === a.id) - props.initialChunks.findIndex(c => c.id === b.id));
    resetState();
    void checkAnswer();
  }
};

const resetState = () => {
  isWrong.value = false;
  signals.value = [];
};

const checkAnswer = async (force = false) => {
  const studentTokens = answerArea.value.map(t => t.text);
  const correctTokens = props.question.correctAnswer ?? [];

  if (correctTokens.length === 0) return;

  const cleanCurrent = normalizeAnswer(studentTokens);
  const cleanTarget = normalizeAnswer(correctTokens);

  if (cleanCurrent === cleanTarget) {
    playSuccess();
    isSuccess.value = true;
    successTimeout = setTimeout(() => emit('success'), 1500);
    return;
  }

  if (!force && studentTokens.length < correctTokens.length) return;

  const ctx = { studentTokens, correctTokens, question: props.question };
  const pipelineSignals = await runDiagnosisPipeline(ctx);

  if (pipelineSignals.length === 0) return;

  signals.value = pipelineSignals.slice(0, 1); // REDUCE 只顯示第一個信號
  playError();
  isWrong.value = true;

  signals.value.forEach((signal) => {
    if (signal.code !== 'HIGHLIGHT_ONLY' && signal.code !== 'TRY_AGAIN') {
      emit('misconception', signal.code);
    }
  });
};

const isError = (index: number) => signals.value.some(s => s.index === index);
</script>

<template>
  <section class="shredder-canvas reduce-sentence-mode" :class="{ 'success-bg': isSuccess, 'shake': isWrong }">
    <div class="sentence-display">
      <template v-for="(tile, index) in answerArea" :key="tile.id">
        <button v-if="tile.draggable" type="button" class="removable-word" draggable="true"
          @dragstart="handleDragStart(index)" @dragover.prevent @drop="handleDrop(index)"
          :aria-label="'移除「' + tile.text.replace(/[\[\]]/g, '') + '」'"
          :class="{ 'tile-error': isError(index), 'tile-success': isSuccess }" @click="discardTile(tile)">
          {{ tile.text.replace(/[\[\]]/g, '') }} <span class="remove-hint">×</span>
        </button>
        <span v-else class="fixed-word" :class="{ 'tile-error': isError(index), 'tile-success': isSuccess }">
          {{ tile.text.replace(/[\[\]]/g, '') }}
        </span>
      </template>
    </div>

    <div class="trash-zone-wrapper">
      <div class="trash-label">🗑️ Removed tiles ({{ trashArea.length }}) · Click to restore</div>
      <div class="trash-area">
        <div v-for="tile in trashArea" :key="tile.id" class="trash-tile">
          <span>{{ tile.text.replace(/[\[\]]/g, '') }}</span>
          <button type="button" class="trash-restore-button" @click="restoreTile(tile)">Restore ↶</button>
        </div>
        <div v-if="trashArea.length === 0" class="trash-placeholder">Click on underlined words above to remove them.
        </div>
      </div>
    </div>

    <!-- Alert Bubble -->
    <div v-if="signals.length > 0" class="alert-bubble">
      <div class="alert-icon">⚠️</div>
      <div class="alert-messages">
        <div v-for="(s, index) in signals" :key="`${s.code}-${index}`">
          <p>{{ s.message }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.reduce-sentence-mode {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 20px;
  background: #fafafa;
  border-radius: 16px;
  border: 2px dashed #e5e5e5;
}

.reduce-sentence-mode.success-bg {
  background-color: #f0fff0;
  border-color: #58cc02;
}

.sentence-display {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  font-size: clamp(1.2rem, 3vw, 1.8rem);
  align-items: center;
  line-height: 1.6;
}

.fixed-word {
  color: #333;
}

.removable-word {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border: 2px solid #ff4b4b;
  border-radius: 8px;
  background: #fff0f0;
  color: #ea2b2b;
  font-size: inherit;
  font-weight: bold;
  cursor: grab;
  transition: all 0.2s;
}

.removable-word:active {
  cursor: grabbing;
}

.removable-word:hover {
  background: #ffdfe0;
  transform: scale(1.05);
}

.remove-hint {
  font-size: 1.2rem;
  opacity: 0.6;
}

.trash-zone-wrapper {
  border-top: 2px dashed #eee;
  padding-top: 20px;
}

.trash-label {
  font-size: 0.9rem;
  font-weight: bold;
  color: #6b7280;
  margin-bottom: 12px;
}

.trash-area {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  min-height: 60px;
  padding: 16px;
  background: #fff;
  border: 2px dashed #ccc;
  border-radius: 12px;
  justify-content: center;
}

.trash-tile {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border: 1px solid #d5d9de;
  border-radius: 8px;
  background: #f0f0f0;
  color: #999;
}

.trash-restore-button {
  border: 1px solid #1cb0f6;
  border-radius: 6px;
  padding: 4px 8px;
  background: #fff;
  color: #1cb0f6;
  cursor: pointer;
  font-size: 0.85rem;
}

.trash-placeholder {
  color: #999;
  font-size: 0.9rem;
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

.alert-bubble {
  display: flex;
  gap: 12px;
  background-color: #ffdfe0;
  color: #ea2b2b;
  padding: 16px;
  border-radius: 12px;
  border: 2px solid #ff4b4b;
  font-weight: 500;
  margin-top: 20px;
}

.alert-icon {
  font-size: 1.5rem;
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