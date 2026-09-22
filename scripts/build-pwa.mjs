import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const entries = await readdir('dist/assets');
const assets = entries.filter(name => /\.(js|css|mjs)$/.test(name)).map(name => `/assets/${name}`);
const precache = ['/index.html','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png',...assets];
const source = await readFile('src/pwa/sw.js','utf8');
const revision = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0,12);
await writeFile('dist/sw.js',source.replace('const PRECACHE = __PRECACHE__;','const PRECACHE = '+JSON.stringify(precache)+';').replace('const REVISION = __REVISION__;','const REVISION = '+JSON.stringify(revision)+';'));
console.log(`PWA: ${precache.length} recursos de interfaz, versión ${revision}.`);
