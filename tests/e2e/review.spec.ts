import { expect, test } from '@playwright/test';
import { samplePDF } from '../fixture';
test.setTimeout(45000);

test('restaura libro y párrafo, permite guardar y eliminar cita y actualizar en móvil', async ({ page, context }) => {
  await context.route('**/*', route => ['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await page.goto('/');
  await page.getByLabel('Agregar PDF').setInputFiles({name:'revision.pdf',mimeType:'application/pdf',buffer:samplePDF()});
  await expect(page.getByRole('heading',{name:'Libro de prueba',exact:true})).toBeVisible();
  await page.getByLabel('Seleccionar párrafo 3',{exact:true}).click();
  await expect(page.getByLabel('Seleccionar párrafo 3',{exact:true})).toHaveAttribute('aria-current','true');
  await expect.poll(() => page.evaluate(() => new Promise<number>((resolve,reject) => {
    const request = indexedDB.open('lumbre-v1');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const read = database.transaction('positions').objectStore('positions').getAll();
      read.onsuccess = () => { const positions = read.result.filter(p => p.bookId !== 'demo'); resolve(positions[0]?.block ?? -1); database.close(); };
      read.onerror = () => { reject(read.error); database.close(); };
    };
  }))).toBe(2);
  await page.reload();
  await page.getByRole('button',{name:/Lector/}).click();
  await expect(page.getByRole('heading',{name:'Libro de prueba',exact:true})).toBeVisible();
  await expect(page.getByLabel('Seleccionar párrafo 3',{exact:true})).toHaveAttribute('aria-current','true');
  await page.getByRole('button',{name:'Guardar cita',exact:true}).click();
  await page.getByRole('button',{name:'Citas y notas',exact:true}).click();
  await expect(page.locator('.quote-card')).toHaveCount(1);
  await expect(page.locator('.quote-card blockquote')).toContainText('Leer permite descubrir nuevas preguntas.');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button',{name:'Eliminar',exact:true}).click();
  await expect(page.locator('.quote-card')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button',{name:'Citas y notas',exact:true}).click();
  await expect(page.locator('.quote-card')).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:/Lector/}).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button',{name:'Guardar cita',exact:true})).toBeInViewport();
  await expect(page.getByRole('button',{name:'Actualizar app',exact:true})).toBeVisible();
  await page.screenshot({path:`artifacts/${test.info().project.name}-review-mobile.png`,fullPage:true});
  await page.getByRole('button',{name:'Actualizar app',exact:true}).click();
  await page.getByRole('button',{name:/Lector/}).click();
  await expect(page.getByRole('heading',{name:'Libro de prueba',exact:true})).toBeVisible();
});
