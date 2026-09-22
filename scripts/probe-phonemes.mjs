import initialize from '@echogarden/espeak-ng-emscripten';
const m = await initialize();
console.log('Module exports', Object.keys(m).filter(k => /speak|UTF|free/.test(k)));
const worker = new m.eSpeakNGWorker();
console.log('Worker methods', Object.getOwnPropertyNames(Object.getPrototypeOf(worker)));
worker.set_voice('es');
console.log('IPA', worker.synthesize_ipa('La libertad, una pregunta.'));
