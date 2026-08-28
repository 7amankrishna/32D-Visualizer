/**
 * NDPoint / NDVector — first-class representations of points and vectors
 * in R^N. Both are thin, allocation-light wrappers around Float64Array so
 * the whole application (UI, workers, tests) shares one definition of an
 * N-dimensional coordinate tuple.
 */

import {
  add,
  sub,
  scale,
  dot,
  norm,
  normalize,
  distance,
  fromArray,
  makeVector,
} from './vector';
import { rotatePlane } from './rotation';

export class NDPoint {
  readonly dim: number;
  readonly data: Float64Array;

  constructor(dimOrData: number | ArrayLike<number>, data?: Float64Array) {
    if (typeof dimOrData === 'number') {
      this.dim = dimOrData;
      this.data = data ?? makeVector(dimOrData);
    } else {
      this.dim = dimOrData.length;
      this.data = data ? fromArray(data) : fromArray(dimOrData);
    }
  }

  static of(...coords: number[]): NDPoint {
    return new NDPoint(fromArray(coords));
  }

  static zero(dim: number): NDPoint {
    return new NDPoint(makeVector(dim));
  }

  get(i: number): number {
    return this.data[i];
  }

  set(i: number, v: number): NDPoint {
    this.data[i] = v;
    return this;
  }

  clone(): NDPoint {
    return new NDPoint(this.data.slice());
  }

  /** p + q */
  add(q: NDPoint, out?: NDPoint): NDPoint {
    const o = out ?? this.clone();
    add(this.data, q.data, o.data);
    return o;
  }

  /** p − q */
  sub(q: NDPoint, out?: NDPoint): NDPoint {
    const o = out ?? this.clone();
    sub(this.data, q.data, o.data);
    return o;
  }

  /** s · p */
  scale(s: number, out?: NDPoint): NDPoint {
    const o = out ?? this.clone();
    scale(this.data, s, o.data);
    return o;
  }

  dot(q: NDPoint): number {
    return dot(this.data, q.data);
  }

  norm(): number {
    return norm(this.data);
  }

  normalize(out?: NDPoint): NDPoint {
    const o = out ?? this.clone();
    normalize(this.data, o.data);
    return o;
  }

  distanceTo(q: NDPoint): number {
    return distance(this.data, q.data);
  }

  /** Rotate in the (a, b) plane by angle θ (returns a new point) */
  rotate(a: number, b: number, angle: number): NDPoint {
    const o = this.clone();
    rotatePlane(this.data, a, b, angle, o.data);
    return o;
  }

  /** Translate by vector v */
  translate(v: NDPoint): NDPoint {
    return this.add(v);
  }

  /** Distance to the origin: ‖p‖ */
  magnitude(): number {
    return this.norm();
  }

  toString(): string {
    const fmt = (v: number) => (Object.is(v, -0) ? 0 : v).toFixed(2);
    return `(${Array.from(this.data, fmt).join(', ')})`;
  }
}

/**
 * A vector (direction/quantity with magnitude) in R^N. Semantically a
 * point with the origin as reference; kept distinct for readability.
 */
export class NDVector extends NDPoint {
  toPoint(): NDPoint {
    return this.clone() as NDPoint;
  }
}
