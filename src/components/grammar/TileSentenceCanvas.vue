<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { diagnoseGrammar } from '../../rules/grammarRules';
import { mapOffsetToChunkIndex, normalizeAnswer } from '../../utils/textUtils';
import type { DiagnosticSignal, GrammarQuestionData, Chunk } from '../../rules/types';
import { useSound } from '../../utils/useSound';
import { useTTS } from '../../utils/useSpeech';
import { CloudDatabase, type LanguageToolMatch } from '../../services/CloudDatabase';
import { shuffleArray } from '../../utils/shuffle';

const { playError, playSuccess } = useSound();
const { speak } = useTTS();

const props = withDefaults(defineProps<{
  question: GrammarQuestionData;
  initialChunks: Chunk[];
  speechRate?: number;
  fixedMorph?: boolean;
  shuffleWordBank?: boolean;
}>(), {
  shuffleWordBank: true,
});

const emit = defineEmits<{
  (e: 'success'): void;
  (e: 'misconception', code: string): void;
  (e: 'continue'): void;
}>();

// 將字塊轉換為 UI 狀態
const answerArea = ref<Chunk[]>([]);
const trashArea = ref<Chunk[]>([]);
const wordBank = ref<Chunk[]>([]);
const isFixedMorph = computed(() => props.fixedMorph || props.question.ui_mode === 'MORPH');
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
  if (isFixedMorph.value) {
    answerArea.value = JSON.parse(JSON.stringify(props.initialChunks.map(chunk => ({
      ...chunk,
    }))));
    trashArea.value = [];
    wordBank.value = [];
  } else if (props.question.ui_mode === 'REDUCE') {
    answerArea.value = JSON.parse(JSON.stringify(props.initialChunks));
    trashArea.value = [];
    wordBank.value = [];
  } else {
    // BUILD or MORPH 模式
    const chunks = props.shuffleWordBank
      ? shuffleArray(props.initialChunks)
      : props.initialChunks;
    wordBank.value = JSON.parse(JSON.stringify(chunks));
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

// 紀錄當前反饋
const morphFeedback = ref<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

const selectMorph = (chunk: Chunk, newText: string, hintText?: string) => {
  chunk.text = newText;
  const options = chunk.options ?? chunk.morph_options ?? [];
  chunk.current_index = Math.max(0, options.indexOf(newText));

  // 顯性反饋：顯示元語言提示
  const isCorrect = props.question.correctAnswer.includes(newText);
  morphFeedback.value = {
    text: hintText || (isCorrect ? `✅ 正確！這裡使用 ${newText} 表示非現實假設。` : `❌ 這裡不符合假設語氣喔，再想想看。`),
    type: isCorrect ? 'success' : 'error'
  };

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

  const cleanCurrent = normalizeAnswer(studentTokens);
  const cleanTarget = normalizeAnswer(correctTokens);
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

  // 1. 先把作答區的字塊拼起來 (去除中括號)
  const answerText = studentTokens.map(token => token.replace(/[\[\]]/g, '')).join(' ');

  // 2. 從 props 裡拿出克漏字上下文，拼接成完整句子
  let submittedText = answerText;
  const cloze = props.question?.contextCloze;

  if (cloze) {
    const prefix = cloze.prefix || '';
    const suffix = cloze.suffix || '';
    // 組合前綴、作答、後綴，並清除多餘的連續空白
    submittedText = `${prefix} ${answerText} ${suffix}`.replace(/\s+/g, ' ').trim();
  }

  const timeout = new Promise<never>((_, reject) => {
    requestTimeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new Error('LanguageTool request timed out.'));
    }, 8000);
    diagnosisTimeout = requestTimeout;
  });

  try {
    const matches = await Promise.race([
      CloudDatabase.checkLanguageTool(submittedText, controller.signal),
      timeout,
    ]);
    if (requestId !== diagnosisRequest) return;

    // 在呼叫前計算前綴長度 (包含那個空白)
    const prefixLength = cloze && cloze.prefix ? cloze.prefix.length + 1 : 0;

    const languageToolSignals = matches.map(match =>
      toLanguageToolSignal(match, submittedText, studentTokens, prefixLength)
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
  submittedChunks: string[],
  prefixLength: number
): DiagnosticSignal => {
  // 核心修正：計算相對於作答區的偏移量
  // 使用 Math.max(0, ...) 避免因為前綴的錯誤導致負數
  const relativeOffset = Math.max(0, match.offset - prefixLength);

  // 這裡才是回傳物件
  return {
    code: match.rule.id,
    source: 'languagetool',
    ruleId: match.rule.id,
    category: match.rule.category?.name,
    offset: relativeOffset,
    length: match.length,
    index: mapOffsetToChunkIndex(
      submittedText,
      relativeOffset,
      match.length,
      submittedChunks.map(token => token.replace(/[\[\]]/g, ''))
    ),
    message: match.message,
    replacements: match.replacements,
    nativeMatch: match,
  };
};

const isError = (index: number) => signals.value.some(s => s.index === index);

// 點擊其他地方關閉變形選單
const handleOutsideClick = () => {
  activeMorphId.value = null;
};
</script>

<template>
  <div class="grammar-canvas" @click="handleOutsideClick">

    <!-- ======== 1. FIXED MORPH (膠囊化句子) ======== -->
    <div v-if="isFixedMorph" class="fixed-morph-sentence" :class="{ 'success-bg': isSuccess, 'shake': isWrong }">
      <span v-if="question.contextCloze" class="fixed-context">{{ question.contextCloze.prefix }}</span>

      <template v-for="(chunk, index) in answerArea" :key="chunk.id">
        <span v-if="index > 0 && !question.contextCloze" class="fixed-word-space"> </span>

        <!-- 這裡的 fixed-morph-token 是定位的基準點 -->
        <span v-if="chunk.can_morph" class="fixed-morph-token">
          <button type="button" class="morph-capsule" @click.stop="toggleMorphMenu(chunk)">
            {{ chunk.text.replace(/[\[\]]/g, '') }}
          </button>

          <!-- 選擇 + 理由的雙層選單 -->
          <div v-if="activeMorphId === chunk.id" class="morph-menu explicit-menu">
            <div class="menu-title">選擇正確形式：</div>
            <button v-for="option in (chunk.options ?? chunk.morph_options)" :key="option" type="button"
              @click.stop="selectMorph(chunk, option, option === 'were' ? '「與現在事實相反」的假設語氣，be 動詞一律用 were。' : undefined)">
              <strong class="option-text">{{ option }}</strong>
              <!-- 提示文字 (如果有設定) -->
              <span v-if="option === 'were'" class="option-hint">非現實假設 → were</span>
              <span v-if="option === 'could'" class="option-hint">非現實能力 → could</span>
            </button>
          </div>
        </span>

        <!-- 固定文字 -->
        <span v-else class="fixed-sentence-token" :class="{ 'tile-error': isError(index), 'tile-success': isSuccess }">
          {{ chunk.text.replace(/[\[\]]/g, '') }}
        </span>
      </template>

      <span v-if="question.contextCloze" class="fixed-context">{{ question.contextCloze.suffix }}</span>

      <!-- 反饋氣泡移出迴圈，作為整句的提示 -->
      <Transition name="fade">
        <div v-if="morphFeedback" class="morph-feedback" :class="morphFeedback.type">
          {{ morphFeedback.text }}
        </div>
      </Transition>
    </div>

    <!-- ======== 2. REDUCE (句子形式，只保留可點擊刪除的字) ======== -->
    <div v-else-if="question.ui_mode === 'REDUCE'" class="reduce-sentence-mode" :class="{ 'shake': isWrong }">

      <div class="sentence-display">
        <template v-for="(tile, index) in answerArea" :key="tile.id">
          <!-- 若該字磚被標記為可移除 (draggable)，顯示為按鈕 -->
          <button v-if="tile.draggable" type="button" class="removable-word"
            :class="{ 'tile-error': isError(index), 'tile-success': isSuccess }" @click="discardTile(tile)">
            {{ tile.text.replace(/[\[\]]/g, '') }}
            <span class="remove-hint">×</span>
          </button>

          <!-- 若不可移除，直接顯示為純文字 -->
          <span v-else class="fixed-word" :class="{ 'tile-error': isError(index), 'tile-success': isSuccess }">
            {{ tile.text.replace(/[\[\]]/g, '') }}
          </span>
        </template>
      </div>

      <!-- 垃圾桶區塊 -->
      <div class="trash-zone-wrapper">
        <div class="trash-label">🗑️ 已移除的字塊（{{ trashArea.length }}）· 點擊還原</div>
        <div class="trash-area">
          <div v-for="tile in trashArea" :key="tile.id" class="trash-tile">
            <span>{{ tile.text.replace(/[\[\]]/g, '') }}</span>
            <button type="button" class="trash-restore-button" @click="restoreTile(tile)">還原 ↶</button>
          </div>
          <div v-if="trashArea.length === 0" class="trash-placeholder">
            點擊上方有底線的字詞即可移除。
          </div>
        </div>
      </div>
    </div>

    <!-- ======== 3. BUILD (原本的插槽模式) ======== -->
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
    </div>

    <!-- 錯誤提示與其他共用 UI (保持不變) -->
    <div v-if="signals.length > 0" class="alert-bubble">
      <div class="alert-icon">⚠️</div>
      <div class="alert-messages">
        <div v-for="(s, index) in signals" :key="`${s.code}-${index}`">
          <p>{{ s.message }}</p>
          <p v-if="s.category" class="diagnosis-meta">{{ s.source === 'languagetool' ? 'LanguageTool' : '本地診斷' }} ·
            {{ s.category }}</p>
        </div>
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
  min-height: 200px;
  position: relative;
}

/* === FIXED MORPH 膠囊樣式 === */
.fixed-morph-sentence {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 6px;
  padding: 20px;
  border: 2px solid #d5e0e8;
  border-radius: 16px;
  background: #ffffff;
  font-size: clamp(1.2rem, 3vw, 1.8rem);
  line-height: 1.8;
  /* 稍微加大行高，避免選單擋住下一行 */
  transition: all 0.2s;
}

.fixed-context {
  color: #526879;
}

.fixed-sentence-token {
  padding: 4px 2px;
}

/* 關鍵：父容器必須是 relative，選單才能以此為基準向下展開 */
.fixed-morph-token {
  position: relative;
  display: inline-flex;
}

/* 膠囊按鈕 */
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

/* 選單絕對定位在膠囊正下方 */
.capsule-menu {
  position: absolute;
  top: 100%;
  /* 從膠囊底部開始 */
  left: 50%;
  /* 水平置中 */
  transform: translateX(-50%);
  margin-top: 8px;
  /* 與膠囊保持一點距離 */

  display: flex;
  flex-direction: column;
  min-width: 100px;
  background: white;
  border: 2px solid #9c27b0;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(156, 39, 176, 0.15);
  z-index: 50;
  /* 確保不被其他字塊蓋住 */
  overflow: hidden;
  animation: slideDown 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.capsule-menu button {
  display: block;
  width: 100%;
  padding: 12px 20px;
  border: 0;
  background: #ffffff;
  color: #333;
  font-weight: bold;
  font-size: 1.1rem;
  cursor: pointer;
  text-align: center;
  transition: background 0.2s;
}

.capsule-menu button:hover,
.capsule-menu button:focus-visible {
  background: #f3e8ff;
  color: #9c27b0;
}

/* === REDUCE 句子模式 === */
.reduce-sentence-mode {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 20px;
  background: #fafafa;
  border-radius: 16px;
  border: 2px dashed #e5e5e5;
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
  cursor: pointer;
  transition: all 0.2s;
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

/* ==========================================
   3. BUILD (磁吸插槽) - 👈 這是被漏掉的關鍵
   ========================================== */
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

/* 共用字磚樣式 */
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

/* ==========================================
   共用狀態與選單
   ========================================== */

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
  /* 關鍵：確保在 flex 容器中獨佔一行 */
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