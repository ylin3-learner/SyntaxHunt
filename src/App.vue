<script setup lang="ts">
import { ref, computed, defineAsyncComponent, onMounted, onUnmounted, watch } from 'vue';
import MacroDragCanvas from './components/MacroDragCanvas.vue';
import GrammarCanvas from './components/GrammarCanvas.vue';
import TeacherAnalytics from './components/TeacherAnalytics.vue';
import ContrastPuzzle from './components/ContrastPuzzle.vue';
import StructuredInput from './components/StructuredInput.vue';
import PronunciationAnalyzer from './components/PronunciationAnalyzer.vue';
import NoticingBoard from './components/NoticingBoard.vue';
import SummaryReport from './components/SummaryReport.vue';
import ChunkPreview from './components/ChunkPreview.vue';
import DebugConsole from './components/DebugConsole.vue';

import { defaultQuestions } from './data/questions';
import type { GrammarQuestionData, QuestionData, SSTCategory } from './rules/types';
import { convertLegacyQuestion, formatAnswerForDisplay } from './rules/adapter';
import { getQuestionUiMode } from './rules/types';
import { useSound, unlockAudioContext } from './utils/useSound';
import { unlockTTS } from './utils/useSpeech';
import { CloudDatabase } from './services/CloudDatabase';

import { useQuizTimer } from './composables/useQuizTimer';
import { useFocusMonitor } from './composables/useFocusMonitor';
import { useClassroomSync } from './composables/useClassroomSync';

const TeacherAdmin = defineAsyncComponent(() => import('./components/TeacherAdmin.vue'));

const isDebugMode = window.location.search.includes('debug=1');

const showAdmin = ref(false);
const showAnalytics = ref(false);
const pendingAction = ref<'admin' | 'analytics' | null>(null);
const currentIndex = ref(0);
const questionBank = ref<QuestionData[]>([]);
const currentStage = ref<'preview' | 'input' | 'macro' | 'micro' | 'success' | 'noticing'>('preview');
const currentMode = ref<'relative' | 'preposition'>('relative');

const { joinRoom, trackCompleted, trackAnswering, sendResetProgress, sendPush, sendAddTime, leaveRoom } = useClassroomSync();

const { playSuccess, playError, playWarningBeep } = useSound();

const showAdminAuth = ref(false);
const adminPasswordInput = ref('');
const isAdminAuthenticated = ref(sessionStorage.getItem('admin_auth') === 'true');
const sessionLog = ref<string[]>([]);
const showSummary = ref(false);
const completedCount = ref(0);

const studentId = sessionStorage.getItem('student_uuid') || `stu_${Date.now()}_${Math.random().toString(36).substring(7)}`;
sessionStorage.setItem('student_uuid', studentId);

const presenceCompletedCount = ref(0);
const targetCount = ref(0);
const isClassMode = ref(false);

const showFocusWarning = ref(false);
const realtimeNotice = ref('');

const handleDistracted = () => {
  playWarningBeep();
  showFocusWarning.value = true;
  setTimeout(() => { showFocusWarning.value = false; }, 3000);
};

useFocusMonitor(handleDistracted);

const { timeLeft, isTimeUp, startTimer, addTime, clearTimer } = useQuizTimer(() => {
  playError();
});

const handleGlobalInteraction = () => {
  unlockAudioContext();
  unlockTTS();
  document.removeEventListener('pointerup', handleGlobalInteraction);
};

onMounted(async () => {
  document.addEventListener('pointerup', handleGlobalInteraction);

  const cloudQuestions = await CloudDatabase.fetchQuestions();
  if (cloudQuestions && cloudQuestions.length > 0) {
    questionBank.value = cloudQuestions;
    localStorage.setItem('custom_questions', JSON.stringify(cloudQuestions));
  } else {
    const saved = localStorage.getItem('custom_questions');
    if (saved) {
      try { questionBank.value = JSON.parse(saved); } catch (e) { questionBank.value = [...defaultQuestions] as unknown as QuestionData[]; }
    } else {
      questionBank.value = [...defaultQuestions] as unknown as QuestionData[];
    }
  }
  fixAntecedentNumbers();
  checkAndSetInitialStage();

  joinRoom((event, payload) => {
    if (event === 'REALTIME_STATUS') {
      realtimeNotice.value = payload.status === 'SUBSCRIBED'
        ? ''
        : '班級同步連線中斷；目前題目仍可繼續作答，連線恢復後會自動同步。';
    }

    if (event === 'SYNC_ERROR') {
      realtimeNotice.value = '班級同步暫時無法使用；本機作答仍可繼續。';
      console.error('班級同步錯誤:', payload.message);
    }

    if (event === 'SYNC_STATE') {
      if (payload.isClassMode !== undefined) isClassMode.value = payload.isClassMode;
      if (payload.targetCount !== undefined) targetCount.value = payload.targetCount;

      const targetId = payload.id;
      const targetEndTime = payload.timerEndTime;

      if (targetId && currentQuestion.value.id !== targetId) {
        console.log('📡 題目已切換至:', targetId);
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
      console.log('📡 收到重置指令，進度歸零');
      trackAnswering();
    }
  }, studentId);
});

onUnmounted(() => {
  document.removeEventListener('pointerup', handleGlobalInteraction);
  leaveRoom();
});

const fixAntecedentNumbers = () => {
  questionBank.value.forEach(q => {
    if (q.targetNoun.toLowerCase().endsWith('s') && !q.targetNoun.toLowerCase().endsWith('is') && !q.targetNoun.toLowerCase().endsWith('this')) {
      q.antecedent.number = 'plural';
    }
  });
};

const currentQuestion = computed(() => questionBank.value[currentIndex.value] || (defaultQuestions[0] as unknown as QuestionData));
const getEnabledStages = computed<NonNullable<QuestionData['enabledStages']>>(() =>
  currentQuestion.value.enabledStages || (currentQuestion.value.type === 'grammar'
    ? ['micro']
    : ['input', 'macro', 'micro', 'pronunciation', 'noticing'])
);
const microQuestion = computed<GrammarQuestionData>(() => {
  const question = currentQuestion.value;
  const legacyFeature = question.mode === 'reduce' ? 'relative' : currentMode.value;
  return convertLegacyQuestion(question, legacyFeature);
});

const instructionText = computed(() => {
  if (currentStage.value === 'success' || currentStage.value === 'noticing') return '';
  if (currentQuestion.value.type === 'contrast') return '請將兩側的圖片配合英文，分別拖曳到中間的空格中，達到正確地語序。';
  if (currentStage.value === 'preview') return '請先觀察圖片並聽發音，選出正確的片語意思。';
  if (currentStage.value === 'input') return '請點擊喇叭聽發音，並選出符合描述的角色圖片。';
  if (currentStage.value === 'macro') return '請將角色圖塊拖曳到名詞的「後方」。';
  if (currentStage.value === 'micro') {
    return getQuestionUiMode(currentQuestion.value) === 'REDUCE'
      ? '點擊多餘字磚將它丟進垃圾桶；用字磚左右箭頭調整保留詞序。'
      : getQuestionUiMode(currentQuestion.value) === 'MORPH'
        ? '請排列字磚，並點擊紫色字磚切換成正確的單字形式。'
        : '請點擊下方的字磚，將它們排列成正確的英文句子。';
  }
  return '';
});

watch(
  [() => currentQuestion.value?.id, () => currentQuestion.value?.timeLimit, () => currentQuestion.value?.isTimed, currentStage],
  ([newId, newTimeLimit, isTimed, newStage], [oldId, oldTimeLimit, oldIsTimed, oldStage]) => {
    const isTestingPhase = ['input', 'macro', 'micro'].includes(newStage);
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

const checkAndSetInitialStage = () => {
  if (currentQuestion.value.type === 'grammar') { currentStage.value = 'micro'; return; }
  if (currentQuestion.value.type === 'contrast') { currentStage.value = 'macro'; return; }
  if (currentQuestion.value.type === 'chunk') { currentStage.value = 'preview'; return; }
  if (currentQuestion.value.previewData && getEnabledStages.value.includes('input')) currentStage.value = 'preview';
  else if (getEnabledStages.value.includes('input') && currentQuestion.value.inputData) currentStage.value = 'input';

  // 👈 關鍵修改：如果是 Reduce 題，直接跳過 Macro 進 Micro
  else if (currentQuestion.value.mode === 'reduce' && getEnabledStages.value.includes('micro')) currentStage.value = 'micro';

  else if (getEnabledStages.value.includes('macro')) currentStage.value = 'macro';
  else if (getEnabledStages.value.includes('micro')) currentStage.value = 'micro';
  else currentStage.value = 'success';
};

const handlePreviewSuccess = () => { currentQuestion.value.type === 'chunk' ? handleSuccess() : currentStage.value = 'input'; };

const fullSentenceData = computed(() => {
  const noun = currentQuestion.value.targetNoun;
  const modifier = getQuestionUiMode(currentQuestion.value) === 'REDUCE'
    ? formatAnswerForDisplay(microQuestion.value.correctAnswer)
    : currentQuestion.value.grammarFeature
    ? currentQuestion.value.type === 'contrast'
      ? currentQuestion.value.grammarFeature.relative.label
      : currentQuestion.value.grammarFeature[currentMode.value].label
    : getQuestionAnswer(currentQuestion.value).join(' ');
  return { target: `${noun} ${modifier} is my favorite.`, display: `${noun} | ${modifier} | is my favorite.`, modifier };
});

const handleMisconception = (code: string) => {
  if (!sessionLog.value.includes(code)) sessionLog.value.push(code);
  const sst: SSTCategory = code.startsWith('M:')
    ? 'Omission'
    : code.startsWith('U:')
      ? 'Addition'
      : code.startsWith('O:')
        ? 'Misordering'
        : code === 'DUPLICATE_PRONOUN' || code === 'NOT_REDUCED' || code === 'INCOMPLETE_REDUCTION'
          ? 'Addition'
          : code === 'WRONG_ORDER' || code === 'PUZZLE_ERROR'
            ? 'Misordering'
            : 'Misformation';
  CloudDatabase.logEvent({
    student_name: '匿名學生',
    question_id: currentQuestion.value.id,
    error_code: code,
    source: 'local',
    sst,
  });
};

const handleInputSuccess = () => {
  // 👈 關鍵修改：如果是 Reduce 題，從 Input 直接跳 Micro
  if (currentQuestion.value.mode === 'reduce' && getEnabledStages.value.includes('micro')) {
    currentStage.value = 'micro';
    return;
  }

  if (getEnabledStages.value.includes('macro')) currentStage.value = 'macro';
  else if (getEnabledStages.value.includes('micro')) currentStage.value = 'micro';
  else currentStage.value = 'success';
};

const handleUnpack = (type: 'relative' | 'preposition') => { currentMode.value = type; currentStage.value = 'micro'; };

const handleSuccess = () => {
  playSuccess();
  currentStage.value = 'success';
  trackCompleted();
  if (completedCount.value <= currentIndex.value) completedCount.value = currentIndex.value + 1;
};

const nextQuestion = (allowClassModeSkip = false) => {
  if (isClassMode.value && !allowClassModeSkip) {
    alert('請等待老師統一發送下一題！');
    return;
  }
  trackAnswering();
  window.speechSynthesis.cancel();
  if (currentStage.value === 'success' && getEnabledStages.value.includes('noticing') && currentQuestion.value.noticingData) { currentStage.value = 'noticing'; return; }
  if (currentIndex.value < questionBank.value.length - 1) { currentIndex.value++; checkAndSetInitialStage(); } else { showSummary.value = true; }
};

const handleNoticingComplete = () => {
  if (currentIndex.value < questionBank.value.length - 1) { currentIndex.value++; checkAndSetInitialStage(); } else { showSummary.value = true; }
};

const restartGame = () => { currentIndex.value = 0; sessionLog.value = []; completedCount.value = 0; showSummary.value = false; checkAndSetInitialStage(); };

const updateQuestionBank = async (updatedQuestions: QuestionData[]) => {
  const currentIdx = currentIndex.value;
  questionBank.value = updatedQuestions;

  console.log('📥 App.vue 收到本地同步題庫:', JSON.parse(JSON.stringify(updatedQuestions)));

  fixAntecedentNumbers();
  showAdmin.value = false;

  if (currentIdx >= questionBank.value.length) {
    currentIndex.value = Math.max(0, questionBank.value.length - 1);
  } else {
    currentIndex.value = currentIdx;
  }

  localStorage.setItem('custom_questions', JSON.stringify(updatedQuestions));
  const success = await CloudDatabase.saveQuestions(updatedQuestions);
  if (!success) alert('注意：題庫已存在本機，但「雲端同步失敗」，請確認網路連線。');
};

const handleLocalSync = (updatedQuestions: QuestionData[]) => {
  questionBank.value = updatedQuestions;
};

const handlePushQuestion = (id: string) => {
  const idx = questionBank.value.findIndex(q => q.id === id);
  if (idx !== -1) {
    const targetQ = questionBank.value[idx];
    currentIndex.value = idx;
    checkAndSetInitialStage();
    showAdmin.value = false;
    trackAnswering();

    if (targetQ.isTimed && targetQ.timeLimit) {
      setTimeout(() => { startTimer(targetQ.timeLimit!); }, 150);
    } else {
      clearTimer();
    }

    const pwd = sessionStorage.getItem('admin_auth') ? 'admin123' : '';
    sendPush(targetQ, targetQ.timeLimit ? Date.now() + targetQ.timeLimit * 1000 : null, pwd);
  }
};

const handleAddTime = (seconds: number) => {
  addTime(seconds);
  const newEndTime = Date.now() + (timeLeft.value + seconds) * 1000;
  const pwd = sessionStorage.getItem('admin_auth') ? 'admin123' : '';
  sendAddTime(newEndTime, pwd);
};

const handleTimeoutNext = () => { nextQuestion(); };

const openAdmin = () => { if (isAdminAuthenticated.value) showAdmin.value = true; else { pendingAction.value = 'admin'; showAdminAuth.value = true; } };
const openAnalytics = () => { if (isAdminAuthenticated.value) showAnalytics.value = true; else { pendingAction.value = 'analytics'; showAdminAuth.value = true; } };
const verifyAdmin = () => {
  if (adminPasswordInput.value === 'admin123') {
    isAdminAuthenticated.value = true; sessionStorage.setItem('admin_auth', 'true'); showAdminAuth.value = false; adminPasswordInput.value = '';
    if (pendingAction.value === 'admin') showAdmin.value = true;
    else if (pendingAction.value === 'analytics') showAnalytics.value = true;
    pendingAction.value = null;
  } else { alert('密碼錯誤！請聯繫授課教師。'); adminPasswordInput.value = ''; }
};
const cancelAuth = () => { showAdminAuth.value = false; adminPasswordInput.value = ''; pendingAction.value = null; };
const logoutAdmin = () => {
  if (confirm('確定要登出教師模式嗎？')) {
    isAdminAuthenticated.value = false;
    sessionStorage.removeItem('admin_auth');
    showAdmin.value = false;
  }
};
</script>

<template>
  <div class="app-container">
    <!-- Template 保持不變，請直接沿用上一則回覆的 Template -->
    <Transition name="fade">
      <div v-if="showFocusWarning" class="focus-warning-overlay">
        <div class="warning-box">
          <h2>⚠️ 請保持專注！</h2>
          <p>偵測到您切換了畫面，請回到學習任務。</p>
        </div>
      </div>
    </Transition>

    <div v-if="currentQuestion.isTimed && !isTimeUp && ['input', 'macro', 'micro'].includes(currentStage)"
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
            <button class="btn btn-admin" @click="openAdmin">
              <span class="btn-icon">👩‍🏫</span> <span class="btn-text">教師備課中心</span>
            </button>
            <button class="btn btn-logout" @click="logoutAdmin">
              <span class="btn-icon">🚪</span> <span class="btn-text">登出教師</span>
            </button>
          </template>
          <button class="btn btn-analytics" @click="openAnalytics">
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

    <main class="game-card" :key="currentQuestion.id + currentMode">
      <div v-if="currentStage === 'noticing' && currentQuestion.noticingData" class="stage-content"
        style="justify-content: center;">
        <NoticingBoard :data="currentQuestion.noticingData" @complete="handleNoticingComplete" />
      </div>

      <div v-else-if="currentStage === 'success'" class="success-screen">
        <div class="confetti">🎉 ✨ 🏆</div>
        <h2>角色解鎖成功！</h2>
        <PronunciationAnalyzer v-if="getEnabledStages.includes('pronunciation')"
          :targetSentence="fullSentenceData.target" :displaySentence="fullSentenceData.display"
          :highlightPart="fullSentenceData.modifier" :speechRate="currentQuestion.speechRate || 0.8"
          @skip="nextQuestion" />
        <p v-else class="skip-hint">已略過語音練習。</p>

        <button class="btn-primary mt-4" @click="nextQuestion" :disabled="isClassMode">
          {{ isClassMode ? '等待老師解鎖...' : (currentIndex < questionBank.length - 1 ? '下一關 ➔' : '完成練習 🏁') }} </button>
            <p v-if="isClassMode" style="color: #ff9800; margin-top: 10px; font-weight: bold;">
              ⚠️ 上課模式已啟動，請等待老師統一發送下一題。
            </p>
      </div>

      <div v-else-if="currentQuestion.type === 'contrast' && currentQuestion.contrastData && currentQuestion.grammarFeature" class="stage-content">
        <ContrastPuzzle :chineseSentence="currentQuestion.contrastData.chineseSentence"
          :chineseHighlight="currentQuestion.contrastData.chineseHighlight"
          :nounImage="currentQuestion.contrastData.nounImage"
          :modifierImage="currentQuestion.contrastData.modifierImage" :englishNoun="currentQuestion.targetNoun"
          :modifierLabel="currentQuestion.grammarFeature.relative.label" :antecedent="currentQuestion.antecedent"
          :layout="currentQuestion.contrastData.layout" :explanationTitle="currentQuestion.explanation?.title"
          :explanationDesc="currentQuestion.explanation?.desc" @success="handleSuccess"
          @misconception="handleMisconception" />
      </div>

      <div v-else-if="currentStage === 'preview' && currentQuestion.previewData" class="stage-content">
        <ChunkPreview :image="currentQuestion.previewData.targetImage" :noun="currentQuestion.previewData.targetNoun"
          :chunk="currentQuestion.previewData.chunkText" :zhMeaning="currentQuestion.previewData.chunkZh"
          :quizOptions="currentQuestion.previewData.quizOptions" :speechRate="currentQuestion.speechRate || 0.8"
          @success="handlePreviewSuccess" />
      </div>

      <div v-else-if="currentStage === 'input' && currentQuestion.inputData" class="stage-content">
        <StructuredInput :audioText="currentQuestion.inputData.audioText" :options="currentQuestion.inputData.options"
          :speechRate="currentQuestion.speechRate || 0.8" @success="handleInputSuccess" />
      </div>

      <div v-else-if="currentStage === 'macro' && currentQuestion.grammarFeature" class="stage-content">
        <div class="target-noun"><span class="highlight">{{ currentQuestion.targetNoun }}</span></div>
        <MacroDragCanvas :targetNoun="currentQuestion.targetNoun" :grammarFeature="currentQuestion.grammarFeature"
          :imageUrl="currentQuestion.imageUrl || ''" :mode="currentQuestion.mode || 'build'" @unpack="handleUnpack" />
      </div>

      <div v-else-if="currentStage === 'micro'" class="stage-content">
        <div class="target-noun"><span class="highlight">{{ currentQuestion.targetNoun }}</span></div>
        <GrammarCanvas
          :question="microQuestion"
          :initialChunks="microQuestion.chunks"
          :speechRate="currentQuestion.speechRate || 0.8" @success="handleSuccess"
          @continue="nextQuestion(true)"
          @misconception="handleMisconception" />
      </div>
    </main>

    <SummaryReport v-if="showSummary" :completedLevels="completedCount" :totalLevels="questionBank.length"
      :misconceptions="sessionLog" @restart="restartGame" />

    <TeacherAnalytics v-if="showAnalytics" :questionBank="questionBank" @close="showAnalytics = false" />

    <div v-if="showAdminAuth" class="auth-overlay">
      <div class="auth-card">
        <h3>👩‍🏫 教師驗證</h3>
        <p>請輸入密碼以進入系統</p>
        <input type="password" v-model="adminPasswordInput" placeholder="" @keyup.enter="verifyAdmin" />
        <div class="auth-actions">
          <button class="btn-cancel" @click="cancelAuth">取消</button>
          <button class="btn-confirm" @click="verifyAdmin">確認</button>
        </div>
      </div>
    </div>

    <TeacherAdmin v-if="showAdmin" :currentQuestions="questionBank" @update="updateQuestionBank"
      @sync-local="handleLocalSync" @push="handlePushQuestion" @close="showAdmin = false" />

    <DebugConsole v-if="isDebugMode" />
  </div>
</template>

<style scoped>
/* 保持原本樣式，請直接沿用上一則回覆的 Style */
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
}
</style>