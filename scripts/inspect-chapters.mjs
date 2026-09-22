/* global Blob */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {paragraphLines} from '../src/extraction/layout.ts';
import {cleanPages} from '../src/extraction/normalize.ts';
import {repairBookEncoding} from '../src/extraction/encoding.ts';
import {structureBook} from '../src/reader/chapters.ts';
import {readOutline} from '../src/pdf/outline.ts';
const bytes = await readFile(process.argv[2]);
const task = getDocument({data:new Uint8Array(bytes)});
try {
  const pdf = await task.promise; const pages=[];
  const labels = await pdf.getPageLabels();
  for (let n=1;n<=pdf.numPages;n++) {const page=await pdf.getPage(n); pages.push({page:n,label:labels?.[n-1]??String(n),lines:paragraphLines((await page.getTextContent()).items.filter(i => 'str' in i))});page.cleanup();}
  const original = repairBookEncoding({id:createHash('sha256').update(bytes).digest('hex'),title:'PDF privado',pages:pdf.numPages,blocks:cleanPages(pages),file:new Blob([bytes]),needsOCR:[],importedAt:0});
  const structured = structureBook(original,await readOutline(pdf));
  const report={pages:pdf.numPages,blocks:structured.blocks.length,chapters:structured.chapters,noiseBlocks:structured.blocks.filter(b => b.kind==='noise').length,supplementBlocks:structured.blocks.filter(b => b.kind==='supplement').length};
  console.log(JSON.stringify(report,null,2));
  await writeFile('artifacts/chapter-inspection.json',JSON.stringify(report,null,2));
} finally {await task.destroy();}
