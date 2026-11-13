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
    // 攔截 Supabase 請求，防止卡死
    await page.route('**/rest/v1/questions*', async (route) => {
      await route.fulfill({ status: 200, json: [] });
    });

    // 偽造老師 ID，讓 App 不要跳出「輸入班級代碼」的畫面
    await page.addInitScript(() => {
      window.sessionStorage.setItem('teacher_id', 'test-teacher-id');
    });
  });

  test('BUILD 模式：應渲染字庫與作答區', async ({ page }) => {
    await page.addInitScript((q) => {
      window.localStorage.setItem('custom_questions', JSON.stringify([q]));
    }, buildQuestion);

    await page.goto('/');

    // 改用 expect().toBeVisible()，Playwright 會在超時時間內自動重試
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

    // 改用 expect().toBeVisible()
    const removable = page.locator('.removable-word');
    await expect(removable.first()).toBeVisible();
    await expect(removable).toHaveCount(4); // The writer, who, is, here 都是 draggable

    await expect(page.locator('.trash-zone-wrapper')).toBeVisible();
  });
});