import type { DiagnosticSignal } from '../types';
import nlp from 'compromise';
import { cleanToken } from '../../utils/textUtils';

export function validateTense(
    studentTokens: string[],
    correctTokens: string[]
): DiagnosticSignal[] {
    const signals: DiagnosticSignal[] = [];
    if (studentTokens.length === 0) return signals;

    const studentStr = studentTokens.join(' ');
    const correctStr = correctTokens.join(' ');
    const studentDoc = nlp(studentStr);
    const correctDoc = nlp(correctStr);

    // 1. 檢查是否有過去時間副詞
    const hasPastAdverb = studentDoc.match('(yesterday|last (week|month|year)|ago)').found;

    if (hasPastAdverb) {
        const studentVerb = studentDoc.verbs().first();
        const correctVerb = correctDoc.verbs().first();

        if (studentVerb.found && correctVerb.found) {
            // 修正：使用 as any 繞過型別檢查
            const studentBase = (studentVerb as any).toInfinitive().out('text').toLowerCase();
            const correctBase = (correctVerb as any).toInfinitive().out('text').toLowerCase();

            if (studentBase === correctBase) {
                const studentText = studentVerb.out('text').toLowerCase();
                const correctText = correctVerb.out('text').toLowerCase();

                // 取得該動詞的過去式
                const pastForm = nlp(studentBase).verbs().toPastTense().out('text').toLowerCase();

                // 如果學生沒有用過去式，且正確答案是過去式
                if (studentText !== correctText && pastForm === correctText) {
                    const index = studentTokens.findIndex(t => cleanToken(t).toLowerCase() === studentText);
                    signals.push({
                        code: 'R:VERB:TENSE',
                        sst: 'Misformation',
                        index,
                        message: `句子有過去時間副詞，動詞「${studentText}」應該改成過去式「${correctText}」喔！`,
                        hint: `請把動詞改成過去式。`,
                        source: 'local',
                    });
                }
            }
        }
    }

    return signals;
}