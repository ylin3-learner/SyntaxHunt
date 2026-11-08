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
  handleAddTime, handleNoticingComplete, restartGame
} = quizFlow;

// ---- 從 AdminAuth 解構 ----
const {
  currentTeacherId, isAdminAuthenticated, adminEmailInput, adminPasswordInput, showAdminAuth, pendingAction,
  verifyAdmin, logoutAdmin, cancelAuth, openAdmin, openAnalytics
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

// ---- UI 路由 ----
const currentStageComponent = computed(() => {
  console.log('當前題型:', currentQuestion.value?.type, '當前階段:', currentStage.value);
  if (currentQuestion.value?.type === 'contrast') return StageContrast;

  let comp = null;

  if (currentStage.value === 'success') comp = StageSuccess;
  else if (currentStage.value === 'preview') comp = StagePreview;
  else if (currentStage.value === 'input') comp = StageInput;
  else if (currentStage.value === 'macro') comp = StageMacro;
  else if (currentStage.value === 'micro') comp = StageMicro;

  // 加上這行，重整網頁後看控制台印出什麼
  if (comp) console.log(`[Debug] 嘗試渲染組件:`, comp, `是否有 template/render:`, !!(comp.template || comp.render));

  return comp;
});

// ---- 生命週期 ----
const handleGlobalInteraction = () => {
  unlockAudioContext();
  unlockTTS();
  document.removeEventListener('pointerup', handleGlobalInteraction);
};

const handleRealtimeEvent = (event: string, payload: any) => {
  if (event === 'REALTIME_STATUS') {
    realtimeNotice.value = payload.status === 'SUBSCRIBED' ? '' : '班級同步連線中斷；目前題目仍可繼續作答，連線恢復後會自動同步。';
  }
  if (event === 'SYNC_ERROR') {
    realtimeNotice.value = '班級同步暫時無法使用；本機作答仍可繼續。';
    const errorMsg = payload.message?.message || JSON.stringify(payload.message) || '未知錯誤';
    console.error('班級同步錯誤:', errorMsg);
  }
  if (event === 'SYNC_STATE') {
    if (payload.isClassMode !== undefined) isClassMode.value = payload.isClassMode;
    if (payload.targetCount !== undefined) targetCount.value = payload.targetCount;

    const targetId = payload.id;
    const targetEndTime = payload.timerEndTime;

    if (targetId && currentQuestion.value?.id !== targetId) {
      const idx = questionBank.value.findIndex(q => q.id === targetId);
      if (idx !== -1) {
        currentIndex.value = idx;
        checkAndSetInitialStage();
        trackAnswering();
      }
    }

    if (targetEndTime) {
      const remaining = Math.max(0, Math.floor((targetEndTime - Date.now()) / 1000));
      if (currentQuestion.value) {
        currentQuestion.value.isTimed = true;
        currentQuestion.value.timeLimit = remaining;
      }
      startTimer(remaining);
    } else {
      clearTimer();
    }
  }
  if (event === 'PRESENCE_SYNC') {
    presenceCompletedCount.value = payload.completedCount;
  }
  if (event === 'RESET_PROGRESS') {
    trackAnswering();
  }
};

onMounted(async () => {
  document.addEventListener('pointerup', handleGlobalInteraction);

  const cloudQuestions = await CloudDatabase.fetchQuestions();
  if (cloudQuestions && cloudQuestions.length > 0) {
    updateQuestionBank(cloudQuestions);
  } else {
    const saved = localStorage.getItem('custom_questions');
    if (saved) {
      try { updateQuestionBank(JSON.parse(saved)); } catch (e) { updateQuestionBank([...defaultQuestions] as unknown as QuestionData[]); }
    } else {
      updateQuestionBank([...defaultQuestions] as unknown as QuestionData[]);
    }
  }

  if (!seatCode.value) {
    seatCode.value = `S${String(Math.floor(Math.random() * 30) + 1).padStart(2, '0')}`;
    sessionStorage.setItem('seat_code', seatCode.value);
  }

  const urlParams = new URLSearchParams(window.location.search);
  const roomFromUrl = urlParams.get('room');

  if (roomFromUrl) {
    await roomEntry.handleJoinRoom(roomFromUrl, currentTeacherId, studentId, handleRealtimeEvent);
    return;
  }

  const savedTeacherId = sessionStorage.getItem('teacher_id');
  const activeTeacherId = savedTeacherId || 'public_room';

  if (activeTeacherId === 'public_room') {
    showRoomEntry.value = true;
  } else {
    joinRoom(handleRealtimeEvent, activeTeacherId, studentId);
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
      <span class="seat-badge">座號：{{ seatCode }}</span>

      <div class="header-controls">
        <div class="status-group">
          <div v-if="targetCount > 0" class="progress-tracker"
            :class="{ 'all-done': presenceCompletedCount >= targetCount }">
            ✅ 作答進度：{{ presenceCompletedCount }} / {{ targetCount }} 人
          </div>
          <div class="progress-bar">第 {{ currentIndex + 1 }} / {{ questionBank.length }} 關</div>
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
        :question-bank-length="questionBank.length" @success="handleSuccess" @next="nextQuestion"
        @continue="nextQuestion(true)" @unpack="handleUnpack" @misconception="handleMisconception"
        @wrong-answer="handleChunkWrongAnswer" @preview-success="handlePreviewSuccess"
        @input-success="handleInputSuccess" />
    </main>

    <SummaryReport v-if="showSummary" :completedLevels="completedCount" :totalLevels="questionBank.length"
      :misconceptions="sessionLog" @restart="restartGame" />

    <TeacherAnalytics v-if="showAnalytics" :questionBank="questionBank" @close="showAnalytics = false" />

    <div v-if="showAdminAuth" class="auth-overlay">
      <div class="auth-card">
        <h3>👩‍🏫 教師驗證</h3>
        <p>請輸入 Email 與密碼以進入系統</p>
        <input type="email" v-model="adminEmailInput" placeholder="Email" @keyup.enter="verifyAdmin" />
        <input type="password" v-model="adminPasswordInput" placeholder="密碼" @keyup.enter="verifyAdmin" />
        <div class="auth-actions">
          <button class="btn-cancel" @click="cancelAuth">取消</button>
          <button class="btn-confirm" @click="verifyAdmin">確認</button>
        </div>
      </div>
    </div>

    <TeacherAdmin v-if="showAdmin" :currentQuestions="questionBank" :room-code="currentRoomCode"
      @update="updateQuestionBank" @batch-import="handleBatchQuestionImport" @sync-local="handleLocalSync"
      @push="handlePushQuestion" @close="showAdmin = false" />

    <DebugConsole v-if="isDebugMode" />
  </div>
</template>

<style scoped>
/* 保持原本樣式，請直接沿用你原本的 Style */
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

.auth-overlay,
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

.auth-overlay {
  background: rgba(0, 0, 0, 0.5);
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

.auth-card,
.timeout-box,
.warning-box {
  background: white;
  border-radius: 24px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.2);
  animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  text-align: center;
}

.auth-card {
  padding: 32px;
  width: 320px;
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

.auth-card h3,
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

.auth-card p,
.timeout-box p,
.warning-box p {
  color: var(--text-muted);
  font-size: 0.95rem;
  margin-bottom: 20px;
}

.auth-card input {
  width: 100%;
  padding: 14px;
  border: 2px solid #e5e5e5;
  border-radius: 12px;
  font-size: 1rem;
  box-sizing: border-box;
  margin-bottom: 20px;
  outline: none;
  transition: border 0.2s;
}

.auth-card input:focus {
  border-color: var(--primary-color);
}

.auth-actions {
  display: flex;
  gap: 12px;
}

.auth-actions button,
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

.btn-cancel {
  background: #f0f0f0;
  color: var(--text-muted);
}

.btn-confirm {
  background: var(--primary-color);
  color: white;
  border-bottom: 4px solid #1899d6;
}

.btn-confirm:active {
  border-bottom-width: 0;
  transform: translateY(4px);
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

  .room-entry-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    backdrop-filter: blur(4px);
  }

  .room-entry-card {
    background: #fff;
    padding: 32px;
    border-radius: 16px;
    text-align: center;
    min-width: 320px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  }

  .room-entry-card h2 {
    margin-top: 0;
    margin-bottom: 8px;
    font-size: 1.5rem;
    color: #1cb0f6;
  }

  .room-entry-card p {
    margin: 6px 0 16px 0;
    color: #555;
  }

  .room-entry-card input {
    width: 100%;
    padding: 12px;
    font-size: 1rem;
    border: 1px solid #ccc;
    border-radius: 8px;
    margin-bottom: 12px;
    box-sizing: border-box;
  }

  .room-entry-card button {
    width: 100%;
    padding: 12px;
    background: var(--primary-color);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    cursor: pointer;
  }

  .room-entry-card button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}
</style>