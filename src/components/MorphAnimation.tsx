/**
 * "What does higher dimension look like?" — animated demonstration.
 * A 2D canvas runs the SAME N-dimensional engine: the N-cube is built by
 * extrusion (the mathematical definition of adding a dimension), rotated in
 * the newest plane (folded into the visible Z axis so the growth is seen at
 * every dimension), and projected N → 3 → 2. Works for any maxDim ≤ 32
 * (sampled for N > 14, like the main app).
 */

import { useEffect, useRef, useState } from 'react';
import { mulberry32 } from '../lib/nd';
import { bigNumber, pow2 } from '../lib/format';
import { useAppStore } from '../store/useAppStore';

const STAGE_SECONDS = 2.4;
const HOLD_SECONDS = 1.4;
const SAMPLED_BASE = 256;

export default function MorphAnimation() {
  const open = useAppStore((s) => s.morph.open);
  if (!open) return null;
  return <MorphBody />;
}

interface StageData {
  bits: Uint32Array;
  /** edge pairs (i,j) among sampled base vertices */
  edges: Array<[number, number]>;
  sampled: boolean;
}

function buildStage(m: number): StageData {
  const cache = buildStage.cache;
  const hit = cache.get(m);
  if (hit) return hit;
  const rng = mulberry32(1234 + m);
  let bits: Uint32Array;
  let sampled = false;
  if (m <= 14) {
    bits = new Uint32Array(1 << m);
    for (let i = 0; i < bits.length; i++) bits[i] = i;
  } else {
    sampled = true;
    bits = new Uint32Array(SAMPLED_BASE);
    const seen = new Set<number>();
    let guard = 0;
    while (seen.size < SAMPLED_BASE && guard++ < SAMPLED_BASE * 64) {
      seen.add(Math.floor(rng() * 0xffffffff) >>> 0);
    }
    let i = 0;
    for (const x of seen) bits[i++] = x;
  }
  const idBy = new Map<number, number>();
  for (let i = 0; i < bits.length; i++) idBy.set(bits[i], i);
  const edges: Array<[number, number]> = [];
  const limit = Math.min(bits.length, 1024);
  for (let i = 0; i < limit; i++) {
    for (let k = 0; k < m; k++) {
      const j = idBy.get(bits[i] ^ (1 << k));
      if (j !== undefined && j > i) edges.push([i, j]);
    }
  }
  const data: StageData = { bits, edges, sampled };
  cache.set(m, data);
  return data;
}
buildStage.cache = new Map<number, StageData>();

function MorphBody() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [playing, setPlaying] = useState(true);
  const [maxDim, setMaxDim] = useState(10);
  const [speed, setSpeed] = useState(1);
  const rt = useRef({ t: 0, playing: true, maxDim: 10, speed: 1 });
  rt.current.playing = playing;
  rt.current.maxDim = maxDim;
  rt.current.speed = speed;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    let last = performance.now();
    // While paused the scene is static — skip the redraw when nothing
    // changed (avoids endless canvas invalidation, which can also stall
    // software (SwiftShader) compositors).
    let drawnKey = '';
    const proj = new Float32Array(SAMPLED_BASE * 2 * 3);
    // for full enumeration stages, proj can be up to 2^14*2*3 — allocate lazily
    let projCap = SAMPLED_BASE * 2 * 3;

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const R = rt.current;
      if (R.playing) R.t += dt * R.speed;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w > 0 && h > 0 && canvas.width !== Math.floor(w * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
      const ctx = canvas.getContext('2d');
      if (!ctx || w === 0) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const key = `${R.t.toFixed(4)}|${canvas.width}x${canvas.height}|${R.maxDim}`;
      if (!R.playing && key === drawnKey) {
        raf = requestAnimationFrame(draw);
        return;
      }
      drawnKey = key;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#05070d';
      ctx.fillRect(0, 0, w, h);

      const maxDim = Math.max(2, R.maxDim);
      const totalStages = maxDim - 1;
      const cycle = R.t % (totalStages * STAGE_SECONDS + HOLD_SECONDS);

      let N: number;
      let u: number;
      if (cycle >= totalStages * STAGE_SECONDS) {
        N = maxDim;
        u = 1;
      } else {
        const stage = Math.floor(cycle / STAGE_SECONDS);
        u = cycle / STAGE_SECONDS - stage;
        N = stage + 2;
      }
      const m = N - 1; // base (N-1)-cube dimension
      const base = buildStage(m);
      const V = Math.min(base.bits.length, 1024);

      if (projCap < V * 2 * 3) {
        proj.set(new Float32Array(V * 2 * 3));
        projCap = V * 2 * 3;
      }

      // rotate the pair (visible axis 2, new axis N) — makes the extrusion
      // visible at every dimension, then orthographic drop to 3 axes.
      const grow = ease(u);
      const spin = 0.6 * u + ((R.t % (Math.PI * 2)) / (Math.PI * 2)) * 0.5;
      const c = Math.cos(spin);
      const s = Math.sin(spin);

      for (let i = 0; i < V; i++) {
        const bits = base.bits[i];
        const x0 = (bits & 1) ? 1 : -1;
        const y1 = m >= 2 && (bits & 2) ? 1 : -1;
        const z0 = m >= 3 && (bits & 4) ? 1 : -1;
        for (let f = 0; f < 2; f++) {
          const wnew = f === 0 ? -1 : grow; // new coordinate (extruded)
          const zr = c * z0 - s * wnew; // folded into visible Z
          const o = (i * 2 + f) * 3;
          proj[o] = x0;
          proj[o + 1] = m >= 2 ? y1 : 0;
          proj[o + 2] = zr;
        }
      }

      // 3D → 2D perspective (camera at z = -5 looking toward +z)
      const cx = w / 2;
      const cy = h / 2;
      const S = Math.min(w, h) / 7.5;
      const to2 = (i: number, f: 0 | 1): [number, number] | null => {
        const o = (i * 2 + f) * 3;
        const z = proj[o + 2];
        const d = 5 - z;
        if (d <= 0.2) return null;
        const sc = (S * 5) / d;
        return [cx + proj[o] * sc, cy - proj[o + 1] * sc];
      };

      ctx.lineWidth = 1;
      const drawSeg = (a: [number, number], b: [number, number], color: string) => {
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      };

      for (const [i, j] of base.edges) {
        if (i >= V || j >= V) continue;
        const a0 = to2(i, 0);
        const b0 = to2(j, 0);
        const a1 = to2(i, 1);
        const b1 = to2(j, 1);
        if (a0 && b0) drawSeg(a0, b0, 'rgba(76,201,240,0.38)');
        if (a1 && b1 && grow > 0.02) drawSeg(a1, b1, 'rgba(255,214,10,0.5)');
      }
      if (grow > 0.02) {
        for (let i = 0; i < V; i++) {
          const a0 = to2(i, 0);
          const a1 = to2(i, 1);
          if (a0 && a1) drawSeg(a0, a1, 'rgba(181,23,158,0.45)');
        }
      }
      for (let i = 0; i < V; i++) {
        const p0 = to2(i, 0);
        const p1 = to2(i, 1);
        if (p0) {
          ctx.fillStyle = 'rgba(76,201,240,0.9)';
          ctx.fillRect(p0[0] - 1.5, p0[1] - 1.5, 3, 3);
        }
        if (p1) {
          ctx.fillStyle = 'rgba(255,214,10,0.95)';
          ctx.fillRect(p1[0] - 1.5, p1[1] - 1.5, 3, 3);
        }
      }

      // stats
      ctx.fillStyle = '#dbe4f5';
      ctx.font = 'bold 20px ui-monospace, monospace';
      ctx.fillText(`${N}-D HYPERCUBE`, 18, 34);
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillStyle = '#7f93b8';
      ctx.fillText(`degrees of freedom: ${N}`, 18, 58);
      ctx.fillText(`vertices: 2^${N} = ${bigNumber(Math.pow(2, N))}${N > 14 || base.sampled ? ' (sampled)' : ''}`, 18, 76);
      ctx.fillText(`edges: ${N}·2^${N - 1} = ${bigNumber(N * Math.pow(2, N - 1))}`, 18, 94);
      ctx.fillText(`rotation planes: ${(N * (N - 1)) / 2}`, 18, 112);
      ctx.fillText(`projection: ${N}D → 3D → 2D (orthographic + perspective)`, 18, 130);
      ctx.fillText(`extrusion along new axis, rotated ${Math.round((spin * 180) / Math.PI)}°: u = ${grow.toFixed(2)}`, 18, 148);
      ctx.fillStyle = '#42537a';
      ctx.fillText(`stage ${N}/…${maxDim} · target 2^${maxDim} = ${pow2(maxDim)} vertices`, 18, h - 18);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const close = () => useAppStore.getState().setMorph({ open: false });

  // NOTE: no backdrop-filter on this overlay — a full-viewport backdrop
  // blur is visually invisible under a near-opaque background and can
  // stall software (SwiftShader) compositors.
  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-ink">
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <div>
          <h2 className="text-sm font-bold text-txt">
            WHAT DOES HIGHER DIMENSION LOOK LIKE? <span className="text-dim">— extrusion animation</span>
          </h2>
          <p className="text-[10px] text-dim">
            Adding a dimension = extruding the object along a new axis, then rotating in the new
            plane. Every frame is a real N-dimensional calculation projected to your screen.
          </p>
        </div>
        <button className="btn" onClick={close}>
          ✕ close
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>
      <div className="flex items-center gap-3 border-t border-line px-4 py-2">
        <button className={`btn ${playing ? 'btn-active' : ''}`} onClick={() => setPlaying((v) => !v)}>
          {playing ? '⏸ pause' : '▶ play'}
        </button>
        <label className="flex items-center gap-2 text-[11px] text-dim">
          target
          <select className="btn font-mono" value={maxDim} onChange={(e) => setMaxDim(Number(e.target.value))}>
            {[4, 6, 8, 10, 12, 16, 20, 32].map((n) => (
              <option key={n} value={n}>
                {n}D
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[11px] text-dim">
          speed
          <input
            type="range"
            min={0.25}
            max={3}
            step={0.25}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="w-24"
          />
          <span className="font-mono">{speed.toFixed(2)}×</span>
        </label>
        <span className="ml-auto font-mono text-[10px] text-dim">
          2<sup>{maxDim}</sup> = {pow2(maxDim)} vertices at the target dimension
        </span>
      </div>
    </div>
  );
}

function ease(t: number): number {
  return t * t * (3 - 2 * t);
}
