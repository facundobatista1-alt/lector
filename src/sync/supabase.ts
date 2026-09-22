import type { Annotation, Book, Position } from '../types';
import { db, type LibraryDB } from '../storage/db';

const URL = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '');
const SESSION_KEY = 'lumbre-supabase-session-v1';
type Session = { access_token: string; user: { id: string } };
type RemoteBook = { id: string; owner: string; data: Omit<Book, 'file'>; updated_at: string };
export const supabaseConfigured = Boolean(URL && KEY);

async function request(path: string, init: RequestInit = {}, token?: string) {
  const headers = new Headers(init.headers); headers.set('apikey', KEY); if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${URL}${path}`, { ...init, headers });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  return response;
}
async function session(): Promise<Session> {
  const cached = localStorage.getItem(SESSION_KEY); if (cached) { try { return JSON.parse(cached) as Session; } catch { localStorage.removeItem(SESSION_KEY); } }
  const response = await request('/auth/v1/signup', { method: 'POST', body: '{}' });
  const value = await response.json() as Session; if (!value.access_token || !value.user?.id) throw new Error('Supabase no devolvió una sesión anónima. Activá Anonymous sign-ins.');
  localStorage.setItem(SESSION_KEY, JSON.stringify(value)); return value;
}
async function upsert(path: string, rows: unknown[], token: string) { if (!rows.length) return; await request(path, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) }, token); }
async function uploadPDF(book: Book, owner: string, token: string) {
  if (!book.file.size) return;
  await request(`/storage/v1/object/lumbre-pdfs/${owner}/${book.id}.pdf`, { method: 'POST', headers: { 'content-type': 'application/pdf', 'x-upsert': 'true' }, body: await book.file.arrayBuffer() }, token);
}
async function downloadPDF(id: string, owner: string, token: string) {
  const response = await request(`/storage/v1/object/lumbre-pdfs/${owner}/${id}.pdf`, {}, token); return new Blob([await response.arrayBuffer()], { type: 'application/pdf' });
}
export async function syncNow(database: LibraryDB = db) {
  if (!supabaseConfigured || !navigator.onLine) return { skipped: true, message: 'Sin conexión o Supabase no configurado.' };
  const auth = await session(); const books = await database.books.toArray(); const positions = await database.positions.toArray(); const annotations = await database.annotations.toArray(); const settings = await database.settings.toArray();
  await upsert('/rest/v1/lumbre_books', books.map(({ file, ...data }) => ({ id: data.id, owner: auth.user.id, data, updated_at: new Date(data.importedAt).toISOString() })), auth.access_token);
  await upsert('/rest/v1/lumbre_positions', positions.map(data => ({ book_id: data.bookId, owner: auth.user.id, data, updated_at: new Date(data.updatedAt).toISOString() })), auth.access_token);
  await upsert('/rest/v1/lumbre_annotations', annotations.map(data => ({ id: data.id, book_id: data.bookId, owner: auth.user.id, data, updated_at: new Date(data.updatedAt).toISOString() })), auth.access_token);
  await upsert('/rest/v1/lumbre_settings', settings.map(data => ({ key: data.key, owner: auth.user.id, data, updated_at: new Date(data.updatedAt).toISOString() })), auth.access_token);
  for (const book of books) await uploadPDF(book, auth.user.id, auth.access_token);
  const remote = await (await request('/rest/v1/lumbre_books?select=id,data,owner,updated_at', {}, auth.access_token)).json() as RemoteBook[];
  for (const item of remote) {
    const local = await database.books.get(item.id); const remoteTime = Date.parse(item.updated_at); if (local && local.importedAt >= remoteTime) continue;
    const data = item.data as Book; let file = local?.file ?? new Blob([], { type: 'application/pdf' });
    if (!file.size) { try { file = await downloadPDF(item.id, item.owner, auth.access_token); } catch { /* texto sin PDF disponible */ } }
    await database.books.put({ ...data, file });
  }
  return { skipped: false, message: `Sincronizado: ${books.length} libros locales.` };
}
