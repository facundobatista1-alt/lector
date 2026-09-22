import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { expect, test } from 'vitest';
import { captureQuote, quoteClipboard, quoteReference } from '../../src/annotations/quotes';
import { LibraryDB } from '../../src/storage/db';
import type { Book } from '../../src/types';

const book: Book = {id:'book',title:'Ensayo',pages:2,importedAt:1,file:new Blob(),needsOCR:[],blocks:[{id:'b1',text:'Primera oración. Segunda oración.',page:2,pageLabel:'iv',endPage:2}]};
test('captura el fragmento y conserva contexto, numeración y posición sin inventar autor', () => {
  const quote = captureQuote(book,0,1,3.2);
  expect(quote.text).toBe('Segunda oración.');
  expect(quote.context).toBe(book.blocks[0].text);
  expect(quote.seconds).toBe(3.2);
  expect(quoteReference(quote)).toBe('Ensayo — página iv');
  expect(quoteClipboard({...quote,text:'Editada'},false)).toBe('Editada');
  expect(quote.originalText).toBe('Segunda oración.');
});
test('migración desde esquema 1 conserva libros y posiciones; cita editada persiste al reabrir', async () => {
  const name = `quotes-${crypto.randomUUID()}`;
  const old = new Dexie(name);
  old.version(1).stores({books:'id,title,importedAt',positions:'bookId,updatedAt',audio:'key,touchedAt',measurements:'++id,createdAt'});
  await old.table('books').put(book);
  await old.table('positions').put({bookId:'book',block:0,seconds:3,updatedAt:1});
  old.close();
  const database = new LibraryDB(name);
  const quote = captureQuote(book,0,0,3);
  try {
    await database.annotations.add(quote);
    await database.annotations.update(quote.id,{text:'Editada',comment:'Una nota'});
    database.close(); await database.open();
    expect((await database.books.get('book'))?.title).toBe('Ensayo');
    expect((await database.positions.get('book'))?.seconds).toBe(3);
    expect(await database.annotations.get(quote.id)).toMatchObject({text:'Editada',originalText:'Primera oración.',context:book.blocks[0].text,comment:'Una nota'});
  } finally { await database.delete(); }
});
