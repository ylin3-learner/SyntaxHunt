/// <reference types="node" />
import { defineConfig, devices } from '@playwright/test';

const ci = process.env.CI;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!ci,
  retries: ci ? 2 : 0,
  workers: ci ? 1 : undefined,
  reporter: 'html',

  // 新增：拉長單一測試的總超時時間，避免 CI 機器太慢導致超時
  timeout: 60 * 1000,

  // 新增：拉長斷言（expect）的超時時間
  expect: {
    timeout: 15000,
  },

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    // 新增：拉長動作（點擊、輸入等）的超時時間
    actionTimeout: 15000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    // 關鍵修改：CI 環境使用 build + preview (速度極快)，本機繼續用 dev
    command: ci ? 'npm run build && npx vite preview --port 5173' : 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !ci,
    timeout: 120 * 1000,
  },
});