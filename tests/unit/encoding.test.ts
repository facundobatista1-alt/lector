import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { repairBookEncoding, WEBER_PDF_HASH } from '../../src/extraction/encoding';
import { audioKey, LibraryDB, repairStoredBooks } from '../../src/storage/db';
import type { Book } from '../../src/types';
const book: Book = {
  id: WEBER_PDF_HASH, title: 'El político y el científico', pages: 1, needsOCR: [], importedAt: 1,
  file: new Blob(['original']), blocks: [{ id: 'p2-b1', page: 2, endPage: 2, pageLabel: '2',
    text: 'POLÕTICA COMO VOCACI”N. Trat·ndose de una exposiciÛn. øQuÈ? El ˙nico aÒo. ìEstadoî.' }],
};
it('corrige la codificación verificada conservando original, metadatos y anclas', async () => {
  const result = repairBookEncoding(book);
  expect(result.blocks[0].text).toBe('POLÍTICA COMO VOCACIÓN. Tratándose de una exposición. ¿Qué? El único año. “Estado”.');
  expect(result.originalBlocks).toEqual(book.blocks);
  expect(result.file).toBe(book.file);
  expect(result.title).toBe(book.title);
  expect(result.blocks[0].id).toBe(book.blocks[0].id);
  expect(repairBookEncoding(result)).toBe(result);
  expect(await audioKey(result.blocks[0].text, 'ef_dora', 'wasm')).not.toBe(await audioKey(book.blocks[0].text, 'ef_dora', 'wasm'));
});
it('no modifica otro PDF aunque contenga los mismos caracteres', () => {
  const other = { ...book, id: 'otro-pdf' };
  expect(repairBookEncoding(other)).toBe(other);
});
it('migra biblioteca existente una sola vez y mantiene posición y voz', async () => {
  const db = new LibraryDB(`encoding-${crypto.randomUUID()}`);
  try {
    await db.books.put(book);
    const position = { bookId: book.id, block: 0, seconds: 12, rate: 1.25, voice: 'ef_dora' as const, updatedAt: 1 };
    await db.positions.put(position);
    await repairStoredBooks(db);
    await repairStoredBooks(db);
    const saved = await db.books.get(book.id);
    expect(saved?.blocks[0].text).toContain('exposición');
    expect(saved?.originalBlocks).toEqual(book.blocks);
    expect(await db.positions.get(book.id)).toEqual(position);
  } finally { await db.delete(); }
});
