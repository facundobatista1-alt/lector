export const MODEL_REVISION = '1939ad2';
const BASE = `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/${MODEL_REVISION}`;
export async function asset(path: string, progress: (message: string) => void): Promise<ArrayBuffer> {
  const cache = await caches.open(`lumbre-models-${MODEL_REVISION}`);
  const local = new URL(`/models/kokoro/${path}`, self.location.origin).href;
  const cached = await cache.match(local); if (cached) return cached.arrayBuffer();
  let response = await fetch(local);
  // Vite may return the HTML shell for a missing local file.
  if (!response.ok || response.headers.get('content-type')?.includes('text/html')) {
    progress(`Descargando ${path}. El texto permanece en este dispositivo.`);
    response = await fetch(`${BASE}/${path}`);
  }
  if (!response.ok) throw new Error(`No se pudo descargar ${path}: HTTP ${response.status}. Revisá la conexión o ejecutá npm run models.`);
  const total = Number(response.headers.get('content-length'));
  const reader = response.body?.getReader(); if (!reader) throw new Error('Descarga sin contenido.');
  const chunks: Uint8Array[] = []; let received = 0; let lastUpdate = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); received += value.length; if (performance.now() - lastUpdate > 300) { progress(`${path}: ${(received / 1048576).toFixed(1)} MB${total ? ` / ${(total / 1048576).toFixed(1)} MB` : ''}`); lastUpdate = performance.now(); } }
  const bytes = new Uint8Array(received); let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
  try { await cache.put(local, new Response(bytes)); } catch (error) { progress(`El modelo no quedó guardado (${error instanceof Error ? error.message : String(error)}). Esta sesión puede continuar.`); }
  return bytes.buffer;
}
