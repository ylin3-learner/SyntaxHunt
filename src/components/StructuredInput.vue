<script setup lang="ts">
import { ref } from 'vue';
import { useTTS } from '../utils/useSpeech';

const props = defineProps<{
  audioText: string;
  options: { image: string; text: string; isCorrect: boolean }[];
  speechRate?: number; // 加上這個
}>();

const emit = defineEmits<{
  (e: 'success'): void;
}>();

const { speak } = useTTS();

const showText = ref(false);
const selectedIndex = ref<number | null>(null);
const isWrong = ref(false);
const isSuccess = ref(false);

// 過濾假圖的輔助函數
const isRealImage = (url: string) => {
  return url && !url.includes('dicebear.com');
};

const playAudio = () => {
  speak(props.audioText, { rate: props.speechRate ?? 0.8 }); // 套用語速
};

// 答錯時重新播放
speak(props.audioText, { rate: props.speechRate ?? 0.8 });

const handleSelect = (opt: { isCorrect: boolean }, index: number) => {
  if (isSuccess.value) return;
  selectedIndex.value = index;

  if (opt.isCorrect) {
    isSuccess.value = true;
    setTimeout(() => { emit('success'); }, 1000);
  } else {
    isWrong.value = true;
    speak(props.audioText);
    setTimeout(() => {
      isWrong.value = false;
      selectedIndex.value = null;
    }, 800);
  }
};
</script>

<template>
  <div class="structured-input">
    <h2 class="instruction">🎧 請聽句子，選出符合描述的圖片</h2>

    <div class="audio-controls">
      <button @click="playAudio" class="btn-play">🔊 播放句子</button>
      <button @click="showText = !showText" class="btn-toggle-text" :class="{ active: showText }">
        {{ showText ? '🙈 隱藏文字' : '👀 顯示文字提示' }}
      </button>
    </div>

    <Transition name="fade">
      <div v-if="showText" class="transcript-hint">
        <p>{{ audioText }}</p>
      </div>
    </Transition>

    <div class="options-grid">
      <div v-for="(opt, index) in options" :key="index" class="option-card" :class="{
        'is-wrong': isWrong && selectedIndex === index,
        'is-success': isSuccess && selectedIndex === index
      }" @click="handleSelect(opt, index)">
        <!-- 使用 isRealImage 判斷 -->
        <img v-if="isRealImage(opt.image)" :src="opt.image" :class="{ 'shake': isWrong && selectedIndex === index }" />
        <div v-else class="placeholder-img" :class="{ 'shake': isWrong && selectedIndex === index }">無圖片</div>

        <p v-if="opt.text" class="option-label">{{ opt.text }}</p>
      </div>
    </div>

    <p v-if="isWrong" class="error-msg">聽起來不太對喔！再仔細聽一次句子。</p>
  </div>
</template>

<style scoped>
.structured-input {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  animation: fadeIn 0.5s ease;
  width: 100%;
}

.instruction {
  color: #555;
  font-size: 1.2rem;
  margin-bottom: 24px;
  font-weight: bold;
}

.audio-controls {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}

.btn-play {
  background: #e6f7ff;
  color: #1cb0f6;
  border: 2px solid #1cb0f6;
  padding: 12px 32px;
  border-radius: 16px;
  font-size: 1.1rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-play:hover {
  background: #1cb0f6;
  color: white;
}

.btn-toggle-text {
  background: #f9f9f9;
  color: #777;
  border: 2px solid #e5e5e5;
  padding: 12px 24px;
  border-radius: 16px;
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-toggle-text:hover,
.btn-toggle-text.active {
  background: #f0f0f0;
  color: #333;
}

.transcript-hint {
  background: #fff8e1;
  border: 2px dashed #ffc107;
  padding: 12px 24px;
  border-radius: 12px;
  margin-bottom: 24px;
  color: #d84315;
  font-size: 1.2rem;
  font-weight: bold;
}

.options-grid {
  display: flex;
  gap: 24px;
  justify-content: center;
  width: 100%;
  margin-bottom: 24px;
}

.option-card {
  background: white;
  border: 3px solid #e5e5e5;
  border-radius: 20px;
  padding: 24px;
  width: 220px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.option-card:hover {
  border-color: #1cb0f6;
  transform: translateY(-4px);
}

.option-card.is-wrong {
  border-color: #ff4b4b;
  background: #fff0f0;
}

.option-card.is-success {
  border-color: #58cc02;
  background: #f0fff0;
  box-shadow: 0 0 16px rgba(88, 204, 2, 0.3);
}

.option-card img {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  object-fit: cover;
  margin-bottom: 16px;
  background: #f0f0f0;
}

.placeholder-img {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: #e5e5e5;
  color: #999;
  font-weight: bold;
  font-size: 1rem;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 16px;
  border: 2px dashed #ccc;
}

.option-label {
  font-weight: bold;
  color: #333;
  margin: 0;
  font-size: 1.05rem;
  line-height: 1.4;
  word-break: break-word;
}

.error-msg {
  color: #ff4b4b;
  font-weight: bold;
  animation: slideDown 0.3s;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideDown {
  from {
    transform: translateY(-10px);
    opacity: 0;
  }

  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.shake {
  animation: shake 0.4s cubic-bezier(.36, .07, .19, .97) both;
}

@keyframes shake {

  10%,
  90% {
    transform: translate3d(-2px, 0, 0);
  }

  20%,
  80% {
    transform: translate3d(4px, 0, 0);
  }

  30%,
  50%,
  70% {
    transform: translate3d(-8px, 0, 0);
  }

  40%,
  60% {
    transform: translate3d(8px, 0, 0);
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>