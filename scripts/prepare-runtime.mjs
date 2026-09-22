import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('public/runtime', { recursive: true });
for (const name of ['ort-wasm-simd-threaded.asyncify.wasm', 'ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.jspi.wasm', 'ort-wasm-simd-threaded.jspi.mjs', 'ort-wasm-simd-threaded.jsep.wasm', 'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) {
  await copyFile(`node_modules/onnxruntime-web/dist/${name}`, `public/runtime/${name}`);
}
console.log('Runtime WASM local preparado.');
for (const name of ['espeak-ng.js', 'espeak-ng.data', 'COPYING']) {
  await copyFile(`node_modules/@echogarden/espeak-ng-emscripten/${name}`, `public/runtime/${name}`);
}
