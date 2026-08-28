/**
 * Bottom panel: N-DIMENSIONAL COORDINATES strip (compact mini-sliders for
 * every coordinate) and the view switcher
 * 3D VIEW | 2D VIEW | PARALLEL VIEW | SLICE VIEW | MATRIX VIEW | YOU.
 */

import { useAppStore, type ViewTab } from '../store/useAppStore';
import { axisName } from '../lib/format';

const VIEWS: Array<{ id: ViewTab; label: string }> = [
  { id: '3d', label: '3D VIEW' },
  { id: '2d', label: '2D VIEW' },
  { id: 'parallel', label: 'PARALLEL VIEW' },
  { id: 'slice', label: 'SLICE VIEW' },
  { id: 'matrix', label: 'MATRIX VIEW' },
  { id: 'you', label: 'YOU' },
];

export default function BottomBar() {
  const dim = useAppStore((s) => s.dim);
  const user = useAppStore((s) => s.user);
  const view = useAppStore((s) => s.view);
  const maxAbs = Math.max(1, ...user.slice(0, dim).map(Math.abs));

  return (
    <div className="flex items-stretch gap-2 border-t border-line bg-panel/80 px-3 py-2">
      <div className="flex items-center gap-1.5">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            className={`btn !text-[10px] ${view === v.id ? 'btn-active' : ''}`}
            onClick={() => useAppStore.getState().setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div className="mx-2 w-px bg-line" />
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        <span className="shrink-0 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-dim">
          N-dimensional coordinates
        </span>
        {user.slice(0, dim).map((v, i) => (
          <div key={i} className="flex shrink-0 items-center gap-1" title={`${axisName(i)} = ${v.toFixed(3)}`}>
            <span className="font-mono text-[9px] text-dim">{axisName(i)}</span>
            <input
              type="range"
              min={-maxAbs}
              max={maxAbs}
              step={0.01}
              value={v}
              onChange={(e) => useAppStore.getState().setUserCoord(i, Number(e.target.value))}
              className="w-10"
              aria-label={`${axisName(i)} mini slider`}
            />
            <span className="w-9 font-mono text-[9px] text-txt">{v.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
