import { expect, it } from 'vitest';
import { paragraphLines, type TextPiece } from '../../src/extraction/layout';
import { speechSegments, remapPosition } from '../../src/audio/segments';
const line = (str: string,x: number,y: number): TextPiece => ({ str,transform:[1,0,0,1,x,y],height:12,width:100,hasEOL:true });
it('separa los párrafos por espaciado y sangría sin separar renglones comunes', () => {
  expect(paragraphLines([line('Primera línea',106,730),line('continúa aquí.',70,715.6),line('Otro párrafo',106,695.2),line('continúa también.',70,680.8)]))
    .toEqual(['Primera línea','continúa aquí.','','Otro párrafo','continúa también.']);
});
it('conserva letras partidas entre elementos PDF sin inventar espacios', () => {
  const a = {...line('filosof',70,700),width:30,hasEOL:false};
  expect(paragraphLines([a,line('ía',100,700)])).toEqual(['filosofía']);
});
it('el primer audio es una oración, el resto es acotado y no se pierde texto', () => {
  const text = 'La libertad importa. ' + 'Una explicación más larga requiere atención y tiempo. '.repeat(20).trim();
  const segments = speechSegments([{id:'x',text,page:1,endPage:1,pageLabel:'i'}]);
  expect(segments[0].text).toBe('La libertad importa.');
  expect(segments.every(s => s.text.length <= 230)).toBe(true);
  expect(segments.map(s => s.text).join(' ')).toBe(text);
  expect(text.slice(segments[2].offset,segments[2].offset+segments[2].text.length)).toBe(segments[2].text);
});
it('remapea una posición anterior a la nueva estructura por contenido y página', () => {
  const old = [{id:'a',text:'Primero. Segundo.',page:2,endPage:2,pageLabel:'2'}];
  const next = ['Primero.','Segundo.'].map((text,i) => ({...old[0],id:String(i),text}));
  const p = {bookId:'x',block:0,seconds:4,textOffset:9,voice:'ef_dora' as const,rate:1,updatedAt:1};
  expect(remapPosition(p,old,next)).toMatchObject({block:1,seconds:0,voice:'ef_dora'});
});
