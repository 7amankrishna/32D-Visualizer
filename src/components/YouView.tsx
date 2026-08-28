/**
 * "I AM HERE" view — the user's presence rendered four ways at once:
 * 1) projected 3D→2D position of the full object + YOU
 * 2) the complete coordinate tuple
 * 3) parallel-coordinates line
 * 4) cross-section: where you stand relative to the active slice
 */

import { useMemo } from 'react';
import { useAppStore, planeList } from '../store/useAppStore';
import { buildPipeline } from '../lib/pipeline';
import { useCanvasView } from './canvasUtils';
import { axisName, fmt, tuple } from '../lib/format';
import { makeVector } from '../lib/nd';

export default function YouView() {
  const dim = useAppStore((s) => s.dim);
  const user = useAppStore((s) => s.user);
  const geometry = useAppStore((s) => s.geometry);

  const pipeline = useMemo(() => {
    if (dim < 3) return null;
    const st = useAppStore.getState();
    return buildPipeline({
      dim,
      stageDim: st.stageDim,
      stage1: st.stage1,
      stage2: st.stage2,
      perspectiveDistance: st.perspectiveDistance,
      activeDims: st.activeDims,
      seed: st.seed,
      rotations: planeList(st),
    });
  }, [dim, geometry]);

  // ---- panel 1: projected view ----------------------------------------------
  const projRef = useCanvasView(
    ({ ctx, w, h }) => {
      const st = useAppStore.getState();
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#05070d';
      ctx.fillRect(0, 0, w, h);

      // simple 3D→2D perspective camera (z into the screen)
      const cam = (x: number, y: number, z: number): [number, number] | null => {
        const f = 6 / (6 - z * 0.25);
        if (6 - z * 0.25 <= 0.1) return null;
        return [w / 2 + x * (Math.min(w, h) / 7) * f, h / 2 - y * (Math.min(w, h) / 7) * f];
      };

      const g = st.geometry;
      if (pipeline && g && g.dim === dim) {
        const out = new Float64Array(3);
        const stride = Math.max(1, Math.floor(g.count / 2500));
        for (let i = 0; i < g.count; i += stride) {
          if (!pipeline.projectOne(g.points.subarray(i * dim, (i + 1) * dim), out)) continue;
          const p = cam(out[0], out[1], out[2]);
          if (!p) continue;
          ctx.fillStyle = 'rgba(76,201,240,0.5)';
          ctx.fillRect(p[0] - 1, p[1] - 1, 2, 2);
        }
        const uv = makeVector(dim);
        uv.set(st.user.slice(0, dim));
        if (pipeline.projectOne(uv, out)) {
          const p = cam(out[0], out[1], out[2]);
          if (p) {
            ctx.fillStyle = '#ffd60a';
            ctx.beginPath();
            ctx.arc(p[0], p[1], 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.font = 'bold 12px ui-monospace, monospace';
            ctx.fillText('YOU', p[0] + 9, p[1] - 6);
          }
        }
      } else if (dim === 2) {
        const s = Math.min(w, h) / 6;
        const g = st.geometry;
        if (g && g.dim === 2) {
          ctx.fillStyle = 'rgba(76,201,240,0.5)';
          for (let i = 0; i < g.count; i++) {
            const x = w / 2 + g.points[i * 2] * s;
            const y = h / 2 - g.points[i * 2 + 1] * s;
            ctx.fillRect(x - 1, y - 1, 2, 2);
          }
        }
        const x = w / 2 + st.user[0] * s;
        const y = h / 2 - st.user[1] * s;
        ctx.fillStyle = '#ffd60a';
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.fillText('YOU', x + 9, y - 6);
      }
    },
    [dim, pipeline, geometry],
  );

  // ---- panel 3: parallel line -------------------------------------------------
  const parRef = useCanvasView(
    ({ ctx, w, h }) => {
      const st = useAppStore.getState();
      const n = st.dim;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#05070d';
      ctx.fillRect(0, 0, w, h);
      let maxAbs = 1;
      for (let k = 0; k < n; k++) maxAbs = Math.max(maxAbs, Math.abs(st.user[k]));
      if (st.geometry && st.geometry.dim === n) {
        const stride = Math.max(1, Math.floor(st.geometry.count / 2000));
        for (let i = 0; i < st.geometry.count; i += stride) {
          for (let k = 0; k < n; k++) maxAbs = Math.max(maxAbs, Math.abs(st.geometry.points[i * n + k]));
        }
      }
      maxAbs *= 1.1;
      const D = maxAbs;
      const xOf = (k: number) => 20 + (k * (w - 40)) / Math.max(1, n - 1);
      const yOf = (v: number) => 24 + (1 - (v + D) / (2 * D)) * (h - 48);
      ctx.strokeStyle = '#1d2a44';
      for (let k = 0; k < n; k++) {
        ctx.beginPath();
        ctx.moveTo(xOf(k), 20);
        ctx.lineTo(xOf(k), h - 20);
        ctx.stroke();
        ctx.fillStyle = '#54688f';
        ctx.font = '8px ui-monospace, monospace';
        const lb = axisName(k);
        if (n <= 12 || k % 4 === 0) ctx.fillText(lb, Math.min(xOf(k) - 8, w - 18), h - 8);
      }
      ctx.strokeStyle = '#ffd60a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const y = yOf(st.user[k]);
        if (k === 0) ctx.moveTo(xOf(k), y);
        else ctx.lineTo(xOf(k), y);
      }
      ctx.stroke();
    },
    [dim, geometry],
  );

  const coords = user.slice(0, dim);
  const maxLine = useMemo(() => Math.max(...coords.map(Math.abs), 0.001), [user, dim]);

  // first hidden dimension (for the cross-section panel)
  const activeDims = useAppStore((s) => s.activeDims);
  const sliceValues = useAppStore((s) => s.sliceValues);
  const hidden: number | null = useMemo(() => {
    if (dim < 4) return null;
    for (let d = 0; d < dim; d++) if (!activeDims.includes(d)) return d;
    return null;
  }, [dim, activeDims]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-line bg-you/5 px-4 py-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-you">You are here</div>
        <div className="mt-1 font-mono text-lg text-txt">
          Dimension: <span className="text-you">{dim}</span>
        </div>
        <div className="mt-1 break-all font-mono text-[12px] leading-5 text-dim">
          YOU = {tuple(coords)}
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-px bg-line">
        <div className="flex min-h-0 flex-col bg-panel p-2">
          <div className="lbl">Projected view (N→3→screen)</div>
          <div className="relative min-h-0 w-full flex-1">
            <canvas ref={projRef} className="absolute inset-0 h-full w-full" />
          </div>
        </div>
        <div className="flex min-h-0 flex-col bg-panel p-2">
          <div className="lbl">Coordinate view</div>
          <div className="min-h-0 w-full flex-1 overflow-auto">
            <div className="space-y-1">
              {coords.map((v, i) => (
                <div key={i} className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="w-8 text-dim">{axisName(i)}</span>
                  <span className="w-14 text-right text-txt">{fmt(v, 3)}</span>
                  <div className="relative h-1.5 flex-1 rounded bg-line">
                    <div
                      className="absolute top-0 h-full rounded bg-you/70"
                      style={{
                        left: v >= 0 ? '50%' : `${50 - (Math.abs(v) / maxLine) * 50}%`,
                        width: `${(Math.abs(v) / maxLine) * 50}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex min-h-0 flex-col bg-panel p-2">
          <div className="lbl">Parallel view</div>
          <div className="relative min-h-0 w-full flex-1">
            <canvas ref={parRef} className="absolute inset-0 h-full w-full" />
          </div>
        </div>
        <div className="min-h-0 overflow-auto bg-panel p-3">
          <div className="lbl">Cross-section position</div>
          {hidden !== null ? (
            <div className="space-y-3 font-mono text-[12px]">
              <p className="text-dim">
                Relative to the slice at {axisName(hidden)} ={' '}
                <span className="text-txt">{fmt(sliceValues[hidden] ?? 0, 3)}</span>
              </p>
              <div className="relative h-3 rounded bg-line">
                <div
                  className="absolute top-[-3px] h-5 w-0.5 bg-accent"
                  style={{ left: slicePosPct(sliceValues[hidden] ?? 0, 2.5) }}
                  title="slice"
                />
                <div
                  className="absolute top-[-3px] h-5 w-1.5 rounded bg-you"
                  style={{ left: slicePosPct(user[hidden] ?? 0, 2.5) }}
                  title="you"
                />
              </div>
              <p className="text-dim">
                distance to slice: <span className="text-you">{Math.abs((user[hidden] ?? 0) - (sliceValues[hidden] ?? 0)).toFixed(3)}</span>
              </p>
              <p className="text-[11px] leading-4 text-dim">
                Cyan tick = the slice plane, gold = your coordinate {axisName(hidden)}. When they
                coincide, YOU lies exactly inside the cross-section shown in the Slice view.
              </p>
            </div>
          ) : (
            <p className="text-dim">2D mode: every coordinate is visible — no hidden dimensions.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function slicePosPct(v: number, range: number): string {
  const p = Math.min(99, Math.max(1, 50 + (v / range) * 50));
  return `${p}%`;
}
