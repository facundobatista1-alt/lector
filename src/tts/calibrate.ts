import { db } from '../storage/db';
import { LocalTTSProvider } from './provider';
import type { Engine, Measurement } from '../types';
export const CALIBRATION_TEXT = 'La libertad no consiste solamente en la ausencia de obstáculos. También exige preguntarnos qué deseamos hacer y por qué lo deseamos.';
export function fastestEngine(measurements: Measurement[]): Engine {
  const tested = measurements.filter(m => m.notes === 'dora-calibration-v1' && m.voice === 'ef_dora' && ['wasm','webgpu'].includes(m.actual));
  const latest = ['wasm','webgpu'].map(engine => tested.filter(m => m.actual === engine).sort((a,b) => b.createdAt-a.createdAt)[0]).filter(Boolean);
  const cpu = latest.find(m => m.actual === 'wasm');
  const gpu = latest.find(m => m.actual === 'webgpu');
  // A tiny difference from one sample is not evidence for loading 300+ MB.
  if (cpu && gpu && gpu.rtf >= cpu.rtf * .9) return 'wasm';
  return latest.sort((a,b) => a.rtf-b.rtf)[0]?.actual as Engine ?? 'wasm';
}
export async function calibratedEngine(): Promise<Engine> { return fastestEngine(await db.measurements.toArray()); }
export async function calibrateDora(progress: (text: string) => void, signal: AbortSignal) {
  const results: Measurement[] = [];
  for (const engine of ['wasm','webgpu'] as const) {
    if (signal.aborted) throw new Error('Comparación cancelada.');
    const provider = new LocalTTSProvider();
    const abort = () => provider.dispose(); signal.addEventListener('abort',abort);
    try {
      const result = await provider.synthesize(CALIBRATION_TEXT,'ef_dora',engine,text => progress(`${engine.toUpperCase()} · ${text}`));
      if (signal.aborted) throw new Error('Comparación cancelada.');
      const measurement = { ...result.measurement, createdAt: Date.now(), userAgent: navigator.userAgent, notes: 'dora-calibration-v1' };
      await db.measurements.add(measurement); results.push(measurement);
    } catch (error) { if (signal.aborted || engine === 'wasm') throw error; progress(`WebGPU no disponible: ${String(error)}. Se conserva WASM.`); }
    finally { signal.removeEventListener('abort',abort); provider.dispose(); }
  }
  return fastestEngine(results);
}
