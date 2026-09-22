import { preview } from 'vite';
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const server = await preview({ preview: { host:'127.0.0.1',port:4175,strictPort:true } });
const browser = await chromium.launch({channel:'msedge',headless:true});
const page = await browser.newPage();
try {
  await page.goto('http://127.0.0.1:4175');
  await page.getByRole('combobox').nth(0).selectOption('piper_davefx');
  await page.getByRole('button',{name:'Probar 5 párrafos',exact:true}).click();
  const start = Date.now(); let last = '';
  while (await page.getByRole('button',{name:'Cancelar',exact:true}).count()) {
    const state = await page.getByRole('status').innerText(); if(state !== last){console.log(state);last=state;}
    if(Date.now()-start>300000) throw new Error('Piper superó cinco minutos para las muestras.');
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if(await page.getByRole('alert').count()) throw new Error(await page.getByRole('alert').innerText());
  const wav = page.waitForEvent('download'); await page.getByRole('button',{name:'↓ Descargar muestra WAV'}).click(); await (await wav).saveAs('artifacts/piper-davefx.wav');
  await page.getByRole('button',{name:'Resultados',exact:false}).click();
  const report = page.waitForEvent('download'); await page.getByRole('button',{name:'↓ Exportar mediciones'}).click(); await (await report).saveAs('artifacts/piper-measurements.json');
  await writeFile('artifacts/piper-browser.txt',await browser.version());
  console.log(await page.locator('table').innerText());
} finally { await browser.close(); await new Promise(resolve=>server.httpServer.close(resolve)); }
