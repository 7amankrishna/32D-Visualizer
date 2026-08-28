/**
 * 2D view: a full interactive Cartesian plane for N = 2 (pan, zoom,
 * rotate-frame, draw points/vectors/circles/polygons, move the user).
 * For N > 2 it shows the object's honest 2D shadow on the X₁–X₂ plane.
 */

import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useCanvasView } from './canvasUtils';
import { axisName } from '../lib/format';

type Tool = 'select' | 'point' | 'vector' | 'circle' | 'polygon';

interface Transform {
  tx: number; // world → screen: sx = (x*cos−y*sin)*scale + tx
  ty: number;
  scale: number;
  rot: number;
}

const TOOLS: Array<{ id: Tool; label: string; hint: string }> = [
  { id: 'select', label: 'Select / Move', hint: 'drag YOU or pan' },
  { id: 'point', label: 'Point', hint: 'click to place' },
  { id: 'vector', label: 'Vector', hint: 'click an endpoint' },
  { id: 'circle', label: 'Circle', hint: 'drag center → radius' },
  { id: 'polygon', label: 'Polygon', hint: 'click vertices, dbl-click closes' },
];

export default function View2D() {
  const dim = useAppStore((s) => s.dim);
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const t = useRef<Transform>({ tx: 0, ty: 0, scale: 90, rot: 0 });
  const [frameRot, setFrameRot] = useState(0);
  useEffect(() => {
    t.current.rot = (frameRot * Math.PI) / 180;
  }, [frameRot]);

  const pendingPoly = useRef<number[]>([]);
  const pendingCircle = useRef<{ cx: number; cy: number; r: number } | null>(null);

  const canvasRef = useCanvasView(
    ({ ctx, w, h }) => {
      const st = useAppStore.getState();
      const T = t.current;
      const c = Math.cos(T.rot);
      const s = Math.sin(T.rot);
      const toScreen = (x: number, y: number): [number, number] => [
        w / 2 + (x * c - y * s) * T.scale + T.tx,
        h / 2 + (x * s + y * c) * T.scale + T.ty,
      ];
      const toWorld = (sx: number, sy: number): [number, number] => {
        const dx = (sx - w / 2 - T.tx) / T.scale;
        const dy = (sy - h / 2 - T.ty) / T.scale;
        return [dx * c + dy * s, -dx * s + dy * c];
      };

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#05070d';
      ctx.fillRect(0, 0, w, h);

      // ---- grid ----
      const step = niceStepLocal(70 / T.scale);
      const [wx0, wy1] = toWorld(0, 0);
      const [wx1, wy0] = toWorld(w, h);
      const x0 = Math.min(wx0, wx1);
      const x1 = Math.max(wx0, wx1);
      const y0 = Math.min(wy0, wy1);
      const y1 = Math.max(wy0, wy1);
      ctx.lineWidth = 1;
      for (let gx = Math.ceil(x0 / step) * step; gx <= x1; gx += step) {
        ctx.strokeStyle = Math.abs(gx) < step / 2 ? '#33456e' : '#131c30';
        ctx.beginPath();
        const [ax, ay] = toScreen(gx, y0);
        const [bx, by] = toScreen(gx, y1);
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
      for (let gy = Math.ceil(y0 / step) * step; gy <= y1; gy += step) {
        ctx.strokeStyle = Math.abs(gy) < step / 2 ? '#33456e' : '#131c30';
        ctx.beginPath();
        const [ax, ay] = toScreen(x0, gy);
        const [bx, by] = toScreen(x1, gy);
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }

      // axis labels
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillStyle = '#7f93b8';
      const [lx, ly] = toScreen(x1 - 0.2, 0.28);
      ctx.fillText(axisName(0), lx, ly);
      const [lx2, ly2] = toScreen(0.28, y1 - 0.2);
      ctx.fillText(axisName(1), lx2, ly2);
      // numeric ticks
      ctx.fillStyle = '#54688f';
      for (let gx = Math.ceil(x0 / step) * step; gx <= x1; gx += step) {
        if (Math.abs(gx) < step / 2) continue;
        const [ax, ay] = toScreen(gx, -0.06);
        ctx.fillText(String(Math.round(gx * 100) / 100), ax, ay + 14);
      }

      // ---- object shadow (for N > 2 the object is 2D-projected onto x₁x₂) ----
      const g = st.geometry;
      if (g && g.dim === dim && dim > 2) {
        const maxPts = 5000;
        const stride = Math.max(1, Math.floor(g.count / maxPts));
        ctx.fillStyle = 'rgba(76,201,240,0.28)';
        for (let i = 0; i < g.count; i += stride) {
          const [px, py] = toScreen(g.points[i * g.dim], g.points[i * g.dim + 1]);
          ctx.fillRect(px - 1, py - 1, 2, 2);
        }
        ctx.fillStyle = 'rgba(127,147,184,0.8)';
        ctx.font = '11px ui-monospace, monospace';
        ctx.fillText(
          `2D shadow of ${g.kind} on ${axisName(0)}–${axisName(1)} plane (other ${dim - 2} coordinates hidden)`,
          12,
          h - 14,
        );
      }

      // ---- drawn items ----
      ctx.lineWidth = 1.5;
      for (const item of st.drawn) {
        if (item.tool === 'point') {
          const [px, py] = toScreen(item.pts[0], item.pts[1]);
          dot(ctx, px, py, 3.5, '#4cc9f0');
        } else if (item.tool === 'vector') {
          const [ax, ay] = toScreen(0, 0);
          const [bx, by] = toScreen(item.pts[0], item.pts[1]);
          arrow(ctx, ax, ay, bx, by, '#43d98a');
        } else if (item.tool === 'circle') {
          const [px, py] = toScreen(item.pts[0], item.pts[1]);
          ctx.strokeStyle = 'rgba(181,23,158,0.9)';
          ctx.beginPath();
          ctx.arc(px, py, item.pts[2] * T.scale, 0, Math.PI * 2);
          ctx.stroke();
        } else if (item.tool === 'polygon' && item.pts.length >= 4) {
          ctx.strokeStyle = 'rgba(255,150,80,0.9)';
          ctx.beginPath();
          const n = item.pts.length / 2;
          for (let i = 0; i < n; i++) {
            const [px, py] = toScreen(item.pts[i * 2], item.pts[i * 2 + 1]);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }

      // pending polygon preview
      if (pendingPoly.current.length >= 2) {
        ctx.strokeStyle = 'rgba(255,150,80,0.5)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        for (let i = 0; i < pendingPoly.current.length; i += 2) {
          const [px, py] = toScreen(pendingPoly.current[i], pendingPoly.current[i + 1]);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // pending circle preview
      if (pendingCircle.current && pendingCircle.current.r > 0.01) {
        const { cx, cy, r } = pendingCircle.current;
        const [px, py] = toScreen(cx, cy);
        ctx.strokeStyle = 'rgba(181,23,158,0.6)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(px, py, r * T.scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // ---- YOU ----
      const ux = st.user[0];
      const uy = st.user[1];
      const [uxs, uys] = toScreen(ux, uy);
      // distance line to origin
      const [ox, oy] = toScreen(0, 0);
      ctx.strokeStyle = 'rgba(255,214,10,0.35)';
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(uxs, uys);
      ctx.stroke();
      ctx.setLineDash([]);
      const d = Math.hypot(ux, uy);
      ctx.fillStyle = '#ffd60a';
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillText(`d = ${d.toFixed(2)}`, (ox + uxs) / 2 + 6, (oy + uys) / 2 - 6);
      dot(ctx, uxs, uys, 7, '#ffd60a', true);
      ctx.fillStyle = '#ffd60a';
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillText(`YOU = (${fmtC(ux)}, ${fmtC(uy)})`, uxs + 12, uys - 10);

      // origin
      dot(ctx, ox, oy, 2.5, '#7f93b8');
    },
    [dim, activeTool],
  );

  // ---- pointer interactions -------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pos = (e: PointerEvent | MouseEvent): [number, number] => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const toWorld = (sx: number, sy: number): [number, number] => {
      const r = canvas.getBoundingClientRect();
      const T = t.current;
      const w = r.width;
      const h = r.height;
      const c = Math.cos(T.rot);
      const s = Math.sin(T.rot);
      const dx = (sx - w / 2 - T.tx) / T.scale;
      const dy = (sy - h / 2 - T.ty) / T.scale;
      return [dx * c + dy * s, -dx * s + dy * c];
    };
    const toScreen = (wx: number, wy: number): [number, number] => {
      const r = canvas.getBoundingClientRect();
      const T = t.current;
      const c = Math.cos(T.rot);
      const s = Math.sin(T.rot);
      return [
        r.width / 2 + (wx * c - wy * s) * T.scale + T.tx,
        r.height / 2 + (wx * s + wy * c) * T.scale + T.ty,
      ];
    };

    let mode: 'none' | 'pan' | 'user' | 'circle' = 'none';
    let start: [number, number] = [0, 0];
    let panStart = { tx: 0, ty: 0 };

    const onDown = (e: PointerEvent) => {
      const [sx, sy] = pos(e);
      const st = useAppStore.getState();
      const [uxs, uys] = toScreen(st.user[0], st.user[1]);
      const nearUser = Math.hypot(sx - uxs, sy - uys) < 14;

      if (activeTool === 'point') {
        const [wx, wy] = toWorld(sx, sy);
        st.addDrawn({ id: crypto.randomUUID(), tool: 'point', pts: [wx, wy] });
        return;
      }
      if (activeTool === 'vector') {
        const [wx, wy] = toWorld(sx, sy);
        st.addDrawn({ id: crypto.randomUUID(), tool: 'vector', pts: [wx, wy] });
        return;
      }
      if (activeTool === 'circle') {
        const [wx, wy] = toWorld(sx, sy);
        mode = 'circle';
        pendingCircle.current = { cx: wx, cy: wy, r: 0 };
        start = [wx, wy];
        return;
      }
      if (activeTool === 'polygon') {
        const [wx, wy] = toWorld(sx, sy);
        pendingPoly.current.push(wx, wy);
        return;
      }
      // select tool
      if (nearUser) {
        mode = 'user';
      } else {
        mode = 'pan';
        panStart = { tx: t.current.tx, ty: t.current.ty };
      }
      start = [sx, sy];
    };

    const onMove = (e: PointerEvent) => {
      const [sx, sy] = pos(e);
      const st = useAppStore.getState();
      if (mode === 'pan') {
        t.current.tx = panStart.tx + (sx - start[0]);
        t.current.ty = panStart.ty + (sy - start[1]);
      } else if (mode === 'user') {
        const [wx, wy] = toWorld(sx, sy);
        st.setUserCoord(0, Math.round(wx * 100) / 100);
        st.setUserCoord(1, Math.round(wy * 100) / 100);
      } else if (mode === 'circle' && pendingCircle.current) {
        const [wx, wy] = toWorld(sx, sy);
        const { cx, cy } = pendingCircle.current;
        pendingCircle.current.r = Math.hypot(wx - cx, wy - cy);
      }
    };

    const onUp = () => {
      const st = useAppStore.getState();
      if (mode === 'circle' && pendingCircle.current) {
        const { cx, cy, r } = pendingCircle.current;
        if (r > 0.02) {
          st.addDrawn({ id: crypto.randomUUID(), tool: 'circle', pts: [cx, cy, r] });
        }
      }
      mode = 'none';
      pendingCircle.current = null;
    };

    const onDblClick = () => {
      const st = useAppStore.getState();
      if (pendingPoly.current.length >= 4) {
        st.addDrawn({ id: crypto.randomUUID(), tool: 'polygon', pts: pendingPoly.current.slice() });
      }
      pendingPoly.current = [];
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const [sx, sy] = pos(e);
      const T = t.current;
      const r = canvas.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * 0.0012);
      const newScale = Math.max(8, Math.min(2000, T.scale * factor));
      // zoom about the cursor
      const c = Math.cos(T.rot);
      const s = Math.sin(T.rot);
      const wx = (sx - r.width / 2 - T.tx) / T.scale;
      const wy = (sy - r.height / 2 - T.ty) / T.scale;
      const wwx = wx * c + wy * s;
      const wwy = -wx * s + wy * c;
      T.scale = newScale;
      T.tx = sx - r.width / 2 - (wwx * c - wwy * s) * newScale;
      T.ty = sy - r.height / 2 - (wwx * s + wwy * c) * newScale;
    };

    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    canvas.addEventListener('dblclick', onDblClick);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('dblclick', onDblClick);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [canvasRef, activeTool]);

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full touch-none" />
      {true && (
        <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
          {TOOLS.map((tl) => (
            <button
              key={tl.id}
              className={`btn ${activeTool === tl.id ? 'btn-active' : ''}`}
              title={tl.hint}
              onClick={() => setActiveTool(tl.id)}
            >
              {tl.label}
            </button>
          ))}
          <div className="btn flex items-center gap-2 !py-1">
            <span className="text-[10px] text-dim">frame rot</span>
            <input
              type="range"
              min={-90}
              max={90}
              step={1}
              value={frameRot}
              onChange={(e) => setFrameRot(Number(e.target.value))}
              className="w-20"
              aria-label="frame rotation"
            />
            <span className="w-8 font-mono text-[10px]">{frameRot}°</span>
          </div>
          <button className="btn" onClick={() => useAppStore.getState().clearDrawn()}>
            Clear drawings
          </button>
        </div>
      )}
      {dim > 2 && (
        <div className="pointer-events-none absolute right-3 top-16 rounded-md border border-line bg-ink/80 px-2.5 py-1.5 text-[11px] text-dim">
          N = {dim} — showing the honest 2D shadow on {axisName(0)}–{axisName(1)}
        </div>
      )}
    </div>
  );
}

function dot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  ring = false,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (ring) {
    ctx.strokeStyle = 'rgba(255,214,10,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r + 4, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function arrow(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  const ang = Math.atan2(by - ay, bx - ax);
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx - 8 * Math.cos(ang - 0.4), by - 8 * Math.sin(ang - 0.4));
  ctx.lineTo(bx - 8 * Math.cos(ang + 0.4), by - 8 * Math.sin(ang + 0.4));
  ctx.closePath();
  ctx.fill();
}

function niceStepLocal(target: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  for (const m of [1, 2, 5, 10]) {
    if (m * pow >= target) return m * pow;
  }
  return 10 * pow;
}

function fmtC(v: number): string {
  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
}
