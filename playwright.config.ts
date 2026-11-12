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
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    baseURL: 'http://localhost:5173',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on',

    /* Take a screenshot for each failed step */
    screenshot: 'on',

    /* Record a video for each test */
    video: 'on',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !ci,
    timeout: 120000,
  },
});