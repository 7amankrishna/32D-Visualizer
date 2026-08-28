/**
 * Deterministic pseudo-random number generation.
 * All procedural geometry is seeded so a given (seed, params) pair always
 * produces the identical N-dimensional dataset.
 */

export type RNG = () => number;

/** Mulberry32 — small, fast, deterministic 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Standard normal samples via the Box–Muller transform.
 * A Gaussian vector in N dimensions is the canonical way to get a point
 * uniformly distributed on the (N-1)-sphere: normalize it.
 */
export function gaussian(rng: RNG): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function gaussianVector(rng: RNG, n: number, out: Float64Array): Float64Array {
  for (let i = 0; i < n; i++) out[i] = gaussian(rng);
  return out;
}
