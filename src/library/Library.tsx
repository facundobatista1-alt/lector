import { useState } from 'react';
import type { Book, Position } from '../types';
import { chapterAt } from '../reader/chapters';
import { libraryBooks, progressPercent, type LibrarySort } from './progress';
interface Props { books: Book[]; positions: Position[]; disabled: boolean; importing: boolean; onOpen: (book: Book) => void; onResume: (book: Book) => void; onUpload: (file?: File) => void }
export function Library({books,positions,disabled,importing,onOpen,onResume,onUpload}: Props) {
  const [query,setQuery] = useState(''); const [sort,setSort] = useState<LibrarySort>('recent');
  const recent = libraryBooks(books,positions,'','recent')[0];
  const positionFor = (book: Book) => positions.find(p => p.bookId === book.id);
  const progress = (book: Book) => progressPercent(book,positionFor(book));
  const location = (book: Book) => {
    const p = positionFor(book); const block = book.blocks[p?.block ?? 0];
    const chapter = chapterAt(book.chapters,p?.block ?? 0);
    return `${chapter?.title ?? 'Inicio'}${block ? ` · Página ${block.pageLabel}` : ''}`;
  };
  const filtered = libraryBooks(books,positions,query,sort);
  return <>
    {recent && <section className="continue-card" aria-labelledby="continue-title">
      <div className="continue-cover" aria-hidden="true">{recent.title.slice(0,1)}</div>
      <div className="continue-info"><p className="eyebrow" id="continue-title">CONTINUAR ESCUCHANDO</p><h2>{recent.title}</h2><p>{recent.author ?? 'Autor no indicado'}</p><p>{location(recent)}</p><progress value={progress(recent)} max="100" aria-label="Progreso del último libro"/><small>{progress(recent)}% recorrido · aproximado por texto</small></div>
      <button className="primary continue-play" disabled={disabled || importing || !recent.blocks.length} onClick={() => onResume(recent)} aria-label="Continuar escuchando">▶ {positionFor(recent)?.completed ? 'Volver a escuchar' : 'Continuar'}</button>
    </section>}
    <label className="import-card"><span className="import-symbol">＋</span><strong>{importing ? 'Procesando tu PDF…' : 'Agregar un libro'}</strong><span>PDF · se guarda en este dispositivo</span><input aria-label="Agregar PDF" type="file" accept="application/pdf,.pdf" disabled={disabled || importing} onChange={e => { onUpload(e.target.files?.[0]); e.target.value = ''; }}/></label>
    <div className="library-tools"><label>Buscar libros<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Título o autor"/></label><label>Ordenar por<select value={sort} onChange={e => setSort(e.target.value as LibrarySort)}><option value="recent">Recientes</option><option value="title">Título</option><option value="author">Autor</option><option value="progress">Progreso</option></select></label></div>
    <div className="book-grid">{filtered.map(item => <button className="book-card" key={item.id} disabled={disabled || importing} onClick={() => onOpen(item)} aria-label={`Abrir ${item.title}`}><span className="book-cover" aria-hidden="true">{item.title.slice(0,1)}<small>{item.pages} PÁGINAS</small></span><strong>{item.title}</strong><span>{item.author ?? 'Autor no indicado'}</span><span>{location(item)}</span><progress max="100" value={progress(item)} aria-label={`Progreso de ${item.title}`}/><span>{progress(item)}% recorrido</span>{!!item.needsOCR.length && <span>Contiene páginas sin texto extraíble</span>}</button>)}</div>
    {!filtered.length && <p className="empty">{books.length ? 'No hay libros que coincidan con la búsqueda.' : 'Agregá tu primer PDF. Dora preparará audio mientras leés.'}</p>}
  </>;
}
