/**
 * Top bar: title, the big dimension selector (−, number, +, slider,
 * presets), ENTER DIMENSION mode, and the dimension-morph animation.
 */

import { useAppStore } from '../store/useAppStore';
import { MIN_DIM, MAX_DIM } from '../lib/nd';

const DIM_PRESETS = [2, 3, 4, 5, 8, 10, 16, 32];

export default function Header() {
  const dim = useAppStore((s) => s.dim);
  const enterDimension = useAppStore((s) => s.enterDimension);

  return (
    <header className="flex items-center gap-4 border-b border-line bg-panel/80 px-4 py-2">
      <div className="min-w-0">
        <h1 className="truncate text-sm font-bold tracking-wide text-txt">
          N-DIMENSIONAL <span className="text-accent">EXPLORER</span>
        </h1>
        <p className="hidden truncate text-[10px] text-dim lg:block">
          2D → 32D · one mathematical engine, honest projections
        </p>
      </div>

      {/* dimension selector */}
      <div className="flex flex-1 items-center justify-center gap-3">
        <button
          className="btn !h-9 !w-9 !text-base"
          onClick={() => useAppStore.getState().setDim(dim - 1)}
          disabled={dim <= MIN_DIM}
          aria-label="decrease dimension"
        >
          −
        </button>
        <div className="text-center">
          <div className="lbl !mb-0">Dimension</div>
          <input
            type="number"
            min={MIN_DIM}
            max={MAX_DIM}
            value={dim}
            onChange={(e) => useAppStore.getState().setDim(Number(e.target.value) || MIN_DIM)}
            className="w-16 rounded-md border border-accent/50 bg-ink px-2 py-1 text-center font-mono text-xl font-bold text-accent focus:outline-none"
            aria-label="dimension"
          />
        </div>
        <button
          className="btn !h-9 !w-9 !text-base"
          onClick={() => useAppStore.getState().setDim(dim + 1)}
          disabled={dim >= MAX_DIM}
          aria-label="increase dimension"
        >
          +
        </button>
        <div className="hidden flex-col md:flex">
          <input
            type="range"
            min={MIN_DIM}
            max={MAX_DIM}
            step={1}
            value={dim}
            onChange={(e) => useAppStore.getState().setDim(Number(e.target.value))}
            className="w-40"
            aria-label="dimension slider"
          />
          <div className="mt-1 flex gap-1">
            {DIM_PRESETS.map((p) => (
              <button
                key={p}
                className={`btn !px-1.5 !py-0.5 !text-[10px] ${dim === p ? 'btn-active' : ''}`}
                onClick={() => useAppStore.getState().setDim(p)}
              >
                {p}D
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          className={`btn !text-[11px] ${enterDimension ? 'btn-you !border-you' : ''}`}
          onClick={() => {
            const st = useAppStore.getState();
            st.setEnterDimension(!st.enterDimension);
            if (!st.enterDimension) st.setView('you');
          }}
          title="show yourself inside the dimension"
        >
          {enterDimension ? '● IN THE DIMENSION' : 'ENTER DIMENSION'}
        </button>
        <button
          className="btn !text-[11px]"
          onClick={() => {
            const st = useAppStore.getState();
            st.setMorph({ open: true, playing: true, t: 0 });
          }}
        >
          2D→32D MORPH
        </button>
      </div>
    </header>
  );
}
