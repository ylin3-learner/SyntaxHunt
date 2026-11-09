import { ref, computed } from 'vue';
import type { CanvasMode, Chunk, GrammarConcept, QuestionData, UIMode, CustomGrammarRule } from '../rules/types';
import { getGrammarTopic, grammarChapters } from '../rules/grammarTopics';
import { buildQuestion, type FormPayload } from '../domain/QuestionBuilder';
import { autoChunkSmart } from '../rules/smartChunker'; // 引入剛剛建立的智慧切詞器

export function useQuestionForm(emit: any, props: any) {
  // 1. 完整定義 FormPayload，補齊 selectedChapter 與 uiMode
  const form = ref<FormPayload>({
    questionType: 'standard',
    questionMode: 'build',
    unitName: '',
    grammarSentence: '',
    grammarAnswer: '',
    grammarChunks: [],
    grammarConcept: 'SENTENCE_PATTERN',

    selectedChapter: 19,
    uiMode: 'BUILD',
    customRules: [], // 確保 customRules 有被初始化

    selectedCanvasMode: 'BUILD',
    selectedGrammarTopicId: 'sentence-patterns',
    editingGrammarTopicId: undefined,
    targetNoun: '',
    antecedentNumber: 'singular',
    antecedentPerson: 'person',
    imageUrl: '',
    tagsInput: '',
    speechRate: 0.8,
    isTimedForm: false,
    timeLimitForm: 60,
    explanationTitle: '',
    explanationDesc: '',
    statusGap: 1,
    npcLabel: '',
    matrixXInput: '👤 主詞是人, 🤖 主詞是物 / It',
    matrixYInput: '⏳ 花費時間, 💰 花費金錢',
    matrixCorrectX: 1,
    matrixCorrectY: 1,
    matrixPrompt: '',
    matrixAnswer: '',
    matrixOptionsInput: 'spend, cost, take, pay',
    relativeSentence: '',
    prepositionSentence: '',
    distractorsInput: '',
    chineseSentence: '',
    chineseHighlight: '',
    modifierImageUrl: '',
    puzzleLayout: 'modifier-left',
    clozePrefix: '',
    clozeSuffix: '',
    correctLabel: '',
    distractorLabel: '',
    distractorImageUrl: '',
    chunkZhInput: '',
    chunkQuizInput: '',
    enabledStages: ['input', 'macro', 'micro', 'pronunciation', 'noticing'],
    editingId: null
  });

  // 2. errors 是獨立的
  const errors = ref<string[]>([]);

  // 3. 其餘 UI 狀態
  const showQuestionFlow = ref(false);
  const isQuestionsExpanded = ref(true);
  const isClassPanelExpanded = ref(true);
  const isClassModeToggle = ref(false);
  const targetCountInput = ref(30);
  const currentRoomCode = ref('');
  const activeUploadTarget = ref<'noun' | 'distractor' | 'modifier' | null>(null);
  const uploadTarget = ref<'noun' | 'distractor' | 'modifier'>('noun');

  const isEditing = computed(() => form.value.editingId !== null);
  const topicsInSelectedChapter = computed(() => grammarChapters.find(c => c.number === form.value.selectedChapter)?.topics ?? []);
  const selectedGrammarTopic = computed(() => getGrammarTopic(form.value.selectedGrammarTopicId));

  const applyGrammarTopic = (topicId: string) => {
    const topic = getGrammarTopic(topicId);
    if (!topic) return;
    form.value.selectedGrammarTopicId = topic.id;
    form.value.selectedChapter = topic.chapter;
    form.value.grammarConcept = topic.concept;
    form.value.uiMode = topic.mode;
    form.value.selectedCanvasMode = topic.defaultCanvasMode;
    form.value.grammarChunks = [];
    errors.value = [];
  };

  // ==========================================
  // 新增：整合智慧切詞與 autoInfer 的方法
  // ==========================================
  const autoChunkGrammarSentence = () => {
    const source = form.value.grammarSentence.trim();
    if (!source) return;

    // 呼叫 Strategy Pattern 的協調器，傳入正確答案以觸發 autoInfer 推演
    const result = autoChunkSmart(
      source,
      form.value.grammarConcept,
      form.value.grammarAnswer // 如果有填答案，就會生成建議規則；若無則優雅降級
    );

    // 1. 更新字塊 (補上唯一 ID)
    form.value.grammarChunks = result.chunks.map((c, i) => ({
      ...c,
      id: `${form.value.editingId || 'new'}-auto-${i}`
    }));

    // 2. 自動套用推薦的 UI 模式 (若老師尚未手動調整)
    if (result.recommendedUiMode) {
      form.value.uiMode = result.recommendedUiMode;
    }

    // 3. 將系統建議的規則草稿存入表單狀態，準備讓 UI 顯示「一鍵採用」
    if (result.suggestedRules.length > 0) {
      // 這裡可以選擇直接覆蓋舊的 auto 規則，或保留手動規則
      const manualRules = (form.value.customRules || []).filter(r => !r.id.startsWith('auto-'));
      form.value.customRules = [...manualRules, ...result.suggestedRules];
    }
  };

  const saveQuestion = () => {
    const { question, errors: buildErrors } = buildQuestion(form.value);
    if (buildErrors.length > 0) { errors.value = buildErrors; return; }

    emit('save-question', question);
    resetForm();
  };

  const resetForm = () => {
    form.value = {
      questionType: 'standard',
      questionMode: 'build',
      unitName: '',
      grammarSentence: '',
      grammarAnswer: '',
      grammarChunks: [],
      grammarConcept: 'SENTENCE_PATTERN',
      selectedChapter: 19,
      uiMode: 'BUILD',
      selectedCanvasMode: 'BUILD',
      selectedGrammarTopicId: 'sentence-patterns',
      editingGrammarTopicId: undefined,
      targetNoun: '',
      antecedentNumber: 'singular',
      antecedentPerson: 'person',
      imageUrl: '',
      tagsInput: '',
      speechRate: 0.8,
      isTimedForm: false,
      timeLimitForm: 60,
      explanationTitle: '',
      explanationDesc: '',
      statusGap: 1,
      npcLabel: '',
      matrixXInput: '👤 主詞是人, 🤖 主詞是物 / It',
      matrixYInput: '⏳ 花費時間, 💰 花費金錢',
      matrixCorrectX: 1,
      matrixCorrectY: 1,
      matrixPrompt: '',
      matrixAnswer: '',
      matrixOptionsInput: 'spend, cost, take, pay',
      relativeSentence: '',
      prepositionSentence: '',
      distractorsInput: '',
      chineseSentence: '',
      chineseHighlight: '',
      modifierImageUrl: '',
      puzzleLayout: 'modifier-left',
      clozePrefix: '',
      clozeSuffix: '',
      correctLabel: '',
      distractorLabel: '',
      distractorImageUrl: '',
      chunkZhInput: '',
      chunkQuizInput: '',
      enabledStages: ['input', 'macro', 'micro', 'pronunciation', 'noticing'],
      editingId: null,
      customRules: [],
    };
    errors.value = [];
  };

  return {
    form, errors, showQuestionFlow, isQuestionsExpanded, isClassPanelExpanded,
    isClassModeToggle, targetCountInput, currentRoomCode, activeUploadTarget, uploadTarget,
    isEditing, topicsInSelectedChapter, selectedGrammarTopic,
    applyGrammarTopic, saveQuestion, resetForm,
    autoChunkGrammarSentence // 記得將新方法匯出
  };
}