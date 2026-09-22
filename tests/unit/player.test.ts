import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { BookPlayer } from '../../src/audio/player';
import { db } from '../../src/storage/db';
import type { Synthesis, TTSProvider } from '../../src/types';
class AudioStub extends EventTarget {
  private source = ''; currentTime = 0; duration = 5; playbackRate = 1; preservesPitch = true; readyState = 1; paused = true;
  set src(value: string) { this.source = value; this.currentTime = 0; queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata'))); }
  get src() { return this.source; }
  play() { this.paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve(); }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
  removeAttribute() { this.source = ''; } load() { /* No network in unit test. */ }
}
const sample: Synthesis = { samples: new Float32Array(120000),sampleRate:24000,measurement:{voice:'ef_dora',requested:'wasm',actual:'wasm',loadMs:0,generationMs:1,audioSeconds:5,rtf:.1,pcmBytes:480000} };
const blocks = Array.from({length:8},(_,i) => ({id:String(i),text:`Párrafo ${i}.`,page:1,pageLabel:'1',endPage:1}));
const players: BookPlayer[] = [];
afterEach(async () => { players.splice(0).forEach(p => p.dispose()); await db.audio.clear(); await db.positions.clear(); await db.measurements.clear(); vi.unstubAllGlobals(); });
it('activa el mismo elemento de audio durante el toque en iPhone y luego reproduce Dora', async () => {
  vi.stubGlobal('navigator',{userAgent:'iPhone',onLine:true});
  const audio = new AudioStub(); const play = vi.spyOn(audio,'play');
  let complete!: (value:Synthesis) => void;
  const provider = {synthesize:vi.fn(() => new Promise<Synthesis>(resolve => {complete=resolve;})),dispose:vi.fn()};
  const player = new BookPlayer(audio as unknown as HTMLAudioElement,provider,() => {},() => {},{startSeconds:0,targetSeconds:5}); players.push(player);
  player.configure('iphone-play',blocks,'ef_dora','wasm',1);
  player.start();
  expect(play).toHaveBeenCalledTimes(1);
  expect(player.state.playing).toBe(false);
  await vi.waitFor(() => expect(provider.synthesize).toHaveBeenCalledTimes(1));
  complete(sample);
  await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(2));
  expect(player.state.playing).toBe(true);
});
it('limita la cola, pausa durante generación y sigue al terminar el audio', async () => {
  const audio = new AudioStub();
  let complete!: (value: Synthesis) => void;
  const synthesize = vi.fn().mockImplementationOnce(() => new Promise<Synthesis>(resolve => { complete = resolve; })).mockResolvedValue(sample);
  const provider: TTSProvider = { synthesize,dispose() {} };
  const player = new BookPlayer(audio as unknown as HTMLAudioElement,provider,() => {},() => {},{startSeconds:0,targetSeconds:20}); players.push(player);
  player.configure('queue-test',blocks,'ef_dora','wasm',1);
  player.start(); player.pause();
  await vi.waitFor(() => expect(synthesize).toHaveBeenCalledTimes(1)); complete(sample);
  await vi.waitFor(() => expect(player.state.buffered).toBe(3));
  expect(synthesize).toHaveBeenCalledTimes(4); expect(audio.paused).toBe(true);
  player.start(); await vi.waitFor(() => expect(audio.paused).toBe(false));
  audio.dispatchEvent(new Event('ended'));
  await vi.waitFor(() => expect(player.state.block).toBe(1));
  await vi.waitFor(() => expect(synthesize).toHaveBeenCalledTimes(5));
  audio.currentTime = 2; audio.dispatchEvent(new Event('timeupdate')); player.pause(); await player.persist();
  expect(await db.positions.get('queue-test')).toMatchObject({block:1,segment:0,seconds:2});
});
it('ignora una síntesis obsoleta después de saltar de párrafo', async () => {
  const audio = new AudioStub(); let old!: (value:Synthesis) => void;
  const provider = { synthesize: vi.fn().mockImplementationOnce(() => new Promise<Synthesis>(resolve => { old = resolve; })).mockResolvedValue(sample),dispose:vi.fn() };
  const player = new BookPlayer(audio as unknown as HTMLAudioElement,provider,() => {},() => {}); players.push(player);
  player.configure('seek-test',blocks,'ef_dora','wasm',1); player.start();
  await vi.waitFor(() => expect(provider.synthesize).toHaveBeenCalledTimes(1));
  await player.select(5,true); old(sample);
  await vi.waitFor(() => expect(player.state.ready).toBe(true));
  expect(player.state.block).toBe(5); expect(provider.dispose).toHaveBeenCalled();
});
it('al tocar un párrafo cambia la posición antes de terminar la escritura anterior', async () => {
  const audio=new AudioStub();const provider={synthesize:vi.fn().mockResolvedValue(sample),dispose:vi.fn()};
  const player=new BookPlayer(audio as unknown as HTMLAudioElement,provider,()=>{},()=>{});players.push(player);
  player.configure('quick-seek',blocks,'ef_dora','wasm',1);
  const selected=player.select(5,false);
  expect(player.state.block).toBe(5);
  await selected;
  expect((await db.positions.get('quick-seek'))?.block).toBe(5);
});
it('Automático recupera una caída de GPU usando WASM', async () => {
  await db.measurements.add({...sample.measurement,actual:'webgpu',rtf:.5,createdAt:1,userAgent:'test',notes:'dora-calibration-v1'});
  const provider = {synthesize:vi.fn().mockRejectedValueOnce(new Error('GPU perdida')).mockResolvedValue(sample),dispose:vi.fn()};
  const player = new BookPlayer(new AudioStub() as unknown as HTMLAudioElement,provider,() => {},() => {}); players.push(player);
  player.configure('fallback-test',blocks,'ef_dora','auto',1); player.prepare();
  await vi.waitFor(() => expect(player.state.ready).toBe(true));
  expect(provider.synthesize.mock.calls[0][2]).toBe('webgpu');
  expect(provider.synthesize.mock.calls[1][2]).toBe('wasm');
  expect(player.state.error).toBe('');
});
it('prepara al abrir sin reproducir y Play espera la reserva', async () => {
  const audio = new AudioStub(); const pending: ((value:Synthesis) => void)[] = [];
  const provider = {synthesize:vi.fn(() => new Promise<Synthesis>(resolve => pending.push(resolve))),dispose:vi.fn()};
  const player = new BookPlayer(audio as unknown as HTMLAudioElement,provider,() => {},() => {},{startSeconds:10,targetSeconds:15}); players.push(player);
  player.configure('reserve-test',blocks,'ef_dora','wasm',1); player.prepareAhead();
  await vi.waitFor(() => expect(pending).toHaveLength(1)); pending[0](sample);
  await vi.waitFor(() => expect(pending).toHaveLength(2));
  expect(audio.paused).toBe(true); player.start(); expect(audio.paused).toBe(true);
  pending[1](sample); await vi.waitFor(() => expect(audio.paused).toBe(false));
  await vi.waitFor(() => expect(pending).toHaveLength(3)); pending[2](sample);
  await vi.waitFor(() => expect(player.state.busy).toBe(false));
  expect(player.state.reserveSeconds).toBe(15); expect(provider.synthesize).toHaveBeenCalledTimes(3);
});
it('salta bloques omitidos al restaurar y guarda final explícito del libro', async () => {
  const audio = new AudioStub(); const provider = {synthesize:vi.fn().mockResolvedValue(sample),dispose:vi.fn()};
  const player = new BookPlayer(audio as unknown as HTMLAudioElement,provider,() => {},() => {},{startSeconds:0,targetSeconds:20}); players.push(player);
  player.configure('finished-test',[{...blocks[0],text:''},blocks[1]],'ef_dora','wasm',1,{bookId:'finished-test',block:0,segment:0,seconds:2,voice:'ef_dora',rate:1,updatedAt:0});
  expect(player.state.block).toBe(1); expect(player.state.seconds).toBe(0);
  player.start(); await vi.waitFor(() => expect(audio.paused).toBe(false));
  audio.dispatchEvent(new Event('ended')); await player.persist();
  expect(await db.positions.get('finished-test')).toMatchObject({block:1,completed:true});
  player.start(); await player.persist();
  expect(await db.positions.get('finished-test')).toMatchObject({block:1,completed:false,seconds:0});
});
