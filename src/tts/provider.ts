import type { Engine, Synthesis, TTSProvider, Voice } from '../types';
export class LocalTTSProvider implements TTSProvider {
  private worker?: Worker;
  private reject?: (error: Error) => void;
  private family?: string;
  synthesize(text: string, voice: Voice, engine: Engine, progress: (message: string) => void): Promise<Synthesis> {
    if (this.reject) return Promise.reject(new Error('Ya hay una síntesis en curso.'));
    const family = voice === 'piper_davefx' ? 'piper' : 'kokoro';
    if (this.family && this.family !== family) this.dispose();
    this.family = family;
    this.worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    return new Promise((resolve, reject) => {
      this.reject = reject;
      this.worker!.onmessage = event => {
        if (event.data.type === 'progress') progress(event.data.message);
        else if (event.data.type === 'result') { this.reject = undefined; resolve(event.data.result); }
        else { this.reject = undefined; reject(new Error(event.data.message)); }
      };
      this.worker!.onerror = event => { this.dispose(); reject(new Error(event.message || 'El worker de voz se detuvo.')); };
      this.worker!.postMessage({ text, voice, engine });
    });
  }
  dispose() { this.worker?.terminate(); this.worker = undefined; this.reject?.(new Error('Síntesis cancelada.')); this.reject = undefined; }
}
