<script setup lang="ts">
import { computed } from 'vue';
import { QrcodeCanvas } from 'qrcode.vue';

const props = defineProps<{
    roomCode: string;
    isOpen: boolean;
}>();

const emit = defineEmits<{
    (e: 'close'): void;
}>();

// 自動產生帶有 ?room=CODE 的網址
const joinUrl = computed(() => {
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}?room=${props.roomCode}`;
});
</script>

<template>
    <Teleport to="body">
        <Transition name="fade">
            <div v-if="isOpen" class="qr-overlay" @click.self="emit('close')">
                <div class="qr-card">
                    <h2>📱 掃碼加入班級</h2>
                    <p class="room-code-display">班級代碼：<strong>{{ roomCode }}</strong></p>

                    <div class="qr-container">
                        <QrcodeCanvas :value="joinUrl" :size="300" level="H" />
                    </div>

                    <p class="hint">請學生使用平板或手機相機掃描 QR Code</p>
                    <p class="url-hint">{{ joinUrl }}</p>

                    <button class="btn-close" @click="emit('close')">關閉視窗</button>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.qr-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 99999;
    backdrop-filter: blur(8px);
}

.qr-card {
    background: white;
    padding: 48px;
    border-radius: 32px;
    text-align: center;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.3);
    animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    max-width: 90vw;
}

.qr-card h2 {
    color: #1cb0f6;
    font-size: 2rem;
    margin-top: 0;
    margin-bottom: 8px;
}

.room-code-display {
    font-size: 1.5rem;
    color: #555;
    margin-bottom: 24px;
}

.room-code-display strong {
    color: #ff9800;
    font-size: 2.5rem;
    letter-spacing: 2px;
}

.qr-container {
    background: #f9f9f9;
    padding: 24px;
    border-radius: 24px;
    display: inline-block;
    border: 4px dashed #e5e5e5;
    margin-bottom: 24px;
}

.hint {
    font-size: 1.2rem;
    color: #777;
    font-weight: bold;
    margin-bottom: 8px;
}

.url-hint {
    font-size: 0.9rem;
    color: #999;
    word-break: break-all;
    max-width: 400px;
    margin: 0 auto 32px auto;
}

.btn-close {
    background: #f0f0f0;
    color: #555;
    border: none;
    padding: 12px 32px;
    border-radius: 16px;
    font-size: 1.1rem;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s;
}

.btn-close:hover {
    background: #e5e5e5;
    transform: translateY(-2px);
}

@keyframes popIn {
    0% {
        transform: scale(0.9);
        opacity: 0;
    }

    100% {
        transform: scale(1);
        opacity: 1;
    }
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>