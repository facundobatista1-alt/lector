export interface OCRProvider { recognize(image: ImageBitmap, language: string, progress: (fraction: number) => void, signal: AbortSignal): Promise<string> }
