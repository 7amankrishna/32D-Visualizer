/**
 * Dense row-major matrices for the N-dimensional engine.
 * Used for explicit rotation matrices (educational display / verification)
 * and for the fixed mixing matrices of oblique ("parallel") projections.
 */

export class NDMatrix {
  readonly rows: number;
  readonly cols: number;
  readonly data: Float64Array;

  constructor(rows: number, cols: number, data?: Float64Array) {
    this.rows = rows;
    this.cols = cols;
    this.data = data ?? new Float64Array(rows * cols);
  }

  static identity(n: number): NDMatrix {
    const m = new NDMatrix(n, n);
    for (let i = 0; i < n; i++) m.data[i * n + i] = 1;
    return m;
  }

  get(r: number, c: number): number {
    return this.data[r * this.cols + c];
  }

  set(r: number, c: number, v: number): void {
    this.data[r * this.cols + c] = v;
  }

  /**
   * Givens rotation matrix: identity except in the 2×2 block (a, b) which
   * holds the standard 2D rotation matrix [cos −sin; sin cos].
   */
  static rotation(n: number, a: number, b: number, angle: number): NDMatrix {
    const m = NDMatrix.identity(n);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    m.set(a, a, c);
    m.set(a, b, -s);
    m.set(b, a, s);
    m.set(b, b, c);
    return m;
  }

  /** Row-vector convention: out = M · p */
  mulPoint(p: Float64Array, out: Float64Array): Float64Array {
    for (let r = 0; r < this.rows; r++) {
      let s = 0;
      const row = r * this.cols;
      for (let c = 0; c < this.cols; c++) s += this.data[row + c] * p[c];
      out[r] = s;
    }
    return out;
  }

  /** Composition: this ⊗ other (apply other first, then this) */
  compose(other: NDMatrix): NDMatrix {
    if (this.rows !== other.cols) throw new Error('matrix dimension mismatch');
    const out = new NDMatrix(this.rows, other.rows);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < other.rows; c++) {
        let s = 0;
        for (let k = 0; k < this.cols; k++) s += this.data[r * this.cols + k] * other.data[k * other.rows + c];
        out.data[r * other.rows + c] = s;
      }
    }
    return out;
  }

  transpose(): NDMatrix {
    const t = new NDMatrix(this.cols, this.rows);
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) t.data[c * this.rows + r] = this.data[r * this.cols + c];
    return t;
  }

  /** Orthonormality check ‖MᵀM − I‖∞ (should be ≈ 0 for rotations) */
  orthogonalityError(): number {
    const t = this.transpose();
    const m = t.compose(this);
    let e = 0;
    for (let r = 0; r < m.rows; r++)
      for (let c = 0; c < m.cols; c++) {
        const target = r === c ? 1 : 0;
        e = Math.max(e, Math.abs(m.data[r * m.cols + c] - target));
      }
    return e;
  }
}
