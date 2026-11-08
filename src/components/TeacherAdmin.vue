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
import EditorFormFields from './EditorFormFields.vue';

const props = defineProps<{ currentQuestions: QuestionData[]; }>();
const emit = defineEmits<{
  (e: 'update', questions: QuestionData[]): void;
  (e: 'batch-import', questions: QuestionData[]): void;
  (e: 'sync-local', questions: QuestionData[]): void;
  (e: 'push', id: string): void;
  (e: 'close'): void;
}>();

// ---- 列表與 UI 狀態 (留在 TeacherAdmin) ----
const showQuestionFlow = ref(false);
const localQuestions = ref<QuestionData[]>(JSON.parse(JSON.stringify(props.currentQuestions)));
const unitFilter = ref<'all' | 'unclassified' | `unit:${string}`>('all');
const advancedSettingsExpanded = ref(false); // 👈 這個純 UI 狀態留在這裡

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

// ---- 從 Composable 取得表單與 UI 狀態 ----
const {
  form, errors,
  isQuestionsExpanded, isClassPanelExpanded,
  isClassModeToggle, targetCountInput,
  activeUploadTarget, uploadTarget,
  isEditing, topicsInSelectedChapter, selectedGrammarTopic,
  applyGrammarTopic, resetForm,
  saveQuestion 
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

const { updateClassMode, sendResetProgress } = useClassroomSync();
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

const funnelDiscarded = computed(() =>
  form.value.relativeSentence.replace(/\[[^\]]+\]/g, '').replace(/\s+/g, ' ').trim()
);

const isDistractorActive = (word: string) => form.value.distractorsInput.split(/[,，\s]+/).includes(word);
const toggleDistractor = (word: string) => {
  let current = form.value.distractorsInput.split(/[,，\s]+/).filter(Boolean);
  if (current.includes(word)) current = current.filter(w => w !== word);
  else current.push(word);
  form.value.distractorsInput = current.join(', ');
};

// ---- 補齊 useQuestionForm 缺少的方法 ----
const handleChapterChange = () => {
  const firstTopic = topicsInSelectedChapter.value[0];
  if (firstTopic) applyGrammarTopic(firstTopic.id);
};

const handleCanvasModeChange = () => {
  // useQuestionForm 裡有實作，若無請保留這個空函數或補上邏輯
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
        <QuestionListSidebar v-model:unit-filter="unitFilter" v-model:is-class-panel-expanded="isClassPanelExpanded"
          v-model:is-questions-expanded="isQuestionsExpanded" v-model:is-class-mode-toggle="isClassModeToggle"
          v-model:target-count-input="targetCountInput" :questions="localQuestions"
          :filtered-questions="filteredQuestions" :available-units="availableUnits" :editing-id="form.editingId"
          @open-flow="showQuestionFlow = true" @mode-change="handleModeChange" @reset-progress="sendResetProgress"
          @edit="editQuestion" @push="handleSaveAndPush" @delete="deleteQuestion" @new-question="resetForm"
          @save-close="saveAllAndClose" />

        <!-- 右側編輯器 -->
        <QuestionEditor :title="isEditing ? '✏️ 編輯題目' : '🆕 新增題目'" :question-type="form.questionType"
          @update:question-type="form.questionType = $event">
          <div class="form-group">
            <label for="question-unit">單元名稱</label>
            <input id="question-unit" v-model="form.unitName" type="text" placeholder="例如：Unit 1" />
          </div>

          <template v-if="form.questionType === 'grammar'">
            <div class="form-group">
              <label for="grammar-chapter">課綱章節</label>
              <select id="grammar-chapter" v-model.number="form.selectedChapter" class="grammar-select"
                @change="handleChapterChange">
                <option v-if="form.selectedChapter === 0" :value="0" disabled>舊題／自訂考點（保留原設定）</option>
                <option v-for="chapter in grammarChapters" :key="chapter.number" :value="chapter.number">
                  第 {{ chapter.number }} 章：{{ chapter.title }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label for="grammar-topic">具體考點</label>
              <select id="grammar-topic" v-model="form.selectedGrammarTopicId" class="grammar-select"
                :disabled="form.selectedChapter === 0" @change="applyGrammarTopic(form.selectedGrammarTopicId)">
                <option v-for="topic in topicsInSelectedChapter" :key="topic.id" :value="topic.id">{{ topic.title }}
                </option>
              </select>
            </div>
            <div v-if="selectedGrammarTopic" class="grammar-recommendation" role="status">
              <strong>系統推薦：{{ recommendedUiLabel }}</strong>
              <p>{{ selectedGrammarTopic.recommendation }}</p>
              <span>本題唯一操作焦點：{{ selectedGrammarTopic.focus }}</span>
              <small v-if="['MORPH', 'GRAVITY_SWITCH'].includes(selectedGrammarTopic.defaultCanvasMode)">
                請設定至少一個可變形字塊，並提供正確形式。
              </small>
            </div>
            <div v-else class="grammar-recommendation legacy-recommendation" role="status">
              <strong>舊題／自訂考點</strong>
              <p>保留此題原有的文法概念與互動模式。選擇課綱考點後，系統會套用對應推薦。</p>
              <span>目前模式：{{ form.uiMode }}</span>
            </div>

            <EditorFormFields v-model:canvas-mode="form.selectedCanvasMode"
              v-model:grammar-sentence="form.grammarSentence" v-model:grammar-answer="form.grammarAnswer"
              v-model:target-noun="form.targetNoun" v-model:antecedent-number="form.antecedentNumber"
              :grammar-chunks="form.grammarChunks" v-model:status-gap="form.statusGap" v-model:npc-label="form.npcLabel"
              v-model:matrix-x-input="form.matrixXInput" v-model:matrix-y-input="form.matrixYInput"
              v-model:matrix-correct-x="form.matrixCorrectX" v-model:matrix-correct-y="form.matrixCorrectY"
              v-model:matrix-prompt="form.matrixPrompt" v-model:matrix-answer="form.matrixAnswer"
              v-model:matrix-options-input="form.matrixOptionsInput" @auto-chunk="autoChunkGrammarSentence"
              @split-manually="splitGrammarSentenceManually" @update-chunk-text="updateChunkText"
              @toggle-morph-target="handleMorphTargetToggle" @update-morph-options="updateMorphOptions"
              @mode-change="handleCanvasModeChange" />

            <div class="form-group">
              <button type="button" class="btn-push" @click="advancedSettingsExpanded = !advancedSettingsExpanded">
                {{ advancedSettingsExpanded ? '收合進階設定 ▲' : '展開進階設定 ▼' }}
              </button>
              <div v-show="advancedSettingsExpanded" class="advanced-settings">
                <label><input v-model="form.isTimedForm" type="checkbox" /> 限時挑戰</label>
                <input v-if="form.isTimedForm" v-model.number="form.timeLimitForm" type="number" min="10" step="10"
                  placeholder="60 秒" aria-label="限時秒數" />
                <label for="grammar-tags">標籤（逗號分隔）</label>
                <input id="grammar-tags" v-model="form.tagsInput" type="text" placeholder="例如：過去式, 動詞時態" />
                <label for="grammar-speech-rate">TTS 語速</label>
                <input id="grammar-speech-rate" v-model.number="form.speechRate" type="number" min="0.5" max="1.5"
                  step="0.1" />
              </div>
            </div>
            <p v-if="errors.length > 0" class="grammar-error" role="alert">{{ errors[0] }}</p>
          </template>

          <template v-else>
            <div class="form-group" v-if="form.questionType !== 'chunk'">
              <label>題目節奏</label>
              <div class="segmented-control">
                <button :class="{ active: !form.isTimedForm }" @click="form.isTimedForm = false">🟢 自由進度</button>
                <button :class="{ active: form.isTimedForm }" @click="form.isTimedForm = true">🔴 限時挑戰</button>
              </div>
            </div>
            <div class="form-group" v-if="form.isTimedForm && form.questionType !== 'chunk'">
              <label>⏱️ 限時秒數</label>
              <input type="number" v-model.number="form.timeLimitForm" placeholder="60" min="10" step="10" />
            </div>
            <div class="form-group" v-if="form.questionType !== 'chunk'">
              <label>本題教學流程</label>
              <div class="stage-checkboxes">
                <label v-if="form.questionType === 'standard'"><input type="checkbox" value="input"
                    v-model="form.enabledStages">聽力輸入</label>
                <label v-if="form.questionType === 'standard' && form.questionMode !== 'reduce'"><input type="checkbox"
                    value="macro" v-model="form.enabledStages"> 巨觀拖拉</label>
                <label><input type="checkbox" value="micro" v-model="form.enabledStages"> 字磚重組</label>
                <label><input type="checkbox" value="pronunciation" v-model="form.enabledStages"> 語音練習</label>
                <label><input type="checkbox" value="noticing" v-model="form.enabledStages"> 意識提升</label>
              </div>
            </div>
            <div class="form-group" v-if="form.questionType === 'standard'">
              <label>題目模式</label>
              <div class="type-switcher">
                <button :class="{ active: form.questionMode === 'build' }" @click="form.questionMode = 'build'">一般組句題
                  (Build)</button>
                <button :class="{ active: form.questionMode === 'reduce' }"
                  @click="form.questionMode = 'reduce'">關係子句轉換題 (Reduce)</button>
              </div>
            </div>
            <div class="form-group">
              <label>TTS 語音速度</label>
              <div class="type-switcher">
                <button :class="{ active: form.speechRate === 0.5 }" @click="form.speechRate = 0.5">🐢 慢速 (0.5)</button>
                <button :class="{ active: form.speechRate === 0.8 }" @click="form.speechRate = 0.8">🚶 適中 (0.8)</button>
                <button :class="{ active: form.speechRate === 1.0 }" @click="form.speechRate = 1.0">🏃 正常 (1.0)</button>
              </div>
            </div>

            <template v-if="form.questionType === 'chunk'">
              <div class="form-group">
                <label>片語內容 (用 [ ] 包住要測驗的片語)</label>
                <input v-model="form.relativeSentence" type="text" placeholder="Ex: [looking up words]" />
              </div>
              <div class="form-group">
                <label>片語中文意思</label>
                <input v-model="form.chunkZhInput" type="text" placeholder="Ex: 查單字" />
              </div>
              <div class="form-group">
                <label>錯誤片語選項 (用逗號隔開，供微測驗用)</label>
                <input v-model="form.chunkQuizInput" type="text"
                  placeholder="Ex: looking for his pen, looking at the board" />
              </div>
            </template>

            <div class="form-group">
              <label>{{ form.questionType === 'contrast' ? '名詞圖片 (拼圖右側)' : form.questionType === 'chunk' ? '片語情境圖片' :
                '正確角色圖片'
                }}</label>
              <div class="upload-area" :class="{ 'active-upload': activeUploadTarget === 'noun' }"
                @click="triggerUpload('noun')">
                <img v-if="form.imageUrl" :src="form.imageUrl" class="preview-img" />
                <div v-else class="upload-placeholder"><span class="icon">📸</span><span>點擊上傳或貼上正確圖片</span></div>
              </div>
              <input ref="fileInput" type="file" accept="image/*" style="display: none" @change="handleFileChange" />
            </div>

            <template v-if="form.questionType !== 'chunk'">
              <div class="form-group" v-if="form.questionType === 'standard'">
                <label>干擾圖片 (選填，聽力測驗的錯誤選項圖)</label>
                <div class="upload-area" :class="{ 'active-upload': activeUploadTarget === 'distractor' }"
                  @click="triggerUpload('distractor')">
                  <img v-if="form.distractorImageUrl" :src="form.distractorImageUrl" class="preview-img" />
                  <div v-else class="upload-placeholder"><span class="icon">🐱</span><span>點擊上傳干擾圖片</span></div>
                </div>
                <input ref="distractorFileInput" type="file" accept="image/*" style="display: none"
                  @change="handleFileChange" />
              </div>
              <div class="form-group" v-if="form.questionType === 'contrast'">
                <label>修飾語圖片 (拼圖左側)</label>
                <div class="upload-area" :class="{ 'active-upload': activeUploadTarget === 'modifier' }"
                  @click="triggerUpload('modifier')">
                  <img v-if="form.modifierImageUrl" :src="form.modifierImageUrl" class="preview-img" />
                  <div v-else class="upload-placeholder"><span class="icon">🧩</span><span>點擊上傳修飾語圖片</span></div>
                </div>
                <input ref="modifierFileInput" type="file" accept="image/*" style="display: none"
                  @change="handleFileChange" />
              </div>
            </template>

            <div class="form-row">
              <div class="form-group">
                <label>目標名詞</label>
                <input v-model="form.targetNoun" type="text" placeholder="Ex: The boy"
                  @focus="activeUploadTarget = null" />
              </div>
              <div class="form-group">
                <label>心智圖標籤 (Tags)</label>
                <input v-model="form.tagsInput" type="text" placeholder="Ex: 穿著與顏色"
                  @focus="activeUploadTarget = null" />
              </div>
            </div>

            <div class="form-group" v-if="form.questionType !== 'chunk'">
              <label>先行詞單複數 (影響動詞一致性判斷)</label>
              <div class="type-switcher">
                <button :class="{ active: form.antecedentNumber === 'singular' }"
                  @click="form.antecedentNumber = 'singular'">單數
                  (Singular)</button>
                <button :class="{ active: form.antecedentNumber === 'plural' }"
                  @click="form.antecedentNumber = 'plural'">複數
                  (Plural)</button>
              </div>
            </div>
            <div class="form-group" v-if="form.questionType !== 'chunk'">
              <label>先行詞類別 (影響 who/which 判斷)</label>
              <div class="type-switcher">
                <button type="button" :class="{ active: form.antecedentPerson === 'person' }"
                  @click="form.antecedentPerson = 'person'">人 (Person)</button>
                <button type="button" :class="{ active: form.antecedentPerson === 'thing' }"
                  @click="form.antecedentPerson = 'thing'">物 (Thing)</button>
              </div>
            </div>
            <div class="form-group" v-if="form.questionType !== 'chunk'">
              <label style="display: flex; justify-content: space-between;">
                <span>句型 A：關係子句 (漏斗入口)</span>
                <span v-if="form.questionMode === 'reduce'" style="color: #1cb0f6; font-size: 0.8rem;">💡 用 [ ]
                  框住要保留的片語</span>
              </label>
              <input v-model="form.relativeSentence" type="text"
                :placeholder="form.questionMode === 'reduce' ? 'Ex: who wears [a blue uniform]' : 'Ex: who wears a blue uniform'"
                @focus="activeUploadTarget = null" />
            </div>
            <div v-if="form.questionType === 'standard' && form.questionMode === 'reduce'" class="funnel-preview">
              <div class="funnel-title">🔍 系統自動拆解預覽 (可手動修改保留內容)</div>
              <div class="funnel-row">
                <span class="funnel-label" style="color: #166534;">🟢 保留 (簡化句)</span>
                <input v-model="form.prepositionSentence" type="text" class="funnel-input-kept"
                  placeholder="Ex: [with a dictionary]" />
              </div>
              <div class="funnel-row">
                <span class="funnel-label">🗑️ 丟棄 (垃圾桶)</span>
                <span class="funnel-value discarded">{{ funnelDiscarded || '（無多餘詞彙）' }}</span>
              </div>
              <p
                style="font-size: 0.85rem; color: #b45309; margin-top: 8px; background: #fef3c7; padding: 8px; border-radius: 8px;">
                💡 提示：如果「動詞」要轉換為「介系詞」（例如 who is carrying ➔ with），請直接在綠色框內加上介系詞，系統會自動把該字加入學生的字磚庫。
              </p>
            </div>
            <div class="form-group" v-if="form.questionType === 'standard'">
              <label>迷思干擾磚 (點擊下方標籤快速加入)</label>
              <div class="distractor-tags">
                <button v-for="tag in ['she', 'he', 'it', 'they']" :key="tag"
                  :class="{ active: isDistractorActive(tag) }" @click.prevent="toggleDistractor(tag)">{{ tag }}</button>
                <div class="divider"></div>
                <button v-for="tag in ['wear', 'have', 'live', 'look']" :key="tag"
                  :class="{ active: isDistractorActive(tag) }" @click.prevent="toggleDistractor(tag)">{{ tag }}</button>
                <div class="divider"></div>
                <button v-for="tag in ['who', 'which']" :key="tag" :class="{ active: isDistractorActive(tag) }"
                  @click.prevent="toggleDistractor(tag)">{{ tag }}</button>
              </div>
              <input v-model="form.distractorsInput" type="text" placeholder="或手動輸入其他干擾磚 (用逗號隔開)"
                style="margin-top: 12px;" @focus="activeUploadTarget = null" />
            </div>
            <div class="form-group" v-if="form.questionType === 'standard'">
              <label>克漏字上下文 (選填，若填寫將用於 TTS 發音句子)</label>
              <div style="display: flex; gap: 8px; align-items: center;">
                <input v-model="form.clozePrefix" type="text" placeholder="Ex: The boy" style="flex: 1;"
                  @focus="activeUploadTarget = null" />
                <span style="font-weight: bold; color: #777;">[ 修飾語 ]</span>
                <input v-model="form.clozeSuffix" type="text" placeholder="Ex: is my brother." style="flex: 1;"
                  @focus="activeUploadTarget = null" />
              </div>
            </div>
            <div class="form-row" v-if="form.questionType === 'standard'">
              <div class="form-group">
                <label>正確圖下方文字 (選填)</label>
                <input v-model="form.correctLabel" type="text" placeholder="Ex: who is looking up words"
                  @focus="activeUploadTarget = null" />
              </div>
              <div class="form-group">
                <label>干擾圖下方文字 (選填)</label>
                <input v-model="form.distractorLabel" type="text" placeholder="Ex: who is looking for his pen"
                  @focus="activeUploadTarget = null" />
              </div>
            </div>

            <template v-if="form.questionType === 'contrast'">
              <div class="form-group">
                <label>中文句子</label>
                <input v-model="form.chineseSentence" type="text" placeholder="Ex: 戴藍色帽子的女孩"
                  @focus="activeUploadTarget = null" />
              </div>
              <div class="form-group">
                <label>中文高亮 (修飾語部分)</label>
                <input v-model="form.chineseHighlight" type="text" placeholder="Ex: 戴藍色帽子的"
                  @focus="activeUploadTarget = null" />
              </div>
              <div class="form-group">
                <label>拼圖排列方向</label>
                <div class="type-switcher">
                  <button :class="{ active: form.puzzleLayout === 'modifier-left' }"
                    @click="form.puzzleLayout = 'modifier-left'">佈局 A (修飾語在左)</button>
                  <button :class="{ active: form.puzzleLayout === 'modifier-right' }"
                    @click="form.puzzleLayout = 'modifier-right'">佈局 B (修飾語在右)</button>
                </div>
              </div>
              <div class="form-group">
                <label>解釋卡標題</label>
                <input v-model="form.explanationTitle" type="text" placeholder="Ex: ✨ 你發現了嗎？"
                  @focus="activeUploadTarget = null" />
              </div>
              <div class="form-group">
                <label>解釋卡說明</label>
                <input v-model="form.explanationDesc" type="text" placeholder="Ex: 修飾語要放在名詞的後面喔！"
                  @focus="activeUploadTarget = null" />
              </div>
            </template>
          </template>

          <template #footer>
            <button v-if="isEditing" class="btn-cancel" @click="resetForm">取消</button>
            <button class="btn-save" @click="saveQuestion">{{ isEditing ? '💾 儲存修改' : '✨ 加入題庫' }}</button>
          </template>
        </QuestionEditor>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* 保持原本樣式，請直接沿用你原本的 Style */
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

.sidebar {
  width: 320px;
  background: #f7f9fc;
  border-right: 2px solid #e5e5e5;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sidebar-header,
.sidebar-footer {
  flex-shrink: 0;
}

.sidebar-header {
  padding: 24px;
  border-bottom: 2px solid #e5e5e5;
}

.sidebar-header h2 {
  margin: 0 0 8px 0;
  font-size: 1.2rem;
  color: #1cb0f6;
}

.sidebar-header p {
  margin: 0;
  font-size: 0.85rem;
  color: #777;
  line-height: 1.5;
}

.btn-flow {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
  padding: 10px 12px;
  border: 1px solid #bae6fd;
  border-radius: 9px;
  background: #f0f9ff;
  color: #0369a1;
  font-weight: 700;
  cursor: pointer;
}

.btn-flow:hover {
  border-color: #38bdf8;
  background: #e0f2fe;
}

.btn-flow span {
  display: grid;
  min-width: 22px;
  height: 22px;
  place-items: center;
  border-radius: 999px;
  background: #ffffff;
  font-size: 0.75rem;
}

.class-mode-panel {
  background: #fff8e1;
  border-bottom: 2px solid #ffe082;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.panel-header {
  padding: 16px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.panel-header:hover {
  background: #ffecb3;
}

.panel-header h3 {
  margin: 0;
  font-size: 1rem;
  color: #b45309;
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-content {
  padding: 0 24px 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mode-toggle label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: bold;
  color: #b45309;
  cursor: pointer;
}

.target-count {
  display: flex;
  align-items: center;
  gap: 8px;
}

.target-count label {
  font-weight: bold;
  color: #b45309;
}

.target-count input {
  width: 60px;
  padding: 4px 8px;
  border: 2px solid #ffe082;
  border-radius: 8px;
  font-size: 1rem;
  outline: none;
}

.btn-reset-progress {
  margin-top: 4px;
  background: #ff4b4b;
  color: white;
  border: none;
  border-bottom: 3px solid #cc0000;
  padding: 8px;
  border-radius: 8px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.1s;
  width: 100%;
}

.btn-reset-progress:active {
  border-bottom-width: 0;
  transform: translateY(3px);
}

.sidebar-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.section-header {
  padding: 16px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  background: #f0f4f8;
  transition: background 0.2s;
  user-select: none;
  flex-shrink: 0;
}

.section-header:hover {
  background: #e2e8f0;
}

.section-header h3 {
  margin: 0;
  font-size: 1rem;
  color: #1cb0f6;
  display: flex;
  align-items: center;
  gap: 8px;
}

.toggle-icon {
  font-size: 0.8rem;
  color: #777;
}

.list-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.unit-filter {
  padding: 12px 16px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.unit-filter label {
  flex-shrink: 0;
  color: #555;
  font-size: 0.9rem;
  font-weight: bold;
}

.unit-filter .grammar-select {
  flex: 1;
  min-width: 0;
}

.question-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.question-list-inner {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sidebar-footer {
  padding: 16px 24px;
  background: #ffffff;
  border-top: 2px solid #e5e5e5;
  z-index: 10;
}

.editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  min-width: 0;
  min-height: 0;
}

.editor-header {
  padding: 20px 32px;
  border-bottom: 2px solid #f0f0f0;
  flex-shrink: 0;
}

.editor-header h3 {
  margin: 0;
  color: #333;
  font-size: 1.3rem;
}

.type-switcher {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.type-switcher button {
  flex: 1;
  padding: 10px;
  background: #f0f0f0;
  border: 2px solid transparent;
  border-radius: 12px;
  font-weight: bold;
  color: #777;
  cursor: pointer;
  transition: all 0.2s;
}

.type-switcher button.active {
  background: #e6f7ff;
  border-color: #1cb0f6;
  color: #1cb0f6;
}

.editor-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
}

.form-group {
  margin-bottom: 24px;
  display: flex;
  flex-direction: column;
}

.form-row {
  display: flex;
  gap: 16px;
}

.form-row .form-group {
  flex: 1;
}

.form-group label {
  font-weight: bold;
  margin-bottom: 10px;
  color: #555;
  font-size: 0.95rem;
}

.form-group input[type="text"],
.form-group input[type="number"],
.grammar-select {
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

.form-group input[type="text"]:focus,
.form-group input[type="number"]:focus,
.grammar-select:focus {
  border-color: #1cb0f6;
  background: #ffffff;
  box-shadow: 0 0 0 4px rgba(28, 176, 246, 0.1);
}

.upload-area {
  border: 2px dashed #ccc;
  border-radius: 16px;
  height: 160px;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  overflow: hidden;
  background: #fafafa;
  transition: all 0.2s;
}

.upload-area:hover {
  border-color: #1cb0f6;
  background: #e6f7ff;
}

.upload-area.active-upload {
  border-color: #58cc02;
  background: #f0fff0;
  box-shadow: 0 0 0 4px rgba(88, 204, 2, 0.2);
}

.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #999;
  font-weight: bold;
}

.upload-placeholder .icon {
  font-size: 2rem;
}

.preview-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.editor-footer {
  padding: 16px 32px;
  border-top: 2px solid #f0f0f0;
  display: flex;
  justify-content: flex-end;
  gap: 16px;
  background: #fafafa;
  flex-shrink: 0;
}

.stage-checkboxes {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  background: #f9f9f9;
  padding: 16px;
  border-radius: 12px;
  border: 2px solid #e5e5e5;
}

.stage-checkboxes label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: bold;
  color: #555;
  cursor: pointer;
  margin-bottom: 0;
}

.stage-checkboxes input {
  width: 18px;
  height: 18px;
  accent-color: #1cb0f6;
  cursor: pointer;
}

.question-item {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background: #ffffff;
  border: 2px solid #e5e5e5;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.question-item:hover {
  border-color: #1cb0f6;
  transform: translateY(-2px);
}

.question-item.active {
  border-color: #1cb0f6;
  background: #e6f7ff;
  box-shadow: 0 4px 12px rgba(28, 176, 246, 0.1);
}

.q-index {
  font-size: 0.75rem;
  color: #1cb0f6;
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 6px;
}

.q-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: 20px;
}

.q-noun {
  font-weight: bold;
  color: #333;
  font-size: 1.05rem;
}

.q-desc {
  font-size: 0.85rem;
  color: #777;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.q-type-tag {
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 4px;
  color: white;
}

.q-type-tag.standard {
  background: #1cb0f6;
}

.q-type-tag.contrast {
  background: #ff9800;
}

.q-type-tag.chunk {
  background: #9c27b0;
}

.q-mode-tag {
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: bold;
}

.q-mode-tag.build {
  background: #e6f7ff;
  color: #1cb0f6;
  border: 1px solid #1cb0f6;
}

.q-mode-tag.reduce {
  background: #f3e8ff;
  color: #9333ea;
  border: 1px solid #9333ea;
}

.q-time-tag {
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 4px;
  background: #ffe6e6;
  color: #ff4b4b;
}

.q-free-tag {
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 4px;
  background: #e6f7e6;
  color: #58cc02;
}

.q-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
  border-top: 1px dashed #eee;
  padding-top: 12px;
}

.btn-push {
  background: #e6f7ff;
  color: #1cb0f6;
  border: 2px solid #1cb0f6;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 0.85rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-push:hover {
  background: #1cb0f6;
  color: white;
}

.btn-delete {
  background: #ffdfe0;
  color: #ff4b4b;
  border: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-delete:hover {
  background: #ff4b4b;
  color: white;
}

.btn-new {
  padding: 16px;
  background: transparent;
  border: 2px dashed #ccc;
  border-radius: 16px;
  color: #777;
  font-weight: bold;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-new:hover {
  background: #f0fff0;
  border-color: #58cc02;
  color: #58cc02;
}

.btn-new.active {
  background: #f0fff0;
  border-color: #58cc02;
  color: #58cc02;
}

.btn-close {
  width: 100%;
  padding: 16px;
  background: #1cb0f6;
  color: white;
  border: none;
  border-bottom: 4px solid #1899d6;
  border-radius: 16px;
  font-weight: bold;
  font-size: 1.05rem;
  cursor: pointer;
  transition: all 0.1s;
}

.btn-close:active {
  border-bottom-width: 0;
  transform: translateY(4px);
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

.btn-save:disabled {
  opacity: 0.6;
  cursor: wait;
}

.grammar-chunk-row {
  display: grid;
  grid-template-columns: minmax(100px, 1fr) auto minmax(100px, 1fr);
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
}

.grammar-chunk-row label {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 0;
  white-space: nowrap;
}

.grammar-chunk-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 14px;
  border: 1px solid #d6e5f1;
  border-radius: 12px;
  background: #f7fbff;
}

.grammar-recommendation {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 20px;
  padding: 14px 16px;
  border: 1px solid #bae6fd;
  border-radius: 12px;
  background: #f0f9ff;
  color: #0c4a6e;
}

.grammar-recommendation p {
  margin: 0;
  color: #334155;
}

.grammar-recommendation span,
.grammar-recommendation small {
  color: #475569;
  line-height: 1.5;
}

.grammar-recommendation small {
  color: #7c3aed;
  font-weight: 700;
}

.legacy-recommendation {
  border-color: #e2e8f0;
  background: #f8fafc;
}

.grammar-chunk-chip {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 6px 12px;
  border: 1px solid #b9ddf1;
  border-radius: 999px;
  background: #e8f6ff;
  color: #155e87;
  font-weight: 700;
}

.grammar-chunk-chip.morph-chip {
  border-color: #d3b5f2;
  background: #f4eaff;
  color: #7136a7;
}

.grammar-error {
  margin: 10px 0 0;
  font-weight: 600;
  color: #d32f2f;
}

.ghost {
  opacity: 0.5;
  background: #c8ebfb;
  border: 2px dashed #1cb0f6;
}

.segmented-control {
  display: flex;
  background: #f0f0f0;
  border-radius: 12px;
  padding: 4px;
}

.segmented-control button {
  flex: 1;
  padding: 10px;
  border: none;
  background: transparent;
  border-radius: 8px;
  font-weight: bold;
  color: #777;
  cursor: pointer;
  transition: all 0.2s;
}

.segmented-control button.active {
  background: white;
  color: #1cb0f6;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.distractor-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  background: #f9f9f9;
  padding: 12px;
  border-radius: 12px;
  border: 2px solid #e5e5e5;
}

.distractor-tags button {
  background: white;
  border: 2px solid #ccc;
  color: #777;
  padding: 6px 16px;
  border-radius: 20px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.distractor-tags button:hover {
  border-color: #1cb0f6;
  color: #1cb0f6;
}

.distractor-tags button.active {
  background: #e6f7ff;
  border-color: #1cb0f6;
  color: #1cb0f6;
  box-shadow: 0 2px 4px rgba(28, 176, 246, 0.2);
}

.distractor-tags .divider {
  width: 2px;
  height: 20px;
  background: #e5e5e5;
  margin: 0 4px;
}

.funnel-preview {
  background: #f0f4f8;
  border: 2px dashed #cbd5e1;
  border-radius: 16px;
  padding: 16px 24px;
  margin-bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  animation: fadeIn 0.3s ease;
}

.funnel-title {
  font-weight: bold;
  color: #475569;
  font-size: 0.9rem;
  margin-bottom: 4px;
}

.funnel-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.funnel-label {
  font-size: 0.85rem;
  color: #64748b;
  width: 100px;
  flex-shrink: 0;
}

.funnel-input-kept {
  padding: 8px 16px;
  border-radius: 8px;
  font-weight: bold;
  font-size: 1.05rem;
  flex: 1;
  background: #dcfce7;
  color: #166534;
  border: 1px solid #bbf7d0;
  outline: none;
  transition: all 0.2s;
}

.funnel-input-kept:focus {
  border-color: #58cc02;
  background: white;
  box-shadow: 0 0 0 4px rgba(88, 204, 2, 0.2);
}

.funnel-value.discarded {
  padding: 8px 16px;
  border-radius: 8px;
  font-weight: bold;
  font-size: 1.05rem;
  flex: 1;
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
  text-decoration: line-through;
  opacity: 0.7;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 760px) {
  .admin-layout {
    width: 96vw;
    height: 94vh;
    flex-direction: column;
  }

  .sidebar {
    width: 100%;
    height: auto;
    max-height: 36vh;
    border-right: 0;
    border-bottom: 2px solid #e5e5e5;
  }

  .sidebar-header {
    padding: 12px 16px;
  }

  .sidebar-section {
    min-height: 0;
  }

  .question-list {
    padding: 8px 12px;
  }

  .question-item {
    padding: 10px;
  }

  .editor {
    flex: 1;
    min-height: 0;
  }

  .editor-header,
  .editor-body {
    padding: 14px 18px;
  }

  .grammar-chunk-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .grammar-chunk-row input[aria-label="變形選項"] {
    grid-column: 1 / -1;
  }
}

@media (max-width: 500px) {
  .admin-layout {
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    border-radius: 0;
  }

  .sidebar {
    max-height: 32vh;
  }

  .editor-header,
  .editor-body {
    padding: 10px 12px;
  }

  .type-switcher {
    flex-wrap: wrap;
  }

  .type-switcher button {
    min-width: 42%;
    font-size: 0.8rem;
  }

  .form-row {
    flex-direction: column;
    gap: 8px;
  }
}
</style>