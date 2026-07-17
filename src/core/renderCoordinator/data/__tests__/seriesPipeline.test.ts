/**
 * seriesPipeline owns baseline / setOptionsReuse / zoomed display resolution.
 */

import { describe, it, expect } from 'vitest';
import { buildRuntimeBaseSeries, buildSetOptionsReuseSeries, resolveZoomedSeriesEntry } from '../seriesPipeline';
import type { ResolvedSeriesConfig } from '../../../../config/OptionResolver';

const raw100 = {
  x: Float64Array.from(Array.from({ length: 100 }, (_, i) => i)),
  y: Float64Array.from(Array.from({ length: 100 }, (_, i) => i)),
};

const lineLttb = {
  type: 'line',
  sampling: 'lttb',
  samplingThreshold: 10,
  data: { x: [0], y: [0] },
  rawData: raw100,
} as unknown as ResolvedSeriesConfig;

const lineAverage = {
  type: 'line',
  sampling: 'average',
  samplingThreshold: 10,
  data: { x: [0, 1], y: [0, 1] },
  rawData: raw100,
} as unknown as ResolvedSeriesConfig;

describe('buildRuntimeBaseSeries', () => {
  it('GPU-eligible lttb keeps full raw on data', () => {
    const out = buildRuntimeBaseSeries([lineLttb], [raw100], [null]);
    expect(out[0]!.data).toBe(raw100);
    expect(out[0]!.rawData).toBe(raw100);
  });

  it('builds full array for all indices', () => {
    const out = buildRuntimeBaseSeries([lineLttb, lineAverage], [raw100, raw100], [null, null]);
    expect(out).toHaveLength(2);
    expect(out[0]!.data).toBe(raw100);
  });
});

describe('buildSetOptionsReuseSeries', () => {
  it('GPU-eligible forces raw on data', () => {
    const out = buildSetOptionsReuseSeries([lineLttb], [raw100], [null]);
    expect(out[0]!.data).toBe(raw100);
  });

  it('non-GPU keeps OptionResolver sampled data (setOptionsReuse)', () => {
    const sampled = lineAverage.data;
    const out = buildSetOptionsReuseSeries([lineAverage], [raw100], [null]);
    expect(out[0]!.data).toBe(sampled);
    expect(out[0]!.rawData).toBe(raw100);
  });
});

describe('resolveZoomedSeriesEntry', () => {
  const sliceX = (data: { x: ArrayLike<number>; y: ArrayLike<number> }, min: number, max: number) => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < data.x.length; i++) {
      const x = data.x[i]!;
      if (x >= min && x <= max) {
        xs.push(x);
        ys.push(data.y[i]!);
      }
    }
    return { x: xs, y: ys };
  };
  const sliceOHLC = (data: readonly unknown[]) => data;

  it('GPU-eligible zoom keeps full raw (not buffered sample)', () => {
    const r = resolveZoomedSeriesEntry({
      series: lineLttb,
      rawSlot: raw100,
      bufferedMin: 10,
      bufferedMax: 50,
      visibleMin: 20,
      visibleMax: 40,
      spanFraction: 0.3,
      sliceX: sliceX as any,
      sliceOHLC: sliceOHLC as any,
    });
    expect(r.series.data).toBe(raw100);
    expect(r.cacheEntry).toBeNull();
  });

  it('CPU path samples and returns cache entry', () => {
    const identitySlice = (data: any) => data;
    const r = resolveZoomedSeriesEntry({
      series: lineAverage,
      rawSlot: raw100,
      bufferedMin: 0,
      bufferedMax: 99,
      visibleMin: 0,
      visibleMax: 99,
      spanFraction: 1,
      sliceX: identitySlice,
      sliceOHLC: sliceOHLC as any,
    });
    expect(r.series.data).toBeTruthy();
    expect(r.cacheEntry).not.toBeNull();
    expect(r.cacheEntry!.cachedRange).toEqual({ min: 0, max: 99 });
  });
});
