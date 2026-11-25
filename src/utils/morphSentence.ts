/**
 * 手動切詞：把英文句子拆成字塊。
 *
 * 預設以空白切分；但 [...] 方括號內的空白會被保留，
 * 讓老師能自訂變形範圍（例如 "to [school tomorrow]" 會被視為一個字塊）。
 */

export function splitGrammarSentenceManually(source: string): string[] {
  const words: string[] = [];
  let current = '';
  let depth = 0;
  for (const ch of source) {
    if (ch === '[') {
      depth++;
      current += ch;
    } else if (ch === ']') {
      depth = Math.max(0, depth - 1);
      current += ch;
    } else if (/\s/.test(ch) && depth === 0) {
      if (current.trim()) words.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) words.push(current.trim());
  return words;
}
