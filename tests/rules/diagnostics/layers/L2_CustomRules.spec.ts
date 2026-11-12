import { describe, it, expect } from 'vitest';
import { L2CustomRules } from '@/rules/diagnostics/layers/L2_CustomRules';
import type { DiagnosticContext, GrammarConcept } from '@/rules/types';

describe('L2 Custom Rules Layer (Teacher-Defined Feedback)', () => {
    const createCtx = (
        studentTokens: string[],
        correctTokens: string[],
        concept: GrammarConcept,
        customRules: any[]
    ): DiagnosticContext => ({
        studentTokens,
        correctTokens,
        question: {
            id: 'q-test',
            type: 'grammar',
            concept,
            customRules,
            targetNoun: 'test',
            antecedent: { noun: 'test', number: 'singular', person: 'thing' },
            chunks: [],
            correctAnswer: correctTokens,
            ui_mode: 'BUILD'
        } as any
    });

    describe('1. Foundation: Subject-Verb Agreement (SVA)', () => {
        it('should trigger custom rule when student forgets the 3rd person singular -s', async () => {
            const ctx = createCtx(
                ['He', 'go', 'to', 'school'],
                ['He', 'goes', 'to', 'school'],
                'SUBJECT_VERB_AGREEMENT',
                [{
                    id: 'sva-rule',
                    wrongPattern: ['He go', 'She go', 'It go'],
                    message: '主詞是第三人稱單數，動詞記得加 s 喔！',
                    priority: 100
                }]
            );

            const signals = await L2CustomRules.diagnose(ctx);
            expect(signals.length).toBe(1);
            expect(signals[0].code).toBe('CUSTOM:sva-rule');
            expect(signals[0].message).toContain('動詞記得加 s');
        });
    });

    describe('2. Tenses: Past Tense Irregular Verbs', () => {
        it('should trigger custom rule for irregular verb mistakes', async () => {
            const ctx = createCtx(
                ['I', 'eat', 'an', 'apple', 'yesterday'],
                ['I', 'ate', 'an', 'apple', 'yesterday'],
                'PAST_TENSE',
                [{
                    id: 'irregular-verb',
                    wrongPattern: ['eat', 'eated'],
                    message: 'eat 的過去式是不規則變化，要變成 ate 喔！',
                    priority: 100
                }]
            );

            const signals = await L2CustomRules.diagnose(ctx);
            expect(signals.length).toBe(1);
            expect(signals[0].code).toBe('CUSTOM:irregular-verb');
            expect(signals[0].message).toContain('不規則變化');
        });
    });

    describe('3. Clauses: Duplicate Pronouns in Relative Clauses', () => {
        it('should trigger custom rule when student leaves a redundant pronoun', async () => {
            const ctx = createCtx(
                ['The', 'man', 'who', 'he', 'came'],
                ['The', 'man', 'who', 'came'],
                'ADJECTIVE_CLAUSE',
                [{
                    id: 'dup-pronoun',
                    wrongPattern: ['who he', 'which it'],
                    message: '關係代名詞已經代替了前面的名詞，這裡不需要再加 he 喔！',
                    priority: 100
                }]
            );

            const signals = await L2CustomRules.diagnose(ctx);
            expect(signals.length).toBe(1);
            expect(signals[0].code).toBe('CUSTOM:dup-pronoun');
        });
    });

    describe('4. Advanced: Inversion', () => {
        it('should trigger custom rule when student fails to invert after negative adverb', async () => {
            const ctx = createCtx(
                ['Never', 'I', 'have', 'seen'],
                ['Never', 'have', 'I', 'seen'],
                'INVERSION',
                [{
                    id: 'inversion-rule',
                    wrongPattern: ['Never I have', 'Never I'],
                    message: '否定副詞 (Never) 放在句首時，助動詞要和主詞倒裝喔！',
                    priority: 100
                }]
            );

            const signals = await L2CustomRules.diagnose(ctx);
            expect(signals.length).toBe(1);
            expect(signals[0].code).toBe('CUSTOM:inversion-rule');
        });
    });

    describe('5. Advanced: Subjunctive Mood', () => {
        it('should trigger custom rule when student uses "was" instead of "were" in an unreal condition', async () => {
            const ctx = createCtx(
                ['If', 'I', 'was', 'a', 'bird'],
                ['If', 'I', 'were', 'a', 'bird'],
                'SUBJUNCTIVE',
                [{
                    id: 'subjunctive-rule',
                    wrongPattern: ['If I was', 'If he was', 'If she was'],
                    message: '與現在事實相反的假設語氣，be 動詞一律使用 were 喔！',
                    priority: 100
                }]
            );

            const signals = await L2CustomRules.diagnose(ctx);
            expect(signals.length).toBe(1);
            expect(signals[0].code).toBe('CUSTOM:subjunctive-rule');
            expect(signals[0].message).toContain('一律使用 were');
        });
    });

    describe('Rule Prioritization and Concept Filtering', () => {
        it('should sort rules by priority (highest first) when multiple rules match', async () => {
            const ctx = createCtx(['He', 'go', 'to', 'school'], ['He', 'goes', 'to', 'school'], 'SUBJECT_VERB_AGREEMENT', [
                { id: 'low-priority', wrongPattern: ['go'], message: 'Low priority message', priority: 10 },
                { id: 'high-priority', wrongPattern: ['He go'], message: 'High priority message', priority: 99 }
            ]);
            const signals = await L2CustomRules.diagnose(ctx);
            expect(signals.length).toBe(2);
            expect(signals[0].code).toBe('CUSTOM:high-priority');
            expect(signals[1].code).toBe('CUSTOM:low-priority');
        });

        it('should NOT trigger if the question concept does not match the rule concept filter', async () => {
            const ctx = createCtx(['He', 'go', 'to', 'school'], ['He', 'goes', 'to', 'school'], 'PAST_TENSE', [
                { id: 'sva-rule', wrongPattern: ['go'], concepts: ['SUBJECT_VERB_AGREEMENT'], message: 'SVA message', priority: 100 }
            ]);
            const signals = await L2CustomRules.diagnose(ctx);
            expect(signals.length).toBe(0);
        });

        it('should NOT trigger false positives for partial words (RegExp boundaries)', async () => {
            const ctx = createCtx(['I', 'am', 'going', 'home'], ['I', 'go', 'home'], 'TENSE_ASPECT', [
                { id: 'naive-rule', wrongPattern: ['go'], message: 'This should NOT trigger.', priority: 100 }
            ]);
            const signals = await L2CustomRules.diagnose(ctx);
            expect(signals.length).toBe(0);
        });
    });
});