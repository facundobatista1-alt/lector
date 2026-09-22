import { useEffect, useRef, useState } from 'react';
import { liveQuery } from 'dexie';
import { Library } from './library/Library';
import { Notes } from './annotations/Notes';
import { OfflinePanel } from './pwa/OfflinePanel';
import { captureQuote } from './annotations/quotes';
import { ChapterNav } from './reader/ChapterNav';
import { audioBlocks, chapterAt } from './reader/chapters';
import { db, repairStoredBooks } from './storage/db';
import { LocalTTSProvider } from './tts/provider';
import { SAMPLE } from './tts/sample';
import { BookPlayer, initialPlayer } from './audio/player';
import { importPDF, upgradeBook } from './pdf/extract';
import { syncNow } from './sync/supabase';
import { SyncPanel } from './sync/SyncPanel';
import type { Block, Book, Engine, Voice, Position, Chapter } from './types';

const demo: Block[] = SAMPLE.map((text, i) => ({ id: `demo-${i}`, text, page: 1, pageLabel: 'muestra', endPage: 1 }));
const rates = [.5, .75, 1, 1.15, 1.25, 1.5, 1.75, 2, 2.5, 3];
function message(error: unknown) { return error instanceof Error ? error.message : String(error); }

export default function App() {
  const [tab, setTab] = useState<'lab' | 'library' | 'findings' | 'notes'>('library');
  const [quoteFeedback, setQuoteFeedback] = useState('');
  const [savingQuote, setSavingQuote] = useState(false);
  useEffect(() => { if (!quoteFeedback) return; const timer = setTimeout(() => setQuoteFeedback(''), 4000); return () => clearTimeout(timer); }, [quoteFeedback]);
  const [positions,setPositions] = useState<Position[]>([]);
  const [browsedChapter,setBrowsedChapter] = useState<Chapter>();
  const [books, setBooks] = useState<Book[]>([]);
  const [book, setBook] = useState<Book>();
  const [index, setIndex] = useState(0);
  const [voice, setVoice] = useState<Voice>('ef_dora');
  const [engine, setEngine] = useState<Engine>('wasm');
  const [rate, setRate] = useState(1);
  const [status, setStatus] = useState('Cargando bibliotecaâ€¦');
  const [error, setError] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [importing, setImporting] = useState(true);
  const [calibrating] = useState(false);
  const calibration = useRef<AbortController | null>(null);
  const [state, setState] = useState(initialPlayer);
  const [follow, setFollow] = useState(true);
  const [fontSize, setFontSize] = useState(21);
  const [dark, setDark] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const audio = useRef<HTMLAudioElement>(null);
  const player = useRef<BookPlayer | null>(null);
  const transferring = useRef(false);
  useEffect(() => { const subscription = liveQuery(() => db.settings.get('ui')).subscribe({next:s=>{if(s){setDark(s.dark);setFollow(s.follow);setFontSize(s.fontSize);}},error:e=>setError(message(e))}); return ()=>subscription.unsubscribe(); }, []);
  function savePreferences(patch: Partial<{dark:boolean;follow:boolean;fontSize:number}>) {
    if(patch.dark!==undefined)setDark(patch.dark);
    if(patch.follow!==undefined)setFollow(patch.follow);
    if(patch.fontSize!==undefined)setFontSize(patch.fontSize);
    void db.transaction('rw',db.settings,async()=>{const old=await db.settings.get('ui');await db.settings.put({key:'ui',dark:old?.dark ?? dark,follow:old?.follow ?? follow,fontSize:old?.fontSize ?? fontSize,...patch,updatedAt:Date.now()});}).catch(e=>setError(message(e)));
  }
  const blocks = book?.blocks ?? demo;
  const chapters = book?.chapters ?? [];
  const currentChapter = chapterAt(chapters,index);
  const chapterIndex = chapters.findIndex(c => c.id === (browsedChapter ?? currentChapter)?.id);
  useEffect(() => { const subscription = liveQuery(() => db.positions.toArray()).subscribe({ next: setPositions, error: e => setError(message(e)) }); return () => subscription.unsubscribe(); }, []);
  useEffect(() => {
    let alive = true;
    const sync = () => void syncNow().then(result => { if (alive && !result.skipped) setSyncMessage(result.message); }).catch(e => { if (alive && !String(e).includes('IniciÃ¡ sesiÃ³n')) setSyncMessage(`SincronizaciÃ³n pendiente: ${message(e)}`); });
    const timer = window.setInterval(sync, 30000); window.addEventListener('online', sync); sync();
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener('online', sync); };
  }, []);
  const busy = state.busy;
  const playing = state.playing;
  const seconds = state.seconds;
  const duration = state.duration;
  useEffect(() => {
    const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const instance = new BookPlayer(audio.current!, new LocalTTSProvider(), next => { setState(next); setIndex(next.block); }, () => {}, mobile ? { startSeconds: 0, targetSeconds: 45 } : undefined);
    player.current = instance;
    let alive = true;
    void (async () => {
      await repairStoredBooks();
      const storedBooks = await db.books.toArray();
      const storedPositions = await db.positions.orderBy('updatedAt').reverse().toArray();
      const position = storedPositions.find(p => storedBooks.some(b => b.id === p.bookId));
      let savedBook = position?.bookId === 'demo' ? undefined : position ? await db.books.get(position.bookId) : undefined;
      if (savedBook) savedBook = await upgradeBook(savedBook, setStatus);
      const saved = position ? await db.positions.get(position.bookId) : undefined;
      const library = await db.books.orderBy('importedAt').reverse().toArray();
      if (!alive) return;
      setBooks(library);

      const v = 'ef_dora'; const e = saved?.engine ?? 'wasm'; const r = saved?.rate ?? 1;
      setVoice(v); setEngine(e); setRate(r);
      instance.configure(savedBook?.id ?? 'demo',savedBook ? audioBlocks(savedBook) : demo,v,e,r,saved);
      setStatus(''); setImporting(false);
      // La sÃ­ntesis empieza al pulsar Play. Prepararla durante el arranque
      // dejaba el indicador de carga de Safari activo indefinidamente.
    })().catch(e => { if (alive) { setError(message(e)); setImporting(false); } });
    const flush = () => { if(!transferring.current) void instance.persist(); };
    window.addEventListener('pagehide',flush); document.addEventListener('visibilitychange',flush);
    return () => { alive = false; calibration.current?.abort(); window.removeEventListener('pagehide',flush); document.removeEventListener('visibilitychange',flush); instance.dispose(); };
  }, []);
  useEffect(() => { if (!busy) return; const start = Date.now(); const timer = setInterval(() => setElapsed(Math.floor((Date.now()-start)/1000)),1000); return () => clearInterval(timer); }, [busy]);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  useEffect(() => { if (playing && follow) document.getElementById('block-'+index)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [index, playing, follow]);
  useEffect(() => { if (playing) setBrowsedChapter(undefined); }, [playing,index]);
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: book?.title ?? 'Sobre la libertad y la lectura', artist: book?.author ?? '', album: currentChapter?.title ?? 'PÃ¡rrafo '+(index+1) });
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    const handlers: [MediaSessionAction, () => void][] = [['play',() => player.current?.start()],['pause',() => player.current?.pause()],['nexttrack',() => { void player.current?.select(index+1,true); }],['previoustrack',() => { void player.current?.select(Math.max(0,index-1),true); }]];
    for (const [action,handler] of handlers) { try { navigator.mediaSession.setActionHandler(action,handler); } catch { /* Optional platform control. */ } }
    return () => { for (const [action] of handlers) { try { navigator.mediaSession.setActionHandler(action,null); } catch { /* Unsupported. */ } } };
  },[book,index,playing,currentChapter]);
  async function choose(i: number) { setBrowsedChapter(undefined); setStatus(''); await player.current?.select(i); }
  function cancel() { calibration.current?.abort(); player.current?.cancel(); }
  function prepare(all = false) { setStatus(''); if (all) player.current?.prepareAhead(); else player.current?.prepare(); }
  async function openBook(next?: Book, autoplay = false) {
    if (next && book?.id === next.id) {
      setBook(next); setTab('lab'); setBrowsedChapter(undefined);
      if (autoplay) player.current?.start();
      else if (!player.current?.state.ready && !player.current?.state.busy) player.current?.prepareAhead();
      return;
    }
    await player.current?.persist(); player.current?.cancel(); setImporting(true);
    try {
      const upgraded = next ? await upgradeBook(next,setStatus) : undefined;
      const saved = await db.positions.get(upgraded?.id ?? 'demo');
      setBook(upgraded); setTab('lab'); setBrowsedChapter(undefined);

      const v = 'ef_dora'; const e = saved?.engine ?? engine; const r = saved?.rate ?? rate;
      setVoice(v); setEngine(e); setRate(r);
      player.current?.configure(upgraded?.id ?? 'demo',upgraded ? audioBlocks(upgraded) : demo,v,e,r,saved);
      setBooks(await db.books.orderBy('importedAt').reverse().toArray()); setStatus('');
      await player.current?.persist();
      if (autoplay) player.current?.start(); else if (upgraded) player.current?.prepareAhead();
    } finally { setImporting(false); }
  }
  async function upload(file?: File) {
    if (!file) return; setImporting(true); setError(''); await player.current?.persist(); player.current?.cancel();
    try { const result = await importPDF(file,setStatus); await openBook(result); }
    catch (e) { setError(message(e)); }
    finally { setImporting(false); }
  }
  async function selectChapter(chapter: Chapter) {
    setTab('lab');
    if (chapter.kind !== 'content' && !book?.includeSupplement) { player.current?.pause(); setBrowsedChapter(chapter); }
    else { await choose(chapter.block); }
    requestAnimationFrame(() => document.getElementById('block-'+chapter.block)?.scrollIntoView({behavior:'smooth',block:'center'}));
  }
  async function includeSupplement(include: boolean) {
    if (!book) return;
    const updated = {...book,includeSupplement:include}; const wanted = state.wanted;
    setBook(updated); setImporting(true);
    try {
      await player.current?.persist();
      const saved = await db.positions.get(book.id); await db.books.put(updated);
      setBooks(await db.books.orderBy('importedAt').reverse().toArray());
      player.current?.configure(updated.id,audioBlocks(updated),voice,engine,rate,saved ? {...saved,completed:false} : undefined);
      await player.current?.persist();
      if (wanted) player.current?.start(); else player.current?.prepareAhead();
    } catch (error) { setBook(book); throw error; }
    finally { setImporting(false); }
  }
  function toggle() { setStatus(''); if (state.wanted) player.current?.pause(); else player.current?.start(); }
  async function saveQuote() {
    if (!book || savingQuote) return;
    const current = player.current?.state ?? state;
    if (!blocks[current.block]?.text.trim()) {
      setQuoteFeedback('SeleccionÃ¡ un pÃ¡rrafo con texto para guardar la cita.');
      return;
    }
    setSavingQuote(true);
    try { await db.annotations.add(captureQuote(book, current.block, current.part, audio.current?.currentTime ?? current.seconds)); setQuoteFeedback('Cita guardada en Â«Citas y notasÂ».'); }
    catch (e) { setError(message(e)); }
    finally { setSavingQuote(false); }
  }
  return <div className="app">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setTab('library'); }}><span className="logo">l.</span><span>Lumbre<small>Un espacio para leer</small></span></a>
      <div className="nav-label">TU ESPACIO</div>
      <nav aria-label="Principal">
        <button className={tab === 'library' ? 'selected' : ''} onClick={() => setTab('library')}><span>â–¤</span> Biblioteca <small>{books.length}</small></button>
        <button className={tab === 'lab' ? 'selected' : ''} onClick={() => setTab('lab')}><span>â—‰</span> Lector</button>
        <button aria-label="Citas y notas" className={tab === 'notes' ? 'selected' : ''} onClick={() => setTab('notes')}><span aria-hidden="true">âž</span> Citas y notas</button>
      </nav>
      <div className="sidebar-bottom"><span className="privacy-dot"/> Privado. Sin anuncios.<p>Dora Â· voz local</p><button className="text-button" onClick={() => savePreferences({dark:!dark})}>{dark ? 'â˜€ Tema claro' : 'â˜¾ Tema oscuro'}</button></div>
    </aside>
    <main>
      <header className="topbar"><span>LECTURA CON TIEMPO</span><span className="pill">â— Todo queda en tu dispositivo</span></header>
      <div className="page">
        <div className="eyebrow">{tab === 'notes' ? 'IDEAS QUE QUERÃ‰S CONSERVAR' : tab === 'lab' ? 'TU LIBRO, SIN APURO' : tab === 'library' ? 'TUS LIBROS, A TU RITMO' : 'EVIDENCIA ANTES DE AVANZAR'}</div>
        <h1>{tab === 'notes' ? 'Citas y notas' : tab === 'lab' ? 'Leer y escuchar' : tab === 'library' ? 'Mi biblioteca' : 'Resultados del laboratorio'}</h1>
        <p className="lead">{tab === 'notes' ? 'Fragmentos para volver a pensar. Guardados solamente en este navegador.' : tab === 'lab' ? 'Dora prepara tu libro mientras leÃ©s. EscuchÃ¡ cuando tengas audio adelantado.' : tab === 'library' ? 'ImportÃ¡ un PDF para explorar su texto. El archivo permanece en este navegador.' : 'Mediciones de sÃ­ntesis real guardadas en este dispositivo.'}</p>
        {tab === 'notes' && <Notes/>}
        {(error || state.error) && <div className="error" role="alert">{error || state.error}<button onClick={() => void navigator.clipboard.writeText(error || state.error).then(() => setStatus('Error copiado.')).catch(() => setStatus('No se pudo copiar el error.'))}>Copiar error</button><button onClick={() => { setError(''); player.current?.clearError(); }} aria-label="Cerrar error">Ã—</button></div>}
        {tab === 'lab' && <>
          <details className="voice-settings"><summary>Opciones de audio Â· Dora</summary><section className="lab-controls" aria-label="ConfiguraciÃ³n de voz">
            <div className="voice-label">VOZ EN ESPAÃ‘OL<strong> Â· Dora</strong></div>
            <button className="primary" disabled={busy || calibrating || !blocks.length || importing} onClick={() => void prepare()}>{busy ? 'Preparandoâ€¦' : 'âœ¦ Preparar fragmento'}</button>
            {busy || calibrating ? <button onClick={cancel}>Cancelar</button> : <button disabled={!blocks.length || importing} onClick={() => void prepare(true)}>Preparar por adelantado</button>}
            <p className="download-note">Dora prepara audio al abrir un PDF. En iPhone y Android, Play comienza apenas estÃ¡ listo el primer fragmento; en PC espera una reserva inicial de 30 segundos. La generaciÃ³n continÃºa mientras escuchÃ¡s. DejÃ¡ la aplicaciÃ³n abierta para que avance.</p>
          </section></details>
          <div className="status" role="status"><span className={busy ? 'working' : 'privacy-dot'}/>{status || state.status} Â· Reserva: {Math.floor(state.reserveSeconds / 60)} min {Math.floor(state.reserveSeconds % 60)} s{busy && <span className="elapsed"> Â· {elapsed} s transcurridos</span>}</div>
          {!!chapters.length && <div className="chapter-controls"><button disabled={importing || calibrating || chapterIndex <= 0} onClick={() => void selectChapter(chapters[chapterIndex-1]).catch(e => setError(message(e)))}>ï¿½? ï¿½ CapÃ­tulo anterior</button><span>{(browsedChapter ?? currentChapter)?.title}</span><button disabled={importing || calibrating || chapterIndex < 0 || chapterIndex >= chapters.length-1} onClick={() => void selectChapter(chapters[chapterIndex+1]).catch(e => setError(message(e)))}>CapÃ­tulo siguiente ï¿½? ï¿½</button></div>}
          <div className="reading-layout">
            <section className="paper" aria-label="Texto del libro">
              <div className="paper-header"><span>{book ? 'PDF IMPORTADO' : 'CINCO PÃRRAFOS Â· TEXTO ORIGINAL DE PRUEBA'}</span><span>{book ? `${book.pages} pÃ¡ginas` : 'EspaÃ±ol'}</span></div>
              <h2>{book?.title ?? 'Sobre la libertad y la lectura'}</h2>
              <p className="byline">{book?.author ?? (book ? 'Autor no indicado en el PDF' : 'Muestra creada para evaluar la voz, no un extracto de un libro')}</p>
              {book && !book.file.size && <div className="notice">Texto restaurado sin PDF original. PodÃ©s agregar el mismo PDF desde Biblioteca para adjuntarlo sin duplicar el libro.</div>}{!!book?.needsOCR.length && <div className="notice">{book.needsOCR.length} pÃ¡ginas tienen poco texto. Pueden ser escaneos o pÃ¡ginas vacÃ­as. OCR pendiente de la fase 2; no se inventa su contenido.</div>}
              {chapters.some(c => c.kind !== 'content') && <label className="supplement-setting"><input type="checkbox" checked={book?.includeSupplement ?? false} disabled={importing || calibrating} onChange={e => void includeSupplement(e.target.checked).catch(e => setError(message(e)))}/> Incluir Ã­ndice y bibliografÃ­a en el audio</label>}
              <div className="reading-tools"><label><input type="checkbox" checked={follow} onChange={e => savePreferences({follow:e.target.checked})}/> Seguir pÃ¡rrafo</label><label>TamaÃ±o <input aria-label="TamaÃ±o del texto" type="range" min="17" max="30" value={fontSize} onChange={e => savePreferences({fontSize:Number(e.target.value)})}/></label></div>
              <div className="paragraphs" style={{ fontSize }}>
                {blocks.map((block, i) => <button id={`block-${i}`} key={block.id} className={`paragraph ${block.kind === 'noise' ? 'noise' : ''} ${i === index ? 'active' : ''} ${playing && i === index ? 'speaking' : ''}`} disabled={calibrating} onClick={() => void choose(i).catch(e => setError(message(e)))} aria-label={`Seleccionar pÃ¡rrafo ${i + 1}`} aria-current={i === index ? 'true' : undefined}><span className="paragraph-number">{String(i + 1).padStart(2, '0')}</span><span>{block.text}{block.kind === 'noise' && <small className="omitted-label">Encabezado o numeraciÃ³n Â· no se lee</small>}{block.kind === 'supplement' && !book?.includeSupplement && <small className="omitted-label">SecciÃ³n opcional Â· no se lee</small>}{book && <small className="page-reference">PÃ¡gina {block.pageLabel} Â· archivo {block.page}{block.endPage !== block.page ? `â€“${block.endPage}` : ''}</small>}</span></button>)}
                {!blocks.length && <p>No se encontrÃ³ texto legible. Este PDF requiere OCR.</p>}
              </div>
              <div className="paper-footer">{playing ? 'Leyendo' : 'Seleccionado'} Â· pÃ¡rrafo {blocks.length ? index + 1 : 0} de {blocks.length}<span>SincronizaciÃ³n por pÃ¡rrafo</span></div>
            </section>
            <aside className="reader-sidebar">{!!chapters.length && <ChapterNav chapters={chapters} active={browsedChapter ?? currentChapter} disabled={importing || calibrating} onSelect={chapter => void selectChapter(chapter).catch(e => setError(message(e)))}/>}
            </aside>
          </div>
        </>}
        {tab === 'library' && <><OfflinePanel bookId={book?.id} title={book?.title}/><SyncPanel onChange={() => { void syncNow().then(() => setSyncMessage('SincronizaciÃ³n actualizada.')).catch(e => setSyncMessage(message(e))); }}/><Library books={books} positions={positions} disabled={calibrating} importing={importing} onOpen={item => void openBook(item).catch(e => setError(message(e)))} onResume={item => void openBook(item,true).catch(e => setError(message(e)))} onUpload={file => void upload(file)}/><div className="status" role="status">{syncMessage || status || (book ? state.status : 'Tus libros quedan guardados en este navegador.')}</div></>}
      </div>
    </main>
    <footer className="player" aria-label="Reproductor de prueba"><div className="now-playing"><span className="mini-cover">l.</span><div><strong>{book?.title ?? 'Sobre la libertad y la lectura'}</strong><small>{currentChapter?.title ?? 'PÃ¡rrafo '+(index+1)} Â· {voice.replace('ef_', '').replace('em_', '')} Â· {state.wanted && !playing ? 'Preparando audioâ€¦' : `Fragmento ${state.part+1}`}</small></div></div><div className="transport"><button aria-label="PÃ¡rrafo anterior" disabled={calibrating || importing || index === 0} onClick={() => void choose(index - 1).catch(e => setError(message(e)))}>â”‚â—€</button><button className="play" disabled={calibrating || importing || !blocks.length} onClick={toggle} aria-label={state.wanted ? 'Pausar' : 'Escuchar'}>{state.wanted ? 'â…¡' : 'â–¶'}</button><button aria-label="PÃ¡rrafo siguiente" disabled={calibrating || importing || index >= blocks.length - 1} onClick={() => void choose(index + 1).catch(e => setError(message(e)))}>â–¶â”‚</button><span className="time">{Math.floor(seconds)} / {Math.floor(duration)} s</span></div><label className="speed">Velocidad<select aria-label="Velocidad" value={rate} onChange={e => { const next = Number(e.target.value); setRate(next); player.current?.setRate(next); }}>{rates.map(r => <option key={r} value={r}>{r}Ã—</option>)}</select></label><button className="save-quote" disabled={!book || importing || savingQuote || !blocks[state.block]?.text.trim()} onClick={() => void saveQuote()}>Guardar cita</button></footer>
    <audio ref={audio} preload="auto"/>
    {quoteFeedback && <div className="quote-feedback" role="status">{quoteFeedback}</div>}
  </div>;
}
