export interface TranslationProvider { available(): Promise<boolean>; translate(text: string, source: string, target: string, signal: AbortSignal): Promise<string> }
