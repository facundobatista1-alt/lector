import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { BookPlayer } from '../../src/audio/player';
import { audioKey, db } from '../../src/storage/db';
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
it('Continuar reproduce el fragmento guardado sin esperar 30 segundos de reserva', async () => {
  const wav=new Blob(['cached-audio']);
  await db.audio.put({key:await audioKey(blocks[0].text,'ef_dora','wasm'),wav,bytes:wav.size,duration:5,touchedAt:1});
  let finish!: (value:Synthesis)=>void;
  const provider={synthesize:vi.fn(()=>new Promise<Synthesis>(resolve=>{finish=resolve;})),dispose:vi.fn()};
  const audio=new AudioStub();
  const player=new BookPlayer(audio as unknown as HTMLAudioElement,provider,()=>{},()=>{});players.push(player);
  player.configure('resume-cached',blocks.slice(0,2),'ef_dora','wasm',1);
  player.start();
  await vi.waitFor(()=>expect(audio.paused).toBe(false));
  expect(player.state.reserveSeconds).toBeLessThan(30);
  await vi.waitFor(()=>expect(provider.synthesize).toHaveBeenCalledTimes(1));
  finish(sample);
  await vi.waitFor(()=>expect(player.state.busy).toBe(false));
});
it('prepara todo aunque se pause y reutiliza el audio después de volver a abrir', async () => {
  const provider = {synthesize:vi.fn().mockResolvedValue(sample),dispose:vi.fn()};
  const player = new BookPlayer(new AudioStub() as unknown as HTMLAudioElement,provider,()=>{},()=>{},{startSeconds:0,targetSeconds:5}); players.push(player);
  player.configure('whole-book',blocks,'ef_dora','wasm',1);
  player.prepareAll(); player.start(); player.pause();
  await vi.waitFor(() => expect(player.state.buffered).toBe(7));
  expect(await db.audio.count()).toBe(8);
  expect(provider.synthesize).toHaveBeenCalledTimes(8);
  await player.select(5,false);
  await vi.waitFor(() => expect(player.state.busy).toBe(false));
  player.configure('whole-book',blocks,'ef_dora','wasm',1);
  player.start();
  await vi.waitFor(() => expect(player.state.buffered).toBe(7));
  expect(provider.synthesize).toHaveBeenCalledTimes(8);
});
it('lee WAV guardados mientras una síntesis lejana sigue pendiente', async () => {
  const extended=[...blocks,{...blocks[0],id:'last',text:'Último párrafo pendiente.'}];
  for (const block of blocks) {
    const wav=new Blob(['cached-audio']);
    await db.audio.put({key:await audioKey(block.text,'ef_dora','wasm'),wav,bytes:wav.size,duration:5,touchedAt:1});
  }
  let finish!: (value:Synthesis)=>void;
  const provider={synthesize:vi.fn(()=>new Promise<Synthesis>(resolve=>{finish=resolve;})),dispose:vi.fn()};
  const audio=new AudioStub();
  const player=new BookPlayer(audio as unknown as HTMLAudioElement,provider,()=>{},()=>{},{startSeconds:0,targetSeconds:5});players.push(player);
  player.configure('cached-continuity',extended,'ef_dora','wasm',1);player.start();
  await vi.waitFor(()=>expect(provider.synthesize).toHaveBeenCalledTimes(1));
  for(let block=1;block<=5;block++) {
    audio.paused=true;audio.dispatchEvent(new Event('ended'));
    await vi.waitFor(()=>{expect(player.state.block).toBe(block);expect(audio.paused).toBe(false);});
  }
  expect(player.state.busy).toBe(true);
  finish(sample);
  await vi.waitFor(()=>expect(player.state.preparedCount).toBe(9));
});
it('al saltar prioriza la nueva posición y después completa lo anterior', async () => {
  const provider={synthesize:vi.fn().mockResolvedValue(sample),dispose:vi.fn()};
  const player=new BookPlayer(new AudioStub() as unknown as HTMLAudioElement,provider,()=>{},()=>{});players.push(player);
  player.configure('jump-fill',blocks,'ef_dora','wasm',1);
  await player.select(5,false);
  await vi.waitFor(()=>expect(player.state.preparedCount).toBe(8));
  expect(provider.synthesize.mock.calls[0][0]).toBe(blocks[5].text);
  expect(await db.audio.count()).toBe(8);
});
it('no renueva un avance sin cambios y restaura un avance remoto estando en pausa', async () => {
  const provider = {synthesize:vi.fn().mockResolvedValue(sample),dispose:vi.fn()};
  const player = new BookPlayer(new AudioStub() as unknown as HTMLAudioElement,provider,()=>{},()=>{}); players.push(player);
  const saved = {bookId:'remote',block:0,segment:0,seconds:2,rate:1,voice:'ef_dora' as const,engine:'wasm' as const,updatedAt:100};
  await db.positions.put(saved);
  player.configure('remote',blocks,'ef_dora','wasm',1,saved);
  await player.persist();
  expect((await db.positions.get('remote'))?.updatedAt).toBe(100);
  expect(player.restoreRemote('remote',blocks,{...saved,block:5,updatedAt:200})).toBe(true);
  expect(player.state.block).toBe(5);
});
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
it('Play prepara todo, continúa en pausa y sigue al terminar el audio', async () => {
  const audio = new AudioStub();
  let complete!: (value: Synthesis) => void;
  const synthesize = vi.fn().mockImplementationOnce(() => new Promise<Synthesis>(resolve => { complete = resolve; })).mockResolvedValue(sample);
  const provider: TTSProvider = { synthesize,dispose() {} };
  const player = new BookPlayer(audio as unknown as HTMLAudioElement,provider,() => {},() => {},{startSeconds:0,targetSeconds:20}); players.push(player);
  player.configure('queue-test',blocks,'ef_dora','wasm',1);
  player.start(); player.pause();
  await vi.waitFor(() => expect(synthesize).toHaveBeenCalledTimes(1)); complete(sample);
  await vi.waitFor(() => expect(player.state.preparedCount).toBe(8));
  expect(synthesize).toHaveBeenCalledTimes(8); expect(audio.paused).toBe(true);
  player.start(); await vi.waitFor(() => expect(audio.paused).toBe(false));
  audio.dispatchEvent(new Event('ended'));
  await vi.waitFor(() => expect(player.state.block).toBe(1));
  expect(synthesize).toHaveBeenCalledTimes(8);
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
  for (let i=3;i<8;i++) { await vi.waitFor(() => expect(pending).toHaveLength(i+1)); pending[i](sample); }
  await vi.waitFor(() => expect(player.state.busy).toBe(false));
  expect(player.state.reserveSeconds).toBe(40); expect(provider.synthesize).toHaveBeenCalledTimes(8);
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
