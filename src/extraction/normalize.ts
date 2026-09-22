import type { Block } from '../types';
export interface PageLines { page: number; label: string; lines: string[] }
export function normalizeText(text: string) {
  return text.normalize('NFC').replace(/\u00ad/g, '').replace(/([\p{L}])[-‐]\s*\n\s*([\p{Ll}])/gu, '$1$2').replace(/[^\S\n]+/g, ' ').trim();
}
export function cleanPages(pages: PageLines[]): Block[] {
  const seen = new Map<string, Set<number>>();
  const key = (s: string) => s.trim().replace(/\d+/g, '#');
  for (const p of pages) for (const s of [...p.lines.slice(0, 2), ...p.lines.slice(-2)]) {
    if (s.length > 100 || !s.trim()) continue;
    const k = key(s); const set = seen.get(k) ?? new Set<number>(); set.add(p.page); seen.set(k, set);
  }
  const repeated = new Set([...seen].filter(([, set]) => set.size >= Math.max(3, Math.ceil(pages.length * .5))).map(([k]) => k));
  const blocks: Block[] = [];
  for (const p of pages) {
    const lines = p.lines.filter((s, i) => {
      const margin = i < 2 || i >= p.lines.length - 2;
      return !(margin && (repeated.has(key(s)) || /^\s*\d{1,5}\s*$/.test(s)));
    });
    const paragraphs = normalizeText(lines.join('\n')).split(/\n\s*\n/).map(s => s.replace(/\n/g, ' ').trim()).filter(Boolean);
    for (const [i, text] of paragraphs.entries()) {
      const prev = blocks.at(-1);
      // Only join an explicit hyphen continuation across adjacent pages.
      if (i === 0 && prev && prev.endPage === p.page - 1 && /[\p{L}][-‐]$/u.test(prev.text) && /^\p{Ll}/u.test(text)) {
        prev.text = prev.text.slice(0, -1) + text; prev.endPage = p.page;
      } else blocks.push({ id: `p${p.page}-b${i}`, text, page: p.page, pageLabel: p.label, endPage: p.page });
    }
  }
  return blocks;
}
export function splitForSpeech(text: string, maxLength = 230): string[] {
  const sentences = Array.from(new Intl.Segmenter('es', { granularity: 'sentence' }).segment(text), s => s.segment.trim());
  const chunks: string[] = []; let current = '';
  for (const sentence of sentences) {
    if (current && current.length + sentence.length + 1 > maxLength) { chunks.push(current); current = ''; }
    for (const word of sentence.split(/\s+/)) {
    if (current && current.length + word.length + 1 > maxLength) { chunks.push(current); current = ''; }
    // A pathological URL/word must never silently truncate a model input.
    if (word.length > maxLength) { if (current) chunks.push(current); current = ''; for (let i = 0; i < word.length; i += maxLength) chunks.push(word.slice(i, i + maxLength)); }
    else current += (current ? ' ' : '') + word;
    }
  }
  if (current) chunks.push(current); return chunks;
}
