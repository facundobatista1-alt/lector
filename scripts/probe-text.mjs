/* global document */
import { chromium } from '@playwright/test';
import initialize from '@echogarden/espeak-ng-emscripten';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5173/');
  console.log(await page.evaluate(() => ({ charset: document.characterSet, text: document.body.innerText })));
} finally { await browser.close(); }
const module = await initialize();
const worker = new module.eSpeakNGWorker();
worker.set_voice('es');
for (const text of ['práctico', 'practico', 'practicó', 'filosofía', 'atención', 'También']) console.log(text, worker.synthesize_ipa(text));
