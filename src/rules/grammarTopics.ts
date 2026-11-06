import type { CanvasMode, GrammarConcept, UIMode } from './types';

export interface GrammarTopic {
  id: string;
  chapterId: string;
  chapter: number;
  title: string;
  concept: GrammarConcept;
  mode: UIMode;
  defaultCanvasMode: CanvasMode;
  shuffleTiles?: boolean;
  focus: string;
  recommendation: string;
}

export interface GrammarChapter {
  id: string;
  number: number;
  title: string;
  defaultCanvasMode: CanvasMode;
  topics: GrammarTopic[];
}

const topicDefinitions: Omit<GrammarTopic, 'chapterId' | 'defaultCanvasMode'>[] = [
  { id: 'five-sentence-patterns', chapter: 1, title: '五大句型', concept: 'SENTENCE_PATTERN', mode: 'BUILD', shuffleTiles: true, focus: '依主詞、動詞、受詞與補語功能組成指定句型。', recommendation: '打亂句子字塊，讓學生依句法位置重組，而不是照抄答案。' },
  { id: 'tense-present', chapter: 2, title: '現在時間與動詞形式', concept: 'TENSE_ASPECT', mode: 'MORPH', shuffleTiles: false, focus: '只改變指定動詞的現在形式。', recommendation: '固定句子並點選目標動詞的形式，避免同時分心排列字塊。' },
  { id: 'tense-past', chapter: 2, title: '過去時間與動詞形式', concept: 'PAST_TENSE', mode: 'MORPH', shuffleTiles: false, focus: '只改變指定動詞的過去形式。', recommendation: '固定句子並點選目標動詞的形式。' },
  { id: 'tense-future', chapter: 3, title: '未來時間與動詞形式', concept: 'TENSE_ASPECT', mode: 'MORPH', focus: '只選擇目標動詞的未來形式。', recommendation: '固定句子並點選目標動詞的形式。' },
  { id: 'tense-aspect', chapter: 3, title: '完成與進行狀態', concept: 'TENSE_ASPECT', mode: 'MORPH', focus: '一次辨認一個目標動詞的完成或進行形式。', recommendation: '固定句子，只操作指定的動詞形式。' },
  { id: 'modal-ability', chapter: 4, title: '能力與可能性（can／could）', concept: 'MODAL_VERB', mode: 'BUILD', focus: '依情境選擇合適的能力或可能性語氣。', recommendation: '以語情互動呈現情態選擇，不打亂固定句子。' },
  { id: 'modal-permission', chapter: 4, title: '請求與允許（may／could）', concept: 'MODAL_VERB', mode: 'BUILD', focus: '依情境選擇合適的請求或允許語氣。', recommendation: '以語情互動呈現情態選擇，不打亂固定句子。' },
  { id: 'modal-obligation', chapter: 4, title: '義務與建議（must／should）', concept: 'MODAL_VERB', mode: 'BUILD', focus: '依情境區分義務與建議的語氣強度。', recommendation: '以語情互動呈現情態選擇，不打亂固定句子。' },
  { id: 'modal-habit', chapter: 4, title: '過去習慣（used to）與提醒（had better）', concept: 'MODAL_VERB', mode: 'BUILD', focus: '依情境辨認目標助動詞片語的語意。', recommendation: '以語情互動呈現情態選擇，不打亂固定句子。' },
  { id: 'prepositions-time', chapter: 5, title: '時間介詞', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '只選擇符合時間範圍的介詞。', recommendation: '固定句子，只操作時間介詞位置。' },
  { id: 'prepositions-place', chapter: 5, title: '地點介詞', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '只選擇符合空間位置的介詞。', recommendation: '使用單一空間關係作為操作焦點。' },
  { id: 'prepositions-phrases', chapter: 5, title: '其他介詞與介詞片語', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '只選擇符合指定語意或搭配的介詞片語。', recommendation: '固定句子其餘部分，只呈現一個介詞目標。' },
  { id: 'noun-number', chapter: 6, title: '名詞單複數與可數性', concept: 'SUBJECT_VERB_AGREEMENT', mode: 'MORPH', focus: '只改變目標名詞的數或形式。', recommendation: '固定句子並直接選擇目標名詞形式。' },
  { id: 'pronoun-role', chapter: 6, title: '代名詞格與指涉', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '只選擇符合句中角色的代名詞。', recommendation: '以單一代名詞位置呈現，不混入整句排序。' },
  { id: 'adjective-use', chapter: 7, title: '形容詞修飾名詞', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '只選擇符合名詞語意的目標形容詞。', recommendation: '固定句子，只操作一個形容詞位置。' },
  { id: 'adjective-quantity', chapter: 7, title: '數量詞與名詞搭配', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '只選擇與目標名詞可搭配的數量詞。', recommendation: '固定句子，只操作一個數量詞位置。' },
  { id: 'adjective-participle', chapter: 7, title: '分詞作形容詞', concept: 'SENTENCE_PATTERN', mode: 'MORPH', focus: '只辨認目標分詞的形容詞形式。', recommendation: '固定句子並選擇指定分詞形式。' },
  { id: 'participle-clause', chapter: 7, title: '分詞構句簡化', concept: 'ADVERB_CLAUSE', mode: 'REDUCE', shuffleTiles: false, focus: '刪除重複主詞與連接詞，保留分詞片語表達子句關係。', recommendation: '保持原句語序，逐步刪減可簡化的結構，避免把語序重組混入本題。' },
  { id: 'adverb-frequency', chapter: 8, title: '頻率副詞位置', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '只判斷頻率副詞在句中的位置。', recommendation: '固定其他詞語，只調整頻率副詞位置。' },
  { id: 'adverb-manner-degree', chapter: 8, title: '方式與程度副詞', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '只選擇符合動作或程度的副詞。', recommendation: '以單一目標副詞選擇作為操作焦點。' },
  { id: 'comparison-than', chapter: 9, title: '比較級與 than', concept: 'SENTENCE_PATTERN', mode: 'MORPH', focus: '只將一個目標詞改為比較級。', recommendation: '固定句子並直接選擇比較級形式。' },
  { id: 'comparison-superlative', chapter: 9, title: '最高級與比較範圍', concept: 'SENTENCE_PATTERN', mode: 'MORPH', focus: '只將一個目標詞改為最高級。', recommendation: '固定句子並直接選擇最高級形式。' },
  { id: 'gerund-infinitive-choice', chapter: 10, title: '動名詞／不定詞選擇', concept: 'SENTENCE_PATTERN', mode: 'MORPH', focus: '只選擇目標動詞後接 V-ing 或 to V。', recommendation: '固定句子並操作一個目標形式。' },
  { id: 'passive-tense', chapter: 12, title: '不同時態的 be + 過去分詞', concept: 'TENSE_ASPECT', mode: 'MORPH', focus: '只選擇目標被動謂語形式。', recommendation: '固定主受詞位置，聚焦被動謂語的形式變化。' },
  { id: 'passive-imperative', chapter: 12, title: '祈使句與從句中的被動', concept: 'TENSE_ASPECT', mode: 'MORPH', focus: '只改變指定結構中的被動謂語。', recommendation: '固定句子其他部分，只選擇目標被動形式。' },
  { id: 'causative-verbs', chapter: 14, title: '使役動詞補語', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '判斷使役動詞後接原形或過去分詞的句法限制。', recommendation: '以句法特徵解鎖正確補語，不打亂題目句子。' },
  { id: 'sense-verbs', chapter: 14, title: '感官動詞補語', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '判斷感官動詞後接原形或 V-ing 的句法限制。', recommendation: '以句法特徵解鎖正確補語，不打亂題目句子。' },
  { id: 'double-object', chapter: 13, title: '雙賓語與授與動詞', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '只辨認目標動詞的雙賓語結構。', recommendation: '以固定句型卡槽呈現受詞關係。' },
  { id: 'say-tell', chapter: 14, title: 'say／tell 與受詞結構', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '只選擇符合 say 或 tell 的受詞結構。', recommendation: '固定情境與句子，只操作動詞搭配。' },
  { id: 'hear-listen-see-look', chapter: 14, title: 'hear／listen 與 see／look', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '只依目標動詞選擇所需介詞或補語。', recommendation: '一道題只放一組易混淆動詞。' },
  { id: 'have-get-cost', chapter: 13, title: 'spend／cost 與花費句型', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '依主詞與花費類型判斷 spend／cost 等動詞的句法限制。', recommendation: '先解碼句法特徵，再選擇正確動詞；不打亂題目句子。' },
  { id: 'inversion', chapter: 15, title: '否定副詞引導的倒裝', concept: 'INVERSION', mode: 'BUILD', shuffleTiles: true, focus: '依語序組成否定副詞引導的倒裝句。', recommendation: '打亂句子字塊，聚焦助動詞與主詞的位置。' },
  { id: 'relative-clause', chapter: 16, title: '關係代詞與子句附著', concept: 'ADJECTIVE_CLAUSE', mode: 'BUILD', shuffleTiles: true, focus: '將關係子句接到正確名詞後並組成完整句子。', recommendation: '打亂句子字塊，聚焦子句附著位置與語序。' },
  { id: 'relative-reduction', chapter: 16, title: '關係子句簡化', concept: 'ADJECTIVE_CLAUSE', mode: 'REDUCE', focus: '只移除目標關係子句中可省略或可簡化的結構。', recommendation: '用刪減介面聚焦一個指定簡化操作。' },
  { id: 'coordinating-conjunctions', chapter: 17, title: '對等連接詞（and／but／or）', concept: 'CLAUSES_CONNECTORS', mode: 'BUILD', shuffleTiles: true, focus: '組成兩個對等子句並選擇符合邏輯的連接方式。', recommendation: '打亂句子字塊，練習連接詞與子句的語序。' },
  { id: 'subordinating-conjunctions', chapter: 17, title: '從屬連接詞與副詞子句', concept: 'ADVERB_CLAUSE', mode: 'BUILD', shuffleTiles: true, focus: '組成目標因果、時間或讓步關係的從屬子句。', recommendation: '打亂句子字塊，練習連接詞與子句的語序。' },
  { id: 'noun-clause-what-that', chapter: 18, title: 'what／that 名詞子句', concept: 'NOUN_CLAUSE', mode: 'BUILD', shuffleTiles: true, focus: '組成名詞子句並放入正確句子位置。', recommendation: '打亂句子字塊，將子句當成整體組入句型。' },
  { id: 'pronoun-one-it', chapter: 18, title: 'one／it 指代選擇', concept: 'NOUN_CLAUSE', mode: 'REDUCE', shuffleTiles: false, focus: '只判斷指代已知事物或替代同類名詞。', recommendation: '保留正確指代並移除多餘名詞，固定句子原始順序。' },
  { id: 'sentence-patterns', chapter: 19, title: '祈使句、there be 與強調句', concept: 'SENTENCE_PATTERN', mode: 'BUILD', shuffleTiles: true, focus: '依語序組成題目指定的句型。', recommendation: '打亂句子字塊，每題聚焦一種句型。' },
  { id: 'there-be', chapter: 19, title: 'there be 存在句', concept: 'SENTENCE_PATTERN', mode: 'BUILD', shuffleTiles: true, focus: '組成 there be 存在句並注意主詞與動詞一致。', recommendation: '打亂句子字塊，練習存在句的完整語序。' },
  { id: 'emphatic-sentence', chapter: 19, title: '強調句', concept: 'SENTENCE_PATTERN', mode: 'BUILD', shuffleTiles: true, focus: '依語序組成題目指定的強調結構。', recommendation: '打亂句子字塊，聚焦強調句型。' },
  { id: 'emotion-verbs', chapter: 11, title: '情緒動詞與語氣', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '依情境選擇得體的情緒動詞表達。', recommendation: '以語情互動呈現情境與人際影響，不打亂固定句子。' },
  { id: 'subjunctive-present-unreal', chapter: 20, title: '與現在事實相反', concept: 'SUBJUNCTIVE', mode: 'MORPH', focus: '只改變目標子句中的假設動詞形式。', recommendation: '固定條件句結構，聚焦一個假設形式。' },
  { id: 'subjunctive-past-unreal', chapter: 20, title: '與過去事實相反', concept: 'SUBJUNCTIVE', mode: 'MORPH', focus: '只選擇目標結果子句中的完成式虛擬形式。', recommendation: '固定句子，只操作一個目標動詞形式。' },
];

const chapterDefinitions: Array<Omit<GrammarChapter, 'topics'>> = [
  { id: 'chapter-1', number: 1, title: '五大句型', defaultCanvasMode: 'BUILD' },
  { id: 'chapter-2', number: 2, title: '時態與動詞形式', defaultCanvasMode: 'MORPH' },
  { id: 'chapter-3', number: 3, title: '未來式', defaultCanvasMode: 'MORPH' },
  { id: 'chapter-4', number: 4, title: '助動詞', defaultCanvasMode: 'PRAGMATIC_HP' },
  { id: 'chapter-5', number: 5, title: '介詞', defaultCanvasMode: 'BUILD' },
  { id: 'chapter-6', number: 6, title: '名詞與代詞', defaultCanvasMode: 'MORPH' },
  { id: 'chapter-7', number: 7, title: '形容詞', defaultCanvasMode: 'BUILD' },
  { id: 'chapter-8', number: 8, title: '副詞', defaultCanvasMode: 'BUILD' },
  { id: 'chapter-9', number: 9, title: '比較級與最高級', defaultCanvasMode: 'MORPH' },
  { id: 'chapter-10', number: 10, title: '動名詞與不定詞', defaultCanvasMode: 'MORPH' },
  { id: 'chapter-11', number: 11, title: '情緒動詞', defaultCanvasMode: 'PRAGMATIC_HP' },
  { id: 'chapter-12', number: 12, title: '被動語態', defaultCanvasMode: 'MORPH' },
  { id: 'chapter-13', number: 13, title: 'spend／cost 花費句型', defaultCanvasMode: 'MATRIX_GATE' },
  { id: 'chapter-14', number: 14, title: '感官／使役動詞', defaultCanvasMode: 'MATRIX_GATE' },
  { id: 'chapter-15', number: 15, title: '倒裝句', defaultCanvasMode: 'BUILD' },
  { id: 'chapter-16', number: 16, title: '關係從句', defaultCanvasMode: 'BUILD' },
  { id: 'chapter-17', number: 17, title: '連詞', defaultCanvasMode: 'BUILD' },
  { id: 'chapter-18', number: 18, title: '代名詞與名詞子句', defaultCanvasMode: 'BUILD' },
  { id: 'chapter-19', number: 19, title: '句型', defaultCanvasMode: 'BUILD' },
  { id: 'chapter-20', number: 20, title: '虛擬語氣與條件句', defaultCanvasMode: 'GRAVITY_SWITCH' },
];

const topicCanvasModeOverrides: Partial<Record<string, CanvasMode>> = {
  'pronoun-role': 'BUILD',
  'adjective-participle': 'MORPH',
  'participle-clause': 'REDUCE',
  'pronoun-one-it': 'REDUCE',
  'relative-reduction': 'REDUCE',
  'modal-ability': 'PRAGMATIC_HP',
  'modal-permission': 'PRAGMATIC_HP',
  'modal-obligation': 'PRAGMATIC_HP',
  'modal-habit': 'PRAGMATIC_HP',
  'emotion-verbs': 'PRAGMATIC_HP',
  'have-get-cost': 'MATRIX_GATE',
  'causative-verbs': 'MATRIX_GATE',
  'sense-verbs': 'MATRIX_GATE',
  'double-object': 'MATRIX_GATE',
};

export const grammarTopics: GrammarTopic[] = topicDefinitions.map(topic => {
  const chapter = chapterDefinitions.find(item => item.number === topic.chapter);
  if (!chapter) throw new Error(`Unknown grammar chapter ${topic.chapter} for topic ${topic.id}`);
  return {
    ...topic,
    chapterId: chapter.id,
    defaultCanvasMode: topicCanvasModeOverrides[topic.id] ?? chapter.defaultCanvasMode,
    shuffleTiles: topic.shuffleTiles ?? false,
  };
});

export const grammarChapters: GrammarChapter[] = chapterDefinitions.map(chapter => ({
  ...chapter,
  topics: grammarTopics.filter(topic => topic.chapterId === chapter.id),
}));

export const getGrammarTopic = (id?: string) =>
  grammarTopics.find(topic => topic.id === id);
