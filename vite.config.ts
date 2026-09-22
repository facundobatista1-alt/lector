import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const headers = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };
export default defineConfig({ plugins: [react()], worker: { format: 'es', rolldownOptions: { external: ['@echogarden/espeak-ng-emscripten'] } }, server: { host: '127.0.0.1', headers }, preview: { headers, allowedHosts: ['randy-finals-roommates-pharmacies.trycloudflare.com'] }, build: { chunkSizeWarningLimit: 1600 } });
