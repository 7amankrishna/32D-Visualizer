/** Color encodings for N-dimensional data. Values are RGB in 0..1. */

export type ColorMode = 'uniform' | 'coordinate' | 'norm' | 'cluster';

export const CLUSTER_COLORS: Array<[number, number, number]> = [
  [0.30, 0.79, 0.94],
  [0.71, 0.09, 0.62],
  [1.0, 0.84, 0.04],
  [0.29, 0.87, 0.61],
  [0.99, 0.55, 0.20],
  [0.55, 0.62, 0.98],
  [0.96, 0.42, 0.58],
  [0.65, 0.95, 0.35],
];

/** Diverging blue → white → pink for coordinate values in [−range, range] */
export function diverging(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(-1, t));
  if (x < 0) {
    const u = -x;
    return [0.1 + 0.85 * (1 - u), 0.25 + 0.6 * (1 - u), 0.95];
  }
  const u = x;
  return [0.95, 0.2 + 0.6 * (1 - u), 0.45 + 0.5 * (1 - u) * 0.4 + 0.2];
}

/** Sequential deep-blue → cyan → yellow for magnitudes in [0, 1] */
export function sequential(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  if (x < 0.5) {
    const u = x * 2;
    return [0.08 + 0.1 * u, 0.2 + 0.55 * u, 0.75 + 0.15 * u];
  }
  const u = (x - 0.5) * 2;
  return [0.18 + 0.8 * u, 0.75 + 0.1 * u, 0.9 - 0.7 * u];
}

/**
 * Compute per-point colors for a point buffer.
 * points: count × dim, colorMode decides the encoding:
 *  coordinate — value of `colorCoord` (diverging)
 *  norm       — ‖p‖ / maxNorm (sequential)
 *  cluster    — cluster id
 */
export function computeColors(
  points: Float64Array,
  dim: number,
  mode: ColorMode,
  colorCoord: number,
  maxNorm: number,
  cluster?: Uint8Array,
): Float32Array {
  const count = points.length / dim;
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    let c: [number, number, number];
    if (mode === 'uniform') {
      c = [0.3, 0.79, 0.94];
    } else if (mode === 'cluster' && cluster) {
      c = CLUSTER_COLORS[cluster[i] % CLUSTER_COLORS.length];
    } else if (mode === 'coordinate') {
      const v = points[i * dim + Math.min(colorCoord, dim - 1)];
      const range = Math.max(1, Math.abs(v)); // self-normalizing scale
      c = diverging(v / range);
    } else {
      let n = 0;
      for (let k = 0; k < dim; k++) n += points[i * dim + k] ** 2;
      c = sequential(Math.sqrt(n) / Math.max(0.001, maxNorm));
    }
    out[i * 3] = c[0];
    out[i * 3 + 1] = c[1];
    out[i * 3 + 2] = c[2];
  }
  return out;
}
