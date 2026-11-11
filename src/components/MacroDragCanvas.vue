<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  targetNoun: string;
  grammarFeature: {
    relative: { label: string };
    preposition: { label: string };
  };
  imageUrl: string;
}>();

const emit = defineEmits<{
  (e: 'unpack', type: 'relative' | 'preposition'): void;
}>();

const currentMode = ref<'relative' | 'preposition'>('relative');
const isSelected = ref(false);
const isDropped = ref(false);

const toggleMode = () => {
  currentMode.value = currentMode.value === 'relative' ? 'preposition' : 'relative';
  isSelected.value = false;
};

const handleBlockClick = () => {
  isSelected.value = !isSelected.value;
};

const handleZoneClick = () => {
  if (isSelected.value && !isDropped.value) {
    isDropped.value = true;
    isSelected.value = false;
    emit('unpack', currentMode.value);
  } else if (isDropped.value) {
    isDropped.value = false;
    emit('unpack', currentMode.value);
  }
};
</script>

<template>
  <div data-test="canvas-bg" class="macro-canvas">
    <div class="sentence-area">
      <span data-test="target-noun" class="noun">{{ targetNoun }}</span>

      <div data-test="drop-zone" class="drop-zone" :class="{ 'active': isSelected && !isDropped, 'filled': isDropped }"
        @click="handleZoneClick">
        <span v-if="!isDropped" class="drop-hint">
          {{ isSelected ? '👉 點擊放置於此' : '⬇️ 請先選取下方的卡片' }}
        </span>
        <span v-else class="dropped-content">
          <!-- 核心修正：這裡只顯示圖片，不顯示任何文字 -->
          <img :src="imageUrl" class="dropped-img" alt="modifier" />
        </span>
      </div>
    </div>

    <div v-if="!isDropped" class="block-bank">
      <div data-test="draggable-block" class="character-block" :class="{ 'selected': isSelected }"
        @click="handleBlockClick">
        <img :src="imageUrl" class="block-img" alt="character" />
        <!-- 核心修正：這裡不顯示 label -->
      </div>
    </div>

    <div v-if="!isDropped" class="derivation-toggle">
      <p>切換句型：</p>
      <button @click="toggleMode" class="btn-toggle">
        {{ currentMode === 'relative' ? '👉 切換為介系詞片語' : '👉 切換為關係子句' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.macro-canvas {
  padding: 20px;
  background: #fcfcfc;
  border-radius: 12px;
  min-height: 200px;
}

.sentence-area {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 40px;
  font-size: 1.5rem;
}

.noun {
  font-weight: bold;
  color: #1cb0f6;
}

.drop-zone {
  min-width: 200px;
  min-height: 80px;
  border: 3px dashed #ccc;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  background-color: #f9f9f9;
  cursor: pointer;
  padding: 4px;
}

.drop-zone.active {
  border-color: #1cb0f6;
  background-color: #e6f7ff;
  box-shadow: 0 0 10px rgba(28, 176, 246, 0.3);
  animation: pulse 1.5s infinite;
}

.drop-zone.filled {
  border: 3px solid #58cc02;
  background-color: #f0fff0;
  color: #58cc02;
  font-weight: bold;
  cursor: default;
}

.drop-hint {
  font-size: 0.9rem;
  color: #999;
}

.drop-zone.active .drop-hint {
  color: #1cb0f6;
  font-weight: bold;
}

/* 新增：放置後的圖片樣式，讓它跟卡片大小一致 */
.dropped-img {
  width: 80px;
  height: 80px;
  border-radius: 8px;
  object-fit: cover;
}

.block-bank {
  display: flex;
  gap: 20px;
}

.character-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 15px 20px;
  background: white;
  border: 2px solid #e5e5e5;
  border-radius: 12px;
  cursor: pointer;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
  transition: all 0.2s ease;
  user-select: none;
}

.character-block.selected {
  border-color: #1cb0f6;
  background-color: #e6f7ff;
  transform: translateY(-5px) scale(1.02);
  box-shadow: 0 8px 15px rgba(28, 176, 246, 0.2);
}

.block-img {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  margin-bottom: 8px;
  background: #eee;
}

.derivation-toggle {
  margin-top: 30px;
  text-align: center;
}

.btn-toggle {
  background: #e6f7ff;
  color: #1cb0f6;
  border: 2px solid #1cb0f6;
  padding: 10px 20px;
  border-radius: 20px;
  font-weight: bold;
  cursor: pointer;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(28, 176, 246, 0.4);
  }

  70% {
    box-shadow: 0 0 0 10px rgba(28, 176, 246, 0);
  }

  100% {
    box-shadow: 0 0 0 0 rgba(28, 176, 246, 0);
  }
}
</style>