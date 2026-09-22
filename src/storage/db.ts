import Dexie, { type Table } from 'dexie';
import type { Annotation, AudioRecord, Book, Measurement, Position } from '../types';
import { repairBookEncoding, WEBER_PDF_HASH } from '../extraction/encoding';
export class LibraryDB extends Dexie {
  books!: Table<Book, string>;
  positions!: Table<Position, string>;
  audio!: Table<AudioRecord, string>;
  measurements!: Table<Measurement, number>;
  annotations!: Table<Annotation, string>;
  settings!: Table<{key:string;dark:boolean;follow:boolean;fontSize:number;updatedAt:number}, string>;
  constructor(name = 'lumbre-v1') { super(name); this.version(1).stores({ books: 'id,title,importedAt', positions: 'bookId,updatedAt', audio: 'key,touchedAt', measurements: '++id,createdAt' }); this.version(2).stores({ annotations: 'id,bookId,createdAt' }); this.version(3).stores({settings:'key'}); }
}
export const db = new LibraryDB();
export async function repairStoredBooks(database = db) {
  await database.transaction('rw', database.books, async () => {
    const book = await database.books.get(WEBER_PDF_HASH);
    if (book) {
      const repaired = repairBookEncoding(book);
      if (repaired !== book) await database.books.put(repaired);
    }
  });
}
export async function hash(data: ArrayBuffer | string) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
}
export async function audioKey(text: string, voice: string, engine: string) { return hash(JSON.stringify({ text, voice, engine: voice === 'piper_davefx' ? 'wasm' : engine, model: voice === 'piper_davefx' ? 'piper-davefx-v1.0.0' : 'kokoro-v1-1939ad2', frontend: 'es-v1', speed: 1 })); }
export async function trimAudio(database: LibraryDB, maxBytes: number) {
  await database.transaction('rw', database.audio, async () => {
    const records = await database.audio.orderBy('touchedAt').toArray();
    let total = records.reduce((sum, item) => sum + item.bytes, 0);
    for (const item of records) { if (total <= maxBytes) break; await database.audio.delete(item.key); total -= item.bytes; }
  });
}
export async function savePosition(position: Position, database = db) {
  await database.transaction('rw', database.positions, async () => {
    const old = await database.positions.get(position.bookId);
    if (!old || old.updatedAt <= position.updatedAt) await database.positions.put(position);
  });
}
