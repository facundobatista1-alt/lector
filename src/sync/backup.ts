import { db, hash, type LibraryDB } from '../storage/db';
import type { Annotation, Book, Position } from '../types';

type Settings = {key:string;dark:boolean;follow:boolean;fontSize:number;updatedAt:number};
type SavedBook = Omit<Book,'file'> & {pdf?:string};
export interface Backup {format:'lumbre-backup';version:1;createdAt:number;books:SavedBook[];positions:Position[];annotations:Annotation[];settings:Settings[]}
export const MAX_BACKUP = 100 * 1024 * 1024;
const invalid = () => { throw new Error('Respaldo inválido o incompatible. No se modificaron tus datos.'); };
const obj = (v:unknown): Record<string,unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string,unknown> : invalid();
const str = (v:unknown, max = 2_000_000): v is string => typeof v === 'string' && v.length <= max;
const num = (v:unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const integer = (v:unknown, min=0, max=Number.MAX_SAFE_INTEGER) => num(v,min,max) && Number.isInteger(v);
const optional = (v:unknown, test:(v:unknown)=>boolean) => v === undefined || test(v);
const arr = (v:unknown, max=100000): unknown[] => Array.isArray(v) && v.length <= max ? v : invalid();
const id = (v:unknown) => str(v,200) && v.length > 0;
const unique = (rows:unknown[], key:string) => { const ids = rows.map(row => obj(row)[key]); if (new Set(ids).size !== ids.length) invalid(); };

export function validateBackup(value:unknown): Backup {
  const root = obj(value);
  if (root.format !== 'lumbre-backup' || root.version !== 1 || !num(root.createdAt)) invalid();
  const books = arr(root.books,10000), positions = arr(root.positions), annotations = arr(root.annotations), settings = arr(root.settings,1);
  unique(books,'id'); unique(positions,'bookId'); unique(annotations,'id');
  for (const item of books) {
    const b = obj(item);
    if (!str(b.id,64) || !/^[a-f0-9]{64}$/.test(b.id as string) || !str(b.title,10000) || !optional(b.author,v=>str(v,10000)) || !integer(b.pages,1,100000) || !num(b.importedAt) || !optional(b.pdf,v=>str(v,MAX_BACKUP)) || !optional(b.includeSupplement,v=>typeof v==='boolean') || !optional(b.encodingRepair,v=>str(v,1000)) || !optional(b.extractionVersion,v=>integer(v)) || !optional(b.structureVersion,v=>integer(v))) invalid();
    const blocks = arr(b.blocks);
    for (const block of [...blocks,...(b.originalBlocks === undefined ? [] : arr(b.originalBlocks))]) {
      const r = obj(block);
      if (!id(r.id) || !str(r.text) || !integer(r.page,1,b.pages as number) || !integer(r.endPage,r.page as number,b.pages as number) || !str(r.pageLabel,1000) || !optional(r.kind,v=>['body','heading','noise','supplement'].includes(v as string))) invalid();
    }
    unique(blocks,'id');
    for (const page of arr(b.needsOCR)) if (!integer(page,1,b.pages as number)) invalid();
    for (const chapter of b.chapters === undefined ? [] : arr(b.chapters)) {
      const c=obj(chapter);
      if (!id(c.id) || !str(c.title,10000) || !integer(c.block,0,blocks.length-1) || !integer(c.page,1,b.pages as number) || !str(c.pageLabel,1000) || !integer(c.level,0,100) || !['outline','detected','fallback'].includes(c.source as string) || !['content','toc','bibliography'].includes(c.kind as string)) invalid();
    }
  }
  const byId = new Map(books.map(b=>[obj(b).id,obj(b)]));
  for (const item of positions) {
    const p = obj(item), b = byId.get(p.bookId);
    if (!b || !integer(p.block,0,Math.max(0,arr(b.blocks).length-1)) || !num(p.seconds,0,86400) || !num(p.rate,.5,3) || !num(p.updatedAt) || !optional(p.segment,v=>integer(v,0,100000)) || !optional(p.textOffset,v=>integer(v)) || !optional(p.completed,v=>typeof v==='boolean') || !['ef_dora','em_alex','em_santa','piper_davefx'].includes(p.voice as string) || !optional(p.engine,v=>['auto','wasm','webgpu'].includes(v as string))) invalid();
  }
  for (const item of annotations) {
    const a=obj(item);
    if (!id(a.id) || !byId.has(a.bookId) || !str(a.title,10000) || !optional(a.author,v=>str(v,10000)) || !optional(a.chapter,v=>str(v,10000)) || !integer(a.page,1) || !str(a.pageLabel,1000) || !id(a.blockId) || !integer(a.block) || !integer(a.segment) || !num(a.seconds,0,86400) || !str(a.originalText) || !str(a.text) || !str(a.context) || !str(a.comment) || !str(a.color,7) || !/^#[0-9a-f]{6}$/i.test(a.color as string) || !num(a.createdAt) || !num(a.updatedAt)) invalid();
  }
  for (const item of settings) { const s=obj(item); if(s.key!=='ui' || typeof s.dark!=='boolean' || typeof s.follow!=='boolean' || !num(s.fontSize,17,30) || !num(s.updatedAt)) invalid(); }
  return value as Backup;
}

export async function exportBackup(includePDF:boolean, database:LibraryDB=db):Promise<Blob> {
  const snapshot = await database.transaction('r',database.books,database.positions,database.annotations,database.settings,async()=>({books:await database.books.toArray(),positions:await database.positions.toArray(),annotations:await database.annotations.toArray(),settings:await database.settings.toArray()}));
  const books:SavedBook[]=[];
  let size=0;
  for(const book of snapshot.books){
    const {file,...saved}=book;
    size += JSON.stringify(saved).length*3 + (includePDF ? file.size*4/3 : 0);
    if(size>MAX_BACKUP) throw new Error('El respaldo supera 100 MB. Exportá sin PDFs para reducir el tamaño.');
    let pdf:string|undefined;
    if(includePDF && file.size){ const bytes=new Uint8Array(await file.arrayBuffer()); let binary=''; for(let i=0;i<bytes.length;i+=32768) binary+=String.fromCharCode(...bytes.subarray(i,i+32768)); pdf=btoa(binary); }
    books.push({...saved,pdf});
  }
  const ids = new Set(books.map(b=>b.id));
  const backup:Backup={format:'lumbre-backup',version:1,createdAt:Date.now(),books,positions:snapshot.positions.filter(p=>ids.has(p.bookId)),annotations:snapshot.annotations.filter(a=>ids.has(a.bookId)),settings:snapshot.settings};
  validateBackup(backup);
  const blob=new Blob([JSON.stringify(backup)],{type:'application/json'});
  if(blob.size>MAX_BACKUP) throw new Error('El respaldo supera 100 MB. Exportá sin PDFs.');
  return blob;
}
export async function readBackup(file:Blob):Promise<Backup> {
  if(file.size>MAX_BACKUP) throw new Error('El respaldo supera el límite de 100 MB.');
  let parsed:unknown; try {parsed=JSON.parse(await file.text());} catch {return invalid();}
  return validateBackup(parsed);
}
export async function importBackup(backup:Backup,database:LibraryDB=db) {
  validateBackup(backup);
  const books:Book[]=[];
  for(const entry of backup.books){
    const {pdf,...book}=entry;
    let file=new Blob([],{type:'application/pdf'});
    if(pdf!==undefined){
      let binary:string;try{binary=atob(pdf);}catch{return invalid();}
      const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
      if(!new TextDecoder().decode(bytes.subarray(0,1024)).includes('%PDF-') || await hash(bytes.buffer)!==book.id) invalid();
      file=new Blob([bytes],{type:'application/pdf'});
    }
    books.push({...book,file});
  }
  const result={books:0,positions:0,annotations:0,missingPDF:0};
  await database.transaction('rw',database.books,database.positions,database.annotations,database.settings,async()=>{
    for(const book of books){
      const old=await database.books.get(book.id);
      if(!old){await database.books.add(book);result.books++;}
      else if(!old.file.size && book.file.size) await database.books.update(book.id,{file:book.file});
      if(!(old?.file.size || book.file.size)) result.missingPDF++;
    }
    for(const p of backup.positions){
      const old=await database.positions.get(p.bookId);
      if(!old || p.updatedAt>old.updatedAt){
        const source=backup.books.find(b=>b.id===p.bookId)!;
        const target=(await database.books.get(p.bookId))!;
        await database.books.update(p.bookId,{includeSupplement:source.includeSupplement ?? false});
        const block=source.blocks[p.block];
        let index=target.blocks.findIndex(b=>b.id===block?.id && b.text===block?.text);
        const exact=index>=0;
        if(!exact) index=target.blocks.findIndex(b=>b.page===block?.page && b.text.includes(block?.text.slice(0,60) ?? '\0'));
        if(index<0) index=target.blocks.findIndex(b=>b.page>=(block?.page ?? 1));
        await database.positions.put({...p,block:Math.max(0,index),...(exact?{}:{segment:0,textOffset:0,seconds:0,completed:false})});result.positions++;
      }
    }
    for(const a of backup.annotations){const old=await database.annotations.get(a.id);if(!old || a.updatedAt>old.updatedAt){await database.annotations.put(a);result.annotations++;}}
    for(const s of backup.settings){const old=await database.settings.get(s.key);if(!old || s.updatedAt>old.updatedAt) await database.settings.put(s);}
  });
  return result;
}
