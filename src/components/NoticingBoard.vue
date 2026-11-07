<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSound } from '../utils/useSound';

const props = defineProps<{
  data?: {
    examples?: string[];
    question?: string;
    options?: Array<{ text: string; isCorrect: boolean }>;
    explanation?: string;
  };
}>();

const emit = defineEmits<{ (e: 'complete'): void }>();

// 提供預設值，讓模板可安全直接使用，無需 null 檢查
const boardData = computed(() => ({
  examples: props.data?.examples ?? [],
  question: props.data?.question ?? '',
  options: props.data?.options ?? [],
  explanation: props.data?.explanation ?? '',
}));

const selectedIndex = ref<number | null>(null);
const isCorrect = ref(false);

const { playSuccess } = useSound();
const { playError } = useSound();

const handleSelect = (index: number) => {
  if (isCorrect.value) return;
  selectedIndex.value = index;

  if (boardData.value.options[index]?.isCorrect) {
    isCorrect.value = true;
    playSuccess(); // 答對時播放音效
  } else {
    // 答錯時給予抖動反饋，並在 0.5 秒後重置
    playError();
    setTimeout(() => {
      if (!isCorrect.value) selectedIndex.value = null;
    }, 500);
  }
};
</script>

<template>
  <div class="noticing-board">
    <h2>🔍 文法小偵探</h2>
    <p class="subtitle">請觀察以下句子，找出隱藏的規律！</p>

    <!-- 例句展示 -->
    <div class="examples">
      <p v-for="(ex, i) in boardData.examples" :key="i" class="example-sentence">
        {{ ex }}
      </p>
    </div>

    <!-- 提問與選項 -->
    <div class="question-box">
      <h3>{{ boardData.question }}</h3>
      <div class="options">
        <button v-for="(opt, index) in boardData.options" :key="index" class="option-btn" :class="{
          'correct': isCorrect && opt.isCorrect,
          'wrong': selectedIndex === index && !opt.isCorrect
        }" @click="handleSelect(index)">
          {{ opt.text }}
        </button>
      </div>
    </div>

    <!-- 答對後的解釋與繼續按鈕 -->
    <div v-if="isCorrect" class="explanation">
      <p>💡 {{ boardData.explanation }}</p>
      <button class="btn-continue" @click="emit('complete')">
        我明白了，繼續下一關 ➔
      </button>
    </div>
  </div>
</template>

<style scoped>
.noticing-board {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
  animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

h2 {
  color: #1cb0f6;
  font-size: 1.8rem;
  margin-bottom: 8px;
}

.subtitle {
  color: #777;
  margin-bottom: 24px;
  font-weight: 500;
}

.examples {
  background: #f9f9f9;
  border-radius: 12px;
  padding: 20px;
  width: 100%;
  margin-bottom: 24px;
  border: 2px dashed #ccc;
  box-sizing: border-box;
}

.example-sentence {
  font-size: 1.2rem;
  color: #333;
  margin: 8px 0;
  font-weight: bold;
}

.question-box h3 {
  font-size: 1.2rem;
  color: #333;
  margin-bottom: 16px;
}

.options {
  display: flex;
  gap: 16px;
  justify-content: center;
  margin-bottom: 24px;
}

.option-btn {
  padding: 16px 32px;
  font-size: 1.1rem;
  font-weight: bold;
  background: white;
  border: 2px solid #e5e5e5;
  border-bottom-width: 4px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  color: #555;
}

.option-btn:hover {
  border-color: #1cb0f6;
  color: #1cb0f6;
}

.option-btn.correct {
  background: #d7ffb8;
  border-color: #58cc02;
  color: #58cc02;
}

.option-btn.wrong {
  background: #ffdfe0;
  border-color: #ff4b4b;
  color: #ea2b2b;
  animation: shake 0.4s;
}

.explanation {
  background: #f0fff0;
  border: 2px solid #58cc02;
  border-radius: 16px;
  padding: 24px;
  width: 100%;
  box-sizing: border-box;
  animation: fadeIn 0.4s;
}

.explanation p {
  color: #333;
  font-size: 1.1rem;
  margin-bottom: 20px;
  font-weight: bold;
  line-height: 1.5;
}

.btn-continue {
  background: #58cc02;
  color: white;
  border: none;
  border-bottom: 4px solid #46a302;
  padding: 14px 32px;
  font-size: 1.1rem;
  font-weight: bold;
  border-radius: 12px;
  cursor: pointer;
  width: 100%;
}

.btn-continue:active {
  border-bottom-width: 0;
  transform: translateY(4px);
}

@keyframes shake {

  10%,
  90% {
    transform: translateX(-2px);
  }

  20%,
  80% {
    transform: translateX(4px);
  }

  30%,
  50%,
  70% {
    transform: translateX(-8px);
  }

  40%,
  60% {
    transform: translateX(8px);
  }
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

@keyframes fadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}
</style>