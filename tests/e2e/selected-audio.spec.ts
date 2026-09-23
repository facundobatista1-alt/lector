import { expect, test } from '@playwright/test';

test('seleccionar el párrafo 14 de Weber y reproducir Dora', async ({page}) => {
  test.skip(!process.env.WEBER_PDF,'Requiere PDF local autorizado.');
  test.setTimeout(180000);
  await page.goto('/');
  await page.getByLabel('Agregar PDF').setInputFiles(process.env.WEBER_PDF!);
  await expect(page.getByRole('heading',{name:'El político y el científico',exact:true})).toBeVisible();
  await page.getByLabel('Seleccionar párrafo 14',{exact:true}).click();
  await page.getByRole('button',{name:'Escuchar',exact:true}).click();
  const started=Date.now();
  await expect.poll(async()=>{
    const running=await page.locator('audio').evaluate((audio:HTMLAudioElement)=>!audio.paused && audio.currentTime>0.1);
    if(!running) console.log(`${Math.round((Date.now()-started)/1000)}s: ${await page.locator('.status').first().innerText()}`);
    return running;
  },{timeout:150000,intervals:[1000,5000,10000]}).toBe(true);
  console.log(`Audio real iniciado en ${Math.round((Date.now()-started)/1000)}s`);
  await expect(page.getByLabel('Seleccionar párrafo 14',{exact:true})).toHaveAttribute('aria-current','true');
  await page.getByRole('button',{name:'Pausar',exact:true}).click();
});
