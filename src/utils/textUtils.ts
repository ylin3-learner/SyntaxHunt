export function cleanToken(token: string): string {
  return token
    .replace(/[\[\]]/g, '')
    .trim()
    .toLowerCase()
    .replace(/^[.,!?;:]+|[.,!?;:]+$/g, '');
}

export function normalizeAnswer(tokens: string[] | string): string {
  const parts = typeof tokens === 'string' ? tokens.split(/\s+/) : tokens;
  return parts.map(cleanToken).filter(Boolean).join(' ');
}

export function mapOffsetToChunkIndex(
  text: string,
  offset: number,
  length: number,
  chunks?: string[]
): number {
  if (!Number.isFinite(offset) || !Number.isFinite(length) || offset < 0 || length < 0) return -1;

  const spans: Array<{ start: number; end: number }> = [];
  if (chunks) {
    let cursor = 0;
    chunks.forEach((chunk, index) => {
      const visibleText = chunk.replace(/[\[\]]/g, '');
      const start = cursor;
      const end = start + visibleText.length;
      spans.push({ start, end });
      cursor = end + (index < chunks.length - 1 ? 1 : 0);
    });
  } else {
    const words = /\S+/g;
    let match: RegExpExecArray | null;
    while ((match = words.exec(text)) !== null) {
      spans.push({ start: match.index, end: match.index + match[0].length });
    }
  }

  const endOffset = offset + length;
  return spans.findIndex(({ start, end }) =>
    length === 0 ? offset >= start && offset <= end : offset < end && endOffset > start
  );
}
