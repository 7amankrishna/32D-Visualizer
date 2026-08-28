/** Shared helpers for the 2D canvas views (DPR sizing + redraw coalescing). */

import { useEffect, useRef, type RefObject } from 'react';
import { useAppStore } from '../store/useAppStore';

export interface CanvasCtx {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  dpr: number;
}

/**
 * Set up a HiDPI canvas that resizes with its container and redraws when the
 * store changes or when `deps` change. `draw` is coalesced with rAF.
 */
export function useCanvasView(
  draw: (c: CanvasCtx) => void,
  deps: unknown[],
): RefObject<HTMLCanvasElement | null> {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    let raf = 0;
    const sizeAndDraw = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(50, Math.floor(rect.width));
      const h = Math.max(50, Math.floor(rect.height));
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => drawRef.current({ ctx, w, h, dpr }));
    };

    const ro = new ResizeObserver(sizeAndDraw);
    ro.observe(parent);
    sizeAndDraw();

    // redraw on any store change (coalesced)
    const unsub = useAppStore.subscribe(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sizeAndDraw);
    });

    return () => {
      ro.disconnect();
      unsub();
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}

/** "Nice" grid step for a target pixel spacing */
export function niceStep(target: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  for (const m of [1, 2, 5, 10]) {
    if (m * pow >= target) return m * pow;
  }
  return 10 * pow;
}

export function hexToRgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}
