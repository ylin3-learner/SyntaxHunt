<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { Antecedent } from '../rules/types';
import { useSound } from '../utils/useSound';

const { playSuccess, playError } = useSound();

const props = defineProps<{
  chineseSentence: string;
  chineseHighlight: string;
  nounImage?: string;
  modifierImage: string;
  englishNoun: string;
  modifierLabel: string;
  antecedent: Antecedent;
  layout?: 'modifier-left' | 'modifier-right';
  explanationTitle?: string;
  explanationDesc?: string;
}>();

const emit = defineEmits<{
  (e: 'success'): void;
  (e: 'misconception', code: string): void;
}>();

const SLOT_A_X = 180;
const SLOT_B_X = 320;
const LIBRARY_LEFT_X = 20;
const LIBRARY_RIGHT_X = 480;

const isMerged = ref(false);
const isWrong = ref(false);
const showExplanation = ref(false);
const draggingType = ref<'noun' | 'modifier' | null>(null);

const modifierX = ref(LIBRARY_LEFT_X);
const modifierY = ref(0);
const nounX = ref(LIBRARY_RIGHT_X);
const nounY = ref(0);

const modifierSlot = ref<'A' | 'B' | null>(null);
const nounSlot = ref<'A' | 'B' | null>(null);
const hoverSlot = ref<'A' | 'B' | null>(null);

const isModifierLeft = computed(() => (props.layout || 'modifier-left') === 'modifier-left');

const resetPositions = () => {
  modifierX.value = LIBRARY_LEFT_X; modifierY.value = 0;
  nounX.value = LIBRARY_RIGHT_X; nounY.value = 0;
  modifierSlot.value = null; nounSlot.value = null;
  hoverSlot.value = null; isMerged.value = false;
  isWrong.value = false; showExplanation.value = false;
};

watch(() => props.layout, resetPositions, { immediate: true });

let startClientX = 0; let startClientY = 0; let startLeft = 0; let startTop = 0;

const startDrag = (e: PointerEvent, type: 'modifier' | 'noun') => {
  if (isMerged.value || isWrong.value) return;
  draggingType.value = type;
  e.preventDefault();
  startClientX = e.clientX; startClientY = e.clientY;
  startLeft = type === 'modifier' ? modifierX.value : nounX.value;
  startTop = type === 'modifier' ? modifierY.value : nounY.value;
  window.addEventListener('pointermove', onDrag);
  window.addEventListener('pointerup', stopDrag);
};

const onDrag = (e: PointerEvent) => {
  if (!draggingType.value) return;
  const deltaX = e.clientX - startClientX;
  const deltaY = e.clientY - startClientY;
  const currentX = startLeft + deltaX;
  const currentY = startTop + deltaY;

  if (draggingType.value === 'modifier') { modifierX.value = currentX; modifierY.value = currentY; }
  else { nounX.value = currentX; nounY.value = currentY; }

  if (Math.abs(currentX - SLOT_A_X) < 80) hoverSlot.value = 'A';
  else if (Math.abs(currentX - SLOT_B_X) < 80) hoverSlot.value = 'B';
  else hoverSlot.value = null;
};

const stopDrag = () => {
  if (!draggingType.value) return;
  window.removeEventListener('pointermove', onDrag);
  window.removeEventListener('pointerup', stopDrag);

  const type = draggingType.value;
  let isPlaced = false;

  if (hoverSlot.value !== null) {
    const slot = hoverSlot.value;
    const isOccupied = type === 'modifier' ? nounSlot.value === slot : modifierSlot.value === slot;
    if (!isOccupied) {
      if (type === 'modifier') { modifierX.value = slot === 'A' ? SLOT_A_X : SLOT_B_X; modifierY.value = 0; modifierSlot.value = slot; }
      else { nounX.value = slot === 'A' ? SLOT_A_X : SLOT_B_X; nounY.value = 0; nounSlot.value = slot; }
      isPlaced = true;
    }
  }

  if (!isPlaced) {
    if (type === 'modifier') { modifierX.value = LIBRARY_LEFT_X; modifierY.value = 0; modifierSlot.value = null; }
    else { nounX.value = LIBRARY_RIGHT_X; nounY.value = 0; nounSlot.value = null; }
  }

  hoverSlot.value = null; draggingType.value = null;

  if (modifierSlot.value && nounSlot.value) checkAnswer();
};

const checkAnswer = () => {
  let isCorrect = false;
  if (isModifierLeft.value) isCorrect = modifierSlot.value === 'A' && nounSlot.value === 'B';
  else isCorrect = nounSlot.value === 'A' && modifierSlot.value === 'B';

  if (isCorrect) {
    playSuccess();
    isMerged.value = true;
    setTimeout(() => { showExplanation.value = true; }, 800);
  } else {
    playError();
    emit('misconception', 'PUZZLE_ERROR');
    isWrong.value = true;
    setTimeout(() => { isWrong.value = false; resetPositions(); }, 800);
  }
};

const continueToNext = () => {
  showExplanation.value = false;
  emit('success');
};

const formattedDesc = computed(() => {
  if (!props.explanationDesc) return '';
  let text = props.explanationDesc;
  text = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  text = text.replace(/==(.*?)==/g, '<span class="hl">$1</span>');
  return text;
});
</script>

<template>
  <div class="contrast-puzzle">
    <div class="stage-visual">
      <div class="chinese-display">
        <h2>
          <span class="highlight">{{ chineseHighlight }}</span>{{ chineseSentence.replace(chineseHighlight, '') }}
        </h2>
      </div>

      <div class="puzzle-wrapper">
        <div class="puzzle-board" :class="{ 'shake': isWrong }">
          <div class="center-line"></div>

          <div class="slot"
            :class="{ 'hover': hoverSlot === 'A', 'filled': modifierSlot === 'A' || nounSlot === 'A', 'wrong': isWrong }"
            :style="{ left: `${SLOT_A_X}px` }">
            <span v-if="!modifierSlot && !nounSlot && !hoverSlot && !isWrong" class="slot-text">空格 A</span>
          </div>
          <div class="slot"
            :class="{ 'hover': hoverSlot === 'B', 'filled': modifierSlot === 'B' || nounSlot === 'B', 'wrong': isWrong }"
            :style="{ left: `${SLOT_B_X}px` }">
            <span v-if="!modifierSlot && !nounSlot && !hoverSlot && !isWrong" class="slot-text">空格 B</span>
          </div>

          <div class="puzzle-piece"
            :class="{ 'dragging': draggingType === 'modifier', 'in-slot': modifierSlot !== null, 'wrong-piece': isWrong }"
            :style="{ left: `${modifierX}px`, top: `${modifierY}px`, transition: draggingType === 'modifier' ? 'none' : 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)', zIndex: draggingType === 'modifier' ? 10 : 2 }"
            @pointerdown="startDrag($event, 'modifier')">
            <img :src="modifierImage" alt="modifier" draggable="false" />
            <div class="piece-label">{{ modifierLabel }}</div>
          </div>

          <div class="puzzle-piece"
            :class="{ 'dragging': draggingType === 'noun', 'in-slot': nounSlot !== null, 'wrong-piece': isWrong }"
            :style="{ left: `${nounX}px`, top: `${nounY}px`, transition: draggingType === 'noun' ? 'none' : 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)', zIndex: draggingType === 'noun' ? 10 : 1 }"
            @pointerdown="startDrag($event, 'noun')">
            <img :src="nounImage || ''" alt="noun" draggable="false" />
            <div class="piece-label">{{ englishNoun }}</div>
          </div>
        </div>
      </div>

      <p class="hint" :class="{ 'fade-out': isMerged || isWrong }">
        <span v-if="!isMerged && !isWrong">請將兩側的圖片，分別拖曳到中間的空格中。</span>
        <span v-if="isWrong" class="error-text">排列順序不對喔，再想想看！</span>
      </p>

      <Transition name="pop-up">
        <div v-if="showExplanation" class="explanation-card">
          <h3 v-if="explanationTitle">{{ explanationTitle }}</h3>
          <p v-if="explanationDesc" class="explanation-text" v-html="formattedDesc"></p>

          <div class="english-sentence">
            <span class="noun-text">{{ englishNoun }}</span>
            <span class="highlight-red transition-all"> {{ modifierLabel }} </span>
          </div>

          <p class="compare-text">對比中文：<span class="highlight-red">{{ chineseHighlight }}</span>{{
            chineseSentence.replace(chineseHighlight, '') }}</p>

          <button class="btn-continue" @click="continueToNext">我懂了，繼續 ➔</button>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.contrast-puzzle {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  animation: fadeIn 0.4s ease;
}

.stage-visual {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.chinese-display {
  margin-bottom: 30px;
  text-align: center;
}

.chinese-display h2 {
  font-size: 2rem;
  color: #333;
  margin: 0;
}

.highlight,
.highlight-red {
  color: #ea2b2b;
  font-weight: 800;
  background: #ffe6e6;
  padding: 2px 8px;
  border-radius: 8px;
}

.puzzle-wrapper {
  width: 100%;
  overflow-x: auto;
  display: flex;
  justify-content: center;
  padding: 20px 0;
  margin-bottom: 20px;
}

.puzzle-board {
  position: relative;
  width: 640px;
  height: 180px;
  /* 加高以容納圖片與文字 */
  flex-shrink: 0;
}

.center-line {
  position: absolute;
  left: 320px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #e5e5e5;
  transform: translateX(-50%);
  z-index: 0;
}

.slot {
  position: absolute;
  top: 10px;
  width: 140px;
  height: 160px;
  /* 配合 puzzle-piece 高度 */
  border: 4px dashed #ccc;
  border-radius: 16px;
  background: #fafafa;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: all 0.2s;
  z-index: 1;
  box-sizing: border-box;
}

.slot.hover {
  border-color: #1cb0f6;
  background: #e6f7ff;
  transform: scale(1.05);
}

.slot.filled {
  border: none;
  background: transparent;
}

.slot.wrong {
  border-color: #ff4b4b !important;
  background: #ffe6e6;
}

.slot-text {
  color: #ccc;
  font-weight: bold;
  font-size: 1.2rem;
}

.puzzle-piece {
  position: absolute;
  top: 10px;
  width: 140px;
  height: 160px;
  /* 增加高度 */
  overflow: hidden;
  background: #ffffff;
  border: 4px solid #1cb0f6;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  border-radius: 16px;
  touch-action: none;
  cursor: grab;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.puzzle-piece:active {
  cursor: grabbing;
}

.puzzle-piece.in-slot {
  border-color: #58cc02;
  box-shadow: 0 0 0 4px rgba(88, 204, 2, 0.2);
}

.puzzle-piece.wrong-piece {
  border-color: #ff4b4b !important;
  box-shadow: 0 0 0 4px rgba(255, 75, 75, 0.2);
}

/* 修正：給圖片固定高度，確保文字不被擠出 */
.puzzle-piece img {
  width: 100%;
  height: 110px;
  object-fit: cover;
  pointer-events: none;
  flex-shrink: 0;
}

/* 修正：文字標籤樣式 */
.piece-label {
  height: 42px;
  width: 100%;
  background: #f0f8ff;
  color: #1cb0f6;
  font-size: 0.85rem;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0 6px;
  line-height: 1.2;
  border-top: 2px solid #1cb0f6;
  pointer-events: none;
  word-break: break-word;
  flex-shrink: 0;
}

.puzzle-piece.in-slot .piece-label {
  background: #f0fff0;
  color: #58cc02;
  border-top-color: #58cc02;
}

.shake {
  animation: shake 0.4s cubic-bezier(.36, .07, .19, .97) both;
}

.hint {
  color: #777;
  font-size: 1.1rem;
  font-weight: bold;
  transition: opacity 0.3s;
  margin-bottom: 20px;
}

.error-text {
  color: #ff4b4b;
}

.explanation-card {
  background: #ffffff;
  border: 3px solid #58cc02;
  border-radius: 20px;
  padding: 24px 32px;
  box-shadow: 0 12px 32px rgba(88, 204, 2, 0.15);
  text-align: center;
  max-width: 500px;
  margin: 0 auto;
}

.explanation-card h3 {
  color: #58cc02;
  font-size: 1.4rem;
  margin-top: 0;
  margin-bottom: 12px;
}

.explanation-text {
  color: #555;
  font-size: 1.1rem;
  margin-bottom: 16px;
  line-height: 1.6;
}

.explanation-text :deep(b) {
  color: #333;
  font-weight: 800;
}

.explanation-text :deep(.hl) {
  background-color: #f0f0f0;
  color: #333;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 6px;
}

.english-sentence {
  font-size: 1.5rem;
  font-weight: 800;
  background: #f9f9f9;
  padding: 16px;
  border-radius: 12px;
  margin-bottom: 16px;
  border: 2px dashed #ccc;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  min-height: 72px;
}

.noun-text {
  color: #1cb0f6;
}

.compare-text {
  font-size: 0.95rem;
  color: #999;
  margin-bottom: 24px;
}

.btn-continue {
  background: #58cc02;
  color: white;
  border: none;
  border-bottom: 4px solid #46a302;
  padding: 12px 32px;
  font-size: 1.1rem;
  font-weight: bold;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.1s;
  width: 100%;
}

.btn-continue:active {
  border-bottom-width: 0;
  transform: translateY(4px);
}

.pop-up-enter-active,
.pop-up-leave-active {
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.pop-up-enter-from,
.pop-up-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.9);
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

@keyframes fadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}
</style>