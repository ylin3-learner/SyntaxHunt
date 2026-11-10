import { ref, computed } from 'vue';
import type { QuestionData, GrammarQuestionData } from '../rules/types';
import { defaultQuestions } from '../data/questions';
import { convertLegacyQuestion } from '../rules/adapter';
import { getQuestionCanvasMode, getQuestionUiMode } from '../rules/types';
import { CloudDatabase } from '../services/CloudDatabase';
import { useQuizTimer } from './useQuizTimer';
import { useSound } from '../utils/useSound';
// 確保留言這行，從正確的路徑引入 currentTeacherId
import { useClassroomSync, currentTeacherId } from './useClassroomSync';

export function useQuizFlow() {
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
  const unitFilter = ref<string>('all');

  const { timeLeft, isTimeUp, startTimer, addTime, clearTimer } = useQuizTimer(() => { });
  const { playSuccess } = useSound();
  const { trackCompleted, trackAnswering, sendPush, sendAddTime } = useClassroomSync();

  const availableUnits = computed(() => {
    const units = questionBank.value.map(q => q.unit).filter(Boolean) as string[];
    return [...new Set(units)].sort((a, b) => a.localeCompare(b));
  });

  const filteredQuestions = computed(() => {
    if (unitFilter.value === 'all') return questionBank.value;
    return questionBank.value.filter(q => q.unit === unitFilter.value);
  });

  const currentQuestion = computed(() => {
    if (filteredQuestions.value.length === 0) {
      return defaultQuestions[0] as unknown as QuestionData;
    }
    return filteredQuestions.value[currentIndex.value] || filteredQuestions.value[0];
  });

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

  const fixAntecedentNumbers = () => {
    questionBank.value.forEach(q => {
      if (q.targetNoun.toLowerCase().endsWith('s') && !q.targetNoun.toLowerCase().endsWith('is') && !q.targetNoun.toLowerCase().endsWith('this')) {
        q.antecedent.number = 'plural';
      }
    });
  };

  type StageType = 'preview' | 'input' | 'macro' | 'micro' | 'success' | 'noticing';

  // 🔧 輔助：根據 enabledStages 數組順序，取得下一個階段
  const getNextStageInSequence = (current: StageType | null, enabledStages: StageType[]): StageType | null => {
    if (!enabledStages.length) return null;
    if (current === null) return enabledStages[0];
    const idx = enabledStages.indexOf(current);
    if (idx === -1 || idx >= enabledStages.length - 1) return null;
    return enabledStages[idx + 1];
  };

  // 🔧 輔助：取得初始階段（受題型強制規則限制）
  const getInitialStage = (question: QuestionData, enabledStages: StageType[]): StageType => {
    if (question.type === 'grammar') return 'micro';
    if (question.type === 'contrast') return 'macro';
    if (question.type === 'chunk') return 'preview';
    if (enabledStages.length > 0) return enabledStages[0];
    return 'success';
  };

  const checkAndSetInitialStage = () => {
    const enabled = getEnabledStages.value as StageType[];
    console.log('[DEBUG Stage] checkAndSetInitialStage called');
    console.log('[DEBUG Stage] question.type:', currentQuestion.value?.type);
    console.log('[DEBUG Stage] question.mode:', currentQuestion.value?.mode);
    console.log('[DEBUG Stage] enabledStages (順序):', enabled);
    console.log('[DEBUG Stage] inputData:', currentQuestion.value?.inputData);
    console.log('[DEBUG Stage] previewData:', currentQuestion.value?.previewData);

    const initial = getInitialStage(currentQuestion.value, enabled);
    currentStage.value = initial;
    console.log(`[DEBUG Stage] -> set initial stage: ${initial}`);
  };

  const handlePreviewSuccess = () => {
    if (currentQuestion.value.type === 'chunk') { handleSuccess(); return; }
    const next = getNextStageInSequence('preview', getEnabledStages.value as StageType[]);
    currentStage.value = next ?? 'success';
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
    const next = getNextStageInSequence('input', getEnabledStages.value);
    currentStage.value = next ?? 'success';
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
    if (currentIndex.value < filteredQuestions.value.length - 1) {
      currentIndex.value++; checkAndSetInitialStage();
    } else {
      showSummary.value = true;
    }
  };

  const handleNoticingComplete = () => {
    if (currentIndex.value < filteredQuestions.value.length - 1) {
      currentIndex.value++; checkAndSetInitialStage();
    } else {
      showSummary.value = true;
    }
  };

  const restartGame = () => { currentIndex.value = 0; sessionLog.value = []; completedCount.value = 0; showSummary.value = false; checkAndSetInitialStage(); };

  const changeUnit = (newUnit: string) => {
    unitFilter.value = newUnit;
    currentIndex.value = 0;
    checkAndSetInitialStage();
  };

  const updateQuestionBank = async (updatedQuestions: QuestionData[]) => {
    const currentIdx = currentIndex.value;
    questionBank.value = updatedQuestions;
    fixAntecedentNumbers();
    showSummary.value = false;

    if (currentIdx >= filteredQuestions.value.length) {
      currentIndex.value = Math.max(0, filteredQuestions.value.length - 1);
    } else {
      currentIndex.value = currentIdx;
    }
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

  // 修正：使用 async 並加入防禦性載入
  const handlePushQuestion = async (id: string) => {
    console.log(`🎯 [Student] 開始處理推播題目，目標 ID: ${id}`);

    let targetQ = questionBank.value.find(q => q.id === id);
    console.log(`🎯 [Student] 本地題庫 (${questionBank.value.length} 題) 尋找結果:`, targetQ ? '找到了' : '找不到');

    // 防禦性載入：如果本地找不到，強制從雲端拉取
    if (!targetQ && currentTeacherId.value) {
      console.log(`📡 [Student] 本地找不到，強制從雲端拉取題庫 (Teacher: ${currentTeacherId.value})...`);
      const freshQuestions = await CloudDatabase.fetchQuestions(currentTeacherId.value);
      console.log(`📡 [Student] 雲端回傳題庫數量:`, freshQuestions?.length);

      if (freshQuestions) {
        questionBank.value = freshQuestions;
        fixAntecedentNumbers();
        targetQ = freshQuestions.find(q => q.id === id);
        console.log(`🎯 [Student] 重新尋找結果:`, targetQ ? '找到了' : '還是找不到');
      }
    }

    if (!targetQ) {
      console.error(`❌ [Student] 嚴重錯誤：無法載入推播的題目 ID: ${id}`);
      return;
    }

    // 正常切換 UI 邏輯
    if (unitFilter.value !== 'all' && targetQ.unit !== unitFilter.value) {
      unitFilter.value = targetQ.unit || 'all';
    }
    const idx = filteredQuestions.value.findIndex(q => q.id === id);
    if (idx !== -1) {
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
    currentIndex, currentStage, currentMode, questionBank, showSummary, completedCount, sessionLog,
    isClassMode, targetCount, presenceCompletedCount, timeLeft, isTimeUp, startTimer, addTime, clearTimer,
    trackCompleted, trackAnswering, sendPush, sendAddTime, currentQuestion, getEnabledStages, microQuestion,
    instructionText, fixAntecedentNumbers, checkAndSetInitialStage, handlePreviewSuccess, handleChunkWrongAnswer,
    handleInputSuccess, handleUnpack, handleSuccess, nextQuestion, handleNoticingComplete, restartGame,
    handleTimeoutNext, handlePushQuestion, handleAddTime, updateQuestionBank, persistQuestionBank,
    handleBatchQuestionImport, handleLocalSync,
    unitFilter, availableUnits, filteredQuestions, changeUnit,
  };
}