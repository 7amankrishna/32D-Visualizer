/**
 * Right information panel: dimension explanation, "Explain what I'm seeing",
 * exact statistics, the projection pipeline diagram, and the full
 * coordinate editor (YOU = (x₁…xₙ)).
 */

import { useMemo, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { dimensionExplanation } from '../lib/explain';
import { userNorm } from '../lib/geometry';
import { rotationPlaneCount, NDSphere } from '../lib/nd';
import { axisName, bigNumber, fmt } from '../lib/format';

export default function InfoPanel() {
  const dim = useAppStore((s) => s.dim);
  const objectKind = useAppStore((s) => s.objectKind);
  const geometry = useAppStore((s) => s.geometry);
  const user = useAppStore((s) => s.user);
  const stageDim = useAppStore((s) => s.stageDim);
  const stage1 = useAppStore((s) => s.stage1);
  const stage2 = useAppStore((s) => s.stage2);
  const explanation = useAppStore((s) => s.explanation);
  const activeDims = useAppStore((s) => s.activeDims);

  const K = Math.min(stageDim, dim);

  const sphereFacts = useMemo(() => {
    if (objectKind !== 'sphere' && objectKind !== 'ball') return null;
    const r = geometry?.radius ?? 1.6;
    return {
      area: NDSphere.surfaceArea(dim),
      volume: NDSphere.volume(dim, r),
    };
  }, [objectKind, dim, geometry]);

  return (
    <div className="flex h-full w-full flex-col gap-2 overflow-y-auto p-2.5">
      {/* dimension card */}
      <div className="panel p-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold text-txt">
            Dimension <span className="text-accent">{dim}</span>
          </h2>
          <span className="font-mono text-[10px] text-dim">
            {rotationPlaneCount(dim).toLocaleString()} rotation planes
          </span>
        </div>
        <p className="mt-1.5 text-[12px] leading-5 text-dim">{dimensionExplanation(dim)}</p>
        <button
          className="btn btn-you mt-2 w-full"
          onClick={() => useAppStore.getState().explain()}
        >
          ✨ Explain what I'm seeing
        </button>
        {explanation && (
          <div className="mt-2 rounded border border-you/25 bg-you/5 p-2 text-[11px] leading-4.5 text-txt/90">
            {explanation}
          </div>
        )}
      </div>

      {/* stats */}
      <div className="panel p-3">
        <span className="lbl">Statistics</span>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
          <dt className="text-dim">Degrees of freedom</dt>
          <dd className="text-right text-txt">{dim}</dd>
          <dt className="text-dim">Object</dt>
          <dd className="text-right text-txt">{objectKind}</dd>
          {objectKind === 'hypercube' && (
            <>
              <dt className="text-dim">Vertices (exact)</dt>
              <dd className="text-right text-txt">
                2<sup>{dim}</sup> = {bigNumber(Math.pow(2, dim))}
              </dd>
              <dt className="text-dim">Edges (exact)</dt>
              <dd className="text-right text-txt">{bigNumber(dim * Math.pow(2, dim - 1))}</dd>
              <dt className="text-dim">Shown</dt>
              <dd className="text-right text-txt">
                {geometry ? geometry.count.toLocaleString() : '…'}
                {geometry?.sampled && <span className="ml-1 text-accent2">sampled</span>}
              </dd>
            </>
          )}
          {objectKind === 'sphere' && (
            <>
              <dt className="text-dim">N-sphere area 2π^{dim / 2}/Γ</dt>
              <dd className="text-right text-txt">{sphereFacts?.area.toExponential(3)}</dd>
            </>
          )}
          {objectKind === 'ball' && (
            <>
              <dt className="text-dim">N-ball volume</dt>
              <dd className="text-right text-txt">{sphereFacts?.volume.toExponential(3)}</dd>
            </>
          )}
          {(objectKind === 'cloud' || objectKind === 'imported' || objectKind === 'grid') && (
            <>
              <dt className="text-dim">Points</dt>
              <dd className="text-right text-txt">{geometry ? geometry.count.toLocaleString() : '…'}</dd>
            </>
          )}
          <dt className="text-dim">‖YOU‖</dt>
          <dd className="text-right text-you">{userNorm(user, dim).toFixed(3)}</dd>
        </dl>
      </div>

      {/* pipeline diagram */}
      <div className="panel p-3">
        <span className="lbl">Visualization pipeline</span>
        <div className="space-y-1 font-mono text-[11px]">
          <PipeRow label={`${dim}D object`} sub={objectKind} />
          {K < dim && (
            <>
              <PipeArrow label={stage1} />
              <PipeRow label={`${K}D representation`} sub="stage 1" />
            </>
          )}
          <PipeArrow label={stage2} />
          <PipeRow label="3D space" sub={`${axisName(activeDims[0])} ${axisName(activeDims[1])} ${axisName(activeDims[2])}`} />
          <PipeArrow label="perspective camera" />
          <PipeRow label="2D screen" sub="your display" />
        </div>
        <p className="mt-2 text-[10px] leading-4 text-dim">
          The mathematical object lives in R<sup>{dim}</sup>. Everything after the first arrow is a
          <em> representation</em> — projection, not the object itself.
        </p>
      </div>

      {/* coordinate editor */}
      <CoordinateEditor />
    </div>
  );
}

function PipeRow({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between rounded border border-line bg-panel2/70 px-2 py-1">
      <span className="text-accent">{label}</span>
      {sub && <span className="text-[10px] text-dim">{sub}</span>}
    </div>
  );
}

function PipeArrow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 pl-3 text-dim">
      <span className="text-accent">↓</span>
      <span className="text-[10px]">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------

function CoordinateEditor() {
  const dim = useAppStore((s) => s.dim);
  const user = useAppStore((s) => s.user);
  const [jump, setJump] = useState(0);

  const coords = user.slice(0, dim);
  const maxAbs = Math.max(0.001, ...coords.map(Math.abs));

  return (
    <div className="panel flex min-h-0 flex-1 flex-col p-3">
      <div className="flex items-center justify-between">
        <span className="lbl !mb-0">
          N-dimensional coordinates — YOU
        </span>
        <div className="flex gap-1">
          <button
            className="btn !px-2 !py-1"
            onClick={() => useAppStore.getState().randomizeUser()}
            title="randomize all coordinates"
          >
            ⚄
          </button>
          <button className="btn !px-2 !py-1" onClick={() => useAppStore.getState().zeroUser()} title="set all to 0">
            0
          </button>
        </div>
      </div>
      {jump > 0 && (
        <button
          className="btn btn-you mt-1.5 w-full"
          onClick={() => setJump(0)}
        >
          {jump > 0 && `jumped to X${jump} — click to dismiss`}
        </button>
      )}
      <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {coords.map((v, i) => (
          <CoordRow
            key={i}
            index={i}
            value={v}
            maxAbs={maxAbs}
            onJump={() => setJump(i + 1)}
          />
        ))}
      </div>
      <p className="mt-2 border-t border-line pt-2 text-[10px] leading-4 text-dim">
        YOU = ({coords.map((c) => fmt(c, 2)).join(', ')}) · drag sliders or edit values in the
        Matrix view.
      </p>
    </div>
  );
}

function CoordRow({
  index,
  value,
  maxAbs,
  onJump,
}: {
  index: number;
  value: number;
  maxAbs: number;
  onJump: () => void;
}) {
  return (
    <div className="flex items-center gap-2" id={`coord-${index}`}>
      <button
        className="w-8 shrink-0 text-left font-mono text-[11px] text-dim hover:text-accent"
        onClick={() => {
          document.getElementById(`coord-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          onJump();
        }}
        title={`focus ${axisName(index)}`}
      >
        {axisName(index)}
      </button>
      <input
        type="range"
        min={-Math.max(1, maxAbs)}
        max={Math.max(1, maxAbs)}
        step={0.01}
        value={value}
        onChange={(e) => useAppStore.getState().setUserCoord(index, Number(e.target.value))}
        aria-label={`${axisName(index)} coordinate`}
      />
      <input
        type="number"
        step={0.1}
        value={Number(value.toFixed(3))}
        onChange={(e) => useAppStore.getState().setUserCoord(index, Number(e.target.value) || 0)}
        className="w-[70px] shrink-0 rounded border border-line bg-panel2 px-1.5 py-0.5 font-mono text-[11px] text-txt focus:border-accent focus:outline-none"
        aria-label={`${axisName(index)} value`}
      />
    </div>
  );
}
