import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import SummaryReport from '../src/components/SummaryReport.vue';

const mockHtml2canvas = vi.hoisted(() => vi.fn());
vi.mock('html2canvas', () => ({ default: mockHtml2canvas }));

// ================= Mock SessionStorage =================
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    _reset: () => { store = {}; },
  };
})();

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true,
});

// ================= Mock URL & Blob =================
const createObjectURLMock = vi.fn(() => 'mocked-blob-url');
const revokeObjectURLMock = vi.fn();
Object.defineProperty(window.URL, 'createObjectURL', {
  value: createObjectURLMock,
  writable: true,
});
Object.defineProperty(window.URL, 'revokeObjectURL', {
  value: revokeObjectURLMock,
  writable: true,
});

// 保留原生的 Blob 參考
const OriginalBlob = global.Blob;
const blobPartsMock = vi.fn();

// 阻止 jsdom 導航錯誤
vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { });

// ================= 預設 Props =================
const defaultProps = {
  completedLevels: 5,
  totalLevels: 10,
  misconceptions: ['DUPLICATE_PRONOUN', 'SV_AGREEMENT'],
  sessionLog: [
    {
      questionId: 'q1',
      answer: 'who she',
      isCorrect: false,
      timeSpentMs: 1200,
      errorCodes: ['DUPLICATE_PRONOUN'],
    },
  ],
  studentSeat: 'A01',
};

describe('SummaryReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorageMock._reset();
    mockHtml2canvas.mockClear();
    createObjectURLMock.mockClear();
    revokeObjectURLMock.mockClear();
    blobPartsMock.mockClear();

    mockHtml2canvas.mockResolvedValue({
      toDataURL: () => 'data:image/png;base64,mocked',
    } as any);

    // 關鍵修正：每次測試前重新 Spy Blob
    vi.spyOn(window, 'Blob').mockImplementation((parts: any, options?: any) => {
      blobPartsMock(parts);
      return new OriginalBlob(parts, options);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ================== 渲染測試 ==================
  it('渲染學習紀錄卡片與正確的進度資訊', () => {
    const wrapper = mount(SummaryReport, { props: defaultProps });

    expect(wrapper.text()).toContain('5 / 10');
    expect(wrapper.text()).toContain('重複代名詞');
    expect(wrapper.text()).toContain('主詞動詞不一致');
    expect(wrapper.find('.summary-card').exists()).toBe(true);
  });

  it('渲染下載截圖按鈕與下載 JSON 按鈕', () => {
    const wrapper = mount(SummaryReport, { props: defaultProps });

    expect(wrapper.find('.btn-download').exists()).toBe(true);
    expect(wrapper.find('.btn-data-download').exists()).toBe(true);
    expect(wrapper.find('.btn-download').text()).toContain('下載學習紀錄');
    expect(wrapper.find('.btn-data-download').text()).toContain('匯出原始數據');
  });

  // ================== PNG 截圖下載測試 ==================
  it('點擊下載截圖按鈕會呼叫 html2canvas', async () => {
    const wrapper = mount(SummaryReport, { props: defaultProps });

    await wrapper.find('.btn-download').trigger('click');
    await flushPromises();

    expect(mockHtml2canvas).toHaveBeenCalled();
  });

  // ================== JSON 匯出測試 ==================
  it('點擊匯出 JSON 按鈕會產生 Blob 並觸發下載', async () => {
    const wrapper = mount(SummaryReport, { props: defaultProps });

    await flushPromises();
    await vi.waitFor(() => {
      expect(wrapper.find('.btn-data-download').attributes('disabled')).toBeFalsy();
    });

    await wrapper.find('.btn-data-download').trigger('click');
    await flushPromises();

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledTimes(1);
  });

  it('匯出的 JSON 內容包含正確的學習紀錄資料', async () => {
    sessionStorageMock.setItem('student_uuid', 'stu_123');
    sessionStorageMock.setItem('teacher_id', 'tch_456');
    sessionStorageMock.setItem('room_code', 'ROOM789');

    const wrapper = mount(SummaryReport, { props: defaultProps });

    await flushPromises();
    await vi.waitFor(() => {
      expect(wrapper.find('.btn-data-download').attributes('disabled')).toBeFalsy();
    });

    await wrapper.find('.btn-data-download').trigger('click');
    await flushPromises();

    // 確保 blobPartsMock 有被呼叫
    expect(blobPartsMock).toHaveBeenCalled();

    const blobParts = blobPartsMock.mock.calls[0][0] as string[];
    const jsonText = blobParts.join('');
    const data = JSON.parse(jsonText);

    expect(data.type).toBe('syntaxhunter_learning_record');
    expect(data.version).toBe(1);
    expect(data.studentId).toBe('stu_123');
    expect(data.studentSeat).toBe('A01');
    expect(data.teacherId).toBe('tch_456');
    expect(data.roomCode).toBe('ROOM789');
    expect(data.completedLevels).toBe(5);
    expect(data.totalLevels).toBe(10);
    expect(data.misconceptions).toEqual(['DUPLICATE_PRONOUN', 'SV_AGREEMENT']);
    expect(data.sessionLog).toHaveLength(1);
    expect(data.sessionLog[0].questionId).toBe('q1');
    expect(data.sessionLog[0].errorCodes).toEqual(['DUPLICATE_PRONOUN']);
    expect(data.exportedAt).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('重複點擊匯出 JSON 按鈕只會下載一次', async () => {
    const wrapper = mount(SummaryReport, { props: defaultProps });

    await flushPromises();
    await vi.waitFor(() => {
      expect(wrapper.find('.btn-data-download').attributes('disabled')).toBeFalsy();
    });

    await wrapper.find('.btn-data-download').trigger('click');
    await wrapper.find('.btn-data-download').trigger('click');
    await flushPromises();

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
  });

  // ================== 事件測試 ==================
  it('點擊重新開始按鈕會 emit restart 事件', async () => {
    const wrapper = mount(SummaryReport, { props: defaultProps });

    await wrapper.find('.btn-restart').trigger('click');

    expect(wrapper.emitted('restart')).toBeTruthy();
    expect(wrapper.emitted('restart')!.length).toBe(1);
  });
});