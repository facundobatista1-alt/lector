import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
const bytes = await readFile(process.argv[2]);
console.log('SHA256', createHash('sha256').update(bytes).digest('hex'));
const task = getDocument({ data: new Uint8Array(bytes) });
const pdf = await task.promise;
console.log(await pdf.getMetadata());
for (const n of [1,2]) {
 const page = await pdf.getPage(n);
 console.log(n, (await page.getTextContent()).items.filter(i => 'str' in i).slice(0,45).map(i => ({text:i.str,x:i.transform[4],y:i.transform[5],w:i.width,h:i.height,eol:i.hasEOL})));
}
await task.destroy();
