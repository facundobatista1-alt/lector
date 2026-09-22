interface EspeakWorker { set_voice(voice: string): void; synthesize_ipa(text: string): { code: number; ipa: string } }
let worker: EspeakWorker | undefined;
async function phonemizeSpanish(text: string): Promise<string> {
  if (!worker) {
    const inNode = typeof process !== 'undefined' && !!process.versions?.node;
    let modulePath = inNode ? '@echogarden/espeak-ng-emscripten' : new URL('/runtime/espeak-ng.js', self.location.origin).href;
    if (!inNode && !navigator.onLine) {
      const cached = await caches.match(modulePath);
      if (!cached) throw new Error('Falta el fonemizador. Prepará este libro para escuchar offline.');
      modulePath = URL.createObjectURL(new Blob([await cached.blob()], { type: 'text/javascript' }));
    }
    const { default: initialize } = await import(/* @vite-ignore */ modulePath);
    let data: ArrayBuffer | undefined;
    if (!inNode) {
      const response = !navigator.onLine ? await caches.match('/runtime/espeak-ng.data') : await fetch('/runtime/espeak-ng.data');
      if (!response?.ok) throw new Error('No se encuentran los datos del fonemizador. Prepará este libro para escuchar offline.');
      data = await response.arrayBuffer();
    }
    const module = await initialize(data ? { getPreloadedPackage: () => data } : {});
    worker = new module.eSpeakNGWorker() as EspeakWorker;
    worker.set_voice('es');
  }
  const result = worker.synthesize_ipa(text);
  if (result.code !== 0) throw new Error(`Falló la fonemización española: ${result.code}`);
  return result.ipa.replace(/_/g, '').replace(/\n/g, ' ').trim();
}
export async function spanishPhonemes(text: string, kokoro = true): Promise<string> {
  const pieces = text.normalize('NFC').split(/([;:,.!?—…“”"()]+)/u).filter(Boolean);
  let result = '';
  for (const piece of pieces) {
    if (/^[;:,.!?—…“”"()]+$/u.test(piece)) result += piece;
    else result += (piece.startsWith(' ') ? ' ' : '') + await phonemizeSpanish(piece.replace(/[¡¿]/g, '')) + (piece.endsWith(' ') ? ' ' : '');
  }
  result = result.replace(/\([a-z-]+\)/g, '').replace(/\s+/g, ' ').trim();
  return kokoro ? result.replace(/tʃ/g, 'ʧ').replace(/dʒ/g, 'ʤ') : result;
}
export function tokenIds(phonemes: string, vocab: Record<string, number>): bigint[] {
  const ids = [...phonemes].flatMap(c => vocab[c] === undefined ? [] : [BigInt(vocab[c])]);
  if (!ids.length) throw new Error('El texto no produjo fonemas compatibles.');
  if (ids.length > 500) throw new Error('Segmento demasiado largo: se requiere subdividirlo, nunca truncarlo.');
  return [0n, ...ids, 0n];
}
