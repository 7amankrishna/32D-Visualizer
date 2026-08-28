/**
 * Web Worker for heavy N-dimensional geometry generation:
 * hypercube sampling (up to 2^32 logical vertices) and large point clouds.
 * The worker only ever imports the pure math engine — no DOM, no React.
 */

import { buildGeometry, type GeometryRequest } from '../lib/geometry';

interface BuildMessage extends GeometryRequest {
  id: number;
}

self.onmessage = (e: MessageEvent<BuildMessage>) => {
  const msg = e.data;
  try {
    const g = buildGeometry(msg);
    (self as unknown as Worker).postMessage(
      {
        id: msg.id,
        ok: true,
        dim: g.dim,
        kind: g.kind,
        count: g.count,
        sampled: g.sampled,
        totalVertices: g.totalVertices,
        totalEdges: g.totalEdges,
        radius: g.radius,
        points: g.points.buffer,
        edges: g.edges.buffer,
        cluster: g.cluster ? g.cluster.buffer : null,
      },
      [g.points.buffer, g.edges.buffer, g.cluster ? g.cluster.buffer : null] as BlobPart[],
    );
  } catch (err) {
    (self as unknown as Worker).postMessage({
      id: msg.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
