import { useState } from 'react';
import { exportBackup, importBackup, readBackup, type Backup } from './backup';

export function BackupPanel({disabled,beforeExport,beforeImport,afterImport}:{disabled:boolean;beforeExport:()=>Promise<void>;beforeImport:()=>Promise<void>;afterImport:()=>Promise<void>}) {
  const [includePDF,setIncludePDF]=useState(false);
  const [pending,setPending]=useState<Backup>();
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState('');
  const [error,setError]=useState('');
  async function download(){
    setBusy(true);setError('');setStatus('Preparando respaldo…');
    try{await beforeExport();const blob=await exportBackup(includePDF);const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`lumbre-respaldo-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);setStatus('Respaldo descargado. Guardalo donde puedas recuperarlo.');}
    catch(e){setError(String(e));setStatus('');}finally{setBusy(false);}
  }
  async function select(file?:File){if(!file)return;setBusy(true);setError('');setPending(undefined);setStatus('Validando respaldo…');try{setPending(await readBackup(file));setStatus('Archivo listo para importar.');}catch(e){setError(String(e));setStatus('');}finally{setBusy(false);}}
  async function restore(){
    if(!pending)return;setBusy(true);setError('');setStatus('Importando respaldo…');
    try{await beforeImport();const result=await importBackup(pending);setPending(undefined);setStatus(`Respaldo importado: ${result.books} libros agregados, ${result.positions} posiciones y ${result.annotations} citas actualizadas. ${result.missingPDF ? `${result.missingPDF} libros conservan texto sin PDF original.`:''}`);}
    catch(e){setError(String(e));setStatus('');}
    finally{try{await afterImport();}catch(e){setError(String(e));}setBusy(false);}
  }
  return <details className="backup-panel"><summary>Respaldo y transferencia</summary><p>Guardá un archivo para recuperar tus libros o llevarlos a otro dispositivo. Incluye texto, progreso, citas y preferencias de lectura.</p>
    <p>Archivo local sin cifrar, hasta 100 MB. No incluye modelos ni audio generado. Para transferirlo, copiá el archivo e importalo en el otro dispositivo.</p>
    <label><input type="checkbox" checked={includePDF} disabled={busy || disabled} onChange={e=>setIncludePDF(e.target.checked)}/> Incluir PDFs originales</label>
    <div className="quote-actions"><button disabled={busy || disabled} onClick={()=>void download()}>Exportar respaldo</button><label className="backup-file">Seleccionar respaldo<input aria-label="Seleccionar respaldo" type="file" accept=".json,application/json" disabled={busy || disabled} onChange={e=>{void select(e.target.files?.[0]);e.target.value='';}}/></label></div>
    {pending && <div className="notice"><p>{pending.books.length} libros · {pending.positions.length} posiciones · {pending.annotations.length} citas · {pending.books.filter(b=>b.pdf!==undefined).length} PDFs.</p><p>Se conservan los datos con fecha de modificación más reciente. Importar pausa la reproducción. No se eliminan libros ni citas existentes.</p><button disabled={busy || disabled} onClick={()=>void restore()}>Importar este respaldo</button><button disabled={busy} onClick={()=>setPending(undefined)}>Descartar selección</button></div>}
    <p role="status">{status}</p>{error && <p role="alert">{error}</p>}
  </details>;
}
