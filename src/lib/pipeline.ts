/**
 * The visualization pipeline:
 *
 *   N-D object ──rotations──▶ N-D ──stage 1──▶ K-D ──stage 2──▶ 3D ──camera──▶ 2D screen
 *
 * Stage 1 collapses N dimensions to an intermediate K (K < N), e.g.
 * 32D → 8D. Stage 2 collapses K to the 3 displayed axes (e.g. X, Y, Z),
 * e.g. 8D → 3D. Each stage is a real NDProjection (perspective,
 * orthographic, stereographic or oblique/parallel). The final 3D → 2D step
 * is the ordinary WebGL camera. All N ≥ 2 use this exact same chain, so
 * 2D and 32D share one engine — only the parameters differ.
 */

import {
  NDProjection,
  NDRotation,
  makeVector,
  defaultAxisNames,
  type ProjectionMethod,
  type PlaneRotation,
} from './nd';

export interface PipelineConfig {
  dim: number;
  /** Intermediate dimension K for stage 1 (3 ≤ K ≤ dim) */
  stageDim: number;
  stage1: ProjectionMethod;
  stage2: ProjectionMethod;
  /** Perspective focal distance for both stages (shared for simplicity) */
  perspectiveDistance: number;
  /** Which K-dim coordinates become the visible 3D axes (distinct, < stageDim) */
  activeDims: [number, number, number];
  seed: number;
  /** Active rotation planes (full N-dim space) */
  rotations: PlaneRotation[];
}

export interface Pipeline {
  dim: number;
  stageDim: number;
  rotation: NDRotation;
  /** N → K (null when K === N) */
  stage1: NDProjection | null;
  /** K → 3 */
  stage2: NDProjection;
  visibleNames: string[];
  stage1Name: string;
  stage2Name: string;
  /** Rotate (full N) then project to 3D. Returns visible count. */
  projectBuffer(
    points: Float64Array,
    out: Float32Array | Float64Array,
    visible: Uint8Array,
  ): number;
  /** Apply only the N-dim rotations (for color/encoding of hidden coords) */
  rotateBuffer(points: Float64Array, out: Float64Array): void;
  /** Rotate then project a single N-dim point */
  projectOne(p: Float64Array, out: Float64Array): boolean;
  /** Description lines for the UI pipeline diagram */
  describe(): string[];
}

export function buildPipeline(cfg: PipelineConfig): Pipeline {
  const n = cfg.dim;
  const K = Math.min(cfg.stageDim, n);
  const rotation = new NDRotation(n, cfg.rotations);
  const names = defaultAxisNames(n);
  const kNames = defaultAxisNames(K);

  const stage1 =
    K < n
      ? new NDProjection({
          sourceDim: n,
          targetDim: K,
          method: cfg.stage1,
          distance: cfg.perspectiveDistance,
          seed: cfg.seed,
        })
      : null;

  // Stage 2: pick the 3 visible axes among the K dimensions.
  const active = [
    cfg.activeDims[0] % K,
    cfg.activeDims[1] % K,
    cfg.activeDims[2] % K,
  ];
  const stage2 = new NDProjection({
    sourceDim: K,
    targetDim: 3,
    method: cfg.stage2,
    distance: cfg.perspectiveDistance,
    activeDims: active,
    seed: cfg.seed + 7,
  });

  const scratch = makeVector(n);
  const mid = makeVector(K);

  const projectOne = (p: Float64Array, out: Float64Array): boolean => {
    rotation.rotatePoint(p, scratch);
    if (stage1) {
      if (!stage1.project(scratch, mid)) return false;
      return stage2.project(mid, out);
    }
    return stage2.project(scratch, out);
  };

  const projectBuffer = (
    points: Float64Array,
    out: Float32Array | Float64Array,
    visible: Uint8Array,
  ): number => {
    const count = points.length / n;
    const vis1 = visible; // reuse caller buffer (length ≥ count)
    // Rotate everything first, then run the two projection stages.
    const rotatedBuf = makeVector(count * n);
    rotation.rotateBuffer(points, rotatedBuf);
    let working: Float64Array = rotatedBuf;
    if (stage1) {
      const midBuf = makeVector(count * K);
      stage1.projectBuffer(rotatedBuf, midBuf, vis1);
      working = midBuf;
    } else {
      // no stage 1: everything passes through to stage 2
      vis1.fill(1, 0, count);
    }
    // Stage 2 with its own visibility: a point is visible only if both stages keep it.
    const vis2 = new Uint8Array(count);
    stage2.projectBuffer(working, out, vis2);
    let shown = 0;
    for (let i = 0; i < count; i++) {
      const ok = vis1[i] === 1 && vis2[i] === 1;
      visible[i] = ok ? 1 : 0;
      if (ok) shown++;
    }
    return shown;
  };

  return {
    dim: n,
    stageDim: K,
    rotation,
    stage1,
    stage2,
    rotateBuffer: (points, out) => rotation.rotateBuffer(points, out),
    visibleNames: [names[active[0]], names[active[1]], names[active[2]]],
    stage1Name: stage1 ? stage1.describe(kNames) : `${n}D (no reduction)`,
    stage2Name: stage2.describe(kNames),
    projectBuffer,
    projectOne,
    describe: () => {
      const lines: string[] = [];
      if (cfg.rotations.length > 0) lines.push('rotate in R^' + n);
      lines.push(stage1 ? stage1.describe(names) : `${n}D identity`);
      lines.push(stage2.describe(kNames));
      lines.push('3D → 2D perspective camera');
      return lines;
    },
  };
}

/** Project a single N-dim point into 3D with a minimal one-shot pipeline. */
export function quickProject3D(
  p: Float64Array,
  dim: number,
  method: ProjectionMethod,
  distance: number,
  active: [number, number, number],
): Float64Array | null {
  const proj = new NDProjection({
    sourceDim: dim,
    targetDim: 3,
    method,
    distance,
    activeDims: active,
    seed: 3,
  });
  const out = makeVector(3);
  return proj.project(p, out) ? out : null;
}
