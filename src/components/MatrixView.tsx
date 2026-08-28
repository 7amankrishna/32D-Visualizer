/**
 * Matrix view: the coordinate matrix — rows are dimensions, columns are
 * points (YOU first, then sample points of the object). Cell colors encode
 * coordinate values with a diverging scale. Editing the YOU column edits
 * your position directly.
 */

import { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { axisName, fmt } from '../lib/format';
import { diverging } from '../lib/colors';

export default function MatrixView() {
  const dim = useAppStore((s) => s.dim);
  const user = useAppStore((s) => s.user);
  const geometry = useAppStore((s) => s.geometry);
  const setUserCoord = useAppStore((s) => s.setUserCoord);

  const sampleIdx = useMemo(() => {
    if (!geometry || geometry.count < 2) return [] as number[];
    const out: number[] = [];
    const n = Math.min(6, geometry.count);
    for (let i = 0; i < n; i++) out.push(Math.floor((i * geometry.count) / n));
    return out;
  }, [geometry]);

  const maxAbs = useMemo(() => {
    let m = 0.001;
    for (let k = 0; k < dim; k++) m = Math.max(m, Math.abs(user[k] ?? 0));
    if (geometry && geometry.dim === dim) {
      const stride = Math.max(1, Math.floor(geometry.count / 2000));
      for (let i = 0; i < geometry.count; i += stride) {
        for (let k = 0; k < dim; k++) m = Math.max(m, Math.abs(geometry.points[i * dim + k]));
      }
    }
    return m;
  }, [user, geometry, dim]);

  const cellStyle = (v: number): React.CSSProperties => {
    const [r, g, b] = diverging(v / maxAbs);
    return {
      backgroundColor: `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},0.16)`,
      color: `rgb(${Math.round(40 + r * 200)},${Math.round(40 + g * 200)},${Math.round(60 + b * 190)})`,
    };
  };

  return (
    <div className="h-full w-full overflow-auto p-4">
      <div className="mb-3 flex items-center gap-4 text-[11px] text-dim">
        <span>
          rows = dimensions X₁…X<sub>{dim}</sub> · columns = points
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: 'rgba(35,70,220,0.5)' }} />
          negative
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm bg-white/20" /> zero
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: 'rgba(240,70,140,0.5)' }} />
          positive
        </span>
        <span>· click a gold cell to edit your coordinate</span>
      </div>
      <table className="border-collapse font-mono text-[11px]">
        <thead>
          <tr>
            <th className="sticky top-0 border border-line bg-panel px-2 py-1.5 text-left text-dim">dim</th>
            <th className="sticky top-0 border border-you/40 bg-you/10 px-2 py-1.5 text-you">YOU</th>
            {sampleIdx.map((i, k) => (
              <th key={k} className="sticky top-0 border border-line bg-panel px-2 py-1.5 text-dim">
                P{String.fromCharCode(65 + k)}
                <span className="text-[9px] opacity-60"> #{i}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: dim }, (_, d) => (
            <tr key={d}>
              <td className="whitespace-nowrap border border-line bg-panel px-2 py-1 text-dim">
                {axisName(d)}
              </td>
              <td className="border border-you/30 bg-you/5 px-1 py-0.5">
                <input
                  type="number"
                  step={0.1}
                  value={Number((user[d] ?? 0).toFixed(3))}
                  style={cellStyle(user[d] ?? 0)}
                  onChange={(e) => setUserCoord(d, Number(e.target.value) || 0)}
                  className="w-20 rounded border border-transparent bg-transparent px-1 py-0.5 font-mono text-[11px] text-you focus:border-you/60 focus:outline-none"
                  aria-label={`your ${axisName(d)} coordinate`}
                />
              </td>
              {sampleIdx.map((i, k) => (
                <td
                  key={k}
                  className="px-2 py-1 text-center"
                  style={cellStyle(geometry && geometry.dim === dim ? geometry.points[i * dim + d] : 0)}
                >
                  {geometry && geometry.dim === dim ? fmt(geometry.points[i * dim + d]) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
