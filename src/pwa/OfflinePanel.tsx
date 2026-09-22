import { useEffect, useState } from 'react';
import { offlineStatus, prepareOffline, type OfflineStatus } from './offline';

export function OfflinePanel({ bookId, title }: { bookId?: string; title?: string }) {
  const [state, setState] = useState<OfflineStatus>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { let alive = true; void offlineStatus(bookId).then(next => { if (alive) setState(next); }).catch(e => { if (alive) setError(String(e)); }); return () => { alive = false; }; }, [bookId]);
  useEffect(() => { const update = () => { void offlineStatus(bookId).then(setState).catch(e => setError(String(e))); }; window.addEventListener('online', update); window.addEventListener('offline', update); return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); }; }, [bookId]);
  async function prepare() { if (!bookId) return; setBusy(true); setError(''); try { setState(await prepareOffline(bookId, setMessage)); setMessage('Listo para escuchar sin conexión.'); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }
  return <details className="offline-panel" aria-label="Escuchar offline"><summary><span><strong>Escuchar offline</strong><small>{state?.ready ? 'Listo en este dispositivo' : title ? `Preparar «${title}»` : 'Preparar después de agregar un PDF'}</small></span><span className="offline-state">{state?.ready ? 'Listo' : state?.online === false ? 'Sin conexión' : 'Opcional'}</span></summary><div className="offline-body"><p>Descarga la aplicación, Dora y el libro para escuchar sin internet. El audio se genera mientras avanzás.</p><p className="offline-checks">Aplicación {state?.app ? '✓' : '○'} · Libro {state?.book ? '✓' : '○'} · Dora {state?.dora ? '✓' : '○'}</p>{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}<button disabled={busy || !bookId || !state?.supported} onClick={() => void prepare()}>{busy ? 'Preparando...' : state?.ready ? 'Comprobar recursos' : 'Preparar offline'}</button></div></details>;
}
