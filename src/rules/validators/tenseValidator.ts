import type { DiagnosticSignal } from '../types';
import nlp from 'compromise';
import { cleanToken } from '../../utils/textUtils';

// 定義常見的助動詞
const AUXILIARIES = new Set([
  'am', 'is', 'are', 'was', 'were', 
  'do', 'does', 'did', 
  'have', 'has', 'had', 
  'will', 'would', 'shall', 'should', 
  'can', 'could', 'may', 'might', 'must'
]);

// 輔助函數：判斷句子中動詞的時態結構
function getTenseStructure(verbPhrase: string, fullSentence: string) {
  const lowerSentence = fullSentence.toLowerCase();
  const lowerVerb = verbPhrase.toLowerCase();
  
  const hasWill = /\bwill\b/i.test(lowerSentence);
  const hasBe = /\b(is|am|are|was|were)\b/i.test(lowerSentence);
  const hasHave = /\b(has|have|had)\b/i.test(lowerSentence);
  const isIng = lowerVerb.endsWith('ing');
  const isEd = lowerVerb.endsWith('ed');
  
  if (hasWill && hasHave && isIng) return '未來完成進行式 (will have been + V-ing)';
  if (hasWill && hasHave) return '未來完成式 (will have + p.p.)';
  if (hasWill && hasBe && isIng) return '未來進行式 (will be + V-ing)';
  if (hasWill) return '未來簡單式 (will + V)';
  
  if (hasHave && hasBe && isIng) return '現在/過去完成進行式 (have/had been + V-ing)';
  if (hasHave) return '現在/過去完成式 (have/has/had + p.p.)';
  if (hasBe && isIng) return '現在/過去進行式 (is/am/are/was/were + V-ing)';
  if (isEd) return '過去簡單式 (V-ed)';
  
  return '現在簡單式 (V / V-s)';
}

export function validateTense(
    studentTokens: string[],
    correctTokens: string[]
): DiagnosticSignal[] {
    const signals: DiagnosticSignal[] = [];
    if (studentTokens.length === 0) return signals;

    const studentStr = studentTokens.join(' ');
    const correctStr = correctTokens.join(' ');
    
    const studentLower = studentTokens.map(cleanToken);
    const correctLower = correctTokens.map(cleanToken);

    // 1. 抓出兩邊的助動詞
    const studentAux = studentLower.filter(t => AUXILIARIES.has(t));
    const correctAux = correctLower.filter(t => AUXILIARIES.has(t));

    // 2. 核心修正：如果正確答案有助動詞，但學生漏掉了
    if (correctAux.length > studentAux.length) {
        const missingAux = correctAux.find(a => !studentAux.includes(a));
        if (missingAux) {
            const expectedStructure = getTenseStructure(correctStr, correctStr);
            
            // 找出學生句子中第一個動詞的位置來標紅
            let errorIndex = studentLower.findIndex(t => !AUXILIARIES.has(t) && nlp(t).verbs().found);
            if (errorIndex === -1) errorIndex = 0;
            
            signals.push({
                code: 'R:VERB:TENSE',
                sst: 'Misformation',
                index: errorIndex,
                message: `這裡的動詞時態不對，少了一個助動詞「${missingAux}」，應該使用「${correctStr}」喔！`,
                hint: `提示：此處應為「${expectedStructure}」。`,
                source: 'local',
            });
            return signals;
        }
    }

    // 3. 如果助動詞數量相同，比對主要動詞的形態 (如 go vs went)
    const timeAdverbsRegex = /(yesterday|today|tomorrow|now|last\s+\w+|next\s+\w+|ago|since|for\s+\d+\s+\w+)/gi;
    const studentWithoutAdverb = studentStr.replace(timeAdverbsRegex, '').trim();
    const correctWithoutAdverb = correctStr.replace(timeAdverbsRegex, '').trim();

    const studentVerbs = nlp(studentWithoutAdverb).verbs().out('array').map((v: string) => v.toLowerCase());
    const correctVerbs = nlp(correctWithoutAdverb).verbs().out('array').map((v: string) => v.toLowerCase());

    if (studentVerbs.join(' ') === correctVerbs.join(' ')) {
        return signals;
    }

    const getLastVerbBase = (verbs: string[]) => {
        if (verbs.length === 0) return '';
        const lastVerb = verbs[verbs.length - 1];
        return (nlp(lastVerb).verbs().toInfinitive().out('text') as any).toLowerCase();
    };

    const studentBase = getLastVerbBase(studentVerbs);
    const correctBase = getLastVerbBase(correctVerbs);

    // 如果核心動詞原形不同，交給 L3 處理
    if (studentBase !== correctBase) {
        return signals;
    }

    const hasPastAdverb = /(yesterday|last\s+\w+|ago)/i.test(studentStr);

    // 只有在「有過去時間副詞」時，才判定為時態錯誤
    if (hasPastAdverb) {
        const correctText = correctVerbs.join(' ');
        
        let errorIndex = -1;
        for (let i = 0; i < studentTokens.length; i++) {
            if (studentTokens[i].toLowerCase() === studentVerbs[0]) {
                errorIndex = i;
                break;
            }
        }
        if (errorIndex === -1) errorIndex = 0;

        const expectedStructure = getTenseStructure(correctText, correctStr);

        signals.push({
            code: 'R:VERB:TENSE',
            sst: 'Misformation',
            index: errorIndex,
            message: `這裡的動詞時態不對，應該使用「${correctText}」喔！`,
            hint: `提示：此處應為「${expectedStructure}」。`,
            source: 'local',
        });
    }

    return signals;
}