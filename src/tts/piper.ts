import * as ort from 'onnxruntime-web/wasm';
import { spanishPhonemes } from './phonemes';
import { piperIds } from './piper-ids';
import { splitForSpeech } from '../extraction/normalize';
import type { Engine, Synthesis } from '../types';
interface Config { audio: { sample_rate: number }; inference: { noise_scale: number; length_scale: number; noise_w: number }; phoneme_id_map: Record<string, number[]> }
let session: ort.InferenceSession | undefined;
let config: Config;
async function loadFile(name: string, progress: (text: string) => void) {
  const path = `/models/piper/${name}`;
  const cache = await caches.open('lumbre-piper-davefx-v1');
  const cached = await cache.match(path); if (cached) return cached.arrayBuffer();
  let response = await fetch(path);
  if (!response.ok || response.headers.get('content-type')?.includes('text/html')) {
    progress('Descargando voz Piper (aproximadamente 61 MB, solo la primera vez)…');
    response = await fetch(`https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/es/es_ES/davefx/medium/${name}`);
  }
  if (!response.ok) throw new Error(`No se pudo cargar Piper: HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  try { await cache.put(path, new Response(bytes)); } catch { progress('No se pudo guardar el modelo en cache; se usará durante esta sesión.'); }
  return bytes;
}
export async function synthesizePiper(text: string, requested: Engine, progress: (text: string) => void): Promise<Synthesis> {
  const start = performance.now();
  if (!session) {
    progress('Cargando la voz Piper en memoria…');
    ort.env.wasm.wasmPaths = '/runtime/';
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
    config = JSON.parse(new TextDecoder().decode(await loadFile('es_ES-davefx-medium.onnx.json', progress)));
    const bytes = await loadFile('es_ES-davefx-medium.onnx', progress);
    progress('Inicializando Piper. Esta carga se reutiliza para los próximos párrafos…');
    session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  }
  const loaded = performance.now();
  const parts = splitForSpeech(text, 400); const waves: Float32Array[] = [];
  for (const [i, part] of parts.entries()) {
    progress(`Generando voz Piper · fragmento ${i + 1} de ${parts.length}`);
    const ids = piperIds(await spanishPhonemes(part, false), config.phoneme_id_map);
    const input = {
      input: new ort.Tensor('int64', BigInt64Array.from(ids), [1, ids.length]),
      input_lengths: new ort.Tensor('int64', BigInt64Array.of(BigInt(ids.length)), [1]),
      scales: new ort.Tensor('float32', Float32Array.of(config.inference.noise_scale, config.inference.length_scale, config.inference.noise_w), [3]),
    };
    const outputs = await session.run(input);
    try {
      const wave = new Float32Array(Object.values(outputs)[0].data as Float32Array);
      if (!wave.length || !wave.every(Number.isFinite)) throw new Error('Piper devolvió audio inválido.');
      waves.push(wave);
    } finally { Object.values(input).forEach(t => t.dispose()); Object.values(outputs).forEach(t => t.dispose()); }
  }
  const samples = new Float32Array(waves.reduce((n, w) => n + w.length, 0)); let offset = 0;
  for (const wave of waves) { samples.set(wave, offset); offset += wave.length; }
  const audioSeconds = samples.length / config.audio.sample_rate;
  const generationMs = performance.now() - loaded;
  return { samples, sampleRate: config.audio.sample_rate, measurement: { voice: 'piper_davefx', requested, actual: 'piper-wasm', threads: ort.env.wasm.numThreads, loadMs: loaded - start, generationMs, audioSeconds, rtf: generationMs / 1000 / audioSeconds, pcmBytes: samples.byteLength } };
}
