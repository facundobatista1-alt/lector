import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { OutlineTarget } from '../reader/chapters';
export async function readOutline(pdf: PDFDocumentProxy): Promise<OutlineTarget[]> {
  const entries: OutlineTarget[] = [];
  type Item = NonNullable<Awaited<ReturnType<PDFDocumentProxy['getOutline']>>>[number];
  async function visit(items: Item[], level: number) {
    for (const item of items) {
      // External links are not chapters. A malformed bookmark must not prevent reading.
      try {
        const dest = typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest;
        if (dest?.length) {
          const first: unknown = dest[0];
          let page: number | undefined;
          if (typeof first === 'number') page = first+1;
          else if (first && typeof first === 'object' && 'num' in first && 'gen' in first && typeof first.num === 'number' && typeof first.gen === 'number') page = (await pdf.getPageIndex({num:first.num,gen:first.gen}))+1;
          if (page && page <= pdf.numPages && page > 0 && item.title.trim()) entries.push({title:item.title.trim(),page,level});
        }
      } catch { /* Ignore only this invalid destination; continue through children. */ }
      if (Array.isArray(item.items) && level < 12) await visit(item.items as Item[],level+1);
    }
  }
  try { await visit(await pdf.getOutline() ?? [],0); } catch { /* Fall back to headings. */ }
  return entries;
}
