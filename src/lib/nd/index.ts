/**
 * N-dimensional mathematics engine — public API.
 * Pure TypeScript, no UI or rendering dependencies.
 */

export {
  MIN_DIM,
  MAX_DIM,
  makeVector,
  fromArray,
  copy,
  add,
  sub,
  scale,
  dot,
  normSq,
  norm,
  normalize,
  distance,
  angleBetween,
  lerp,
  clamp,
  boundingRadius,
} from './vector';
export { mulberry32, gaussian, type RNG } from './rng';
export { NDPoint, NDVector } from './point';
export { NDRotation } from './rotation';
export {
  rotationPlaneCount,
  planeLabel,
  defaultAxisNames,
  subscript,
  rotatePlane,
  type PlaneRotation,
} from './rotation';
export { NDMatrix } from './matrix';
export {
  NDProjection,
  PROJECTION_METHODS,
  PERSPECTIVE_EPS,
  type ProjectionMethod,
  type NDProjectionConfig,
} from './projection';
export {
  NDCrossSection,
  analyticSection,
  type SectionKind,
} from './crossSection';
export { NDTransform, type NDTransformSpec } from './transform';
export {
  NDHypercube,
  popcount32,
  FULL_ENUMERATION_MAX,
  SAMPLED_VERTEX_COUNT,
  type NDHypercubeGeometry,
} from './hypercube';
export { NDSphere, type NDSphereGeometry } from './sphere';
export {
  generateCloud,
  CLOUD_DISTRIBUTIONS,
  type CloudConfig,
  type CloudDistribution,
  type CloudGeometry,
} from './cloud';
