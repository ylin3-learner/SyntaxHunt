<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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

// 👈 追蹤嘗試次數，用於漸進式鷹架
const attemptCount = ref(0);
// BUILD Cloze 模式：記錄正從字庫拖曳的字磚
const clozeDragged = ref<Chunk | null>(null);

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

onMounted(() => {
  console.log('[DEBUG TileSentenceCanvas] mounted');
  console.log('[DEBUG TileSentenceCanvas] ui_mode:', props.question.ui_mode);
  console.log('[DEBUG TileSentenceCanvas] initialChunks length:', props.initialChunks?.length);
  console.log('[DEBUG TileSentenceCanvas] initialChunks:', props.initialChunks);
  console.log('[DEBUG TileSentenceCanvas] wordBank initial:', wordBank.value);
  console.log('[DEBUG TileSentenceCanvas] answerArea initial:', answerArea.value);
});

watch(() => props.question.ui_mode, (mode) => {
  console.log('[DEBUG TileSentenceCanvas] ui_mode changed →', mode);
});

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
  void checkAnswer(true);
};

const discardTile = (tile: Chunk) => {
  if (isSuccess.value || props.question.ui_mode !== 'REDUCE') return;
  const index = answerArea.value.findIndex(t => t.id === tile.id);
  if (index !== -1) {
    const [removed] = answerArea.value.splice(index, 1);
    trashArea.value.push(removed);
    resetState();
    void checkAnswer(true);
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
  void checkAnswer(true);
};

const restoreTile = (tile: Chunk) => {
  if (isSuccess.value) return;
  const index = trashArea.value.findIndex(t => t.id === tile.id);
  if (index !== -1) {
    const [restored] = trashArea.value.splice(index, 1);
    answerArea.value.push(restored);
    answerArea.value.sort((a, b) => props.initialChunks.findIndex(c => c.id === a.id) - props.initialChunks.findIndex(c => c.id === b.id));
    resetState();
    void checkAnswer(true);
  }
};

// BUILD Cloze：從字庫拖曳字磚進入挖空區
const handleClozeDragStart = (tile: Chunk) => {
  clozeDragged.value = tile;
};
const handleClozeDragOver = (e: DragEvent) => {
  e.preventDefault();
};
const handleClozeDrop = () => {
  if (!clozeDragged.value) return;
  const index = wordBank.value.findIndex(t => t.id === clozeDragged.value!.id);
  if (index !== -1) {
    wordBank.value.splice(index, 1);
    answerArea.value.push(clozeDragged.value!);
  }
  clozeDragged.value = null;
  resetState();
};

const selectTile = (tile: Chunk) => {
  if (isSuccess.value) return;
  const index = wordBank.value.findIndex(t => t.id === tile.id);
  if (index !== -1) {
    wordBank.value.splice(index, 1);
    answerArea.value.push(tile);
    resetState();
    // BUILD 模式：點擊字磚時不立刻檢查
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
  // 注意：這裡不重置 attemptCount，讓鷹架層級保留，直到學生答對或換題
};

const checkAnswer = async (force = false) => {
  const studentTokens = answerArea.value.map(t => t.text);
  const correctTokens = props.question.correctAnswer;

  // 1. 完全正確
  const cleanCurrent = normalizeAnswer(studentTokens);
  const cleanTarget = normalizeAnswer(correctTokens);
  if (cleanCurrent === cleanTarget) {
    playSuccess();
    isSuccess.value = true;
    attemptCount.value = 0; // 答對後重置
    speak(studentTokens.map(token => token.replace(/[\[\]]/g, '')).join(' '), { rate: props.speechRate ?? 0.8 });
    successTimeout = setTimeout(() => emit('success'), 1500);
    return;
  }

  // 2. 長度不足且非強制檢查，直接返回
  if (props.question.ui_mode === 'BUILD' && studentTokens.length < correctTokens.length && !force) {
    return;
  }

  if (props.question.ui_mode === 'BUILD' && studentTokens.length === 0) return;

  // 3. 漸進式鷹架邏輯
  attemptCount.value++;

  // 👈 關鍵修正：第一次錯誤時，直接回傳溫和提示，不呼叫 Pipeline 與 LanguageTool
  if (attemptCount.value === 1 && props.question.ui_mode === 'BUILD') {
    signals.value = [{
      code: 'TRY_AGAIN',
      message: '好像還差一點點，檢查看看順序或單字有沒有拼對！',
      source: 'local',
      category: 'Soft Warning'
    }];
    return;
  }

  // 第二次以上錯誤：執行 Pipeline
  const ctx = { studentTokens, correctTokens: correctTokens ?? [], question: props.question };
  const pipelineSignals = await runDiagnosisPipeline(ctx);

  if (pipelineSignals.length === 0) return;

  if (attemptCount.value === 2) {
    // 第二次錯誤：顯示具體診斷（過濾掉單純高亮的結果）
    const validSignals = pipelineSignals.filter(s => s.code !== 'HIGHLIGHT_ONLY');
    signals.value = validSignals.length > 0 ? validSignals : pipelineSignals;
    playError();
    isWrong.value = true;
  } else {
    // 第三次錯誤：啟動 L5 高亮兜底
    signals.value = pipelineSignals;
    playError();
    isWrong.value = true;
  }

  const displayed = props.question.ui_mode === 'REDUCE' ? pipelineSignals.slice(0, 1) : pipelineSignals;
  displayed.forEach((signal) => {
    if (signal.code !== 'HIGHLIGHT_ONLY' && signal.code !== 'TRY_AGAIN') {
      emit('misconception', signal.code);
    }
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

    <div v-else-if="question.ui_mode === 'REDUCE'" class="reduce-sentence-mode"
      :class="{ 'success-bg': isSuccess, 'shake': isWrong }">
      <div class="sentence-display">
        <template v-for="(tile, index) in answerArea" :key="tile.id">
          <div v-if="tile.draggable" class="removable-word" draggable="true"
            @dragstart="handleDragStart(index)" @dragover.prevent @drop="handleDrop(index)"
            :aria-label="'移除「' + tile.text.replace(/[\[\]]/g, '') + '」'"
            :class="{ 'tile-error': isError(index), 'tile-success': isSuccess }" @click="discardTile(tile)">
            {{ tile.text.replace(/[\[\]]/g, '') }} <button type="button" class="reduce-remove-btn" @click.stop="discardTile(tile)">移除</button>
          </div>
          <span v-else class="fixed-word" :class="{ 'tile-error': isError(index), 'tile-success': isSuccess }">
            {{ tile.text.replace(/[\[\]]/g, '') }}
          </span>
        </template>
      </div>
      <div class="trash-zone-wrapper">
        <div class="trash-label">🗑️ 垃圾桶（{{ trashArea.length }}）· 點擊字磚還原</div>
        <div class="trash-area">
          <div v-for="tile in trashArea" :key="tile.id" class="trash-tile" @click="restoreTile(tile)">
            <span>{{ tile.text.replace(/[\[\]]/g, '') }}</span>
            <button type="button" class="trash-restore-button" @click.stop="restoreTile(tile)">還原</button>
          </div>
          <div v-if="trashArea.length === 0" class="trash-placeholder">（垃圾桶為空）</div>
        </div>
      </div>
    </div>

    <div v-else class="build-mode-wrapper">
      <!-- BUILD Cloze 變體：前後文 + 挖空區，學生將字磚填入挖空 -->
      <div v-if="question.contextCloze" class="cloze-build-mode">
        <div class="cloze-sentence" :class="{ 'success-bg': isSuccess, 'shake': isWrong }">
          <span class="cloze-prefix">{{ question.contextCloze.prefix }}</span>
          <div class="cloze-blank" @drop="handleClozeDrop" @dragover="handleClozeDragOver">
            <div v-for="(tile, index) in answerArea" :key="tile.id" class="cloze-tile"
              :class="{ 'tile-error': isError(index), 'tile-success': isSuccess }">
              {{ tile.text.replace(/[\\[\\]]/g, '') }}
              <button type="button" class="cloze-remove" @click.stop="unselectTile(tile)">✕</button>
            </div>
            <div v-if="answerArea.length === 0" class="cloze-placeholder">[ 將字磚拖入此處填空 ]</div>
          </div>
          <span class="cloze-suffix">{{ question.contextCloze.suffix }}</span>
        </div>
        <div class="word-bank">
          <div v-for="tile in wordBank" :key="tile.id" class="tile"
            :class="{ 'tile-chunk': tile.text.startsWith('['), 'can-morph': tile.can_morph }"
            draggable="true" @dragstart="handleClozeDragStart(tile)" @click="selectTile(tile)">
            {{ tile.text.replace(/[\\[\\]]/g, '') }}
          </div>
        </div>
        <button class="check-answer-button" @click="checkAnswer(true)">Check Answer</button>
      </div>

      <!-- 現有全句重排模式 -->
      <div v-else>
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
    </div>

    <div v-if="signals.length > 0" class="alert-bubble" :class="{ 'soft-warning': signals[0].code === 'TRY_AGAIN' }">
      <div class="alert-icon">{{ signals[0].code === 'TRY_AGAIN' ? '💡' : '⚠️' }}</div>
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

    <button v-if="signals.length > 0 && (signals[0].code === 'HIGHLIGHT_ONLY' || signals[0].source === 'languagetool')"
      class="continue-button" @click="emit('continue')">
      繼續下一題 →
    </button>
  </div>
</template>

<style scoped>
.grammar-canvas {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 200px;
  position: relative;
}

/* === FIXED MORPH STYLES === */
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

/* === REDUCE STYLES === */
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

/* === BUILD STYLES === */
.build-mode-wrapper {
  display: flex;
  flex-direction: column;
  gap: 24px;
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
  transition: all 0.2s;
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

.tile.can-morph {
  border-color: #9c27b0;
  background-color: #f3e8ff;
  color: #9c27b0;
}

/* === SHARED STYLES === */
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
  animation: slideDown 0.2s;
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

.morph-menu button:hover,
.morph-menu button:focus-visible {
  background: #f3e8ff;
  color: #9c27b0;
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
  animation: slideDown 0.3s ease-out;
}

/* 👈 溫和提示的樣式 */
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

@keyframes slideDown {
  from {
    transform: translateY(-10px);
    opacity: 0;
  }

  to {
    transform: translateY(0);
    opacity: 1;
  }
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

@keyframes fadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@media (max-width: 600px) {
  .grammar-canvas {
    gap: 14px;
    min-height: 0;
  }

  .answer-area,
  .word-bank,
  .trash-area {
    gap: 8px;
    min-height: 64px;
    padding: 10px;
  }

  .answer-slot,
  .empty-slot {
    min-width: 44px;
    min-height: 44px;
  }

  .tile {
    max-width: 100%;
    padding: 9px 12px;
    font-size: 1rem;
  }
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

.option-hint {
  font-size: 0.8rem;
  color: #7c3aed;
  font-weight: normal;
  margin-top: 4px;
}

.morph-feedback {
  margin-top: 16px;
  padding: 12px 16px;
  border-radius: 8px;
  font-weight: bold;
  font-size: 1rem;
  animation: slideDown 0.3s ease;
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
/* === BUILD CLOZE (克漏字) STYLES === */
.cloze-build-mode {
  display: flex;
  flex-direction: column;
  gap: 22px;
  align-items: center;
}
.cloze-sentence {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 24px;
  border: 2px solid #d5e0e8;
  border-radius: 16px;
  background: #ffffff;
  font-size: clamp(1.2rem, 3vw, 1.8rem);
  line-height: 1.7;
  min-height: 92px;
}
.cloze-sentence.success-bg { border-color: #58cc02; background: #f0fff0; }
.cloze-sentence.shake { animation: shake 0.4s; }
.cloze-prefix, .cloze-suffix { color: #526879; }
.cloze-blank {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  border: 2px dashed #9ca3af;
  border-radius: 10px;
  padding: 8px 12px;
  background: #f3f4f6;
  min-width: 120px;
  justify-content: center;
}
.cloze-tile {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  color: #111827;
  font-weight: 600;
}
.cloze-remove {
  border: 0;
  background: transparent;
  color: #ef4444;
  cursor: pointer;
  font-weight: bold;
  padding: 0 4px;
  line-height: 1;
}
.cloze-remove:hover { background: #fee2e2; border-radius: 4px; }
.cloze-placeholder {
  color: #9ca3af;
  font-style: italic;
  padding: 6px 10px;
  border-radius: 6px;
}
/* === REDUCE CARD STYLES (卡片化 + 垃圾桶) === */
.reduce-sentence-mode .sentence-display {
  gap: 10px 16px;
}
.reduce-sentence-mode .removable-word {
  display: inline-flex !important;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border: 2px solid #ef4444 !important;
  border-radius: 10px;
  background: #fff0f0 !important;
  color: #dc2626 !important;
  font-weight: 700 !important;
  font-size: 1.15rem !important;
  cursor: pointer;
}
.reduce-sentence-mode .reduce-text { font-weight: 700; }
.reduce-sentence-mode .reduce-remove-btn {
  border: 1px solid #ef4444;
  border-radius: 6px;
  background: #ffffff;
  color: #dc2626;
  padding: 2px 8px;
  font-size: 0.8rem;
  font-weight: 800;
  cursor: pointer;
}
.reduce-sentence-mode .reduce-remove-btn:hover { background: #fecaca; }
.reduce-sentence-mode .trash-tile {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #f3f4f6;
  color: #6b7280;
  cursor: pointer;
  font-weight: 600;
}
.reduce-sentence-mode .trash-tile:hover { background: #e5e7eb; border-color: #1cb0f6; color: #1cb0f6; }
.reduce-sentence-mode .trash-restore-button {
  border: 1px solid #1cb0f6;
  border-radius: 6px;
  padding: 2px 8px;
  background: #fff;
  color: #1cb0f6;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}
.reduce-sentence-mode .trash-restore-button:hover { background: #bfdbfe; }

</style>
