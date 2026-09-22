export interface SourceFragment { text: string; bookId: string; page: number; blockId: string }
export interface LocalLLMProvider { available(): Promise<boolean>; answer(question: string, sources: SourceFragment[], signal: AbortSignal): Promise<{ text: string; sources: SourceFragment[] }> }
