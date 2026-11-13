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

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    actionTimeout: 15000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: ci ? 'npm run build -- --base=/ && npx vite preview --port 5173' : 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !ci,
    timeout: 120 * 1000,
  },
});