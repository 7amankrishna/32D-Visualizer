/**
 * NDSphere / N-ball sampling.
 *
 * A point uniformly distributed on the (N−1)-sphere in R^N is obtained by
 * drawing a Gaussian vector (independent N(0,1) coordinates) and
 * normalizing it — the Gaussian is spherically symmetric in any dimension.
 *
 * A uniform point in the N-ball of radius R:
 *   p = R · u^{1/N} · ŝ ,  u ~ U(0,1), ŝ = normalized Gaussian
 * (the 1/N power compensates the ~r^{N−1} volume growth in N dimensions).
 */

import { mulberry32, gaussianVector, type RNG } from './rng';
import { normalize, makeVector } from './vector';

export interface NDSphereGeometry {
  /** Flattened point coordinates: count × dim */
  points: Float64Array;
  /** For the ball: true when the point was drawn in the interior (not on the shell) */
  interior: boolean;
}

export class NDSphere {
  readonly dim: number;
  readonly radius: number;

  constructor(dim: number, radius = 1) {
    this.dim = dim;
    this.radius = radius;
  }

  /** Uniform surface points of the (dim−1)-sphere of given radius */
  surface(count: number, seed: number): NDSphereGeometry {
    const n = this.dim;
    const rng: RNG = mulberry32(seed);
    const pts = new Float64Array(count * n);
    const v = makeVector(n);
    for (let i = 0; i < count; i++) {
      gaussianVector(rng, n, v);
      normalize(v, v);
      for (let k = 0; k < n; k++) pts[i * n + k] = v[k] * this.radius;
    }
    return { points: pts, interior: false };
  }

  /** Uniform points in the closed N-ball of given radius */
  ball(count: number, seed: number): NDSphereGeometry {
    const n = this.dim;
    const rng: RNG = mulberry32(seed);
    const pts = new Float64Array(count * n);
    const v = makeVector(n);
    for (let i = 0; i < count; i++) {
      gaussianVector(rng, n, v);
      normalize(v, v);
      const r = this.radius * Math.pow(rng(), 1 / n);
      for (let k = 0; k < n; k++) pts[i * n + k] = v[k] * r;
    }
    return { points: pts, interior: true };
  }

  /** Exact (N−1)-sphere volume 2π^{N/2} / Γ(N/2) — displayed in info panel */
  static surfaceArea(n: number): number {
    return (2 * Math.pow(Math.PI, n / 2)) / gamma(n / 2);
  }

  /** Exact N-ball volume π^{N/2} R^N / Γ(N/2 + 1) */
  static volume(n: number, radius: number): number {
    return (Math.pow(Math.PI, n / 2) * Math.pow(radius, n)) / gamma(n / 2 + 1);
  }
}

/** Lanczos-free gamma via the Stirling/log-Gamma recurrence (sufficient for n/2 ≤ 16) */
function gamma(x: number): number {
  const G = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  x -= 1;
  let a = 0.99999999999980993;
  // Lanczos approximation (g = 7, 8 coefficients): t = z + g + 0.5
  const t = x + 7.5;
  for (let i = 0; i < G.length; i++) a += G[i] / (x + i + 1);
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}
