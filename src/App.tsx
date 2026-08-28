/**
 * N-DIMENSIONAL EXPLORER — app shell.
 *
 * Layout (per spec):
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ HEADER: title · dimension selector · ENTER DIMENSION     │
 *   ├────────────┬─────────────────────────────┬───────────────┤
 *   │ CONTROLS   │       ACTIVE VIEW           │  INFORMATION  │
 *   ├────────────┴─────────────────────────────┴───────────────┤
 *   │ BOTTOM: N-DIMENSIONAL COORDINATES + view switcher        │
 *   └──────────────────────────────────────────────────────────┘
 */

import { useEffect, useRef } from 'react';
import { useAppStore } from './store/useAppStore';
import { requestGeometry } from './lib/workerClient';
import { MIN_DIM, MAX_DIM } from './lib/nd';
import Header from './components/Header';
import ControlsPanel from './components/ControlsPanel';
import InfoPanel from './components/InfoPanel';
import BottomBar from './components/BottomBar';
import View3D from './components/View3D';
import View2D from './components/View2D';
import ParallelView from './components/ParallelView';
import SliceView from './components/SliceView';
import MatrixView from './components/MatrixView';
import YouView from './components/YouView';
import MorphAnimation from './components/MorphAnimation';

export default function App() {
  const view = useAppStore((s) => s.view);
  const dim = useAppStore((s) => s.dim);

  // ---- geometry lifecycle: rebuild whenever object params change ----------
  const dim2 = useAppStore((s) => s.dim);
  const objectKind = useAppStore((s) => s.objectKind);
  const seed = useAppStore((s) => s.seed);
  const cloudCount = useAppStore((s) => s.cloudCount);
  const cloudDist = useAppStore((s) => s.cloudDist);
  const cloudRadius = useAppStore((s) => s.cloudRadius);
  const cloudClusters = useAppStore((s) => s.cloudClusters);
  const imported = useAppStore((s) => s.imported);
  const genToken = useRef(0);

  useEffect(() => {
    if (dim2 < MIN_DIM || dim2 > MAX_DIM) return;
    const token = ++genToken.current;
    useAppStore.getState().setGeometry(null, true);
    requestGeometry(
      {
        kind: objectKind,
        dim: dim2,
        seed,
        cloud: {
          dim: dim2,
          count: cloudCount,
          distribution: cloudDist,
          radius: cloudRadius,
          seed,
          clusters: cloudClusters,
        },
        imported: imported ? { points: imported.points, dim: imported.dim } : undefined,
        userPoint: useAppStore.getState().user,
        vectorEnd: [0.8, 0.6, 0.4, 0.2, ...new Array(dim2 - 4).fill(0)].slice(0, dim2),
        gridExtent: 3,
      },
      (g) => {
        if (token !== genToken.current) return; // stale
        if ('error' in g) return;
        useAppStore.getState().setGeometry(g, false);
      },
    );
  }, [dim2, objectKind, seed, cloudCount, cloudDist, cloudRadius, cloudClusters, imported]);

  // auto-pick a sensible view when the dimension changes
  useEffect(() => {
    const st = useAppStore.getState();
    if (dim === 2 && st.view !== '2d' && st.view !== 'matrix' && st.view !== 'you') {
      st.setView('2d');
    } else if (dim >= 3 && st.view === '2d' && !st.enterDimension) {
      st.setView('3d');
    }
  }, [dim]);

  return (
    <div className="flex h-full flex-col bg-ink text-txt">
      <Header />
      <div className="flex min-h-0 flex-1">
        <aside className="w-72 shrink-0 border-r border-line bg-panel/40 xl:w-80">
          <ControlsPanel />
        </aside>
        <main className="relative min-w-0 flex-1 bg-ink">
          {view === '3d' && <View3D />}
          {view === '2d' && <View2D />}
          {view === 'parallel' && <ParallelView />}
          {view === 'slice' && <SliceView />}
          {view === 'matrix' && <MatrixView />}
          {view === 'you' && <YouView />}
          <MorphAnimation />
        </main>
        <aside className="w-80 shrink-0 border-l border-line bg-panel/40">
          <InfoPanel />
        </aside>
      </div>
      <BottomBar />
    </div>
  );
}
