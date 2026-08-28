/**
 * Application state (Zustand).
 * Holds only *intent* state (what to show); heavy derived geometry lives in
 * `geometry` (produced by the worker) and per-frame projection results live
 * in refs inside the views — React never re-renders per frame.
 */

import { create } from 'zustand';
import { MIN_DIM, MAX_DIM } from '../lib/nd';
import type { ObjectKind } from '../lib/geometry';
import type { ProjectionMethod, CloudDistribution } from '../lib/nd';
import type { WorkerGeometry } from '../lib/workerClient';
import { explainSeeing } from '../lib/explain';
import { userNorm } from '../lib/geometry';

export type ViewTab = '3d' | '2d' | 'parallel' | 'slice' | 'matrix' | 'you';
export type CameraMode = 'orbit' | 'first' | 'fly';
export type ColorModeOpt = 'uniform' | 'coordinate' | 'norm' | 'cluster';

export interface RotationEntry {
  id: string;
  a: number;
  b: number;
  /** radians */
  angle: number;
  /** rad/s when animating */
  speed: number;
  animating: boolean;
}

export interface DrawnItem {
  id: string;
  tool: 'point' | 'vector' | 'circle' | 'polygon';
  /** 2D coords in world units */
  pts: number[];
}

interface MorphState {
  open: boolean;
  playing: boolean;
  maxDim: number;
  /** overall progress 0..1 across all stages */
  t: number;
}

interface AppState {
  dim: number;
  /** 32 slots; first `dim` are live */
  user: number[];

  objectKind: ObjectKind;
  seed: number;
  cloudCount: number;
  cloudDist: CloudDistribution;
  cloudRadius: number;
  cloudClusters: number;
  imported: { name: string; dim: number; points: number[] } | null;
  importInfo: string | null;

  geometry: WorkerGeometry | null;
  geometryBusy: boolean;

  stageDim: number;
  stage1: ProjectionMethod;
  stage2: ProjectionMethod;
  perspectiveDistance: number;
  activeDims: [number, number, number];

  rotations: RotationEntry[];

  /** 2D slice view active axes */
  sliceActive: [number, number];
  /** Show the analytic/numeric cross-section in the 3D view */
  showSection: boolean;
  /** Fixed coordinate values (32 slots) for inactive axes */
  sliceValues: number[];
  /** Animate the slice value of `sliceAxis` back and forth */
  sliceAxis: number;
  animateSlice: boolean;

  view: ViewTab;
  cameraMode: CameraMode;
  followYou: boolean;
  autoRotate: boolean;
  showGrid: boolean;
  showAxes: boolean;

  colorMode: ColorModeOpt;
  colorCoord: number;
  pointSize: number;
  lineOpacity: number;

  enterDimension: boolean;
  morph: MorphState;
  explanation: string | null;
  drawn: DrawnItem[];

  // ---- actions ----
  setDim(n: number): void;
  setUserCoord(i: number, v: number): void;
  randomizeUser(): void;
  zeroUser(): void;
  setObjectKind(k: ObjectKind): void;
  setSeed(s: number): void;
  setCloud(p: Partial<{ count: number; dist: CloudDistribution; radius: number; clusters: number }>): void;
  setImported(name: string, dim: number, points: number[], info: string): void;
  clearImported(): void;
  setGeometry(g: WorkerGeometry | null, busy?: boolean): void;
  setStageDim(n: number): void;
  setStage1(m: ProjectionMethod): void;
  setStage2(m: ProjectionMethod): void;
  setPerspectiveDistance(d: number): void;
  setActiveDims(d: [number, number, number]): void;
  addRotation(a: number, b: number): void;
  removeRotation(id: string): void;
  setRotationAngle(id: string, angle: number): void;
  setRotationSpeed(id: string, speed: number): void;
  toggleRotationAnim(id: string): void;
  setSliceActive(p: [number, number]): void;
  setShowSection(on: boolean): void;
  setSliceValue(i: number, v: number): void;
  setSliceAxis(i: number): void;
  setAnimateSlice(on: boolean): void;
  setView(v: ViewTab): void;
  setCameraMode(m: CameraMode): void;
  toggle(p: 'followYou' | 'autoRotate' | 'showGrid' | 'showAxes'): void;
  setColor(p: Partial<{ mode: ColorModeOpt; coord: number; size: number; opacity: number }>): void;
  setEnterDimension(on: boolean): void;
  setMorph(p: Partial<MorphState>): void;
  setExplanation(s: string | null): void;
  explain(): void;
  addDrawn(item: DrawnItem): void;
  clearDrawn(): void;
  applyPreset(id: string): void;
  applyExperiment(id: number): void;
}

const SLOT_COUNT = 32;

function freshUser(): number[] {
  return new Array(SLOT_COUNT).fill(0);
}

let idCounter = 1;
const nextId = () => `id-${idCounter++}`;

const initialUser = freshUser();
initialUser[0] = 0.8;
initialUser[1] = 0.5;

export const useAppStore = create<AppState>((set, get) => ({
  dim: 4,
  user: initialUser,

  objectKind: 'hypercube',
  seed: 42,
  cloudCount: 2000,
  cloudDist: 'uniform',
  cloudRadius: 2,
  cloudClusters: 4,
  imported: null,
  importInfo: null,

  geometry: null,
  geometryBusy: false,

  stageDim: 8,
  stage1: 'perspective',
  stage2: 'perspective',
  perspectiveDistance: 5,
  activeDims: [0, 1, 2],

  rotations: [{ id: nextId(), a: 0, b: 3, angle: 0, speed: 0.5, animating: true }],

  sliceActive: [0, 1],
  showSection: false,
  sliceValues: freshUser(),
  sliceAxis: 3,
  animateSlice: false,

  view: '3d',
  cameraMode: 'orbit',
  followYou: false,
  autoRotate: false,
  showGrid: true,
  showAxes: true,

  colorMode: 'uniform',
  colorCoord: 3,
  pointSize: 2.2,
  lineOpacity: 0.5,

  enterDimension: false,
  morph: { open: false, playing: true, maxDim: 10, t: 0 },
  explanation: null,
  drawn: [],

  setDim: (n) => {
    const dim = Math.min(MAX_DIM, Math.max(MIN_DIM, Math.round(n)));
    set({ dim, stageDim: Math.min(dim, 8) });
  },

  setUserCoord: (i, v) => {
    const user = get().user.slice();
    user[i] = v;
    set({ user });
  },

  randomizeUser: () => {
    const { dim } = get();
    const user = get().user.slice();
    for (let i = 0; i < dim; i++) user[i] = Math.round((Math.random() * 4 - 2) * 100) / 100;
    set({ user });
  },

  zeroUser: () => set({ user: freshUser() }),

  setObjectKind: (k) => set({ objectKind: k }),
  setSeed: (s) => set({ seed: s }),

  setCloud: (p) =>
    set({
      cloudCount: p.count ?? get().cloudCount,
      cloudDist: p.dist ?? get().cloudDist,
      cloudRadius: p.radius ?? get().cloudRadius,
      cloudClusters: p.clusters ?? get().cloudClusters,
    }),

  setImported: (name, dim, points, info) =>
    // The dataset *is* N-dimensional — switch the app to its actual
    // dimension (clamped) so no coordinates get silently dropped.
    set({
      imported: { name, dim, points },
      importInfo: info,
      objectKind: 'imported',
      dim: Math.min(MAX_DIM, Math.max(MIN_DIM, dim)),
      stageDim: Math.min(Math.min(MAX_DIM, Math.max(MIN_DIM, dim)), 8),
    }),
  clearImported: () => set({ imported: null, importInfo: null }),

  setGeometry: (g, busy = false) => set({ geometry: g, geometryBusy: busy }),

  setStageDim: (n) => set({ stageDim: Math.min(n, get().dim) }),
  setStage1: (m) => set({ stage1: m }),
  setStage2: (m) => set({ stage2: m }),
  setPerspectiveDistance: (d) => set({ perspectiveDistance: d }),
  setActiveDims: (d) => set({ activeDims: d }),

  addRotation: (a, b) => {
    const { rotations, dim } = get();
    if (a === b || a >= dim || b >= dim) return;
    if (rotations.some((r) => r.a === a && r.b === b)) return;
    set({ rotations: [...rotations, { id: nextId(), a, b, angle: 0, speed: 0.5, animating: false }] });
  },
  removeRotation: (id) => set({ rotations: get().rotations.filter((r) => r.id !== id) }),
  setRotationAngle: (id, angle) =>
    set({ rotations: get().rotations.map((r) => (r.id === id ? { ...r, angle } : r)) }),
  setRotationSpeed: (id, speed) =>
    set({ rotations: get().rotations.map((r) => (r.id === id ? { ...r, speed } : r)) }),
  toggleRotationAnim: (id) =>
    set({ rotations: get().rotations.map((r) => (r.id === id ? { ...r, animating: !r.animating } : r)) }),

  setSliceActive: (p) => set({ sliceActive: p }),
  setShowSection: (on) => set({ showSection: on }),
  setSliceValue: (i, v) => {
    const sv = get().sliceValues.slice();
    sv[i] = v;
    set({ sliceValues: sv });
  },
  setSliceAxis: (i) => set({ sliceAxis: i }),
  setAnimateSlice: (on) => set({ animateSlice: on }),

  setView: (v) => set({ view: v }),
  setCameraMode: (m) => set({ cameraMode: m }),
  toggle: (p) => set({ [p]: !get()[p] } as Partial<AppState>),

  setColor: (p) =>
    set({
      colorMode: p.mode ?? get().colorMode,
      colorCoord: p.coord ?? get().colorCoord,
      pointSize: p.size ?? get().pointSize,
      lineOpacity: p.opacity ?? get().lineOpacity,
    }),

  setEnterDimension: (on) => set({ enterDimension: on }),
  setMorph: (p) => set({ morph: { ...get().morph, ...p } }),
  setExplanation: (s) => set({ explanation: s }),

  explain: () => {
    const s = get();
    s.setExplanation(
      explainSeeing({
        dim: s.dim,
        kind: s.objectKind,
        stageDim: s.stageDim,
        stage1: s.stage1,
        stage2: s.stage2,
        activeDims: s.activeDims,
        sampled: s.geometry?.sampled ?? false,
        view: s.view,
        userNorm: userNorm(s.user, s.dim),
      }),
    );
  },

  addDrawn: (item) => set({ drawn: [...get().drawn, item] }),
  clearDrawn: () => set({ drawn: [] }),

  applyPreset: (id) => {
    const s = get();
    const base = {
      rotations: s.rotations,
    };
    switch (id) {
      case 'point':
        set({ dim: 3, objectKind: 'point', stageDim: 3, ...base });
        break;
      case 'vector':
        set({ dim: 3, objectKind: 'vector', stageDim: 3, ...base });
        break;
      case 'plane':
        set({ dim: 3, objectKind: 'plane', stageDim: 3, ...base });
        break;
      case 'cube':
        set({ dim: 3, objectKind: 'hypercube', stageDim: 3, ...base });
        break;
      case 'tesseract':
        set({
          dim: 4, objectKind: 'hypercube', stageDim: 4,
          rotations: [{ id: nextId(), a: 0, b: 3, angle: 0, speed: 0.5, animating: true }],
        });
        break;
      case 'cube5': case 'cube6': case 'cube8': case 'cube10': case 'cube16': case 'cube32': {
        const n = Number(id.slice(4));
        set({
          dim: n, objectKind: 'hypercube', stageDim: Math.min(n, 8),
          rotations: [{ id: nextId(), a: 0, b: 1, angle: 0, speed: 0.4, animating: true }],
        });
        break;
      }
      case 'nsphere':
        set({ objectKind: 'sphere', ...base });
        break;
      case 'nball':
        set({ objectKind: 'ball', ...base });
        break;
      case 'ngrid':
        set({ objectKind: 'grid', ...base });
        break;
      case 'ncloud':
        set({ objectKind: 'cloud', cloudDist: 'gaussian', ...base });
        break;
    }
  },

  applyExperiment: (id) => {
    const s = get();
    switch (id) {
      case 1: // Rotate a tesseract through XW
        set({
          dim: 4, objectKind: 'hypercube', stageDim: 4, view: '3d',
          rotations: [{ id: nextId(), a: 0, b: 3, angle: 0, speed: 0.7, animating: true }],
          enterDimension: false,
        });
        break;
      case 2: // Move through the 4th dimension
        set({
          dim: 4, objectKind: 'hypercube', stageDim: 4, view: '3d',
          rotations: [], animateSlice: true, sliceAxis: 3,
        });
        break;
      case 3: // Slice a 5D sphere
        set({
          dim: 5, objectKind: 'ball', stageDim: 5, view: 'slice',
          sliceActive: [0, 1], sliceAxis: 4, animateSlice: true,
        });
        break;
      case 4: // Compare 3D and 4D cubes
        set({
          dim: 4, objectKind: 'hypercube', stageDim: 4, view: '3d',
          rotations: [],
        });
        break;
      case 5: // Explore a 10D point cloud
        set({
          dim: 10, objectKind: 'cloud', stageDim: 8, view: '3d',
          cloudDist: 'clustered', cloudClusters: 5, cloudCount: 4000,
          colorMode: 'cluster',
        });
        break;
      case 6: // Explore your 32-dimensional coordinate vector
        set({
          dim: 32, objectKind: 'grid', stageDim: 8, view: 'parallel',
          enterDimension: true,
        });
        break;
    }
    void s;
  },
}));

/** Convenience: rotation planes as {a,b,angle} for the pipeline */
export function planeList(s: Pick<AppState, 'rotations'>) {
  return s.rotations.map((r) => ({ a: r.a, b: r.b, angle: r.angle }));
}
