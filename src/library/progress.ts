import type { Book, Position } from '../types';
export function progressPercent(book: Book, position?: Position): number {
  if (!position || !book.blocks.length) return 0;
  if (position.completed) return 100;
  const lengths = book.blocks.map(b => b.kind === 'noise' || (b.kind === 'supplement' && !book.includeSupplement) ? 0 : b.text.length);
  const total = lengths.reduce((a,b) => a+b,0);
  if (!total) return 0;
  const before = lengths.slice(0,position.block).reduce((a,b) => a+b,0);
  const offset = Math.min(lengths[position.block] ?? 0,Math.max(0,position.textOffset ?? 0));
  return Math.min(99,Math.floor(100*(before+offset)/total));
}
export type LibrarySort = 'recent' | 'title' | 'author' | 'progress';
export function libraryBooks(books: Book[], positions: Position[], query: string, sort: LibrarySort): Book[] {
  const key = (s: string) => s.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('es');
  const byId = new Map(positions.map(p => [p.bookId,p]));
  return books.filter(b => key(`${b.title} ${b.author ?? ''}`).includes(key(query.trim()))).sort((a,b) => {
    if (sort === 'title') return a.title.localeCompare(b.title,'es');
    if (sort === 'author') return (a.author ?? '').localeCompare(b.author ?? '','es') || a.title.localeCompare(b.title,'es');
    if (sort === 'progress') return progressPercent(b,byId.get(b.id))-progressPercent(a,byId.get(a.id));
    return (byId.get(b.id)?.updatedAt ?? b.importedAt)-(byId.get(a.id)?.updatedAt ?? a.importedAt);
  });
}
