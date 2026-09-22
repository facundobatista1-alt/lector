/* global document */
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { writeFile } from 'node:fs/promises';
const server = await preview({preview:{port:4176,strictPort:true}});
const browser = await chromium.launch({channel:'msedge'});
const page = await browser.newPage();
const reports = [];
try {
  await page.goto('http://127.0.0.1:4176');
  await page.getByRole('button',{name:'Abrir muestra de lectura'}).click();
  await page.getByText('Opciones de audio · Dora',{exact:true}).click();
  await page.getByRole('button',{name:'Comparar motores con Dora',exact:true}).click();
  for (let elapsed = 0; elapsed < 360; elapsed+=5) {
    await page.waitForTimeout(5000);
    console.log(await page.getByRole('status').innerText());
    if (await page.getByRole('button',{name:'Comparar motores con Dora',exact:true}).isEnabled()) break;
  }
  await page.getByRole('button',{name:'Resultados',exact:false}).click();
  const exported = page.waitForEvent('download');
  await page.getByRole('button',{name:'↓ Exportar mediciones'}).click();
  await (await exported).saveAs('artifacts/dora-calibration.json');
  await page.getByRole('button',{name:'Lector'}).click();
  await page.getByText('Opciones de audio · Dora',{exact:true}).click();
  for (const engine of ['wasm','webgpu']) {
    await page.getByRole('combobox').nth(0).selectOption(engine);
    await page.getByRole('button',{name:'Seleccionar párrafo 1',exact:true}).click();
    const started = Date.now();
    await page.getByRole('button',{name:'Escuchar',exact:true}).click();
    let first = null; const changes = []; let previous = '';
    for (let elapsed = 0; elapsed < 120; elapsed++) {
      await page.waitForTimeout(1000);
      const state = await page.evaluate(() => {
        const audio = document.querySelector('audio');
        return {playing:!audio.paused,time:audio.currentTime,paragraph:document.querySelector('.paragraph[aria-current="true"]')?.getAttribute('aria-label'),status:document.querySelector('[role="status"]').textContent};
      });
      if (state.playing && first === null) first = Date.now()-started;
      const key = `${state.playing}:${state.paragraph}`;
      if (key !== previous) { changes.push({atMs:Date.now()-started,...state}); previous=key; console.log(engine,key,state.status); }
      if (state.paragraph !== 'Seleccionar párrafo 1' && first !== null) break;
    }
    if (await page.getByRole('button',{name:'Pausar',exact:true}).count()) await page.getByRole('button',{name:'Pausar',exact:true}).click();
    if (await page.getByRole('button',{name:'Cancelar',exact:true}).count()) await page.getByRole('button',{name:'Cancelar',exact:true}).click();
    reports.push({engine,firstPlaybackMs:first,changes});
    await writeFile('artifacts/progressive-benchmark.json',JSON.stringify(reports,null,2));
  }
  await page.getByRole('button',{name:'Resultados',exact:false}).click();
  const finalExport = page.waitForEvent('download'); await page.getByRole('button',{name:'↓ Exportar mediciones'}).click();
  await (await finalExport).saveAs('artifacts/progressive-measurements.json');
} finally { await browser.close(); server.httpServer.close(); }
