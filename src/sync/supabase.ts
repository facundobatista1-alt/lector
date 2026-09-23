import { db, hash, type LibraryDB } from '../storage/db';
import { importBackup, validateBackup, type Backup } from './backup';

const URL = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '');
const SESSION_KEY = 'lumbre-supabase-session-v1';
type Session = { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number; user: { id: string } };
type Remote<T> = { data: T; updated_at: string };
export const supabaseConfigured = Boolean(URL && KEY);
function storedSession(): Session | undefined {
  try { const value = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null'); return value?.access_token && value?.user?.id ? value : undefined; } catch { return undefined; }
}
export function hasSupabaseSession() { return Boolean(storedSession()); }
function saveSession(value: Session) {
  if (value.access_token && value.user?.id) localStorage.setItem(SESSION_KEY, JSON.stringify({ ...value, expires_at: value.expires_at ?? Math.floor(Date.now()/1000) + (value.expires_in ?? 3600) }));
  return value;
}
async function request(path: string, init: RequestInit = {}, token?: string) {
  const headers = new Headers(init.headers); headers.set('apikey', KEY);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${URL}${path}`, { ...init, headers, signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  return response;
}
async function session(): Promise<Session> {
  const current = storedSession();
  if (!current) throw new Error('Iniciá sesión para sincronizar tus libros entre dispositivos.');
  if (current.refresh_token && (!current.expires_at || current.expires_at < Date.now()/1000 + 60)) {
    const response = await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: current.refresh_token }) });
    const refreshed = await response.json() as Session;
    if (storedSession()?.access_token !== current.access_token) throw new Error('La sesión cambió. Volvé a sincronizar.');
    return saveSession(refreshed);
  }
  return current;
}
export async function signIn(email: string, password: string) {
  return saveSession(await (await request('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: email.trim(), password }) })).json());
}
export async function signUp(email: string, password: string) {
  return saveSession(await (await request(`/auth/v1/signup?redirect_to=${encodeURIComponent(window.location.origin)}`, { method: 'POST', body: JSON.stringify({ email: email.trim(), password }) })).json());
}
export function signOut() { localStorage.removeItem(SESSION_KEY); }

// Insert missing records; update existing records only if the server is older.
// The timestamp comparison runs in PostgreSQL, including concurrent devices.
async function push(table: string, key: string, id: string, data: unknown, updatedAt: number, auth: Session, extra = {}) {
  const row = { [key]: id, owner: auth.user.id, data, updated_at: new Date(updatedAt).toISOString(), ...extra };
  await request(`/rest/v1/${table}`, { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(row) }, auth.access_token);
  await request(`/rest/v1/${table}?${key}=eq.${encodeURIComponent(id)}&updated_at=lt.${encodeURIComponent(row.updated_at)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) }, auth.access_token);
}
async function rows<T>(table: string, auth: Session): Promise<Remote<T>[]> {
  const all: Remote<T>[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = await (await request(`/rest/v1/${table}?select=data,updated_at&order=updated_at&limit=500&offset=${offset}`, {}, auth.access_token)).json() as Remote<T>[];
    all.push(...page); if (page.length < 500) return all;
  }
}
const inFlight = new WeakMap<LibraryDB, Promise<{ skipped: boolean; message: string }>>();
export function syncNow(database: LibraryDB = db) {
  const current = inFlight.get(database); if (current) return current;
  const task = synchronize(database).finally(() => inFlight.delete(database)); inFlight.set(database, task); return task;
}
async function synchronize(database: LibraryDB) {
  if (!supabaseConfigured || !navigator.onLine || !hasSupabaseSession()) return { skipped: true, message: 'Sincronización no disponible. Los datos siguen guardados localmente.' };
  const auth = await session();
  const checkAccount = () => { if (storedSession()?.user.id !== auth.user.id) throw new Error('La sesión cambió. Sincronización detenida.'); };
  const books = await database.books.toArray();
  const remoteBooks = await rows<Backup['books'][number]>('lumbre_books', auth);
  const remoteIds = new Set(remoteBooks.map(b => b.data.id));
  for (const book of books) {
    checkAccount();
    if (!remoteIds.has(book.id)) {
      const { file, ...data } = book; void file;
      await push('lumbre_books', 'id', book.id, data, book.importedAt, auth);
    }
    // Content addressed PDFs are uploaded once per account/device, not every poll.
    const marker = `lumbre-pdf:${auth.user.id}:${book.id}`;
    if (book.file.size && localStorage.getItem(marker) !== String(book.file.size)) {
      await request(`/storage/v1/object/lumbre-pdfs/${auth.user.id}/${book.id}.pdf`, { method: 'POST', headers: { 'content-type': 'application/pdf', 'x-upsert': 'true' }, body: book.file }, auth.access_token);
      localStorage.setItem(marker, String(book.file.size));
    }
  }
  const ids = new Set(books.map(b => b.id));
  for (const p of await database.positions.toArray()) if (ids.has(p.bookId)) { checkAccount(); await push('lumbre_positions', 'book_id', p.bookId, p, p.updatedAt, auth); }
  for (const a of await database.annotations.toArray()) if (ids.has(a.bookId)) { checkAccount(); await push('lumbre_annotations', 'id', a.id, a, a.updatedAt, auth, { book_id: a.bookId }); }
  for (const s of await database.settings.toArray()) { checkAccount(); await push('lumbre_settings', 'key', s.key, s, s.updatedAt, auth); }
  const [allBooks, positions, annotations, settings] = await Promise.all([
    rows<Backup['books'][number]>('lumbre_books', auth), rows<Backup['positions'][number]>('lumbre_positions', auth),
    rows<Backup['annotations'][number]>('lumbre_annotations', auth), rows<Backup['settings'][number]>('lumbre_settings', auth),
  ]);
  checkAccount();
  const backup = validateBackup({ format: 'lumbre-backup', version: 1, createdAt: Date.now(), books: allBooks.map(r => r.data), positions: positions.map(r => r.data), annotations: annotations.map(r => r.data), settings: settings.map(r => r.data) });
  await importBackup(backup, database);
  for (const row of allBooks) {
    checkAccount();
    const local = await database.books.get(row.data.id);
    if (!local || local.file.size) continue;
    const response = await request(`/storage/v1/object/lumbre-pdfs/${auth.user.id}/${local.id}.pdf`, {}, auth.access_token);
    const bytes = await response.arrayBuffer();
    if (await hash(bytes) !== local.id) throw new Error('El PDF descargado no coincide con el libro.');
    checkAccount();
    await database.books.update(local.id, { file: new Blob([bytes], { type: 'application/pdf' }) });
    localStorage.setItem(`lumbre-pdf:${auth.user.id}:${local.id}`, String(bytes.byteLength));
  }
  return { skipped: false, message: 'Libros, progreso y citas sincronizados.' };
}
