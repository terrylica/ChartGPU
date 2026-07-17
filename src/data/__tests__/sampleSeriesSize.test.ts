import { describe, it, expect } from 'vitest';
import { sampleSeriesDataPoints } from '../sampleSeries';
import { getSize, getPointCount } from '../cartesianData';
import type { DataPoint } from '../../config/types';

describe('sampleSeriesDataPoints LTTB size preservation', () => {
  it('keeps per-point size when dense DataPoint path samples', () => {
    const data: DataPoint[] = Array.from({ length: 200 }, (_, i) => [i, Math.sin(i), 2 + (i % 3)]);
    const sampled = sampleSeriesDataPoints(data, 'lttb', 20);
    // Must not collapse to size-less Float32Array.
    expect(ArrayBuffer.isView(sampled)).toBe(false);
    const n = getPointCount(sampled);
    expect(n).toBeLessThanOrEqual(20);
    let sawSize = false;
    for (let i = 0; i < n; i++) {
      if (getSize(sampled, i) !== undefined) sawSize = true;
    }
    expect(sawSize).toBe(true);
  });

  it('uses Float32 path when dense tuples have no size', () => {
    const data: DataPoint[] = Array.from({ length: 200 }, (_, i) => [i, Math.sin(i)]);
    const sampled = sampleSeriesDataPoints(data, 'lttb', 20);
    expect(sampled instanceof Float32Array).toBe(true);
  });

  it('preserves XYArraysData size channel through LTTB', () => {
    const n = 200;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = Array.from({ length: n }, (_, i) => Math.sin(i));
    const size = Array.from({ length: n }, (_, i) => 2 + (i % 4));
    const sampled = sampleSeriesDataPoints({ x, y, size }, 'lttb', 20);
    expect(ArrayBuffer.isView(sampled)).toBe(false);
    const count = getPointCount(sampled);
    expect(count).toBeLessThanOrEqual(20);
    let sawSize = false;
    for (let i = 0; i < count; i++) {
      if (getSize(sampled, i) !== undefined) sawSize = true;
    }
    expect(sawSize).toBe(true);
  });
});
