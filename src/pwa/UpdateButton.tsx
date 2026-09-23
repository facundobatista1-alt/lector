import { useState } from 'react';
export function UpdateButton({ beforeReload }: { beforeReload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function update() {
    setBusy(true); setError('');
    try {
      await beforeReload();
      const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
      if (registration && navigator.onLine) {
        await registration.update();
        const worker = registration.installing ?? registration.waiting;
        if (worker && worker.state !== 'activated') await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => { worker.removeEventListener('statechange', check); reject(new Error('La actualización sigue descargándose. Intentá nuevamente.')); }, 20000);
          const check = () => { if (worker.state === 'activated' || worker.state === 'redundant') { clearTimeout(timer); worker.removeEventListener('statechange', check); resolve(); } };
          worker.addEventListener('statechange', check); check();
        });
      }
      window.location.reload();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }
  return <span><button disabled={busy} onClick={() => void update()}>{busy ? 'Actualizando…' : 'Actualizar app'}</button>{error && <small role="alert">{error}</small>}</span>;
}
