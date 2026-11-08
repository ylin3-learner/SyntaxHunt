import { Ref } from 'vue';
import { useQuizFlow } from './useQuizFlow';

export function useRealtimeSync(
  quizFlow: ReturnType<typeof useQuizFlow>,
  realtimeNotice: Ref<string>
) {
  const {
    isClassMode, targetCount, currentQuestion, currentIndex, questionBank,
    checkAndSetInitialStage, trackAnswering, presenceCompletedCount,
    startTimer, clearTimer
  } = quizFlow;

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

  return { handleRealtimeEvent };
}