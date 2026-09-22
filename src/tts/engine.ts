import type { InferenceSession } from 'onnxruntime-web';
import { asset } from './assets';
import { spanishPhonemes, tokenIds } from './phonemes';
import { splitForSpeech } from '../extraction/normalize';
import { RUNTIME_CACHE } from '../pwa/resources';
import type { Engine, Synthesis, Voice } from '../types';
let ort: typeof import('onnxruntime-web');
let session: InferenceSession | undefined;
let actual = '';
let vocab: Record<string, number>;
const voices = new Map<string, Float32Array>();
async function initialize(engine: 'wasm' | 'webgpu', progress: (message: string) => void) {
  if (session && actual === engine) return;
  if (session) { await session.release(); session = undefined; }
  ort = engine === 'wasm' ? await import('onnxruntime-web/wasm') : await import('onnxruntime-web/webgpu');
  // iOS WebKit may expose cross-origin isolation without reliably supporting
  // the worker/thread combination used by ONNX Runtime Web.
  const appleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  ort.env.wasm.numThreads = !appleMobile && self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  if (!navigator.onLine && engine === 'wasm') {
    const cache = await caches.open(RUNTIME_CACHE);
    const mjs = await cache.match('/runtime/ort-wasm-simd-threaded.mjs');
    const wasm = await cache.match('/runtime/ort-wasm-simd-threaded.wasm');
    if (!mjs || !wasm) throw new Error('Falta el motor de Dora. Prepará este libro para escuchar offline.');
    ort.env.wasm.wasmPaths = { mjs: URL.createObjectURL(await mjs.blob()), wasm: URL.createObjectURL(await wasm.blob()) };
  } else ort.env.wasm.wasmPaths = '/runtime/';
  const filename = engine === 'wasm' ? 'model_quantized.onnx' : 'model.onnx';
  progress(`Cargando Kokoro · ${engine.toUpperCase()}`);
  const data = await asset(`onnx/${filename}`, progress);
  session = await ort.InferenceSession.create(data, { executionProviders: engine === 'webgpu' ? ['webgpu', 'wasm'] : ['wasm'], graphOptimizationLevel: 'all' }); actual = engine;
  const tokenizer = JSON.parse(new TextDecoder().decode(await asset('tokenizer.json', progress)));
  vocab = tokenizer.model.vocab;
}
async function run(text: string, voice: Voice, progress: (message: string) => void) {
  if (!session) throw new Error('Modelo no cargado.');
  if (!voices.has(voice)) voices.set(voice, new Float32Array(await asset(`voices/${voice}.bin`, progress)));
  const data = voices.get(voice)!;
  const chunks = splitForSpeech(text); const audio: Float32Array[] = [];
  async function segment(chunk: string): Promise<void> {
    const phonemes = await spanishPhonemes(chunk);
    if ([...phonemes].length > 500) {
      const split = splitForSpeech(chunk, Math.max(20, Math.floor(chunk.length / 2)));
      if (split.length < 2) throw new Error('No se pudo dividir este segmento.');
      for (const sub of split) await segment(sub); return;
    }
    const ids = tokenIds(phonemes, vocab); const n = ids.length - 2;
    const style = data.slice(n * 256, (n + 1) * 256);
    if (style.length !== 256) throw new Error('Archivo de voz inválido.');
    const input = { input_ids: new ort.Tensor('int64', BigInt64Array.from(ids), [1, ids.length]), style: new ort.Tensor('float32', style, [1, 256]), speed: new ort.Tensor('float32', Float32Array.of(1), [1]) };
    const outputs = await session!.run(input);
    try {
      const waveform = outputs.waveform ?? Object.values(outputs)[0];
      const samples = new Float32Array(waveform.data as Float32Array);
      if (!samples.length || !samples.every(Number.isFinite)) throw new Error('El modelo devolvió audio inválido.');
      audio.push(samples);
    } finally { Object.values(outputs).forEach(t => t.dispose()); Object.values(input).forEach(t => t.dispose()); }
  }
  for (let i = 0; i < chunks.length; i++) { progress(`Sintetizando fragmento ${i + 1} de ${chunks.length} · ${actual.toUpperCase()}`); await segment(chunks[i]); }
  const samples = new Float32Array(audio.reduce((n, a) => n + a.length, 0)); let offset = 0;
  for (const a of audio) { samples.set(a, offset); offset += a.length; }
  return samples;
}
export async function synthesize(text: string, voice: Voice, engine: Engine, progress: (message: string) => void): Promise<Synthesis> {
  const nav = navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> }; deviceMemory?: number };
  let selected: 'wasm' | 'webgpu' = engine === 'webgpu' ? 'webgpu' : 'wasm';
  if (engine === 'auto' && (nav.deviceMemory ?? 8) > 4 && nav.gpu) { try { if (await nav.gpu.requestAdapter()) selected = 'webgpu'; } catch { /* WASM remains available. */ } }
  const start = performance.now(); let loaded: number; let fallback: string | undefined;
  let samples: Float32Array;
  try { await initialize(selected, progress); if (!voices.has(voice)) voices.set(voice, new Float32Array(await asset(`voices/${voice}.bin`, progress))); loaded = performance.now(); samples = await run(text, voice, progress); }
  catch (error) {
    if (engine !== 'auto' || selected !== 'webgpu') throw error;
    fallback = `WebGPU falló: ${String(error)}`; progress('WebGPU no pudo ejecutar el modelo. Probando WASM…');
    await initialize('wasm', progress); if (!voices.has(voice)) voices.set(voice, new Float32Array(await asset(`voices/${voice}.bin`, progress))); loaded = performance.now(); samples = await run(text, voice, progress);
  }
  const generationMs = performance.now() - loaded; const duration = samples.length / 24000;
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return { samples, sampleRate: 24000, measurement: { voice, requested: engine, actual, threads: ort.env.wasm.numThreads, loadMs: loaded - start, generationMs, audioSeconds: duration, rtf: generationMs / 1000 / duration, pcmBytes: samples.byteLength, jsHeapBytes: memory?.usedJSHeapSize, fallback } };
}
