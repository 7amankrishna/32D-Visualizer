/**
 * Unit tests for the N-dimensional mathematics engine.
 * Verifies the math that the whole visualization stands on.
 */

import { describe, it, expect } from 'vitest';
import {
  NDPoint,
  NDVector,
  NDMatrix,
  NDRotation,
  NDProjection,
  NDCrossSection,
  analyticSection,
  NDHypercube,
  NDSphere,
  generateCloud,
  rotationPlaneCount,
  popcount32,
  dot,
  norm,
  distance,
  makeVector,
  angleBetween,
  mulberry32,
} from './index';

const close = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('NDPoint / NDVector algebra (generic in N)', () => {
  it('add / sub / scale', () => {
    const a = NDPoint.of(1, 2, 3, 4);
    const b = NDPoint.of(0.5, -1, 2, 0);
    const s = a.add(b);
    close(s.get(0), 1.5);
    close(s.get(1), 1);
    close(s.get(2), 5);
    close(s.get(3), 4);
    close(a.sub(b).get(1), 3);
    close(a.scale(2).get(3), 8);
  });

  it('dot, norm, distance, normalize', () => {
    const a = NDPoint.of(3, 4);
    const b = NDPoint.of(1, 2);
    close(a.dot(b), 11);
    close(a.norm(), 5);
    close(a.distanceTo(NDPoint.of(0, 0)), 5);
    const n = a.normalize();
    close(n.norm(), 1);
    close(n.get(0), 0.6);
    close(n.get(1), 0.8);
  });

  it('works identically in 2D and 32D', () => {
    for (const n of [2, 5, 17, 32]) {
      const v = new NDVector(n);
      for (let i = 0; i < n; i++) v.set(i, 1);
      close(v.norm(), Math.sqrt(n));
      close(v.dot(NDPoint.of(...new Array(n).fill(1))), n);
    }
  });

  it('angle between orthogonal vectors is π/2 in any dimension', () => {
    const e1 = NDPoint.of(1, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    const e3 = NDPoint.of(0, 0, 1, 0, 0, 0, 0, 0, 0, 0);
    close(angleBetween(e1.data, e3.data), Math.PI / 2);
  });
});

describe('NDRotation (plane rotations in R^N)', () => {
  it('applies the exact 2D rotation in the selected plane', () => {
    const r = new NDRotation(4, [{ a: 0, b: 3, angle: Math.PI / 4 }]);
    const p = makeVector(4);
    p[0] = 1;
    p[3] = 0;
    const out = makeVector(4);
    r.rotatePoint(p, out);
    close(out[0], Math.SQRT1_2);
    close(out[3], Math.SQRT1_2);
    close(out[1], 0);
    close(out[2], 0);
  });

  it('preserves norms (orthonormal) in 8D', () => {
    const rng = mulberry32(7);
    const planes = [
      { a: 0, b: 5, angle: 0.7 },
      { a: 2, b: 7, angle: -1.3 },
      { a: 1, b: 3, angle: 0.2 },
    ];
    const r = new NDRotation(8, planes);
    for (let t = 0; t < 50; t++) {
      const p = makeVector(8);
      for (let i = 0; i < 8; i++) p[i] = rng() * 2 - 1;
      const out = makeVector(8);
      r.rotatePoint(p, out);
      close(norm(out), norm(p), 1e-9);
    }
  });

  it('explicit Givens matrix matches the fast path and is orthonormal', () => {
    const M = NDMatrix.rotation(6, 1, 4, 0.9);
    close(M.orthogonalityError(), 0, 1e-12);
    const p = makeVector(6);
    for (let i = 0; i < 6; i++) p[i] = i + 1;
    const viaMatrix = makeVector(6);
    M.mulPoint(p, viaMatrix);
    const r = new NDRotation(6, [{ a: 1, b: 4, angle: 0.9 }]);
    const viaFast = makeVector(6);
    r.rotatePoint(p, viaFast);
    for (let i = 0; i < 6; i++) close(viaMatrix[i], viaFast[i], 1e-12);
  });

  it('rotation plane counts: 4D→6, 8D→28, 32D→496', () => {
    close(rotationPlaneCount(4), 6);
    close(rotationPlaneCount(8), 28);
    close(rotationPlaneCount(32), 496);
  });
});

describe('NDProjection (N → m)', () => {
  it('orthographic drops hidden coordinates', () => {
    const p = new NDProjection({ sourceDim: 8, targetDim: 3, method: 'orthographic' });
    const v = makeVector(8);
    for (let i = 0; i < 8; i++) v[i] = i + 1;
    const out = makeVector(3);
    expect(p.project(v, out)).toBe(true);
    close(out[0], 1);
    close(out[1], 2);
    close(out[2], 3);
  });

  it('perspective scales by d / (d − depth)', () => {
    const d = 4;
    const p = new NDProjection({ sourceDim: 4, targetDim: 3, method: 'perspective', distance: d });
    const v = makeVector(4);
    v[0] = 1;
    v[3] = 1; // depth = 1
    const out = makeVector(3);
    expect(p.project(v, out)).toBe(true);
    close(out[0], d / (d - 1));
    // point at the eye is clipped
    const v2 = makeVector(4);
    v2[3] = d;
    expect(p.project(v2, makeVector(3))).toBe(false);
  });

  it('stereographic from the pole: p / (1 − x_S)', () => {
    const p = new NDProjection({ sourceDim: 4, targetDim: 2, method: 'stereographic' });
    const v = makeVector(4);
    v[0] = 1;
    v[3] = 0.5;
    const out = makeVector(2);
    expect(p.project(v, out)).toBe(true);
    close(out[0], 2); // 1 / (1 − 0.5)
    // point at the north pole is clipped
    const v2 = makeVector(4);
    v2[3] = 1;
    expect(p.project(v2, makeVector(2))).toBe(false);
  });

  it('parallel (oblique) is affine and exact at zero hidden coords', () => {
    const p = new NDProjection({ sourceDim: 5, targetDim: 3, method: 'parallel' });
    const v = makeVector(5);
    v[0] = 2;
    v[1] = -1;
    v[2] = 0.5;
    const out = makeVector(3);
    p.project(v, out);
    close(out[0], 2);
    close(out[1], -1);
    close(out[2], 0.5);
    // hidden coords shift the result deterministically
    const v2 = v.slice();
    v2[3] = 1;
    const out2 = makeVector(3);
    p.project(v2, out2);
    expect(out2[0]).not.toBeCloseTo(out[0], 6);
  });

  it('perspective projection of a 4D cube corner matches the classic tesseract formula', () => {
    const d = 5;
    const p = new NDProjection({ sourceDim: 4, targetDim: 3, method: 'perspective', distance: d });
    const corner = makeVector(4);
    corner[0] = 1;
    corner[3] = 1;
    const out = makeVector(3);
    p.project(corner, out);
    // out = (1,0,0)·(5/(5−1))
    close(out[0], 1.25);
  });
});

describe('NDCrossSection', () => {
  it('clamps points onto the slice subspace', () => {
    const cs = new NDCrossSection(4, [0, 1, 2], [0, 0, 0, 0.7]);
    const p = NDPoint.of(3, 4, 5, 9);
    const out = makeVector(4);
    cs.apply(p, out);
    close(out[0], 3);
    close(out[3], 0.7);
  });

  it('analytic ball section: radius = √(R² − Σc²)', () => {
    close(analyticSection('ball', 5, 2, [{ index: 4, value: 1 }])!, Math.sqrt(3));
    expect(analyticSection('ball', 5, 2, [{ index: 4, value: 3 }])).toBeNull();
  });

  it('analytic cube section: non-empty iff all |c| ≤ 1', () => {
    close(analyticSection('cube', 4, 1, [{ index: 3, value: 0.5 }])!, 1);
    expect(analyticSection('cube', 4, 1, [{ index: 3, value: 1.2 }])).toBeNull();
  });
});

describe('NDHypercube', () => {
  it('exact vertex and edge counts', () => {
    for (const n of [2, 3, 4, 8, 14]) {
      const c = new NDHypercube(n);
      close(c.fullVertices, 2 ** n);
      close(c.fullEdges, n * 2 ** (n - 1));
      const g = c.build(1);
      expect(g.count).toBe(2 ** n);
      expect(g.edges.length / 2).toBe(n * 2 ** (n - 1));
      // every vertex has exactly N edges
      const deg = new Array(g.count).fill(0);
      for (let e = 0; e < g.edges.length; e += 2) {
        deg[g.edges[e]]++;
        deg[g.edges[e + 1]]++;
      }
      expect(deg.every((d) => d === n)).toBe(true);
    }
  });

  it('sampled 32D cube keeps real vertices and valid edges', () => {
    const c = new NDHypercube(32);
    close(c.fullVertices, 2 ** 32);
    close(c.fullEdges, 32 * 2 ** 31);
    close(c.rotationPlanes, 496);
    const g = c.build(99);
    expect(g.sampled).toBe(true);
    expect(g.count).toBeLessThan(2 ** 32);
    // all coordinates are ±1
    for (let i = 0; i < g.points.length; i++) {
      expect(g.points[i]).toBeCloseTo(g.points[i] > 0 ? 1 : -1, 12);
    }
    // edges connect vertices differing in exactly one bit
    for (let e = 0; e < Math.min(200, g.edges.length); e += 2) {
      expect(popcount32(g.bits[g.edges[e]] ^ g.bits[g.edges[e + 1]])).toBe(1);
    }
  });

  it('is deterministic per seed', () => {
    const a = new NDHypercube(16).build(5);
    const b = new NDHypercube(16).build(5);
    expect(a.points.every((v, i) => v === b.points[i])).toBe(true);
  });
});

describe('NDSphere', () => {
  it('surface points lie exactly on the sphere (any N)', () => {
    for (const n of [3, 10, 32]) {
      const s = new NDSphere(n, 1.6);
      const g = s.surface(200, 3);
      for (let i = 0; i < g.points.length / n; i++) {
        const p = makeVector(n);
        p.set(g.points.subarray(i * n, i * n + n));
        close(norm(p), 1.6, 1e-9);
      }
    }
  });

  it('ball points are inside the radius and volume formula is sane', () => {
    const s = new NDSphere(4, 1);
    const g = s.ball(300, 4);
    for (let i = 0; i < g.points.length / 4; i++) {
      const p = makeVector(4);
      p.set(g.points.subarray(i * 4, i * 4 + 4));
      expect(norm(p)).toBeLessThanOrEqual(1 + 1e-12);
    }
    // 4-ball volume = π²/2
    close(NDSphere.volume(4, 1), Math.PI ** 2 / 2, 1e-9);
    // 3-sphere "area" (volume of S^3) = 2π²
    close(NDSphere.surfaceArea(4), 2 * Math.PI ** 2, 1e-9);
  });
});

describe('clouds', () => {
  it('deterministic per seed and respects distributions', () => {
    const cfg = {
      dim: 8,
      count: 400,
      distribution: 'sphere' as const,
      radius: 2,
      seed: 42,
      clusters: 3,
    };
    const a = generateCloud(cfg);
    const b = generateCloud(cfg);
    expect(a.points.every((v, i) => v === b.points[i])).toBe(true);
    for (let i = 0; i < a.count; i++) {
      const p = makeVector(8);
      p.set(a.points.subarray(i * 8, i * 8 + 8));
      close(norm(p), 2, 1e-9);
    }
    const cl = generateCloud({ ...cfg, distribution: 'clustered' });
    expect(new Set(Array.from(cl.cluster)).size).toBe(3);
  });

  it('dot/norm of cloud points are consistent', () => {
    const g = generateCloud({ dim: 10, count: 50, distribution: 'gaussian', radius: 1, seed: 1, clusters: 2 });
    const p0 = makeVector(10);
    p0.set(g.points.subarray(0, 10));
    close(dot(p0, p0), norm(p0) ** 2, 1e-12);
  });
});

describe('integration: rotate then project a 32D cube corner', () => {
  it('rotates in plane (5, 31) and projects 32→8→3', () => {
    const n = 32;
    const cube = new NDHypercube(n);
    const g = cube.build(11);
    const p0 = makeVector(n);
    p0.set(g.points.subarray(0, n));
    const rot = new NDRotation(n, [{ a: 5, b: 31, angle: 0.4 }]);
    const rp = makeVector(n);
    rot.rotatePoint(p0, rp);
    // rotation preserves the corner norm √32
    expect(norm(rp)).toBeCloseTo(Math.sqrt(32), 9);

    const s1 = new NDProjection({ sourceDim: n, targetDim: 8, method: 'perspective', distance: 6 });
    const s2 = new NDProjection({ sourceDim: 8, targetDim: 3, method: 'perspective', distance: 5 });
    const mid = makeVector(8);
    const out = makeVector(3);
    expect(s1.project(rp, mid)).toBe(true);
    expect(s2.project(mid, out)).toBe(true);
    expect(Number.isFinite(out[0]) && Number.isFinite(out[1]) && Number.isFinite(out[2])).toBe(true);
    void distance;
  });
});
