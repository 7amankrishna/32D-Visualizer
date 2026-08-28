/**
 * Client for the N-dimensional geometry worker. Falls back to main-thread
 * generation for small objects so the app stays snappy without round-trips.
 */

import { buildGeometry, type Geometry, type GeometryRequest } from './geometry';

export interface WorkerGeometry {
  dim: number;
  kind: Geometry['kind'];
  count: number;
  sampled: boolean;
  totalVertices: number;
  totalEdges: number;
  radius: number | undefined;
  points: Float64Array;
  edges: Uint32Array;
  cluster: Uint8Array | undefined;
}

const SMALL_OBJECT_LIMIT = 4096; // points — below this, stay on the main thread

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (g: WorkerGeometry | { error: string }) => void>();

function ensureWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../worker/ndWorker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent) => {
      const data = e.data as {
        id: number;
        ok: boolean;
        error?: string;
        dim?: number;
        kind?: Geometry['kind'];
        count?: number;
        sampled?: boolean;
        totalVertices?: number;
        totalEdges?: number;
        radius?: number;
        points?: ArrayBuffer;
        edges?: ArrayBuffer;
        cluster?: ArrayBuffer | null;
      };
      const resolve = pending.get(data.id);
      if (!resolve) return;
      pending.delete(data.id);
      if (!data.ok) {
        resolve({ error: data.error ?? 'worker error' });
        return;
      }
      resolve({
        dim: data.dim!,
        kind: data.kind!,
        count: data.count!,
        sampled: data.sampled!,
        totalVertices: data.totalVertices!,
        totalEdges: data.totalEdges!,
        radius: data.radius,
        points: new Float64Array(data.points!),
        edges: new Uint32Array(data.edges!),
        cluster: data.cluster ? new Uint8Array(data.cluster) : undefined,
      });
    };
  }
  return worker;
}

/** Estimated point count for a request (cheap heuristic). */
function estimatePoints(req: GeometryRequest): number {
  switch (req.kind) {
    case 'hypercube':
      return req.dim <= 14 ? Math.pow(2, req.dim) : 4096;
    case 'cloud':
      return req.cloud?.count ?? 1500;
    case 'grid':
      return Math.pow(2 * (req.gridExtent ?? 3) + 1, 3);
    case 'imported':
      return Math.floor((req.imported?.points.length ?? 0) / Math.max(1, req.imported?.dim ?? 1));
    default:
      return 10;
  }
}

export function requestGeometry(
  req: GeometryRequest,
  onDone: (g: WorkerGeometry | { error: string }) => void,
): void {
  if (estimatePoints(req) <= SMALL_OBJECT_LIMIT) {
    // Small object: build synchronously (still goes through the same engine)
    queueMicrotask(() => {
      const g = buildGeometry(req);
      onDone({
        dim: g.dim,
        kind: g.kind,
        count: g.count,
        sampled: g.sampled,
        totalVertices: g.totalVertices,
        totalEdges: g.totalEdges,
        radius: g.radius,
        points: g.points,
        edges: g.edges,
        cluster: g.cluster,
      });
    });
    return;
  }
  const w = ensureWorker();
  const id = nextId++;
  pending.set(id, onDone);
  w.postMessage({ ...req, id });
}
