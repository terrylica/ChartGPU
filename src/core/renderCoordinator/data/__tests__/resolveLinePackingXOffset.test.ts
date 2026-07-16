import { describe, it, expect } from 'vitest';
import { resolveLinePackingXOffset } from '../resolveLinePackingXOffset';
import { createStagingRingView } from '../../../../data/cartesianData';

describe('resolveLinePackingXOffset', () => {
  it('returns zero offsets for non-time axes', () => {
    const r = resolveLinePackingXOffset({
      data: { x: [1e12, 1e12 + 1], y: [0, 1] },
      dataStore: { getSeriesXOffset: () => 99 },
      seriesIndex: 0,
      xAxisType: 'value',
    });
    expect(r).toEqual({ packingXOffset: 0, xOffset: 0 });
  });

  it('uses staging ring view xOffset when present', () => {
    const view = createStagingRingView(new Float32Array(8), 0, 2, 2, 1_700_000_000_000);
    const r = resolveLinePackingXOffset({
      data: view,
      dataStore: {
        getSeriesXOffset: () => {
          throw new Error('should not use store');
        },
      },
      seriesIndex: 0,
      xAxisType: 'time',
    });
    expect(r.packingXOffset).toBe(1_700_000_000_000);
    expect(r.xOffset).toBe(1_700_000_000_000);
  });

  it('prefers DataStore fixed origin over domain-first when series is resident', () => {
    const storeOrigin = 1_600_000_000_000;
    const r = resolveLinePackingXOffset({
      // Domain-first would be a newer timestamp after FIFO drop
      data: { x: [1_700_000_000_000, 1_700_000_000_001], y: [0, 1] },
      dataStore: { getSeriesXOffset: () => storeOrigin },
      seriesIndex: 0,
      xAxisType: 'time',
    });
    expect(r.packingXOffset).toBe(storeOrigin);
    expect(r.xOffset).toBe(storeOrigin);
  });

  it('falls back to first finite domain x when store has no series', () => {
    const r = resolveLinePackingXOffset({
      data: { x: [Number.NaN, 42, 43], y: [0, 1, 2] },
      dataStore: {
        getSeriesXOffset: () => {
          throw new Error('missing');
        },
      },
      seriesIndex: 0,
      xAxisType: 'time',
    });
    expect(r.packingXOffset).toBe(42);
    expect(r.xOffset).toBe(42);
  });
});
