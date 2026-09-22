import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanPages, normalizeText, splitForSpeech } from '../../src/extraction/normalize';
import { audioKey, hash, LibraryDB, savePosition, trimAudio } from '../../src/storage/db';
import { encodeWav } from '../../src/audio/wav';
import { spanishPhonemes, tokenIds } from '../../src/tts/phonemes';
import { piperIds } from '../../src/tts/piper-ids';
const databases: LibraryDB[] = [];
afterEach(async () => { for (const db of databases.splice(0)) await db.delete(); });
function database() { const db = new LibraryDB(`test-${crypto.randomUUID()}`); databases.push(db); return db; }
describe('extracción conservadora', () => {
  it('conserva tildes, diéresis y eñe al normalizar y segmentar', () => {
    const text = 'También: filosofía, atención, vergüenza y mañana. ¿Qué cambió?';
    expect(normalizeText(text.normalize('NFD'))).toBe(text);
    expect(splitForSpeech(text, 65).join(' ')).toBe(text);
  });
  it('recompone palabras con guion de salto sin quitar guiones internos', () => { expect(normalizeText('liber-\ntad\n\nrelación histórico-social')).toBe('libertad\n\nrelación histórico-social'); });
  it('elimina márgenes repetidos y numeración, conserva texto del cuerpo', () => {
    const result = cleanPages([1,2,3,4].map(page => ({ page, label: String(page + 40), lines: ['Autor del libro','Título repetido','',`Texto del cuerpo ${page}.`,'',String(page)] })));
    expect(result).toHaveLength(4); expect(result[0].text).toBe('Texto del cuerpo 1.'); expect(result[0].pageLabel).toBe('41');
  });
  it('preserva párrafos distintos y une solo continuación inequívoca entre páginas', () => {
    const result = cleanPages([{ page: 1,label:'i',lines:['La liber-'] },{ page:2,label:'ii',lines:['tad es una pregunta.','','Otro párrafo.'] }]);
    expect(result.map(b => b.text)).toEqual(['La libertad es una pregunta.','Otro párrafo.']); expect(result[0].endPage).toBe(2);
  });
  it('no une texto entre páginas sin evidencia', () => { expect(cleanPages([{page:1,label:'1',lines:['Una idea abierta']},{page:2,label:'2',lines:['Otra idea independiente.']}])).toHaveLength(2); });
  it('no elimina un título de capítulo único', () => { expect(cleanPages([{page:1,label:'1',lines:['Capítulo primero','','Aquí empieza el contenido.']}])[0].text).toBe('Capítulo primero'); });
  it('divide textos largos sin perder palabras', () => { const text = 'La libertad exige pensar con atención. '.repeat(50).trim(); const chunks = splitForSpeech(text); expect(chunks.every(c => c.length <= 230)).toBe(true); expect(chunks.join(' ')).toBe(text); });
});
describe('voz y audio', () => {
  it('respeta el acento escrito y acepta caracteres descompuestos', async () => {
    const first = await spanishPhonemes('práctico');
    const middle = await spanishPhonemes('practico');
    const last = await spanishPhonemes('practicó');
    expect(first).toContain('ˈa');
    expect(middle).toContain('ˈi');
    expect(last).toContain('ˈo');
    expect(await spanishPhonemes('práctico'.normalize('NFD'))).toBe(first);
  });
  it('Piper inserta inicio, separación y fin sin perder fonemas', () => { expect(piperIds('a ', {'^':[1], '_':[0], '$':[2], a:[14], ' ':[3]})).toEqual([1n,0n,14n,0n,3n,0n,2n]); expect(() => piperIds('?', {'^':[1], '_':[0], '$':[2]})).toThrow('Fonema'); });
  it('Piper conserva la africada que Kokoro compacta', async () => { expect(await spanishPhonemes('Muchacho.',false)).toContain('tʃ'); expect(await spanishPhonemes('Muchacho.')).toContain('ʧ'); });
  it('fonemiza español y conserva puntuación', async () => { const result = await spanishPhonemes('La libertad, una pregunta.'); expect(result).toContain(','); expect(result).toContain('.'); expect(result.replace(/[ˈˌ]/g, '')).toContain('liβeɾtad'); });
  it('rechaza exceso de tokens, no trunca silenciosamente', () => { expect(() => tokenIds('a'.repeat(501), {a:1})).toThrow('largo'); expect(tokenIds('a', {a:1})).toEqual([0n,1n,0n]); });
  it('WAV tiene cabecera, duración y PCM saturado correctos', async () => { const wav = encodeWav(Float32Array.of(0,2,-2)); const b = await wav.arrayBuffer(); const v = new DataView(b); expect(new TextDecoder().decode(b.slice(0,4))).toBe('RIFF'); expect(v.getUint32(24,true)).toBe(24000); expect(v.getUint32(40,true)).toBe(6); expect(v.getInt16(46,true)).toBe(32767); expect(v.getInt16(48,true)).toBe(-32768); });
});
describe('persistencia y cache', () => {
  it('hash reconoce archivos iguales', async () => { expect(await hash('libro')).toBe(await hash('libro')); expect(await hash('libro')).not.toBe(await hash('otro')); });
  it('cache diferencia voz, motor y texto', async () => { const key = await audioKey('texto','dora','wasm'); expect(key).not.toBe(await audioKey('texto','alex','wasm')); expect(key).not.toBe(await audioKey('texto','dora','webgpu')); expect(key).not.toBe(await audioKey('otro','dora','wasm')); });
  it('guarda posición y rechaza escrituras obsoletas', async () => { const db = database(); const p = {bookId:'book', block:12,seconds:3.75,rate:1.25,voice:'ef_dora' as const,updatedAt:200}; await savePosition(p,db); await savePosition({...p,block:1,updatedAt:100},db); db.close(); await db.open(); expect(await db.positions.get('book')).toEqual(p); });
  it('LRU elimina audio antiguo sin tocar posición', async () => { const db = database(); await db.audio.bulkPut([1,2,3].map(n => ({ key:String(n),wav:new Blob(['x']),duration:1,bytes:100,touchedAt:n }))); await savePosition({bookId:'b',block:2,seconds:1,rate:1,voice:'ef_dora',updatedAt:1},db); await trimAudio(db,200); expect(await db.audio.toCollection().primaryKeys()).toEqual(['2','3']); expect(await db.positions.count()).toBe(1); });
});
