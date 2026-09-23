import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerURL from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { cleanPages, type PageLines } from '../extraction/normalize';
import { db, hash } from '../storage/db';
import type { Book } from '../types';
import { paragraphLines } from '../extraction/layout';
import { remapPosition } from '../audio/segments';
import { STRUCTURE_VERSION, structureBook } from '../reader/chapters';
import { readOutline } from './outline';
export const EXTRACTION_VERSION = 2;
import { repairBookEncoding } from '../extraction/encoding';
GlobalWorkerOptions.workerSrc = workerURL;
export async function importPDF(file: File, progress: (text: string) => void, force = false): Promise<Book> {
  if (file.size > 200 * 1024 * 1024) throw new Error('El laboratorio admite PDFs de hasta 200 MB.');
  const data = await file.arrayBuffer();
  if (!new TextDecoder().decode(data.slice(0, 1024)).includes('%PDF-')) throw new Error('El archivo no contiene una cabecera PDF válida.');
  const id = await hash(data); const existing = await db.books.get(id); if (existing && !force) { const repaired = repairBookEncoding(existing); const attached = existing.file.size ? repaired : {...repaired,file}; if (attached !== existing) await db.books.put(attached); progress('El libro ya estaba en tu biblioteca.'); return attached; }
  const task = getDocument({ data });
  try {
    const pdf = await task.promise;
    const metadata = await pdf.getMetadata(); const info = metadata.info as { Title?: string; Author?: string };
    const labels = await pdf.getPageLabels(); const pages: PageLines[] = []; const needsOCR: number[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      progress(`Extrayendo página ${n} de ${pdf.numPages}`);
      const page = await pdf.getPage(n); const content = await page.getTextContent();
      const lines = paragraphLines(content.items.filter(item => 'str' in item));
      if (lines.join('').replace(/\s/g, '').length < 40) needsOCR.push(n);
      pages.push({ page: n, label: labels?.[n - 1] ?? String(n), lines }); page.cleanup();
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    const book: Book = { id, title: info.Title?.trim() || file.name.replace(/\.pdf$/i, ''), author: info.Author?.trim() || undefined, pages: pdf.numPages, blocks: cleanPages(pages), needsOCR, importedAt: existing?.importedAt ?? Date.now(), extractionVersion: EXTRACTION_VERSION, file };
    const repaired = structureBook(repairBookEncoding(book),await readOutline(pdf));
    await db.transaction('rw', db.books, db.positions, async () => {
      const position = await db.positions.get(id);
      if (existing && position) await db.positions.put(remapPosition(position,existing.blocks,repaired.blocks));
      await db.books.put(repaired);
    }); return repaired;
  } finally { await task.destroy(); }
}

export async function upgradeBook(book: Book, progress: (text: string) => void): Promise<Book> {
  if (!book.file.size) { if (book.structureVersion === STRUCTURE_VERSION) return book; const updated = structureBook(book); await db.books.put(updated); return updated; }
  if (book.extractionVersion !== EXTRACTION_VERSION) return importPDF(new File([book.file], `${book.title}.pdf`, { type: 'application/pdf' }),progress,true);
  if (book.structureVersion === STRUCTURE_VERSION) return book;
  progress('Preparando navegación por capítulos…');
  const task = getDocument({data:await book.file.arrayBuffer()});
  try {
    const pdf = await task.promise;
    const updated = structureBook(book,await readOutline(pdf));
    await db.books.put(updated); return updated;
  } finally { await task.destroy(); }
}
