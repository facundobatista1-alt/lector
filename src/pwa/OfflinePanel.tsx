import { useEffect, useState } from 'react';
import { offlineStatus, prepareOffline, type OfflineStatus } from './offline';

export function OfflinePanel({bookId,title}:{bookId?:string;title?:string}){
  const appleMobile=/iPhone|iPad|iPod/i.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
  const [state,setState]=useState<OfflineStatus>();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{let alive=true;void offlineStatus(bookId).then(next=>{if(alive)setState(next);}).catch(e=>{if(alive)setError(String(e));});return()=>{alive=false;};},[bookId]);
  useEffect(()=>{const update=()=>{void offlineStatus(bookId).then(setState).catch(e=>setError(String(e)));};window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[bookId]);
  async function prepare(){if(!bookId)return;setBusy(true);setError('');try{const next=await prepareOffline(bookId,setMessage);setState(next);setMessage('Listo para escuchar offline con Dora · WASM Q8.');}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  return <section className="offline-panel" aria-label="Escuchar offline"><div><h2>Escuchar offline</h2><p>{title?`Preparar «${title}» con Dora · WASM Q8.`:'Agregá un PDF para preparar la escucha offline.'}</p>
    <p className="offline-checks">Aplicación {state?.app?'✓':'○'} · Libro {state?.book?'✓':'○'} · Dora {state?.dora?'✓':'○'} · Motor {state?.runtime?'✓':'○'}</p>
    {state?.ready&&<p className="offline-ready">Listo para abrir y escuchar sin conexión.{state.persistent===false?' El navegador puede liberar espacio y borrar el modelo.':''}</p>}
    {appleMobile&&<p>En iPhone: abrí Lumbre en Safari desde una dirección HTTPS, tocá Compartir → Agregar a pantalla de inicio. La reproducción con pantalla bloqueada y la velocidad de Dora requieren prueba en tu teléfono.</p>}
    {!state?.online&&<p>Sin conexión. Los recursos ya preparados siguen disponibles.</p>}
    {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
    <small>Descarga inicial aproximada: 130 MB. Dejá Lumbre abierta hasta que termine. El PDF y el índice ya están guardados en este navegador. El audio del libro se genera por fragmentos.</small>
  </div><button disabled={busy||!bookId||!state?.supported} onClick={()=>void prepare()}>{busy?'Preparando…':state?.ready?'Comprobar y reparar':'Preparar para escuchar offline'}</button></section>;
}
