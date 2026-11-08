<script setup lang="ts">
import { ref, computed, defineAsyncComponent, onMounted, onUnmounted, watch } from 'vue';
import TeacherAnalytics from './components/TeacherAnalytics.vue';
import NoticingBoard from './components/NoticingBoard.vue';
import SummaryReport from './components/SummaryReport.vue';
import DebugConsole from './components/DebugConsole.vue';

import StagePreview from './components/stages/StagePreview.vue';
import StageInput from './components/stages/StageInput.vue';
import StageMacro from './components/stages/StageMacro.vue';
import StageMicro from './components/stages/StageMicro.vue';
import StageContrast from './components/stages/StageContrast.vue';
import StageSuccess from './components/stages/StageSuccess.vue';
import AuthModal from './components/AuthModal.vue'; // 引入抽離的 Modal

import type { QuestionData, SSTCategory } from './rules/types';
import { formatAnswerForDisplay } from './rules/adapter';
import { getQuestionUiMode } from './rules/types';
import { unlockAudioContext, useSound } from './utils/useSound';
import { unlockTTS } from './utils/useSpeech';
import { CloudDatabase } from './services/CloudDatabase';
import { defaultQuestions } from './data/questions';

import { useFocusMonitor } from './composables/useFocusMonitor';
import { useClassroomSync, currentRoomCode } from './composables/useClassroomSync';
import { useQuizFlow } from './composables/useQuizFlow';
import { useAdminAuth } from './composables/useAdminAuth';
import { useRoomEntry } from './composables/useRoomEntry';
import { useRealtimeSync } from './composables/useRealtimeSync'; // 引入抽離的同步邏輯

const TeacherAdmin = defineAsyncComponent(() => import('./components/TeacherAdmin.vue'));
const isDebugMode = window.location.search.includes('debug=1');

// ---- Composables ----
const quizFlow = useQuizFlow();
const adminAuth = useAdminAuth();
const roomEntry = useRoomEntry();
const { playError, playWarningBeep } = useSound();

const { joinRoom, trackCompleted, trackAnswering, sendResetProgress, sendPush, sendAddTime, leaveRoom, findTeacherByRoomCode } = useClassroomSync();

// ---- 從 QuizFlow 解構 ----
const {
  currentIndex, currentStage, currentMode, questionBank, showSummary, completedCount, sessionLog,
  isClassMode, targetCount, presenceCompletedCount, timeLeft, isTimeUp, startTimer, addTime, clearTimer,
  currentQuestion, microQuestion, instructionText,
  checkAndSetInitialStage, handleSuccess, nextQuestion, handleUnpack, handlePreviewSuccess,
  handleInputSuccess, handleChunkWrongAnswer, updateQuestionBank, handleBatchQuestionImport,
  handleAddTime, handleNoticingComplete, restartGame,
  unitFilter, availableUnits, filteredQuestions, changeUnit // 新增的單元過濾
} = quizFlow;

// ---- 從 AdminAuth 解構 ----
const {
  currentTeacherId, isAdminAuthenticated, adminEmailInput, adminPasswordInput, showAdminAuth, pendingAction,
  isRegisterMode, verifyAdmin, registerAdmin, logoutAdmin, cancelAuth, openAdmin, openAnalytics
} = adminAuth;

// ---- 從 RoomEntry 解構 ----
const { roomCodeInput, joinError, isJoining, showRoomEntry } = roomEntry;

// ---- 本地狀態 ----
const showAdmin = ref(false);
const showAnalytics = ref(false);

const studentId = sessionStorage.getItem('student_uuid') || `stu_${Date.now()}_${Math.random().toString(36).substring(7)}`;
sessionStorage.setItem('student_uuid', studentId);

const seatCode = ref<string>(sessionStorage.getItem('seat_code') || '');
const showFocusWarning = ref(false);
const realtimeNotice = ref('');

const handleDistracted = () => {
  playWarningBeep();
  showFocusWarning.value = true;
  setTimeout(() => { showFocusWarning.value = false; }, 3000);
};

useFocusMonitor(handleDistracted);

// 使用抽離的 Realtime 事件處理
const { handleRealtimeEvent, lockedUnit } = useRealtimeSync(quizFlow, realtimeNotice);

// ---- UI 路由 ----
const currentStageComponent = computed(() => {
  if (currentQuestion.value?.type === 'contrast') return StageContrast;

  let comp = null;

  if (currentStage.value === 'success') comp = StageSuccess;
  else if (currentStage.value === 'preview') comp = StagePreview;
  else if (currentStage.value === 'input') comp = StageInput;
  else if (currentStage.value === 'macro') comp = StageMacro;
  else if (currentStage.value === 'micro') comp = StageMicro;

  return comp;
});

// ---- 生命週期 ----
const handleGlobalInteraction = () => {
  unlockAudioContext();
  unlockTTS();
  document.removeEventListener('pointerup', handleGlobalInteraction);
};

onMounted(async () => {
  document.addEventListener('pointerup', handleGlobalInteraction);

  if (!seatCode.value) {
    seatCode.value = `S${String(Math.floor(Math.random() * 30) + 1).padStart(2, '0')}`;
    sessionStorage.setItem('seat_code', seatCode.value);
  }

  // 1. 先決定我們要連線到哪個老師的頻道
  let activeTeacherId = sessionStorage.getItem('teacher_id');
  const urlParams = new URLSearchParams(window.location.search);
  const roomFromUrl = urlParams.get('room');

  if (!activeTeacherId && roomFromUrl) {
    // 如果有 ?room= 但還沒加入過，我們先查出老師 ID
    const tid = await findTeacherByRoomCode(roomFromUrl);
    if (tid) {
      activeTeacherId = tid;
      sessionStorage.setItem('teacher_id', tid);
      sessionStorage.setItem('room_code', roomFromUrl.toUpperCase());

      // 清除網址上的 ?room=
      const url = new URL(window.location.href);
      url.searchParams.delete('room');
      window.history.replaceState({}, '', url.toString());
    }
  }

  // 2. 根據 activeTeacherId 決定從哪裡載入題庫
  // 修正：確保如果是 null 或 'public_room'，都轉換為 undefined
  const targetTeacherId = activeTeacherId && activeTeacherId !== 'public_room' ? activeTeacherId : undefined;
  const cloudQuestions = await CloudDatabase.fetchQuestions(targetTeacherId);

  if (cloudQuestions && cloudQuestions.length > 0) {
    updateQuestionBank(cloudQuestions);
  } else {
    // Fallback 到本機或預設題庫
    const saved = localStorage.getItem('custom_questions');
    if (saved) {
      try { updateQuestionBank(JSON.parse(saved)); } catch (e) { updateQuestionBank([...defaultQuestions] as unknown as QuestionData[]); }
    } else {
      updateQuestionBank([...defaultQuestions] as unknown as QuestionData[]);
    }
  }

  // 3. 決定是否加入頻道
  if (activeTeacherId) {
    joinRoom(handleRealtimeEvent, activeTeacherId, studentId);
  } else {
    // 如果沒有老師 ID，代表還沒輸入班級代碼
    showRoomEntry.value = true;
  }
});

onUnmounted(() => {
  document.removeEventListener('pointerup', handleGlobalInteraction);
  leaveRoom();
});

watch(
  [() => currentQuestion.value?.id, () => currentQuestion.value?.timeLimit, () => currentQuestion.value?.isTimed, currentStage],
  ([newId, newTimeLimit, isTimed, newStage], [oldId, oldTimeLimit, oldIsTimed, oldStage]) => {
    const isTestingPhase = ['input', 'macro', 'micro'].includes(newStage as string);
    if (isTestingPhase && isTimed && newTimeLimit) {
      if (newId !== oldId || newTimeLimit !== oldTimeLimit || (!['input', 'macro', 'micro'].includes(oldStage || '') && isTestingPhase)) {
        startTimer(newTimeLimit);
      }
    } else {
      if (!isTestingPhase || !isTimed) {
        clearTimer();
      }
    }
  },
  { immediate: true }
);

const fullSentenceData = computed(() => {
  const q = currentQuestion.value;
  if (!q) return { target: '', display: '', modifier: '' };

  const noun = q.targetNoun;
  const modifier = getQuestionUiMode(q) === 'REDUCE'
    ? formatAnswerForDisplay(microQuestion.value?.correctAnswer ?? [])
    : q.grammarFeature
      ? q.type === 'contrast'
        ? q.grammarFeature.relative.label
        : q.grammarFeature[currentMode.value].label
      : formatAnswerForDisplay(microQuestion.value?.correctAnswer ?? []);
  return { target: `${noun} ${modifier} is my favorite.`, display: `${noun} | ${modifier} | is my favorite.`, modifier };
});

const handleMisconception = (code: string) => {
  if (!sessionLog.value.includes(code)) sessionLog.value.push(code);
  const sst: SSTCategory = code.startsWith('M:') ? 'Omission' : code.startsWith('U:') ? 'Addition' : code.startsWith('O:') ? 'Misordering' : code === 'DUPLICATE_PRONOUN' || code === 'NOT_REDUCED' || code === 'INCOMPLETE_REDUCTION' ? 'Addition' : code === 'WRONG_ORDER' || code === 'PUZZLE_ERROR' ? 'Misordering' : 'Misformation';

  CloudDatabase.logEvent({
    student_name: '匿名學生',
    question_id: currentQuestion.value?.id ?? '',
    error_code: code,
    source: 'local',
    sst
  });
};

const handleOpenAdmin = () => {
  openAdmin(showAdmin, (v) => pendingAction.value = v);
};
const handleOpenAnalytics = () => {
  openAnalytics(showAnalytics, (v) => pendingAction.value = v);
};

const handleLocalSync = (updatedQuestions: QuestionData[]) => quizFlow.handleLocalSync(updatedQuestions);
const handlePushQuestion = (id: string) => {
  quizFlow.handlePushQuestion(id);
  showAdmin.value = false;
};
const handleTimeoutNext = () => quizFlow.nextQuestion();
</script>

<template>
  <div class="app-container">
    <Transition name="fade">
      <div v-if="showFocusWarning" class="focus-warning-overlay">
        <div class="warning-box">
          <h2>⚠️ 請保持專注！</h2>
          <p>偵測到您切換了畫面，請回到學習任務。</p>
        </div>
      </div>
    </Transition>

    <div v-if="currentQuestion?.isTimed && !isTimeUp && ['input', 'macro', 'micro'].includes(currentStage as string)"
      class="timer-bar" :class="{ 'urgent': timeLeft <= 10 }">
      ⏱️ 剩餘時間：{{ timeLeft }} 秒
      <button v-if="isAdminAuthenticated" class="btn-add-time" @click="handleAddTime(30)">+30s</button>
    </div>

    <Transition name="fade">
      <div v-if="isTimeUp" class="timeout-overlay">
        <div class="timeout-box">
          <h2>⏰ 時間到！</h2>
          <p>挑戰失敗，請再接再厲！</p>
          <button class="btn-timeout-next" @click="handleTimeoutNext">進入下一題 ➔</button>
        </div>
      </div>
    </Transition>

    <header>
      <h1>🕵️ SyntaxHunt</h1>
      <span v-if="!isAdminAuthenticated" class="seat-badge">座號：{{ seatCode }}</span>

      <div class="header-controls">
        <div class="status-group">
          <div v-if="targetCount > 0" class="progress-tracker"
            :class="{ 'all-done': presenceCompletedCount >= targetCount }">
            ✅ 作答進度：{{ presenceCompletedCount }} / {{ targetCount }} 人
          </div>

          <!-- 新增：單元切換器 -->
           <!-- 修改：如果 lockedUnit === 'all' 且非上課模式，才顯示選單 -->
          <div v-if="availableUnits.length > 0 && !isClassMode && lockedUnit === 'all'" class="unit-selector">
            <select :value="unitFilter" @change="changeUnit(($event.target as HTMLSelectElement).value)">
              <option value="all">📚 全部單元</option>
              <option v-for="unit in availableUnits" :key="unit" :value="unit">{{ unit }}</option>
            </select>
          </div>

          <!-- 新增：如果被老師鎖定，顯示唯讀的提示 -->
          <div v-else-if="lockedUnit !== 'all'" class="locked-unit-badge">
            🔒 鎖定單元：{{ lockedUnit }}
          </div>

          <div class="progress-bar">第 {{ currentIndex + 1 }} / {{ filteredQuestions.length }} 關</div>
        </div>

        <div class="action-group">
          <button class="btn btn-finish" @click="showSummary = true">
            <span class="btn-icon">🏁</span> <span class="btn-text">結束練習</span>
          </button>
          <template v-if="isAdminAuthenticated">
            <button class="btn btn-admin" @click="handleOpenAdmin">
              <span class="btn-icon">👩‍🏫</span> <span class="btn-text">教師備課中心</span>
            </button>
            <button class="btn btn-logout" @click="logoutAdmin">
              <span class="btn-icon">🚪</span> <span class="btn-text">登出教師</span>
            </button>
          </template>
          <button class="btn btn-analytics" @click="handleOpenAnalytics">
            <span class="btn-icon">📊</span> <span class="btn-text">數據分析</span>
          </button>
        </div>
      </div>
    </header>

    <Transition name="fade">
      <div v-if="instructionText" class="instruction-banner">
        💡 {{ instructionText }}
      </div>
    </Transition>
    <div v-if="realtimeNotice" class="realtime-warning" role="status">
      {{ realtimeNotice }}
    </div>

    <main v-if="currentQuestion" class="game-card" :key="currentQuestion.id + currentMode">
      <div v-if="currentStage === 'noticing' && currentQuestion.noticingData" class="stage-content"
        style="justify-content: center;">
        <NoticingBoard :data="currentQuestion.noticingData as NonNullable<typeof currentQuestion.noticingData>"
          @complete="handleNoticingComplete" />
      </div>

      <component v-else :is="currentStageComponent" class="stage-content" :question="currentQuestion"
        :full-sentence-data="fullSentenceData" :is-class-mode="isClassMode" :current-index="currentIndex"
        :question-bank-length="filteredQuestions.length" @success="handleSuccess" @next="nextQuestion"
        @continue="nextQuestion(true)" @unpack="handleUnpack" @misconception="handleMisconception"
        @wrong-answer="handleChunkWrongAnswer" @preview-success="handlePreviewSuccess"
        @input-success="handleInputSuccess" />
    </main>

    <SummaryReport v-if="showSummary" :completedLevels="completedCount" :totalLevels="filteredQuestions.length"
      :misconceptions="sessionLog" @restart="restartGame" />

    <TeacherAnalytics v-if="showAnalytics" :questionBank="questionBank" @close="showAnalytics = false" />

    <!-- 使用抽離的 AuthModal -->
    <AuthModal :is-open="showAdminAuth" :is-register-mode="isRegisterMode" :email="adminEmailInput"
      :password="adminPasswordInput" @update:email="adminEmailInput = $event"
      @update:password="adminPasswordInput = $event" @update:is-register-mode="isRegisterMode = $event"
      @cancel="cancelAuth" @submit="isRegisterMode ? registerAdmin() : verifyAdmin()" />

    <TeacherAdmin v-if="showAdmin" :currentQuestions="questionBank" :room-code="currentRoomCode"
      @update="updateQuestionBank" @batch-import="handleBatchQuestionImport" @sync-local="handleLocalSync"
      @push="handlePushQuestion" @close="showAdmin = false" />

    <DebugConsole v-if="isDebugMode" />
  </div>
</template>

<style scoped>
/* (這裡保留你原本的 CSS，但我已經確保這裡是乾淨的，直接貼上即可) */
:root {
  --primary-color: #1cb0f6;
  --success-color: #58cc02;
  --warning-color: #ffc800;
  --danger-color: #ff4b4b;
  --purple-color: #9c27b0;
  --text-main: #333;
  --text-muted: #777;
  --bg-main: #f7f9fc;
}

.app-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 40px 20px;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background-color: var(--bg-main);
  box-sizing: border-box;
}

header {
  text-align: center;
  margin-bottom: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

header h1 {
  color: var(--primary-color);
  font-size: 2.4rem;
  letter-spacing: -0.5px;
  margin: 0;
  font-weight: 900;
  text-shadow: 0 2px 4px rgba(28, 176, 246, 0.15);
}

.seat-badge {
  font-weight: bold;
  color: var(--text-muted, #666);
  font-size: 1rem;
  padding: 4px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.05);
}

.header-controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
}

.status-group {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.progress-tracker,
.progress-bar {
  padding: 8px 20px;
  border-radius: 20px;
  font-weight: bold;
  font-size: 0.95rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-tracker {
  background: #fff3e0;
  color: #ff9800;
  transition: all 0.3s ease;
}

.progress-tracker.all-done {
  background: #dcfce7;
  color: #166534;
  box-shadow: 0 0 12px rgba(88, 204, 2, 0.4);
}

.progress-bar {
  background: #e6f7ff;
  color: var(--primary-color);
}

/* 新增：單元下拉選單樣式 */
.unit-selector select {
  padding: 8px 16px;
  border-radius: 20px;
  border: 2px solid #1cb0f6;
  background: #e6f7ff;
  color: #1cb0f6;
  font-weight: bold;
  font-size: 0.95rem;
  outline: none;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(28, 176, 246, 0.1);
}

.unit-selector select:focus {
  border-color: #1899d6;
  background: #d0efff;
}

.action-group {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  width: 100%;
  max-width: 850px;
}

.btn {
  border: none;
  padding: 10px 20px;
  border-radius: 12px;
  font-weight: 800;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  white-space: nowrap;
  color: #ffffff !important;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  filter: brightness(1.1);
}

.btn:active {
  transform: translateY(2px) !important;
  box-shadow: 0 0px 0px transparent !important;
}

.btn-icon {
  font-size: 1.1rem;
  line-height: 1;
}

.btn-finish {
  background: #ff6b6b;
  border-bottom: 4px solid #e05252;
}

.btn-finish:hover {
  background: #ff5252;
}

.btn-admin {
  background: #fbc02d;
  border-bottom: 4px solid #dca500;
}

.btn-logout {
  background: #9e9e9e;
  border-bottom: 4px solid #757575;
}

.btn-logout .btn-icon {
  filter: grayscale(1) brightness(10);
}

.btn-analytics {
  background: #ab47bc;
  border-bottom: 4px solid #8e24aa;
}

.instruction-banner {
  background: #fff8e1;
  color: #b45309;
  text-align: center;
  padding: 12px 20px;
  border-radius: 12px;
  font-weight: bold;
  font-size: 1.05rem;
  margin-bottom: 20px;
  border: 2px dashed #fcd34d;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.1);
  animation: slideDown 0.3s ease-out;
}

.realtime-warning {
  margin: -8px 0 18px;
  padding: 10px 14px;
  border: 1px solid #f59e0b;
  border-radius: 10px;
  background: #fffbeb;
  color: #92400e;
  text-align: center;
  font-size: 0.9rem;
}

.game-card {
  background: white;
  border-radius: 24px;
  padding: 40px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.06);
  border: 2px solid #f0f0f0;
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
}

.stage-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
}

.target-noun {
  text-align: center;
  font-size: 2.2rem;
  font-weight: 800;
  margin-bottom: 30px;
  color: var(--text-main);
}

.highlight {
  color: var(--primary-color);
  position: relative;
}

.highlight::after {
  content: '';
  position: absolute;
  bottom: 2px;
  left: 0;
  width: 100%;
  height: 6px;
  background: rgba(28, 176, 246, 0.2);
  border-radius: 4px;
  z-index: -1;
}

.success-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  text-align: center;
  animation: popIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  padding: 20px 0;
}

.confetti {
  font-size: 5rem;
  margin-bottom: 16px;
  animation: bounce 1s infinite alternate;
}

@keyframes bounce {
  0% {
    transform: translateY(0);
  }

  100% {
    transform: translateY(-10px);
  }
}

.success-screen h2 {
  color: var(--success-color);
  font-size: 2.2rem;
  margin: 0 0 24px 0;
  font-weight: 800;
}

.btn-primary {
  background-color: #58cc02 !important;
  color: #ffffff !important;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  border: none;
  border-bottom: 5px solid #46a302;
  padding: 16px 48px;
  font-size: 1.2rem;
  font-weight: bold;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.1s;
  margin-top: 20px;
  width: 100%;
  max-width: 300px;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

.btn-primary:active:not(:disabled) {
  border-bottom-width: 0;
  transform: translateY(5px);
}

.btn-primary:disabled {
  background-color: #cccccc !important;
  border-bottom-color: #999999 !important;
  cursor: not-allowed;
  text-shadow: none;
}

.skip-hint {
  color: #999;
  font-size: 0.95rem;
  margin-bottom: 24px;
}

.timeout-overlay,
.focus-warning-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
  backdrop-filter: blur(4px);
}

.timeout-overlay {
  background: rgba(0, 0, 0, 0.6);
  z-index: 99999;
}

.focus-warning-overlay {
  background: rgba(255, 75, 75, 0.15);
  pointer-events: none;
  z-index: 99999;
}

.timeout-box,
.warning-box {
  background: white;
  border-radius: 24px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.2);
  animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  text-align: center;
}

.timeout-box {
  padding: 40px;
  border: 4px solid var(--danger-color);
}

.warning-box {
  padding: 24px 40px;
  border: 3px solid var(--danger-color);
  box-shadow: 0 12px 32px rgba(255, 75, 75, 0.3);
}

.timeout-box h2 {
  font-size: 1.5rem;
  margin: 0 0 8px 0;
}

.timeout-box h2,
.warning-box h2 {
  color: var(--danger-color);
  font-size: 2rem;
}

.warning-box h2 {
  font-size: 1.5rem;
  margin: 0 0 8px 0;
}

.timeout-box p,
.warning-box p {
  color: var(--text-muted);
  font-size: 0.95rem;
  margin-bottom: 20px;
}

.btn-timeout-next,
.btn-add-time {
  flex: 1;
  padding: 14px;
  border-radius: 12px;
  font-weight: bold;
  cursor: pointer;
  border: none;
  transition: all 0.1s;
  font-size: 1rem;
}

.btn-timeout-next {
  background: var(--danger-color);
  color: white;
  border-bottom: 4px solid #cc0000;
  width: 100%;
  padding: 16px 32px;
}

.btn-timeout-next:active {
  border-bottom-width: 0;
  transform: translateY(4px);
}

.timer-bar {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: #e6f7ff;
  color: var(--primary-color);
  padding: 8px 24px;
  border-radius: 20px;
  font-weight: bold;
  font-size: 1.2rem;
  z-index: 9999;
  box-shadow: 0 4px 12px rgba(28, 176, 246, 0.2);
  display: flex;
  align-items: center;
  gap: 12px;
  white-space: nowrap;
}

.timer-bar.urgent {
  background: #ffe6e6;
  color: var(--danger-color);
  animation: pulse 1s infinite;
}

.btn-add-time {
  background: var(--primary-color);
  color: white;
  padding: 4px 12px;
  border-radius: 8px;
  font-size: 0.9rem;
  flex: none;
}

.btn-add-time:active {
  transform: scale(0.95);
}

@keyframes popIn {
  0% {
    transform: scale(0.9);
    opacity: 0;
  }

  100% {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes pulse {
  0% {
    transform: translateX(-50%) scale(1);
  }

  50% {
    transform: translateX(-50%) scale(1.05);
  }

  100% {
    transform: translateX(-50%) scale(1);
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

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 600px) {
  header h1 {
    font-size: 1.8rem;
  }

  .game-card {
    padding: 24px;
  }

  .action-group {
    gap: 8px;
  }

  .btn {
    padding: 8px 16px;
    font-size: 0.85rem;
  }

  .progress-tracker,
  .progress-bar {
    font-size: 0.85rem;
    padding: 6px 16px;
  }

  .timer-bar {
    font-size: 1rem;
    padding: 6px 16px;
    top: 10px;
  }

  .instruction-banner {
    font-size: 0.95rem;
    padding: 10px 16px;
  }
}

.locked-unit-badge {
  padding: 8px 16px;
  border-radius: 20px;
  background: #fff3e0;
  color: #b45309;
  font-weight: bold;
  font-size: 0.95rem;
  border: 2px dashed #fcd34d;
}
</style>