<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { QuestionData } from '../rules/types';

const props = defineProps<{
  questions: QuestionData[];
  selectedId: string | null;
}>();

const emit = defineEmits<{
  (event: 'reorder', questions: QuestionData[]): void;
  (event: 'edit', id: string): void;
  (event: 'batch-import', questions: QuestionData[], unit: string): void;
  (event: 'create-question-in-unit', unit: string): void;
  (event: 'back'): void;
}>();

const draggedQuestionId = ref<string | null>(null);
const dragOverQuestionId = ref<string | null>(null);
const dragPlacement = ref<'before' | 'after'>('before');
const dragOverUnit = ref<string | null>(null);
const selectedQuestionIds = ref(new Set<string>());
const unitDraft = ref('');
const createdUnits = ref<string[]>([]);
const activeUnit = ref('');
const flowCanvas = ref<HTMLElement | null>(null);
let originalDocumentOverflow = '';

const getUnitCopyId = (questionId: string, unit: string) =>
  `unit:${encodeURIComponent(unit)}:from:${encodeURIComponent(questionId)}`;
const availableUnits = computed(() => [...new Set([
  ...props.questions.map(question => question.unit?.trim()).filter((unit): unit is string => !!unit),
  ...createdUnits.value,
])].sort((a, b) => a.localeCompare(b)));
const selectedQuestions = computed(() =>
  props.questions.filter(question => selectedQuestionIds.value.has(question.id))
);
const movableQuestions = computed(() =>
  selectedQuestions.value.filter(question => (question.unit?.trim() || '') !== activeUnit.value)
);
const copyableQuestions = computed(() => selectedQuestions.value.filter(question => {
  if (!activeUnit.value || question.unit?.trim() === activeUnit.value) return false;
  const copyId = getUnitCopyId(question.id, activeUnit.value);
  return !props.questions.some(existing => existing.id === copyId);
}));

const questionCountForUnit = (unit: string) => props.questions.filter(question =>
  (question.unit?.trim() || '') === unit
).length;

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
    event.dataTransfer.effectAllowed = 'copyMove';
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

const dropQuestionInUnit = (unit: string, event: DragEvent) => {
  event.preventDefault();
  const sourceId = event.dataTransfer?.getData('text/plain') || draggedQuestionId.value;
  const question = props.questions.find(item => item.id === sourceId);
  if (question && (question.unit?.trim() || '') !== unit) {
    const updated = props.questions.map(item => item.id === sourceId
      ? { ...item, unit: unit || undefined }
      : item);
    emit('batch-import', updated, unit);
  }
  activeUnit.value = unit;
  clearQuestionDrag();
  dragOverUnit.value = null;
};

const addUnit = () => {
  const unit = unitDraft.value.trim();
  if (!unit) return;
  if (!availableUnits.value.includes(unit)) createdUnits.value = [...createdUnits.value, unit];
  activeUnit.value = unit;
  unitDraft.value = '';
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
  dragOverUnit.value = null;
};

const toggleQuestionSelection = (questionId: string) => {
  const selected = new Set(selectedQuestionIds.value);
  if (selected.has(questionId)) selected.delete(questionId);
  else selected.add(questionId);
  selectedQuestionIds.value = selected;
};

const moveSelectedToUnit = () => {
  if (movableQuestions.value.length === 0) return;
  const movedIds = new Set(movableQuestions.value.map(question => question.id));
  const updated = props.questions.map(question => movedIds.has(question.id)
    ? { ...question, unit: activeUnit.value || undefined }
    : question);
  emit('batch-import', updated, activeUnit.value);
};

const copySelectedToUnit = () => {
  if (copyableQuestions.value.length === 0 || !activeUnit.value) return;
  const copies = copyableQuestions.value.map(question => ({
    ...question,
    id: getUnitCopyId(question.id, activeUnit.value),
    unit: activeUnit.value,
  }));
  const updated = [...props.questions, ...copies].map((question, sortOrder) => ({
    ...question,
    sortOrder,
  }));
  emit('batch-import', updated, activeUnit.value);
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
        <p>建立單元資料夾，再把題目拖進資料夾；未分類題目會留在收件匣。</p>
      </div>
      <span class="flow-count">{{ props.questions.length }} 個節點</span>
    </header>

    <section class="unit-workspace" aria-label="單元資料夾">
      <div class="unit-toolbar">
        <div class="unit-heading">
          <strong>單元資料夾</strong>
          <span>拖曳題目到資料夾，或勾選多題後批次移入</span>
        </div>
        <form class="new-unit-form" @submit.prevent="addUnit">
          <input v-model="unitDraft" aria-label="新單元名稱" type="text" placeholder="新增單元，例如 Unit 1" />
          <button type="submit" :disabled="!unitDraft.trim()">＋ 建立單元</button>
        </form>
      </div>
      <div class="unit-folders">
        <button type="button" class="unit-folder inbox-folder"
          :class="{ active: activeUnit === '', 'is-drop-target': dragOverUnit === '' }"
          @click="activeUnit = ''"
          @dragover.prevent="dragOverUnit = ''"
          @dragleave="dragOverUnit = null"
          @drop="dropQuestionInUnit('', $event)">
          <span class="folder-icon">▱</span>
          <span class="folder-name">未分類</span>
          <span class="folder-count">{{ questionCountForUnit('') }}</span>
        </button>
        <button v-for="unit in availableUnits" :key="unit" type="button" class="unit-folder"
          :class="{ active: activeUnit === unit, 'is-drop-target': dragOverUnit === unit }"
          @click="activeUnit = unit"
          @dragover.prevent="dragOverUnit = unit"
          @dragleave="dragOverUnit = null"
          @drop="dropQuestionInUnit(unit, $event)">
          <span class="folder-icon">▱</span>
          <span class="folder-name">{{ unit }}</span>
          <span class="folder-count">{{ questionCountForUnit(unit) }}</span>
        </button>
        <span v-if="availableUnits.length === 0" class="unit-empty-hint">建立單元後，拖曳題目到資料夾即可分類。</span>
      </div>
      <div class="batch-actions">
        <span aria-live="polite">已選 {{ selectedQuestionIds.size }} 題</span>
        <span class="batch-target">{{ activeUnit ? `目標：${activeUnit}` : '目標：未分類收件匣' }}</span>
        <button type="button" class="move-button" :disabled="movableQuestions.length === 0"
          @click="moveSelectedToUnit">
          移入{{ activeUnit || '未分類' }}（{{ movableQuestions.length }}）
        </button>
        <button type="button" class="copy-button" :disabled="copyableQuestions.length === 0"
          @click="copySelectedToUnit">
          複製到{{ activeUnit || '單元' }}（{{ copyableQuestions.length }}）
        </button>
        <button v-if="activeUnit" type="button" class="add-question-button"
          @click="emit('create-question-in-unit', activeUnit)">
          在此單元新增題目
        </button>
      </div>
    </section>

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
            <div class="node-badges">
              <span v-if="q.unit?.trim()" class="node-unit">{{ q.unit?.trim() }}</span>
              <span v-else class="node-unit unclassified-badge">未分類</span>
              <span class="node-kind">{{ q.type === 'grammar' ? '文法題' : q.type === 'contrast' ? '對比題' : q.type === 'chunk' ? '片語題' : '標準題' }}</span>
              <span v-if="q.type === 'standard'" class="node-mode" :class="q.mode || 'build'">
                {{ (q.mode || 'build') === 'reduce' ? 'Reduce' : 'Build' }}
              </span>
            </div>
          </div>
          <label class="node-select" @click.stop>
            <input type="checkbox" :checked="selectedQuestionIds.has(q.id)"
              :aria-label="`選取第 ${index + 1} 關以批次移動`" @change="toggleQuestionSelection(q.id)" />
            選取
          </label>
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

.unit-workspace {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 32px;
  border-bottom: 1px solid #e2e8f0;
  background: #ffffff;
}

.unit-toolbar,
.unit-heading,
.new-unit-form,
.unit-folders,
.batch-actions {
  display: flex;
  align-items: center;
}

.unit-toolbar {
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.unit-heading {
  align-items: baseline;
  flex-wrap: wrap;
  gap: 10px;
}

.unit-heading strong {
  color: #0f172a;
  font-size: 0.92rem;
}

.unit-heading span,
.unit-empty-hint {
  color: #64748b;
  font-size: 0.78rem;
}

.new-unit-form {
  gap: 7px;
}

.new-unit-form input {
  width: 190px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font: inherit;
  font-size: 0.8rem;
}

.new-unit-form input:focus {
  border-color: #0ea5e9;
  outline: 2px solid rgba(14, 165, 233, 0.15);
}

.new-unit-form button,
.move-button,
.copy-button,
.add-question-button {
  padding: 8px 11px;
  border: 1px solid #bae6fd;
  border-radius: 8px;
  background: #f0f9ff;
  color: #0369a1;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}

.new-unit-form button:disabled,
.move-button:disabled,
.copy-button:disabled {
  border-color: #e2e8f0;
  background: #f1f5f9;
  color: #94a3b8;
  cursor: not-allowed;
}

.unit-folders {
  flex-wrap: wrap;
  gap: 8px;
}

.unit-folder {
  display: inline-flex;
  max-width: 240px;
  align-items: center;
  gap: 7px;
  padding: 8px 11px;
  border: 1px solid #dbe3ec;
  border-radius: 9px;
  background: #f8fafc;
  color: #475569;
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.unit-folder:hover {
  border-color: #7dd3fc;
  background: #f0f9ff;
}

.unit-folder.active {
  border-color: #38bdf8;
  background: #e0f2fe;
  color: #0369a1;
}

.unit-folder.is-drop-target {
  border-color: #0284c7;
  background: #bae6fd;
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.16);
}

.folder-icon {
  color: #f59e0b;
  font-size: 1rem;
}

.folder-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-count {
  display: grid;
  min-width: 20px;
  height: 20px;
  place-items: center;
  border-radius: 999px;
  background: #ffffff;
  color: #64748b;
  font-size: 0.68rem;
  font-weight: 800;
}

.unit-empty-hint {
  padding: 5px 2px;
}

.batch-actions {
  flex-wrap: wrap;
  gap: 8px;
  color: #64748b;
  font-size: 0.78rem;
}

.batch-target {
  margin-right: auto;
  color: #334155;
  font-weight: 700;
}

.move-button {
  border-color: #0284c7;
  background: #0284c7;
  color: #ffffff;
}

.move-button:hover:not(:disabled) {
  background: #0369a1;
}

.copy-button {
  border-color: #c4b5fd;
  background: #f5f3ff;
  color: #6d28d9;
}

.copy-button:hover:not(:disabled) {
  background: #ede9fe;
}

.add-question-button {
  border-color: #bbf7d0;
  background: #f0fdf4;
  color: #15803d;
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

.node-badges {
  display: flex;
  align-items: center;
  gap: 6px;
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

.node-unit {
  max-width: 90px;
  overflow: hidden;
  padding: 3px 7px;
  border-radius: 5px;
  background: #ecfdf5;
  color: #047857;
  font-size: 0.68rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-unit.unclassified-badge {
  background: #f1f5f9;
  color: #64748b;
}

.node-mode {
  padding: 3px 7px;
  border-radius: 5px;
  font-size: 0.68rem;
  font-weight: 700;
}

.node-mode.build {
  background: #e0f2fe;
  color: #0369a1;
}

.node-mode.reduce {
  background: #f3e8ff;
  color: #7e22ce;
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

.node-select {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 10px;
  color: #475569;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
}

.node-select input {
  margin: 0;
  accent-color: #0284c7;
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

  .unit-workspace {
    gap: 10px;
    padding: 12px 18px;
  }

  .new-unit-form {
    width: 100%;
  }

  .new-unit-form input {
    flex: 1;
    width: auto;
  }

  .batch-actions {
    align-items: stretch;
  }

  .batch-target {
    flex-basis: 100%;
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
