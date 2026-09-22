export interface TextPiece { str: string; transform: number[]; width: number; height: number; hasEOL: boolean }
interface Line { text: string; x: number; y: number; right: number; height: number }
// Retain PDF reading order. Geometry distinguishes indentation and inter-paragraph gaps.
export function paragraphLines(items: TextPiece[]): string[] {
  const rows: Line[] = [];
  let current: Line | undefined;
  for (const item of items) {
    if (!item.str.trim()) { if (item.hasEOL) current = undefined; continue; }
    const [x,y] = item.transform.slice(4);
    if (!current || Math.abs(y - current.y) > Math.max(3, item.height * .3)) {
      current = { text: item.str, x, y, right: x + item.width, height: Math.abs(item.height) || 12 }; rows.push(current);
    } else {
      const gap = x - current.right;
      current.text += gap > current.height * .12 && !/\s$/.test(current.text) && !/^\s|^\p{M}/u.test(item.str) ? ' ' + item.str : item.str;
      current.right = x + item.width;
    }
    if (item.hasEOL) current = undefined;
  }
  const gaps = rows.slice(1).map((r,i) => rows[i].y-r.y).filter(gap => gap > 3 && gap < 30).sort((a,b) => a-b);
  const lineGap = gaps[Math.floor(gaps.length / 2)] ?? 14;
  const result: string[] = [];
  rows.forEach((row,i) => {
    const prev = rows[i-1];
    if (prev) {
      const gap = prev.y - row.y;
      const indent = row.x - prev.x;
      const newParagraph = gap < -3 || gap > lineGap * 1.3 || Math.abs(row.height-prev.height) > 2 ||
        (indent > row.height && indent < row.height * 5 && /[.!?…”»]$/.test(prev.text.trim()));
      if (newParagraph) result.push('');
    }
    result.push(row.text.trim());
  });
  return result;
}
