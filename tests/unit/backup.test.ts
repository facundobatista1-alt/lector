import 'fake-indexeddb/auto';
import { afterEach, expect, test } from 'vitest';
import { LibraryDB, hash } from '../../src/storage/db';
import { exportBackup, importBackup, readBackup, validateBackup } from '../../src/sync/backup';
import { captureQuote } from '../../src/annotations/quotes';
import type { Book } from '../../src/types';

const databases:LibraryDB[]=[];
const database=()=>{const db=new LibraryDB(`backup-${crypto.randomUUID()}`);databases.push(db);return db;};
afterEach(async()=>{for(const db of databases.splice(0))await db.delete();});
async function seed(db:LibraryDB){
  const file=new Blob(['%PDF-1.7\nfixture']);
  const book:Book={id:await hash(await file.arrayBuffer()),title:'Filosofía',author:'Autora',file,pages:1,importedAt:1,needsOCR:[],extractionVersion:2,structureVersion:1,blocks:[{id:'a',text:'Una pregunta. Otra pregunta.',page:1,pageLabel:'iv',endPage:1}]};
  await db.books.put(book);
  await db.positions.put({bookId:book.id,block:0,segment:1,textOffset:14,seconds:2,rate:1.25,voice:'ef_dora',engine:'wasm',updatedAt:100});
  const quote={...captureQuote(book,0,1,2),createdAt:50,updatedAt:100};await db.annotations.put(quote);
  await db.settings.put({key:'ui',dark:true,follow:false,fontSize:25,updatedAt:100});
  return {book,quote};
}
test('respaldo completo preserva bytes PDF, cita, progreso y preferencias al reabrir',async()=>{
  const source=database(),target=database();const {book,quote}=await seed(source);
  const backup=await readBackup(await exportBackup(true,source));
  expect(await importBackup(backup,target)).toMatchObject({books:1,positions:1,annotations:1,missingPDF:0});
  target.close();await target.open();
  expect(await (await target.books.get(book.id))!.file.text()).toBe(await book.file.text());
  expect(await target.positions.get(book.id)).toMatchObject({seconds:2,segment:1,rate:1.25});
  expect(await target.annotations.get(quote.id)).toEqual(quote);
  expect(await target.settings.get('ui')).toMatchObject({dark:true,follow:false,fontSize:25});
});
test('respaldo sin PDF conserva texto y adjuntar respaldo completo no duplica',async()=>{
  const source=database(),target=database();const {book}=await seed(source);
  const light=await readBackup(await exportBackup(false,source));expect(light.books[0].pdf).toBeUndefined();
  await importBackup(light,target);expect((await target.books.get(book.id))!.file.size).toBe(0);
  expect((await target.books.get(book.id))!.blocks).toEqual(book.blocks);
  await importBackup(await readBackup(await exportBackup(true,source)),target);
  expect(await target.books.count()).toBe(1);expect(await target.annotations.count()).toBe(1);
  expect((await target.books.get(book.id))!.file.size).toBe(book.file.size);
});
test('importación repetida no revierte progreso, citas ni ajustes más recientes',async()=>{
  const source=database(),target=database();const {book,quote}=await seed(source);
  const backup=await readBackup(await exportBackup(false,source));await importBackup(backup,target);
  await target.positions.update(book.id,{seconds:8,updatedAt:200});await target.annotations.update(quote.id,{comment:'Comentario nuevo',updatedAt:200});await target.settings.update('ui',{dark:false,updatedAt:200});
  expect(await importBackup(backup,target)).toMatchObject({books:0,positions:0,annotations:0});
  expect((await target.positions.get(book.id))?.seconds).toBe(8);expect((await target.annotations.get(quote.id))?.comment).toBe('Comentario nuevo');expect((await target.settings.get('ui'))?.dark).toBe(false);
});
test('PDF alterado y documentos inválidos se rechazan sin escrituras parciales',async()=>{
  const source=database(),target=database();await seed(source);
  const backup=await readBackup(await exportBackup(true,source));backup.books[0].pdf=btoa('%PDF-alterado');
  await expect(importBackup(backup,target)).rejects.toThrow('inválido');expect(await target.books.count()).toBe(0);
  expect(()=>validateBackup({...backup,version:2})).toThrow();
  expect(()=>validateBackup({...backup,positions:[{...backup.positions[0],seconds:-1}]})).toThrow();
  expect(()=>validateBackup({...backup,annotations:[{...backup.annotations[0],text:{bad:true}}]})).toThrow();
  expect(()=>validateBackup({...backup,books:[backup.books[0],backup.books[0]]})).toThrow();
  await expect(readBackup(new Blob(['no json']))).rejects.toThrow();
});
test('error de escritura revierte toda la importación',async()=>{
  const source=database(),target=database();await seed(source);
  const backup=await readBackup(await exportBackup(false,source));
  target.annotations.hook('creating',()=>{throw new Error('Disco lleno simulado');});
  await expect(importBackup(backup,target)).rejects.toThrow('Disco lleno');
  expect(await target.books.count()).toBe(0);expect(await target.positions.count()).toBe(0);
});
test('extracción distinta remapea página y reinicia segundos sin tocar texto local',async()=>{
  const source=database(),target=database();const {book}=await seed(source);
  await target.books.put({...book,blocks:[{...book.blocks[0],id:'nuevo',text:'Texto corregido de la página.'}]});
  await importBackup(await readBackup(await exportBackup(false,source)),target);
  expect(await target.positions.get(book.id)).toMatchObject({block:0,segment:0,seconds:0});
  expect((await target.books.get(book.id))?.blocks[0].text).toBe('Texto corregido de la página.');
});
