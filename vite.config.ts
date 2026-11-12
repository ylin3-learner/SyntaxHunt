/// <reference types="vitest" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/SyntaxHunt/' : '/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // 關鍵防禦：只允許 vitest 掃描 tests 資料夾底下的測試檔
    include: ['tests/**/*.spec.ts', 'tests/**/*.test.ts'],
  },
}));