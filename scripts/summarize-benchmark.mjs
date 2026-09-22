import { readFile, readdir, writeFile } from 'node:fs/promises';
const measurements = JSON.parse(await readFile('artifacts/benchmark-measurements.json','utf8'));
const groups = {};
for (const m of measurements) {
  const key = `${m.voice}/${m.actual}`;
  const group = groups[key] ??= { samples:0, generationSeconds:0, audioSeconds:0, loadSeconds:0, threads:m.threads, jsMemoryAvailable:false };
  group.samples++; group.generationSeconds += m.generationMs / 1000; group.audioSeconds += m.audioSeconds; group.loadSeconds += m.loadMs / 1000;
  group.jsMemoryAvailable ||= !!m.jsHeapBytes;
}
for (const group of Object.values(groups)) group.weightedRTF = group.generationSeconds / group.audioSeconds;
const waveforms = [];
for (const file of await readdir('artifacts')) {
  if (!file.endsWith('.wav')) continue;
  const b = await readFile(`artifacts/${file}`); const rate = b.readUInt32LE(24); const n = b.readUInt32LE(40)/2;
  let power = 0; let peak = 0; let clipping = 0;
  for (let i=0;i<n;i++) { const sample = b.readInt16LE(44+i*2)/32768; power += sample*sample; peak = Math.max(peak,Math.abs(sample)); if (Math.abs(sample) >= .999) clipping++; }
  waveforms.push({ file, seconds:n/rate, sampleRate:rate, rms:Math.sqrt(power/n), peak, clippingFraction:clipping/n, note:'Señal no nula no demuestra naturalidad ni pronunciación correcta.' });
}
const result = { groups, waveforms };
await writeFile('artifacts/benchmark-summary.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
