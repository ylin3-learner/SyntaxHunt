<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import type { QuestionData } from '../rules/types';
import { grammarChapters, getGrammarTopic } from '../rules/grammarTopics';
import { useClassroomSync } from '../composables/useClassroomSync';
import { autoChunk } from '../rules/autoChunk';
import { useQuestionForm } from '../composables/useQuestionForm';
import { compressImageToBase64 } from '../infrastructure/ImageService';

import QuestionFlow from './QuestionFlow.vue';
import QuestionListSidebar from './QuestionListSidebar.vue';
import QuestionEditor from './QuestionEditor.vue';
import GrammarQuestionForm from './forms/GrammarQuestionForm.vue';
import StandardQuestionForm from './forms/StandardQuestionForm.vue';
import QrCodeModal from './QrCodeModal.vue';

const props = defineProps<{ currentQuestions: QuestionData[]; roomCode?: string; }>();
const emit = defineEmits<{
  (e: 'update', questions: QuestionData[]): void;
  (e: 'batch-import', questions: QuestionData[]): void;
  (e: 'sync-local', questions: QuestionData[]): void;
  (e: 'push', id: string): void;
  (e: 'close'): void;
}>();

// ---- 列表與 UI 狀態 ----
const showQrModal = ref(false);
const showQuestionFlow = ref(false);
const localQuestions = ref<QuestionData[]>(JSON.parse(JSON.stringify(props.currentQuestions)));
const unitFilter = ref<'all' | 'unclassified' | `unit:${string}`>('all');

const availableUnits = computed(() => [...new Set(
  localQuestions.value.map(q => typeof q.unit === 'string' ? q.unit.trim() : '').filter(Boolean)
)].sort((a, b) => a.localeCompare(b)));

const filteredQuestions = computed(() => {
  if (unitFilter.value === 'all') return localQuestions.value;
  if (unitFilter.value === 'unclassified') return localQuestions.value.filter(q => !q.unit?.trim());
  const selectedUnit = unitFilter.value.slice('unit:'.length);
  return localQuestions.value.filter(q => q.unit?.trim() === selectedUnit);
});

watch(() => props.currentQuestions, (newVal) => {
  if (localQuestions.value.length === 0 && newVal.length > 0) {
    localQuestions.value = JSON.parse(JSON.stringify(newVal));
  }
}, { deep: true });

// ---- Composable ----
const {
  form, errors,
  isQuestionsExpanded, isClassPanelExpanded,
  isClassModeToggle, targetCountInput,
  activeUploadTarget, uploadTarget,
  isEditing, topicsInSelectedChapter, selectedGrammarTopic,
  applyGrammarTopic, resetForm, saveQuestion
} = useQuestionForm(
  (event: string, payload: any) => {
    if (event === 'save-question') {
      if (form.value.editingId) {
        const idx = localQuestions.value.findIndex(q => q.id === form.value.editingId);
        if (idx !== -1) localQuestions.value[idx] = payload;
      } else {
        localQuestions.value.push(payload);
      }
    }
  },
  props
);

// 只需要 updateClassMode 與 sendResetProgress 來操作
const { updateClassMode, sendResetProgress } = useClassroomSync();

const handleShowQr = () => {
  showQrModal.value = true;
};

const handleModeChange = () => {
  updateClassMode(isClassModeToggle.value, targetCountInput.value);
};

const recommendedUiLabel = computed(() => {
  if (!selectedGrammarTopic.value) return '';
  return ({
    BUILD: 'BUILD 磁吸插槽', MORPH: 'MORPH 摺紙變形', REDUCE: 'REDUCE 碎紙機',
    MATRIX_GATE: 'MATRIX_GATE 特徵解鎖', PRAGMATIC_HP: 'PRAGMATIC_HP 語情血條',
    GRAVITY_SWITCH: 'GRAVITY_SWITCH 重力切換',
  } as Record<string, string>)[selectedGrammarTopic.value.defaultCanvasMode];
});

const isDistractorActive = (word: string) => form.value.distractorsInput.split(/[,，\s]+/).includes(word);
const toggleDistractor = (word: string) => {
  let current = form.value.distractorsInput.split(/[,，\s]+/).filter(Boolean);
  if (current.includes(word)) current = current.filter(w => w !== word);
  else current.push(word);
  form.value.distractorsInput = current.join(', ');
};

const handleChapterChange = () => {
  const firstTopic = topicsInSelectedChapter.value[0];
  if (firstTopic) applyGrammarTopic(firstTopic.id);
};

const handleCanvasModeChange = () => {
  // 保留空實作
};

const editQuestion = (q: QuestionData) => {
  showQuestionFlow.value = false;
  resetForm();
  form.value.editingId = q.id;
  form.value.questionType = q.type;
  form.value.unitName = q.unit || '';
  form.value.targetNoun = q.targetNoun;
  form.value.antecedentNumber = q.antecedent.number || 'singular';
  form.value.antecedentPerson = q.antecedent.person || 'person';
  form.value.imageUrl = q.imageUrl || '';
  form.value.speechRate = q.speechRate || 0.8;
  form.value.isTimedForm = !!q.isTimed;
  form.value.timeLimitForm = q.timeLimit || 60;
  form.value.tagsInput = q.tags?.join(', ') || '';
  form.value.enabledStages = q.enabledStages || ['input', 'macro', 'micro', 'pronunciation', 'noticing'];

  if (q.type === 'grammar') {
    const savedTopic = getGrammarTopic(q.grammarTopicId);
    form.value.selectedGrammarTopicId = savedTopic?.id ?? '';
    form.value.selectedChapter = savedTopic?.chapter ?? 0;
    form.value.editingGrammarTopicId = q.grammarTopicId;
    form.value.grammarConcept = q.concept || 'SENTENCE_PATTERN';
    form.value.uiMode = q.ui_mode || 'BUILD';
    form.value.grammarAnswer = (q.correctAnswer || []).join(' ');
    form.value.grammarChunks = JSON.parse(JSON.stringify(q.chunks || []));
    form.value.grammarSentence = form.value.grammarChunks.map(c => c.text).join(' ');
    form.value.selectedCanvasMode = q.canvas_mode ?? savedTopic?.defaultCanvasMode ?? 'BUILD';
    form.value.statusGap = q.pragmatic_target?.statusGap ?? q.status_gap ?? 1;
    form.value.npcLabel = q.pragmatic_target?.npcLabel ?? '';
  } else {
    form.value.questionMode = q.mode || 'build';
    form.value.relativeSentence = q.grammarFeature?.relative.label || '';
    form.value.prepositionSentence = q.grammarFeature?.preposition.label || '';
    form.value.chunkZhInput = q.previewData?.chunkZh || '';
    form.value.chunkQuizInput = q.previewData?.quizOptions?.filter(o => !o.isCorrect).map(o => o.text).join(', ') || '';
    form.value.distractorImageUrl = q.inputData?.options.find(o => !o.isCorrect)?.image || '';
    form.value.correctLabel = q.inputData?.options.find(o => o.isCorrect)?.text || '';
    form.value.distractorLabel = q.inputData?.options.find(o => !o.isCorrect)?.text || '';
    if (q.contextCloze) {
      form.value.clozePrefix = q.contextCloze.prefix;
      form.value.clozeSuffix = q.contextCloze.suffix;
    }
    if (q.contrastData) {
      form.value.chineseSentence = q.contrastData.chineseSentence;
      form.value.chineseHighlight = q.contrastData.chineseHighlight;
      form.value.modifierImageUrl = q.contrastData.modifierImage;
      form.value.puzzleLayout = q.contrastData.layout || 'modifier-left';
    }
  }
};

const autoChunkGrammarSentence = () => {
  if (!form.value.grammarSentence.trim()) return;
  form.value.grammarChunks = autoChunk(form.value.grammarSentence, form.value.grammarConcept).map((c, i) => ({
    ...c, id: `${form.value.editingId || 'new'}-auto-${i}`
  }));
};
const splitGrammarSentenceManually = () => {
  const words = form.value.grammarSentence.trim().split(/\s+/).filter(Boolean);
  form.value.grammarChunks = words.map((text, i) => ({ id: `${form.value.editingId || 'new'}-manual-${i}`, text, draggable: true, can_morph: false }));
};
const updateMorphOptions = (id: string, value: string) => {
  const chunk = form.value.grammarChunks.find(c => c.id === id);
  if (!chunk) return;
  const options = value.split(',').map(o => o.trim()).filter(Boolean);
  chunk.options = options; chunk.morph_options = options; chunk.current_index = Math.max(0, options.indexOf(chunk.text));
};
const updateChunkText = (id: string, value: string) => {
  const chunk = form.value.grammarChunks.find(c => c.id === id);
  if (chunk) chunk.text = value;
};
const handleMorphTargetToggle = (id: string, enabled: boolean) => {
  const chunk = form.value.grammarChunks.find(c => c.id === id);
  if (chunk) {
    chunk.can_morph = enabled;
    if (!enabled) { chunk.options = []; chunk.morph_options = []; chunk.current_index = 0; }
  }
};

// ---- 圖片上傳 ----
const fileInput = ref<HTMLInputElement | null>(null);
const distractorFileInput = ref<HTMLInputElement | null>(null);
const modifierFileInput = ref<HTMLInputElement | null>(null);

const triggerUpload = (target: 'noun' | 'distractor' | 'modifier') => {
  activeUploadTarget.value = target; uploadTarget.value = target;
  if (target === 'noun') fileInput.value?.click();
  else if (target === 'distractor') distractorFileInput.value?.click();
  else modifierFileInput.value?.click();
};

const handleFileChange = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file || !uploadTarget.value) return;
  try {
    const base64 = await compressImageToBase64(file);
    if (uploadTarget.value === 'noun') form.value.imageUrl = base64;
    else if (uploadTarget.value === 'distractor') form.value.distractorImageUrl = base64;
    else form.value.modifierImageUrl = base64;
  } catch (err: any) { alert(err.message); }
  activeUploadTarget.value = null;
};

const handlePaste = async (event: ClipboardEvent) => {
  const items = event.clipboardData?.items;
  if (!items || !activeUploadTarget.value) return;
  for (const item of items) {
    if (item.type.indexOf('image') !== -1) {
      const file = item.getAsFile();
      if (file) {
        try {
          const base64 = await compressImageToBase64(file);
          if (activeUploadTarget.value === 'noun') form.value.imageUrl = base64;
          else if (activeUploadTarget.value === 'distractor') form.value.distractorImageUrl = base64;
          else form.value.modifierImageUrl = base64;
        } catch (err: any) { alert(err.message); }
        event.preventDefault();
        break;
      }
    }
  }
};
onMounted(() => window.addEventListener('paste', handlePaste));
onUnmounted(() => window.removeEventListener('paste', handlePaste));

// ---- 列表與題目操作 ----
const deleteQuestion = (id: string) => {
  if (confirm('確定要刪除這道題目嗎？')) {
    localQuestions.value = localQuestions.value.filter(q => q.id !== id);
    if (form.value.editingId === id) resetForm();
  }
};
const handleSaveAndPush = (id: string) => {
  if (form.value.editingId === id) resetForm();
  setTimeout(() => { emit('sync-local', localQuestions.value); emit('push', id); }, 50);
};
const saveAllAndClose = () => {
  if (localQuestions.value.length === 0) { alert('題庫不能為空'); return; }
  emit('update', localQuestions.value); emit('close');
};
const handleQuestionReorder = (qs: QuestionData[]) => { localQuestions.value = qs; };
const handleBatchImport = (qs: QuestionData[], unit: string) => {
  localQuestions.value = qs; unitFilter.value = unit ? `unit:${unit}` : 'unclassified'; emit('batch-import', qs);
};
const startQuestionInUnit = (unit: string) => { showQuestionFlow.value = false; resetForm(); form.value.unitName = unit; };
const openQuestionEdit = (id: string) => { const q = localQuestions.value.find(i => i.id === id); if (q) editQuestion(q); };
</script>

<template>
  <Teleport to="body">
    <QuestionFlow v-if="showQuestionFlow" :questions="localQuestions" :selected-id="form.editingId"
      @reorder="handleQuestionReorder" @edit="openQuestionEdit" @batch-import="handleBatchImport"
      @create-question-in-unit="startQuestionInUnit" @back="showQuestionFlow = false" />

    <div v-else class="admin-modal">
      <div class="admin-layout">
        <!-- 👈 將 props.roomCode 傳給 Sidebar -->
        <QuestionListSidebar v-model:unit-filter="unitFilter" v-model:is-class-panel-expanded="isClassPanelExpanded"
          v-model:is-questions-expanded="isQuestionsExpanded" v-model:is-class-mode-toggle="isClassModeToggle"
          v-model:target-count-input="targetCountInput" :questions="localQuestions"
          :filtered-questions="filteredQuestions" :available-units="availableUnits" :editing-id="form.editingId"
          :room-code="props.roomCode" @open-flow="showQuestionFlow = true" @mode-change="handleModeChange"
          @reset-progress="sendResetProgress" @edit="editQuestion" @push="handleSaveAndPush" @delete="deleteQuestion"
          @new-question="resetForm" @save-close="saveAllAndClose" @show-qr="handleShowQr" />

        <QuestionEditor :title="isEditing ? '✏️ 編輯題目' : '🆕 新增題目'" :question-type="form.questionType"
          @update:question-type="form.questionType = $event">
          <div class="form-group">
            <label for="question-unit">單元名稱</label>
            <input id="question-unit" v-model="form.unitName" type="text" placeholder="例如：Unit 1" />
          </div>

          <GrammarQuestionForm v-if="form.questionType === 'grammar'" :form="form" :errors="errors"
            :topicsInSelectedChapter="topicsInSelectedChapter" :selectedGrammarTopic="selectedGrammarTopic"
            :recommendedUiLabel="recommendedUiLabel" :handleChapterChange="handleChapterChange"
            :applyGrammarTopic="applyGrammarTopic" :autoChunkGrammarSentence="autoChunkGrammarSentence"
            :splitGrammarSentenceManually="splitGrammarSentenceManually" :updateChunkText="updateChunkText"
            :handleMorphTargetToggle="handleMorphTargetToggle" :updateMorphOptions="updateMorphOptions"
            :handleCanvasModeChange="handleCanvasModeChange" />

          <StandardQuestionForm v-else :form="form" :activeUploadTarget="activeUploadTarget"
            :triggerUpload="triggerUpload" :handleFileChange="handleFileChange" :toggleDistractor="toggleDistractor"
            :isDistractorActive="isDistractorActive" @update:activeUploadTarget="activeUploadTarget = $event" />

          <template #footer>
            <button v-if="isEditing" class="btn-cancel" @click="resetForm">取消</button>
            <button class="btn-save" @click="saveQuestion">{{ isEditing ? '💾 儲存修改' : '✨ 加入題庫' }}</button>
          </template>
        </QuestionEditor>
      </div>
    </div>

    <!-- 👈 QR Modal，使用 props.roomCode -->
    <QrCodeModal :is-open="showQrModal" :room-code="props.roomCode || ''" @close="showQrModal = false" />

    <input ref="fileInput" type="file" accept="image/*" style="display: none" @change="handleFileChange" />
    <input ref="distractorFileInput" type="file" accept="image/*" style="display: none" @change="handleFileChange" />
    <input ref="modifierFileInput" type="file" accept="image/*" style="display: none" @change="handleFileChange" />
  </Teleport>
</template>

<style scoped>
/* 保持不變 */
.admin-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.admin-layout {
  display: flex;
  width: 90vw;
  max-width: 1440px;
  height: 85vh;
  background: #ffffff;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.2);
  animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes popIn {
  0% {
    transform: scale(0.95);
    opacity: 0;
  }

  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.form-group {
  margin-bottom: 24px;
  display: flex;
  flex-direction: column;
}

.form-group label {
  font-weight: bold;
  margin-bottom: 10px;
  color: #555;
  font-size: 0.95rem;
}

.form-group input[type="text"] {
  padding: 14px;
  border: 2px solid #e5e5e5;
  border-radius: 12px;
  font-size: 1.05rem;
  outline: none;
  transition: border 0.2s;
  background: #fafafa;
  width: 100%;
  box-sizing: border-box;
}

.form-group input[type="text"]:focus {
  border-color: #1cb0f6;
  background: #ffffff;
  box-shadow: 0 0 0 4px rgba(28, 176, 246, 0.1);
}

.btn-cancel {
  background: #ffffff;
  border: 2px solid #e5e5e5;
  padding: 12px 24px;
  border-radius: 12px;
  font-weight: bold;
  cursor: pointer;
  color: #777;
}

.btn-cancel:hover {
  background: #f0f0f0;
}

.btn-save {
  background: #58cc02;
  border: none;
  border-bottom: 4px solid #46a302;
  padding: 12px 32px;
  border-radius: 12px;
  font-weight: bold;
  color: white;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.1s;
}

.btn-save:active {
  border-bottom-width: 0;
  transform: translateY(4px);
}

@media (max-width: 760px) {
  .admin-layout {
    width: 96vw;
    height: 94vh;
    flex-direction: column;
  }
}

@media (max-width: 500px) {
  .admin-layout {
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    border-radius: 0;
  }
}
</style>