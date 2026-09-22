import type { Book } from '../types';

// Verified against the user's PDF, not inferred from its filename or language.
export const WEBER_PDF_HASH = '115f3d03c041553f8dd01931a99b3a68329936ef29472d4a7a166673bbebdc5c';
const repairVersion = 'weber-macroman-cp1252-v1';
const mac = new TextDecoder('macintosh');
const windows = new TextDecoder('windows-1252');
const inverse = new Map<string, string>();
for (let byte = 128; byte <= 255; byte++) {
  const bytes = Uint8Array.of(byte);
  inverse.set(mac.decode(bytes), windows.decode(bytes));
}

export function repairBookEncoding(book: Book): Book {
  if (book.id !== WEBER_PDF_HASH || book.encodingRepair === repairVersion) return book;
  return {
    ...book,
    originalBlocks: book.originalBlocks ?? book.blocks,
    encodingRepair: repairVersion,
    blocks: book.blocks.map(block => ({
      ...block,
      text: Array.from(block.text, char => inverse.get(char) ?? char).join('').normalize('NFC'),
    })),
  };
}
