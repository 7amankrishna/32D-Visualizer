/**
 * N-dimensional rotations.
 *
 * A rotation in N dimensions acts in a single coordinate plane (i, j):
 *   xᵢ' =  cos θ · xᵢ − sin θ · xⱼ
 *   xⱼ' =  sin θ · xᵢ + cos θ · xⱼ
 * All other coordinates are unchanged. This is a Givens rotation — an
 * orthonormal, numerically stable transformation. Any N-dimensional
 * rotation is a composition of such plane rotations.
 *
 * There are N(N−1)/2 independent rotation planes in N dimensions
 * (4D → 6, 8D → 28, 32D → 496).
 */

import { makeVector } from './vector';

export interface PlaneRotation {
  /** First axis index (0-based) */
  a: number;
  /** Second axis index (0-based), a ≠ b */
  b: number;
  /** Angle in radians */
  angle: number;
  /** Optional continuous rotation speed (rad/s) used by the animator */
  speed?: number;
}

/** Number of independent rotation planes in N dimensions: N(N−1)/2 */
export function rotationPlaneCount(n: number): number {
  return (n * (n - 1)) / 2;
}

/** Label of a rotation plane, e.g. "X₁–X₄" (uses human-readable names) */
export function planeLabel(a: number, b: number, dim: number, names?: string[]): string {
  const n = names ?? defaultAxisNames(dim);
  return `${n[a]}–${n[b]}`;
}

/** Canonical axis names: X, Y, Z, W, then X₅… for 5D+. */
export function defaultAxisNames(dim: number): string[] {
  const names: string[] = [];
  const base = ['X', 'Y', 'Z', 'W'];
  for (let i = 0; i < dim; i++) {
    names.push(i < 4 ? base[i] : `X${subscript(i + 1)}`);
  }
  return names;
}

const SUBS = '₀₁₂₃₄₆₇₈';
export function subscript(n: number): string {
  return String(n)
    .split('')
    .map((d) => SUBS[Number(d)])
    .join('');
}

/** Apply a single plane rotation to one vector (in-place, out ≠ p allowed). */
export function rotatePlane(
  p: Float64Array,
  a: number,
  b: number,
  angle: number,
  out: Float64Array,
): Float64Array {
  out.set(p);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const pa = p[a];
  const pb = p[b];
  out[a] = c * pa - s * pb;
  out[b] = s * pa + c * pb;
  return out;
}

export class NDRotation {
  readonly dim: number;
  planes: PlaneRotation[];
  private scratch: Float64Array;
  private scratchPoint: Float64Array;

  constructor(dim: number, planes: PlaneRotation[] = []) {
    this.dim = dim;
    this.planes = planes;
    this.scratch = makeVector(dim);
    this.scratchPoint = makeVector(dim);
  }

  /**
   * Compose all active planes: out = Rₖ…R₂R₁ · p.
   * Uses a single reusable scratch buffer; safe for in-place (out === p).
   */
  rotatePoint(p: Float64Array, out: Float64Array): Float64Array {
    let src = p;
    for (const pl of this.planes) {
      if (Math.abs(pl.angle) < 1e-9) continue;
      const c = Math.cos(pl.angle);
      const s = Math.sin(pl.angle);
      // When src is the scratch buffer we must write to `out`
      // (`p` is never safe to clobber because it may still be read).
      const dst = src === this.scratch ? out : this.scratch;
      dst.set(src);
      const pa = src[pl.a];
      const pb = src[pl.b];
      dst[pl.a] = c * pa - s * pb;
      dst[pl.b] = s * pa + c * pb;
      src = dst;
    }
    out.set(src);
    return out;
  }

  /** Rotate an entire point buffer (points laid out row-major, n = dim). */
  rotateBuffer(points: Float64Array, out: Float64Array): void {
    const n = this.dim;
    if (this.planes.length === 0) {
      out.set(points);
      return;
    }
    for (let i = 0; i < points.length; i += n) {
      this.rotatePoint(points.subarray(i, i + n), this.scratchPoint);
      out.set(this.scratchPoint, i);
    }
  }
}
