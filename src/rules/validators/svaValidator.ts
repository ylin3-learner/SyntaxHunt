import type { DiagnosticSignal } from '../types';
import { cleanToken } from '../../utils/textUtils';
import irregularVerbs from 'english-verbs-irregular/resources/irregularVerbs.json';

// 建立不規則動詞的 O(1) 查詢表
const irregularMap = new Map<string, string>();
Object.entries(irregularVerbs as Record<string, string[][]>).forEach(([infinitive, forms]) => {
  // forms[0] 通常包含過去式與過去分詞，但我們需要的是第三人稱單數
  // 所以我們自己用規則推導不規則動詞的現在式 (除了 be/have/do 等特例)
  const lower = infinitive.toLowerCase();
  if (lower === 'be') irregularMap.set('be', 'is');
  else if (lower === 'have') irregularMap.set('have', 'has');
  else if (lower === 'do') irregularMap.set('do', 'does');
  else if (lower === 'go') irregularMap.set('go', 'goes');
  else if (lower === 'say') irregularMap.set('say', 'says');
  else {
    // 其他不規則動詞的現在式通常還是規則變化
    irregularMap.set(lower, getRuleBasedThirdPerson(lower));
  }
});

// 規則推導第三人稱單數 (處理 +s, +es, +ies)
function getRuleBasedThirdPerson(verb: string): string {
  if (/(s|sh|ch|x|z|o)$/.test(verb)) return `${verb}es`;
  if (/[^aeiou]y$/.test(verb)) return `${verb.slice(0, -1)}ies`;
  return `${verb}s`;
}

// 取得動詞的正確第三人稱單數
function getThirdPersonSingular(verb: string): string {
  const lower = verb.toLowerCase();
  if (irregularMap.has(lower)) return irregularMap.get(lower)!;
  return getRuleBasedThirdPerson(lower);
}

export function validateSVA(
    studentTokens: string[],
    correctTokens: string[]
): DiagnosticSignal[] {
    const signals: DiagnosticSignal[] = [];
    if (studentTokens.length === 0) return signals;

    const studentStr = studentTokens.map(cleanToken).join(' ').toLowerCase();
    const correctStr = correctTokens.map(cleanToken).join(' ').toLowerCase();

    // 1. 檢查第三人稱單數主詞後面的動詞
    const thirdPersonMatch = studentStr.match(/\b(he|she|it)\s+([a-z]+)/i);
    if (thirdPersonMatch) {
        const subject = thirdPersonMatch[1].toLowerCase();
        const verb = thirdPersonMatch[2].toLowerCase();
        
        // 如果動詞是某個字的原形（即不在不規則表的第三人稱單數清單中）
        const expectedThirdPerson = getThirdPersonSingular(verb);
        
        // 如果學生的動詞等於原形，且正確答案包含了第三人稱單數形式
        if (correctStr.includes(expectedThirdPerson) && !studentStr.includes(expectedThirdPerson)) {
            const index = studentTokens.findIndex(t => cleanToken(t).toLowerCase() === verb);
            signals.push({
                code: 'R:VERB:SVA',
                sst: 'Misformation',
                index,
                message: `主詞「${subject}」是第三人稱單數，動詞應該用「${expectedThirdPerson}」喔！`,
                hint: `請檢查動詞是否漏加了 s/es。`,
                source: 'local',
            });
        }
    }

    // 2. 檢查 Be 動詞 (he/she/it + am)
    if (/\b(he|she|it)\s+am\b/i.test(studentStr)) {
        const index = studentTokens.findIndex(t => cleanToken(t).toLowerCase() === 'am');
        signals.push({
            code: 'R:VERB:SVA',
            sst: 'Misformation',
            index,
            message: '「he/she/it」不能搭配「am」喔！',
            hint: '請改成 is 或 was。',
            source: 'local',
        });
    }

    // 3. 檢查 have 與 has 的錯誤
    if (/\b(he|she|it)\s+have\b/i.test(studentStr)) {
        const index = studentTokens.findIndex(t => cleanToken(t).toLowerCase() === 'have');
        signals.push({
            code: 'R:VERB:SVA',
            sst: 'Misformation',
            index,
            message: '「he/she/it」必須搭配「has」。',
            hint: '請把 have 改成 has。',
            source: 'local',
        });
    }

    return signals;
}