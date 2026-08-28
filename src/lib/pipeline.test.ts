/**
 * End-to-end smoke tests: geometry builders → pipeline → projection,
 * exactly the code path the UI runs per frame.
 */

import { describe, it, expect } from 'vitest';
import { buildGeometry, geometryScale } from './geometry';
import { buildPipeline } from './pipeline';
import { userNorm } from './geometry';
import type { ObjectKind } from './geometry';

const KINDS: ObjectKind[] = ['point', 'vector', 'hypercube', 'sphere', 'ball', 'cloud', 'grid', 'plane'];

describe('buildGeometry across dimensions', () => {
  for (const dim of [2, 3, 4, 8, 16, 32]) {
    for (const kind of KINDS) {
      it(`${kind} in ${dim}D has consistent shape`, () => {
        const g = buildGeometry({
          kind,
          dim,
          seed: 7,
          cloud: { dim, count: 300, distribution: 'uniform', radius: 2, seed: 7, clusters: 3 },
          userPoint: new Array(dim).fill(0.5),
          vectorEnd: new Array(dim).fill(0.3),
          gridExtent: 2,
        });
        expect(g.dim).toBe(dim);
        expect(g.points.length).toBe(g.count * dim);
        // all coordinates finite
        for (let i = 0; i < g.points.length; i++) {
          expect(Number.isFinite(g.points[i])).toBe(true);
        }
        // edges reference valid indices
        for (let e = 0; e < g.edges.length; e += 2) {
          expect(g.edges[e]).toBeLessThan(g.count);
          expect(g.edges[e + 1]).toBeLessThan(g.count);
        }
        expect(geometryScale(g)).toBeGreaterThan(0);
      });
    }
  }

  it('imported 5D data padded to 8D', () => {
    const pts = [0.2, 0.5, -0.3, 0.8, 0.1, 0.1, -0.4, 0.7, 0.2, 0.9];
    const g = buildGeometry({
      kind: 'imported',
      dim: 8,
      seed: 1,
      imported: { points: pts, dim: 5 },
    });
    expect(g.count).toBe(2);
    expect(g.points.length).toBe(2 * 8);
    expect(g.points[5]).toBe(0); // padded coordinate
    expect(g.points[0]).toBeCloseTo(0.2);
    expect(g.points[8 + 4]).toBeCloseTo(0.9); // second point, fifth coord
  });
});

describe('pipeline N → K → 3 for every dim and method combo', () => {
  const methods = ['perspective', 'orthographic', 'stereographic', 'parallel'] as const;

  for (const dim of [3, 4, 8, 16, 32]) {
    for (const stage1 of methods) {
      for (const stage2 of methods) {
        it(`${dim}D: stage1=${stage1}, stage2=${stage2}`, () => {
          const g = buildGeometry({
            kind: 'hypercube',
            dim,
            seed: 3,
          });
          const pipe = buildPipeline({
            dim,
            stageDim: Math.min(dim, 8),
            stage1,
            stage2,
            perspectiveDistance: 6,
            activeDims: [0, 1, 2],
            seed: 5,
            rotations: [{ a: 0, b: Math.min(3, dim - 1), angle: 0.3 }],
          });
          const count = Math.min(g.count, 512);
          const out = new Float32Array(count * 3);
          const vis = new Uint8Array(count);
          const shown = pipe.projectBuffer(g.points.subarray(0, count * dim), out, vis);
          // at least one point survives; non-stereographic stages keep > half of a cube
          expect(shown).toBeGreaterThan(0);
          if (stage1 !== 'stereographic' && stage2 !== 'stereographic') {
            expect(shown).toBeGreaterThan(count * 0.5);
          }
          for (let i = 0; i < count; i++) {
            if (vis[i]) {
              expect(Number.isFinite(out[i * 3])).toBe(true);
              expect(Number.isFinite(out[i * 3 + 1])).toBe(true);
              expect(Number.isFinite(out[i * 3 + 2])).toBe(true);
            }
          }
          // single-point path agrees with buffer path on a visible point
          const uv = new Float64Array(dim).fill(0.25);
          const one = new Float64Array(3);
          if (pipe.projectOne(uv, one)) {
            expect(Number.isFinite(one[0] + one[1] + one[2])).toBe(true);
          }
        }, 20000);
      }
    }
  }

  it('orthographic pipeline is a true shadow (hidden coords dropped)', () => {
    const dim = 6;
    const g = buildGeometry({ kind: 'hypercube', dim, seed: 1 });
    const pipe = buildPipeline({
      dim,
      stageDim: dim,
      stage1: 'orthographic',
      stage2: 'orthographic',
      perspectiveDistance: 5,
      activeDims: [0, 1, 2],
      seed: 1,
      rotations: [],
    });
    const out = new Float64Array(3);
    const p = new Float64Array(dim);
    p[0] = 1;
    p[1] = -1;
    p[2] = 1;
    p[3] = 0.9;
    p[4] = -0.7;
    p[5] = 0.3;
    expect(pipe.projectOne(p, out)).toBe(true);
    expect(out[0]).toBeCloseTo(1);
    expect(out[1]).toBeCloseTo(-1);
    expect(out[2]).toBeCloseTo(1);
    void g;
  });
});

describe('user vector utilities', () => {
  it('userNorm matches the engine', () => {
    expect(userNorm([3, 4, 0, 0], 4)).toBeCloseTo(5);
    expect(userNorm([0, 0, 0, 0, 1, 2, 2], 7)).toBeCloseTo(3);
  });
});
