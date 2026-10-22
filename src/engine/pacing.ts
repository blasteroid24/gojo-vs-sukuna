import type { PacingRange } from '../config/chapters';

/**
 * Piecewise-linear map between scroll progress (0..1) and a fractional frame
 * index (0..count-1). Each frame-to-frame step gets a scroll "weight", so some
 * shots can hold longer than others without changing the footage.
 */
export interface Pacing {
  frameAt(progress: number): number;
  progressAt(frame: number): number;
}

export function createPacing(count: number, ranges: PacingRange[]): Pacing {
  const steps = Math.max(1, count - 1);
  const weights = new Float64Array(steps);
  const cumulative = new Float64Array(steps + 1);

  for (let i = 0; i < steps; i++) {
    const frameNo = i + 1; // 1-based, as in the config
    const range = ranges.find((r) => frameNo >= r.from && frameNo <= r.to);
    weights[i] = Math.max(0.05, range?.weight ?? 1);
    cumulative[i + 1] = cumulative[i]! + weights[i]!;
  }
  const total = cumulative[steps]!;

  return {
    frameAt(progress) {
      const target = Math.min(Math.max(progress, 0), 1) * total;
      let lo = 0;
      let hi = steps - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (cumulative[mid]! <= target) lo = mid;
        else hi = mid - 1;
      }
      return Math.min(steps, lo + (target - cumulative[lo]!) / weights[lo]!);
    },
    progressAt(frame) {
      const f = Math.min(Math.max(frame, 0), steps);
      const k = Math.min(Math.floor(f), steps - 1);
      return (cumulative[k]! + (f - k) * weights[k]!) / total;
    },
  };
}
