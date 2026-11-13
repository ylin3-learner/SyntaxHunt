import { test, expect } from '@playwright/test';

// 準備兩份測試題目
const buildQuestion = {
  id: 'e2e-build',
  type: 'grammar',
  ui_mode: 'BUILD',
  canvas_mode: 'BUILD',
  targetNoun: 'The boy',
  antecedent: { noun: 'The boy', number: 'singular', person: 'person' },
  correctAnswer: ['The', 'boy', 'plays'],
  chunks: [
    { id: '1', text: 'The', draggable: true },
    { id: '2', text: 'boy', draggable: true },
    { id: '3', text: 'plays', draggable: true },
  ],
};

const reduceQuestion = {
  id: 'e2e-reduce',
  type: 'grammar',
  ui_mode: 'REDUCE',
  canvas_mode: 'REDUCE',
  targetNoun: 'The writer',
  antecedent: { noun: 'The writer', number: 'singular', person: 'person' },
  correctAnswer: ['The writer', 'is', 'here'],
  chunks: [
    { id: '1', text: 'The writer', draggable: true },
    { id: '2', text: 'who', draggable: true },
    { id: '3', text: 'is', draggable: true },
    { id: '4', text: 'here', draggable: true },
  ],
};

test.describe('Grammar Canvas E2E - 隔離環境測試', () => {
  test.beforeEach(async ({ page }) => {
    // 終極大絕招：攔截 Console 錯誤與 Page 崩潰錯誤
    page.on('pageerror', (error) => {
      console.error('[Browser PageError]:', error.message);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.error('[Browser Console Error]:', msg.text());
      }
    });

    // 1. 攔截 Supabase 請求，防止卡死
    await page.route('**/rest/v1/questions*', async (route) => {
      await route.fulfill({ status: 200, json: [] });
    });

    // 2. 偽造環境與攔截瀏覽器 API
    await page.addInitScript(() => {
      window.sessionStorage.setItem('teacher_id', 'test-teacher-id');
      window.sessionStorage.setItem('student_uuid', 'test-student-id');

      // 攔截 TTS
      (window as any).speechSynthesis = {
        speak: () => { }, cancel: () => { }, getVoices: () => [], onvoiceschanged: null,
      };
      (window as any).SpeechSynthesisUtterance = class { };

      // 攔截 AudioContext
      (window as any).AudioContext = class {
        createOscillator() { return { connect: () => { }, start: () => { }, stop: () => { }, frequency: { setValueAtTime: () => { } } }; }
        createGain() { return { connect: () => { }, gain: { setValueAtTime: () => { }, exponentialRampToValueAtTime: () => { } } }; }
        destination = {};
        currentTime = 0;
      };

      // 新增：攔截 WebSocket，避免 Supabase Realtime 嘗試連線假網址報錯
      (window as any).WebSocket = class MockWebSocket {
        onopen: any = null;
        onmessage: any = null;
        onclose: any = null;
        onerror: any = null;
        readyState: number = 1;

        constructor() {
          // 什麼都不做，避免觸發連線
        }
        close() { }
        send() { }
      };
    });
  });

  test('BUILD 模式：應渲染字庫與作答區', async ({ page }) => {
    await page.addInitScript((q) => {
      window.localStorage.setItem('custom_questions', JSON.stringify([q]));
    }, buildQuestion);

    await page.goto('/');
    // 等待一下，讓 Vue 掛載
    await page.waitForTimeout(1000);

    const tiles = page.locator('.word-bank .tile');
    await expect(tiles.first()).toBeVisible();
    await expect(tiles).toHaveCount(3);
    await expect(page.locator('.check-answer-button')).toBeVisible();
  });

  test('REDUCE 模式：應渲染可移除字磚與垃圾桶', async ({ page }) => {
    await page.addInitScript((q) => {
      window.localStorage.setItem('custom_questions', JSON.stringify([q]));
    }, reduceQuestion);

    await page.goto('/');
    await page.waitForTimeout(1000);

    const removable = page.locator('.removable-word');
    await expect(removable.first()).toBeVisible();
    await expect(removable).toHaveCount(4);
    await expect(page.locator('.trash-zone-wrapper')).toBeVisible();
  });
});