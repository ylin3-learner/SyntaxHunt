import { ref, computed, watch } from 'vue';
import type { QuestionData, GrammarQuestionData } from '../rules/types';
import { defaultQuestions } from '../data/questions';
import { convertLegacyQuestion } from '../rules/adapter';
import { getQuestionCanvasMode, getQuestionUiMode } from '../rules/types';
import { supabase } from '../services/supabaseClient';
import { CloudDatabase } from '../services/CloudDatabase';
import { useQuizTimer } from './useQuizTimer';
import { useSound } from '../utils/useSound';
import { useClassroomSync } from './useClassroomSync';

export function useQuizFlow() {
  // ---- 狀態 ----
  const currentIndex = ref(0);
  const currentStage = ref<'preview' | 'input' | 'macro' | 'micro' | 'success' | 'noticing'>('preview');
  const currentMode = ref<'relative' | 'preposition'>('relative');
  const questionBank = ref<QuestionData[]>([]);
  const showSummary = ref(false);
  const completedCount = ref(0);
  const sessionLog = ref<string[]>([]);
  const isClassMode = ref(false);
  const targetCount = ref(0);
  const presenceCompletedCount = ref(0);

  // ---- Timer 與 Sound ----
  const { timeLeft, isTimeUp, startTimer, addTime, clearTimer } = useQuizTimer(() => {});
  const { playSuccess } = useSound();

  // ---- Realtime ----
  const { trackCompleted, trackAnswering, sendPush, sendAddTime } = useClassroomSync();

  // ---- Computed ----
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
      const canvasMode = getQuestionCanvasMode(currentQuestion.value);
      if (canvasMode === 'MATRIX_GATE') return '先解碼句子的兩項特徵，再選擇符合句法限制的動詞。';
      if (canvasMode === 'PRAGMATIC_HP') return '組成符合說話者身分與情境的句子，送出後觀察社交關係值變化。';
      if (canvasMode === 'GRAVITY_SWITCH') return '切換現實與假設模式，選擇符合假設語氣的動詞形式。';
      return getQuestionUiMode(currentQuestion.value) === 'REDUCE'
        ? '點擊多餘字磚將它丟進垃圾桶；用字磚左右箭頭調整保留詞序。'
        : getQuestionUiMode(currentQuestion.value) === 'MORPH'
          ? '請排列字磚，並點擊紫色字磚切換成正確的單字形式。'
          : '請點擊下方的字磚，將它們排列成正確的英文句子。';
    }
    return '';
  });

  // ---- Functions ----
  const fixAntecedentNumbers = () => {
    questionBank.value.forEach(q => {
      if (q.targetNoun.toLowerCase().endsWith('s') && !q.targetNoun.toLowerCase().endsWith('is') && !q.targetNoun.toLowerCase().endsWith('this')) {
        q.antecedent.number = 'plural';
      }
    });
  };

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

  const handlePreviewSuccess = () => {
    currentQuestion.value.type === 'chunk' ? handleSuccess() : currentStage.value = 'input';
  };

  const handleChunkWrongAnswer = (option: string) => {
    CloudDatabase.logEvent({
      student_name: '匿名學生',
      question_id: currentQuestion.value.id,
      error_code: 'CHUNK_DISTRACTOR',
      source: 'local',
      category: 'chunk_distractor',
      rule_id: option,
    });
  };

  const handleInputSuccess = () => {
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

  // ---- Question Bank Persistence ----
  const updateQuestionBank = async (updatedQuestions: QuestionData[]) => {
    const currentIdx = currentIndex.value;
    questionBank.value = updatedQuestions;

    fixAntecedentNumbers();
    showSummary.value = false;

    if (currentIdx >= questionBank.value.length) {
      currentIndex.value = Math.max(0, questionBank.value.length - 1);
    } else {
      currentIndex.value = currentIdx;
    }

    // 治本：更新題庫後，必須重新判斷當前題目的初始階段！
    checkAndSetInitialStage();

    const success = await persistQuestionBank(updatedQuestions);
    if (!success) alert('注意：題庫已存在本機，但「雲端同步失敗」，請確認網路連線。');
  };

  const persistQuestionBank = async (questions: QuestionData[]) => {
    localStorage.setItem('custom_questions', JSON.stringify(questions));
    return CloudDatabase.saveQuestions(questions);
  };

  const handleBatchQuestionImport = async (questions: QuestionData[]) => {
    questionBank.value = questions;
    fixAntecedentNumbers();
    const success = await persistQuestionBank(questions);
    if (!success) alert('注意：批次題目已存在本機，但「雲端同步失敗」，請確認網路連線。');
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
      trackAnswering();

      if (targetQ.isTimed && targetQ.timeLimit) {
        setTimeout(() => { startTimer(targetQ.timeLimit!); }, 150);
      } else {
        clearTimer();
      }

      sendPush(targetQ, targetQ.timeLimit ? Date.now() + targetQ.timeLimit * 1000 : null);
    }
  };

  const handleAddTime = (seconds: number) => {
    addTime(seconds);
    const newEndTime = Date.now() + (timeLeft.value + seconds) * 1000;
    sendAddTime(newEndTime);
  };

  const handleTimeoutNext = () => { nextQuestion(); };

  return {
    currentIndex,
    currentStage,
    currentMode,
    questionBank,
    showSummary,
    completedCount,
    sessionLog,
    isClassMode,
    targetCount,
    presenceCompletedCount,
    timeLeft,
    isTimeUp,
    startTimer,
    addTime,
    clearTimer,
    trackCompleted,
    trackAnswering,
    sendPush,
    sendAddTime,
    currentQuestion,
    getEnabledStages,
    microQuestion,
    instructionText,
    fixAntecedentNumbers,
    checkAndSetInitialStage,
    handlePreviewSuccess,
    handleChunkWrongAnswer,
    handleInputSuccess,
    handleUnpack,
    handleSuccess,
    nextQuestion,
    handleNoticingComplete,
    restartGame,
    handleTimeoutNext,
    handlePushQuestion,
    handleAddTime,
    updateQuestionBank,
    persistQuestionBank,
    handleBatchQuestionImport,
    handleLocalSync,
  };
}
