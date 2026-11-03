import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/SyntaxHunt/' : '/',
  plugins: [vue() as any],
  test: {
    environment: 'jsdom',
    globals: true,
  }
}));