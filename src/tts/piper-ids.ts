export function piperIds(phonemes: string, map: Record<string, number[]>): bigint[] {
  const values = [...map['^'], ...map['_']];
  for (const phoneme of phonemes.normalize('NFD')) {
    if (!map[phoneme]) throw new Error(`Fonema no compatible con Piper: ${phoneme}`);
    values.push(...map[phoneme], ...map['_']);
  }
  values.push(...map['$']);
  return values.map(BigInt);
}
