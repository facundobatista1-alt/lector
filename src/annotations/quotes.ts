import type { Annotation, Book } from '../types';
import { speechSegments } from '../audio/segments';
import { chapterAt } from '../reader/chapters';

export function captureQuote(book: Book, blockIndex: number, part: number, seconds: number): Annotation {
  const block = book.blocks[blockIndex];
  if (!block?.text.trim()) throw new Error('No hay texto para guardar en esta posición.');
  const fragment = speechSegments([block]).find(segment => segment.part === part)?.text ?? block.text;
  const now = Date.now();
  return { id: crypto.randomUUID(), bookId: book.id, title: book.title, author: book.author,
    page: block.page, pageLabel: block.pageLabel, chapter: chapterAt(book.chapters ?? [], blockIndex)?.title,
    blockId: block.id, block: blockIndex, segment: part, seconds, originalText: fragment, text: fragment,
    context: block.text, comment: '', color: '#c69c45', createdAt: now, updatedAt: now };
}
export function quoteReference(quote: Annotation) {
  return [quote.author, quote.title, `página ${quote.pageLabel || quote.page}`].filter(Boolean).join(' — ');
}
export function quoteClipboard(quote: Annotation, reference: boolean) {
  return reference ? `${quote.text}\n\n${quoteReference(quote)}` : quote.text;
}
