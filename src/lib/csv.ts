/** CSV import for N-dimensional datasets (each row = one point). */

export const MAX_IMPORT_POINTS = 50000;
export const MAX_IMPORT_DIM = 32;

export interface ImportResult {
  dim: number;
  points: number[];
  skipped: number;
  truncated: boolean;
}

/**
 * Parse CSV/TSV text. A header row is detected when the first row contains
 * non-numeric tokens (e.g. "x1,x2,x3"). Rows are split on commas, semicolons
 * or tabs; empty rows are ignored.
 */
export function parseCSV(text: string): ImportResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) throw new Error('File is empty');

  const splitRow = (l: string) =>
    l.split(/[,;\t]+/).map((s) => s.trim());

  let start = 0;
  const first = splitRow(lines[0]).filter((c) => c.length > 0);
  const firstIsHeader = first.some((c) => Number.isNaN(Number(c)));
  if (firstIsHeader) start = 1;

  let dim = 0;
  const points: number[] = [];
  let skipped = 0;
  let truncated = false;

  for (let li = start; li < lines.length; li++) {
    const cells = splitRow(lines[li]).filter((c) => c.length > 0);
    if (cells.length === 0) continue;
    const vals = cells.map((c) => Number(c));
    if (vals.some((v) => Number.isNaN(v))) {
      skipped++;
      continue;
    }
    if (dim === 0) dim = vals.length;
    if (vals.length !== dim) {
      skipped++;
      continue;
    }
    if (points.length / dim >= MAX_IMPORT_POINTS) {
      truncated = true;
      break;
    }
    points.push(...vals);
  }

  if (dim === 0) throw new Error('No numeric rows found');
  if (dim > MAX_IMPORT_DIM) throw new Error(`Datasets up to ${MAX_IMPORT_DIM}D are supported`);

  return { dim, points, skipped, truncated };
}

/** A small demo dataset (5D, 12 points) so users can try import immediately. */
export function sampleCSV(): string {
  const rows: Array<[number, number, number, number, number]> = [
    [0.2, 0.5, -0.3, 0.8, 0.1],
    [0.1, -0.4, 0.7, 0.2, 0.9],
    [-0.6, 0.2, 0.1, -0.5, 0.4],
    [0.8, 0.9, 0.2, -0.1, -0.3],
    [-0.2, -0.7, -0.4, 0.6, 0.7],
    [0.5, -0.1, 0.9, -0.2, 0.2],
    [-0.9, 0.3, 0.5, 0.4, -0.6],
    [0.3, 0.6, -0.8, -0.7, 0.5],
    [-0.4, -0.2, 0.3, 0.9, -0.9],
    [0.7, 0.1, 0.4, 0.3, 0.6],
    [-0.1, 0.8, -0.6, 0.1, 0.3],
    [0.4, -0.5, 0.2, -0.9, -0.2],
  ];
  return ['x1,x2,x3,x4,x5', ...rows.map((r) => r.join(','))].join('\n');
}
