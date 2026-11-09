<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
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
  fixedMorph?: boolean;
  shuffleWordBank?: boolean;
}>(), { shuffleWordBank: true });

const emit = defineEmits<{
  (e: 'success'): void;
  (e: 'misconception', code: string): void;
  (e: 'continue'): void;
}>();

const answerArea = ref<Chunk[]>([]);
const trashArea = ref<Chunk[]>([]);
const wordBank = ref<Chunk[]>([]);
const isFixedMorph = computed(() => props.fixedMorph || props.question.ui_mode === 'MORPH');
const answerSlotCount = computed(() => Math.max(props.question.correctAnswer.length, answerArea.value.length));
const signals = ref<DiagnosticSignal[]>([]);
const isSuccess = ref(false);
const isWrong = ref(false);
const remoteStatus = ref('');
const activeMorphId = ref<string | null>(null);
const morphFeedback = ref<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
const draggedTileIndex = ref<number | null>(null);

const initTiles = () => {
  if (isFixedMorph.value) {
    answerArea.value = JSON.parse(JSON.stringify(props.initialChunks.map(chunk => ({ ...chunk }))));
    trashArea.value = [];
    wordBank.value = [];
  } else if (props.question.ui_mode === 'REDUCE') {
    answerArea.value = JSON.parse(JSON.stringify(props.initialChunks));
    trashArea.value = [];
    wordBank.value = [];
  } else {
    const chunks = props.shuffleWordBank ? shuffleArray(props.initialChunks) : props.initialChunks;
    wordBank.value = JSON.parse(JSON.stringify(chunks));
    answerArea.value = [];
    trashArea.value = [];
  }
};

initTiles();

watch(() => props.initialChunks, () => {
  if (isFixedMorph.value) {
    answerArea.value = JSON.parse(JSON.stringify(props.initialChunks));
    resetState();
  }
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
  const isCorrect = props.question.correctAnswer.includes(newText);
  morphFeedback.value = {
    text: hintText || (isCorrect ? `✅ Correct! Using ${newText} here.` : `❌ This doesn't fit the context, try again.`),
    type: isCorrect ? 'success' : 'error'
  };
  activeMorphId.value = null;
  resetState();
  void checkAnswer();
};

const discardTile = (tile: Chunk) => {
  if (isSuccess.value || props.question.ui_mode !== 'REDUCE') return;
  const index = answerArea.value.findIndex(t => t.id === tile.id);
  if (index !== -1) {
    const [removed] = answerArea.value.splice(index, 1);
    trashArea.value.push(removed);
    resetState();
    void checkAnswer();
  }
};

const handleDragStart = (index: number) => {
  if (isSuccess.value || props.question.ui_mode !== 'REDUCE') return;
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

const selectTile = (tile: Chunk) => {
  if (isSuccess.value) return;
  const index = wordBank.value.findIndex(t => t.id === tile.id);
  if (index !== -1) {
    wordBank.value.splice(index, 1);
    answerArea.value.push(tile);
    resetState();
    void checkAnswer();
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

const resetState = () => {
  isWrong.value = false;
  signals.value = [];
  remoteStatus.value = '';
};

const checkAnswer = async (force = false) => {
  const studentTokens = answerArea.value.map(t => t.text);
  const correctTokens = props.question.correctAnswer;

  if (studentTokens.length === 0 && props.question.ui_mode !== 'REDUCE') return;

  const cleanCurrent = normalizeAnswer(studentTokens);
  const cleanTarget = normalizeAnswer(correctTokens);
  if (cleanCurrent === cleanTarget) {
    playSuccess();
    isSuccess.value = true;
    speak(studentTokens.map(token => token.replace(/[\[\]]/g, '')).join(' '), { rate: props.speechRate ?? 0.8 });
    successTimeout = setTimeout(() => emit('success'), 1500);
    return;
  }

  if (!force && props.question.ui_mode !== 'REDUCE' && studentTokens.length < correctTokens.length) return;

  const ctx = { studentTokens, correctTokens: correctTokens ?? [], question: props.question };
  const pipelineSignals = await runDiagnosisPipeline(ctx);

  if (pipelineSignals.length === 0) return;

  const displayed = props.question.ui_mode === 'REDUCE' ? pipelineSignals.slice(0, 1) : pipelineSignals;
  signals.value = displayed;
  playError();
  isWrong.value = true;

  displayed.forEach((signal) => {
    if (signal.code !== 'HIGHLIGHT_ONLY') emit('misconception', signal.code);
  });
};

const isError = (index: number) => signals.value.some(s => s.index === index);
const handleOutsideClick = () => { activeMorphId.value = null; };
</script>

<template>
  <div class="grammar-canvas" @click="handleOutsideClick">
    <div v-if="isFixedMorph" class="fixed-morph-sentence" :class="{ 'success-bg': isSuccess, 'shake': isWrong }">
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
        <span v-else class="fixed-sentence-token" :class="{ 'tile-error': isError(index), 'tile-success': isSuccess }">
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

    <!-- 👈 修正：加上 success-bg 綁定 -->
    <div v-else-if="question.ui_mode === 'REDUCE'" class="reduce-sentence-mode" :class="{ 'success-bg': isSuccess, 'shake': isWrong }">
      <div class="sentence-display">
        <template v-for="(tile, index) in answerArea" :key="tile.id">
          <button v-if="tile.draggable" type="button" class="removable-word"
            draggable="true"
            @dragstart="handleDragStart(index)"
            @dragover.prevent
            @drop="handleDrop(index)"
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
          <div v-if="trashArea.length === 0" class="trash-placeholder">Click on underlined words above to remove them.</div>
        </div>
      </div>
    </div>

    <div v-else class="build-mode-wrapper">
      <div class="answer-area" :class="{ 'success-bg': isSuccess, 'shake': isWrong }">
        <div v-for="(_, index) in answerSlotCount" :key="index" class="answer-slot">
          <div v-if="answerArea[index]" class="tile-wrapper">
            <div class="tile"
              :class="{ 'tile-error': isError(index), 'tile-success': isSuccess, 'tile-chunk': answerArea[index].text.startsWith('['), 'can-morph': answerArea[index].can_morph }"
              @click.stop="answerArea[index].can_morph ? toggleMorphMenu(answerArea[index]) : unselectTile(answerArea[index])">
              {{ answerArea[index].text.replace(/[\[\]]/g, '') }}
            </div>
            <div v-if="activeMorphId === answerArea[index].id" class="morph-menu">
              <button v-for="opt in (answerArea[index].options ?? answerArea[index].morph_options)" :key="opt"
                type="button" @click.stop="selectMorph(answerArea[index], opt)">
                {{ opt }}
              </button>
            </div>
          </div>
          <div v-else class="empty-slot"></div>
        </div>
      </div>
      <div class="word-bank">
        <div v-for="tile in wordBank" :key="tile.id" class="tile"
          :class="{ 'tile-chunk': tile.text.startsWith('['), 'can-morph': tile.can_morph }" @click="selectTile(tile)">
          {{ tile.text.replace(/[\[\]]/g, '') }}
        </div>
      </div>
      <button class="check-answer-button" @click="checkAnswer(true)">Check Answer</button>
    </div>

    <div v-if="signals.length > 0" class="alert-bubble">
      <div class="alert-icon">⚠️</div>
      <div class="alert-messages">
        <div v-for="(s, index) in signals" :key="`${s.code}-${index}`">
          <p>{{ s.message }}</p>
          <p v-if="s.category" class="diagnosis-meta">
            {{ s.source === 'languagetool' ? 'LanguageTool' : 'Local Diagnostic' }}
            <span v-if="s.ruleId"> · {{ s.ruleId }}</span>
            <span v-if="s.category"> · {{ s.category }}</span>
          </p>
        </div>
      </div>
    </div>

    <button 
      v-if="signals.length > 0 && (signals[0].code === 'HIGHLIGHT_ONLY' || signals[0].source === 'languagetool')" 
      class="continue-button" 
      @click="emit('continue')"
    >
      繼續下一題 →
    </button>
  </div>
</template>

<style scoped>
.grammar-canvas { display: flex; flex-direction: column; gap: 20px; min-height: 200px; position: relative; }

/* 👈 新增：REDUCE 模式的成功背景 */
.reduce-sentence-mode.success-bg {
  background-color: #f0fff0;
  border-color: #58cc02;
}

.check-answer-button, .continue-button {
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
.removable-word { cursor: grab; }
.removable-word:active { cursor: grabbing; }

/* ... 其他原有 CSS 保持不變 ... */
</style>
