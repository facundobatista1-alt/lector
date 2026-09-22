import { db } from '../storage/db';
import { MODEL_REVISION } from '../tts/assets';
import { RUNTIME_CACHE } from './resources';

const modelPaths=['onnx/model_quantized.onnx','tokenizer.json','voices/ef_dora.bin'];
const runtimePaths=['ort-wasm-simd-threaded.wasm','ort-wasm-simd-threaded.mjs','espeak-ng.js','espeak-ng.data'];
const modelCache=`lumbre-models-${MODEL_REVISION}`;
export interface OfflineStatus { supported:boolean; app:boolean; dora:boolean; runtime:boolean; book:boolean; ready:boolean; persistent:boolean | null; online:boolean }
const url=(path:string)=>new URL(path,location.origin).href;
const allCached=async(cache:Cache,paths:string[])=> (await Promise.all(paths.map(path=>cache.match(url(path))))).every(Boolean);

export async function offlineStatus(bookId?:string):Promise<OfflineStatus>{
  const supported='serviceWorker' in navigator && 'caches' in window;
  const keys=supported?await caches.keys():[];
  const shell=keys.find(key=>key.startsWith('lumbre-shell-'));
  const app=!!shell && !!(await (await caches.open(shell)).match('/index.html'));
  const dora=keys.includes(modelCache)&&await allCached(await caches.open(modelCache),modelPaths.map(path=>`/models/kokoro/${path}`));
  const runtime=keys.includes(RUNTIME_CACHE)&&await allCached(await caches.open(RUNTIME_CACHE),runtimePaths.map(path=>`/runtime/${path}`));
  const book=!!bookId && !!(await db.books.get(bookId));
  const persistent=await navigator.storage?.persisted?.().catch(()=>null)??null;
  return {supported,app,dora,runtime,book,ready:app&&dora&&runtime&&book,persistent,online:navigator.onLine};
}
async function cacheFile(cache:Cache,path:string,progress:(status:string)=>void,fallback?:string){
  const key=url(path);
  if(await cache.match(key))return;
  progress(`Guardando ${path.split('/').at(-1)}…`);
  let response=await fetch(key).catch(()=>undefined);
  if(!response?.ok || response.headers.get('content-type')?.includes('text/html')){
    if(!fallback)throw new Error(`No se encontró ${path}. Reconstruí la aplicación con npm run build.`);
    if(!navigator.onLine)throw new Error('Conectate a internet una vez para descargar Dora.');
    response=await fetch(fallback);
  }
  if(!response.ok || !response.body)throw new Error(`No se pudo guardar ${path}: HTTP ${response.status}.`);
  await cache.put(key,response);
}
export async function prepareOffline(bookId:string,progress:(status:string)=>void):Promise<OfflineStatus>{
  if(!('serviceWorker' in navigator)||!('caches' in window))throw new Error('Este navegador no admite preparación offline.');
  if(!await db.books.get(bookId))throw new Error('Abrí o importá un libro antes de prepararlo.');
  progress('Guardando la aplicación…');
  await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('No se instaló el servicio offline. Recargá y probá nuevamente.')),15000))]);
  const runtime=await caches.open(RUNTIME_CACHE);
  for(const path of runtimePaths)await cacheFile(runtime,`/runtime/${path}`,progress);
  const model=await caches.open(modelCache);
  for(const path of modelPaths){
    const fallback=`https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/${MODEL_REVISION}/${path}`;
    await cacheFile(model,`/models/kokoro/${path}`,progress,fallback);
  }
  progress('Comprobando recursos offline…');
  const status=await offlineStatus(bookId);
  if(!status.ready)throw new Error('Falta algún recurso. Probá preparar nuevamente con conexión.');
  if(navigator.storage?.persist)try{status.persistent=await navigator.storage.persist();}catch{ /* Browser may deny persistent storage. */ }
  return status;
}
