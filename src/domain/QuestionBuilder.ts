import type { CanvasMode, Chunk, GrammarConcept, QuestionData, UIMode, CustomGrammarRule, TeachingStage } from '../rules/types';
import { autoChunk } from '../rules/autoChunk';
import { getGrammarTopic } from '../rules/grammarTopics';

export interface FormPayload {
    questionType: 'standard' | 'contrast' | 'chunk' | 'grammar';
    questionMode: 'build' | 'reduce';
    unitName: string;
    grammarSentence: string;
    grammarAnswer: string;
    grammarChunks: Chunk[];
    grammarConcept: GrammarConcept;

    selectedChapter: number;
    uiMode: UIMode;

    customRules?: CustomGrammarRule[];

    selectedCanvasMode: CanvasMode;
    selectedGrammarTopicId: string;
    editingGrammarTopicId?: string;
    targetNoun: string;
    antecedentNumber: 'singular' | 'plural';
    antecedentPerson: 'person' | 'thing';
    imageUrl: string;
    tagsInput: string;
    speechRate: number;
    isTimedForm: boolean;
    timeLimitForm: number;
    explanationTitle: string;
    explanationDesc: string;
    statusGap: number;
    npcLabel: string;
    matrixXInput: string;
    matrixYInput: string;
    matrixCorrectX: number;
    matrixCorrectY: number;
    matrixPrompt: string;
    matrixAnswer: string;
    matrixOptionsInput: string;
    relativeSentence: string;
    prepositionSentence: string;
    distractorsInput: string;
    chineseSentence: string;
    chineseHighlight: string;
    modifierImageUrl: string;
    puzzleLayout: 'modifier-left' | 'modifier-right';
    clozePrefix: string;
    clozeSuffix: string;
    correctLabel: string;
    distractorLabel: string;
    distractorImageUrl: string;
    chunkZhInput: string;
    chunkQuizInput: string;
    enabledStages: TeachingStage[];
    editingId: string | null;
}

const getCanvasUIMode = (mode: CanvasMode): UIMode => {
    if (mode === 'REDUCE') return 'REDUCE';
    if (mode === 'MORPH' || mode === 'GRAVITY_SWITCH') return 'MORPH';
    return 'BUILD';
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

export const buildQuestion = (form: FormPayload): { question?: QuestionData; errors: string[] } => {
    const errors: string[] = [];

    // 1. 文法題專屬驗證與組裝
    if (form.questionType === 'grammar') {
        const source = form.grammarSentence.trim();
        const answer = (form.grammarAnswer || source).trim();
        if (!source || !answer) errors.push('請填寫題目句子與正確答案。');

        if (form.selectedCanvasMode === 'PRAGMATIC_HP' && (!Number.isInteger(form.statusGap) || form.statusGap < 0 || form.statusGap > 5)) {
            errors.push('語情題的地位差距請設定為 0 到 5 的整數。');
        }

        const matrixX = form.matrixXInput.split(/[,，]/).map(v => v.trim()).filter(Boolean);
        const matrixY = form.matrixYInput.split(/[,，]/).map(v => v.trim()).filter(Boolean);
        const matrixOptions = form.matrixOptionsInput.split(/[,，]/).map(v => v.trim()).filter(Boolean);

        if (form.selectedCanvasMode === 'MATRIX_GATE' && (
            matrixX.length !== 2 || matrixY.length !== 2 || !form.matrixPrompt.trim() || !form.matrixAnswer.trim() ||
            !matrixOptions.some(o => o.toLowerCase() === form.matrixAnswer.trim().toLowerCase()) ||
            !answer.split(/\s+/).some(t => t.replace(/[.,!?;:]+$/, '').toLowerCase() === form.matrixAnswer.trim().toLowerCase()) ||
            ![0, 1].includes(form.matrixCorrectX) || ![0, 1].includes(form.matrixCorrectY)
        )) {
            errors.push('特徵矩陣需設定兩組各兩個選項、題目提示句、正確動詞；動詞需同時出現在答案與選項字卡中。');
        }

        const selectedTopic = getGrammarTopic(form.selectedGrammarTopicId);
        const chunks = form.grammarChunks.length > 0
            ? form.grammarChunks
            : autoChunk(source, form.grammarConcept).map((c, i) => ({ ...c, id: `${form.editingId || 'new'}-chunk-${i}` }));

        if (['MORPH', 'GRAVITY_SWITCH'].includes(form.selectedCanvasMode)) {
            const morphTargets = chunks.filter(c => c.can_morph && new Set(c.options ?? c.morph_options ?? []).size > 1);
            const allowsMultiple = form.selectedCanvasMode === 'GRAVITY_SWITCH';
            if (morphTargets.length === 0 || (!allowsMultiple && morphTargets.length !== 1)) {
                errors.push(allowsMultiple ? '假設語氣至少需要一個可變形字塊；每個字塊需提供至少兩種形式。' : '此考點一次只練一個變形目標。');
            }
        }

        if (errors.length > 0) return { errors };

        const question: QuestionData = {
            id: form.editingId || `q_${Date.now()}`,
            type: 'grammar',
            unit: form.unitName.trim() || undefined,
            grammarTopicId: selectedTopic?.id ?? form.editingGrammarTopicId,
            canvas_mode: form.selectedCanvasMode,
            ui_mode: getCanvasUIMode(form.selectedCanvasMode),
            concept: selectedTopic?.concept ?? form.grammarConcept,
            targetNoun: form.targetNoun.trim() || source.split(/\s+/)[0],
            antecedent: { noun: form.targetNoun.trim() || source.split(/\s+/)[0], number: form.antecedentNumber, person: form.antecedentPerson },
            chunks,
            correctAnswer: answer.split(/\s+/).filter(Boolean),
            enabledStages: ['micro'],
            imageUrl: form.imageUrl || undefined,
            tags: form.tagsInput.split(/[,，\s]+/).filter(Boolean),
            speechRate: form.speechRate,
            isTimed: form.isTimedForm,
            timeLimit: form.isTimedForm ? form.timeLimitForm : undefined,
            explanation: form.explanationTitle || form.explanationDesc ? { title: form.explanationTitle, desc: form.explanationDesc } : undefined,
            customRules: form.customRules,
            ...(form.selectedCanvasMode === 'PRAGMATIC_HP' ? { pragmatic_target: { statusGap: form.statusGap, npcLabel: form.npcLabel.trim() || undefined } } : {}),
            ...(form.selectedCanvasMode === 'MATRIX_GATE' ? {
                matrix_config: {
                    xOptions: [matrixX[0]!, matrixX[1]!] as [string, string],
                    yOptions: [matrixY[0]!, matrixY[1]!] as [string, string],
                    correctX: form.matrixCorrectX === 0 ? 0 as const : 1 as const,
                    correctY: form.matrixCorrectY === 0 ? 0 as const : 1 as const,
                    prompt: form.matrixPrompt.trim(),
                    answer: form.matrixAnswer.trim(),
                    options: matrixOptions,
                }
            } : {}),
        };
        return { question, errors };
    }

    // 2. 舊版題型驗證與組裝
    if (!form.targetNoun) errors.push('請填寫目標名詞！');
    if (form.questionType !== 'chunk' && !form.relativeSentence) errors.push('請填寫關係子句！');
    if (!form.imageUrl || form.imageUrl.includes('dicebear.com')) errors.push('請務必上傳真實的「主要圖片」！');
    if (form.questionMode === 'reduce' && !form.prepositionSentence) errors.push('請在漏斗中填寫簡化後的片語！');

    if (errors.length > 0) return { errors };

    const relCorrect = generateTiles(form.relativeSentence || '');
    let distractors = form.distractorsInput.split(/[,，\s]+/).filter(Boolean);
    if (distractors.length === 0 && form.questionType !== 'chunk') {
        const correctWords = relCorrect.map(w => w.replace(/[\[\]]/g, '').toLowerCase());
        if (correctWords.includes('who') || correctWords.includes('which')) distractors.push('she', 'it');
        if (correctWords.includes('wears') || correctWords.includes('has')) distractors.push('wear', 'have');
        distractors = [...new Set(distractors)].filter(d => !correctWords.includes(d.toLowerCase()));
    }
    let finalTiles = [...relCorrect, ...distractors];
    finalTiles = [...new Set(finalTiles)].sort(() => Math.random() - 0.5);
    const prepTiles = generateTiles(form.prepositionSentence || '');
    const prepCorrect = [...prepTiles];
    prepTiles.sort(() => Math.random() - 0.5);

    const newQuestion: QuestionData = {
        id: form.editingId || `q_${Date.now()}`,
        unit: form.unitName.trim() || undefined,
        type: form.questionType,
        mode: form.questionMode,
        enabledStages: form.enabledStages,
        targetNoun: form.targetNoun,
        antecedent: { noun: form.targetNoun, number: form.antecedentNumber, person: form.antecedentPerson },
        imageUrl: form.imageUrl,
        tags: form.tagsInput.split(/[,，\s]+/).filter(Boolean),
        speechRate: form.speechRate,
        isTimed: form.isTimedForm,
        timeLimit: form.isTimedForm ? form.timeLimitForm : undefined,
        grammarFeature: {
            relative: { label: form.relativeSentence || '', tiles: finalTiles, correctAnswer: relCorrect, distractors },
            preposition: { label: form.prepositionSentence || '', tiles: prepTiles, correctAnswer: prepCorrect }
        },
        explanation: { title: form.explanationTitle, desc: form.explanationDesc },
    };

    if (form.questionType === 'standard') {
        const prefix = form.clozePrefix || form.targetNoun;
        const suffix = form.clozeSuffix || 'is my favorite.';
        const audioText = `${prefix} ${form.relativeSentence.replace(/[\[\]]/g, '')} ${suffix}`.replace(/\s+/g, ' ').trim();
        newQuestion.inputData = {
            audioText,
            options: [
                { image: form.imageUrl, text: form.correctLabel || '', isCorrect: true },
                { image: form.distractorImageUrl || '', text: form.distractorLabel || '', isCorrect: false }
            ]
        };
        newQuestion.noticingData = {
            examples: [audioText],
            question: `請觀察以上句子，關係代名詞 who 代替的是什麼？`,
            options: [{ text: '事物（Things）', isCorrect: false }, { text: '人（People）', isCorrect: true }],
            explanation: `沒錯！當先行詞是「人」的時候，我們使用 who 來引導關係子句。`
        };
        if (form.clozePrefix || form.clozeSuffix) newQuestion.contextCloze = { prefix: form.clozePrefix, suffix: form.clozeSuffix };

        // 建立混合字磚陣列
        const finalChunks: any[] = [];

        // 1. 原句字磚 (可移除)
        relCorrect.forEach((text, i) => {
            finalChunks.push({
                id: `${newQuestion.id}-rel-${i}`,
                text,
                draggable: true,
                isTargetKeep: false
            });
        });

        // 2. 目標保留片語 (不可移除)
        if (form.prepositionSentence) {
            const prepTiles = generateTiles(form.prepositionSentence);
            prepTiles.forEach((text, i) => {
                finalChunks.push({
                    id: `${newQuestion.id}-prep-${i}`,
                    text,
                    draggable: false,
                    isTargetKeep: true
                });
            });
        }

        // 3. 干擾磚 (可移除，僅在 BUILD 模式加入，避免破壞 REDUCE 的減法邏輯)
        if (form.questionMode === 'build') {
            distractors.forEach((text, i) => {
                finalChunks.push({
                    id: `${newQuestion.id}-dist-${i}`,
                    text,
                    draggable: true,
                    isTargetKeep: false
                });
            });
        }

        // 決定正確答案
        let correctTokens: string[] = [];
        if (form.questionMode === 'reduce' && form.prepositionSentence) {
            // Reduce 正確答案 = 原本的主詞 + 保留的簡化片語 + 剩下的句子
            const prepTiles = generateTiles(form.prepositionSentence).map(t => t.replace(/[\[\]]/g, ''));

            // 如果這題是克漏字，正確答案只需包含「中間的簡化句」
            if (form.clozePrefix || form.clozeSuffix) {
                correctTokens = [...prepTiles];
            } else {
                // 否則正確答案是完整句子
                correctTokens = [...prepTiles]; // 這裡視你的架構而定，如果 chunks 只包含相對子句，那只需比對 prepTiles
            }
        } else {
            const buildAnswer = (form.grammarAnswer || form.relativeSentence || '').trim();
            correctTokens = buildAnswer.split(/\s+/).filter(Boolean).map(t => t.replace(/[\[\]]/g, ''));
        }

        console.log('🚨 [Trace-QuestionBuilder] 模式:', form.questionMode);
        console.log('🚨 [Trace-QuestionBuilder] 句型A:', form.relativeSentence);
        console.log('🚨 [Trace-QuestionBuilder] 綠色框(簡化句):', form.prepositionSentence);
        console.log('🚨 [Trace-QuestionBuilder] 最終 chunks:', finalChunks);

        if (finalChunks.length > 0) {
            newQuestion.chunks = finalChunks;
            newQuestion.correctAnswer = correctTokens;
            newQuestion.ui_mode = form.questionMode === 'reduce' ? 'REDUCE' : 'BUILD';
            newQuestion.canvas_mode = newQuestion.ui_mode;
        }
    }

    if (form.questionType === 'contrast') {
        newQuestion.contrastData = { chineseSentence: form.chineseSentence || '中文句子', chineseHighlight: form.chineseHighlight || '高亮部分', nounImage: form.imageUrl, modifierImage: form.modifierImageUrl || '', layout: form.puzzleLayout };
    }

    if (form.questionType === 'chunk' || (form.chunkZhInput && form.questionType === 'standard')) {
        const chunkMatch = form.relativeSentence.match(/\[([^\]]+)\]/);
        const chunkText = chunkMatch ? chunkMatch[1] : form.relativeSentence;
        let quizOpts = form.chunkQuizInput.split(/[,，]/).map(s => s.trim()).filter(Boolean);
        if (quizOpts.length === 0) quizOpts = ['look for it', 'look at it'];
        newQuestion.previewData = { targetImage: form.imageUrl, targetNoun: form.targetNoun, chunkText, chunkZh: form.chunkZhInput || '（請填寫中文意思）', quizOptions: [{ text: chunkText, isCorrect: true }, ...quizOpts.map(t => ({ text: t, isCorrect: false }))].sort(() => Math.random() - 0.5) };
    }

    return { question: newQuestion, errors };
};