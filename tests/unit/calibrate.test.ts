import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { fastestEngine } from '../../src/tts/calibrate';
import type { Measurement } from '../../src/types';
const base: Measurement = {voice:'ef_dora',requested:'wasm',actual:'wasm',createdAt:1,userAgent:'test',generationMs:10,loadMs:0,audioSeconds:1,rtf:1,pcmBytes:1,notes:'dora-calibration-v1'};
it('elige por comparación del mismo texto, no por tiempos de otros párrafos', () => {
  expect(fastestEngine([])).toBe('wasm');
  expect(fastestEngine([base,{...base,actual:'webgpu',rtf:.8}])).toBe('webgpu');
  expect(fastestEngine([base,{...base,actual:'webgpu',rtf:.95}])).toBe('wasm');
  expect(fastestEngine([base,{...base,actual:'webgpu',rtf:.1,notes:undefined}])).toBe('wasm');
  expect(fastestEngine([base,{...base,actual:'webgpu',rtf:.8},{...base,actual:'webgpu',rtf:2,createdAt:2}])).toBe('wasm');
});
