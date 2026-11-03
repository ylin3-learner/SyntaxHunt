<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { diagnoseGrammar } from '../rules/grammarRules';
import type { DiagnosticSignal, GrammarQuestionData, Chunk } from '../rules/types';
import { useSound } from '../utils/useSound';
import { useTTS } from '../utils/useSpeech';
import { CloudDatabase } from '../services/CloudDatabase';

const { playError, playSuccess } = useSound();
const { speak } = useTTS();

const props = defineProps<{
  question: GrammarQuestionData;
  initialChunks: Chunk[];
  speechRate?: number;
}>();

const emit = defineEmits<{
  (e: 'success'): void;
  (e: 'misconception', code: string): void;
}>();

// 將字塊轉換為 UI 狀態
const answerArea = ref<Chunk[]>([]);
const trashArea = ref<Chunk[]>([]);
const wordBank = ref<Chunk[]>([]);
const signals = ref<DiagnosticSignal[]>([]);
const isSuccess = ref(false);
const isWrong = ref(false);
const remoteStatus = ref('');

// 處理展開變形選單的狀態
const activeMorphId = ref<string | null>(null);

const initTiles = () => {
  if (props.question.ui_mode === 'REDUCE') {
    answerArea.value = JSON.parse(JSON.stringify(props.initialChunks));
    trashArea.value = [];
    wordBank.value = [];
  } else {
    // BUILD or MORPH 模式
    wordBank.value = JSON.parse(JSON.stringify(props.initialChunks));
    answerArea.value = [];
    trashArea.value = [];
  }
};

initTiles();

let diagnosisRequest = 0;
let successTimeout: ReturnType<typeof setTimeout> | undefined;

onBeforeUnmount(() => {
  diagnosisRequest++;
  if (successTimeout) clearTimeout(successTimeout);
});

// 處理 MORPH 模式的點擊切換
const toggleMorphMenu = (chunk: Chunk) => {
  if (!chunk.can_morph || isSuccess.value) return;
  activeMorphId.value = activeMorphId.value === chunk.id ? null : chunk.id;
};

const selectMorph = (chunk: Chunk, newText: string) => {
  chunk.text = newText;
  activeMorphId.value = null;
  resetState();
  void checkAnswer();
};

// 丟棄字塊 (Reduce 模式)
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

// 從字庫加入作答區 (Build 模式)
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
  diagnosisRequest++;
  isWrong.value = false;
  signals.value = [];
  remoteStatus.value = '';
};

const checkAnswer = async () => {
  const studentTokens = answerArea.value.map(t => t.text);
  const correctTokens = props.question.correctAnswer;

  if (studentTokens.length === 0 && props.question.ui_mode !== 'REDUCE') return;

  const normalize = (tokens: string[]) =>
    tokens.map(token => token.replace(/[\[\]]/g, '').trim().toLowerCase().replace(/^[.,!?;:]+|[.,!?;:]+$/g, '')).join(' ');
  const cleanCurrent = normalize(studentTokens);
  const cleanTarget = normalize(correctTokens);
  if (cleanCurrent === cleanTarget) {
    diagnosisRequest++;
    playSuccess();
    isSuccess.value = true;
    speak(studentTokens.map(token => token.replace(/[\[\]]/g, '')).join(' '), {
      rate: props.speechRate ?? 0.8,
    });
    successTimeout = setTimeout(() => emit('success'), 1500);
    return;
  }

  if (props.question.ui_mode !== 'REDUCE' && studentTokens.length < correctTokens.length) return;
  const requestId = ++diagnosisRequest;
  const localSignals = diagnoseGrammar(studentTokens, correctTokens, props.question);
  const definiteSignals = localSignals.filter(signal => signal.code !== 'UNKNOWN_ERROR');

  if (definiteSignals.length > 0) {
    signals.value = definiteSignals;
    playError();
    signals.value.forEach(s => emit('misconception', s.code));
    return;
  }

  try {
    const cachedDiagnosis = await CloudDatabase.lookupDiagnosis(props.question.id, studentTokens);
    if (requestId !== diagnosisRequest) return;
    if (cachedDiagnosis) {
      signals.value = [cachedDiagnosis];
      emit('misconception', cachedDiagnosis.code);
      playError();
      return;
    }
  } catch (error) {
    console.error('查詢預建診斷快取失敗:', error);
  }

  if (requestId !== diagnosisRequest) return;

  try {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('診斷逾時')), 3000);
    });
    const diagnosis = await Promise.race([
      CloudDatabase.diagnoseWithAI(studentTokens, correctTokens, props.question),
      timeout,
    ]).finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });
    if (requestId !== diagnosisRequest) return;
    signals.value = [diagnosis];
    emit('misconception', diagnosis.code);
    playError();
  } catch (error) {
    if (requestId !== diagnosisRequest) return;
    console.error('AI 文法診斷失敗:', error);
    remoteStatus.value = '系統忙碌，請先對照正確答案。';
    const fallback: DiagnosticSignal = {
      code: 'UNKNOWN_ERROR',
      sst: 'Misformation',
      index: -1,
      message: remoteStatus.value,
      hint: '請檢查答案，或稍後再試。',
    };
    signals.value = [fallback];
    emit('misconception', fallback.code);
    playError();
  }
};

const isError = (index: number) => signals.value.some(s => s.index === index);

// 點擊其他地方關閉變形選單
const handleOutsideClick = () => {
  activeMorphId.value = null;
};
</script>

<template>
  <div class="grammar-canvas" @click="handleOutsideClick">
    <!-- 克漏字上下文 -->
    <div class="cloze-context" v-if="question.contextCloze">
      <span class="cloze-text">{{ question.contextCloze.prefix }}</span>
      <div class="cloze-blanks-container">
        <template v-if="question.ui_mode !== 'REDUCE'">
          <span v-for="(_, index) in question.correctAnswer.length" :key="index" class="cloze-blank-slot"
            :class="{ 'has-text': answerArea[index] }">
            {{ answerArea[index] ? answerArea[index].text.replace(/[\[\]]/g, '') : '' }}
          </span>
        </template>
        <template v-else>
          <span v-for="(tile, index) in answerArea" :key="index" class="cloze-blank-slot has-text">
            {{ tile.text.replace(/[\[\]]/g, '') }}
          </span>
          <span v-if="answerArea.length === 0" class="cloze-blank-slot placeholder"
            style="min-width: 100px; border-bottom: 3px dashed #1cb0f6; height: 38px;"></span>
        </template>
      </div>
      <span class="cloze-text">{{ question.contextCloze.suffix }}</span>
    </div>

    <!-- 作答區 -->
    <div class="answer-area" :class="{ 'success-bg': isSuccess, 'shake': isWrong }">
      <template v-if="question.ui_mode !== 'REDUCE'">
        <div v-for="(slot, index) in question.correctAnswer.length" :key="index" class="answer-slot">
          <div v-if="answerArea[index]" class="tile-wrapper">
            <div class="tile" :class="{
              'tile-error': isError(index),
              'tile-success': isSuccess,
              'tile-wrong': isWrong,
              'tile-chunk': answerArea[index].text.startsWith('['),
              'can-morph': answerArea[index].can_morph
            }"
              @click.stop="answerArea[index].can_morph ? toggleMorphMenu(answerArea[index]) : unselectTile(answerArea[index])">
              {{ answerArea[index].text.replace(/[\[\]]/g, '') }}
            </div>
            <button v-if="answerArea[index].can_morph" type="button"
              class="tile-remove" aria-label="移除字塊" @click.stop="unselectTile(answerArea[index])">×</button>
            <!-- 變形下拉選單 -->
            <div v-if="activeMorphId === answerArea[index].id" class="morph-menu">
              <div v-for="opt in answerArea[index].morph_options" :key="opt"
                @click.stop="selectMorph(answerArea[index], opt)">
                {{ opt }}
              </div>
            </div>
          </div>
          <div v-else class="empty-slot"></div>
        </div>
      </template>
      <template v-else>
        <div v-for="(tile, index) in answerArea" :key="tile.id" class="tile is-reduce-mode" :class="{
          'tile-error': isError(index),
          'tile-success': isSuccess,
          'tile-wrong': isWrong,
          'tile-chunk': tile.text.startsWith('[')
        }" @click="discardTile(tile)">
          {{ tile.text.replace(/[\[\]]/g, '') }}
        </div>
      </template>
    </div>

    <!-- 錯誤提示 -->
    <div v-if="signals.length > 0" class="alert-bubble">
      <div class="alert-icon">⚠️</div>
      <div class="alert-messages">
        <p v-for="s in signals" :key="s.code">{{ s.message }}</p>
        <p v-if="signals[0].hint" class="hint-text">💡 {{ signals[0].hint }}</p>
      </div>
    </div>
    <div v-else-if="isWrong" class="gentle-alert">
      <p>順序好像不太對喔，點擊字磚退回重排看看！</p>
    </div>

    <!-- 垃圾桶 (Reduce) -->
    <div v-if="question.ui_mode === 'REDUCE'" class="trash-zone-wrapper">
      <div class="trash-label">🗑️ 丟棄不需要的詞</div>
      <div class="trash-area">
        <div v-for="tile in trashArea" :key="tile.id" class="tile trash-tile" @click="restoreTile(tile)">
          {{ tile.text.replace(/[\[\]]/g, '') }}
        </div>
        <div v-if="trashArea.length === 0" class="trash-placeholder">點擊上方不要的字磚，把它們丟到這裡！</div>
      </div>
    </div>

    <!-- 字庫 (Build/Morph) -->
    <div v-if="question.ui_mode !== 'REDUCE'" class="word-bank">
      <div v-for="tile in wordBank" :key="tile.id" class="tile"
        :class="{ 'tile-chunk': tile.text.startsWith('['), 'can-morph': tile.can_morph }"
        @click="selectTile(tile)">
        {{ tile.text.replace(/[\[\]]/g, '') }}
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 這裡保留你原本的 CSS，我新增了 Morph 選單的樣式 */
.grammar-canvas {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 300px;
  position: relative;
}

.answer-area,
.word-bank,
.trash-area {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  min-height: 80px;
  padding: 16px;
  border-radius: 16px;
  transition: all 0.3s;
}

.answer-area {
  border-bottom: 4px dashed #e5e5e5;
  background: #fdfdfd;
  align-items: center;
}

.answer-area.success-bg {
  border-bottom-color: #58cc02;
  background: #f0fff0;
}

.word-bank {
  border: 2px solid #e5e5e5;
  background: #ffffff;
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

.tile-remove {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 50%;
  background: #ff4b4b;
  color: #fff;
  font-weight: bold;
  cursor: pointer;
  z-index: 2;
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

.tile-wrong {
  background-color: #fff3e0 !important;
  border-color: #ff9800 !important;
  color: #e65100 !important;
}

/* Morph 下拉選單 */
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
  animation: slideDown 0.2s;
}

.morph-menu div {
  padding: 10px 20px;
  font-weight: bold;
  cursor: pointer;
  text-align: center;
  color: #333;
  transition: background 0.2s;
}

.morph-menu div:hover {
  background: #f3e8ff;
  color: #9c27b0;
}

/* 其他原本的樣式 (Alert, Trash, Cloze...) 保持不變，請直接沿用你原本的 */
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

.alert-icon {
  font-size: 1.5rem;
}

.alert-messages p {
  margin: 0 0 4px 0;
}

.hint-text {
  color: #666;
  font-size: 0.9rem;
  font-weight: normal;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed rgba(255, 75, 75, 0.3);
}

.gentle-alert {
  text-align: center;
  color: #ff9800;
  font-weight: bold;
  animation: fadeIn 0.3s ease-out;
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
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #e6f7ff;
  color: #1cb0f6;
  border-radius: 8px;
  border-bottom: 3px dashed #1cb0f6;
  padding: 0 8px;
  transition: all 0.2s;
  box-sizing: border-box;
}

.cloze-blank-slot.has-text {
  background: #d0f0ff;
  border-bottom-style: solid;
}

.trash-zone-wrapper {
  margin-top: 16px;
  border-top: 2px dashed #eee;
  padding-top: 20px;
}

.trash-label {
  font-size: 0.9rem;
  font-weight: bold;
  color: #999;
  margin-bottom: 8px;
  text-align: center;
}

.trash-area {
  background: #fafafa;
  border: 2px dashed #ccc;
  min-height: 80px;
  justify-content: center;
}

.trash-placeholder {
  color: #ccc;
  font-size: 1rem;
  display: flex;
  align-items: center;
}

.trash-tile {
  background: #f0f0f0;
  color: #999;
  border-color: #ddd;
  text-decoration: line-through;
  opacity: 0.7;
  transition: all 0.2s;
}

.trash-tile:hover {
  opacity: 1;
  background: white;
  border-color: #1cb0f6;
  color: #1cb0f6;
  text-decoration: none;
}

.is-reduce-mode:hover {
  background-color: #ffe6e6;
  border-color: #ff4b4b;
  color: #ff4b4b;
  text-decoration: line-through;
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

  .cloze-context {
    font-size: 1.1rem;
  }
}
</style>