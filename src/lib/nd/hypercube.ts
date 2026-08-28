/**
 * NDHypercube — the N-dimensional hypercube (N-cube) with vertices
 * {−1, +1}^N.
 *
 * Exact combinatorics:
 *   vertices = 2^N
 *   edges    = N · 2^(N−1)        (each vertex touches N edges)
 *   faces    = C(N,2) · 2^(N−2)   (2-faces)
 *
 * For N above FULL_ENUMERATION_MAX (default 14 → 16 384 vertices) a
 * browser cannot store all 2^N vertices (32D → 4.29 × 10⁹). We therefore
 * keep the EXACT bit-pattern representation and SAMPLE a seeded subset of
 * vertices for rendering. Every sampled vertex is a real vertex of the
 * N-cube; edges are recovered exactly from bit XOR (two vertices are
 * adjacent ⇔ their bit patterns differ in exactly one bit). The UI always
 * reports full counts AND flags "SAMPLED" when N exceeds the threshold.
 */

import { mulberry32 } from './rng';
import { rotationPlaneCount } from './rotation';

/** Largest N for which all 2^N vertices are enumerated (2^14 = 16 384). */
export const FULL_ENUMERATION_MAX = 14;
/** Vertex sample size used when N exceeds FULL_ENUMERATION_MAX. */
export const SAMPLED_VERTEX_COUNT = 4096;

export interface NDHypercubeGeometry {
  /** Flattened vertex coordinates: count × N */
  points: Float64Array;
  /** Bit pattern per vertex (bit i = sign of coordinate i: 1 → +1) */
  bits: Uint32Array;
  /** Edge list as index pairs (Uint32) */
  edges: Uint32Array;
  /** Number of vertices shown */
  count: number;
  /** True when only a subset of the 2^N vertices is present */
  sampled: boolean;
}

export class NDHypercube {
  readonly dim: number;
  /** Exact vertex count 2^dim (may exceed 2^32 — use toExponential in UI) */
  readonly fullVertices: number;
  readonly fullEdges: number;
  readonly rotationPlanes: number;

  constructor(dim: number) {
    this.dim = dim;
    this.fullVertices = Math.pow(2, dim);
    this.fullEdges = dim * Math.pow(2, dim - 1);
    this.rotationPlanes = rotationPlaneCount(dim);
  }

  /**
   * Generate the vertex/edge geometry, sampling for high dimensions.
   * Deterministic for a given seed.
   */
  build(seed: number): NDHypercubeGeometry {
    const n = this.dim;
    const full = n <= FULL_ENUMERATION_MAX;
    const count = full ? Math.min(65536, this.fullVertices) : SAMPLED_VERTEX_COUNT;
    const rng = mulberry32(seed);

    const bits = new Uint32Array(count);
    const seen = new Set<number>();

    if (full) {
      for (let i = 0; i < count; i++) {
        bits[i] = i;
        seen.add(i);
      }
    } else {
      // Seeded random sampling of distinct bit patterns
      let guard = 0;
      while (seen.size < count && guard < count * 64) {
        guard++;
        const b = (Math.floor(rng() * 0xffffffff) >>> 0);
        seen.add(b);
      }
      let i = 0;
      for (const b of seen) bits[i++] = b;
    }

    const points = new Float64Array(count * n);
    for (let i = 0; i < count; i++) {
      const b = bits[i];
      for (let k = 0; k < n; k++) {
        points[i * n + k] = (b >> k) & 1 ? 1 : -1;
      }
    }

    // Edges: pairs of vertices whose bit patterns differ in exactly one bit.
    const edgePairs: number[] = [];
    if (full) {
      // Fast path: enumeration order == bit-pattern order, so the vertex
      // adjacent along axis k has index bits[i] ^ (1 << k) < 2^n = count.
      for (let i = 0; i < count; i++) {
        for (let k = 0; k < n; k++) {
          const j = bits[i] ^ (1 << k);
          if (j > i) edgePairs.push(i, j);
        }
      }
    } else {
      // General O(K²) with popcount — fine for K = 4096 in a worker
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          if (popcount32(bits[i] ^ bits[j]) === 1) edgePairs.push(i, j);
        }
      }
    }

    return {
      points,
      bits,
      edges: new Uint32Array(edgePairs),
      count,
      sampled: !full,
    };
  }
}

/** Popcount for 32-bit integers (Brian Kernighan's algorithm) */
export function popcount32(x: number): number {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}
