import { describe, it, expect, vi } from 'vitest';
import { createAppendFlush, type AppendFlushDeps } from '../appendFlush';
import { canRangedAppendLine } from '../canRangedAppendLine';
import { demoteStagingViewAfterRebindFailure } from '../stagingThinPath';
import { createStagingRingView } from '../../../../data/cartesianData';

function baseDeps(overrides: Partial<AppendFlushDeps> = {}): AppendFlushDeps {
  const pendingAppendByIndex = new Map<
    number,
    AppendFlushDeps['pendingAppendByIndex'] extends Map<number, infer V> ? V : never
  >();
  const lastSetSeriesCache = new Map<number, { data: unknown; xOffset: number }>();
  const deps: AppendFlushDeps = {
    pendingAppendByIndex: pendingAppendByIndex as AppendFlushDeps['pendingAppendByIndex'],
    appendedGpuThisFrame: new Set(),
    zoomState: null,
    currentOptions: {
      series: [
        {
          type: 'line',
          sampling: 'none',
          samplingThreshold: 0,
          data: { x: [0, 1], y: [0, 1] },
          rawData: { x: [0, 1], y: [0, 1] },
        } as any,
      ],
      autoScroll: false,
      xAxis: {},
    } as any,
    dataStore: {
      appendSeries: vi.fn(() => true),
      getSeriesXOffset: vi.fn(() => 0),
    } as any,
    runtimeRawDataByIndex: [{ x: [0, 1], y: [0, 1] }],
    runtimeRawBoundsByIndex: [{ xMin: 0, xMax: 1, yMin: 0, yMax: 1 }],
    gpuSeriesKindByIndex: ['fullRawLine'],
    lastSetSeriesCache,
    filterGapsCache: { delete() {}, clear() {} },
    lastSampledData: [],
    warnedSamplingDefeatsFastPath: new Set(),
    recomputeRuntimeBaseSeries: vi.fn(),
    recomputeCachedVisibleYBoundsIfNeeded: vi.fn(),
    ensureMutableRuntimeColumns: () => ({ x: [0, 1], y: [0, 1] }),
    isOwnedMutableColumns: () => false,
    brandOwnedColumns: (c: any) => c,
    computeBaseXDomain: () => ({ min: 0, max: 1 }),
    computeVisibleXDomain: () => ({ min: 0, max: 1, spanFraction: 1 }),
    isFullSpanZoomRange: () => true,
    computeEffectiveZoomSpanConstraints: () => ({ minSpan: 0, maxSpan: 100 }),
    extendBoundsWithCartesianData: (_b, _d) => ({ xMin: 0, xMax: 2, yMin: 0, yMax: 2 }),
    extendBoundsWithOHLCDataPoints: () => null,
    canRangedAppendLine,
    isGpuDecimationEligible: () => false,
    normalizeMaxPoints: () => null,
    planMaxPointsWindow: () => ({
      didWindow: false,
      dropPrevCount: 0,
      keepNewCount: 0,
      newSrcOffset: 0,
      isRing: false,
      ringCapacity: 0,
    }),
    getPointCount: (data: any) => (Array.isArray(data?.x) ? data.x.length : 0),
    getX: (data: any, i: number) => data.x[i],
    getY: (data: any, i: number) => data.y[i],
    getSize: () => undefined,
    createRingXYColumns: () => ({}),
    appendIntoRingXY: () => {},
    dropPrefixXY: () => {},
    createStagingRingView: () => ({}),
    isRingXYColumns: () => false,
    isStagingRingView: () => false,
    demoteStagingViewAfterRebindFailure,
    computeRawBoundsFromCartesianData: () => null,
    runtimeBaseSeries: [],
    renderSeries: [],
    pendingZoomSourceKind: null,
    ...overrides,
  };
  return deps;
}

describe('appendFlush module ownership', () => {
  it('canRangedAppendLine and demoteStagingViewAfterRebindFailure live in policy modules', () => {
    expect(
      canRangedAppendLine({
        seriesType: 'line',
        sampling: 'none',
        kind: 'fullRawLine',
        rawData: { x: [0, 1], y: [0, 1] },
      })
    ).toBe(true);
    const view = createStagingRingView(new Float64Array(4), 0, 2, 2, 0);
    expect(demoteStagingViewAfterRebindFailure(view)).toBeNull();
  });

  it('createAppendFlush returns false when no pending appends', () => {
    const deps = baseDeps();
    const flush = createAppendFlush(() => deps);
    expect(flush()).toBe(false);
    expect(deps.appendedGpuThisFrame.size).toBe(0);
  });

  it('ranged append (sampling none) updates GPU, reseeds lastSetSeriesCache, extends runtime raw', () => {
    const lastSetSeriesCache = new Map<number, { data: unknown; xOffset: number }>();
    const appendSeries = vi.fn(() => true);
    // Owned mutable columns (array, not typed) so ensureMutable / push path can extend.
    const raw = { x: [0, 1] as number[], y: [10, 11] as number[] };
    const deps = baseDeps({
      lastSetSeriesCache,
      runtimeRawDataByIndex: [raw],
      gpuSeriesKindByIndex: ['fullRawLine'],
      isOwnedMutableColumns: () => true,
      ensureMutableRuntimeColumns: () => raw,
      dataStore: {
        appendSeries,
        getSeriesXOffset: vi.fn(() => 0),
      } as any,
    });
    deps.pendingAppendByIndex.set(0, [{ points: { x: [2], y: [12] } }]);
    deps.runtimeBaseSeries = deps.currentOptions.series as any;
    deps.renderSeries = deps.currentOptions.series as any;

    const flush = createAppendFlush(() => deps);
    expect(flush()).toBe(true);

    expect(appendSeries).toHaveBeenCalled();
    expect(deps.appendedGpuThisFrame.has(0)).toBe(true);
    expect(deps.pendingAppendByIndex.size).toBe(0);
    // Cache reseed for append path
    expect(lastSetSeriesCache.has(0)).toBe(true);
    // Runtime columns extended (owned mutable path)
    expect(raw.x.length).toBeGreaterThanOrEqual(2);
  });

  it('calls recomputeRuntimeBaseSeries when ranged append is not available', () => {
    const recomputeRuntimeBaseSeries = vi.fn();
    const deps = baseDeps({
      recomputeRuntimeBaseSeries,
      gpuSeriesKindByIndex: ['other'],
      dataStore: {
        appendSeries: vi.fn(() => false),
        getSeriesXOffset: vi.fn(() => 0),
      } as any,
    });
    deps.pendingAppendByIndex.set(0, [{ points: { x: [2], y: [12] } }]);
    deps.runtimeBaseSeries = deps.currentOptions.series as any;
    deps.renderSeries = deps.currentOptions.series as any;

    const flush = createAppendFlush(() => deps);
    expect(flush()).toBe(true);
    expect(recomputeRuntimeBaseSeries).toHaveBeenCalled();
  });
});
