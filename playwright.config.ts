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
  timeout: 60 * 1000,
  expect: {
    timeout: 15000,
  },

  // 只保留這一個 use 區塊
  use: {
    baseURL: 'http://localhost:5173',
    // 關鍵修正：把 'on' 改成 'on-first-retry'，只有重試失敗時才錄影與存 trace
    trace: 'on-first-retry',
    video: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 15000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    // 無論本地還是 CI，一律使用 dev 模式，保證 base 路徑絕對是 '/'
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !ci,
    timeout: 120 * 1000,
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'fake-key',
    }
  },
});