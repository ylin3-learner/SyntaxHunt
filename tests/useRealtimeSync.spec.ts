import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, Ref } from 'vue';
import { useRealtimeSync } from '../src/composables/useRealtimeSync';

// Mock useQuizFlow（useRealtimeSync 會從這個 composable 解構狀態）
const useQuizFlowMock = vi.hoisted(() => vi.fn());
vi.mock('../src/composables/useQuizFlow', () => ({
  useQuizFlow: useQuizFlowMock,
}));

// Mock CloudDatabase
const cloudDatabaseMock = vi.hoisted(() => ({
  fetchQuestions: vi.fn(),
}));
vi.mock('../src/services/CloudDatabase', () => ({
  CloudDatabase: cloudDatabaseMock,
}));

// Mock useClassroomSync 提供的 currentTeacherId
// 注意：vi.mock factory 會被 hoisted，不能引用外部變數，需用 vi.hoisted 建立
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
  });

  it('SYNC_STATE 應重新從雲端拉取題庫（即使題目已存在本地）', async () => {
    const freshQuestions = [
      { id: 'q1', type: 'standard', text: 'updated data' },
      { id: 'q2', type: 'standard', text: 'other' },
    ];
    cloudDatabaseMock.fetchQuestions.mockResolvedValue(freshQuestions);

    const realtimeNotice = ref('');
    const { handleRealtimeEvent } = useRealtimeSync(quizFlow, realtimeNotice as Ref<string>);

    await handleRealtimeEvent('SYNC_STATE', {
      id: 'q1',
      timerEndTime: null,
      isClassMode: false,
      targetCount: 10,
    });

    expect(cloudDatabaseMock.fetchQuestions).toHaveBeenCalledWith('teacher-123');
    // 題庫應被替換為雲端最新資料
    expect(quizFlow.questionBank.value[0].text).toBe('updated data');
  });

  it('相同題目 ID 重新推播時不應重置 stage（保留學生進度）', async () => {
    const freshQuestions = [
      { id: 'q1', type: 'standard', text: 'updated data' },
      { id: 'q2', type: 'standard', text: 'other' },
    ];
    cloudDatabaseMock.fetchQuestions.mockResolvedValue(freshQuestions);

    const realtimeNotice = ref('');
    const { handleRealtimeEvent } = useRealtimeSync(quizFlow, realtimeNotice as Ref<string>);

    await handleRealtimeEvent('SYNC_STATE', {
      id: 'q1',
      timerEndTime: null,
      isClassMode: false,
      targetCount: 10,
    });

    // 相同題目不應呼叫 checkAndSetInitialStage / trackAnswering
    expect(quizFlow.checkAndSetInitialStage).not.toHaveBeenCalled();
    expect(quizFlow.trackAnswering).not.toHaveBeenCalled();
  });

  it('不同題目 ID 推播時應切換 currentIndex 並重置 stage', async () => {
    const freshQuestions = [
      { id: 'q1', type: 'standard', text: 'old' },
      { id: 'q2', type: 'standard', text: 'other' },
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

    expect(quizFlow.currentIndex.value).toBe(1);
    expect(quizFlow.checkAndSetInitialStage).toHaveBeenCalled();
    expect(quizFlow.trackAnswering).toHaveBeenCalled();
  });
});