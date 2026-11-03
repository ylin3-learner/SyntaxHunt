<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import type { Chunk, QuestionData, UIMode } from '../rules/types';
import { CloudDatabase } from '../services/CloudDatabase';
import { VueDraggable } from 'vue-draggable-plus';
import { useClassroomSync } from '../composables/useClassroomSync';

const props = defineProps<{ currentQuestions: QuestionData[]; }>();

const enabledStages = ref<('input' | 'macro' | 'micro' | 'pronunciation' | 'noticing')[]>(['input', 'macro', 'micro', 'pronunciation', 'noticing']);
const questionMode = ref<'build' | 'reduce'>('build');
const uiMode = ref<UIMode>('BUILD');
const grammarSentence = ref('');
const grammarAnswer = ref('');
const grammarChunks = ref<Chunk[]>([]);
const isDecomposing = ref(false);
const isPreparingCache = ref(false);
const grammarError = ref('');
const cacheStatus = ref('');
const isQuestionsExpanded = ref(true);

// 👈 新增：控制班級控制面板的收合狀態
const isClassPanelExpanded = ref(true);

const speechRate = ref<number>(0.8);

const isTimedForm = ref(false);
const timeLimitForm = ref<number>(60);

const isClassModeToggle = ref(false);
const targetCountInput = ref(30);
const { updateClassMode, sendResetProgress } = useClassroomSync();

// 當題目模式切換為 Reduce 時，自動移除巨觀拖拉 (macro) 階段
watch(questionMode, (newMode) => {
  if (newMode === 'reduce') {
    enabledStages.value = enabledStages.value.filter(stage => stage !== 'macro');
  } else if (newMode === 'build' && !enabledStages.value.includes('macro')) {
    enabledStages.value.unshift('macro'); // 切回 Build 時加回來
  }
});

const emit = defineEmits<{
  (e: 'update', questions: QuestionData[]): void;
  (e: 'sync-local', questions: QuestionData[]): void;
  (e: 'push', id: string): void;
  (e: 'close'): void;
}>();

const localQuestions = ref<QuestionData[]>(JSON.parse(JSON.stringify(props.currentQuestions)));

const editingId = ref<string | null>(null);
const questionType = ref<'standard' | 'contrast' | 'chunk' | 'grammar'>('standard');
const imageUrl = ref('');
const distractorImageUrl = ref('');
const targetNoun = ref('');
const relativeSentence = ref('');
const prepositionSentence = ref('');
const funnelDiscarded = computed(() =>
  relativeSentence.value.replace(/\[[^\]]+\]/g, '').replace(/\s+/g, ' ').trim()
);
const tagsInput = ref('');
const chineseSentence = ref('');
const chineseHighlight = ref('');
const modifierImageUrl = ref('');
const puzzleLayout = ref<'modifier-left' | 'modifier-right'>('modifier-left');
const distractorsInput = ref('');
const explanationTitle = ref('');
const explanationDesc = ref('');
const clozePrefix = ref('');
const clozeSuffix = ref('');
const chunkZhInput = ref('');
const chunkQuizInput = ref('');
const antecedentNumber = ref<'singular' | 'plural'>('singular');

const correctLabel = ref('');
const distractorLabel = ref('');

const fileInput = ref<HTMLInputElement | null>(null);
const distractorFileInput = ref<HTMLInputElement | null>(null);
const modifierFileInput = ref<HTMLInputElement | null>(null);
const uploadTarget = ref<'noun' | 'distractor' | 'modifier'>('noun');
const activeUploadTarget = ref<'noun' | 'distractor' | 'modifier' | null>(null);
const isEditing = computed(() => editingId.value !== null);

const handleModeChange = () => {
  const pwd = sessionStorage.getItem('admin_auth') ? 'admin123' : '';
  updateClassMode(isClassModeToggle.value, targetCountInput.value, pwd);
};

const resetForm = () => {
  grammarSentence.value = ''; grammarAnswer.value = ''; grammarChunks.value = [];
  uiMode.value = 'BUILD'; grammarError.value = ''; cacheStatus.value = '';
  chunkZhInput.value = ''; chunkQuizInput.value = ''; distractorImageUrl.value = '';
  correctLabel.value = ''; distractorLabel.value = '';
  antecedentNumber.value = 'singular'; speechRate.value = 0.8;
  isTimedForm.value = false; timeLimitForm.value = 60;
  editingId.value = null; questionType.value = 'standard'; questionMode.value = 'build';
  enabledStages.value = ['input', 'macro', 'micro', 'pronunciation', 'noticing'];
  imageUrl.value = ''; targetNoun.value = ''; relativeSentence.value = ''; prepositionSentence.value = '';
  tagsInput.value = ''; chineseSentence.value = ''; chineseHighlight.value = ''; modifierImageUrl.value = '';
  puzzleLayout.value = 'modifier-left'; distractorsInput.value = ''; explanationTitle.value = '';
  explanationDesc.value = ''; clozePrefix.value = ''; clozeSuffix.value = '';
  activeUploadTarget.value = null;
};

const editQuestion = (q: QuestionData) => {
  if (q.type === 'grammar') {
    editingId.value = q.id;
    questionType.value = 'grammar';
    uiMode.value = q.ui_mode || 'BUILD';
    targetNoun.value = q.targetNoun;
    antecedentNumber.value = q.antecedent.number || 'singular';
    imageUrl.value = q.imageUrl || '';
    speechRate.value = q.speechRate || 0.8;
    isTimedForm.value = !!q.isTimed;
    timeLimitForm.value = q.timeLimit || 60;
    tagsInput.value = q.tags?.join(', ') || '';
    grammarAnswer.value = (q.correctAnswer || []).join(' ');
    grammarChunks.value = JSON.parse(JSON.stringify(q.chunks || []));
    grammarSentence.value = grammarChunks.value.map(chunk => chunk.text).join(' ');
    enabledStages.value = q.enabledStages || ['micro'];
    grammarError.value = '';
    cacheStatus.value = '';
    activeUploadTarget.value = null;
    return;
  }

  chunkZhInput.value = q.previewData?.chunkZh || '';
  chunkQuizInput.value = q.previewData?.quizOptions ? q.previewData.quizOptions.filter(o => !o.isCorrect).map(o => o.text).join(', ') : '';
  distractorImageUrl.value = q.inputData?.options.find(o => !o.isCorrect)?.image || '';
  correctLabel.value = q.inputData?.options.find(o => o.isCorrect)?.text || '';
  distractorLabel.value = q.inputData?.options.find(o => !o.isCorrect)?.text || '';

  editingId.value = q.id; questionType.value = q.type; questionMode.value = q.mode || 'build';
  enabledStages.value = q.enabledStages || ['input', 'macro', 'micro', 'pronunciation', 'noticing'];
  imageUrl.value = q.imageUrl || q.previewData?.targetImage || q.contrastData?.nounImage || '';
  targetNoun.value = q.targetNoun;
  antecedentNumber.value = q.antecedent.number || 'singular';
  speechRate.value = q.speechRate || 0.8;

  isTimedForm.value = !!q.isTimed;
  timeLimitForm.value = q.timeLimit || 60;

  relativeSentence.value = q.grammarFeature?.relative.label || '';
  prepositionSentence.value = q.grammarFeature?.preposition.label || '';
  tagsInput.value = q.tags?.join(', ') || '';
  distractorsInput.value = q.grammarFeature?.relative.distractors?.join(', ') || '';
  explanationTitle.value = q.explanation?.title || ''; explanationDesc.value = q.explanation?.desc || '';

  if (q.contextCloze) { clozePrefix.value = q.contextCloze.prefix; clozeSuffix.value = q.contextCloze.suffix; }
  if (q.contrastData) {
    chineseSentence.value = q.contrastData.chineseSentence; chineseHighlight.value = q.contrastData.chineseHighlight;
    modifierImageUrl.value = q.contrastData.modifierImage; puzzleLayout.value = q.contrastData.layout || 'modifier-left';
  }
  activeUploadTarget.value = null;
};

const decomposeGrammarSentence = async () => {
  const sentence = grammarSentence.value.trim();
  if (!sentence) {
    grammarError.value = '請先輸入英文句子。';
    return;
  }

  isDecomposing.value = true;
  grammarError.value = '';
  try {
    const correctAnswer = (grammarAnswer.value || sentence).trim().split(/\s+/);
    const chunks = await CloudDatabase.decomposeGrammarSentence(sentence, uiMode.value, correctAnswer);
    grammarChunks.value = chunks.map((chunk, index) => ({
      id: `${editingId.value || 'new'}-chunk-${index}-${Date.now()}`,
      text: chunk.text,
      draggable: chunk.draggable ?? true,
      can_morph: chunk.can_morph ?? false,
      morph_options: chunk.morph_options || [],
    }));
    cacheStatus.value = '';
  } catch (error) {
    grammarError.value = error instanceof Error ? error.message : '字塊拆解失敗，請稍後再試。';
  } finally {
    isDecomposing.value = false;
  }
};

const splitGrammarSentenceManually = () => {
  const words = grammarSentence.value.trim().split(/\s+/).filter(Boolean);
  grammarChunks.value = words.map((text, index) => ({
    id: `${editingId.value || 'new'}-manual-${index}`,
    text,
    draggable: true,
    can_morph: false,
    morph_options: [],
  }));
  grammarError.value = '';
  cacheStatus.value = '';
};

const prepareQuestionDiagnosis = async (id: string) => {
  const question = localQuestions.value.find(item => item.id === id);
  if (!question) return;
  isPreparingCache.value = true;
  cacheStatus.value = '';
  grammarError.value = '';
  try {
    const count = await CloudDatabase.prepareDiagnosisCache(question);
    cacheStatus.value = `已建立 ${count} 組常見錯誤診斷快取。`;
  } catch (error) {
    grammarError.value = error instanceof Error ? error.message : '錯誤矩陣建立失敗。';
  } finally {
    isPreparingCache.value = false;
  }
};

const updateMorphOptions = (chunk: Chunk, event: Event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  chunk.morph_options = input.value.split(',').map(value => value.trim()).filter(Boolean);
};

const deleteQuestion = (id: string) => {
  if (confirm('確定要刪除這道題目嗎？')) {
    localQuestions.value = localQuestions.value.filter(q => q.id !== id);
    if (editingId.value === id) resetForm();
  }
};

const triggerUpload = (target: 'noun' | 'distractor' | 'modifier') => {
  activeUploadTarget.value = target; uploadTarget.value = target;
  if (target === 'noun') fileInput.value?.click();
  else if (target === 'distractor') distractorFileInput.value?.click();
  else modifierFileInput.value?.click();
};

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) processImage(file, uploadTarget.value);
  activeUploadTarget.value = null;
};

const handlePaste = (event: ClipboardEvent) => {
  const items = event.clipboardData?.items;
  if (!items) return;
  let hasImage = false;
  for (const item of items) { if (item.type.indexOf('image') !== -1) hasImage = true; }
  if (!hasImage) return;
  if (!activeUploadTarget.value) { alert('請先點擊圖片框框，再按貼上喔！'); event.preventDefault(); return; }
  for (const item of items) {
    if (item.type.indexOf('image') !== -1) {
      const file = item.getAsFile();
      if (file) { processImage(file, activeUploadTarget.value); event.preventDefault(); break; }
    }
  }
};

onMounted(() => { window.addEventListener('paste', handlePaste); });
onUnmounted(() => { window.removeEventListener('paste', handlePaste); });

const processImage = (file: File, target: 'noun' | 'distractor' | 'modifier') => {
  if (file.size > 2 * 1024 * 1024) { alert('圖片太大囉！請上傳小於 2MB 的圖片。'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      const maxSize = 800;
      if (width > height && width > maxSize) { height = (height * maxSize) / width; width = maxSize; }
      else if (height > maxSize) { width = (width * maxSize) / height; height = maxSize; }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d'); ctx?.drawImage(img, 0, 0, width, height);
      const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
      if (target === 'noun') imageUrl.value = compressedBase64;
      else if (target === 'distractor') distractorImageUrl.value = compressedBase64;
      else modifierImageUrl.value = compressedBase64;
      activeUploadTarget.value = null;
    };
    img.src = e.target?.result as string;
  };
  reader.readAsDataURL(file);
};

const generateTiles = (sentence: string) => {
  const regex = /\[([^\]]+)\]|([^\s]+)/g;
  const tiles: string[] = [];
  let match;
  while ((match = regex.exec(sentence)) !== null) {
    if (match[1]) tiles.push(`[${match[1]}]`);
    else if (match[2]) tiles.push(match[2]);
  }
  return tiles;
};

const toggleDistractor = (word: string) => {
  let current = distractorsInput.value.split(/[,，\s]+/).filter(Boolean);
  if (current.includes(word)) {
    current = current.filter(w => w !== word);
  } else {
    current.push(word);
  }
  distractorsInput.value = current.join(', ');
};

const isDistractorActive = (word: string) => {
  return distractorsInput.value.split(/[,，\s]+/).includes(word);
};

const saveQuestion = () => {
  if (questionType.value === 'grammar') {
    const source = grammarSentence.value.trim();
    const answer = (grammarAnswer.value || source).trim();
    if (!source || !answer) {
      grammarError.value = '請填寫題目句子與正確答案。';
      return;
    }

    const question: QuestionData = {
      id: editingId.value || `q_${Date.now()}`,
      type: 'grammar',
      ui_mode: uiMode.value,
      targetNoun: targetNoun.value.trim() || source.split(/\s+/)[0],
      antecedent: {
        noun: targetNoun.value.trim() || source.split(/\s+/)[0],
        number: antecedentNumber.value,
        person: 'person',
      },
      chunks: grammarChunks.value.length > 0
        ? grammarChunks.value
        : source.split(/\s+/).filter(Boolean).map((text, index) => ({
          id: `${editingId.value || 'new'}-chunk-${index}`,
          text,
          draggable: true,
        })),
      correctAnswer: answer.split(/\s+/).filter(Boolean),
      enabledStages: ['micro'],
      imageUrl: imageUrl.value || undefined,
      tags: tagsInput.value.split(/[,，\s]+/).filter(Boolean),
      speechRate: speechRate.value,
      isTimed: isTimedForm.value,
      timeLimit: isTimedForm.value ? timeLimitForm.value : undefined,
      explanation: explanationTitle.value || explanationDesc.value
        ? { title: explanationTitle.value, desc: explanationDesc.value }
        : undefined,
    };

    if (isEditing.value) {
      const index = localQuestions.value.findIndex(item => item.id === editingId.value);
      if (index !== -1) localQuestions.value[index] = question;
    } else {
      localQuestions.value.push(question);
    }
    resetForm();
    return;
  }

  if (!targetNoun.value) { alert('請填寫目標名詞！'); return; }
  if (questionType.value !== 'chunk' && !relativeSentence.value) { alert('請填寫關係子句！'); return; }
  if (!imageUrl.value || imageUrl.value.includes('dicebear.com')) { alert('請務必上傳真實的「主要圖片」！'); return; }
  if (questionMode.value === 'reduce' && !prepositionSentence.value) { alert('請在漏斗中填寫簡化後的片語！'); return; }

  // 1. 產生原句的字磚 (例如: who, is, [a blue uniform])
  const relCorrect = generateTiles(relativeSentence.value || '');

  // 2. 處理迷思干擾磚
  let distractors = distractorsInput.value.split(/[,，\s]+/).filter(Boolean);
  if (distractors.length === 0 && questionType.value !== 'chunk') {
    const correctWords = relCorrect.map(w => w.replace(/[\[\]]/g, '').toLowerCase());
    if (correctWords.includes('who') || correctWords.includes('which')) distractors.push('she', 'it');
    if (correctWords.includes('wears') || correctWords.includes('has')) distractors.push('wear', 'have');
    distractors = [...new Set(distractors)].filter(d => !correctWords.includes(d.toLowerCase()));
  }

  // 3. 合併字磚池 (原句字磚 + 干擾磚)，這就是學生一開始會看到的字磚
  let finalTiles = [...relCorrect, ...distractors];
  finalTiles = [...new Set(finalTiles)]; // 去重
  finalTiles.sort(() => Math.random() - 0.5); // 打亂

  // 4. 產生簡化句的字磚 (例如: [in a blue uniform])
  const prepTiles = generateTiles(prepositionSentence.value || '');
  const prepCorrect = [...prepTiles];
  prepTiles.sort(() => Math.random() - 0.5);

  const newQuestion: QuestionData = {
    id: editingId.value || `q_${Date.now()}`,
    type: questionType.value, mode: questionMode.value, enabledStages: enabledStages.value,
    targetNoun: targetNoun.value,
    antecedent: { noun: targetNoun.value, number: antecedentNumber.value, person: targetNoun.value.toLowerCase().includes('cat') || targetNoun.value.toLowerCase().includes('pin') || targetNoun.value.toLowerCase().includes('table') ? 'thing' : 'person' },
    imageUrl: imageUrl.value,
    tags: tagsInput.value.split(/[,，\s]+/).filter(Boolean),
    speechRate: speechRate.value,
    isTimed: isTimedForm.value,
    timeLimit: isTimedForm.value ? timeLimitForm.value : undefined,
    grammarFeature: {
      // 👈 關鍵：relative 的 tiles 保留原句+干擾磚，correctAnswer 保留原句
      relative: { label: relativeSentence.value || '', tiles: finalTiles, correctAnswer: relCorrect, distractors },
      // 👈 關鍵：preposition 的 tiles 和 correctAnswer 都是簡化後的答案
      preposition: { label: prepositionSentence.value || '', tiles: prepTiles, correctAnswer: prepCorrect }
    },
    explanation: { title: explanationTitle.value, desc: explanationDesc.value },
  };

  if (questionType.value === 'standard') {
    let audioText = '';
    if (clozePrefix.value || clozeSuffix.value) {
      const prefix = clozePrefix.value || targetNoun.value;
      const suffix = clozeSuffix.value || 'is my favorite.';
      audioText = `${prefix} ${relativeSentence.value.replace(/[\[\]]/g, '')} ${suffix}`.replace(/\s+/g, ' ').trim();
    } else {
      audioText = `${targetNoun.value} ${relativeSentence.value.replace(/[\[\]]/g, '')} is my favorite.`;
    }

    newQuestion.inputData = {
      audioText: audioText,
      options: [
        { image: imageUrl.value, text: correctLabel.value || '', isCorrect: true },
        { image: distractorImageUrl.value || '', text: distractorLabel.value || '', isCorrect: false }
      ]
    };
    newQuestion.noticingData = {
      examples: [audioText],
      question: `請觀察以上句子，關係代名詞 who 代替的是什麼？`,
      options: [{ text: '事物（Things）', isCorrect: false }, { text: '人（People）', isCorrect: true }],
      explanation: `沒錯！當先行詞是「人」的時候，我們使用 who 來引導關係子句。`
    };
    if ((clozePrefix.value || clozeSuffix.value)) newQuestion.contextCloze = { prefix: clozePrefix.value, suffix: clozeSuffix.value };
  }

  if (questionType.value === 'contrast') {
    newQuestion.contrastData = {
      chineseSentence: chineseSentence.value || '中文句子', chineseHighlight: chineseHighlight.value || '高亮部分',
      nounImage: imageUrl.value,
      modifierImage: modifierImageUrl.value || '',
      layout: puzzleLayout.value
    };
  }

  if (questionType.value === 'chunk' || (chunkZhInput.value && questionType.value === 'standard')) {
    const chunkMatch = relativeSentence.value.match(/\[([^\]]+)\]/);
    const chunkText = chunkMatch ? chunkMatch[1] : relativeSentence.value;
    let quizOpts = chunkQuizInput.value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    if (quizOpts.length === 0) quizOpts = ['look for it', 'look at it'];

    newQuestion.previewData = {
      targetImage: imageUrl.value,
      targetNoun: targetNoun.value,
      chunkText: chunkText,
      chunkZh: chunkZhInput.value || '（請填寫中文意思）',
      quizOptions: [
        { text: chunkText, isCorrect: true },
        ...quizOpts.map(t => ({ text: t, isCorrect: false }))
      ].sort(() => Math.random() - 0.5)
    };
  }

  console.log('👩‍🏫 老師儲存題目，產生的資料:', JSON.parse(JSON.stringify(newQuestion)));

  if (isEditing.value) {
    const index = localQuestions.value.findIndex(q => q.id === editingId.value);
    if (index !== -1) localQuestions.value[index] = newQuestion;
  } else {
    localQuestions.value.push(newQuestion);
  }
  resetForm();
};

const handleSaveAndPush = (id: string) => {
  if (editingId.value === id) {
    saveQuestion();
  }
  setTimeout(() => {
    emit('sync-local', localQuestions.value);
    emit('push', id);
  }, 50);
};

const saveAllAndClose = () => {
  if (localQuestions.value.length === 0) { alert('題庫不能為空，請至少保留一題。'); return; }
  emit('update', localQuestions.value);
  emit('close');
};
</script>

<template>
  <Teleport to="body">
    <div class="admin-modal">
      <div class="admin-layout">
        <!-- 左側邊欄 -->
        <div class="sidebar">
          <!-- 1. 固定頭部 -->
          <div class="sidebar-header">
            <h2>📚 課前備課中心</h2>
            <p>點擊題目編輯，或點擊「發送」讓全班跳轉。</p>
          </div>

          <!-- 2. 可折疊的班級控制 -->
          <div class="class-mode-panel">
            <div class="panel-header" @click="isClassPanelExpanded = !isClassPanelExpanded">
              <h3>⚙️ 班級控制</h3>
              <span class="toggle-icon">{{ isClassPanelExpanded ? '▲' : '▼' }}</span>
            </div>

            <div v-show="isClassPanelExpanded" class="panel-content">
              <div class="mode-toggle">
                <label>
                  <input type="checkbox" v-model="isClassModeToggle" @change="handleModeChange" />
                  🎓 上課模式 (鎖定學生進度)
                </label>
              </div>
              <div class="target-count">
                <label>目標人數：</label>
                <input type="number" v-model.number="targetCountInput" @change="handleModeChange" />
              </div>
              <button class="btn-reset-progress" @click="sendResetProgress">
                🔄 重置全班作答進度
              </button>
            </div>
          </div>

          <!-- 3. 可折疊的列表區塊 -->
          <div class="sidebar-section">
            <div class="section-header" @click="isQuestionsExpanded = !isQuestionsExpanded">
              <h3>📝 題目列表</h3>
              <span class="toggle-icon">{{ isQuestionsExpanded ? '▲' : '▼' }}</span>
            </div>
            <div class="list-wrapper" v-show="isQuestionsExpanded">
              <div class="question-list">
                <VueDraggable v-model="localQuestions" :animation="150" ghostClass="ghost" handle=".drag-handle"
                  class="question-list-inner">
                  <div v-for="(q, index) in localQuestions" :key="q.id" class="question-item"
                    :class="{ active: editingId === q.id }" @click="editQuestion(q)">

                    <div class="q-index">
                      <div class="drag-handle" title="按住拖曳排序">⋮⋮</div>
                      第 {{ index + 1 }} 關
                      <span class="q-type-tag" :class="q.type">
                        {{ q.type === 'contrast' ? '對比題' : q.type === 'chunk' ? '片語題' : '標準題' }}
                      </span>
                      <span v-if="q.type === 'standard'" class="q-mode-tag" :class="q.mode || 'build'">
                        {{ (q.mode || 'build') === 'reduce' ? 'Reduce' : 'Build' }}
                      </span>
                      <span v-if="q.isTimed" class="q-time-tag">🔴 {{ q.timeLimit || 60 }}s</span>
                      <span v-else class="q-free-tag">🟢 自由</span>
                    </div>
                    <div class="q-content">
                      <span class="q-noun">{{ q.targetNoun }}</span>
                      <span class="q-desc">{{ q.type === 'grammar' ? (q.correctAnswer || []).join(' ') : q.grammarFeature?.relative?.label || '未設定句型' }}</span>
                    </div>

                    <div class="q-actions">
                      <button v-if="q.type === 'grammar'" class="btn-push" :disabled="isPreparingCache"
                        @click.stop="prepareQuestionDiagnosis(q.id)">
                        {{ isPreparingCache ? '建立中...' : '🧠 建錯誤矩陣' }}
                      </button>
                      <button class="btn-push" @click.stop="handleSaveAndPush(q.id)">🚀 發送給全班</button>
                      <button class="btn-delete" @click.stop="deleteQuestion(q.id)" title="刪除">✕</button>
                    </div>
                  </div>
                </VueDraggable>
                <button class="btn-new" @click="resetForm" :class="{ active: editingId === null }">➕ 新增題目</button>
              </div>
            </div>
          </div>

          <!-- 4. 固定底部按鈕 -->
          <div class="sidebar-footer">
            <button class="btn-close" @click="saveAllAndClose">✅ 完成備課，開始上課</button>
          </div>
        </div>

        <!-- 右側編輯器 -->
        <div class="editor">
          <div class="editor-header">
            <h3>{{ isEditing ? '✏️ 編輯題目' : '🆕 新增題目' }}</h3>
            <div class="type-switcher">
              <button :class="{ active: questionType === 'standard' }" @click="questionType = 'standard'">標準題</button>
              <button :class="{ active: questionType === 'contrast' }" @click="questionType = 'contrast'">對比題</button>
              <button :class="{ active: questionType === 'chunk' }" @click="questionType = 'chunk'">片語題</button>
              <button :class="{ active: questionType === 'grammar' }" @click="questionType = 'grammar'">通用文法題</button>
            </div>
          </div>

          <div class="editor-body">
            <template v-if="questionType === 'grammar'">
              <div class="form-group">
                <label>題目 UI 模式</label>
                <div class="type-switcher">
                  <button :class="{ active: uiMode === 'BUILD' }" @click="uiMode = 'BUILD'">BUILD 組句</button>
                  <button :class="{ active: uiMode === 'REDUCE' }" @click="uiMode = 'REDUCE'">REDUCE 刪除</button>
                  <button :class="{ active: uiMode === 'MORPH' }" @click="uiMode = 'MORPH'">MORPH 變形</button>
                </div>
              </div>
              <div class="form-group">
                <label><input v-model="isTimedForm" type="checkbox" /> 限時挑戰</label>
                <input v-if="isTimedForm" v-model.number="timeLimitForm" type="number" min="10" step="10"
                  placeholder="60 秒" />
              </div>
              <div class="form-group">
                <label>{{ uiMode === 'REDUCE' ? '原始完整句子（字塊起始內容）' : '英文句子（字塊來源）' }}</label>
                <input v-model="grammarSentence" type="text" placeholder="例如：The boy went to school yesterday." />
              </div>
              <div class="form-group">
                <label>學生完成時的正確答案</label>
                <input v-model="grammarAnswer" type="text"
                  :placeholder="uiMode === 'REDUCE' ? '例如：The boy to school yesterday.' : '留空則與英文句子相同'" />
              </div>
              <div class="form-group">
                <label>目標名詞與單複數（供診斷規則使用）</label>
                <div class="form-row">
                  <input v-model="targetNoun" type="text" placeholder="例如：The boy" />
                  <select v-model="antecedentNumber" class="grammar-select">
                    <option value="singular">單數</option>
                    <option value="plural">複數</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label>標籤（逗號分隔）</label>
                <input v-model="tagsInput" type="text" placeholder="例如：過去式, 動詞時態" />
              </div>
              <div class="form-group">
                <button class="btn-save" :disabled="isDecomposing" @click="decomposeGrammarSentence">
                  {{ isDecomposing ? 'AI 拆解中...' : '✨ 自動拆解字塊' }}
                </button>
                <button class="btn-push" style="margin-top: 10px;" @click="splitGrammarSentenceManually">
                  以空白拆解（手動設定變形）
                </button>
                <p v-if="grammarError" class="grammar-error" role="alert">{{ grammarError }}</p>
                <p v-if="cacheStatus" class="grammar-status" role="status">{{ cacheStatus }}</p>
              </div>
              <div v-if="grammarChunks.length" class="form-group">
                <label>字塊檢視（可編輯；勾選字塊可設定 MORPH 選項）</label>
                <div v-for="chunk in grammarChunks" :key="chunk.id" class="grammar-chunk-row">
                  <input v-model="chunk.text" type="text" aria-label="字塊文字" />
                  <label><input v-model="chunk.can_morph" type="checkbox" /> 可變形</label>
                  <input v-if="chunk.can_morph" :value="chunk.morph_options?.join(', ')" type="text"
                    placeholder="go, goes, went" aria-label="變形選項"
                    @input="updateMorphOptions(chunk, $event)" />
                </div>
              </div>
            </template>
            <template v-else>
            <div class="form-group" v-if="questionType !== 'chunk'">
              <label>題目節奏</label>
              <div class="segmented-control">
                <button :class="{ active: !isTimedForm }" @click="isTimedForm = false">🟢 自由進度</button>
                <button :class="{ active: isTimedForm }" @click="isTimedForm = true">🔴 限時挑戰</button>
              </div>
            </div>

            <div class="form-group" v-if="isTimedForm && questionType !== 'chunk'">
              <label>⏱️ 限時秒數</label>
              <input type="number" v-model.number="timeLimitForm" placeholder="60" min="10" step="10" />
            </div>

            <div class="form-group" v-if="questionType !== 'chunk'">
              <label>本題教學流程</label>
              <div class="stage-checkboxes">
                <label v-if="questionType === 'standard'"><input type="checkbox" value="input" v-model="enabledStages">
                  聽力輸入</label>
                <label v-if="questionType === 'standard' && questionMode !== 'reduce'">
                  <input type="checkbox" value="macro" v-model="enabledStages"> 巨觀拖拉
                </label>
                <label><input type="checkbox" value="micro" v-model="enabledStages"> 字磚重組</label>
                <label><input type="checkbox" value="pronunciation" v-model="enabledStages"> 語音練習</label>
                <label><input type="checkbox" value="noticing" v-model="enabledStages"> 意識提升</label>
              </div>
            </div>

            <div class="form-group" v-if="questionType === 'standard'">
              <label>題目模式</label>
              <div class="type-switcher">
                <button :class="{ active: questionMode === 'build' }" @click="questionMode = 'build'">一般組句題
                  (Build)</button>
                <button :class="{ active: questionMode === 'reduce' }" @click="questionMode = 'reduce'">關係子句轉換題
                  (Reduce)</button>
              </div>
            </div>

            <div class="form-group">
              <label>TTS 語音速度</label>
              <div class="type-switcher">
                <button :class="{ active: speechRate === 0.5 }" @click="speechRate = 0.5">🐢 慢速 (0.5)</button>
                <button :class="{ active: speechRate === 0.8 }" @click="speechRate = 0.8">🚶 適中 (0.8)</button>
                <button :class="{ active: speechRate === 1.0 }" @click="speechRate = 1.0">🏃 正常 (1.0)</button>
              </div>
            </div>

            <template v-if="questionType === 'chunk'">
              <div class="form-group">
                <label>片語內容 (用 [ ] 包住要測驗的片語)</label>
                <input v-model="relativeSentence" type="text" placeholder="Ex: [looking up words]" />
              </div>
              <div class="form-group">
                <label>片語中文意思</label>
                <input v-model="chunkZhInput" type="text" placeholder="Ex: 查單字" />
              </div>
              <div class="form-group">
                <label>錯誤片語選項 (用逗號隔開，供微測驗用)</label>
                <input v-model="chunkQuizInput" type="text"
                  placeholder="Ex: looking for his pen, looking at the board" />
              </div>
            </template>

            <div class="form-group">
              <label>{{ questionType === 'contrast' ? '名詞圖片 (拼圖右側)' : questionType === 'chunk' ? '片語情境圖片' : '正確角色圖片'
              }}</label>
              <div class="upload-area" :class="{ 'active-upload': activeUploadTarget === 'noun' }"
                @click="triggerUpload('noun')">
                <img v-if="imageUrl" :src="imageUrl" class="preview-img" />
                <div v-else class="upload-placeholder"><span class="icon">📸</span><span>點擊上傳或貼上正確圖片</span></div>
              </div>
              <input ref="fileInput" type="file" accept="image/*" style="display: none" @change="handleFileChange" />
            </div>

            <template v-if="questionType !== 'chunk'">
              <div class="form-group" v-if="questionType === 'standard'">
                <label>干擾圖片 (選填，聽力測驗的錯誤選項圖)</label>
                <div class="upload-area" :class="{ 'active-upload': activeUploadTarget === 'distractor' }"
                  @click="triggerUpload('distractor')">
                  <img v-if="distractorImageUrl" :src="distractorImageUrl" class="preview-img" />
                  <div v-else class="upload-placeholder"><span class="icon">🐱</span><span>點擊上傳干擾圖片</span></div>
                </div>
                <input ref="distractorFileInput" type="file" accept="image/*" style="display: none"
                  @change="handleFileChange" />
              </div>

              <div class="form-group" v-if="questionType === 'contrast'">
                <label>修飾語圖片 (拼圖左側)</label>
                <div class="upload-area" :class="{ 'active-upload': activeUploadTarget === 'modifier' }"
                  @click="triggerUpload('modifier')">
                  <img v-if="modifierImageUrl" :src="modifierImageUrl" class="preview-img" />
                  <div v-else class="upload-placeholder"><span class="icon">🧩</span><span>點擊上傳修飾語圖片</span></div>
                </div>
                <input ref="modifierFileInput" type="file" accept="image/*" style="display: none"
                  @change="handleFileChange" />
              </div>
            </template>

            <div class="form-row">
              <div class="form-group">
                <label>目標名詞</label>
                <input v-model="targetNoun" type="text" placeholder="Ex: The boy" @focus="activeUploadTarget = null" />
              </div>
              <div class="form-group">
                <label>心智圖標籤 (Tags)</label>
                <input v-model="tagsInput" type="text" placeholder="Ex: 穿著與顏色" @focus="activeUploadTarget = null" />
              </div>
            </div>

            <div class="form-group" v-if="questionType !== 'chunk'">
              <label>先行詞單複數 (影響動詞一致性判斷)</label>
              <div class="type-switcher">
                <button :class="{ active: antecedentNumber === 'singular' }" @click="antecedentNumber = 'singular'">單數
                  (Singular)</button>
                <button :class="{ active: antecedentNumber === 'plural' }" @click="antecedentNumber = 'plural'">複數
                  (Plural)</button>
              </div>
            </div>

            <div class="form-group" v-if="questionType !== 'chunk'">
              <label style="display: flex; justify-content: space-between;">
                <span>句型 A：關係子句 (漏斗入口)</span>
                <span v-if="questionMode === 'reduce'" style="color: #1cb0f6; font-size: 0.8rem;">
                  💡 用 [ ] 框住要保留的片語
                </span>
              </label>
              <input v-model="relativeSentence" type="text"
                :placeholder="questionMode === 'reduce' ? 'Ex: who wears [a blue uniform]' : 'Ex: who wears a blue uniform'"
                @focus="activeUploadTarget = null" />
            </div>

            <div v-if="questionType === 'standard' && questionMode === 'reduce'" class="funnel-preview">
              <div class="funnel-title">🔍 系統自動拆解預覽 (可手動修改保留內容)</div>

              <div class="funnel-row">
                <span class="funnel-label" style="color: #166534;">🟢 保留 (簡化句)</span>
                <input v-model="prepositionSentence" type="text" class="funnel-input-kept"
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

            <div class="form-group" v-if="questionType === 'standard' && questionMode === 'reduce'"
              style="display: none;">
              <input v-model="prepositionSentence" type="text" />
            </div>

            <div class="form-group" v-if="questionType === 'standard'">
              <label>迷思干擾磚 (點擊下方標籤快速加入)</label>

              <div class="distractor-tags">
                <button v-for="tag in ['she', 'he', 'it', 'they']" :key="tag"
                  :class="{ active: isDistractorActive(tag) }" @click.prevent="toggleDistractor(tag)">
                  {{ tag }}
                </button>
                <div class="divider"></div>
                <button v-for="tag in ['wear', 'have', 'live', 'look']" :key="tag"
                  :class="{ active: isDistractorActive(tag) }" @click.prevent="toggleDistractor(tag)">
                  {{ tag }}
                </button>
                <div class="divider"></div>
                <button v-for="tag in ['who', 'which']" :key="tag" :class="{ active: isDistractorActive(tag) }"
                  @click.prevent="toggleDistractor(tag)">
                  {{ tag }}
                </button>
              </div>

              <input v-model="distractorsInput" type="text" placeholder="或手動輸入其他干擾磚 (用逗號隔開)" style="margin-top: 12px;"
                @focus="activeUploadTarget = null" />
            </div>

            <div class="form-group" v-if="questionType === 'standard'">
              <label>克漏字上下文 (選填，若填寫將用於 TTS 發音句子)</label>
              <div style="display: flex; gap: 8px; align-items: center;">
                <input v-model="clozePrefix" type="text" placeholder="Ex: The boy" style="flex: 1;"
                  @focus="activeUploadTarget = null" />
                <span style="font-weight: bold; color: #777;">[ 修飾語 ]</span>
                <input v-model="clozeSuffix" type="text" placeholder="Ex: is my brother." style="flex: 1;"
                  @focus="activeUploadTarget = null" />
              </div>
            </div>

            <div class="form-row" v-if="questionType === 'standard'">
              <div class="form-group">
                <label>正確圖下方文字 (選填)</label>
                <input v-model="correctLabel" type="text" placeholder="Ex: who is looking up words"
                  @focus="activeUploadTarget = null" />
              </div>
              <div class="form-group">
                <label>干擾圖下方文字 (選填)</label>
                <input v-model="distractorLabel" type="text" placeholder="Ex: who is looking for his pen"
                  @focus="activeUploadTarget = null" />
              </div>
            </div>

            <template v-if="questionType === 'contrast'">
              <div class="form-group">
                <label>中文句子</label>
                <input v-model="chineseSentence" type="text" placeholder="Ex: 戴藍色帽子的女孩"
                  @focus="activeUploadTarget = null" />
              </div>
              <div class="form-group">
                <label>中文高亮 (修飾語部分)</label>
                <input v-model="chineseHighlight" type="text" placeholder="Ex: 戴藍色帽子的"
                  @focus="activeUploadTarget = null" />
              </div>
              <div class="form-group">
                <label>拼圖排列方向</label>
                <div class="type-switcher">
                  <button :class="{ active: puzzleLayout === 'modifier-left' }"
                    @click="puzzleLayout = 'modifier-left'">佈局 A (修飾語在左)</button>
                  <button :class="{ active: puzzleLayout === 'modifier-right' }"
                    @click="puzzleLayout = 'modifier-right'">佈局 B (修飾語在右)</button>
                </div>
              </div>
              <div class="form-group">
                <label>解釋卡標題</label>
                <input v-model="explanationTitle" type="text" placeholder="Ex: ✨ 你發現了嗎？"
                  @focus="activeUploadTarget = null" />
              </div>
              <div class="form-group">
                <label>解釋卡說明</label>
                <input v-model="explanationDesc" type="text" placeholder="Ex: 修飾語要放在名詞的後面喔！"
                  @focus="activeUploadTarget = null" />
              </div>
            </template>
            </template>
          </div>

          <div class="editor-footer">
            <button v-if="isEditing" class="btn-cancel" @click="resetForm">取消</button>
            <button class="btn-save" @click="saveQuestion">{{ isEditing ? '💾 儲存修改' : '✨ 加入題庫' }}</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* =========================================
   主體佈局與滾動修復 (RWD)
   ========================================= */
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
  max-width: 1000px;
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

/* =========================================
   左側邊欄：嚴格控制 Flexbox 高度
   ========================================= */
.sidebar {
  width: 320px;
  background: #f7f9fc;
  border-right: 2px solid #e5e5e5;
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* 固定區塊 */
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

/* 班級控制面板 (可折疊) */
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

/* 中間可伸縮區塊 */
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

.question-list {
  flex: 1;
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


/* =========================================
   右側編輯器
   ========================================= */
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

/* =========================================
   其他組件樣式保持不變
   ========================================= */
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
  margin-left: auto;
}

.q-free-tag {
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 4px;
  background: #e6f7e6;
  color: #58cc02;
  margin-left: auto;
}

.drag-handle {
  cursor: grab;
  padding: 0 4px;
  font-size: 1.2rem;
  color: #ccc;
  user-select: none;
}

.drag-handle:active {
  cursor: grabbing;
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

.grammar-error,
.grammar-status {
  margin: 10px 0 0;
  font-weight: 600;
}

.grammar-error { color: #d32f2f; }
.grammar-status { color: #388e3c; }

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