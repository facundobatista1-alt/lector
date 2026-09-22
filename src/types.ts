export type Engine = 'auto' | 'wasm' | 'webgpu';
export type Voice = 'ef_dora' | 'em_alex' | 'em_santa' | 'piper_davefx';
export interface Block { id: string; text: string; page: number; pageLabel: string; endPage: number; kind?: 'body' | 'heading' | 'noise' | 'supplement' }
export interface Chapter { id: string; title: string; block: number; page: number; pageLabel: string; level: number; source: 'outline' | 'detected' | 'fallback'; kind: 'content' | 'toc' | 'bibliography' }
export interface Book { id: string; title: string; author?: string; pages: number; blocks: Block[]; chapters?: Chapter[]; structureVersion?: number; includeSupplement?: boolean; originalBlocks?: Block[]; encodingRepair?: string; extractionVersion?: number; needsOCR: number[]; importedAt: number; file: Blob }
export interface Position { bookId: string; block: number; segment?: number; textOffset?: number; seconds: number; rate: number; voice: Voice; engine?: Engine; completed?: boolean; updatedAt: number }
export interface AudioRecord { key: string; wav: Blob; duration: number; bytes: number; touchedAt: number }
export interface Annotation { id: string; bookId: string; title: string; author?: string; page: number; pageLabel: string; chapter?: string; blockId: string; block: number; segment: number; seconds: number; originalText: string; text: string; context: string; comment: string; color: string; createdAt: number; updatedAt: number }
export interface Measurement { id?: number; createdAt: number; voice: Voice; requested: Engine; actual: string; threads?: number; loadMs: number; generationMs: number; audioSeconds: number; rtf: number; pcmBytes: number; jsHeapBytes?: number; userAgent: string; notes?: string; rating?: string; fallback?: string }
export interface Synthesis { samples: Float32Array; sampleRate: number; measurement: Omit<Measurement, 'createdAt' | 'userAgent'> }
export interface TTSProvider { synthesize(text: string, voice: Voice, engine: Engine, progress: (message: string) => void): Promise<Synthesis>; dispose(): void }
