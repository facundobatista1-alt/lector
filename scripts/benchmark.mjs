import { preview } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
await mkdir('artifacts', { recursive: true });
const server = await preview({ preview: { host: '127.0.0.1', port: 4174, strictPort: true } });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const reports = [];
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
try {
  await page.goto('http://127.0.0.1:4174');
  const environment = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    return { userAgent: navigator.userAgent, cores: navigator.hardwareConcurrency, deviceMemory: navigator.deviceMemory, isolated: self.crossOriginIsolated, webgpu: !!adapter, adapter: adapter?.info ? { vendor: adapter.info.vendor, architecture: adapter.info.architecture, device: adapter.info.device, description: adapter.info.description } : null };
  });
  environment.host = {cpu:os.cpus()[0].model,ramGiB:os.totalmem()/1073741824};
  console.log(JSON.stringify(environment));
  const cases = process.env.BENCHMARK_QUICK ? [['ef_dora','wasm',1],['ef_dora','webgpu',1]] : [['ef_dora','wasm',5],['em_alex','wasm',5],['em_santa','wasm',5],['ef_dora','webgpu',5]];
  for (const [voice, engine, count] of cases) {
    await page.getByRole('button',{name:'Laboratorio de voz'}).click();
    await page.getByRole('combobox').nth(0).selectOption(voice);
    await page.getByRole('combobox').nth(1).selectOption(engine);
    await page.getByRole('button',{name:'Seleccionar párrafo 1',exact:true}).click();
    console.log(`START ${voice} ${engine}, ${count} párrafos`);
    await page.getByRole('button',{name:count === 5 ? 'Probar 5 párrafos' : '✦ Preparar párrafo',exact:true}).click();
    const deadline = Date.now() + 12 * 60 * 1000;
    let lastStatus = '';
    while (await page.getByRole('button',{name:'Cancelar',exact:true}).count()) {
      const status = await page.getByRole('status').innerText();
      if (status !== lastStatus) { console.log(status); lastStatus = status; }
      if (Date.now() > deadline) { await page.getByRole('button',{name:'Cancelar',exact:true}).click(); reports.push({ voice, engine, error:'timeout de 12 minutos' }); break; }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    const alert = page.getByRole('alert');
    if (await alert.count()) { const error = await alert.innerText(); reports.push({ voice, engine, error }); console.log('ERROR', error); await page.getByRole('button',{name:'Cerrar error'}).click(); }
    else {
      const downloadEvent = page.waitForEvent('download'); await page.getByRole('button',{name:'↓ Descargar muestra WAV'}).click();
      await (await downloadEvent).saveAs(`artifacts/${voice}-${engine}.wav`);
      reports.push({ voice, engine, complete: true });
    }
    await page.getByRole('button',{name:'Resultados',exact:false}).click();
    const partialExport = page.waitForEvent('download'); await page.getByRole('button',{name:'↓ Exportar mediciones'}).click();
    await (await partialExport).saveAs('artifacts/benchmark-measurements.json');
    await writeFile('artifacts/benchmark-environment.json', JSON.stringify({ environment, reports, recordedAt: new Date().toISOString(), physicalMobile: false, humanListening: 'pending' }, null, 2));
  }
  await page.getByRole('button',{name:'Resultados',exact:false}).click();
  const exportEvent = page.waitForEvent('download'); await page.getByRole('button',{name:'↓ Exportar mediciones'}).click();
  await (await exportEvent).saveAs('artifacts/benchmark-measurements.json');
  await page.screenshot({path:'artifacts/benchmark-results.png',fullPage:true});
  await writeFile('artifacts/benchmark-environment.json', JSON.stringify({ environment, reports, recordedAt: new Date().toISOString(), physicalMobile: false, humanListening: 'pending' }, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
