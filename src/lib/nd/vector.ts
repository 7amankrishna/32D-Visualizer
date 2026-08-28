/**
 * Core N-dimensional vector/point algebra.
 *
 * Every object in the app — the user ("YOU"), hypercube vertices, sphere
 * samples, imported data — is represented as a Float64Array of length N.
 * These operations are generic for any N (2..32+) and never special-case
 * a particular dimension.
 */

export const MAX_DIM = 32;
export const MIN_DIM = 2;

export function makeVector(n: number, fill = 0): Float64Array {
  return new Float64Array(n).fill(fill);
}

export function fromArray(a: ArrayLike<number>, n?: number): Float64Array {
  const len = n ?? a.length;
  const out = new Float64Array(len);
  for (let i = 0; i < len; i++) out[i] = a[i];
  return out;
}

export function copy(src: Float64Array, dst: Float64Array): Float64Array {
  dst.set(src);
  return dst;
}

/** out = a + b (elementwise) */
export function add(a: Float64Array, b: Float64Array, out: Float64Array): Float64Array {
  for (let i = 0; i < a.length; i++) out[i] = a[i] + b[i];
  return out;
}

/** out = a - b */
export function sub(a: Float64Array, b: Float64Array, out: Float64Array): Float64Array {
  for (let i = 0; i < a.length; i++) out[i] = a[i] - b[i];
  return out;
}

/** out = a * s */
export function scale(a: Float64Array, s: number, out: Float64Array): Float64Array {
  for (let i = 0; i < a.length; i++) out[i] = a[i] * s;
  return out;
}

/** Euclidean dot product a·b */
export function dot(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Squared Euclidean norm ‖a² */
export function normSq(a: Float64Array): number {
  return dot(a, a);
}

/** Euclidean norm ‖a‖ = sqrt(Σ xᵢ²) */
export function norm(a: Float64Array): number {
  return Math.sqrt(normSq(a));
}

/** out = a / ‖a‖ (returns zero vector for a = 0) */
export function normalize(a: Float64Array, out: Float64Array): Float64Array {
  const n = norm(a);
  if (n < 1e-12) {
    out.fill(0);
    return out;
  }
  const inv = 1 / n;
  for (let i = 0; i < a.length; i++) out[i] = a[i] * inv;
  return out;
}

/** Euclidean distance ‖a - b‖ */
export function distance(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

/** Angle between two vectors in radians (0..π) */
export function angleBetween(a: Float64Array, b: Float64Array): number {
  const na = norm(a);
  const nb = norm(b);
  if (na < 1e-12 || nb < 1e-12) return 0;
  const c = Math.min(1, Math.max(-1, dot(a, b) / (na * nb)));
  return Math.acos(c);
}

/** out = a + t * (b - a), linear interpolation between points */
export function lerp(a: Float64Array, b: Float64Array, t: number, out: Float64Array): Float64Array {
  for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

/** Clamp every coordinate of a into [min, max] */
export function clamp(a: Float64Array, min: number, max: number): void {
  for (let i = 0; i < a.length; i++) {
    a[i] = Math.min(max, Math.max(min, a[i]));
  }
}

/** Axis-aligned bounding radius (max ‖p‖ over a point buffer) */
export function boundingRadius(points: Float64Array, n: number): number {
  let r = 0;
  for (let i = 0; i < points.length; i += n) {
    const d = normSq(points.subarray(i, i + n));
    if (d > r) r = d;
  }
  return Math.sqrt(r);
}
