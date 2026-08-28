/**
 * Cross-sections (slicing) of N-dimensional objects.
 *
 * Slicing fixes a set of coordinates {x_k = c_k} and leaves the remaining
 * "active" dimensions free. The intersection of an object with the
 * affine subspace is its cross-section, which lives in the lower
 * dimensional space spanned by the active axes.
 *
 * Analytic results (exact):
 *  - N-ball of radius R, m dims fixed with squared sum S = Σc_k²:
 *      cross-section = (N−m)-ball of radius sqrt(R² − S)   (empty if S > R²)
 *  - (N−1)-sphere of radius R:  (N−m)-sphere of the same radius (a shell)
 *  - N-cube [−1,1]^N, m dims fixed at c: non-empty iff |c_k| ≤ 1 ∀k,
 *    in which case the section is the (N−m)-cube [−1,1]^{N−m}
 */

import type { NDPoint } from './point';

export class NDCrossSection {
  readonly dim: number;
  /** Free (active) dimension indices */
  readonly active: number[];
  /** Fixed values for every dimension (only inactive entries are applied) */
  readonly fixed: Float64Array;

  constructor(dim: number, active: number[], fixedValues?: number[]) {
    this.dim = dim;
    this.active = [...active];
    this.fixed = new Float64Array(dim);
    if (fixedValues) this.fixed.set(fixedValues);
  }

  private isFree(d: number): boolean {
    return this.active.includes(d);
  }

  /** Clamp a point onto the slice subspace (inactive coords := fixed value) */
  apply(p: NDPoint, out: Float64Array): Float64Array {
    for (let i = 0; i < this.dim; i++) {
      out[i] = this.isFree(i) ? p.data[i] : this.fixed[i];
    }
    return out;
  }

  /** Squared distance from p to the slice subspace (for highlighting proximity) */
  distanceSq(p: NDPoint): number {
    let s = 0;
    for (let i = 0; i < this.dim; i++) {
      if (!this.isFree(i)) {
        const d = p.data[i] - this.fixed[i];
        s += d * d;
      }
    }
    return s;
  }
}

export type SectionKind = 'ball' | 'sphere' | 'cube';

/**
 * Analytic cross-section size of a regular N-object.
 * Returns a radius-like scalar (ball/sphere radius, or half-side for cube)
 * or null when the slice misses the object.
 */
export function analyticSection(
  kind: SectionKind,
  _dim: number,
  radius: number,
  fixed: Array<{ index: number; value: number }>,
): number | null {
  let sq = 0;
  for (const f of fixed) {
    if (kind === 'cube' && Math.abs(f.value) > 1) return null;
    if (kind === 'cube') continue;
    sq += f.value * f.value;
  }
  if (kind === 'cube') {
    return fixed.every((f) => Math.abs(f.value) <= 1) ? 1 : null;
  }
  const r2 = radius * radius - sq;
  return r2 <= 0 ? null : Math.sqrt(r2);
}
