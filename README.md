# N-Dimensional Explorer (2D → 32D)

An interactive educational visualizer that takes you from the familiar Cartesian plane all the
way to 32-dimensional space — with **one generalized N-dimensional mathematical engine** and
**honest projections**.

> **The critical rule this app follows:** nothing is faked. Higher dimensions are never
> represented by decorative 3D effects. Every point, edge, rotation, slice and statistic is
> computed as a genuine N-dimensional vector/matrix operation. The WebGL scene is a *representation*
> — a projection of the mathematical object — and the UI says so whenever it matters
> (e.g. `4096 sampled of 2^32 vertices — exact stats shown, object is sampled`).

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 155 unit tests (vitest)
npm run build      # tsc -b && vite build
```

## What you can do

- **Dimension selector 2…32** — slider, number input, ± buttons and 2D/3D/4D/5D/8D/10D/16D/32D
  presets, with smooth transitions between dimensions.
- **Enter the Dimension ("I Am Here")** — you *are* the vector YOU = (x₁…xₙ). Edit every
  coordinate with sliders; your marker appears in the projected 3D view, the 2D shadow,
  parallel coordinates, the slice view and the coordinate matrix at once.
- **Interactive 2D plane** (N = 2): pan/zoom, grid, draw points, vectors, circles and polygons,
  live distance from the origin. For N > 2 the same view honestly shows the 2D shadow on the
  X–Y plane with the hidden coordinates stated.
- **Real-time WebGL 3D** (N ≥ 3): Orbit / First-person / Fly cameras, follow-YOU, auto-rotate,
  grid & axis toggles, your gold marker with a vector from the origin.
- **4D & beyond**: perspective projection with adjustable depth distance, cross-section (fix
  any axis, animate its value, see the *analytic* section shape — a real 2-square tesseract
  slice, a real ball slice, etc.), and rotation in any of the N(N−1)/2 planes — searchable
  (496 planes at 32D), with XW/YW/ZW highlighted in 4D.
- **One engine, arbitrary N** (no per-dimension hardcoding): addition, dot product, distance,
  norms, plane rotations, projections, cross-sections and coordinate transforms all operate on
  N-dimensional typed arrays.
- **Projection pipeline** — choose each stage: perspective, orthographic, stereographic or
  parallel/oblique. The UI shows the full path, e.g. `32D object → (Lanczos 32→8) → 8D →
  (perspective) → 3D → 2D screen`, and explains that everything after the first arrow is a
  representation, not the object.
- **Objects**: point, vector, hypercube (exact 2ᴺ vertices / N·2ⁿ⁻¹ edges; for N > 14 a
  4096-point seeded sample with a **SAMPLED** badge and *exact* statistics), N-sphere, N-ball,
  and point clouds (uniform / Gaussian / sphere / clustered, seed, radius, color by dimension,
  norm or cluster).
- **Slice mode** — fix any subset of dimensions, animate the slice value, with active vs fixed
  dimensions shown distinctly.
- **Parallel coordinates** — the primary view for 8–32D: every point is a polyline across N
  axes, draggable, color-coded.
- **Matrix view** — rows = dimensions, columns = points, heat-colored, click any cell to edit
  a coordinate.
- **"2D→32D Morph"** — the extrusion animation: 0D point → 1D → … → 32D, with live DOF,
  vertex count (2ᴺ), rotation-plane count and the actual projection math per stage.
- **Dimension Explorer** — per-dimension explanations (R¹…R³²) and an *"Explain what I'm
  seeing"* button describing exactly what the current view shows and how it is computed.
- **Presets & guided experiments** (Basic / Higher / Mathematical), **CSV import** with
  automatic dimension detection (≤ 32), dark scientific theme, 3-panel layout with a bottom
  N-dimensional coordinates strip.
- **Performance**: geometry generation and projection of large point sets run in a Web Worker;
  buffers are pre-allocated Float32Array scratch space (no per-frame allocations); hypercubes
  above 14D are never enumerated.

## Architecture

```
src/
  lib/nd/            The math engine — framework-free, fully typed, unit-tested
    point.ts         NDPoint (Float64Array-backed, dimension-tagged)
    vector.ts        add/sub/dot/cross?/norm/scale/lerp/distance
    matrix.ts        NDMatrix: rotate-in-plane, apply, transform-basis
    rotation.ts      NDRotation: Givens rotation in any (i,j) plane
    projection.ts    NDProjection: perspective / orthographic / stereographic / parallel
    crossSection.ts  NDCrossSection: fix a value, analytic ball/cube sections
    transform.ts     NDTransform: compose rotations + projections (Lanczos for N>20)
    hypercube.ts     N×2ⁿ⁻¹ edge list, exact stats, seeded sampling for large N
    sphere.ts        N-sphere / N-ball point sets (Fibonacci + rejection sampling)
    cloud.ts         uniform / gaussian / clustered point clouds (seeded)
    rng.ts           Mulberry32 seeded PRNG
  lib/
    geometry.ts      Builds NDPoint sets per object type (async, worker-friendly)
    pipeline.ts      The N→K→3 projection pipeline used by every renderer
    workerClient.ts  Promise wrapper around the Web Worker
    explain.ts       Per-dimension + per-view explanations
    csv.ts           CSV import with dim auto-detection
    colors.ts        Heat scales / category colors
  worker/ndWorker.ts Worker: geometry generation + bulk projection
  components/
    View3D.tsx       R3F scene: orbit/first-person/fly, sections, YOU marker
    View2D.tsx       Interactive Cartesian plane / honest 2D shadow
    ParallelView.tsx Parallel-coordinates canvas (primary for 8–32D)
    SliceView.tsx    Analytic cross-section canvas
    MatrixView.tsx   Dimension × point heat matrix (editable)
    YouView.tsx      "I am here": projected + coordinate + parallel + slice panels
    MorphAnimation.tsx 0D→32D extrusion morph with live stats
    ControlsPanel / InfoPanel / Header / BottomBar
  store/useAppStore.ts  Zustand: single source of truth; canvases subscribe via
                        transient updates (no per-frame React re-renders)
```

**Key design decisions**

- Math is `Float64Array`-backed with an explicit dimension tag; rendering is
  `Float32Array`-backed. The boundary is explicit.
- Givens (plane) rotations are applied in N-space **before** projection — you are rotating the
  *object*, not the picture.
- For N > 20 the N→3 reduction uses a seeded Lanczos projection (deterministic linear map) as
  the pipeline's first stage; the pipeline UI shows this honestly.
- Hypercubes with N > 14 use a 4096-vertex seeded sample and always display the **exact**
  2ᴺ / N·2ⁿ⁻¹ statistics with a "sampled, not fully rendered" badge.
- Cross-sections are **analytic** where closed forms exist (cube → lower hypercube,
  ball → lower ball) and numeric point-set filtering otherwise; the UI says which one is
  active.

## Testing

- `npx vitest run` — 155 unit tests covering the math engine (algebra, rotations, projections,
  cross-sections, hypercube stats/sampling, Lanczos), the pipeline and utilities.
- `tools/smoke.mjs` — headless-browser smoke test (Playwright + a local Chromium): 16 steps
  across every view; screenshots to `/tmp/shots/`. Run with:
  `LD_LIBRARY_PATH=... node tools/smoke.mjs` (point `executablePath` at your local Chromium).
