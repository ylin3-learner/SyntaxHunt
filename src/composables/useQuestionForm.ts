import { ref, computed } from 'vue';
import type { CanvasMode, Chunk, GrammarConcept, QuestionData, UIMode, CustomGrammarRule } from '../rules/types';
import { getGrammarTopic, grammarChapters } from '../rules/grammarTopics';
import { buildQuestion, type FormPayload } from '../domain/QuestionBuilder';

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
    customRules: [],

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
    applyGrammarTopic, saveQuestion, resetForm
  };
}