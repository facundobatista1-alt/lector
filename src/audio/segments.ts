import { splitForSpeech } from '../extraction/normalize';
import type { Block, Position } from '../types';
export interface SpeechSegment { block: number; part: number; text: string; offset: number }
export function speechSegments(blocks: Block[]): SpeechSegment[] {
  return blocks.flatMap((block, index) => {
    const sentences = [...new Intl.Segmenter('es', { granularity: 'sentence' }).segment(block.text)];
    const first = sentences[0]?.segment.trim() ?? '';
    const rest = block.text.slice(sentences[0]?.segment.length ?? 0).trim();
    const chunks = [...splitForSpeech(first), ...splitForSpeech(rest)];
    let offset = 0;
    return chunks.map((text, part) => { const found = block.text.indexOf(text, offset); const start = found < 0 ? offset : found; offset = start + text.length; return { block: index, part, text, offset: start }; });
  });
}
export function remapPosition(position: Position, before: Block[], after: Block[]): Position {
  const old = before[position.block];
  if (!old) return { ...position, block: 0, segment: 0, seconds: 0 };
  const needle = old.text.slice(position.textOffset ?? 0, (position.textOffset ?? 0) + 60);
  let block = after.findIndex(b => b.page === old.page && b.text.includes(needle));
  if (block < 0) block = after.findIndex(b => b.page >= old.page);
  return { ...position, block: Math.max(0,block), segment: 0, textOffset: 0, seconds: 0 };
}
