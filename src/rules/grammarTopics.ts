import type { GrammarConcept, UIMode } from './types';

export interface GrammarTopic {
  id: string;
  chapter: number;
  chapterTitle: string;
  title: string;
  concept: GrammarConcept;
  mode: UIMode;
  focus: string;
  recommendation: string;
}

export const grammarTopics: GrammarTopic[] = [
  { id: 'tense-present', chapter: 1, chapterTitle: '現在式', title: '現在時間與動詞形式', concept: 'TENSE_ASPECT', mode: 'MORPH', focus: '只改變指定動詞的現在形式。', recommendation: '固定句子並點選目標動詞的形式，避免同時分心排列字塊。' },
  { id: 'tense-past', chapter: 2, chapterTitle: '過去式', title: '過去時間與動詞形式', concept: 'PAST_TENSE', mode: 'MORPH', focus: '只改變指定動詞的過去形式。', recommendation: '固定句子並點選目標動詞的形式。' },
  { id: 'tense-future', chapter: 3, chapterTitle: '未來式', title: '未來時間與動詞形式', concept: 'TENSE_ASPECT', mode: 'MORPH', focus: '只選擇目標動詞的未來形式。', recommendation: '固定句子並點選目標動詞的形式。' },
  { id: 'tense-aspect', chapter: 3, chapterTitle: '未來式', title: '完成與進行狀態', concept: 'TENSE_ASPECT', mode: 'MORPH', focus: '一次辨認一個目標動詞的完成或進行形式。', recommendation: '固定句子，只操作指定的動詞形式。' },
  { id: 'modal-ability', chapter: 4, chapterTitle: '助動詞', title: '能力與可能性（can／could）', concept: 'MODAL_VERB', mode: 'MORPH', focus: '只依語境判斷能力或可能性。', recommendation: '使用情態選擇介面，句子其他部分固定。' },
  { id: 'modal-permission', chapter: 4, chapterTitle: '助動詞', title: '請求與允許（may／could）', concept: 'MODAL_VERB', mode: 'MORPH', focus: '只判斷請求或允許所需的情態語氣。', recommendation: '使用情態選擇介面，聚焦一個助動詞。' },
  { id: 'modal-obligation', chapter: 4, chapterTitle: '助動詞', title: '義務與建議（must／should）', concept: 'MODAL_VERB', mode: 'MORPH', focus: '只區分義務與建議的語氣強度。', recommendation: '使用情態選擇介面，其他句子部分固定。' },
  { id: 'modal-habit', chapter: 4, chapterTitle: '助動詞', title: '過去習慣（used to）與提醒（had better）', concept: 'MODAL_VERB', mode: 'MORPH', focus: '只辨認目標助動詞片語的語意與形式。', recommendation: '一次呈現一個目標助動詞片語，避免加入語序操作。' },
  { id: 'prepositions-time', chapter: 5, chapterTitle: '介詞', title: '時間介詞', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '只選擇符合時間範圍的介詞。', recommendation: '固定句子，只操作時間介詞位置。' },
  { id: 'prepositions-place', chapter: 5, chapterTitle: '介詞', title: '地點介詞', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '只選擇符合空間位置的介詞。', recommendation: '使用單一空間關係作為操作焦點。' },
  { id: 'prepositions-phrases', chapter: 5, chapterTitle: '介詞', title: '其他介詞與介詞片語', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '只選擇符合指定語意或搭配的介詞片語。', recommendation: '固定句子其餘部分，只呈現一個介詞目標。' },
  { id: 'noun-number', chapter: 6, chapterTitle: '名詞與代詞', title: '名詞單複數與可數性', concept: 'SUBJECT_VERB_AGREEMENT', mode: 'MORPH', focus: '只改變目標名詞的數或形式。', recommendation: '固定句子並直接選擇目標名詞形式。' },
  { id: 'pronoun-role', chapter: 6, chapterTitle: '名詞與代詞', title: '代名詞格與指涉', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '只選擇符合句中角色的代名詞。', recommendation: '以單一代名詞位置呈現，不混入整句排序。' },
  { id: 'adjective-use', chapter: 7, chapterTitle: '形容詞', title: '形容詞修飾名詞', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '只選擇符合名詞語意的目標形容詞。', recommendation: '固定句子，只操作一個形容詞位置。' },
  { id: 'adjective-quantity', chapter: 7, chapterTitle: '形容詞', title: '數量詞與名詞搭配', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '只選擇與目標名詞可搭配的數量詞。', recommendation: '固定句子，只操作一個數量詞位置。' },
  { id: 'adjective-participle', chapter: 7, chapterTitle: '形容詞', title: '分詞作形容詞', concept: 'SENTENCE_PATTERN', mode: 'MORPH', focus: '只辨認目標分詞的形容詞形式。', recommendation: '固定句子並選擇指定分詞形式。' },
  { id: 'adverb-frequency', chapter: 8, chapterTitle: '副詞', title: '頻率副詞位置', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '只判斷頻率副詞在句中的位置。', recommendation: '固定其他詞語，只調整頻率副詞位置。' },
  { id: 'adverb-manner-degree', chapter: 8, chapterTitle: '副詞', title: '方式與程度副詞', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '只選擇符合動作或程度的副詞。', recommendation: '以單一目標副詞選擇作為操作焦點。' },
  { id: 'comparison-than', chapter: 9, chapterTitle: '比較級與最高級', title: '比較級與 than', concept: 'SENTENCE_PATTERN', mode: 'MORPH', focus: '只將一個目標詞改為比較級。', recommendation: '固定句子並直接選擇比較級形式。' },
  { id: 'comparison-superlative', chapter: 9, chapterTitle: '比較級與最高級', title: '最高級與比較範圍', concept: 'SENTENCE_PATTERN', mode: 'MORPH', focus: '只將一個目標詞改為最高級。', recommendation: '固定句子並直接選擇最高級形式。' },
  { id: 'gerund-infinitive-choice', chapter: 10, chapterTitle: '動名詞與不定詞', title: '動名詞／不定詞選擇', concept: 'SENTENCE_PATTERN', mode: 'MORPH', focus: '只選擇目標動詞後接 V-ing 或 to V。', recommendation: '固定句子並操作一個目標形式。' },
  { id: 'sense-passive-pattern', chapter: 11, chapterTitle: '情緒／感官動詞與被動語態', title: '感官／情緒動詞主動與被動', concept: 'TENSE_ASPECT', mode: 'MORPH', focus: '只轉換目標感官／情緒動詞的語態形式。', recommendation: '固定主句結構，只呈現一個語態變化目標。' },
  { id: 'passive-tense', chapter: 12, chapterTitle: '被動語態', title: '不同時態的 be + 過去分詞', concept: 'TENSE_ASPECT', mode: 'MORPH', focus: '只選擇目標被動謂語形式。', recommendation: '固定主受詞位置，聚焦被動謂語的形式變化。' },
  { id: 'passive-imperative', chapter: 12, chapterTitle: '被動語態', title: '祈使句與從句中的被動', concept: 'TENSE_ASPECT', mode: 'MORPH', focus: '只改變指定結構中的被動謂語。', recommendation: '固定句子其他部分，只選擇目標被動形式。' },
  { id: 'causative-verbs', chapter: 13, chapterTitle: '特殊動詞（一）', title: '使役動詞補語', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '只組成使役動詞後的目標補語形式。', recommendation: '固定主句，只操作一個使役結構。' },
  { id: 'sense-verbs', chapter: 13, chapterTitle: '特殊動詞（一）', title: '感官動詞補語', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '只組成感官動詞後的目標補語形式。', recommendation: '固定句子，只操作一個感官動詞結構。' },
  { id: 'double-object', chapter: 13, chapterTitle: '特殊動詞（一）', title: '雙賓語與授與動詞', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '只辨認目標動詞的雙賓語結構。', recommendation: '以固定句型卡槽呈現受詞關係。' },
  { id: 'say-tell', chapter: 14, chapterTitle: '特殊動詞（二）', title: 'say／tell 與受詞結構', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '只選擇符合 say 或 tell 的受詞結構。', recommendation: '固定情境與句子，只操作動詞搭配。' },
  { id: 'hear-listen-see-look', chapter: 14, chapterTitle: '特殊動詞（二）', title: 'hear／listen 與 see／look', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '只依目標動詞選擇所需介詞或補語。', recommendation: '一道題只放一組易混淆動詞。' },
  { id: 'have-get-cost', chapter: 14, chapterTitle: '特殊動詞（二）', title: 'have／get 與花費動詞', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '只選擇目標動詞對應的句型。', recommendation: '以一個動詞搭配作為唯一操作焦點。' },
  { id: 'inversion', chapter: 15, chapterTitle: '倒裝句', title: '否定副詞引導的倒裝', concept: 'INVERSION', mode: 'BUILD', focus: '只調整否定副詞後的主詞與助動詞位置。', recommendation: '以句子卡槽聚焦一個倒裝語序，不同時切換假設條件。' },
  { id: 'relative-clause', chapter: 16, chapterTitle: '關係從句', title: '關係代詞與子句附著', concept: 'ADJECTIVE_CLAUSE', mode: 'BUILD', focus: '只將一個關係子句接到正確名詞後。', recommendation: '以單一名詞錨點和子句位置呈現附著關係。' },
  { id: 'relative-reduction', chapter: 16, chapterTitle: '關係從句', title: '關係子句簡化', concept: 'ADJECTIVE_CLAUSE', mode: 'REDUCE', focus: '只移除目標關係子句中可省略或可簡化的結構。', recommendation: '用刪減介面聚焦一個指定簡化操作。' },
  { id: 'coordinating-conjunctions', chapter: 17, chapterTitle: '連詞', title: '對等連接詞（and／but／or）', concept: 'CLAUSES_CONNECTORS', mode: 'BUILD', focus: '只判斷兩個對等子句間的邏輯關係。', recommendation: '固定子句內容，只操作連接詞。' },
  { id: 'subordinating-conjunctions', chapter: 17, chapterTitle: '連詞', title: '從屬連接詞與副詞子句', concept: 'ADVERB_CLAUSE', mode: 'BUILD', focus: '只選擇表達目標因果、時間或讓步關係的連接詞。', recommendation: '固定子句內容，聚焦一種從屬關係。' },
  { id: 'noun-clause-what-that', chapter: 18, chapterTitle: '代名詞與名詞子句', title: 'what／that 名詞子句', concept: 'NOUN_CLAUSE', mode: 'BUILD', focus: '只辨認名詞子句連接詞與子句整體角色。', recommendation: '將子句當成一個單位，聚焦其所在句子位置。' },
  { id: 'pronoun-one-it', chapter: 18, chapterTitle: '代名詞與名詞子句', title: 'one／it 指代選擇', concept: 'NOUN_CLAUSE', mode: 'BUILD', focus: '只判斷指代已知事物或替代同類名詞。', recommendation: '固定句子，只操作一個代詞替換位置。' },
  { id: 'sentence-patterns', chapter: 19, chapterTitle: '句型', title: '祈使句、there be 與強調句', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '只組成題目指定的一種句型。', recommendation: '每題選一種句型作為焦點，以句子卡槽呈現。' },
  { id: 'there-be', chapter: 19, chapterTitle: '句型', title: 'there be 存在句', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '只組成 there be 存在句的主詞與動詞一致形式。', recommendation: '固定情境，只操作 there be 句型。' },
  { id: 'emphatic-sentence', chapter: 19, chapterTitle: '句型', title: '強調句', concept: 'SENTENCE_PATTERN', mode: 'BUILD', focus: '只組成題目指定的強調結構。', recommendation: '使用句子卡槽呈現單一強調句型。' },
  { id: 'subjunctive-present-unreal', chapter: 20, chapterTitle: '虛擬語氣與條件句', title: '與現在事實相反', concept: 'SUBJUNCTIVE', mode: 'MORPH', focus: '只改變目標子句中的假設動詞形式。', recommendation: '固定條件句結構，聚焦一個假設形式。' },
  { id: 'subjunctive-past-unreal', chapter: 20, chapterTitle: '虛擬語氣與條件句', title: '與過去事實相反', concept: 'SUBJUNCTIVE', mode: 'MORPH', focus: '只選擇目標結果子句中的完成式虛擬形式。', recommendation: '固定句子，只操作一個目標動詞形式。' },
];

export const grammarChapters = [...new Set(grammarTopics.map(topic => topic.chapter))]
  .map(chapter => ({
    number: chapter,
    title: grammarTopics.find(topic => topic.chapter === chapter)?.chapterTitle ?? '',
    topics: grammarTopics.filter(topic => topic.chapter === chapter),
  }));

export const getGrammarTopic = (id?: string) =>
  grammarTopics.find(topic => topic.id === id);
