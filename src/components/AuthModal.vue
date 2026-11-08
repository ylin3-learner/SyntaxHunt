<script setup lang="ts">
defineProps<{
    isOpen: boolean;
    isRegisterMode: boolean;
    email: string;
    password: string;
}>();

const emit = defineEmits<{
    (e: 'update:email', value: string): void;
    (e: 'update:password', value: string): void;
    (e: 'update:isRegisterMode', value: boolean): void;
    (e: 'cancel'): void;
    (e: 'submit'): void;
}>();
</script>

<template>
    <div v-if="isOpen" class="auth-overlay">
        <div class="auth-card">
            <h3>{{ isRegisterMode ? '📝 註冊教師帳號' : '👩‍🏫 教師驗證' }}</h3>
            <p>{{ isRegisterMode ? '請設定您的 Email 與密碼' : '請輸入 Email 與密碼以進入系統' }}</p>

            <input type="email" :value="email" placeholder="Email"
                @input="emit('update:email', ($event.target as HTMLInputElement).value)"
                @keyup.enter="emit('submit')" />
            <input type="password" :value="password" placeholder="密碼"
                @input="emit('update:password', ($event.target as HTMLInputElement).value)"
                @keyup.enter="emit('submit')" />

            <div class="auth-actions">
                <button class="btn-cancel" @click="emit('cancel')">取消</button>
                <button class="btn-confirm" @click="emit('submit')">
                    {{ isRegisterMode ? '註冊' : '登入' }}
                </button>
            </div>

            <div class="auth-toggle" style="margin-top: 16px; text-align: center; font-size: 0.9rem;">
                <a href="#" @click.prevent="emit('update:isRegisterMode', !isRegisterMode)"
                    style="color: #1cb0f6; text-decoration: underline;">
                    {{ isRegisterMode ? '已經有帳號了？切換到登入' : '還沒有帳號？點此註冊' }}
                </a>
            </div>
        </div>
    </div>
</template>

<style scoped>
.auth-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
    backdrop-filter: blur(4px);
}

.auth-card {
    background: white;
    border-radius: 24px;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.2);
    animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    text-align: center;
    padding: 32px;
    width: 320px;
}

.auth-card h3 {
    font-size: 1.5rem;
    margin: 0 0 8px 0;
}

.auth-card p {
    color: var(--text-muted, #777);
    font-size: 0.95rem;
    margin-bottom: 20px;
}

.auth-card input {
    width: 100%;
    padding: 14px;
    border: 2px solid #e5e5e5;
    border-radius: 12px;
    font-size: 1rem;
    box-sizing: border-box;
    margin-bottom: 20px;
    outline: none;
    transition: border 0.2s;
}

.auth-card input:focus {
    border-color: #1cb0f6;
}

.auth-actions {
    display: flex;
    gap: 12px;
}

.btn-cancel {
    flex: 1;
    padding: 14px;
    border-radius: 12px;
    font-weight: bold;
    cursor: pointer;
    border: none;
    font-size: 1rem;
    background: #f0f0f0;
    color: #777;
}

.btn-confirm {
    flex: 1;
    padding: 14px;
    border-radius: 12px;
    font-weight: bold;
    cursor: pointer;
    border: none;
    font-size: 1rem;
    background: #1cb0f6;
    color: white;
    border-bottom: 4px solid #1899d6;
}

.btn-confirm:active {
    border-bottom-width: 0;
    transform: translateY(4px);
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
</style>