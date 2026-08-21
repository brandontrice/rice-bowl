// Deterministic PRNG so a week's House Rule (and any random sub-choice it
// needs, like which division gets locked) can be re-derived from its seed
// instead of stored piecemeal — and can never be silently re-rolled.
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromWeek(seasonYear: number, weekNumber: number): number {
  // Simple deterministic hash — good enough for a friendly-league dealer,
  // not for anything security-sensitive.
  let h = 2166136261;
  const str = `${seasonYear}-${weekNumber}-rice-bowl`;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pick<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)];
}
