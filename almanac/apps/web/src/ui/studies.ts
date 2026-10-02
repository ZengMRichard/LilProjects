// Chart studies. Pure functions over a series of closes; null where there is too little data.

export function sma(xs: number[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < xs.length; i++) {
    sum += xs[i];
    if (i >= n) sum -= xs[i - n];
    out.push(i >= n - 1 ? sum / n : null);
  }
  return out;
}

export function ema(xs: number[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  const k = 2 / (n + 1);
  let prev: number | null = null;
  for (let i = 0; i < xs.length; i++) {
    if (i < n - 1) {
      out.push(null);
      continue;
    }
    if (prev === null) {
      // seed with the simple average of the first n values
      prev = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
    } else {
      prev = xs[i] * k + prev * (1 - k);
    }
    out.push(prev);
  }
  return out;
}

/** Bollinger bands: middle = SMA(n), upper/lower = middle +/- k population std devs. */
export function bollinger(xs: number[], n = 20, k = 2) {
  const mid = sma(xs, n);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < xs.length; i++) {
    const m = mid[i];
    if (m === null) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    const w = xs.slice(i - n + 1, i + 1);
    const sd = Math.sqrt(w.reduce((a, x) => a + (x - m) ** 2, 0) / n);
    upper.push(m + k * sd);
    lower.push(m - k * sd);
  }
  return { mid, upper, lower };
}

/** Rebase a series to percent change from its first value: every series starts at 0%. */
export function rebase(xs: (number | null)[]): (number | null)[] {
  const first = xs.find((x) => x !== null && x !== 0);
  if (first === undefined || first === null) return xs.map(() => null);
  return xs.map((x) => (x === null ? null : (x / first - 1) * 100));
}

export const STUDIES = ["SMA20", "SMA50", "SMA200", "EMA20", "BB20"] as const;
