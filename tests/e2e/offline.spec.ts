import { expect, test } from '@playwright/test';
import { samplePDF } from '../fixture';

test('PWA abre el libro y genera Dora WASM después de cortar la conexión',async({page,context})=>{
  await context.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  await page.goto('/');
  const manifest=await page.locator('link[rel=manifest]').getAttribute('href');
  expect(manifest).toBe('/manifest.webmanifest');
  const parsed=await page.evaluate(async()=> (await (await fetch('/manifest.webmanifest')).json()) as {name:string;display:string;icons:unknown[]});
  expect(parsed).toMatchObject({name:'Lumbre · Leer y escuchar',display:'standalone'});
  expect(parsed.icons).toHaveLength(2);
  await page.getByLabel('Agregar PDF').setInputFiles({name:'offline.pdf',mimeType:'application/pdf',buffer:samplePDF()});
  await expect(page.getByRole('heading',{name:'Libro de prueba',exact:true})).toBeVisible();
  await page.getByRole('button',{name:/Biblioteca/}).click();
  await expect(page.getByRole('button',{name:'Preparar para escuchar offline'})).toBeEnabled();
  await page.getByRole('button',{name:'Preparar para escuchar offline'}).click();
  await expect(page.getByText('Listo para escuchar offline con Dora · WASM Q8.')).toBeVisible({timeout:180000});
  expect(await page.evaluate(async()=>{
    const cachesList=await caches.keys();
    const models=await caches.open(cachesList.find(k=>k.startsWith('lumbre-models-'))!);
    const runtime=await caches.open('lumbre-offline-runtime-ort1.30-espeak0.3.5');
    return {controller:!!navigator.serviceWorker.controller,model:!!await models.match('/models/kokoro/onnx/model_quantized.onnx'),wasm:!!await runtime.match('/runtime/ort-wasm-simd-threaded.wasm')};
  })).toEqual({controller:true,model:true,wasm:true});
  // Force generation from the cached local model instead of a previously cached WAV.
  await page.getByRole('button',{name:'Lector'}).click();
  await page.locator('.voice-settings summary').click();
  const cancel=page.getByRole('button',{name:'Cancelar',exact:true});
  if(await cancel.isVisible())await cancel.click();
  await page.getByRole('button',{name:'Seleccionar párrafo 2',exact:true}).click();
  await expect(page.getByRole('button',{name:'Seleccionar párrafo 2',exact:true})).toHaveAttribute('aria-current','true');
  if(await cancel.isVisible())await cancel.click();
  await page.evaluate(async()=>{
    const database=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('lumbre-v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    await new Promise<void>((resolve,reject)=>{const tx=database.transaction('audio','readwrite');tx.objectStore('audio').clear();tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});database.close();
  });
  await context.setOffline(true);
  await page.close();
  const reopened=await context.newPage();
  await reopened.goto('/');
  await expect(reopened.getByRole('heading',{name:'Mi biblioteca',exact:true})).toBeVisible();
  await expect(reopened.getByRole('button',{name:'Abrir Libro de prueba',exact:true})).toBeVisible();
  await reopened.getByRole('button',{name:'Lector'}).click();
  await expect(reopened.getByRole('button',{name:'Seleccionar párrafo 2',exact:true})).toHaveAttribute('aria-current','true');
  await reopened.getByRole('button',{name:'Escuchar',exact:true}).click();
  await expect.poll(async()=>{
    const alert=await reopened.getByRole('alert').allTextContents();
    if(alert.length)return `Error: ${alert.join(' ')}`;
    return reopened.locator('audio').evaluate((audio:HTMLAudioElement)=>!audio.paused&&audio.currentTime>.1);
  },{timeout:120000}).toBe(true);
  await expect(reopened.getByRole('alert')).toHaveCount(0);
  await reopened.getByRole('button',{name:'Pausar',exact:true}).click();
  await reopened.getByRole('button',{name:/Biblioteca/}).click();
  await expect(reopened.getByText('Listo para abrir y escuchar sin conexión.',{exact:false})).toBeVisible();
  await reopened.setViewportSize({width:390,height:844});
  expect(await reopened.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await reopened.screenshot({path:`artifacts/${test.info().project.name}-offline-mobile.png`,fullPage:true});
});
