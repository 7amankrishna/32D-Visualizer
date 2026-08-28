/**
 * NDTransform — a composable affine transform in R^N:
 *   p' = rotation · (scale · p) + translation
 * Built from the same generic primitives, so it works for any N.
 */

import { add, scale, makeVector } from './vector';
import { NDRotation, type PlaneRotation } from './rotation';
import type { NDPoint } from './point';

export interface NDTransformSpec {
  dim: number;
  translation?: number[];
  scale?: number;
  planes?: PlaneRotation[];
}

export class NDTransform {
  readonly dim: number;
  readonly rotation: NDRotation;
  readonly scaleFactor: number;
  readonly translation: Float64Array;

  constructor(spec: NDTransformSpec) {
    this.dim = spec.dim;
    this.rotation = new NDRotation(spec.dim, spec.planes ?? []);
    this.scaleFactor = spec.scale ?? 1;
    const t = makeVector(spec.dim);
    if (spec.translation) t.set(spec.translation.slice(0, spec.dim));
    this.translation = t;
  }

  apply(p: NDPoint, out?: Float64Array): Float64Array {
    const o = out ?? makeVector(this.dim);
    if (this.scaleFactor !== 1) scale(p.data, this.scaleFactor, o);
    else o.set(p.data);
    this.rotation.rotatePoint(o, o);
    add(o, this.translation, o);
    return o;
  }

  /** Invert: p = scale⁻¹ · Rᵀ (p − t) */
  invert(p: Float64Array, out: Float64Array): Float64Array {
    const n = this.dim;
    const t = makeVector(n);
    sub2(p, this.translation, t);
    // inverse rotation = rotations with negated angles, reversed order
    const rev = [...this.rotation.planes].reverse().map((pl) => ({
      a: pl.a,
      b: pl.b,
      angle: -pl.angle,
    }));
    const inv = new NDRotation(n, rev);
    const r = makeVector(n);
    inv.rotatePoint(t, r);
    const s = this.scaleFactor === 0 ? 1 : 1 / this.scaleFactor;
    for (let i = 0; i < n; i++) out[i] = r[i] * s;
    return out;
  }
}

import { sub as sub2 } from './vector';
