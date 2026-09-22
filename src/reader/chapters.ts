import type { Block, Book, Chapter } from '../types';
export const STRUCTURE_VERSION = 1;
export interface OutlineTarget { title: string; page: number; level: number }
const key = (text: string) => text.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('es').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function chapterKind(title: string): Chapter['kind'] {
  const t = key(title);
  if (/^(indice|contenido|contenidos|tabla de contenidos?)$/.test(t)) return 'toc';
  if (/^(bibliografia|referencias|referencias bibliograficas|obras citadas)$/.test(t)) return 'bibliography';
  return 'content';
}
export function markNoise(blocks: Block[]): Block[] {
  const perPage = new Map<number, number[]>();
  blocks.forEach((b,i) => { const page = perPage.get(b.page) ?? []; page.push(i); perPage.set(b.page,page); });
  const margins = new Set<number>(); const occurrences = new Map<string,Set<number>>();
  for (const [page,indices] of perPage) {
    for (const index of new Set([...indices.slice(0,2),...indices.slice(-2)])) {
      margins.add(index); const text = blocks[index].text;
      if (text.length > 200 || text.length < 5 || /^(cap[iÃ­]tulo|parte|secci[oÃ³]n)\b/i.test(text)) continue;
      const k = key(text); const pages = occurrences.get(k) ?? new Set<number>(); pages.add(page); occurrences.set(k,pages);
    }
  }
  const threshold = Math.max(3,Math.ceil(perPage.size*.5));
  return blocks.map((b,i) => {
    const pageNumber = /^\d{1,5}$/.test(b.text.trim()) && (b.text.trim() === b.pageLabel || b.text.trim() === String(b.page));
    const repeated = (occurrences.get(key(b.text))?.size ?? 0) >= threshold;
    return {...b,kind: margins.has(i) && (pageNumber || repeated) ? 'noise' : 'body'};
  });
}
function isHeading(block: Block, i: number, blocks: Block[]) {
  const text = block.text.trim();
  const normalized = key(text);
  if (block.kind === 'noise') return false;
  if (text.length > 150 || (text.length < 3 && !/^(?:[ivxlcdm]+|\d{1,2})[.)-]?$/.test(normalized)) || /\.{2,}|\s\d+\s*$/.test(text)) return false;
  if (/^(prologo|prefacio|introduccion|epilogo|conclusion|conclusiones)$/.test(normalized)) return true;
  if (/^(capitulo|parte|seccion)\s+(\d+|[ivxlcdm]+|primero|segundo|tercero|cuarto|quinto)(?:\b|\s|[.:?-])/.test(normalized)) return true;
  if (chapterKind(text) !== 'content') return true;
  if (/^(pr[oÃ³]logo|prefacio|introducci[oÃ³]n|ep[iÃ­]logo|conclusi[oÃ³]n|conclusiones)$/i.test(text)) return true;
  if (/^(cap[iÃ­]tulo|parte|secci[oÃ³]n)\s+(\d+|[ivxlcdm]+|primero|segundo|tercero|cuarto|quinto)(?:\b|\s|[.:â€”-])/i.test(text)) return true;
  if (/^(?:[ivxlcdm]+|\d{1,2})[.)-]?$/.test(key(text))) return true;
  const letters = text.replace(/[^\p{L}]/gu,'');
  // Short uppercase titles near a page start, followed by prose; never infer from a whole paragraph.
  const pageStart = blocks.slice(0,i).filter(b => b.page === block.page && b.kind !== 'noise').length < 3;
  if (letters.length >= 8 && letters === letters.toUpperCase() && !/[.!?]$/.test(text) && pageStart && (blocks[i+1]?.text.length ?? 0) > 150) return true;
  const words = text.split(/\s+/).filter(Boolean);
  const titleCase = words.length >= 2 && words.length <= 12 && text.length <= 90 && /^[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]*(?:\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]*|\s+(?:de|del|la|el|los|las|y|a|en|du|des|le|les|et))+$/.test(text);
  return titleCase && !/[.!?]$/.test(text) && pageStart && (blocks[i+1]?.text.length ?? 0) > 120;
}
export function structureBook(book: Book, outline: OutlineTarget[] = []): Book {
  const blocks = markNoise(book.blocks);
  const chapters: Chapter[] = [];
  const add = (title: string, block: number, level: number, source: Chapter['source']) => {
    if (block < 0 || !blocks[block] || chapters.some(c => c.block === block)) return;
    const b = blocks[block]; chapters.push({id:`chapter-${b.id}`,title,block,page:b.page,pageLabel:b.pageLabel,level,source,kind:chapterKind(title)});
  };
  for (const item of outline) {
    const candidates = blocks.map((b,i) => ({b,i})).filter(({b}) => b.page === item.page && b.kind !== 'noise');
    const target = candidates.find(({b}) => key(b.text) === key(item.title)) ?? candidates[0];
    if (target) add(item.title,target.i,item.level,'outline');
  }
  // If bookmarks exist, preserve their structure; add only explicit skipped sections missing from them.
  const hasOutline = chapters.length > 0;
  blocks.forEach((b,i) => { if (isHeading(b,i,blocks) && (!hasOutline || chapterKind(b.text) !== 'content')) add(b.text,i,0,'detected'); });
  chapters.sort((a,b) => a.block-b.block);
  const first = blocks.findIndex(b => b.kind !== 'noise');
  if (first >= 0 && (!chapters.length || chapters[0].block > first)) add(chapters.length ? 'Inicio' : 'Texto completo',first,0,'fallback');
  chapters.sort((a,b) => a.block-b.block);
  chapters.forEach((chapter,i) => {
    const end = chapters[i+1]?.block ?? blocks.length;
    if (chapter.kind !== 'content') { for (let j=chapter.block;j<end;j++) if (blocks[j].kind !== 'noise') blocks[j].kind = 'supplement'; }
    else if (chapter.source !== 'fallback') blocks[chapter.block].kind = 'heading';
  });
  return {...book,blocks,chapters,structureVersion:STRUCTURE_VERSION};
}
export function chapterAt(chapters: Chapter[] = [], block: number) { return chapters.findLast(c => c.block <= block); }
export function audioBlocks(book: Book): Block[] {
  return book.blocks.map(b => ({...b,text: b.kind === 'noise' || (b.kind === 'supplement' && !book.includeSupplement) ? '' : b.text}));
}
