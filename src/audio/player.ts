import type { AudioRecord, Block, Engine, Position, TTSProvider, Voice } from '../types';
import { audioKey, db, savePosition, trimAudio } from '../storage/db';
import { encodeWav } from './wav';
import { speechSegments, type SpeechSegment } from './segments';
import { calibratedEngine } from '../tts/calibrate';

export interface PlayerState {
  block: number; part: number; seconds: number; duration: number; playing: boolean; wanted: boolean;
  busy: boolean; ready: boolean; buffered: number; reserveSeconds: number; status: string; error: string; firstAudioMs?: number;
}
export const initialPlayer: PlayerState = { block: 0, part: 0, seconds: 0, duration: 0, playing: false, wanted: false, busy: false, ready: false, buffered: 0, reserveSeconds: 0, status: 'Pulsá Escuchar para empezar.', error: '' };
export class BookPlayer {
  state = { ...initialPlayer };
  private segments: SpeechSegment[] = [];
  private cursor = 0;
  private epoch = 0;
  private running = false;
  private loaded = -1;
  private ready = new Map<number, AudioRecord>();
  private url = '';
  private primeUrl = '';
  private priming = false;
  private bookId = 'demo';
  private voice: Voice = 'ef_dora';
  private engine: Engine = 'wasm';
  private speed = 1;
  private ahead = 0;
  private automatic = false;
  private buffering = true;
  private fillToEnd = false;
  private startTime = 0;
  private savedTime = 0;
  private completed = false;
  private lastSavedAt = 0;
  private timer: ReturnType<typeof setInterval>;
  private listeners: Array<[string, EventListener]> = [];
  constructor(private audio: HTMLAudioElement, private provider: TTSProvider, private change: (state: PlayerState) => void, private measured: () => void, private policy = { startSeconds: 30, targetSeconds: 300 }) {
    const on = (name: string, fn: () => void) => { audio.addEventListener(name, fn); this.listeners.push([name,fn]); };
    on('loadedmetadata', () => {
      if (this.priming) return;
      audio.currentTime = Math.min(this.savedTime, Math.max(0,audio.duration-.1));
      audio.playbackRate = this.speed; audio.preservesPitch = true;
      if (this.state.wanted) this.playLoaded();
    });
    on('play', () => { if (this.priming) return; if (this.state.wanted) this.patch({ playing: true }); else audio.pause(); });
    on('pause', () => { this.patch({ playing: false }); });
    on('timeupdate', () => { if (this.loaded === this.cursor) { this.savedTime = audio.currentTime; this.patch({ seconds: audio.currentTime, reserveSeconds: this.reserve()/this.speed }); } });
    on('ended', () => {
      if (!this.state.wanted) return;
      if (this.cursor + 1 >= this.segments.length) { this.completed = true; this.patch({ wanted: false, playing: false, status: 'Lectura terminada.' }); void this.persist(); return; }
      this.cursor++; this.savedTime = 0; this.loaded = -1;
      this.patchCursor(); void this.persist(); this.present(); this.pump();
    });
    on('error', () => this.fail(new Error('No se pudo reproducir el audio local.')));
    this.timer = setInterval(() => { if (this.state.wanted || this.state.playing) { void this.persist(); this.pump(); } }, 1000);
  }
  private patch(next: Partial<PlayerState>) { this.state = { ...this.state, ...next }; this.change(this.state); }
  private patchCursor() {
    const segment = this.segments[this.cursor];
    this.patch({ block: segment?.block ?? 0, part: segment?.part ?? 0, seconds: this.savedTime, duration: 0, ready: false, playing: false });
  }
  async persist() {
    if (!this.segments[this.cursor]) return;
    const segment = this.segments[this.cursor];
    this.lastSavedAt = Math.max(Date.now(),this.lastSavedAt+1);
    const position: Position = { bookId: this.bookId, block: segment.block, segment: segment.part, textOffset: segment.offset, seconds: this.savedTime, rate: this.speed, voice: this.voice, engine: this.engine, completed:this.completed, updatedAt: this.lastSavedAt };
    try { await savePosition(position); } catch (error) { this.patch({ error: `No se pudo guardar la posición: ${String(error)}` }); }
  }
  configure(bookId: string, blocks: Block[], voice: Voice, engine: Engine, rate: number, position?: Position) {
    this.stop(); this.bookId = bookId; this.voice = voice; this.engine = engine; this.speed = rate;
    this.lastSavedAt = Math.max(this.lastSavedAt,position?.updatedAt ?? 0);
    this.segments = speechSegments(blocks);
    const found = this.segments.findIndex(s => s.block === (position?.block ?? 0) && s.part === (position?.segment ?? 0));
    const next = this.segments.findIndex(s => s.block >= (position?.block ?? 0));
    this.cursor = found >= 0 ? found : Math.max(0,next); this.savedTime = found < 0 || position?.segment === undefined ? 0 : position.seconds;
    this.completed = position?.completed ?? false;
    this.patch({ ...initialPlayer, status: position ? 'Posición recuperada. Pulsá Escuchar para continuar.' : initialPlayer.status }); this.patchCursor();
    if (!this.segments.length) this.patch({status:'No hay texto habilitado para escuchar. Revisá las secciones opcionales o si el PDF requiere OCR.'});
  }
  setRate(rate: number) { this.speed = rate; this.audio.playbackRate = rate; this.patch({reserveSeconds:this.reserve()/rate}); void this.persist(); if (this.automatic) this.pump(); }
  async select(block: number, autoplay = this.state.wanted) {
    const cursor = this.segments.findIndex(s => s.block >= block);
    if (cursor < 0) return;
    void this.persist(); this.stop(); this.cursor = cursor; this.savedTime = 0; this.completed = false; this.patchCursor();
    this.patch({ status: 'Párrafo seleccionado.', error: '', firstAudioMs: undefined }); await this.persist();
    if (autoplay) this.start(); else this.prepareAhead();
  }
  start() {
    if (!this.segments.length) return;
    if (this.completed) { this.stop(); this.completed = false; this.cursor = 0; this.savedTime = 0; this.patchCursor(); }
    this.automatic = true; this.ahead = Infinity; this.startTime = performance.now(); this.patch({ wanted: true, error: '', status: 'Acumulando reserva para escuchar…' });
    this.primeAudio();
    this.present(); this.pump();
  }
  // iOS requires play() on this element during the user's tap. Dora may need
  // minutes to generate the first clip, so keep the same element active.
  private primeAudio() {
    if (!/iPhone|iPad|iPod/i.test(navigator.userAgent) || this.ready.has(this.cursor) || this.priming) return;
    this.priming = true;
    this.primeUrl = URL.createObjectURL(encodeWav(new Float32Array(24000), 24000));
    this.audio.loop = true;
    this.audio.src = this.primeUrl;
    void this.audio.play().catch(error => {
      if (this.priming && this.state.wanted) this.patch({ error: `Safari no permitió activar el audio: ${String(error)}` });
    });
  }
  pause() {
    this.patch({ wanted: false }); this.audio.pause();
    if (this.priming) {
      this.priming = false; this.audio.loop = false;
      this.audio.removeAttribute('src'); this.audio.load();
      if (this.primeUrl) URL.revokeObjectURL(this.primeUrl); this.primeUrl = '';
    }
    void this.persist();
  }
  prepare(ahead = 0) {
    if (!this.segments.length) return;
    this.automatic = false; this.ahead = ahead; this.startTime = performance.now(); this.patch({ error: '' }); this.present(); this.pump();
  }
  prepareAhead() { if (!this.segments.length) return; this.automatic = true; this.fillToEnd = false; this.ahead = Infinity; this.startTime = performance.now(); this.patch({ error: '', status: 'Dora prepara una reserva de audio…' }); this.present(); this.pump(); }
  prepareAll() { if (!this.segments.length) return; this.automatic = false; this.fillToEnd = true; this.ahead = Infinity; this.startTime = performance.now(); this.patch({ error: '', status: 'Dora prepara el libro completo en segundo plano…' }); this.present(); this.pump(); }
  private reserve() { let seconds = 0; for (let i = this.cursor; this.ready.has(i); i++) seconds += this.ready.get(i)!.duration; return Math.max(0,seconds-this.savedTime); }
  cancel(release = false) { void this.persist(); this.stop(); if (release) this.provider.dispose(); this.patch({ status: 'Preparación cancelada.' }); }
  private stop() {
    this.epoch++; if (this.running) this.provider.dispose(); this.running = false; this.audio.pause();
    this.audio.removeAttribute('src'); this.audio.load();
    if (this.url) URL.revokeObjectURL(this.url); this.url = '';
    if (this.primeUrl) URL.revokeObjectURL(this.primeUrl); this.primeUrl = '';
    this.priming = false; this.audio.loop = false;
    this.ready.clear(); this.loaded = -1; this.buffering = true; this.automatic = false; this.fillToEnd = false; this.patch({ wanted: false, busy: false, playing: false, ready: false, buffered: 0, reserveSeconds: 0 });
  }
  currentBlob() { return this.ready.get(this.cursor)?.wav; }
  suspendForImport() { this.stop(); }
  clearError() { this.patch({ error: '' }); }
  private present() {
    const record = this.ready.get(this.cursor);
    if (!record) { this.buffering = true; if (this.state.wanted) this.patch({ status: 'Acumulando reserva de audio para continuar…', ready: false }); return; }
    if (this.loaded !== this.cursor) {
      const previous = this.url;
      this.priming = false; this.audio.loop = false;
      this.url = URL.createObjectURL(record.wav); this.loaded = this.cursor;
      this.audio.src = this.url;
      if (this.primeUrl) URL.revokeObjectURL(this.primeUrl); this.primeUrl = '';
      if (previous) URL.revokeObjectURL(previous);
      this.patch({ ready: true, duration: record.duration, firstAudioMs: this.state.firstAudioMs ?? performance.now()-this.startTime, status: 'Audio listo.' });
    } else if (this.state.wanted && this.audio.readyState >= 1) this.playLoaded();
  }
  private playLoaded() {
    if (this.buffering && this.reserve()/this.speed < this.policy.startSeconds) {
      let end = this.cursor; while (this.ready.has(end)) end++;
      if (end < this.segments.length) { this.patch({ status: `Preparando reserva: ${Math.floor(this.reserve()/this.speed)} de ${this.policy.startSeconds} segundos. Empezará automáticamente.` }); return; }
    }
    this.buffering = false;
    const epoch = this.epoch;
    void this.audio.play().catch(error => { if (epoch === this.epoch && this.state.wanted) { this.patch({ wanted: false, error: `El navegador no inició el audio. Pulsá Escuchar: ${String(error)}` }); } });
  }
  private fail(error: unknown) { this.patch({ error: error instanceof Error ? error.message : String(error), wanted: false, busy: false }); this.audio.pause(); }
  private pump() {
    if (this.running || !this.segments.length) return;
    this.running = true; const epoch = this.epoch;
    void (async () => {
      try {
        while (epoch === this.epoch) {
          for (const key of this.ready.keys()) if (key < this.cursor || key > this.cursor+this.ahead) this.ready.delete(key);
          if (this.automatic && !this.fillToEnd && this.reserve()/this.speed >= this.policy.targetSeconds) break;
          let target = this.cursor;
          while (target <= Math.min(this.cursor+this.ahead,this.segments.length-1) && this.ready.has(target)) target++;
          if (target > Math.min(this.cursor+this.ahead,this.segments.length-1)) break;
          const segment = this.segments[target];
          const key = await audioKey(segment.text,this.voice,navigator.onLine === false ? 'wasm' : this.engine);
          let cached = await db.audio.get(key);
          if (epoch !== this.epoch) return;
          this.patch({ busy: true });
          if (!cached) {
            const selectedEngine = navigator.onLine === false ? 'wasm' : this.engine === 'auto' ? await calibratedEngine() : this.engine;
            if (epoch !== this.epoch) return;
            const progress = (status: string) => {
              if (epoch === this.epoch) this.patch({ status: target === this.cursor ? status : `Preparando por adelantado · ${status}` });
            };
            let result;
            try { result = await this.provider.synthesize(segment.text,this.voice,selectedEngine,progress); }
            catch (error) {
              if (epoch !== this.epoch) return;
              if (this.engine !== 'auto' || selectedEngine !== 'webgpu') throw error;
              progress('WebGPU falló. Continuando con WASM…');
              result = await this.provider.synthesize(segment.text,this.voice,'wasm',progress);
              result.measurement.fallback = `WebGPU falló: ${String(error)}`;
            }
            if (epoch !== this.epoch) return;
            const wav = encodeWav(result.samples,result.sampleRate);
            cached = { key, wav, bytes: wav.size, duration: result.samples.length/result.sampleRate, touchedAt: Date.now() };
            // Playback does not depend on a successful cache write (e.g. full disk).
            this.ready.set(target,cached); this.present();
            try {
              await db.audio.put(cached); await trimAudio(db,500*1024*1024);
              await db.measurements.add({ ...result.measurement, createdAt: Date.now(), userAgent: navigator.userAgent }); this.measured();
            } catch (error) { if (epoch === this.epoch) this.patch({ error: `Audio disponible, pero no se pudo guardar el cache: ${String(error)}` }); }
          } else {
            this.ready.set(target,cached); this.present();
            await db.audio.update(key,{ touchedAt: Date.now() });
          }
          if (epoch !== this.epoch) return;
          this.patch({ buffered: [...this.ready.keys()].filter(key => key > this.cursor).length, reserveSeconds: this.reserve()/this.speed });
        }
      } catch (error) { if (epoch === this.epoch) this.fail(error); }
      finally { if (epoch === this.epoch) { this.running = false; this.patch({ busy: false }); } }
    })();
  }
  dispose() { void this.persist(); clearInterval(this.timer); this.stop(); this.provider.dispose(); for (const [name,fn] of this.listeners) this.audio.removeEventListener(name,fn); }
}
