/**
 * Left control panel: object, projection pipeline, rotations, slice,
 * camera, appearance, presets, experiments, data import.
 */

import { useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  PROJECTION_METHODS,
  CLOUD_DISTRIBUTIONS,
  rotationPlaneCount,
  defaultAxisNames,
  type ProjectionMethod,
  type CloudDistribution,
} from '../lib/nd';
import { bigNumber, pow2 } from '../lib/format';
import { parseCSV, sampleCSV, type ImportResult } from '../lib/csv';
import type { ObjectKind } from '../lib/geometry';

const OBJECT_KINDS: Array<{ id: ObjectKind; label: string }> = [
  { id: 'point', label: 'Point' },
  { id: 'vector', label: 'Vector' },
  { id: 'hypercube', label: 'Hypercube' },
  { id: 'sphere', label: 'N-sphere' },
  { id: 'ball', label: 'N-ball' },
  { id: 'cloud', label: 'Point cloud' },
  { id: 'grid', label: 'Grid' },
  { id: 'plane', label: 'Plane' },
];

export default function ControlsPanel() {
  return (
    <div className="flex h-full w-full flex-col gap-2 overflow-y-auto p-2.5">
      <ObjectSection />
      <PipelineSection />
      <RotationSection />
      <SliceSection />
      <CameraSection />
      <AppearanceSection />
      <PresetSection />
      <ExperimentSection />
      <DataSection />
    </div>
  );
}

// ---------------------------------------------------------------------------

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="panel overflow-hidden">
      <button
        className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-dim hover:text-txt"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{title}</span>
        <span className="text-accent">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="space-y-2.5 border-t border-line px-3 py-2.5">{children}</div>}
    </div>
  );
}

function MethodSelect({
  value,
  onChange,
  label,
  allowAll = true,
}: {
  value: ProjectionMethod;
  onChange: (m: ProjectionMethod) => void;
  label: string;
  allowAll?: boolean;
}) {
  void allowAll;
  return (
    <label className="block">
      <span className="lbl">{label}</span>
      <select className="btn w-full font-mono" value={value} onChange={(e) => onChange(e.target.value as ProjectionMethod)}>
        {PROJECTION_METHODS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </label>
  );
}

// ---------------------------------------------------------------------------

function ObjectSection() {
  const dim = useAppStore((s) => s.dim);
  const kind = useAppStore((s) => s.objectKind);
  const cloudCount = useAppStore((s) => s.cloudCount);
  const cloudDist = useAppStore((s) => s.cloudDist);
  const cloudRadius = useAppStore((s) => s.cloudRadius);
  const cloudClusters = useAppStore((s) => s.cloudClusters);
  const seed = useAppStore((s) => s.seed);
  const geometry = useAppStore((s) => s.geometry);

  return (
    <Section title="Object">
      <div className="grid grid-cols-2 gap-1">
        {OBJECT_KINDS.map((k) => (
          <button
            key={k.id}
            className={`btn ${kind === k.id ? 'btn-active' : ''}`}
            onClick={() => useAppStore.getState().setObjectKind(k.id)}
          >
            {k.label}
          </button>
        ))}
      </div>
      {kind === 'hypercube' && (
        <p className="text-[11px] leading-4 text-dim">
          {dim}-cube · <span className="text-txt">{bigNumber(Math.pow(2, dim))}</span> vertices (2<sup>{dim}</sup>),{' '}
          <span className="text-txt">{bigNumber(dim * Math.pow(2, dim - 1))}</span> edges
          {geometry?.sampled && (
            <span className="ml-1 rounded bg-accent2/20 px-1 text-[10px] text-accent2">
              SAMPLED {geometry.count}
            </span>
          )}
        </p>
      )}
      {kind === 'cloud' && (
        <>
          <label className="block">
            <span className="lbl">Distribution</span>
            <select
              className="btn w-full font-mono"
              value={cloudDist}
              onChange={(e) => useAppStore.getState().setCloud({ dist: e.target.value as CloudDistribution })}
            >
              {CLOUD_DISTRIBUTIONS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="lbl">Points: {cloudCount.toLocaleString()}</span>
            <input
              type="range"
              min={50}
              max={20000}
              step={50}
              value={cloudCount}
              onChange={(e) => useAppStore.getState().setCloud({ count: Number(e.target.value) })}
            />
          </label>
          <label className="block">
            <span className="lbl">Radius: {cloudRadius.toFixed(1)}</span>
            <input
              type="range"
              min={0.5}
              max={6}
              step={0.1}
              value={cloudRadius}
              onChange={(e) => useAppStore.getState().setCloud({ radius: Number(e.target.value) })}
            />
          </label>
          {cloudDist === 'clustered' && (
            <label className="block">
              <span className="lbl">Clusters: {cloudClusters}</span>
              <input
                type="range"
                min={2}
                max={8}
                step={1}
                value={cloudClusters}
                onChange={(e) => useAppStore.getState().setCloud({ clusters: Number(e.target.value) })}
              />
            </label>
          )}
        </>
      )}
      <div className="flex items-center gap-2">
        <label className="block flex-1">
          <span className="lbl">Random seed</span>
          <input
            type="number"
            className="btn w-full font-mono"
            value={seed}
            onChange={(e) => useAppStore.getState().setSeed(Number(e.target.value) || 1)}
          />
        </label>
        <button
          className="btn self-end"
          onClick={() => useAppStore.getState().setSeed(Math.floor(Math.random() * 1e6) + 1)}
        >
          re-roll
        </button>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------

function PipelineSection() {
  const dim = useAppStore((s) => s.dim);
  const stageDim = useAppStore((s) => s.stageDim);
  const stage1 = useAppStore((s) => s.stage1);
  const stage2 = useAppStore((s) => s.stage2);
  const dist = useAppStore((s) => s.perspectiveDistance);
  const activeDims = useAppStore((s) => s.activeDims);

  const K = Math.min(stageDim, dim);

  return (
    <Section title="Projection Pipeline">
      <p className="font-mono text-[11px] leading-4 text-dim">
        <span className="text-accent">{dim}D</span> object →{' '}
        {K < dim ? <span className="text-accent">{K}D</span> + ' → ' : '(identity) → '}
        <span className="text-accent">3D</span> → <span className="text-txt">2D screen</span>
      </p>
      <label className="block">
        <span className="lbl">Intermediate dimension K: {K}</span>
        <input
          type="range"
          min={3}
          max={dim}
          step={1}
          value={K}
          onChange={(e) => useAppStore.getState().setStageDim(Number(e.target.value))}
          aria-label="intermediate dimension"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <MethodSelect
          label={`Stage 1 (${dim}D→${K}D)`}
          value={stage1}
          onChange={(m) => useAppStore.getState().setStage1(m)}
        />
        <MethodSelect
          label={`Stage 2 (${K}D→3D)`}
          value={stage2}
          onChange={(m) => useAppStore.getState().setStage2(m)}
        />
      </div>
      <label className="block">
        <span className="lbl">Perspective distance: {dist.toFixed(1)}</span>
        <input
          type="range"
          min={1.5}
          max={15}
          step={0.1}
          value={dist}
          onChange={(e) => useAppStore.getState().setPerspectiveDistance(Number(e.target.value))}
        />
      </label>
      <div>
        <span className="lbl">Visible 3D axes (of the {K}D space)</span>
        <div className="grid grid-cols-3 gap-1.5">
          {activeDims.map((d, i) => (
            <select
              key={i}
              className="btn font-mono"
              value={d}
              onChange={(e) => {
                const next = [...activeDims] as [number, number, number];
                next[i] = Number(e.target.value);
                useAppStore.getState().setActiveDims(next);
              }}
              aria-label={`visible axis ${i + 1}`}
            >
              {Array.from({ length: K }, (_, j) => (
                <option key={j} value={j}>
                  {defaultAxisNames(K)[j]}
                </option>
              ))}
            </select>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------

function RotationSection() {
  const dim = useAppStore((s) => s.dim);
  const rotations = useAppStore((s) => s.rotations);
  const [filter, setFilter] = useState('');
  const [showAll, setShowAll] = useState(false);

  const allPlanes = useMemo(() => {
    const out: Array<[number, number]> = [];
    for (let a = 0; a < dim; a++) for (let b = a + 1; b < dim; b++) out.push([a, b]);
    return out;
  }, [dim]);

  const names = useMemo(() => defaultAxisNames(dim), [dim]);
  const filtered = useMemo(() => {
    if (!filter.trim()) return allPlanes;
    const f = filter.trim().toLowerCase();
    return allPlanes.filter(([a, b]) => {
      const label = `${names[a]}${names[b]}`.toLowerCase();
      return label.includes(f) || label.replace(/x/g, '').includes(f.replace(/x/g, ''));
    });
  }, [filter, allPlanes, names]);

  const visiblePlanes = showAll ? filtered : filtered.slice(0, 48);

  return (
    <Section title={`Rotation (${bigNumber(rotationPlaneCount(dim))} planes)`}>
      <div className="flex gap-1.5">
        <input
          className="btn w-full font-mono"
          placeholder={`filter planes… (e.g. ${dim >= 4 ? 'W' : 'Z'})`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="filter rotation planes"
        />
      </div>
      {filtered.length > 48 && (
        <button className="btn w-full" onClick={() => setShowAll((v) => !v)}>
          {showAll ? `show first 48 of ${filtered.length}` : `show all ${filtered.length}`}
        </button>
      )}
      <div className="grid max-h-40 grid-cols-4 gap-1 overflow-y-auto">
        {visiblePlanes.map(([a, b]) => {
          const active = rotations.some((r) => r.a === a && r.b === b);
          return (
            <button
              key={`${a}-${b}`}
              className={`btn !px-1 font-mono text-[10px] ${active ? 'btn-active' : ''}`}
              onClick={() => {
                const st = useAppStore.getState();
                if (active) st.removeRotation(rotations.find((r) => r.a === a && r.b === b)!.id);
                else st.addRotation(a, b);
              }}
              title={`rotate in ${names[a]}–${names[b]}`}
            >
              {names[a]}
              {names[b]}
            </button>
          );
        })}
      </div>

      {rotations.length > 0 && (
        <div className="space-y-2 border-t border-line pt-2">
          <span className="lbl">Active rotations</span>
          {rotations.map((r) => (
            <div key={r.id} className="rounded border border-line/60 bg-panel2/50 p-2">
              <div className="mb-1 flex items-center justify-between font-mono text-[11px]">
                <span className="text-accent">
                  {names[r.a]}–{names[r.b]}
                </span>
                <span className="text-dim">θ = {((r.angle * 180) / Math.PI % 360).toFixed(1)}°</span>
                <button className="text-dim hover:text-txt" onClick={() => useAppStore.getState().removeRotation(r.id)} aria-label="remove rotation">
                  ✕
                </button>
              </div>
              <input
                type="range"
                min={-3.1416}
                max={3.1416}
                step={0.01}
                value={r.angle}
                onChange={(e) => useAppStore.getState().setRotationAngle(r.id, Number(e.target.value))}
                aria-label={`rotation angle ${names[r.a]} ${names[r.b]}`}
              />
              <div className="mt-1 flex items-center gap-2">
                <button
                  className={`btn flex-1 ${r.animating ? 'btn-active' : ''}`}
                  onClick={() => useAppStore.getState().toggleRotationAnim(r.id)}
                >
                  {r.animating ? '⏸ animating' : '▶ animate'}
                </button>
                <input
                  type="range"
                  min={0.05}
                  max={2}
                  step={0.05}
                  value={r.speed}
                  onChange={(e) => useAppStore.getState().setRotationSpeed(r.id, Number(e.target.value))}
                  className="w-20"
                  aria-label="rotation speed"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------

function SliceSection() {
  const dim = useAppStore((s) => s.dim);
  const showSection = useAppStore((s) => s.showSection);
  const sliceAxis = useAppStore((s) => s.sliceAxis);
  const sliceValues = useAppStore((s) => s.sliceValues);
  const animateSlice = useAppStore((s) => s.animateSlice);
  const names = useMemo(() => defaultAxisNames(dim), [dim]);

  return (
    <Section title="Slice / Cross-section">
      <label className="flex items-center gap-2 text-[12px]">
        <input
          type="checkbox"
          checked={showSection}
          onChange={(e) => useAppStore.getState().setShowSection(e.target.checked)}
          className="accent-[#ffd60a]"
        />
        <span>
          Show cross-section in 3D view{' '}
          <span className="text-dim">(analytic when unrotated, numeric otherwise)</span>
        </span>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="lbl">Slice axis</span>
          <select
            className="btn w-full font-mono"
            value={sliceAxis}
            onChange={(e) => useAppStore.getState().setSliceAxis(Number(e.target.value))}
          >
            {names.map((n, i) => (
              <option key={i} value={i}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="lbl">
            {names[sliceAxis]} value: {(sliceValues[sliceAxis] ?? 0).toFixed(2)}
          </span>
          <input
            type="range"
            min={-1.5}
            max={1.5}
            step={0.01}
            value={sliceValues[sliceAxis] ?? 0}
            onChange={(e) => useAppStore.getState().setSliceValue(sliceAxis, Number(e.target.value))}
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-[12px]">
        <input
          type="checkbox"
          checked={animateSlice}
          onChange={(e) => useAppStore.getState().setAnimateSlice(e.target.checked)}
          className="accent-[#ffd60a]"
        />
        <span>
          Animate slice {names[sliceAxis]} (−1.3 → +1.3)
        </span>
      </label>
      <p className="text-[11px] leading-4 text-dim">
        Every dimension NOT in the visible axes is fixed at its value here. The 3D view shows the
        object intersecting that affine subspace; the Slice tab shows the exact 2D section.
      </p>
    </Section>
  );
}

// ---------------------------------------------------------------------------

function CameraSection() {
  const cameraMode = useAppStore((s) => s.cameraMode);
  const followYou = useAppStore((s) => s.followYou);
  const autoRotate = useAppStore((s) => s.autoRotate);
  const showGrid = useAppStore((s) => s.showGrid);
  const showAxes = useAppStore((s) => s.showAxes);
  const dim = useAppStore((s) => s.dim);

  return (
    <Section title="Camera (3D view)" defaultOpen={dim >= 3}>
      <div className="grid grid-cols-3 gap-1">
        {(['orbit', 'first', 'fly'] as const).map((m) => (
          <button
            key={m}
            className={`btn ${cameraMode === m ? 'btn-active' : ''}`}
            onClick={() => useAppStore.getState().setCameraMode(m)}
            disabled={dim < 3 && m !== 'orbit'}
          >
            {m === 'orbit' ? 'Orbit' : m === 'first' ? 'First-person' : 'Fly'}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <label className="flex items-center gap-2 text-[12px]">
          <input type="checkbox" checked={followYou} onChange={() => useAppStore.getState().toggle('followYou')} className="accent-[#4cc9f0]" />
          Follow YOU
        </label>
        <label className="flex items-center gap-2 text-[12px]">
          <input type="checkbox" checked={autoRotate} onChange={() => useAppStore.getState().toggle('autoRotate')} className="accent-[#4cc9f0]" />
          Auto-rotate
        </label>
        <label className="flex items-center gap-2 text-[12px]">
          <input type="checkbox" checked={showGrid} onChange={() => useAppStore.getState().toggle('showGrid')} className="accent-[#4cc9f0]" />
          Grid
        </label>
        <label className="flex items-center gap-2 text-[12px]">
          <input type="checkbox" checked={showAxes} onChange={() => useAppStore.getState().toggle('showAxes')} className="accent-[#4cc9f0]" />
          Axes
        </label>
      </div>
      <p className="text-[11px] leading-4 text-dim">
        First-person: the camera becomes YOUR projected position — W/A/S/D move you in the visible
        axes, Q/E move you through the hidden dimension (X₄/W).
      </p>
    </Section>
  );
}

// ---------------------------------------------------------------------------

function AppearanceSection() {
  const colorMode = useAppStore((s) => s.colorMode);
  const colorCoord = useAppStore((s) => s.colorCoord);
  const pointSize = useAppStore((s) => s.pointSize);
  const lineOpacity = useAppStore((s) => s.lineOpacity);
  const dim = useAppStore((s) => s.dim);
  const names = useMemo(() => defaultAxisNames(dim), [dim]);

  return (
    <Section title="Appearance" defaultOpen={false}>
      <label className="block">
        <span className="lbl">Color points by</span>
        <select
          className="btn w-full font-mono"
          value={colorMode}
          onChange={(e) => useAppStore.getState().setColor({ mode: e.target.value as 'uniform' | 'coordinate' | 'norm' | 'cluster' })}
        >
          <option value="uniform">uniform</option>
          <option value="coordinate">coordinate value</option>
          <option value="norm">distance from origin</option>
          <option value="cluster">cluster</option>
        </select>
      </label>
      {colorMode === 'coordinate' && (
        <label className="block">
          <span className="lbl">Which coordinate</span>
          <select
            className="btn w-full font-mono"
            value={colorCoord}
            onChange={(e) => useAppStore.getState().setColor({ coord: Number(e.target.value) })}
          >
            {names.map((n, i) => (
              <option key={i} value={i}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block">
        <span className="lbl">Point size: {pointSize.toFixed(1)}</span>
        <input
          type="range"
          min={0.5}
          max={6}
          step={0.1}
          value={pointSize}
          onChange={(e) => useAppStore.getState().setColor({ size: Number(e.target.value) })}
        />
      </label>
      <label className="block">
        <span className="lbl">Line opacity: {(lineOpacity * 100).toFixed(0)}%</span>
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={lineOpacity}
          onChange={(e) => useAppStore.getState().setColor({ opacity: Number(e.target.value) })}
        />
      </label>
    </Section>
  );
}

// ---------------------------------------------------------------------------

const PRESETS: Array<{ group: string; items: Array<{ id: string; label: string }> }> = [
  {
    group: 'Basic',
    items: [
      { id: 'point', label: 'Point' },
      { id: 'vector', label: 'Vector' },
      { id: 'plane', label: 'Plane' },
      { id: 'cube', label: 'Cube' },
    ],
  },
  {
    group: 'Higher dimension',
    items: [
      { id: 'tesseract', label: 'Tesseract (4D)' },
      { id: 'cube5', label: '5-cube' },
      { id: 'cube6', label: '6-cube' },
      { id: 'cube8', label: '8-cube' },
      { id: 'cube10', label: '10-cube' },
      { id: 'cube16', label: '16-cube' },
      { id: 'cube32', label: '32-cube' },
    ],
  },
  {
    group: 'Mathematical',
    items: [
      { id: 'nsphere', label: 'N-sphere' },
      { id: 'nball', label: 'N-ball' },
      { id: 'ngrid', label: 'N-grid' },
      { id: 'ncloud', label: 'Random N-cloud' },
    ],
  },
];

function PresetSection() {
  return (
    <Section title="Presets" defaultOpen={false}>
      {PRESETS.map((g) => (
        <div key={g.group}>
          <span className="lbl">{g.group}</span>
          <div className="grid grid-cols-2 gap-1">
            {g.items.map((it) => (
              <button key={it.id} className="btn" onClick={() => useAppStore.getState().applyPreset(it.id)}>
                {it.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </Section>
  );
}

const EXPERIMENTS = [
  'Rotate a tesseract through XW',
  'Move through the 4th dimension',
  'Slice a 5D sphere',
  'Compare 3D and 4D cubes',
  'Explore a 10D point cloud',
  'Explore your 32-dimensional vector',
];

function ExperimentSection() {
  return (
    <Section title="Experiments" defaultOpen={false}>
      {EXPERIMENTS.map((e, i) => (
        <button key={i} className="btn w-full text-left" onClick={() => useAppStore.getState().applyExperiment(i + 1)}>
          {i + 1}. {e}
        </button>
      ))}
    </Section>
  );
}

// ---------------------------------------------------------------------------

function DataSection() {
  const importInfo = useAppStore((s) => s.importInfo);
  const imported = useAppStore((s) => s.imported);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const onFile = async (f: File) => {
    try {
      const text = await f.text();
      const res: ImportResult = parseCSV(text);
      useAppStore
        .getState()
        .setImported(
          f.name,
          res.dim,
          res.points,
          `Detected dimension: ${res.dim}D · ${res.points.length / res.dim} points${res.skipped ? ` · ${res.skipped} skipped` : ''}${res.truncated ? ' · truncated' : ''}`,
        );
    } catch (err) {
      useAppStore
        .getState()
        .setImported(
          f.name,
          2,
          [],
          `Import failed: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
  };

  return (
    <Section title="Data import" defaultOpen={false}>
      <p className="text-[11px] leading-4 text-dim">
        Upload a CSV where each row is one N-dimensional point (up to 32 dims, 50 000 points).
        Dimensionality is detected automatically.
      </p>
      <div className="flex gap-1.5">
        <button className="btn flex-1" onClick={() => fileRef.current?.click()}>
          Upload CSV
        </button>
        <button
          className="btn flex-1"
          onClick={() => {
            const res = parseCSV(sampleCSV());
            useAppStore
              .getState()
              .setImported('sample-5d.csv', res.dim, res.points, `Detected dimension: ${res.dim}D · 12 points`);
          }}
        >
          Load sample (5D)
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.tsv,.txt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = '';
        }}
      />
      {imported && (
        <div className="rounded border border-line bg-panel2/60 p-2 text-[11px]">
          <div className="font-mono text-txt">{imported.name}</div>
          <div className="mt-0.5 text-dim">{importInfo}</div>
          <button className="btn mt-1.5 w-full" onClick={() => useAppStore.getState().clearImported()}>
            Clear dataset
          </button>
        </div>
      )}
      {imported && imported.points.length > 0 && (
        <p className="font-mono text-[10px] text-dim">
          2<sup>{imported.dim}</sup> = {pow2(imported.dim)} possible grid cells
        </p>
      )}
    </Section>
  );
}
