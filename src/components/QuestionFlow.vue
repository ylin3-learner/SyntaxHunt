<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import type { QuestionData } from '../rules/types';

const props = defineProps<{
  questions: QuestionData[];
  selectedId: string | null;
}>();

const emit = defineEmits<{
  (event: 'reorder', questions: QuestionData[]): void;
  (event: 'edit', id: string): void;
  (event: 'back'): void;
}>();

const draggedQuestionId = ref<string | null>(null);
const dragOverQuestionId = ref<string | null>(null);
const dragPlacement = ref<'before' | 'after'>('before');
const flowCanvas = ref<HTMLElement | null>(null);
let originalDocumentOverflow = '';

onMounted(() => {
  originalDocumentOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  if (flowCanvas.value) flowCanvas.value.scrollLeft = 0;
});

onUnmounted(() => {
  document.documentElement.style.overflow = originalDocumentOverflow;
});

const moveQuestionTo = (sourceId: string, targetId: string, placement: 'before' | 'after') => {
  if (sourceId === targetId) return;

  const reordered = [...props.questions];
  const sourceIndex = reordered.findIndex(question => question.id === sourceId);
  if (sourceIndex === -1) return;

  const [question] = reordered.splice(sourceIndex, 1);
  if (!question) return;

  const targetIndex = reordered.findIndex(item => item.id === targetId);
  if (targetIndex === -1) return;

  reordered.splice(targetIndex + (placement === 'after' ? 1 : 0), 0, question);
  emit('reorder', reordered);
};

const startQuestionDrag = (questionId: string, event: DragEvent) => {
  draggedQuestionId.value = questionId;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', questionId);
  }
};

const trackQuestionDragOver = (questionId: string, event: DragEvent) => {
  event.preventDefault();
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return;

  dragOverQuestionId.value = questionId;
  dragPlacement.value = event.clientX < target.getBoundingClientRect().left + target.offsetWidth / 2
    ? 'before'
    : 'after';
};

const dropQuestion = (targetId: string, event: DragEvent) => {
  event.preventDefault();
  const sourceId = event.dataTransfer?.getData('text/plain') || draggedQuestionId.value;
  if (sourceId) moveQuestionTo(sourceId, targetId, dragPlacement.value);
  clearQuestionDrag();
};

const moveQuestionWithKeyboard = (questionId: string, event: KeyboardEvent) => {
  if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
  event.preventDefault();

  const sourceIndex = props.questions.findIndex(question => question.id === questionId);
  const target = props.questions[sourceIndex + (event.key === 'ArrowLeft' ? -1 : 1)];
  if (sourceIndex !== -1 && target) {
    moveQuestionTo(questionId, target.id, event.key === 'ArrowLeft' ? 'before' : 'after');
  }
};

const clearQuestionDrag = () => {
  draggedQuestionId.value = null;
  dragOverQuestionId.value = null;
};
</script>

<template>
  <main class="flow-page">
    <header class="flow-header">
      <button type="button" class="back-button" @click="emit('back')">
        <span aria-hidden="true">←</span> 返回備課中心
      </button>
      <div class="flow-title">
        <p class="flow-eyebrow">QUESTION FLOW</p>
        <h1>題目流程編排</h1>
        <p>拖曳節點移動到另一題前後，學生會依照連線順序逐關作答。</p>
      </div>
      <span class="flow-count">{{ props.questions.length }} 個節點</span>
    </header>

    <section ref="flowCanvas" class="flow-canvas" role="list" aria-label="題目作答流程">
      <div v-for="(q, index) in props.questions" :key="q.id" class="flow-node-wrap">
        <article class="flow-node" role="listitem" tabindex="0" draggable="true"
          :class="{
            'is-dragging': draggedQuestionId === q.id,
            'drop-before': dragOverQuestionId === q.id && dragPlacement === 'before' && draggedQuestionId !== q.id,
            'drop-after': dragOverQuestionId === q.id && dragPlacement === 'after' && draggedQuestionId !== q.id,
            selected: props.selectedId === q.id
          }"
          :aria-label="`第 ${index + 1} 關：${q.targetNoun || '未命名題目'}。按 Alt 加左右方向鍵調整順序。`"
          @dragstart="startQuestionDrag(q.id, $event)"
          @dragover="trackQuestionDragOver(q.id, $event)"
          @drop="dropQuestion(q.id, $event)"
          @dragend="clearQuestionDrag"
          @keydown="moveQuestionWithKeyboard(q.id, $event)">
          <span class="node-port node-input" aria-hidden="true"></span>
          <div class="node-topline">
            <span class="node-step">STEP {{ String(index + 1).padStart(2, '0') }}</span>
            <span class="node-kind">{{ q.type === 'grammar' ? '文法題' : q.type === 'contrast' ? '對比題' : q.type === 'chunk' ? '片語題' : '標準題' }}</span>
          </div>
          <h2>{{ q.targetNoun || '未命名題目' }}</h2>
          <p class="node-prompt">
            {{ q.type === 'grammar' ? (q.correctAnswer || []).join(' ') || '尚未設定答案' : q.grammarFeature?.relative?.label || '尚未設定句型' }}
          </p>
          <div class="node-meta">
            <span :class="q.isTimed ? 'node-timed' : 'node-open'">{{ q.isTimed ? `${q.timeLimit || 60} 秒` : '自由作答' }}</span>
            <button type="button" class="node-edit" @click="emit('edit', q.id)">編輯</button>
          </div>
          <span class="node-port node-output" aria-hidden="true"></span>
        </article>
        <div v-if="index < props.questions.length - 1" class="flow-connector" aria-hidden="true">
          <span>下一關</span>
        </div>
      </div>

      <div v-if="props.questions.length === 0" class="flow-empty">
        <span>◇</span>
        <strong>流程目前是空的</strong>
        <p>先回到備課中心新增題目，節點就會出現在這裡。</p>
        <button type="button" @click="emit('back')">返回新增題目</button>
      </div>
      <div v-else class="flow-end-node">
        <span class="end-icon">✓</span>
        <strong>完成</strong>
      </div>
    </section>

    <footer class="flow-footer">
      <span>提示：選取節點後按住 Alt，再按 ← / → 也能微調位置。</span>
      <button type="button" @click="emit('back')">完成編排</button>
    </footer>
  </main>
</template>

<style scoped>
.flow-page {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f1f5f9;
  color: #0f172a;
  font-family: inherit;
}

.flow-header {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(0, 2fr) minmax(180px, 1fr);
  align-items: center;
  gap: 24px;
  padding: 22px 32px;
  border-bottom: 1px solid #e2e8f0;
  background: #ffffff;
}

.back-button {
  justify-self: start;
  padding: 10px 14px;
  border: 1px solid #cbd5e1;
  border-radius: 9px;
  background: #ffffff;
  color: #334155;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
}

.back-button:hover {
  border-color: #38bdf8;
  color: #0369a1;
}

.back-button span {
  margin-right: 6px;
}

.flow-title {
  text-align: center;
}

.flow-eyebrow {
  margin: 0 0 5px;
  color: #0ea5e9;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.14em;
}

.flow-title h1 {
  margin: 0;
  font-size: 1.35rem;
}

.flow-title p:last-child {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 0.88rem;
}

.flow-count {
  justify-self: end;
  padding: 8px 12px;
  border: 1px solid #bae6fd;
  border-radius: 999px;
  background: #f0f9ff;
  color: #0369a1;
  font-size: 0.82rem;
  font-weight: 700;
}

.flow-canvas {
  display: flex;
  flex: 1;
  align-items: center;
  min-width: 0;
  min-height: 0;
  gap: 0;
  overflow: auto;
  padding: 40px;
  background-color: #f1f5f9;
  background-image: radial-gradient(#cbd5e1 1px, transparent 1px);
  background-size: 20px 20px;
}

.flow-node-wrap {
  display: flex;
  flex: none;
  align-items: center;
}

.flow-node {
  position: relative;
  width: 250px;
  min-height: 174px;
  padding: 17px 18px 14px;
  border: 1px solid #cbd5e1;
  border-top: 4px solid #0ea5e9;
  border-radius: 13px;
  background: #ffffff;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
  cursor: grab;
  outline: none;
  transition: box-shadow 0.16s ease, border-color 0.16s ease, transform 0.16s ease;
}

.flow-node:hover,
.flow-node:focus-visible {
  border-color: #38bdf8;
  box-shadow: 0 10px 24px rgba(14, 165, 233, 0.2);
}

.flow-node:active {
  cursor: grabbing;
}

.flow-node.is-dragging {
  opacity: 0.38;
  transform: scale(0.97);
}

.flow-node.selected {
  border-color: #0ea5e9;
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.14), 0 8px 20px rgba(15, 23, 42, 0.08);
}

.flow-node.drop-before {
  box-shadow: -8px 0 0 -3px #f59e0b, 0 8px 20px rgba(15, 23, 42, 0.08);
}

.flow-node.drop-after {
  box-shadow: 8px 0 0 -3px #f59e0b, 0 8px 20px rgba(15, 23, 42, 0.08);
}

.node-port {
  position: absolute;
  top: 50%;
  z-index: 1;
  width: 12px;
  height: 12px;
  border: 3px solid #ffffff;
  border-radius: 50%;
  background: #0ea5e9;
  box-shadow: 0 0 0 2px #38bdf8;
  transform: translateY(-50%);
}

.node-input {
  left: -8px;
}

.node-output {
  right: -8px;
}

.node-topline,
.node-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.node-step {
  color: #0284c7;
  font-size: 0.67rem;
  font-weight: 900;
  letter-spacing: 0.1em;
}

.node-kind {
  padding: 3px 7px;
  border-radius: 5px;
  background: #f1f5f9;
  color: #475569;
  font-size: 0.68rem;
  font-weight: 700;
}

.flow-node h2 {
  overflow: hidden;
  margin: 18px 0 6px;
  color: #0f172a;
  font-size: 1.08rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-prompt {
  display: -webkit-box;
  overflow: hidden;
  min-height: 36px;
  margin: 0;
  color: #64748b;
  font-size: 0.8rem;
  line-height: 1.4;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.node-meta {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid #e2e8f0;
  font-size: 0.72rem;
}

.node-timed,
.node-open {
  font-weight: 700;
}

.node-timed {
  color: #dc2626;
}

.node-open {
  color: #16a34a;
}

.node-edit {
  padding: 4px 9px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #ffffff;
  color: #475569;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
}

.node-edit:hover {
  border-color: #38bdf8;
  color: #0369a1;
}

.flow-connector {
  position: relative;
  display: flex;
  width: 84px;
  flex: none;
  align-items: center;
  justify-content: center;
  color: #64748b;
  font-size: 0.65rem;
}

.flow-connector::before {
  position: absolute;
  right: 12px;
  left: 12px;
  height: 3px;
  border-radius: 999px;
  background: #38bdf8;
  content: '';
}

.flow-connector::after {
  position: absolute;
  right: 8px;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-left: 8px solid #0ea5e9;
  content: '';
}

.flow-connector span {
  z-index: 1;
  margin-top: -22px;
  padding: 2px 5px;
  border-radius: 4px;
  background: #f1f5f9;
  white-space: nowrap;
}

.flow-end-node {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  color: #475569;
  font-size: 0.76rem;
}

.end-icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 2px solid #86efac;
  border-radius: 50%;
  background: #f0fdf4;
  color: #16a34a;
  font-weight: 900;
}

.flow-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #64748b;
  text-align: center;
}

.flow-empty > span {
  color: #38bdf8;
  font-size: 3rem;
}

.flow-empty strong {
  margin-top: 8px;
  color: #0f172a;
  font-size: 1.1rem;
}

.flow-empty p {
  margin: 7px 0 16px;
}

.flow-empty button,
.flow-footer button {
  padding: 8px 12px;
  border: 1px solid #bae6fd;
  border-radius: 8px;
  background: #f0f9ff;
  color: #0369a1;
  font-weight: 700;
  cursor: pointer;
}

.flow-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  padding: 12px 24px;
  border-top: 1px solid #e2e8f0;
  background: #ffffff;
  color: #64748b;
  font-size: 0.78rem;
}

@media (max-width: 760px) {
  .flow-header {
    grid-template-columns: 1fr auto;
    gap: 12px;
    padding: 14px 18px;
  }

  .flow-title {
    grid-column: 1 / -1;
    grid-row: 2;
    text-align: left;
  }

  .flow-count {
    grid-column: 2;
    grid-row: 1;
  }

  .flow-canvas {
    padding: 24px 18px;
  }

  .flow-footer {
    padding: 12px 18px;
  }
}

@media (max-width: 500px) {
  .back-button {
    padding: 8px 10px;
    font-size: 0.8rem;
  }

  .flow-title h1 {
    font-size: 1.15rem;
  }

  .flow-title p:last-child {
    font-size: 0.78rem;
  }

  .flow-count {
    padding: 6px 8px;
    font-size: 0.72rem;
  }

  .flow-canvas {
    padding: 20px 14px;
  }

  .flow-footer {
    padding: 10px 12px;
    font-size: 0.72rem;
  }
}
</style>
