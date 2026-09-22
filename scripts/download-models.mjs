/* global AbortSignal */
import { mkdir, writeFile, rename, stat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const piper = process.argv.includes('--piper');
const repo = piper ? 'rhasspy/piper-voices' : 'onnx-community/Kokoro-82M-v1.0-ONNX';
const revision = piper ? 'v1.0.0' : '1939ad2';
const files = piper ? ['es/es_ES/davefx/medium/es_ES-davefx-medium.onnx.json', 'es/es_ES/davefx/medium/es_ES-davefx-medium.onnx', 'es/es_ES/davefx/medium/MODEL_CARD'] : ['tokenizer.json', 'voices/ef_dora.bin', 'voices/em_alex.bin', 'voices/em_santa.bin', 'onnx/model_quantized.onnx'];
if (!piper && process.argv.includes('--webgpu')) files.push('onnx/model.onnx');
const manifest = [];
for (const file of files) {
  const path = piper ? `public/models/piper/${file.split('/').at(-1)}` : `public/models/kokoro/${file}`;
  if (await stat(path).catch(() => null)) { const bytes = await readFile(path); manifest.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}); console.log(`Ya existe: ${file}`); continue; }
  console.log(`Descargando ${file}…`);
  const response = await fetch(`https://huggingface.co/${repo}/resolve/${revision}/${file}`, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`${response.status}: ${file}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  await writeFile(`${path}.partial`, bytes); await rename(`${path}.partial`, path);
  manifest.push({ file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  console.log(`${file}: ${(bytes.length / 1024 / 1024).toFixed(1)} MB`);
}
await mkdir('artifacts', { recursive: true });
await writeFile(`artifacts/${piper ? 'piper-' : ''}model-download.json`, JSON.stringify({ repo, revision, files: manifest }, null, 2));
