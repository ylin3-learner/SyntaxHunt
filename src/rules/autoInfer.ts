import type { GrammarConcept, CustomGrammarRule, Chunk } from './types';

export interface AutoInferResult {
    suggestedConcept: GrammarConcept;
    suggestedRules: CustomGrammarRule[];
}

const createRule = (id: string, wrongPattern: string[], message: string, priority = 90): CustomGrammarRule => ({
    id: `auto-${id}-${Date.now()}`,
    wrongPattern,
    message,
    priority,
});

export function inferGrammarRules(
    concept: GrammarConcept,
    correctAnswer: string[],
    chunks: Chunk[] = []
): AutoInferResult {
    const rules: CustomGrammarRule[] = [];
    const morphChunk = chunks.find(c => c.can_morph);
    const correctWord = morphChunk?.text.replace(/[\[\]]/g, '').toLowerCase() || '';
    const baseWord = morphChunk?.options?.[0]?.replace(/[\[\]]/g, '').toLowerCase() || '';
    const answerStr = correctAnswer.join(' ').toLowerCase();

    // 策略一：形態變化 (Ch 2, 3, 6, 9, 12)
    if (['PAST_TENSE', 'TENSE_ASPECT', 'SUBJECT_VERB_AGREEMENT', 'COMPARISON', 'PASSIVE_VOICE'].includes(concept)) {
        if (baseWord && correctWord && baseWord !== correctWord) {
            rules.push(createRule('morphology', [baseWord, `${baseWord}s`, `${baseWord}ed`],
                `根據這個文法的要求，這裡應該使用 "${correctWord}" 喔。`, 100));
        }
    }

    // 策略二：詞性與搭配 (Ch 5, 7, 8, 10, 11, 13, 14)
    if (answerStr.includes('spend')) rules.push(createRule('spend', ['cost', 'take', 'pay'], '主詞為人花費時間/金錢，應使用 spend。', 100));
    if (answerStr.includes('cost')) rules.push(createRule('cost', ['spend', 'take', 'pay'], '主詞為物花費金錢，應使用 cost。', 100));

    if (/(make|let|have) .* (to \w+|\w+s|\w+ed)/.test(answerStr)) {
        rules.push(createRule('causative', ['to make', 'makes'], '使役動詞後面接原形動詞。', 100));
    }

    if (concept === 'PREPOSITION' || ['in', 'on', 'at', 'with'].some(p => answerStr.includes(p))) {
        rules.push(createRule('pronoun-case', ['he', 'she', 'they'], '介系詞後面必須接受格代名詞 (him/her/them)。', 90));
    }

    if (['PREPOSITION', 'ARTICLE', 'VERB', 'GERUND'].includes(concept)) {
        rules.push(createRule('general-hint', [''],
            `請特別檢查這裡的「${concept === 'PREPOSITION' ? '介系詞' : concept === 'ARTICLE' ? '冠詞' : '動詞搭配'}」是否正確。`, 50));
    }

    // 策略三：語序與結構 (Ch 1, 4, 15, 17, 18, 19)
    if (concept === 'INVERSION' || ['never', 'hardly', 'not'].includes(correctAnswer[0]?.toLowerCase())) {
        rules.push(createRule('inversion', ['never i', 'hardly i'], '否定副詞置首，助動詞需與主詞倒裝。', 100));
    }

    // 策略四：深層語意與特殊句型 (Ch 16, 20)
    if (concept === 'ADJECTIVE_CLAUSE') {
        if (answerStr.includes('who')) rules.push(createRule('rel-who', ['which', 'that it'], '先行詞為人，關代用 who。', 90));
        if (answerStr.includes('which')) rules.push(createRule('rel-which', ['who', 'that he'], '先行詞為物，關代用 which。', 90));
        if (/(who|which)\s+(he|she|it)/.test(answerStr)) {
            rules.push(createRule('rel-dup', ['who he', 'which it'], '關係子句不需重複代名詞。', 100));
        }
    }

    if (concept === 'SUBJUNCTIVE' || concept === 'CONDITIONALS') {
        if (answerStr.includes('were')) rules.push(createRule('subj-were', ['was'], '與現在事實相反，be 動詞一律用 were。', 100));
        if (answerStr.includes('would')) rules.push(createRule('subj-would', ['will'], '假設語氣結果句要用 would。', 100));
    }

    if (rules.length === 0) {
        rules.push(createRule('fallback', [correctAnswer[0] || ''], `請檢查這個句子的文法結構。`, 50));
    }

    return {
        suggestedConcept: concept,
        suggestedRules: rules,
    };
}