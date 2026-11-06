<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import type { CanvasMode, Chunk, GrammarConcept, QuestionData, UIMode } from '../rules/types';
import { getQuestionCanvasMode } from '../rules/types';
import { autoChunk } from '../rules/autoChunk';
import { getGrammarTopic, grammarChapters } from '../rules/grammarTopics';
import { useClassroomSync } from '../composables/useClassroomSync';
import QuestionFlow from './QuestionFlow.vue';
import QuestionListSidebar from './QuestionListSidebar.vue';
import QuestionEditor from './QuestionEditor.vue';
import EditorFormFields from './EditorFormFields.vue';

const props = defineProps<{ currentQuestions: QuestionData[]; }>();

const enabledStages = ref<('input' | 'macro' | 'micro' | 'pronunciation' | 'noticing')[]>(['input', 'macro', 'micro', 'pronunciation', 'noticing']);
const questionMode = ref<'build' | 'reduce'>('build');
const uiMode = ref<UIMode>('BUILD');
const grammarConcept = ref<GrammarConcept>('SENTENCE_PATTERN');
const grammarSentence = ref('');
const grammarAnswer = ref('');
const grammarChunks = ref<Chunk[]>([]);
const grammarError = ref('');
const selectedCanvasMode = ref<CanvasMode>('BUILD');
const statusGap = ref(1);
const npcLabel = ref('');
const matrixXInput = ref('👤 主詞是人, 🤖 主詞是物 / It');
const matrixYInput = ref('⏳ 花費時間, 💰 花費金錢');
const matrixCorrectX = ref(1);
const matrixCorrectY = ref(1);
const matrixPrompt = ref('');
const matrixAnswer = ref('');
const matrixOptionsInput = ref('spend, cost, take, pay');
const advancedSettingsExpanded = ref(false);
const selectedChapter = ref(19);
const selectedGrammarTopicId = ref('sentence-patterns');
const editingGrammarTopicId = ref<string | undefined>();
const topicsInSelectedChapter = computed(() =>
  grammarChapters.find(chapter => chapter.number === selectedChapter.value)?.topics ?? []
);
const selectedGrammarTopic = computed(() => getGrammarTopic(selectedGrammarTopicId.value));
const recommendedUiLabel = computed(() => {
  const topic = selectedGrammarTopic.value;
  if (!topic) return '';
  return ({
    BUILD: 'BUILD 磁吸插槽',
    MORPH: 'MORPH 摺紙變形',
    REDUCE: 'REDUCE 碎紙機',
    MATRIX_GATE: 'MATRIX_GATE 特徵解鎖',
    PRAGMATIC_HP: 'PRAGMATIC_HP 語情血條',
    GRAVITY_SWITCH: 'GRAVITY_SWITCH 重力切換',
  } satisfies Record<CanvasMode, string>)[topic.defaultCanvasMode];
});
const isQuestionsExpanded = ref(true);
const showQuestionFlow = ref(false);

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
  (e: 'batch-import', questions: QuestionData[]): void;
  (e: 'sync-local', questions: QuestionData[]): void;
  (e: 'push', id: string): void;
  (e: 'close'): void;
}>();

const localQuestions = ref<QuestionData[]>(JSON.parse(JSON.stringify(props.currentQuestions)));
watch(() => props.currentQuestions, (questions) => {
  if (localQuestions.value.length === 0 && questions.length > 0) {
    localQuestions.value = JSON.parse(JSON.stringify(questions));
  }
}, { deep: true });

type QuestionFilter = 'all' | 'unclassified' | `unit:${string}`;
const unitFilter = ref<QuestionFilter>('all');
const unitName = ref('');
const availableUnits = computed(() => [...new Set(
  localQuestions.value
    .map(question => typeof question.unit === 'string' ? question.unit.trim() : '')
    .filter(Boolean)
)].sort((a, b) => a.localeCompare(b)));
const filteredQuestions = computed(() => {
  if (unitFilter.value === 'all') return localQuestions.value;
  if (unitFilter.value === 'unclassified') {
    return localQuestions.value.filter(question => typeof question.unit !== 'string' || !question.unit.trim());
  }
  const selectedUnit = unitFilter.value.slice('unit:'.length);
  return localQuestions.value.filter(question =>
    typeof question.unit === 'string' && question.unit.trim() === selectedUnit
  );
});

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
const antecedentPerson = ref<'person' | 'thing'>('person');

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

const applyGrammarTopic = (topicId: string) => {
  const topic = getGrammarTopic(topicId);
  if (!topic) return;
  selectedGrammarTopicId.value = topic.id;
  selectedChapter.value = topic.chapter;
  grammarConcept.value = topic.concept;
  uiMode.value = topic.mode;
  selectedCanvasMode.value = topic.defaultCanvasMode;
  grammarChunks.value = [];
  grammarError.value = '';
};

const handleChapterChange = () => {
  const firstTopic = topicsInSelectedChapter.value[0];
  if (firstTopic) applyGrammarTopic(firstTopic.id);
};

const handleCanvasModeChange = () => {
  uiMode.value = getCanvasUIMode(selectedCanvasMode.value);
  grammarError.value = '';
};

const getCanvasUIMode = (mode: CanvasMode): UIMode => {
  if (mode === 'REDUCE') return 'REDUCE';
  if (mode === 'MORPH' || mode === 'GRAVITY_SWITCH') return 'MORPH';
  return 'BUILD';
};

const resetForm = () => {
  grammarSentence.value = ''; grammarAnswer.value = ''; grammarChunks.value = [];
  selectedCanvasMode.value = 'BUILD'; statusGap.value = 1; npcLabel.value = '';
  matrixXInput.value = '👤 主詞是人, 🤖 主詞是物 / It';
  matrixYInput.value = '⏳ 花費時間, 💰 花費金錢';
  matrixCorrectX.value = 1; matrixCorrectY.value = 1;
  matrixPrompt.value = ''; matrixAnswer.value = ''; matrixOptionsInput.value = 'spend, cost, take, pay';
  unitName.value = '';
  selectedChapter.value = 19; selectedGrammarTopicId.value = 'sentence-patterns';
  editingGrammarTopicId.value = undefined;
  const defaultTopic = getGrammarTopic(selectedGrammarTopicId.value);
  grammarConcept.value = defaultTopic?.concept ?? 'SENTENCE_PATTERN';
  uiMode.value = defaultTopic?.mode ?? 'BUILD'; grammarError.value = '';
  selectedCanvasMode.value = defaultTopic?.defaultCanvasMode ?? 'BUILD';
  advancedSettingsExpanded.value = false;
  chunkZhInput.value = ''; chunkQuizInput.value = ''; distractorImageUrl.value = '';
  correctLabel.value = ''; distractorLabel.value = '';
  antecedentNumber.value = 'singular';
  antecedentPerson.value = 'person';
  speechRate.value = 0.8;
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
  showQuestionFlow.value = false;
  unitName.value = q.unit || '';
  if (q.type === 'grammar') {
    const savedTopic = getGrammarTopic(q.grammarTopicId);
    selectedGrammarTopicId.value = savedTopic?.id ?? '';
    selectedChapter.value = savedTopic?.chapter ?? 0;
    editingGrammarTopicId.value = q.grammarTopicId;
    editingId.value = q.id;
    questionType.value = 'grammar';
    grammarConcept.value = q.concept || 'SENTENCE_PATTERN';
    uiMode.value = q.ui_mode || 'BUILD';
    targetNoun.value = q.targetNoun;
    antecedentNumber.value = q.antecedent.number || 'singular';
    antecedentPerson.value = q.antecedent.person || 'person';
    imageUrl.value = q.imageUrl || '';
    speechRate.value = q.speechRate || 0.8;
    isTimedForm.value = !!q.isTimed;
    timeLimitForm.value = q.timeLimit || 60;
    tagsInput.value = q.tags?.join(', ') || '';
    grammarAnswer.value = (q.correctAnswer || []).join(' ');
    grammarChunks.value = JSON.parse(JSON.stringify(q.chunks || []));
    grammarSentence.value = grammarChunks.value.map(chunk => chunk.text).join(' ');
    selectedCanvasMode.value = q.canvas_mode ?? savedTopic?.defaultCanvasMode ?? getQuestionCanvasMode(q);
    const matrix = q.matrix_config;
    statusGap.value = q.pragmatic_target?.statusGap ?? q.status_gap ?? 1;
    npcLabel.value = q.pragmatic_target?.npcLabel ?? '';
    matrixXInput.value = matrix?.xOptions.join(', ') || q.matrix_x?.join(', ') || '👤 主詞是人, 🤖 主詞是物 / It';
    matrixYInput.value = matrix?.yOptions.join(', ') || q.matrix_y?.join(', ') || '⏳ 花費時間, 💰 花費金錢';
    matrixCorrectX.value = matrix?.correctX ?? q.correct_x ?? 1;
    matrixCorrectY.value = matrix?.correctY ?? q.correct_y ?? 1;
    matrixPrompt.value = matrix?.prompt || q.matrix_prompt || '';
    matrixAnswer.value = matrix?.answer || q.matrix_answer || '';
    matrixOptionsInput.value = matrix?.options.join(', ') || q.matrix_options?.join(', ') || 'spend, cost, take, pay';
    advancedSettingsExpanded.value = false;
    enabledStages.value = q.enabledStages || ['micro'];
    grammarError.value = '';
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

const autoChunkGrammarSentence = () => {
  const sentence = grammarSentence.value.trim();
  if (!sentence) {
    grammarError.value = '請先輸入英文句子。';
    return;
  }

  grammarError.value = '';
  grammarChunks.value = autoChunk(sentence, grammarConcept.value).map((chunk, index) => ({
    ...chunk,
    id: `${editingId.value || 'new'}-auto-${index}`,
  }));
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
};

const updateMorphOptions = (id: string, value: string) => {
  const chunk = grammarChunks.value.find(item => item.id === id);
  if (!chunk) return;
  const options = value.split(',').map(option => option.trim()).filter(Boolean);
  chunk.options = options;
  chunk.morph_options = options;
  chunk.current_index = Math.max(0, options.indexOf(chunk.text));
};

const updateChunkText = (id: string, value: string) => {
  const chunk = grammarChunks.value.find(item => item.id === id);
  if (chunk) chunk.text = value;
};

const handleMorphTargetToggle = (id: string, enabled: boolean) => {
  const chunk = grammarChunks.value.find(item => item.id === id);
  if (!chunk) return;
  chunk.can_morph = enabled;
  if (!enabled) {
    chunk.options = [];
    chunk.morph_options = [];
    chunk.current_index = 0;
  }
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

    if (selectedCanvasMode.value === 'PRAGMATIC_HP'
      && (!Number.isInteger(statusGap.value) || statusGap.value < 0 || statusGap.value > 5)) {
      grammarError.value = '語情題的地位差距請設定為 0 到 5 的整數。';
      return;
    }

    const matrixX = matrixXInput.value.split(/[,，]/).map(value => value.trim()).filter(Boolean);
    const matrixY = matrixYInput.value.split(/[,，]/).map(value => value.trim()).filter(Boolean);
    const matrixOptions = matrixOptionsInput.value.split(/[,，]/).map(value => value.trim()).filter(Boolean);
    if (selectedCanvasMode.value === 'MATRIX_GATE'
      && (matrixX.length !== 2 || matrixY.length !== 2
        || !matrixPrompt.value.trim() || !matrixAnswer.value.trim()
        || !matrixOptions.some(option => option.toLowerCase() === matrixAnswer.value.trim().toLowerCase())
        || !answer.split(/\s+/).some(token => token.replace(/[.,!?;:]+$/, '').toLowerCase()
          === matrixAnswer.value.trim().toLowerCase())
        || ![0, 1].includes(matrixCorrectX.value) || ![0, 1].includes(matrixCorrectY.value))) {
      grammarError.value = '特徵矩陣需設定兩組各兩個選項、題目提示句、正確動詞；動詞需同時出現在答案與選項字卡中。';
      return;
    }

    const selectedTopic = selectedGrammarTopic.value;
    const chunks = grammarChunks.value.length > 0
      ? grammarChunks.value
      : autoChunk(source, grammarConcept.value).map((chunk, index) => ({
        ...chunk,
        id: `${editingId.value || 'new'}-chunk-${index}`,
      }));
    if (['MORPH', 'GRAVITY_SWITCH'].includes(selectedCanvasMode.value)) {
      const morphTargets = chunks.filter(chunk =>
        chunk.can_morph && new Set(chunk.options ?? chunk.morph_options ?? []).size > 1
      );
      const allowsMultipleTargets = selectedCanvasMode.value === 'GRAVITY_SWITCH';
      if (morphTargets.length === 0 || (!allowsMultipleTargets && morphTargets.length !== 1)) {
        grammarError.value = allowsMultipleTargets
          ? '假設語氣至少需要一個可變形字塊；每個字塊需提供至少兩種形式。'
          : '此考點一次只練一個變形目標，請只勾選一個可變形字塊，並提供至少兩種形式。';
        return;
      }
    }

    const question: QuestionData = {
      id: editingId.value || `q_${Date.now()}`,
      type: 'grammar',
      unit: unitName.value.trim() || undefined,
      grammarTopicId: selectedTopic?.id ?? editingGrammarTopicId.value,
      canvas_mode: selectedCanvasMode.value,
      ui_mode: getCanvasUIMode(selectedCanvasMode.value),
      concept: selectedTopic?.concept ?? grammarConcept.value,
      targetNoun: targetNoun.value.trim() || source.split(/\s+/)[0],
      antecedent: {
        noun: targetNoun.value.trim() || source.split(/\s+/)[0],
        number: antecedentNumber.value,
        person: antecedentPerson.value,
      },
      chunks,
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
      ...(selectedCanvasMode.value === 'PRAGMATIC_HP' ? {
        pragmatic_target: { statusGap: statusGap.value, npcLabel: npcLabel.value.trim() || undefined },
      } : {}),
      ...(selectedCanvasMode.value === 'MATRIX_GATE' ? {
        matrix_config: {
          xOptions: [matrixX[0]!, matrixX[1]!] as [string, string],
          yOptions: [matrixY[0]!, matrixY[1]!] as [string, string],
          correctX: matrixCorrectX.value === 0 ? 0 as const : 1 as const,
          correctY: matrixCorrectY.value === 0 ? 0 as const : 1 as const,
          prompt: matrixPrompt.value.trim(),
          answer: matrixAnswer.value.trim(),
          options: matrixOptions,
        },
      } : {}),
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
    unit: unitName.value.trim() || undefined,
    type: questionType.value, mode: questionMode.value, enabledStages: enabledStages.value,
    targetNoun: targetNoun.value,
    antecedent: { noun: targetNoun.value, number: antecedentNumber.value, person: antecedentPerson.value },
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

const handleQuestionReorder = (questions: QuestionData[]) => {
  localQuestions.value = questions;
  console.log('🧩 題目流程順序已更新:', questions.map((question, index) => ({
    id: question.id,
    sortOrder: index,
  })));
};

const handleBatchImport = (questions: QuestionData[], unit: string) => {
  localQuestions.value = questions;
  unitFilter.value = unit ? `unit:${unit}` : 'unclassified';
  emit('batch-import', questions);
};

const startQuestionInUnit = (unit: string) => {
  showQuestionFlow.value = false;
  resetForm();
  unitName.value = unit;
};

const openQuestionEdit = (id: string) => {
  const question = localQuestions.value.find(item => item.id === id);
  if (question) editQuestion(question);
};
</script>

<template>
  <Teleport to="body">
    <QuestionFlow v-if="showQuestionFlow" :questions="localQuestions" :selected-id="editingId"
      @reorder="handleQuestionReorder" @edit="openQuestionEdit" @batch-import="handleBatchImport"
      @create-question-in-unit="startQuestionInUnit"
      @back="showQuestionFlow = false" />
    <div v-else class="admin-modal">
      <div class="admin-layout">
        <QuestionListSidebar
          v-model:unit-filter="unitFilter"
          v-model:is-class-panel-expanded="isClassPanelExpanded"
          v-model:is-questions-expanded="isQuestionsExpanded"
          v-model:is-class-mode-toggle="isClassModeToggle"
          v-model:target-count-input="targetCountInput"
          :questions="localQuestions"
          :filtered-questions="filteredQuestions"
          :available-units="availableUnits"
          :editing-id="editingId"
          @open-flow="showQuestionFlow = true"
          @mode-change="handleModeChange"
          @reset-progress="sendResetProgress"
          @edit="editQuestion"
          @push="handleSaveAndPush"
          @delete="deleteQuestion"
          @new-question="resetForm"
          @save-close="saveAllAndClose"
        />

        <!-- 右側編輯器 -->
        <QuestionEditor
          :title="isEditing ? '✏️ 編輯題目' : '🆕 新增題目'"
          :question-type="questionType"
          @update:question-type="questionType = $event"
        >
            <div class="form-group">
              <label for="question-unit">單元名稱</label>
              <input id="question-unit" v-model="unitName" type="text" placeholder="例如：Unit 1" />
            </div>
            <template v-if="questionType === 'grammar'">
              <div class="form-group">
                <label for="grammar-chapter">課綱章節</label>
                <select id="grammar-chapter" v-model.number="selectedChapter" class="grammar-select"
                  @change="handleChapterChange">
                  <option v-if="selectedChapter === 0" :value="0" disabled>
                    舊題／自訂考點（保留原設定）
                  </option>
                  <option v-for="chapter in grammarChapters" :key="chapter.number" :value="chapter.number">
                    第 {{ chapter.number }} 章：{{ chapter.title }}
                  </option>
                </select>
              </div>
              <div class="form-group">
                <label for="grammar-topic">具體考點</label>
                <select id="grammar-topic" v-model="selectedGrammarTopicId" class="grammar-select"
                  :disabled="selectedChapter === 0"
                  @change="applyGrammarTopic(selectedGrammarTopicId)">
                  <option v-for="topic in topicsInSelectedChapter" :key="topic.id" :value="topic.id">
                    {{ topic.title }}
                  </option>
                </select>
              </div>
              <div v-if="selectedGrammarTopic" class="grammar-recommendation" role="status">
                <strong>系統推薦：{{ recommendedUiLabel }}</strong>
                <p>{{ selectedGrammarTopic.recommendation }}</p>
                <span>本題唯一操作焦點：{{ selectedGrammarTopic.focus }}</span>
                <small v-if="selectedGrammarTopic.defaultCanvasMode === 'MORPH' || selectedGrammarTopic.defaultCanvasMode === 'GRAVITY_SWITCH'">
                  請設定至少一個可變形字塊，並提供正確形式。
                </small>
              </div>
              <div v-else class="grammar-recommendation legacy-recommendation" role="status">
                <strong>舊題／自訂考點</strong>
                <p>保留此題原有的文法概念與互動模式。選擇課綱考點後，系統會套用對應推薦。</p>
                <span>目前模式：{{ uiMode }}</span>
              </div>
              <EditorFormFields
                v-model:canvas-mode="selectedCanvasMode"
                v-model:grammar-sentence="grammarSentence"
                v-model:grammar-answer="grammarAnswer"
                v-model:target-noun="targetNoun"
                v-model:antecedent-number="antecedentNumber"
                :grammar-chunks="grammarChunks"
                v-model:status-gap="statusGap"
                v-model:npc-label="npcLabel"
                v-model:matrix-x-input="matrixXInput"
                v-model:matrix-y-input="matrixYInput"
                v-model:matrix-correct-x="matrixCorrectX"
                v-model:matrix-correct-y="matrixCorrectY"
                v-model:matrix-prompt="matrixPrompt"
                v-model:matrix-answer="matrixAnswer"
                v-model:matrix-options-input="matrixOptionsInput"
                @auto-chunk="autoChunkGrammarSentence"
                @split-manually="splitGrammarSentenceManually"
                @update-chunk-text="updateChunkText"
                @toggle-morph-target="handleMorphTargetToggle"
                @update-morph-options="updateMorphOptions"
                @mode-change="handleCanvasModeChange"
              />
              <div class="form-group">
                <button type="button" class="btn-push"
                  @click="advancedSettingsExpanded = !advancedSettingsExpanded">
                  {{ advancedSettingsExpanded ? '收合進階設定 ▲' : '展開進階設定 ▼' }}
                </button>
                <div v-show="advancedSettingsExpanded" class="advanced-settings">
                  <label><input v-model="isTimedForm" type="checkbox" /> 限時挑戰</label>
                  <input v-if="isTimedForm" v-model.number="timeLimitForm" type="number" min="10" step="10"
                    placeholder="60 秒" aria-label="限時秒數" />
                  <label for="grammar-tags">標籤（逗號分隔）</label>
                  <input id="grammar-tags" v-model="tagsInput" type="text" placeholder="例如：過去式, 動詞時態" />
                  <label for="grammar-speech-rate">TTS 語速</label>
                  <input id="grammar-speech-rate" v-model.number="speechRate" type="number" min="0.5" max="1.5"
                    step="0.1" />
                </div>
              </div>
              <p v-if="grammarError" class="grammar-error" role="alert">{{ grammarError }}</p>
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
                  <label v-if="questionType === 'standard'"><input type="checkbox" value="input"
                      v-model="enabledStages">
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
                  <input v-model="targetNoun" type="text" placeholder="Ex: The boy"
                    @focus="activeUploadTarget = null" />
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
                <label>先行詞類別 (影響 who/which 判斷)</label>
                <div class="type-switcher">
                  <button type="button" :class="{ active: antecedentPerson === 'person' }"
                    @click="antecedentPerson = 'person'">
                    人 (Person)
                  </button>
                  <button type="button" :class="{ active: antecedentPerson === 'thing' }"
                    @click="antecedentPerson = 'thing'">
                    物 (Thing)
                  </button>
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
}

.grammar-error {
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