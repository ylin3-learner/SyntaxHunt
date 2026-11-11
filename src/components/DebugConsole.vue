<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useTTS } from '../utils/useSpeech';

const isOpen = ref(false);
const logs = ref<{ type: string; text: string; time: string }[]>([]);

// TTS 診斷狀態
const voicesList = ref<SpeechSynthesisVoice[]>([]);
const { speak } = useTTS();

const getTime = () => new Date().toLocaleTimeString('en-US', { hour12: false });

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

const formatArgs = (args: any[]) => {
    return args.map(arg => {
        // 修正：把 Error 物件轉成字串，不然會變成 {}
        if (arg instanceof Error) {
            return arg.stack || arg.message;
        }
        if (typeof arg === 'object') {
            try { return JSON.stringify(arg, null, 2); } catch (e) { return String(arg); }
        }
        return String(arg);
    }).join(' ');
};

const refreshVoices = () => {
    if ('speechSynthesis' in window) {
        voicesList.value = window.speechSynthesis.getVoices();
        console.log(`🔄 已刷新語音包，共 ${voicesList.value.length} 個`);
    }
};

const testTTS = () => {
    console.log('🧪 點擊了測試 TTS 按鈕...');
    speak('Hello, this is a test 1 2 3.', { rate: 0.8 });
};

onMounted(() => {
    console.log = (...args) => {
        logs.value.push({ type: 'log', text: formatArgs(args), time: getTime() });
        originalLog.apply(console, args);
    };
    console.warn = (...args) => {
        logs.value.push({ type: 'warn', text: formatArgs(args), time: getTime() });
        originalWarn.apply(console, args);
    };
    console.error = (...args) => {
        logs.value.push({ type: 'error', text: formatArgs(args), time: getTime() });
        originalError.apply(console, args);
    };

    refreshVoices();
});

onUnmounted(() => {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
});

const clearLogs = () => { logs.value = []; };
</script>

<template>
    <button class="debug-btn" @click="isOpen = !isOpen">⚙️</button>

    <div v-if="isOpen" class="debug-panel">
        <div class="debug-header">
            <span>🛠️ 開發者主控台</span>
            <div class="actions">
                <button @click="clearLogs">🗑️ 清空</button>
                <button @click="isOpen = false">✖ 關閉</button>
            </div>
        </div>

        <!-- TTS 診斷區塊 -->
        <div class="tts-diagnostic">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-weight: bold; color: #48dbfb;">🔊 TTS 系統狀態</span>
                <div>
                    <button @click="refreshVoices"
                        style="background: #555; color: white; border: none; padding: 4px 8px; border-radius: 4px; margin-right: 4px; cursor: pointer;">🔄
                        刷新</button>
                    <button @click="testTTS"
                        style="background: #58cc02; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">▶️
                        測試</button>
                </div>
            </div>
            <div v-if="voicesList.length === 0" style="color: #ff6b6b; font-size: 0.8rem; margin-bottom: 8px;">
                ❌ 系統無可用語音包！
            </div>
            <div v-else
                style="max-height: 100px; overflow-y: auto; font-size: 0.75rem; background: #111; padding: 6px; border-radius: 4px; margin-bottom: 8px;">
                <div v-for="voice in voicesList" :key="voice.name" style="color: #feca57; margin-bottom: 2px;">
                    [{{ voice.lang }}] {{ voice.name }}
                </div>
            </div>

            <div style="font-size: 0.8rem; background: #333; padding: 6px; border-radius: 4px; color: #ddd;">
                <span v-if="voicesList.length > 0" style="color: #58cc02;">✅ 目前使用：原生系統 TTS</span>
                <span v-else style="color: #feca57;">⚠️ 目前使用：Edge TTS (Supabase 代理)</span>
            </div>
        </div>

        <div class="debug-body">
            <div v-if="logs.length === 0" class="empty">目前沒有日誌</div>
            <div v-for="(log, index) in logs" :key="index" :class="['log-item', log.type]">
                <span class="time">[{{ log.time }}]</span>
                <pre class="text">{{ log.text }}</pre>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* 樣式保持不變 */
.debug-btn {
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: #333;
    color: white;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    z-index: 999999;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.debug-panel {
    position: fixed;
    bottom: 80px;
    right: 20px;
    width: 90vw;
    max-width: 500px;
    height: 65vh;
    background: #1e1e1e;
    color: #d4d4d4;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    z-index: 999999;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    font-family: monospace;
    border: 1px solid #444;
}

.debug-header {
    padding: 10px 16px;
    background: #333;
    border-top-left-radius: 12px;
    border-top-right-radius: 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: bold;
}

.debug-header .actions button {
    background: #555;
    color: white;
    border: none;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    margin-left: 8px;
}

.tts-diagnostic {
    padding: 10px 16px;
    background: #2a2a2a;
    border-bottom: 2px solid #333;
}

.debug-body {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    font-size: 0.85rem;
}

.empty {
    text-align: center;
    color: #777;
    margin-top: 20px;
}

.log-item {
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid #333;
    word-break: break-all;
}

.log-item.error {
    color: #ff6b6b;
}

.log-item.warn {
    color: #feca57;
}

.log-item.log {
    color: #48dbfb;
}

.time {
    color: #888;
    margin-right: 8px;
}

pre.text {
    margin: 4px 0 0 0;
    white-space: pre-wrap;
    font-family: monospace;
}
</style>