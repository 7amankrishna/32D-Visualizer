/**
 * N → m projections (sourceDim > targetDim ≥ 2), mathematically defined:
 *
 *  orthographic   — drop the extra coordinates: the "shadow" of the object
 *                   onto the target subspace (an orthogonal linear map).
 *
 *  perspective    — central projection from an eye point E located at
 *                   distance `distance` along the first dropped axis:
 *                     out = p_target · ( d / (d − p_depth) )
 *                   This is the exact generalization of 3D perspective;
 *                   the depth coordinate is p_targetDim (the first hidden
 *                   axis). Points at or beyond the eye are clipped.
 *
 *  stereographic  — for objects on the (S−1)-sphere in R^S:
 *                     out = p_target / (1 − p_S)
 *                   (projection from the north pole e_S). Dims between
 *                   target and S are dropped first; the label in the UI
 *                   states this explicitly.
 *
 *  parallel       — oblique affine projection: each hidden coordinate is
 *                   "folded" into the visible axes along a fixed direction
 *                     out = p_target + Σ_{k hidden} (p_k − c_k) · m_k
 *                   m_k are fixed unit directions (seeded), analogous to
 *                   axonometric drawings of 3D on paper.
 */

import { mulberry32, type RNG } from './rng';
import { normalize, makeVector } from './vector';

export type ProjectionMethod = 'perspective' | 'orthographic' | 'stereographic' | 'parallel';

export const PROJECTION_METHODS: ProjectionMethod[] = [
  'perspective',
  'orthographic',
  'stereographic',
  'parallel',
];

/** Points closer to the eye than this (in depth units) are clipped. */
export const PERSPECTIVE_EPS = 1e-3;

export interface NDProjectionConfig {
  sourceDim: number;
  targetDim: number;
  method: ProjectionMethod;
  /** Perspective focal distance d (depth units, typically ≥ 2) */
  distance?: number;
  /** Which source coordinates map to the visible axes (length targetDim, distinct, < sourceDim) */
  activeDims?: number[];
  /** Anchor "view center" for the hidden coordinates (default 0) */
  center?: number[];
  /** Seed for the oblique mixing directions */
  seed?: number;
}

export class NDProjection {
  readonly sourceDim: number;
  readonly targetDim: number;
  readonly method: ProjectionMethod;
  readonly distance: number;
  readonly activeDims: number[];
  /** Sorted indices of the hidden dimensions (all of 0..S-1 not in activeDims) */
  readonly hiddenDims: number[];
  /** Depth axis for perspective: the first hidden dimension */
  readonly depthAxis: number;
  readonly center: Float64Array;
  /** Oblique directions m_k (targetDim × hiddenCount) for method=parallel */
  readonly mixing: Float64Array;
  readonly hiddenCount: number;

  constructor(cfg: NDProjectionConfig) {
    this.sourceDim = cfg.sourceDim;
    this.targetDim = cfg.targetDim;
    this.method = cfg.method;
    this.distance = cfg.distance ?? 4;
    const active =
      cfg.activeDims ?? Array.from({ length: cfg.targetDim }, (_, i) => i);
    // validate distinctness
    const seen = new Set<number>(active);
    if (seen.size !== active.length) {
      throw new Error('activeDims must be distinct');
    }
    this.activeDims = [...active];
    this.hiddenDims = [];
    for (let i = 0; i < cfg.sourceDim; i++) {
      if (!seen.has(i)) this.hiddenDims.push(i);
    }
    this.depthAxis = this.hiddenDims.length > 0 ? this.hiddenDims[0] : -1;
    this.center = new Float64Array(cfg.center ?? makeVector(cfg.sourceDim));
    this.hiddenCount = this.hiddenDims.length;
    this.mixing = new Float64Array(cfg.targetDim * this.hiddenCount);
    if (this.hiddenCount > 0) {
      const r: RNG = mulberry32(cfg.seed ?? 1);
      for (let k = 0; k < this.hiddenCount; k++) {
        const dir = makeVector(cfg.targetDim);
        for (let t = 0; t < cfg.targetDim; t++) dir[t] = r();
        normalize(dir, dir);
        for (let t = 0; t < cfg.targetDim; t++) this.mixing[t * this.hiddenCount + k] = dir[t];
      }
    }
  }

  /**
   * Project one point. Returns true if the point is visible
   * (false when clipped by the perspective eye).
   */
  project(p: Float64Array, out: Float32Array | Float64Array): boolean {
    const T = this.targetDim;
    const S = this.sourceDim;
    switch (this.method) {
      case 'orthographic':
        for (let t = 0; t < T; t++) out[t] = p[this.activeDims[t]];
        return true;
      case 'perspective': {
        const d = this.distance;
        // no hidden dims → identity (an S=S "perspective" is a rigid view)
        if (this.depthAxis < 0) {
          for (let t = 0; t < T; t++) out[t] = p[this.activeDims[t]];
          return true;
        }
        const depth = p[this.depthAxis] - this.center[this.depthAxis];
        const denom = d - depth;
        if (denom < PERSPECTIVE_EPS) return false;
        const f = d / denom;
        for (let t = 0; t < T; t++) {
          const a = this.activeDims[t];
          out[t] = (p[a] - this.center[a]) * f;
        }
        return true;
      }
      case 'stereographic': {
        const pole = p[S - 1] - this.center[S - 1];
        const denom = 1 - pole;
        if (denom < PERSPECTIVE_EPS) return false;
        const f = 1 / denom;
        for (let t = 0; t < T; t++) {
          const a = this.activeDims[t];
          out[t] = (p[a] - this.center[a]) * f;
        }
        return true;
      }
      case 'parallel': {
        for (let t = 0; t < T; t++) {
          const a = this.activeDims[t];
          let v = p[a] - this.center[a];
          for (let k = 0; k < this.hiddenCount; k++) {
            const h = this.hiddenDims[k];
            v += (p[h] - this.center[h]) * this.mixing[t * this.hiddenCount + k];
          }
          out[t] = v;
        }
        return true;
      }
    }
  }

  /** Human-readable description of the mapping, e.g. "4D → 3D perspective from W" */
  describe(names: string[]): string {
    const T = this.targetDim;
    const S = this.sourceDim;
    const visible = this.activeDims.slice(0, T).map((i) => names[i]).join('·');
    switch (this.method) {
      case 'orthographic':
        return `${S}D → ${T}D orthographic (shadow onto ${visible})`;
      case 'perspective':
        return this.depthAxis < 0
          ? `${S}D → ${T}D (identity)`
          : `${S}D → ${T}D perspective (eye along ${names[this.depthAxis]})`;
      case 'stereographic':
        return `${S}D → ${T}D stereographic (from pole ${names[S - 1]})`;
      case 'parallel':
        return `${S}D → ${T}D oblique/parallel (hidden axes folded)`;
    }
  }

  /** Project a whole buffer. Writes visible flags. */
  projectBuffer(
    points: Float64Array,
    out: Float32Array | Float64Array,
    visible: Uint8Array,
  ): number {
    const n = this.sourceDim;
    let shown = 0;
    for (let i = 0, o = 0; i < points.length; i += n, o += this.targetDim) {
      if (this.project(points.subarray(i, i + n), out.subarray(o, o + this.targetDim))) {
        visible[i / n] = 1;
        shown++;
      } else {
        visible[i / n] = 0;
        out[o] = 0;
        out[o + 1] = 0;
        out[o + 2] = 0;
      }
    }
    return shown;
  }
}
