import { expect, test } from '@playwright/test';
import { samplePDF } from '../fixture';

test('Dora prepara al importar sin sonar, Play con reserva y posición de fragmento', async ({page,context}) => {
  await context.route('**/*', route => ['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await page.goto('/');
  await expect(page.locator('option[value="piper_davefx"]')).toHaveCount(0);
  await page.getByRole('button',{name:/Biblioteca/}).click();
  await page.getByLabel('Agregar PDF').setInputFiles({name:'reserva.pdf',mimeType:'application/pdf',buffer:samplePDF('La libertad importa. Pensar requiere tiempo.')});
  await expect(page.getByRole('heading',{name:'Libro de prueba',exact:true})).toBeVisible();
  await expect(page.getByText('Opciones de audio · Dora',{exact:true})).toBeVisible();
  await expect.poll(() => page.locator('audio').evaluate((a:HTMLAudioElement) => !!a.getAttribute('src')),{timeout:90000}).toBe(true);
  expect(await page.locator('audio').evaluate((a:HTMLAudioElement) => a.paused)).toBe(true);
  await expect(page.getByRole('status')).toContainText('Reserva:');
  await page.getByRole('button',{name:'Escuchar',exact:true}).click();
  await expect(page.locator('.now-playing')).toContainText('Fragmento 2',{timeout:150000});
  await page.getByRole('button',{name:'Pausar',exact:true}).click();
  await page.getByLabel('Velocidad',{exact:true}).selectOption('1.25');
  await page.reload();
  await page.getByRole('button',{name:'Lector'}).click();
  await expect(page.locator('.now-playing')).toContainText('Fragmento 2');
  await expect(page.getByLabel('Velocidad',{exact:true})).toHaveValue('1.25');
  expect(await page.locator('audio').evaluate((a:HTMLAudioElement) => a.paused)).toBe(true);
  await page.getByRole('button',{name:'Escuchar',exact:true}).click();
  await page.getByRole('button',{name:'Seleccionar párrafo 3',exact:true}).click();
  await expect(page.locator('.paragraph.speaking')).toContainText('Leer permite descubrir',{timeout:90000});
  await page.getByRole('button',{name:'Pausar',exact:true}).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
