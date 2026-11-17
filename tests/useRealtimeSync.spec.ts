import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, Ref } from 'vue';
import { useRealtimeSync } from '../src/composables/useRealtimeSync';

// Mock useQuizFlow（useRealtimeSync 依賴此模組）
const useQuizFlowMock = vi.hoisted(() => vi.fn());
vi.mock('../src/composables/useQuizFlow', () => ({
  useQuizFlow: useQuizFlowMock,
}));

// Mock CloudDatabase（含新增的 fetchQuestionById）
const cloudDatabaseMock = vi.hoisted(() => ({
  fetchQuestions: vi.fn(),
  fetchQuestionById: vi.fn(),
}));
vi.mock('../src/services/CloudDatabase', () => ({
  CloudDatabase: cloudDatabaseMock,
}));

// Mock useClassroomSync 的 currentTeacherId
// 因為 vi.mock factory 是 hoisted 的，mutable mock 必須用 vi.hoisted 建立
const currentTeacherIdRef = vi.hoisted(() => ({ value: 'teacher-123' }));
vi.mock('../src/composables/useClassroomSync', () => ({
  useClassroomSync: vi.fn(() => ({})),
  currentTeacherId: currentTeacherIdRef,
}));

describe('useRealtimeSync', () => {
  let quizFlow: any;

  beforeEach(() => {
    vi.clearAllMocks();

    quizFlow = {
      isClassMode: ref(false),
      targetCount: ref(0),
      currentQuestion: ref({ id: 'q1' }),
      currentIndex: ref(0),
      questionBank: ref([
        { id: 'q1', type: 'standard', text: 'old data' },
        { id: 'q2', type: 'standard', text: 'other' },
      ]),
      checkAndSetInitialStage: vi.fn(),
      trackAnswering: vi.fn(),
      presenceCompletedCount: ref(0),
      startTimer: vi.fn(),
      clearTimer: vi.fn(),
      changeUnit: vi.fn(),
      fixAntecedentNumbers: vi.fn(),
    };

    useQuizFlowMock.mockReturnValue(quizFlow);
    cloudDatabaseMock.fetchQuestions.mockResolvedValue(null);
    cloudDatabaseMock.fetchQuestionById.mockResolvedValue(null);
  });

  it('相同 ID 重推：只拉取單題（fetchQuestionById），不重新拉整個題庫', async () => {
    cloudDatabaseMock.fetchQuestionById.mockResolvedValue({ id: 'q1', type: 'standard', text: 'updated data' });

    const realtimeNotice = ref('');
    const { handleRealtimeEvent } = useRealtimeSync(quizFlow, realtimeNotice as Ref<string>);

    await handleRealtimeEvent('SYNC_STATE', {
      id: 'q1',
      timerEndTime: null,
      isClassMode: false,
      targetCount: 10,
    });

    expect(cloudDatabaseMock.fetchQuestionById).toHaveBeenCalledWith('q1', 'teacher-123');
    expect(cloudDatabaseMock.fetchQuestions).not.toHaveBeenCalled();
    expect(quizFlow.questionBank.value[0].text).toBe('updated data');
  });

  it('相同 ID 重推：保留學生作答進度（不重置 stage）', async () => {
    cloudDatabaseMock.fetchQuestionById.mockResolvedValue({ id: 'q1', type: 'standard', text: 'updated data' });

    const realtimeNotice = ref('');
    const { handleRealtimeEvent } = useRealtimeSync(quizFlow, realtimeNotice as Ref<string>);

    await handleRealtimeEvent('SYNC_STATE', {
      id: 'q1',
      timerEndTime: null,
      isClassMode: false,
      targetCount: 10,
    });

    expect(quizFlow.checkAndSetInitialStage).not.toHaveBeenCalled();
    expect(quizFlow.trackAnswering).not.toHaveBeenCalled();
    expect(quizFlow.currentIndex.value).toBe(0);
  });

  it('相同 ID 重推但單題拉取失敗：顯示溫和提示，保留舊資料', async () => {
    cloudDatabaseMock.fetchQuestionById.mockResolvedValue(null);

    const realtimeNotice = ref('');
    const { handleRealtimeEvent } = useRealtimeSync(quizFlow, realtimeNotice as Ref<string>);

    await handleRealtimeEvent('SYNC_STATE', {
      id: 'q1',
      timerEndTime: null,
      isClassMode: false,
      targetCount: 10,
    });

    expect(realtimeNotice.value).toBe('連線不穩，暫時無法更新題目，請重新整理頁面。');
    expect(quizFlow.questionBank.value[0].text).toBe('old data');
  });

  it('不同 ID 推播：全量拉取題庫並切換題目', async () => {
    const freshQuestions = [
      { id: 'q1', type: 'standard', text: 'old' },
      { id: 'q2', type: 'standard', text: 'new question' },
    ];
    cloudDatabaseMock.fetchQuestions.mockResolvedValue(freshQuestions);

    const realtimeNotice = ref('');
    const { handleRealtimeEvent } = useRealtimeSync(quizFlow, realtimeNotice as Ref<string>);

    await handleRealtimeEvent('SYNC_STATE', {
      id: 'q2',
      timerEndTime: null,
      isClassMode: false,
      targetCount: 10,
    });

    expect(cloudDatabaseMock.fetchQuestions).toHaveBeenCalledWith('teacher-123');
    expect(quizFlow.currentIndex.value).toBe(1);
    expect(quizFlow.checkAndSetInitialStage).toHaveBeenCalled();
    expect(quizFlow.trackAnswering).toHaveBeenCalled();
  });

  it('不同 ID 推播但全量拉取失敗：顯示溫和提示，降級使用本地資料切換', async () => {
    cloudDatabaseMock.fetchQuestions.mockResolvedValue(null);

    const realtimeNotice = ref('');
    const { handleRealtimeEvent } = useRealtimeSync(quizFlow, realtimeNotice as Ref<string>);

    await handleRealtimeEvent('SYNC_STATE', {
      id: 'q2',
      timerEndTime: null,
      isClassMode: false,
      targetCount: 10,
    });

    expect(realtimeNotice.value).toBe('連線不穩，暫時無法更新題目，請重新整理頁面。');
    // 本地題庫已有 q2，降級使用本地資料並切換（不會變成空白）
    expect(quizFlow.currentIndex.value).toBe(1);
    expect(quizFlow.checkAndSetInitialStage).toHaveBeenCalled();
  });

  it('不同 ID 推播、全量拉取失敗且本地找不到該題：不切換、只顯示提示', async () => {
    cloudDatabaseMock.fetchQuestions.mockResolvedValue(null);

    const realtimeNotice = ref('');
    const { handleRealtimeEvent } = useRealtimeSync(quizFlow, realtimeNotice as Ref<string>);

    await handleRealtimeEvent('SYNC_STATE', {
      id: 'q99',
      timerEndTime: null,
      isClassMode: false,
      targetCount: 10,
    });

    expect(realtimeNotice.value).toBe('連線不穩，暫時無法更新題目，請重新整理頁面。');
    expect(quizFlow.currentIndex.value).toBe(0);
    expect(quizFlow.checkAndSetInitialStage).not.toHaveBeenCalled();
  });
});
