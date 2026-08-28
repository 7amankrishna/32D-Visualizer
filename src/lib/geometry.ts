/**
 * Object geometry builders: turn the abstract "object kind" selected in the
 * UI into a concrete N-dimensional point/edge set. The same builders run in
 * the main thread (small objects) and in the Web Worker (large ones).
 */

import {
  NDHypercube,
  NDSphere,
  generateCloud,
  makeVector,
  norm,
  type CloudConfig,
} from './nd';

export type ObjectKind =
  | 'point'
  | 'vector'
  | 'hypercube'
  | 'sphere'
  | 'ball'
  | 'cloud'
  | 'grid'
  | 'plane'
  | 'imported';

export interface GeometryRequest {
  kind: ObjectKind;
  dim: number;
  /** For cloud: full config; for imported: raw data */
  cloud?: CloudConfig;
  imported?: { points: number[]; dim: number };
  /** Grid spacing / extent */
  gridExtent?: number;
  seed: number;
  /** User point (for kind=point) */
  userPoint?: number[];
  /** Vector endpoint (for kind=vector) */
  vectorEnd?: number[];
}

export interface Geometry {
  kind: ObjectKind;
  dim: number;
  /** Flattened N-dim points: count × dim */
  points: Float64Array;
  /** Edge index pairs (for wireframe objects) */
  edges: Uint32Array;
  /** Points per row in `points` */
  count: number;
  /** True when a sampled subset is shown instead of the exact object */
  sampled: boolean;
  /** Exact full vertex count (2^N for hypercube) when meaningful */
  totalVertices: number;
  /** Exact full edge count when meaningful */
  totalEdges: number;
  /** Per-point cluster id (clouds) */
  cluster?: Uint8Array;
  /** Radius of the analytic sphere/ball, when applicable */
  radius?: number;
}

/** Build the N-dimensional geometry for the selected object. */
export function buildGeometry(req: GeometryRequest): Geometry {
  const n = req.dim;
  const seed = req.seed ?? 1;

  switch (req.kind) {
    case 'point': {
      const p = makeVector(n);
      if (req.userPoint) p.set(req.userPoint.slice(0, n));
      return {
        kind: 'point',
        dim: n,
        points: p,
        edges: new Uint32Array(0),
        count: 1,
        sampled: false,
        totalVertices: 1,
        totalEdges: 0,
      };
    }

    case 'vector': {
      const a = makeVector(n);
      const b = makeVector(n);
      if (req.vectorEnd) b.set(req.vectorEnd.slice(0, n));
      const edges = new Uint32Array([0, 1]);
      return {
        kind: 'vector',
        dim: n,
        points: new Float64Array([...a, ...b]),
        edges,
        count: 2,
        sampled: false,
        totalVertices: 2,
        totalEdges: 1,
      };
    }

    case 'hypercube': {
      const cube = new NDHypercube(n);
      const g = cube.build(seed);
      return {
        kind: 'hypercube',
        dim: n,
        points: g.points,
        edges: g.edges,
        count: g.count,
        sampled: g.sampled,
        totalVertices: cube.fullVertices,
        totalEdges: cube.fullEdges,
      };
    }

    case 'sphere':
    case 'ball': {
      const sphere = new NDSphere(n, 1.6);
      const count = Math.min(9000, Math.max(600, Math.round(200 * n)));
      const g = req.kind === 'sphere' ? sphere.surface(count, seed) : sphere.ball(count, seed);
      return {
        kind: req.kind,
        dim: n,
        points: g.points,
        edges: new Uint32Array(0),
        count: g.points.length / n,
        sampled: false,
        totalVertices: count,
        totalEdges: 0,
        radius: sphere.radius,
      };
    }

    case 'cloud': {
      const cfg: CloudConfig = {
        dim: n,
        count: Math.max(16, Math.min(20000, req.cloud?.count ?? 1500)),
        distribution: req.cloud?.distribution ?? 'uniform',
        radius: req.cloud?.radius ?? 2,
        seed,
        clusters: req.cloud?.clusters ?? 4,
      };
      const g = generateCloud(cfg);
      return {
        kind: 'cloud',
        dim: n,
        points: g.points,
        edges: new Uint32Array(0),
        count: g.count,
        sampled: false,
        totalVertices: g.count,
        totalEdges: 0,
        cluster: g.cluster,
      };
    }

    case 'grid': {
      const extent = Math.min(req.gridExtent ?? 3, 4);
      const pts: number[] = [];
      // 3D lattice in the first three axes (the visible subspace); higher
      // coordinates are 0 — an honest "environment" for navigation.
      const m = Math.round(extent);
      const pad = new Array(Math.max(0, n - 3)).fill(0);
      for (let x = -m; x <= m; x++)
        for (let y = -m; y <= m; y++)
          for (let z = -m; z <= m; z++) pts.push(x, y, z, ...pad);
      const points = new Float64Array(pts);
      const edges: number[] = [];
      const idx = (x: number, y: number, z: number) =>
        (x + m) * (2 * m + 1) * (2 * m + 1) + (y + m) * (2 * m + 1) + (z + m);
      for (let x = -m; x <= m; x++)
        for (let y = -m; y <= m; y++)
          for (let z = -m; z <= m; z++) {
            if (x < m) edges.push(idx(x, y, z), idx(x + 1, y, z));
            if (y < m) edges.push(idx(x, y, z), idx(x, y + 1, z));
            if (z < m) edges.push(idx(x, y, z), idx(x, y, z + 1));
          }
      return {
        kind: 'grid',
        dim: n,
        points,
        edges: new Uint32Array(edges),
        count: points.length / n,
        sampled: false,
        totalVertices: points.length / n,
        totalEdges: edges.length / 2,
      };
    }

    case 'plane': {
      // Unit square in the X–Y axes of R^n
      const s = 1.5;
      const z = new Array(n - 2).fill(0);
      const pts = [
        [-s, -s, ...z],
        [s, -s, ...z],
        [s, s, ...z],
        [-s, s, ...z],
      ];
      const points = new Float64Array(pts.flat());
      const edges = new Uint32Array([0, 1, 1, 2, 2, 3, 3, 0]);
      return {
        kind: 'plane',
        dim: n,
        points,
        edges,
        count: 4,
        sampled: false,
        totalVertices: 4,
        totalEdges: 4,
      };
    }

    case 'imported': {
      const pts = req.imported?.points ?? [];
      const idim = Math.min(n, req.imported?.dim ?? n);
      const count = Math.floor(pts.length / idim);
      // Pad to the current dimension with zeros when the dataset has fewer dims
      const points = new Float64Array(count * n);
      for (let i = 0; i < count; i++) {
        for (let k = 0; k < idim; k++) points[i * n + k] = pts[i * idim + k];
      }
      return {
        kind: 'imported',
        dim: n,
        points,
        edges: new Uint32Array(0),
        count,
        sampled: false,
        totalVertices: count,
        totalEdges: 0,
      };
    }
  }
}

/** Rough bounding scale of a geometry (for auto-fitting the camera) */
export function geometryScale(g: Geometry): number {
  if (g.points.length === 0) return 2;
  let max = 0;
  for (let i = 0; i < g.points.length; i++) {
    const a = Math.abs(g.points[i]);
    if (a > max) max = a;
  }
  return Math.max(1, max * 1.4);
}

/** Norm of the user's coordinate vector — shown in the HUD as ‖YOU‖ */
export function userNorm(user: number[], dim: number): number {
  return norm(new Float64Array(user.slice(0, dim)));
}
