import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../storage/db';
import type { Annotation } from '../types';
import { quoteClipboard, quoteReference } from './quotes';

function QuoteCard({ quote, report }: { quote: Annotation; report: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(quote.text);
  const [comment, setComment] = useState(quote.comment);
  const [color, setColor] = useState(quote.color);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try { await db.annotations.update(quote.id, { text: text.trim(), comment, color, updatedAt: Date.now() }); setEditing(false); report('Cambios guardados.'); }
    catch { report('No se pudieron guardar los cambios. Intentá nuevamente.'); }
    finally { setSaving(false); }
  }
  async function copy(reference: boolean) {
    try { await navigator.clipboard.writeText(quoteClipboard(quote, reference)); report('Cita copiada.'); }
    catch { report('El navegador no permitió copiar. Podés seleccionar el texto de la cita y copiarlo manualmente.'); }
  }
  return <article className="quote-card" style={{ borderLeftColor: quote.color }}>
    <h2>{quote.title}</h2><p className="quote-meta">{quoteReference(quote)}{quote.chapter ? ` · ${quote.chapter}` : ''}</p>
    <p className="quote-meta">{new Date(quote.createdAt).toLocaleString('es-AR')} · archivo p. {quote.page} · fragmento {quote.segment + 1}, {Math.floor(quote.seconds)} s</p>
    {editing ? <form onSubmit={e => { e.preventDefault(); void save(); }}>
      <label>Texto de la cita<textarea aria-label="Texto de la cita" required value={text} onChange={e => setText(e.target.value)} rows={5}/></label>
      <label>Comentario<textarea aria-label="Comentario" value={comment} onChange={e => setComment(e.target.value)} rows={3}/></label>
      <label>Color<input aria-label="Color" type="color" value={color} onChange={e => setColor(e.target.value)}/></label>
      <div className="quote-actions"><button className="primary" disabled={saving || !text.trim()}>Guardar cambios</button><button type="button" disabled={saving} onClick={() => setEditing(false)}>Cancelar</button></div>
    </form> : <><blockquote>{quote.text}</blockquote>{quote.comment && <p className="quote-comment">{quote.comment}</p>}
      <div className="quote-actions"><button onClick={() => { setText(quote.text); setComment(quote.comment); setColor(quote.color); setEditing(true); }}>Editar cita</button><button onClick={() => void copy(false)}>Copiar texto</button><button onClick={() => void copy(true)}>Copiar con referencia</button></div></>}
    <details><summary>Ver párrafo original</summary><p className="quote-context">{quote.context}</p><small>La posición de audio corresponde al fragmento, no al tiempo total del libro. El texto original se conserva aunque edites la cita.</small></details>
  </article>;
}
export function Notes() {
  const [quotes, setQuotes] = useState<Annotation[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => { const subscription = liveQuery(() => db.annotations.orderBy('createdAt').reverse().toArray()).subscribe({ next: setQuotes, error: () => setStatus('No se pudieron cargar las citas.') }); return () => subscription.unsubscribe(); }, []);
  const fold = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');
  const filtered = quotes.filter(q => fold([q.text, q.title, q.author, q.comment].join(' ')).includes(fold(search)));
  return <section className="notes"><label>Buscar citas<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Texto, libro, autor o comentario"/></label>
    <p role="status">{status}</p>{filtered.map(quote => <QuoteCard key={quote.id} quote={quote} report={setStatus}/>)}
    {!filtered.length && <p className="empty">{quotes.length ? 'No hay citas que coincidan con la búsqueda.' : 'Todavía no guardaste citas. Abrí un libro y pulsá «Guardar cita» mientras leés o escuchás.'}</p>}
  </section>;
}
