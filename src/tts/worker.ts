import { synthesize } from './engine';
import type { Engine, Voice } from '../types';
const scope = self as unknown as { onmessage: ((event: MessageEvent) => void) | null; postMessage(message: unknown, transfer?: Transferable[]): void };
scope.onmessage = async (event: MessageEvent<{ text: string; voice: Voice; engine: Engine }>) => {
  try {
    const { text, voice, engine } = event.data;
    const progress = (message: string) => scope.postMessage({ type: 'progress', message });
    const result = voice === 'piper_davefx'
      ? await (await import('./piper')).synthesizePiper(text, engine, progress)
      : await synthesize(text, voice, engine, progress);
    scope.postMessage({ type: 'result', result }, [result.samples.buffer as ArrayBuffer]);
  } catch (error) { scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) }); }
};
