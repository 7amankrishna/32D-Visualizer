/**
 * N-dimensional point cloud generators.
 * All distributions are generic in N and deterministic per seed.
 */

import { mulberry32, gaussian, type RNG } from './rng';
import { normalize, makeVector } from './vector';

export type CloudDistribution =
  | 'uniform' // uniform in the N-ball of radius R
  | 'gaussian' // independent N(0, σ) coordinates, σ = R / 2
  | 'sphere' // uniform on the (N−1)-sphere of radius R
  | 'hypercube' // uniform in [−R, R]^N
  | 'clustered'; // k Gaussian clusters around random centers

export const CLOUD_DISTRIBUTIONS: Array<{ id: CloudDistribution; label: string }> = [
  { id: 'uniform', label: 'Uniform (N-ball)' },
  { id: 'gaussian', label: 'Gaussian' },
  { id: 'sphere', label: 'N-sphere surface' },
  { id: 'hypercube', label: 'Hypercube volume' },
  { id: 'clustered', label: 'Clustered' },
];

export interface CloudConfig {
  dim: number;
  count: number;
  distribution: CloudDistribution;
  radius: number;
  seed: number;
  /** Number of clusters for distribution = clustered */
  clusters: number;
}

export interface CloudGeometry {
  /** Flattened points: count × dim */
  points: Float64Array;
  /** Cluster index per point (for coloring); all 0 unless clustered */
  cluster: Uint8Array;
  count: number;
}

export function generateCloud(cfg: CloudConfig): CloudGeometry {
  const { dim: n, count, distribution, radius, seed, clusters } = cfg;
  const rng: RNG = mulberry32(seed);
  const points = new Float64Array(count * n);
  const cluster = new Uint8Array(count);
  const v = makeVector(n);

  // Cluster centers (fixed for the whole cloud)
  const centers: Float64Array[] = [];
  if (distribution === 'clustered') {
    const k = Math.max(2, Math.min(clusters, 8));
    for (let c = 0; c < k; c++) {
      const cVec = makeVector(n);
      gaussianVectorLocal(rng, n, cVec);
      normalize(cVec, cVec);
      const r = radius * 0.55;
      for (let i = 0; i < n; i++) cVec[i] *= r;
      centers.push(cVec);
    }
  }

  for (let i = 0; i < count; i++) {
    switch (distribution) {
      case 'uniform': {
        gaussianVectorLocal(rng, n, v);
        normalize(v, v);
        const r = radius * Math.pow(rng(), 1 / n);
        for (let k = 0; k < n; k++) points[i * n + k] = v[k] * r;
        break;
      }
      case 'gaussian': {
        const sigma = radius / 2;
        for (let k = 0; k < n; k++) points[i * n + k] = gaussian(rng) * sigma;
        break;
      }
      case 'sphere': {
        gaussianVectorLocal(rng, n, v);
        normalize(v, v);
        for (let k = 0; k < n; k++) points[i * n + k] = v[k] * radius;
        break;
      }
      case 'hypercube': {
        for (let k = 0; k < n; k++) points[i * n + k] = rng() * 2 * radius - radius;
        break;
      }
      case 'clustered': {
        const c = i % centers.length;
        cluster[i] = c;
        const center = centers[c];
        const spread = radius * 0.22;
        for (let k = 0; k < n; k++) {
          points[i * n + k] = center[k] + gaussian(rng) * spread;
        }
        break;
      }
    }
  }

  return { points, cluster, count };
}

function gaussianVectorLocal(rng: RNG, n: number, out: Float64Array): void {
  for (let i = 0; i < n; i++) out[i] = gaussian(rng);
}
