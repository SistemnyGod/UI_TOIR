/** Pure layout and timing for the NFC "matrix" backdrop, kept free of React Native for tests. */

export const MATRIX_GLYPHS = '0123456789ABCDEF';
export const MATRIX_COLUMN_STEP = 16;
export const MATRIX_MAX_COLUMNS = 22;
export const MATRIX_LOOP_MS = 7200;

export type MatrixColumn = {
  x: number;
  /** Tail glyphs from the oldest (faintest) to the newest, split into fading segments. */
  tail: string[];
  head: string;
  /** Start of this column's fall within one loop, 0..1. */
  phase: number;
  /** Whole falls per loop: 1 is slow, 2 is fast. */
  cycles: number;
  opacity: number;
};

export type MatrixCell = { x: number; y: number; phase: number };

/** Small deterministic generator so the rain looks the same on every render and in tests. */
function seeded(seed: number) {
  let value = seed;
  return () => (value = (value * 9301 + 49297) % 233280) / 233280;
}

export function buildMatrix(width: number, height: number, seed = 7): { columns: MatrixColumn[]; cells: MatrixCell[] } {
  const rnd = seeded(seed);
  const pick = () => MATRIX_GLYPHS[Math.floor(rnd() * MATRIX_GLYPHS.length)];
  const count = Math.max(0, Math.min(MATRIX_MAX_COLUMNS, Math.floor(width / MATRIX_COLUMN_STEP)));
  const columns: MatrixColumn[] = [];
  for (let i = 0; i < count; i++) {
    const length = 8 + Math.floor(rnd() * 8);
    let glyphs = '';
    for (let j = 0; j < length; j++) glyphs += pick();
    const quarter = Math.ceil(length / 4);
    const tail = [0, 1, 2, 3].map(part => glyphs.slice(part * quarter, (part + 1) * quarter)).filter(Boolean);
    columns.push({ x: 3 + i * MATRIX_COLUMN_STEP, tail, head: pick(), phase: rnd(), cycles: rnd() > 0.6 ? 2 : 1, opacity: 0.45 + rnd() * 0.55 });
  }
  const rows = Math.max(1, Math.floor(height * 0.55 / MATRIX_COLUMN_STEP));
  const cells: MatrixCell[] = [];
  for (let i = 0; i < Math.min(8, count); i++) {
    cells.push({ x: 3 + MATRIX_COLUMN_STEP * Math.floor(rnd() * count), y: 3 + MATRIX_COLUMN_STEP * Math.floor(rnd() * rows), phase: rnd() });
  }
  return { columns, cells };
}

/**
 * Interpolation ranges that make one linear 0→1 loop drive a sawtooth from `from` to `to`,
 * starting `phase` of the way through and repeating `cycles` times per loop.
 */
export function cyclicRange(phase: number, cycles: number, from: number, to: number) {
  const at = (fraction: number) => from + (to - from) * fraction;
  const inputRange = [0];
  const outputRange = [at(phase)];
  for (let wrap = 1; wrap <= cycles; wrap++) {
    const t = (wrap - phase) / cycles;
    if (t <= 0 || t >= 1) continue;
    inputRange.push(t, t + 0.0001);
    outputRange.push(to, from);
  }
  inputRange.push(1);
  outputRange.push(at(phase));
  return { inputRange, outputRange };
}

/** A blink that rises and falls once per cycle, offset by `phase`. */
export function blinkRange(phase: number, peak: number) {
  const valueAt = (t: number) => {
    const shifted = ((t - phase) % 1 + 1) % 1;
    if (shifted <= 0.4) return peak * shifted / 0.4;
    if (shifted <= 0.6) return peak;
    return peak * (1 - shifted) / 0.4;
  };
  const inputRange = [...new Set([0, 1, ...[0, 0.4, 0.6].map(point => (point + phase) % 1)])].sort((a, b) => a - b);
  return { inputRange, outputRange: inputRange.map(valueAt) };
}
