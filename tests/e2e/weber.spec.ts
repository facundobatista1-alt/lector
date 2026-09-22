import { expect, test } from '@playwright/test';

test('PDF de Weber: tildes y reparación del libro ya importado', async ({ page }) => {
  test.skip(!process.env.WEBER_PDF, 'PDF privado opcional: definir WEBER_PDF para reproducir.');
  await page.goto('/');
  await page.getByRole('button', { name: /Biblioteca/ }).click();
  await page.getByLabel('Agregar PDF').setInputFiles(process.env.WEBER_PDF!);
  await expect(page.getByRole('heading', { name: 'El político y el científico', exact: true })).toBeVisible();
  const paragraph = page.locator('.paragraph').filter({ hasText: 'Esta conferencia que' });
  await expect(paragraph).toContainText('Tratándose de una exposición');
  await expect(paragraph).toContainText('política como vocación');
  await expect(paragraph).not.toContainText('Û');
  await expect(paragraph).not.toContainText('¿Qué entendemos por política?');
  await paragraph.click();
  const selected = await paragraph.getAttribute('aria-label');
  // Simulate the previous release's stored extraction, then exercise startup migration.
  await page.evaluate(async () => {
    const connection = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lumbre-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = connection.transaction('books', 'readwrite');
      const store = transaction.objectStore('books');
      const request = store.get('115f3d03c041553f8dd01931a99b3a68329936ef29472d4a7a166673bbebdc5c');
      request.onsuccess = () => {
        const book = request.result;
        book.blocks = book.originalBlocks;
        delete book.originalBlocks;
        delete book.encodingRepair;
        delete book.extractionVersion;
        store.put(book);
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    connection.close();
  });
  await page.reload();
  await page.getByRole('button',{name:'Lector'}).click();
  await expect(page.getByRole('button', { name: selected!, exact: true })).toHaveAttribute('aria-current', 'true');
  await expect(paragraph).toContainText('Tratándose de una exposición');
  await paragraph.screenshot({ path: `artifacts/weber-${test.info().project.name}-reparado.png` });
});
