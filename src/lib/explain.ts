/**
 * Educational text: per-dimension explanations and a live "Explain what I'm
 * seeing" generator that describes the exact current visualization state.
 * All claims are mathematically accurate — projections are labeled as
 * representations, never as the object itself.
 */

import { axisName } from './format';
import type { ObjectKind } from './geometry';
import type { ProjectionMethod } from './nd';

export function dimensionExplanation(n: number): string {
  switch (n) {
    case 2:
      return 'Two independent coordinates are required to specify a point. The view shows the full mathematical object — nothing is projected away.';
    case 3:
      return 'Three independent coordinates are required. The WebGL view renders the 3D object directly; the camera then projects it to your 2D screen (that step is a genuine projection).';
    case 4:
      return 'A fourth independent coordinate W is added. Humans cannot see 4D directly, so you are viewing a projection: the W coordinate is either folded into the image (perspective), dropped (orthographic shadow), or the object is sliced at a chosen W value.';
    default:
      if (n <= 8) {
        return `Each point requires ${n} independent coordinates. The screen holds only 3 visible axes, so ${n - 3} coordinates are encoded via the projection pipeline, color, and the parallel-coordinates view — not shown as literal spatial axes.`;
      }
      if (n <= 16) {
        return `Every point is an ${n}-tuple of real numbers. What you see is a ${'projection/encoding'} of the mathematical space: a small 3D subspace plus color-coded hidden coordinates. The parallel-coordinates panel shows all ${n} coordinates honestly.`;
      }
      return `Each point contains ${n} independent coordinates. The display is a projection and encoding, not a literal ${n}-dimensional image: ${n - 3} coordinates live in the math engine and reach the screen only through projection, slicing, color, or parallel coordinates.`;
  }
}

export const OBJECT_DESCRIPTION: Record<ObjectKind, string> = {
  point: 'a single point',
  vector: 'a vector from the origin',
  hypercube: 'a hypercube (the N-cube)',
  sphere: 'an (N−1)-sphere surface',
  ball: 'a solid N-ball',
  cloud: 'a point cloud',
  grid: 'a coordinate grid',
  plane: 'a 2D plane (square) inside R^N',
  imported: 'your imported dataset',
};

const METHOD_TEXT: Record<ProjectionMethod, string> = {
  perspective:
    'perspective projection — hidden coordinates act as depth, so geometry closer to the "eye" appears larger, exactly as in 3D perspective',
  orthographic:
    'orthographic projection — hidden coordinates are dropped, producing the flat "shadow" of the object on the visible subspace',
  stereographic:
    'stereographic projection — the object is projected from a pole; it preserves angles and is classic for spheres',
  parallel:
    'oblique (parallel) projection — each hidden coordinate is folded into the visible axes along a fixed direction, like an axonometric technical drawing',
};

export interface ExplainContext {
  dim: number;
  kind: ObjectKind;
  stageDim: number;
  stage1: ProjectionMethod;
  stage2: ProjectionMethod;
  activeDims: [number, number, number];
  sampled: boolean;
  view: string;
  userNorm: number;
}

export function explainSeeing(ctx: ExplainContext): string {
  const parts: string[] = [];
  const { dim, kind } = ctx;

  if (dim === 2) {
    parts.push(
      `You are viewing ${OBJECT_DESCRIPTION[kind]} in full 2D — every coordinate is visible and nothing is hidden.`,
    );
  } else if (dim === 3) {
    parts.push(
      `You are viewing ${OBJECT_DESCRIPTION[kind]} in 3D. The only projection is the standard camera step from 3D to your 2D screen.`,
    );
  } else {
    const chain =
      ctx.stageDim < dim
        ? `${dim}D → ${ctx.stageDim}D → 3D → 2D`
        : `${dim}D → 3D → 2D`;
    parts.push(
      `You are viewing a representation of ${OBJECT_DESCRIPTION[kind]} in ${dim} dimensions. The screen cannot hold ${dim} spatial axes, so the pipeline ${chain} encodes the extra ${dim - 3} coordinates.`,
    );
    if (ctx.stageDim < dim) {
      parts.push(
        `Stage 1 uses ${METHOD_TEXT[ctx.stage1]} to collapse ${dim}D to ${ctx.stageDim}D.`,
      );
    }
    parts.push(
      `The 3 visible axes are ${ctx.activeDims.map(axisName).join(', ')}; stage 2 uses ${METHOD_TEXT[ctx.stage2]}.`,
    );
    parts.push(
      `The fourth-and-beyond coordinates are not fake: they are stored, rotated, and sliced in the engine, and they affect what you see — for example, changing ${axisName(ctx.activeDims[2] + 1)} moves the point through a real hidden dimension and changes its projected position.`,
    );
  }

  if (ctx.sampled) {
    parts.push(
      'This object is SAMPLED: a browser cannot store 2^' + dim + ' vertices, so a deterministic subset is shown. The counts in the info panel are exact; the geometry is a genuine subset of the true object.',
    );
  }

  parts.push(
    `YOU is at ${dim} coordinates with distance ‖YOU‖ = ${ctx.userNorm.toFixed(2)} from the origin — the gold marker is its projection, and the coordinate panel shows the exact tuple.`,
  );

  return parts.join(' ');
}
