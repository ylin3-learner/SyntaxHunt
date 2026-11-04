<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { diagnoseGrammar } from '../rules/grammarRules';
import { mapOffsetToChunkIndex } from '../rules/adapter';
import type { DiagnosticSignal, GrammarQuestionData, Chunk } from '../rules/types';
import { useSound } from '../utils/useSound';
import { useTTS } from '../utils/useSpeech';
import { CloudDatabase, type LanguageToolMatch } from '../services/CloudDatabase';

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
  (e: 'continue'): void;
}>();

// 將字塊轉換為 UI 狀態
const answerArea = ref<Chunk[]>([]);
const trashArea = ref<Chunk[]>([]);
const wordBank = ref<Chunk[]>([]);
const answerSlotCount = computed(() =>
  Math.max(props.question.correctAnswer.length, answerArea.value.length)
);
const signals = ref<DiagnosticSignal[]>([]);
const isSuccess = ref(false);
const isWrong = ref(false);
const remoteStatus = ref('');
const canContinue = ref(false);
const isCheckingLanguageTool = ref(false);

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
let activeDiagnosisController: AbortController | undefined;
let diagnosisTimeout: ReturnType<typeof setTimeout> | undefined;

onBeforeUnmount(() => {
  diagnosisRequest++;
  activeDiagnosisController?.abort();
  if (diagnosisTimeout) clearTimeout(diagnosisTimeout);
  if (successTimeout) clearTimeout(successTimeout);
});

// 處理 MORPH 模式的點擊切換
const toggleMorphMenu = (chunk: Chunk) => {
  if (!chunk.can_morph || isSuccess.value) return;
  activeMorphId.value = activeMorphId.value === chunk.id ? null : chunk.id;
};

const selectMorph = (chunk: Chunk, newText: string) => {
  chunk.text = newText;
  const options = chunk.options ?? chunk.morph_options ?? [];
  chunk.current_index = Math.max(0, options.indexOf(newText));
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

const moveReducedTile = (tile: Chunk, direction: -1 | 1) => {
  if (isSuccess.value || props.question.ui_mode !== 'REDUCE') return;
  const index = answerArea.value.findIndex(current => current.id === tile.id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= answerArea.value.length) return;

  answerArea.value.splice(index, 1);
  answerArea.value.splice(nextIndex, 0, tile);
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
  activeDiagnosisController?.abort();
  activeDiagnosisController = undefined;
  if (diagnosisTimeout) clearTimeout(diagnosisTimeout);
  diagnosisTimeout = undefined;
  isWrong.value = false;
  signals.value = [];
  remoteStatus.value = '';
  canContinue.value = false;
  isCheckingLanguageTool.value = false;
};

const checkAnswer = async (force = false) => {
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

  if (!force && props.question.ui_mode !== 'REDUCE' && studentTokens.length < correctTokens.length) return;
  const requestId = ++diagnosisRequest;
  const localSignals = diagnoseGrammar(studentTokens, correctTokens, props.question);
  const definiteSignals = localSignals
    .filter(signal => signal.code !== 'UNKNOWN_ERROR')
    .map(signal => ({ ...signal, source: 'local' as const }));
  const displayedSignals = props.question.ui_mode === 'REDUCE'
    ? definiteSignals.slice(0, 1)
    : definiteSignals;

  if (displayedSignals.length > 0) {
    signals.value = displayedSignals;
    playError();
    displayedSignals.forEach(signal => emit('misconception', signal.code));
    return;
  }

  const controller = new AbortController();
  activeDiagnosisController = controller;
  remoteStatus.value = '正在連線檢查進階文法…';
  canContinue.value = false;
  isCheckingLanguageTool.value = true;
  let timedOut = false;
  let requestTimeout: ReturnType<typeof setTimeout> | undefined;
  const submittedText = studentTokens.map(token => token.replace(/[\[\]]/g, '')).join(' ');
  const timeout = new Promise<never>((_, reject) => {
    requestTimeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new Error('LanguageTool request timed out.'));
    }, 3000);
    diagnosisTimeout = requestTimeout;
  });

  try {
    const matches = await Promise.race([
      CloudDatabase.checkLanguageTool(submittedText, controller.signal),
      timeout,
    ]);
    if (requestId !== diagnosisRequest) return;

    const languageToolSignals = matches.map(match =>
      toLanguageToolSignal(match, submittedText, studentTokens)
    );
    const displayedLanguageToolSignals = props.question.ui_mode === 'REDUCE'
      ? languageToolSignals.slice(0, 1)
      : languageToolSignals;
    signals.value = displayedLanguageToolSignals;
    if (displayedLanguageToolSignals.length > 0) {
      playError();
      displayedLanguageToolSignals.forEach(signal => {
        void CloudDatabase.logEvent({
          student_name: '匿名學生',
          question_id: props.question.id,
          error_code: signal.ruleId || signal.code,
          source: 'languagetool',
          category: signal.category,
          rule_id: signal.ruleId,
          diagnosis: signal,
        });
      });
      remoteStatus.value = '';
    } else {
      remoteStatus.value = '進階文法檢查目前沒有其他建議，請再檢查答案。';
      canContinue.value = true;
    }
  } catch (error) {
    if (requestId !== diagnosisRequest) return;
    if (!timedOut) console.error('LanguageTool 診斷失敗:', error);
    remoteStatus.value = '系統連線中，暫無法提供進階文法建議';
    canContinue.value = true;
  } finally {
    if (requestTimeout) clearTimeout(requestTimeout);
    if (diagnosisTimeout === requestTimeout) diagnosisTimeout = undefined;
    if (activeDiagnosisController === controller) {
      activeDiagnosisController = undefined;
      isCheckingLanguageTool.value = false;
    }
  }
};

const toLanguageToolSignal = (
  match: LanguageToolMatch,
  submittedText: string,
  submittedChunks: string[]
): DiagnosticSignal => ({
  code: match.rule.id,
  source: 'languagetool',
  ruleId: match.rule.id,
  category: match.rule.category?.name,
  offset: match.offset,
  length: match.length,
  index: mapOffsetToChunkIndex(
    submittedText,
    match.offset,
    match.length,
    submittedChunks.map(token => token.replace(/[\[\]]/g, ''))
  ),
  message: match.message,
  replacements: match.replacements,
  nativeMatch: match,
});

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
        <div v-for="(_, index) in answerSlotCount" :key="index" class="answer-slot">
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
              <div v-for="opt in (answerArea[index].options ?? answerArea[index].morph_options)" :key="opt"
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
        }">
          <span class="reduce-tile-text">{{ tile.text.replace(/[\[\]]/g, '') }}</span>
          <div class="reduce-tile-actions">
            <button type="button" class="reduce-reorder-button" :disabled="index === 0 || isSuccess"
              :aria-label="`將「${tile.text.replace(/[\[\]]/g, '')}」往左移`"
              @click="moveReducedTile(tile, -1)">←</button>
            <button type="button" class="reduce-reorder-button"
              :disabled="index === answerArea.length - 1 || isSuccess"
              :aria-label="`將「${tile.text.replace(/[\[\]]/g, '')}」往右移`"
              @click="moveReducedTile(tile, 1)">→</button>
            <button type="button" class="reduce-discard-button" :disabled="isSuccess"
              :aria-label="`移除「${tile.text.replace(/[\[\]]/g, '')}」`"
              @click="discardTile(tile)">移除</button>
          </div>
        </div>
      </template>
    </div>
    <button v-if="question.ui_mode !== 'REDUCE' && answerArea.length > 0
      && answerArea.length < question.correctAnswer.length && signals.length === 0
      && !isCheckingLanguageTool"
      type="button" class="check-answer-button" @click.stop="checkAnswer(true)">
      檢查目前答案
    </button>

    <!-- 錯誤提示 -->
    <div v-if="signals.length > 0" class="alert-bubble">
      <div class="alert-icon">⚠️</div>
      <div class="alert-messages">
        <div v-for="(s, index) in signals" :key="`${s.code}-${index}`">
          <p>{{ s.message }}</p>
          <p v-if="s.category" class="diagnosis-meta">
            {{ s.source === 'languagetool' ? 'LanguageTool' : '本地診斷' }} · {{ s.category }}
            <span v-if="s.ruleId"> · {{ s.ruleId }}</span>
          </p>
          <p v-if="s.replacements?.length" class="diagnosis-replacements">
            建議：<span v-for="replacement in s.replacements.slice(0, 5)" :key="replacement.value">
              {{ replacement.value }}
            </span>
          </p>
          <p v-if="s.hint" class="hint-text">💡 {{ s.hint }}</p>
        </div>
      </div>
    </div>
    <div v-else-if="isWrong" class="gentle-alert">
      <p>順序好像不太對喔，使用左右箭頭調整，或點擊多餘字磚退回看看！</p>
    </div>
    <div v-if="remoteStatus" class="remote-status" role="status" :aria-busy="!canContinue">
      <span>{{ remoteStatus }}</span>
      <button v-if="canContinue" type="button" class="continue-button" @click="emit('continue')">
        下一題（略過）
      </button>
    </div>

    <!-- 垃圾桶 (Reduce) -->
    <div v-if="question.ui_mode === 'REDUCE'" class="trash-zone-wrapper">
      <div class="reduce-instructions">
        <strong>怎麼操作</strong>
        <span>用 <b>← →</b> 調整詞序；按字塊上的 <b>移除</b> 刪除多餘詞；需要時到下方垃圾桶按 <b>還原</b>。</span>
      </div>
      <div class="trash-label">🗑️ 已移除的字塊（{{ trashArea.length }}）· 點擊還原</div>
      <div class="trash-area">
        <div v-for="tile in trashArea" :key="tile.id" class="trash-tile">
          <span>{{ tile.text.replace(/[\[\]]/g, '') }}</span>
          <button type="button" class="trash-restore-button"
            :aria-label="`還原「${tile.text.replace(/[\[\]]/g, '')}」`"
            @click="restoreTile(tile)">還原 ↶</button>
        </div>
        <div v-if="trashArea.length === 0" class="trash-placeholder">
          尚未移除字塊。按上方字塊的「移除」後，可在這裡還原。
        </div>
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

.remote-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 12px;
  background: #f1f3f5;
  color: #68717b;
}

.check-answer-button {
  align-self: flex-start;
  padding: 8px 14px;
  border: 1px solid #b9ddf1;
  border-radius: 8px;
  background: #e8f6ff;
  color: #155e87;
  font-weight: 700;
  cursor: pointer;
}

.diagnosis-meta {
  margin: 4px 0;
  color: #68717b;
  font-size: .85rem;
}

.diagnosis-replacements {
  margin: 6px 0;
}

.diagnosis-replacements span {
  display: inline-block;
  margin: 2px 6px 2px 0;
  padding: 2px 8px;
  border-radius: 999px;
  background: #e7f5ff;
  color: #155e87;
}

.continue-button {
  padding: 8px 14px;
  border: 1px solid #c5cbd1;
  border-radius: 8px;
  background: #fff;
  color: #4b5560;
  font-weight: 700;
  cursor: pointer;
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

.reduce-instructions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px 12px;
  margin-bottom: 14px;
  padding: 12px 16px;
  border: 1px solid #b9ddf1;
  border-radius: 12px;
  background: #f0f9ff;
  color: #35566a;
  line-height: 1.5;
  text-align: center;
}

.reduce-instructions strong {
  color: #155e87;
}

.trash-label {
  font-size: 0.9rem;
  font-weight: bold;
  color: #6b7280;
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
  color: #7b8490;
  font-size: 1rem;
  display: flex;
  align-items: center;
  text-align: center;
}

.trash-tile {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px 8px 14px;
  border: 1px solid #d5d9de;
  border-radius: 12px;
  background: #f0f0f0;
  color: #999;
  text-decoration: line-through;
  opacity: 0.7;
  transition: all 0.2s;
}

.trash-tile:hover,
.trash-tile:focus-within {
  opacity: 1;
  background: white;
  border-color: #1cb0f6;
  color: #1cb0f6;
}

.trash-tile span {
  text-decoration: line-through;
}

.trash-restore-button {
  padding: 5px 9px;
  border: 1px solid #b9ddf1;
  border-radius: 8px;
  background: #fff;
  color: #155e87;
  font-weight: 700;
  cursor: pointer;
  text-decoration: none;
}

.is-reduce-mode {
  gap: 10px;
  height: auto;
  cursor: default;
}

.reduce-tile-text {
  flex: 1;
}

.reduce-tile-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding-left: 8px;
  border-left: 1px solid rgba(75, 75, 75, 0.18);
}

.reduce-discard-button {
  padding: 6px 9px;
  border: 1px solid #f1b6b6;
  border-radius: 8px;
  background: #fff5f5;
  color: #a52c2c;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}

.reduce-discard-button:hover:not(:disabled) {
  border-color: #e56767;
  background: #ffe6e6;
}

.reduce-discard-button:disabled,
.reduce-reorder-button:disabled {
  opacity: 0.35;
  cursor: default;
}

.reduce-reorder-button {
  min-width: 28px;
  min-height: 30px;
  padding: 0 5px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: 1;
  cursor: pointer;
  text-decoration: none;
}

.reduce-reorder-button:hover:not(:disabled) {
  background: rgba(21, 94, 135, 0.1);
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