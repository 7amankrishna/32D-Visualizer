/** Formatting helpers for scientific display. */

const SUBS = '₀₁₂₃₄₆₇₈₉';

/** 32 → "32", with optional subscript: sub(5) → "5" rendered via unicode in callers */
export function sub(n: number): string {
  return String(n)
    .split('')
    .map((d) => SUBS[Number(d)])
    .join('');
}

/** "X" + subscript, e.g. axisName(1) → X, axisName(4) → W, axisName(7) → X₇ */
export function axisName(i: number): string {
  const base = ['X', 'Y', 'Z', 'W'];
  return i < 4 ? base[i] : `X${sub(i + 1)}`;
}

/** Human form for huge integers: 2^32 → "4.29 × 10⁹" */
export function bigNumber(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (n >= 1e15) return n.toExponential(2).replace('e+', ' × 10^');
  if (n >= 1e7) return Math.round(n).toLocaleString('en-US');
  return n.toLocaleString('en-US');
}

/** 2^N formatted compactly */
export function pow2(N: number): string {
  return bigNumber(Math.pow(2, N));
}

/** Format a coordinate value compactly: -0.73, 3.2, 1 */
export function fmt(v: number, digits = 2): string {
  if (Number.isInteger(v)) return String(v);
  const s = v.toFixed(digits);
  return s === '-0.00' ? '0.00' : s;
}

/** Format a full coordinate tuple: "(0.21, −0.73, …)" */
export function tuple(coords: number[], digits = 2): string {
  return `(${coords.map((c) => fmt(c, digits)).join(', ')})`;
}

export function degrees(rad: number): string {
  return `${((rad * 180) / Math.PI).toFixed(1)}°`;
}

export function radians(deg: number): number {
  return (deg * Math.PI) / 180;
}
