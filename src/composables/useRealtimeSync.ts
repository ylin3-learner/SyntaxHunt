import { Ref, ref } from 'vue'; // 新增 ref
import { useQuizFlow } from './useQuizFlow';
import { CloudDatabase } from '../services/CloudDatabase';
import { currentTeacherId } from './useClassroomSync';

export function useRealtimeSync(
    quizFlow: ReturnType<typeof useQuizFlow>,
    realtimeNotice: Ref<string>
) {
    const {
        isClassMode, targetCount, currentQuestion, currentIndex, questionBank,
        checkAndSetInitialStage, trackAnswering, presenceCompletedCount,
        startTimer, clearTimer, changeUnit, fixAntecedentNumbers // 解構出 changeUnit
    } = quizFlow;

    const lockedUnit = ref<string>('all'); // 新增：紀錄目前被鎖定的單元

    // 改為 async 以支援非同步拉取題庫
    const handleRealtimeEvent = async (event: string, payload: any) => {
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

            // 處理單元鎖定
            if (payload.activeUnit !== undefined && payload.activeUnit !== lockedUnit.value) {
                lockedUnit.value = payload.activeUnit;
                changeUnit(payload.activeUnit); // 強制學生切換過去
            }

            const targetId = payload.id;
            const targetEndTime = payload.timerEndTime;

            if (targetId && currentQuestion.value?.id !== targetId) {
                // 1. 先在本地找
                let targetQ = questionBank.value.find(q => q.id === targetId);

                // 2. 防禦性載入：如果本地找不到（剛建好的新題），強制去雲端拉取
                if (!targetQ && currentTeacherId.value) {
                    console.log(`📡 [Realtime] 本地找不到題目 ${targetId}，強制從雲端拉取題庫...`);
                    const freshQuestions = await CloudDatabase.fetchQuestions(currentTeacherId.value);
                    if (freshQuestions) {
                        // 更新本地題庫狀態
                        questionBank.value = freshQuestions;
                        fixAntecedentNumbers();
                        targetQ = freshQuestions.find(q => q.id === targetId);
                        console.log(`📡 [Realtime] 雲端拉取完成，重新尋找結果:`, targetQ ? '找到了' : '還是找不到');
                    }
                }

                // 3. 找到題目後，切換當前題目
                if (targetQ) {
                    const idx = questionBank.value.findIndex(q => q.id === targetId);
                    if (idx !== -1) {
                        currentIndex.value = idx;
                        checkAndSetInitialStage();
                        trackAnswering();
                    }
                } else {
                    console.error(`❌ [Realtime] 嚴重錯誤：無法載入推播的題目 ID: ${targetId}`);
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

    return { handleRealtimeEvent, lockedUnit }; // 回傳 lockedUnit
}