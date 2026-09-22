import { expect, it } from 'vitest';
import { audioBlocks, chapterAt, structureBook } from '../../src/reader/chapters';
import { libraryBooks, progressPercent } from '../../src/library/progress';
import { speechSegments } from '../../src/audio/segments';
import type { Book, Position } from '../../src/types';
const make = (texts: string[]): Book => ({id:'book',title:'Política',author:'Weber',pages:texts.length,needsOCR:[],importedAt:1,file:new Blob(),blocks:texts.map((text,i) => ({id:String(i),text,page:i+1,pageLabel:String(i+1),endPage:i+1}))});
it('usa capítulos explícitos, conserva texto original y omite anexos del audio por defecto', () => {
  const original = make(['Índice','Capítulo I','La libertad requiere reflexión.','Capítulo II','La historia cambia.','Bibliografía','Obras de consulta.']);
  const book = structureBook(original);
  expect(book.chapters?.map(c => c.title)).toEqual(['Índice','Capítulo I','Capítulo II','Bibliografía']);
  expect(book.blocks.map(b => b.text)).toEqual(original.blocks.map(b => b.text));
  expect(audioBlocks(book)[0].text).toBe('');
  expect(audioBlocks(book)[6].text).toBe('');
  expect(audioBlocks({...book,includeSupplement:true})[6].text).toBe('Obras de consulta.');
  expect(chapterAt(book.chapters,4)?.title).toBe('Capítulo II');
  expect(speechSegments(audioBlocks(book)).map(s => s.block)).not.toContain(0);
});
it('prioriza marcadores y resuelve dos títulos diferentes en una misma página', () => {
  const book = make(['Antes de empezar','Libertad','Un texto.','Historia','Otro texto.']); book.blocks.forEach(b => b.page=1);
  const result = structureBook(book,[{title:'Libertad',page:1,level:0},{title:'Historia',page:1,level:1}]);
  expect(result.chapters?.map(c => [c.title,c.block])).toEqual([['Inicio',0],['Libertad',1],['Historia',3]]);
  expect(result.chapters?.[2].level).toBe(1);
});
it('no inventa capítulos a partir de menciones en el cuerpo o entradas con puntos de índice', () => {
  const book = structureBook(make(['En el capítulo I veremos otras ideas.','INTRODUCCIÓN ........ 7','Texto sin estructura clara.']));
  expect(book.chapters).toHaveLength(1); expect(book.chapters?.[0].title).toBe('Texto completo');
});
it('reconoce numeración romana y títulos breves al comienzo de página', () => {
  const book = make(['I', 'Le mythe de Sisyphe', 'Un texto largo que desarrolla el argumento con suficiente extensión para distinguirlo de un encabezado.', 'II', 'Le suicide', 'Otro texto largo que continúa la sección con contenido real y no debe convertirse en título.']);
  const result = structureBook(book);
  expect(result.chapters?.map(c => c.title)).toContain('I');
  expect(result.chapters?.map(c => c.title)).toContain('II');
});
it('marca encabezados repetidos y números de página sin quitar contenido único', () => {
  const book = make([]); book.pages=4;
  book.blocks = [1,2,3,4].flatMap(page => [`Weber — Política`,`Contenido único en la página ${page}.`,String(page)].map((text,i) => ({id:`${page}-${i}`,text,page,endPage:page,pageLabel:String(page)})));
  const result = structureBook(book);
  expect(result.blocks.filter(b => b.kind === 'noise')).toHaveLength(8);
  expect(audioBlocks(result).filter(b => b.text)).toHaveLength(4);
});
it('búsqueda sin tildes, orden reciente y progreso aproximado con final explícito', () => {
  const book = make(['Uno.','Dos.']); const other = {...book,id:'other',title:'Historia',author:'Ana',importedAt:2};
  const pos: Position = {bookId:book.id,block:1,textOffset:0,seconds:0,rate:1,voice:'ef_dora',updatedAt:3};
  expect(progressPercent(book,pos)).toBe(50);
  expect(progressPercent(book,{...pos,completed:true})).toBe(100);
  expect(libraryBooks([other,book],[pos],'politica','recent')).toEqual([book]);
  expect(libraryBooks([other,book],[pos],'','recent')[0].id).toBe('book');
  expect(libraryBooks([book,other],[],'','author')[0].author).toBe('Ana');
});
