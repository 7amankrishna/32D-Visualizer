/**
 * Slice view: the true 2D cross-section of the object.
 * Two dimensions are "active" (drawn as the plane axes); every other
 * dimension is fixed at the value in the Slice panel. For spheres and
 * hypercubes the section is computed analytically (exact radius / box);
 * for discrete point sets the 2D shadow is shown and labeled as such.
 */

import { useAppStore } from '../store/useAppStore';
import { useCanvasView } from './canvasUtils';
import { axisName } from '../lib/format';
import { analyticSection } from '../lib/nd';

export default function SliceView() {
  const dim = useAppStore((s) => s.dim);
  const sliceActive = useAppStore((s) => s.sliceActive);

  const canvasRef = useCanvasView(
    ({ ctx, w, h }) => {
      const st = useAppStore.getState();
      const n = st.dim;
      const [a, b] = st.sliceActive;
      const fixed = st.sliceValues;
      const g = st.geometry;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#05070d';
      ctx.fillRect(0, 0, w, h);

      const scale = Math.min(w, h) / 4.6;
      const cx = w / 2;
      const cy = h / 2;
      const toScreen = (x: number, y: number): [number, number] => [cx + x * scale, cy - y * scale];

      // grid
      ctx.lineWidth = 1;
      for (let gxi = -4; gxi <= 4; gxi++) {
        ctx.strokeStyle = gxi === 0 ? '#33456e' : '#10182a';
        ctx.beginPath();
        const [ax, ay] = toScreen(gxi, -4.2);
        const [bx, by] = toScreen(gxi, 4.2);
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        const [hx, hy] = toScreen(gxi, 0);
        if (gxi !== 0) {
          ctx.fillStyle = '#42537a';
          ctx.font = '10px ui-monospace, monospace';
          ctx.fillText(String(gxi), hx + 3, hy + 12);
        }
      }
      for (let gyi = -4; gyi <= 4; gyi++) {
        ctx.strokeStyle = gyi === 0 ? '#33456e' : '#10182a';
        ctx.beginPath();
        const [ax, ay] = toScreen(-4.2, gyi);
        const [bx, by] = toScreen(4.2, gyi);
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        if (gyi !== 0) {
          ctx.fillStyle = '#42537a';
          ctx.font = '10px ui-monospace, monospace';
          ctx.fillText(String(gyi), ax + 4, toScreen(0, gyi)[1] - 3);
        }
      }

      // axis names
      ctx.fillStyle = '#7f93b8';
      ctx.font = '11px ui-monospace, monospace';
      const [axx, axy] = toScreen(4.05, 0.14);
      ctx.fillText(axisName(a), axx, axy);
      const [bxx, byy] = toScreen(0.14, 4.05);
      ctx.fillText(axisName(b), bxx, byy);

      let msg = '';
      const fixedList: Array<{ index: number; value: number }> = [];
      for (let d = 0; d < n; d++) {
        if (d !== a && d !== b) fixedList.push({ index: d, value: fixed[d] ?? 0 });
      }

      if (g && g.dim === n) {
        // faint shadow of the whole object onto the (a,b) plane
        const stride = Math.max(1, Math.floor(g.count / 4000));
        ctx.fillStyle = 'rgba(76,201,240,0.22)';
        for (let i = 0; i < g.count; i += stride) {
          const [px, py] = toScreen(g.points[i * n + a], g.points[i * n + b]);
          if (px < -4 || px > w + 4 || py < -4 || py > h + 4) continue;
          ctx.fillRect(px - 1, py - 1, 2, 2);
        }

        if (g.kind === 'hypercube') {
          const r = analyticSection('cube', n, 1, fixedList);
          if (r !== null) {
            ctx.strokeStyle = 'rgba(255,214,10,0.9)';
            ctx.lineWidth = 2;
            const [x0, y0] = toScreen(-r, -r);
            const [x1, y1] = toScreen(r, r);
            ctx.strokeRect(x0, y1, x1 - x0, y0 - y1);
            msg = `exact 2D section of the ${n}-cube: a square (fixed dims kept inside [−1,1])`;
          } else {
            msg = 'section empty — a fixed coordinate is outside [−1, 1]';
          }
        } else if (g.kind === 'sphere' || g.kind === 'ball') {
          const r = analyticSection(g.kind, n, g.radius ?? 1.6, fixedList);
          if (r !== null) {
            const [px, py] = toScreen(0, 0);
            ctx.strokeStyle = 'rgba(255,214,10,0.95)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(px, py, r * scale, 0, Math.PI * 2);
            if (g.kind === 'ball') {
              ctx.fillStyle = 'rgba(255,214,10,0.08)';
              ctx.fill();
            }
            ctx.stroke();
            msg =
              g.kind === 'ball'
                ? `exact section of the ${n}-ball: a disk of radius r = √(R² − Σc²) = ${r.toFixed(3)}`
                : `exact section of the (${n}-1)-sphere: a circle of radius ${r.toFixed(3)}`;
          } else {
            msg = 'section empty — Σc² exceeds R² (the slice misses the object)';
          }
        } else {
          msg = 'discrete point set — drawing its 2D shadow (points near the slice would be measure-zero)';
        }
      }

      // YOU on the slice plane
      const ux = st.user[a] ?? 0;
      const uy = st.user[b] ?? 0;
      const [uxs, uys] = toScreen(ux, uy);
      // is the user actually ON the slice?
      let onSlice = true;
      let d2 = 0;
      for (let d = 0; d < n; d++) {
        if (d !== a && d !== b) {
          const diff = (st.user[d] ?? 0) - (fixed[d] ?? 0);
          d2 += diff * diff;
          if (Math.abs(diff) > 1e-6) onSlice = false;
        }
      }
      ctx.fillStyle = '#ffd60a';
      ctx.beginPath();
      ctx.arc(uxs, uys, 6, 0, Math.PI * 2);
      ctx.fill();
      if (!onSlice) {
        ctx.strokeStyle = 'rgba(255,214,10,0.5)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(uxs, uys, 11, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillText(
        onSlice ? 'YOU (on slice)' : `YOU (off slice, d = ${Math.sqrt(d2).toFixed(2)})`,
        uxs + 10,
        uys - 8,
      );

      // fixed dims listing
      ctx.fillStyle = 'rgba(127,147,184,0.95)';
      ctx.font = '11px ui-monospace, monospace';
      const fixedNames = fixedList
        .map((f) => `${axisName(f.index)}=${(f.value ?? 0).toFixed(2)}`)
        .join('  ');
      const activeTxt = `ACTIVE: ${axisName(a)}, ${axisName(b)}   ·   FIXED: ${fixedNames || '—'}`;
      // wrap fixed list
      const words = activeTxt.split('   ·   ');
      let yy = 20;
      ctx.fillText(words[0], 12, yy);
      yy += 15;
      if (words[1]) {
        const chunks: string[] = [];
        let cur = '';
        for (const tok of words[1].split('  ')) {
          if (!tok) continue;
          const cand = cur ? cur + '  ' + tok : tok;
          if (cand.length > 78) {
            if (cur) chunks.push(cur);
            cur = tok;
          } else {
            cur = cand;
          }
        }
        if (cur.trim()) chunks.push(cur);
        for (const ch of chunks) {
          ctx.fillStyle = '#54688f';
          ctx.fillText(ch, 12, yy);
          yy += 15;
          if (yy > 90) break;
        }
      }

      if (msg) {
        ctx.fillStyle = '#9fb2d8';
        ctx.fillText(msg, 12, h - 14);
      }
    },
    [dim],
  );

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full" />
      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        <label className="lbl !mb-0.5">Active dim A</label>
        <select
          className="btn !py-1 font-mono"
          value={sliceActive[0]}
          onChange={(e) => {
            const v = Number(e.target.value);
            const cur = useAppStore.getState().sliceActive;
            useAppStore
              .getState()
              .setSliceActive([v, cur[1] === v ? (v + 1) % dim : cur[1]]);
          }}
        >
          {Array.from({ length: dim }, (_, i) => (
            <option key={i} value={i}>
              {axisName(i)}
            </option>
          ))}
        </select>
        <label className="lbl !mb-0.5">Active dim B</label>
        <select
          className="btn !py-1 font-mono"
          value={sliceActive[1]}
          onChange={(e) => {
            const v = Number(e.target.value);
            const cur = useAppStore.getState().sliceActive;
            useAppStore
              .getState()
              .setSliceActive([cur[0] === v ? (v + 1) % dim : cur[0], v]);
          }}
        >
          {Array.from({ length: dim }, (_, i) => (
            <option key={i} value={i}>
              {axisName(i)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
