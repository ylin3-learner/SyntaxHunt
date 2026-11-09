import { createApp } from 'vue';
import App from './App.vue';
import { initDiagnosticPipeline } from './rules/diagnostics/init'; // 新增這行

// 初始化診斷管線
initDiagnosticPipeline();

createApp(App).mount('#app');