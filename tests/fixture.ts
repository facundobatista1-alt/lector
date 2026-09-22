// Small real PDF generated without a PDF-writing dependency. Offsets are byte offsets.
export function samplePDF(first = 'Sobre la libertad'): Buffer {
  const stream = `BT /F1 14 Tf 50 760 Td (${first}) Tj 0 -35 Td (La libertad exige pensar con paciencia.) Tj 0 -35 Td (Leer permite descubrir nuevas preguntas.) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /PageLabels << /Nums [0 << /S /r >>] >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Title (Libro de prueba) /Author (Autora de prueba) >>'
  ];
  let pdf = '%PDF-1.7\n'; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

export function chapterPDF(title = 'Ensayos de prueba', firstParagraph = 'Pensar nos ayuda a elegir.'): Buffer {
  const contents = [
    ['Indice','Libertad ........ 2','Historia ........ 3'],
    ['Libertad',firstParagraph],
    ['Historia','Leer nos permite recordar.'],
    ['Bibliografia','Autor. Obra de consulta.'],
  ];
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /Outlines 4 0 R >>',
    '<< /Type /Pages /Kids [5 0 R 7 0 R 9 0 R 11 0 R] /Count 4 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Outlines /First 13 0 R /Last 16 0 R /Count 4 >>',
  ];
  contents.forEach((lines,i) => {
    const stream = `BT /F1 14 Tf 50 760 Td ${lines.map((line,j) => `${j ? '0 -35 Td ' : ''}(${line}) Tj`).join(' ')} ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${6+i*2} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  });
  contents.forEach((lines,i) => objects.push(`<< /Title (${lines[0]}) /Parent 4 0 R /Dest [${5+i*2} 0 R /Fit] ${i ? '/Prev '+(12+i)+' 0 R' : ''} ${i<3 ? '/Next '+(14+i)+' 0 R' : ''} >>`));
  objects.push(`<< /Title (${title}) /Author (Autora de prueba) >>`);
  let pdf = '%PDF-1.7\n'; const offsets: number[]=[];
  objects.forEach((object,i) => {offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;});
  const xref = Buffer.byteLength(pdf);
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(n => `${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R /Info 17 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
