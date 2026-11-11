import type { DiagnosticSignal } from '../types';
import nlp from 'compromise'; // 預設匯入寫法
import { cleanToken } from '../../utils/textUtils';

export function validateSVA(
    studentTokens: string[],
    correctTokens: string[]
): DiagnosticSignal[] {
    const signals: DiagnosticSignal[] = [];
    if (studentTokens.length === 0) return signals;

    const studentDoc = nlp(studentTokens.join(' '));
    const correctDoc = nlp(correctTokens.join(' '));

    // 尋找第三人稱單數主詞
    const hasThirdPerson = studentDoc.match('(he|she|it|the [a-z]+)').found;
    if (!hasThirdPerson) return signals;

    // 取得學生與正確答案的第一個動詞
    const studentVerb = studentDoc.verbs().first();
    const correctVerb = correctDoc.verbs().first();

    if (studentVerb.found && correctVerb.found) {
        // 修正：使用 as any 繞過型別檢查
        const studentBase = (studentVerb as any).toInfinitive().out('text').toLowerCase();
        const correctBase = (correctVerb as any).toInfinitive().out('text').toLowerCase();

        // 如果兩者原形一樣，但學生的形式不等於正確答案（代表漏加 s/es）
        if (studentBase === correctBase) {
            const studentText = studentVerb.out('text').toLowerCase();
            const correctText = correctVerb.out('text').toLowerCase();

            // 修正：將 conjugate 的結果轉型為 Record
            const conjugations = nlp(studentBase).verbs().conjugate()[0] as Record<string, string>;
            const thirdPersonForm = conjugations?.PresentTense?.toLowerCase();

            if (studentText !== correctText && thirdPersonForm === correctText) {
                const index = studentTokens.findIndex(t => cleanToken(t).toLowerCase() === studentText);
                signals.push({
                    code: 'R:VERB:SVA',
                    sst: 'Misformation',
                    index,
                    message: `主詞是第三人稱單數，動詞應該用「${correctText}」喔！`,
                    hint: `請檢查動詞是否漏加了 s/es。`,
                    source: 'local',
                });
            }
        }
    }

    // 檢查 Be 動詞 (am/is/are)
    const beMatch = studentDoc.match('(he|she|it) am').found;
    if (beMatch) {
        const index = studentTokens.findIndex(t => t.toLowerCase() === 'am');
        signals.push({
            code: 'R:VERB:SVA',
            sst: 'Misformation',
            index,
            message: '「he/she/it」不能搭配「am」喔！',
            hint: '請改成 is 或 was。',
            source: 'local',
        });
    }

    return signals;
}