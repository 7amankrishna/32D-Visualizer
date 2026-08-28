/**
 * Parallel-coordinates view: one vertical axis per dimension, the user's
 * position drawn as a connected line across all axes. Handles are draggable
 * vertically; object points are shown as faint polylines (sampled).
 * This is the primary honest visualization for 8D–32D.
 */

import { useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useCanvasView } from './canvasUtils';
import { axisName } from '../lib/format';

const PAD_TOP = 34;
const PAD_BOTTOM = 46;
const PAD_X = 46;

export default function ParallelView() {
  const dim = useAppStore((s) => s.dim);
  const [autoScale, setAutoScale] = useState(true);
  const [normalized, setNormalized] = useState(false);
  const [scale, setScale] = useState(2.5);
  const [showObject, setShowObject] = useState(true);
  const [hover, setHover] = useState<string | null>(null);

  const drag = useRef<{ axis: number } | null>(null);

  const domain = useRef(2.5);

  const canvasRef = useCanvasView(
    ({ ctx, w, h }) => {
      const st = useAppStore.getState();
      const n = st.dim;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#05070d';
      ctx.fillRect(0, 0, w, h);

      // domain: auto-fit over object + user
      let maxAbs = 1;
      if (autoScale) {
        const g = st.geometry;
        if (g && g.dim === n) {
          const stride = Math.max(1, Math.floor(g.count / 4000));
          for (let i = 0; i < g.count; i += stride) {
            for (let k = 0; k < n; k++) {
              const a = Math.abs(g.points[i * n + k]);
              if (a > maxAbs) maxAbs = a;
            }
          }
        }
        for (let k = 0; k < n; k++) {
          const a = Math.abs(st.user[k]);
          if (a > maxAbs) maxAbs = a;
        }
        maxAbs *= 1.1;
      } else {
        maxAbs = scale;
      }
      if (normalized) maxAbs = 1;
      domain.current = Math.max(0.2, maxAbs);
      const D = domain.current;

      const yOf = (v: number) =>
        PAD_TOP + (1 - (v + D) / (2 * D)) * (h - PAD_TOP - PAD_BOTTOM);
      const xOf = (k: number) => (n <= 1 ? w / 2 : PAD_X + (k * (w - 2 * PAD_X)) / (n - 1));

      // ---- axes ----
      ctx.font = '10px ui-monospace, monospace';
      for (let k = 0; k < n; k++) {
        const x = xOf(k);
        ctx.strokeStyle = '#1d2a44';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, PAD_TOP);
        ctx.lineTo(x, h - PAD_BOTTOM);
        ctx.stroke();
        // axis name (top)
        ctx.fillStyle = '#7f93b8';
        const label = axisName(k);
        const tw = ctx.measureText(label).width;
        ctx.fillText(label, Math.min(Math.max(x - tw / 2, 2), w - tw - 2), 22);
        // zero tick
        ctx.strokeStyle = '#2a3c66';
        const yz = yOf(0);
        if (yz > PAD_TOP && yz < h - PAD_BOTTOM) {
          ctx.beginPath();
          ctx.moveTo(x - 3, yz);
          ctx.lineTo(x + 3, yz);
          ctx.stroke();
        }
        // min / max labels
        ctx.fillStyle = '#42537a';
        ctx.fillText(fmtS(D), x - 14, h - PAD_BOTTOM + 14);
        ctx.fillText(`−${fmtS(D)}`, x - 14, PAD_TOP - 4);
      }

      // ---- object polylines (sampled, faint) ----
      const g = st.geometry;
      if (showObject && g && g.dim === n && g.kind !== 'point' && g.count <= 200000) {
        const maxLines = 220;
        const stride = Math.max(1, Math.ceil(g.count / maxLines));
        ctx.lineWidth = 1;
        for (let i = 0; i < g.count; i += stride) {
          ctx.strokeStyle = 'rgba(76,201,240,0.09)';
          ctx.beginPath();
          for (let k = 0; k < n; k++) {
            const x = xOf(k);
            const y = yOf(clampTo(g.points[i * n + k], D));
            if (k === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }

      // ---- user line ----
      ctx.strokeStyle = '#ffd60a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const x = xOf(k);
        const y = yOf(clampTo(st.user[k], D));
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      for (let k = 0; k < n; k++) {
        const x = xOf(k);
        const y = yOf(clampTo(st.user[k], D));
        ctx.fillStyle = '#ffd60a';
        ctx.beginPath();
        ctx.arc(x, y, drag.current?.axis === k || hover === String(k) ? 6 : 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // ---- hovered value readout ----
      if (hover !== null) {
        const k = Number(hover);
        const v = st.user[k];
        const x = xOf(k);
        const y = yOf(clampTo(v, D));
        ctx.fillStyle = '#ffd60a';
        ctx.font = '11px ui-monospace, monospace';
        const txt = `${axisName(k)} = ${v.toFixed(3)}`;
        ctx.fillText(txt, Math.min(x + 8, w - 90), Math.max(14, y - 8));
      }

      // legend
      ctx.fillStyle = 'rgba(127,147,184,0.9)';
      ctx.font = '11px ui-monospace, monospace';
      const legend =
        `gold = YOU (drag handles)  ·  cyan = ${g && g.dim === n ? g.kind : '—'} (sampled)  ·  scale ±${fmtS(D)}`;
      ctx.fillText(legend, 12, h - 8);
    },
    [dim, autoScale, normalized, scale, showObject],
  );

  // ---- interactions: drag handles -------------------------------------------
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const st = useAppStore.getState();
    const n = st.dim;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const h = rect.height;
    const D = domain.current;
    const xOf = (k: number) => (n <= 1 ? rect.width / 2 : PAD_X + (k * (rect.width - 2 * PAD_X)) / (n - 1));
    const yOf = (v: number) => PAD_TOP + (1 - (v + D) / (2 * D)) * (h - PAD_TOP - PAD_BOTTOM);
    let best = -1;
    let bestD = 14;
    for (let k = 0; k < n; k++) {
      const d = Math.hypot(x - xOf(k), y - yOf(st.user[k]));
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best >= 0) {
      drag.current = { axis: best };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const st = useAppStore.getState();
    const n = st.dim;
    const D = domain.current;
    const xOf = (k: number) => (n <= 1 ? rect.width / 2 : PAD_X + (k * (rect.width - 2 * PAD_X)) / (n - 1));
    let best = -1;
    let bestD = 16;
    for (let k = 0; k < n; k++) {
      const d = Math.abs(x - xOf(k));
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    setHover(best >= 0 ? String(best) : null);
    if (drag.current) {
      const h = rect.height;
      const v = (1 - (y - PAD_TOP) / (h - PAD_TOP - PAD_BOTTOM)) * 2 * D - D;
      st.setUserCoord(drag.current.axis, Math.round(v * 1000) / 1000);
    }
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
        <button className={`btn ${autoScale ? 'btn-active' : ''}`} onClick={() => setAutoScale((v) => !v)}>
          Auto-scale
        </button>
        <button
          className={`btn ${!autoScale && !normalized ? 'btn-active' : ''}`}
          onClick={() => setNormalized((v) => !v)}
        >
          Normalize ±1
        </button>
        <button className={`btn ${showObject ? 'btn-active' : ''}`} onClick={() => setShowObject((v) => !v)}>
          Object points
        </button>
        <div className="btn flex items-center gap-2 !py-1">
          <span className="text-[10px] text-dim">scale</span>
          <input
            type="range"
            min={0.5}
            max={8}
            step={0.25}
            value={scale}
            disabled={autoScale || normalized}
            onChange={(e) => {
              setScale(Number(e.target.value));
              setAutoScale(false);
              setNormalized(false);
            }}
            className="w-24"
            aria-label="axis scale"
          />
          <span className="w-8 font-mono text-[10px]">{scale.toFixed(2)}</span>
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-3 right-3 max-w-md rounded-md border border-line bg-ink/80 px-2.5 py-1.5 text-[11px] leading-4 text-dim">
        Each vertical axis is one dimension. The gold line is your full {dim}-coordinate vector —
        drag any handle to move through that dimension. Faint cyan lines are other points of the
        object (sampled).
      </div>
    </div>
  );
}

function clampTo(v: number, D: number): number {
  return Math.min(D, Math.max(-D, v));
}

function fmtS(v: number): string {
  return v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
}
