/**
 * The 3D WebGL view.
 * Renders the N-dimensional object via the shared pipeline
 * (N → K → 3 → camera → screen), plus the YOU marker and an optional
 * cross-section. Camera modes: orbit, first-person (the camera IS the
 * user's projected position) and fly.
 *
 * All per-frame work happens in a single useFrame callback reading the
 * store via getState() — React never re-renders during animation.
 */

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useAppStore, planeList } from '../store/useAppStore';
import { buildPipeline, type Pipeline } from '../lib/pipeline';
import { computeColors } from '../lib/colors';
import { boundingRadius, analyticSection } from '../lib/nd';
import { geometryScale, type Geometry } from '../lib/geometry';
import { makeTextSprite, disposeSprite } from '../lib/three/textSprite';
import { axisName } from '../lib/format';

const MAX_POINTS = 20000;
const MAX_EDGE_PAIRS = 100000;
const SECTION_EPS2 = 0.08 * 0.08;

// ---------------------------------------------------------------------------

function Axes() {
  const group = useMemo(() => {
    const g = new THREE.Group();
    const defs: Array<[THREE.Vector3, string, string]> = [
      [new THREE.Vector3(1, 0, 0), '#f0506e', axisName(0)],
      [new THREE.Vector3(0, 1, 0), '#43d98a', axisName(1)],
      [new THREE.Vector3(0, 0, 1), '#4cc9f0', axisName(2)],
    ];
    for (const [dir, color, label] of defs) {
      const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(), 3.2, color, 0.3, 0.14);
      g.add(arrow);
      const sp = makeTextSprite(label, color);
      sp.position.copy(dir.clone().multiplyScalar(3.8));
      g.add(sp);
    }
    return g;
  }, []);

  useEffect(
    () => () => {
      group.traverse((o) => {
        if (o instanceof THREE.Sprite) disposeSprite(o);
      });
    },
    [group],
  );

  return <primitive object={group} />;
}

// ---------------------------------------------------------------------------

function SceneInner({
  hudRef,
}: {
  hudRef: React.MutableRefObject<HTMLDivElement | null>;
}) {
  const { camera, gl } = useThree();

  // ---- persistent buffers (allocated once) --------------------------------
  const posBufRef = useRef(new Float32Array(MAX_POINTS * 3));
  const colBufRef = useRef(new Float32Array(MAX_POINTS * 3));
  const visRef = useRef(new Uint8Array(MAX_POINTS));
  const lastProjRef = useRef(new Float32Array(MAX_POINTS * 3)); // original-order projection
  const origColRef = useRef(new Float32Array(MAX_POINTS * 3)); // original-order colors
  const linePosRef = useRef(new Float32Array(MAX_EDGE_PAIRS * 2 * 3));
  const lineColRef = useRef(new Float32Array(MAX_EDGE_PAIRS * 2 * 3));
  const sectionPosRef = useRef(new Float32Array(MAX_POINTS * 3));
  const userVecRef = useRef(new Float64Array(32));
  const rotatedRef = useRef<Float64Array | null>(null);
  const pipelineRef = useRef<Pipeline | null>(null);
  const structSigRef = useRef('');
  const angleSigRef = useRef('');
  const userSigRef = useRef('');
  const sliceSigRef = useRef('');
  const geoIdRef = useRef<unknown>(null);
  const sliceTime = useRef(0);
  const lastHud = useRef(0);

  const orbit = useRef({ r: 10, theta: 0.7, phi: 1.1, target: new THREE.Vector3() });
  const fp = useRef({ yaw: 0, pitch: 0 });
  const flyPos = useRef(new THREE.Vector3(0, 0, 9));
  const flyInit = useRef(false);
  const flyLook = useRef({ yaw: 0, pitch: 0 });
  const keys = useRef<Record<string, boolean>>({});

  const boxRef = useRef<THREE.LineSegments | null>(null);
  const sectionSphereRef = useRef<THREE.Mesh | null>(null);
  const youRef = useRef<THREE.Group | null>(null);

  // ---- persistent three.js objects ----------------------------------------
  const grid = useMemo(() => new THREE.GridHelper(12, 12, 0x2a3c66, 0x141d33), []);

  const pointsGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(posBufRef.current, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(colBufRef.current, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    return g;
  }, []);
  const linesGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(linePosRef.current, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(lineColRef.current, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    return g;
  }, []);
  const sectionGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(sectionPosRef.current, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    return g;
  }, []);

  const pointsMat = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.07,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        sizeAttenuation: true,
      }),
    [],
  );
  const linesMat = useMemo(
    () => new THREE.LineBasicMaterial({ transparent: true, opacity: 0.5 }),
    [],
  );
  const sectionMat = useMemo(
    () => new THREE.PointsMaterial({ size: 0.09, color: 0xffd60a, transparent: true, opacity: 0.9 }),
    [],
  );
  const boxMat = useMemo(
    () => new THREE.LineBasicMaterial({ color: 0xffd60a, transparent: true, opacity: 0.55 }),
    [],
  );
  const sectionSphereMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: 0xffd60a,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
      }),
    [],
  );
  const youVecMat = useMemo(
    () => new THREE.LineBasicMaterial({ color: 0xffd60a, transparent: true, opacity: 0.35 }),
    [],
  );

  const youGroup = useMemo(() => {
    const g = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xffd60a }),
    );
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xffd60a, transparent: true, opacity: 0.25 }),
    );
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.02, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xffd60a, transparent: true, opacity: 0.7 }),
    );
    ring.rotation.x = Math.PI / 2;
    const label = makeTextSprite('YOU', '#ffd60a');
    label.position.set(0, 0.62, 0);
    g.add(core, halo, ring, label);
    return g;
  }, []);

  const youVectorGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    return g;
  }, []);
  const youLine = useMemo(
    () => new THREE.Line(youVectorGeom, youVecMat),
    [youVectorGeom, youVecMat],
  );

  const boxGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const v = 1;
    const e = [
      [-v, -v, -v], [v, -v, -v], [v, v, -v], [-v, v, -v],
      [-v, -v, v], [v, -v, v], [v, v, v], [-v, v, v],
    ];
    const idx = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7];
    const arr = new Float32Array(idx.length * 3);
    idx.forEach((ei, i) => {
      arr[i * 3] = e[ei][0];
      arr[i * 3 + 1] = e[ei][1];
      arr[i * 3 + 2] = e[ei][2];
    });
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return g;
  }, []);

  const sectionSphereGeom = useMemo(() => new THREE.SphereGeometry(1, 28, 18), []);

  // ---- store values that SHOULD trigger re-renders (visual params only) ----
  const showGrid = useAppStore((st) => st.showGrid);
  const showAxes = useAppStore((st) => st.showAxes);
  const cameraMode = useAppStore((st) => st.cameraMode);
  const pointSize = useAppStore((st) => st.pointSize);
  const lineOpacity = useAppStore((st) => st.lineOpacity);
  const geometry = useAppStore((st) => st.geometry);

  useEffect(() => {
    pointsMat.size = 0.03 + pointSize * 0.028;
    linesMat.opacity = lineOpacity;
  }, [pointSize, lineOpacity, pointsMat, linesMat]);

  // re-fit orbit radius when a new object arrives
  useEffect(() => {
    if (geometry) {
      const sc = geometryScale({ points: geometry.points } as Geometry);
      orbit.current.r = Math.max(4, sc * 2.6);
    }
  }, [geometry]);

  // ---- input -----------------------------------------------------------------
  useEffect(() => {
    const el = gl.domElement;
    const drag = { on: false, btn: 0, x: 0, y: 0 };
    const onDown = (e: PointerEvent) => {
      drag.on = true;
      drag.btn = e.button;
      drag.x = e.clientX;
      drag.y = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      const st = useAppStore.getState();
      if (document.pointerLockElement === el) {
        fp.current.yaw -= e.movementX * 0.0022;
        fp.current.pitch = Math.max(-1.45, Math.min(1.45, fp.current.pitch - e.movementY * 0.0022));
        return;
      }
      if (!drag.on) return;
      if (st.cameraMode === 'orbit') {
        const o = orbit.current;
        if (drag.btn === 2 || e.shiftKey) {
          const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
          const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
          o.target.addScaledVector(right, -dx * o.r * 0.0011);
          o.target.addScaledVector(up, dy * o.r * 0.0011);
        } else {
          o.theta -= dx * 0.0052;
          o.phi = Math.max(0.06, Math.min(Math.PI - 0.06, o.phi - dy * 0.0052));
        }
      } else if (st.cameraMode === 'fly') {
        flyLook.current.yaw -= dx * 0.004;
        flyLook.current.pitch = Math.max(-1.45, Math.min(1.45, flyLook.current.pitch - dy * 0.004));
      }
    };
    const onUp = (e: PointerEvent) => {
      drag.on = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const st = useAppStore.getState();
      if (st.cameraMode === 'orbit') {
        const o = orbit.current;
        o.r = Math.max(1.2, Math.min(80, o.r * Math.exp(e.deltaY * 0.0012)));
      }
    };
    const onClick = () => {
      const st = useAppStore.getState();
      if (st.cameraMode === 'first' && document.pointerLockElement !== el) {
        el.requestPointerLock();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = e.type === 'keydown';
    };
    const onContext = (e: Event) => e.preventDefault();
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('click', onClick);
    el.addEventListener('contextmenu', onContext);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('click', onClick);
      el.removeEventListener('contextmenu', onContext);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, [gl, camera]);

  // ---- main frame loop ----------------------------------------------------------
  useFrame((_, rawDt) => {
    const st = useAppStore.getState();
    const dt = Math.min(rawDt, 0.05);
    const dim = st.dim;

    // 1) animations
    for (const r of st.rotations) {
      if (r.animating) st.setRotationAngle(r.id, r.angle + r.speed * dt);
    }
    if (st.animateSlice) {
      sliceTime.current += dt;
      st.setSliceValue(st.sliceAxis, Math.sin(sliceTime.current * 0.7) * 1.3);
    }

    // 2) pipeline (rebuild only on structural changes; otherwise mutate angles)
    const structSig = [
      dim, st.stageDim, st.stage1, st.stage2, st.perspectiveDistance,
      st.activeDims.join(','), st.rotations.length,
      st.rotations.map((r) => `${r.a},${r.b}`).join(';'), st.seed,
    ].join('|');
    if (structSig !== structSigRef.current) {
      structSigRef.current = structSig;
      angleSigRef.current = 'reset'; // force one full recompute
      pipelineRef.current =
        dim >= 3
          ? buildPipeline({
              dim,
              stageDim: st.stageDim,
              stage1: st.stage1,
              stage2: st.stage2,
              perspectiveDistance: st.perspectiveDistance,
              activeDims: st.activeDims,
              seed: st.seed,
              rotations: planeList(st),
            })
          : null;
    } else if (pipelineRef.current) {
      const planes = pipelineRef.current.rotation.planes;
      st.rotations.forEach((r, i) => {
        if (planes[i]) planes[i].angle = r.angle;
      });
    }

    // 3) user vector
    const userSig = st.user.slice(0, dim).map((v) => v.toFixed(4)).join(',');
    if (userSig !== userSigRef.current) {
      userSigRef.current = userSig;
      userVecRef.current.set(st.user.slice(0, dim));
    }

    // 4) projection
    const g = st.geometry;
    if (g && g.dim === dim) {
      const count = Math.min(g.count, MAX_POINTS);
      const n = g.dim;
      const angleSig = st.rotations.map((r) => r.angle.toFixed(5)).join(',');
      const sliceSig = st.showSection
        ? st.sliceValues.slice(0, dim).map((v) => v.toFixed(4)).join(',')
        : 'off';
      const rebuilt = angleSigRef.current === 'reset';
      const geoChanged = geoIdRef.current !== g;
      if (geoChanged) {
        geoIdRef.current = g;
        rotatedRef.current = null;
      }
      const needsProject =
        rebuilt || geoChanged || angleSig !== angleSigRef.current || sliceSig !== sliceSigRef.current;

      if (n === 2) {
        // 2D object lives on the z=0 plane of the 3D scene
        for (let i = 0; i < count; i++) {
          posBufRef.current[i * 3] = g.points[i * 2];
          posBufRef.current[i * 3 + 1] = g.points[i * 2 + 1];
          posBufRef.current[i * 3 + 2] = 0;
          lastProjRef.current[i * 3] = posBufRef.current[i * 3];
          lastProjRef.current[i * 3 + 1] = posBufRef.current[i * 3 + 1];
          lastProjRef.current[i * 3 + 2] = 0;
        }
        pointsGeom.setDrawRange(0, count);
        (pointsGeom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        const col = computeColors(g.points, 2, st.colorMode, st.colorCoord, boundingRadius(g.points, 2), g.cluster);
        colBufRef.current.set(col.subarray(0, count * 3));
        origColRef.current.set(col.subarray(0, count * 3));
        (pointsGeom.attributes.color as THREE.BufferAttribute).needsUpdate = true;
        visRef.current.fill(1, 0, count);
        writeEdges(g, count, lastProjRef.current, visRef.current);
        angleSigRef.current = angleSig;
        sliceSigRef.current = sliceSig;
        updateSection(g, n, g.points, st);
        updateYou(null);
      } else {
        const pipe = pipelineRef.current;
        if (pipe && needsProject) {
          // rotated coordinates (for color encoding of hidden dims)
          let srcPts = g.points;
          if (st.rotations.length > 0) {
            const need = count * n;
            if (!rotatedRef.current || rotatedRef.current.length !== need) {
              rotatedRef.current = new Float64Array(need);
            }
            pipe.rotateBuffer(g.points.subarray(0, need), rotatedRef.current);
            srcPts = rotatedRef.current;
          }
          // project all (original order)
          pipe.projectBuffer(g.points.subarray(0, count * n), posBufRef.current, visRef.current);
          lastProjRef.current.set(posBufRef.current.subarray(0, count * 3));
          // compact visible points to the front
          let shown = 0;
          for (let i = 0; i < count; i++) {
            if (!visRef.current[i]) continue;
            const s3 = i * 3;
            const d3 = shown * 3;
            posBufRef.current[d3] = posBufRef.current[s3];
            posBufRef.current[d3 + 1] = posBufRef.current[s3 + 1];
            posBufRef.current[d3 + 2] = posBufRef.current[s3 + 2];
            shown++;
          }
          pointsGeom.setDrawRange(0, shown);
          (pointsGeom.attributes.position as THREE.BufferAttribute).needsUpdate = true;

          const maxNorm = boundingRadius(srcPts.subarray(0, count * n), n);
          const col = computeColors(srcPts.subarray(0, count * n), n, st.colorMode, st.colorCoord, maxNorm, g.cluster);
          // keep an original-order color copy for edge coloring
          origColRef.current.set(col.subarray(0, count * 3));
          let c = 0;
          for (let i = 0; i < count; i++) {
            if (!visRef.current[i]) continue;
            colBufRef.current[c * 3] = col[i * 3];
            colBufRef.current[c * 3 + 1] = col[i * 3 + 1];
            colBufRef.current[c * 3 + 2] = col[i * 3 + 2];
            c++;
          }
          (pointsGeom.attributes.color as THREE.BufferAttribute).needsUpdate = true;

          writeEdges(g, count, lastProjRef.current, visRef.current);
          updateSection(g, n, srcPts, st);
          angleSigRef.current = angleSig;
          sliceSigRef.current = sliceSig;
        }
        updateYou(pipe);
      }

      updateHud(st, count, dim);
    } else {
      pointsGeom.setDrawRange(0, 0);
      linesGeom.setDrawRange(0, 0);
      sectionGeom.setDrawRange(0, 0);
    }

    // 5) camera
    updateCamera(st, dt, dim);
  });

  // ---- frame-loop helpers -------------------------------------------------------
  function writeEdges(
    g: NonNullable<ReturnType<typeof useAppStore.getState>['geometry']>,
    count: number,
    proj3: Float32Array,
    vis: Uint8Array,
  ) {
    const pos = linePosRef.current;
    const col = lineColRef.current;
    const ocol = origColRef.current;
    let w = 0;
    const ecount = Math.min(g.edges.length, MAX_EDGE_PAIRS * 2);
    for (let e = 0; e < ecount; e += 2) {
      if (w / 3 >= MAX_EDGE_PAIRS) break;
      const i = g.edges[e];
      const j = g.edges[e + 1];
      if (i >= count || j >= count) continue;
      if (!vis[i] || !vis[j]) continue;
      const i3 = i * 3;
      const j3 = j * 3;
      pos[w] = proj3[i3];
      pos[w + 1] = proj3[i3 + 1];
      pos[w + 2] = proj3[i3 + 2];
      col[w] = ocol[i3];
      col[w + 1] = ocol[i3 + 1];
      col[w + 2] = ocol[i3 + 2];
      pos[w + 3] = proj3[j3];
      pos[w + 4] = proj3[j3 + 1];
      pos[w + 5] = proj3[j3 + 2];
      col[w + 3] = ocol[j3];
      col[w + 4] = ocol[j3 + 1];
      col[w + 5] = ocol[j3 + 2];
      w += 6;
    }
    linesGeom.setDrawRange(0, w / 3);
    (linesGeom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (linesGeom.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  function updateSection(
    g: NonNullable<ReturnType<typeof useAppStore.getState>['geometry']>,
    n: number,
    srcPts: Float64Array,
    st: ReturnType<typeof useAppStore.getState>,
  ) {
    const active = st.activeDims;
    const fixed = st.sliceValues;
    const showSection = st.showSection;
    const noRotations = st.rotations.length === 0;
    const analytic =
      showSection && noRotations && (g.kind === 'hypercube' || g.kind === 'sphere' || g.kind === 'ball');

    let analyticR: number | null = null;
    let analyticKind: 'cube' | 'sphere' | 'ball' | null = null;
    if (analytic) {
      const fixedList: Array<{ index: number; value: number }> = [];
      for (let d = 0; d < n; d++) {
        if (!active.includes(d)) fixedList.push({ index: d, value: fixed[d] ?? 0 });
      }
      if (g.kind === 'hypercube') {
        analyticR = analyticSection('cube', n, 1, fixedList);
        analyticKind = 'cube';
      } else if (g.kind === 'sphere' || g.kind === 'ball') {
        analyticR = analyticSection(g.kind, n, g.radius ?? 1.6, fixedList);
        analyticKind = g.kind;
      }
    }
    if (boxRef.current) boxRef.current.visible = analyticKind === 'cube' && analyticR !== null;
    const spMesh = sectionSphereRef.current;
    if (spMesh) {
      spMesh.visible = analyticKind === 'sphere' || analyticKind === 'ball';
      if (analyticR !== null) spMesh.scale.setScalar(analyticR);
      sectionSphereMat.wireframe = analyticKind === 'sphere';
      sectionSphereMat.opacity = analyticKind === 'ball' ? 0.12 : 0.35;
    }

    // numeric cross-section: object points lying ON the slice subspace
    let shown = 0;
    if (showSection && n >= 3) {
      const arr = sectionPosRef.current;
      const count = Math.min(g.count, MAX_POINTS);
      for (let i = 0; i < count; i++) {
        let d2 = 0;
        for (let d = 0; d < n; d++) {
          if (!active.includes(d)) {
            const diff = srcPts[i * n + d] - (fixed[d] ?? 0);
            d2 += diff * diff;
          }
        }
        if (d2 < SECTION_EPS2) {
          const o = shown * 3;
          arr[o] = srcPts[i * n + active[0]];
          arr[o + 1] = srcPts[i * n + active[1]];
          arr[o + 2] = srcPts[i * n + active[2]];
          shown++;
          if (shown >= MAX_POINTS) break;
        }
      }
    }
    sectionGeom.setDrawRange(0, shown);
    (sectionGeom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  function updateYou(pipe: Pipeline | null) {
    const st = useAppStore.getState();
    const grp = youRef.current;
    if (!grp) return;
    const n = st.dim;
    let px = 0;
    let py = 0;
    let pz = 0;
    let ok = true;
    if (n === 2) {
      px = userVecRef.current[0];
      py = userVecRef.current[1];
    } else if (pipe) {
      const out = new Float64Array(3);
      // the pipeline operates on the first `n` coordinates
      ok = pipe.projectOne(userVecRef.current.subarray(0, n), out);
      px = out[0];
      py = out[1];
      pz = out[2];
    } else {
      ok = false;
    }
    // In first-person mode the camera IS the user — hide the marker
    // (standing inside the halo sphere would fill the screen).
    grp.visible = ok && st.cameraMode !== 'first';
    if (ok) {
      grp.position.set(px, py, pz);
      const attr = youVectorGeom.getAttribute('position') as THREE.BufferAttribute;
      attr.setXYZ(0, 0, 0, 0);
      attr.setXYZ(1, px, py, pz);
      attr.needsUpdate = true;
    }
  }

  function firstHidden(active: [number, number, number], dim: number): number | null {
    for (let d = 0; d < dim; d++) if (!active.includes(d)) return d;
    return null;
  }

  function updateCamera(st: ReturnType<typeof useAppStore.getState>, dt: number, dim: number) {
    if (dim < 3) {
      // fixed side-on camera for 2D
      if (st.cameraMode !== 'orbit') return;
      const o = orbit.current;
      o.phi = Math.PI / 2;
      o.theta = 0;
      o.r = Math.max(o.r, 6);
      camera.position.set(o.target.x, o.target.y + 0.01, o.target.z + o.r);
      camera.lookAt(o.target);
      return;
    }
    if (st.cameraMode === 'orbit') {
      const o = orbit.current;
      if (st.autoRotate) o.theta += dt * 0.12;
      if (st.followYou && youRef.current?.visible) {
        o.target.lerp(youRef.current.position, Math.min(1, dt * 4));
      }
      const sp = new THREE.Spherical(o.r, o.phi, o.theta);
      camera.position.setFromSpherical(sp).add(o.target);
      camera.lookAt(o.target);
    } else if (st.cameraMode === 'first') {
      if (youRef.current?.visible) camera.position.copy(youRef.current.position);
      const speed = (keys.current['shift'] ? 4.5 : 2.2) * dt;
      const active = st.activeDims;
      const hidden = firstHidden(active, dim);
      const fwd = new THREE.Vector3(-Math.sin(fp.current.yaw), 0, -Math.cos(fp.current.yaw));
      const right = new THREE.Vector3(Math.cos(fp.current.yaw), 0, -Math.sin(fp.current.yaw));
      const move = new THREE.Vector3();
      if (keys.current['w']) move.add(fwd);
      if (keys.current['s']) move.sub(fwd);
      if (keys.current['d']) move.add(right);
      if (keys.current['a']) move.sub(right);
      if (keys.current['r']) move.y += 1;
      if (keys.current['f']) move.y -= 1;
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(speed);
        st.setUserCoord(active[0], st.user[active[0]] + move.x);
        st.setUserCoord(active[1], st.user[active[1]] + move.y);
        st.setUserCoord(active[2], st.user[active[2]] + move.z);
      }
      if (hidden !== null) {
        if (keys.current['q']) st.setUserCoord(hidden, st.user[hidden] + speed);
        if (keys.current['e']) st.setUserCoord(hidden, st.user[hidden] - speed);
      }
      camera.quaternion.setFromEuler(new THREE.Euler(fp.current.pitch, fp.current.yaw, 0, 'YXZ'));
    } else {
      // fly
      if (!flyInit.current) {
        flyPos.current.copy(camera.position);
        flyLook.current.yaw = Math.atan2(-camera.position.x, -camera.position.z);
        flyInit.current = true;
      }
      const l = flyLook.current;
      const speed = (keys.current['shift'] ? 8 : 4) * dt;
      const fwd = new THREE.Vector3(
        -Math.sin(l.yaw) * Math.cos(l.pitch),
        Math.sin(l.pitch),
        -Math.cos(l.yaw) * Math.cos(l.pitch),
      );
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x).normalize();
      const move = new THREE.Vector3();
      if (keys.current['w']) move.add(fwd);
      if (keys.current['s']) move.sub(fwd);
      if (keys.current['d']) move.add(right);
      if (keys.current['a']) move.sub(right);
      if (keys.current['q']) move.y += 1;
      if (keys.current['e']) move.y -= 1;
      if (move.lengthSq() > 0) flyPos.current.addScaledVector(move.normalize(), speed);
      camera.position.copy(flyPos.current);
      camera.quaternion.setFromEuler(new THREE.Euler(l.pitch, l.yaw, 0, 'YXZ'));
    }
  }

  function updateHud(st: ReturnType<typeof useAppStore.getState>, count: number, dim: number) {
    const t = performance.now();
    if (t - lastHud.current < 150 || !hudRef.current) return;
    lastHud.current = t;
    const coords = st.user.slice(0, dim).map((v) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)));
    const head = coords.slice(0, 6).join(', ');
    const tail = dim > 6 ? `, …, ${coords[dim - 1]}` : '';
    const r = Math.hypot(...st.user.slice(0, Math.min(dim, 24)));
    hudRef.current.innerHTML =
      `<div class="font-mono text-[11px] leading-4">` +
      `<span class="text-dim">YOU =</span> <span class="text-you">(${head}${tail})</span><br/>` +
      `<span class="text-dim">‖YOU‖ =</span> ${r.toFixed(2)} · <span class="text-dim">object:</span> ${st.objectKind} · <span class="text-dim">shown:</span> ${count}<br/>` +
      `<span class="text-dim">axes:</span> ${axisName(st.activeDims[0])} ${axisName(st.activeDims[1])} ${axisName(st.activeDims[2])} · <span class="text-dim">pipeline:</span> ${dim}D→${Math.min(st.stageDim, dim)}D→3D→2D` +
      `</div>`;
  }

  // reset fly init when switching modes
  useEffect(() => {
    flyInit.current = false;
    fp.current.yaw = 0;
    fp.current.pitch = 0;
  }, [cameraMode]);



  return (
    <>
      <color attach="background" args={['#05070d']} />
      <fog attach="fog" args={['#05070d', 30, 120]} />
      <ambientLight intensity={0.6} />
      <primitive object={grid} visible={showGrid} />
      {showAxes && <Axes />}
      <points geometry={pointsGeom} material={pointsMat} frustumCulled={false} />
      <lineSegments geometry={linesGeom} material={linesMat} frustumCulled={false} />
      <points geometry={sectionGeom} material={sectionMat} frustumCulled={false} />
      <lineSegments ref={boxRef} geometry={boxGeom} material={boxMat} visible={false} />
      <mesh ref={sectionSphereRef} geometry={sectionSphereGeom} material={sectionSphereMat} visible={false} />
      <primitive object={youGroup} ref={youRef} />
      <primitive object={youLine} />
    </>
  );
}

export default function View3D() {
  const cameraMode = useAppStore((s) => s.cameraMode);
  const hudRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="relative h-full w-full">
      <Canvas
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 55, near: 0.05, far: 400, position: [6, 4.5, 8] }}
      >
        <SceneInner hudRef={hudRef} />
      </Canvas>
      <div
        ref={hudRef}
        className="pointer-events-none absolute left-3 top-3 rounded-md border border-line bg-ink/70 px-3 py-2 backdrop-blur"
      />
      {cameraMode === 'first' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-1.5 w-1.5 rounded-full bg-you/80" />
        </div>
      )}
      {cameraMode === 'first' && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-ink/80 px-3 py-1.5 text-[11px] text-dim backdrop-blur">
          click to look around · W A S D move · Q / E hidden dim · R / F up/down · Esc release
        </div>
      )}
      {cameraMode === 'fly' && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-ink/80 px-3 py-1.5 text-[11px] text-dim backdrop-blur">
          drag to look · W A S D move · Q / E up/down · Shift boost
        </div>
      )}
    </div>
  );
}
