import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
it('mantiene el texto de interfaz en UTF-8 sin caracteres dañados', () => {
  const files = ['src/App.tsx', ...readdirSync('src/annotations').filter(f=>f.endsWith('.tsx')).map(f=>join('src/annotations',f)), 'src/pwa/OfflinePanel.tsx', 'src/sync/SyncPanel.tsx', 'src/reader/chapters.ts'];
  for (const file of files) expect(readFileSync(file,'utf8').match(/\uFFFD|\u00C3[\u0080-\u00BF]|\u00C2[\u0080-\u00BF]|\u00E2\u20AC/g),file).toBeNull();
});
