import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { LibraryDB, hash } from '../../src/storage/db';
import type { Book, Position } from '../../src/types';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });
it('descarga el avance remoto más nuevo y no reenvía el PDF en cada sincronización', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co'); vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test');
  const storage = new Map<string,string>();
  vi.stubGlobal('localStorage', { getItem: (k:string) => storage.get(k) ?? null, setItem: (k:string,v:string) => storage.set(k,v), removeItem: (k:string) => storage.delete(k) });
  vi.stubGlobal('navigator', { onLine:true });
  storage.set('lumbre-supabase-session-v1', JSON.stringify({access_token:'test',user:{id:'owner'}}));
  const database = new LibraryDB('sync-review');
  const file = new Blob(['%PDF-test']); const id = await hash(await file.arrayBuffer());
  const book: Book = {id,title:'Libro',pages:1,blocks:[{id:'one',text:'Texto.',page:1,endPage:1,pageLabel:'1'}],needsOCR:[],importedAt:1,file};
  const position: Position = {bookId:id,block:0,seconds:8,rate:1,voice:'ef_dora',updatedAt:200,segment:0};
  await database.books.put(book); await database.positions.put({...position,seconds:1,updatedAt:100});
  const data = {...book, file:undefined};
  const tables: Record<string,unknown[]> = {lumbre_books:[{data,updated_at:new Date(1).toISOString()}],lumbre_positions:[{data:position,updated_at:new Date(200).toISOString()}],lumbre_annotations:[],lumbre_settings:[]};
  const fetcher = vi.fn(async (input:string, init?:RequestInit) => {
    const url = new URL(input);
    if (url.pathname.startsWith('/storage/')) return new Response('{}');
    if (!init?.method) return Response.json(tables[url.pathname.split('/').at(-1)!] ?? []);
    // Simulate PostgreSQL's conditional update: older data cannot overwrite newer data.
    if (init.method === 'PATCH') expect(url.searchParams.get('updated_at')).toMatch(/^lt\./);
    return new Response(null,{status:204});
  });
  vi.stubGlobal('fetch',fetcher);
  try {
    const {syncNow} = await import('../../src/sync/supabase');
    await Promise.all([syncNow(database),syncNow(database)]);
    expect((await database.positions.get(id))?.seconds).toBe(8);
    await syncNow(database);
    expect(fetcher.mock.calls.filter(([url]) => url.includes('/storage/'))).toHaveLength(1);
  } finally { await database.delete(); }
});
