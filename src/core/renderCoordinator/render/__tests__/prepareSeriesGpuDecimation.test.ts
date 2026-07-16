/**
 * WG-P0-1: GPU-decimated line prepare must receive the same non-zero packing
 * xOffset as DataStore used when packing time-axis data.
 *
 * Drives the shipped `prepareSeries` entry point with mocked renderers / store.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";

beforeAll(() => {
  // @ts-ignore
  globalThis.GPUShaderStage = { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
  // @ts-ignore
  globalThis.GPUBufferUsage = {
    MAP_READ: 0x0001,
    MAP_WRITE: 0x0002,
    COPY_SRC: 0x0004,
    COPY_DST: 0x0008,
    INDEX: 0x0010,
    VERTEX: 0x0020,
    UNIFORM: 0x0040,
    STORAGE: 0x0080,
    INDIRECT: 0x0100,
    QUERY_RESOLVE: 0x0200,
  };
});

import { prepareSeries } from "../renderSeries";
import type {
  SeriesPrepareContext,
  SeriesRenderers,
} from "../renderSeries";
import type { ResolvedSeriesConfig } from "../../../../config/OptionResolver";
import type { DataStore } from "../../../../data/createDataStore";
import type { LinearScale } from "../../../../utils/scales";
import type { GridArea } from "../../../../renderers/createGridRenderer";
import { createFilterGapsCache } from "../filterGapsCache";

/** Epoch-ms origin typical of a time axis (must be non-zero for the bug to surface). */
const TIME_ORIGIN_MS = 1_700_000_000_000;

function makeScale(domainMin: number, domainMax: number): LinearScale {
  const rangeMin = 0;
  const rangeMax = 1000;
  const span = domainMax - domainMin || 1;
  return {
    scale: (v: number) =>
      rangeMin + ((v - domainMin) / span) * (rangeMax - rangeMin),
    invert: (v: number) =>
      domainMin + ((v - rangeMin) / (rangeMax - rangeMin || 1)) * span,
    domain: () => [domainMin, domainMax] as [number, number],
    range: () => [rangeMin, rangeMax] as [number, number],
  } as unknown as LinearScale;
}

function makeGridArea(): GridArea {
  return {
    x: 40,
    y: 20,
    width: 960,
    height: 520,
    canvasWidth: 1000,
    canvasHeight: 560,
    devicePixelRatio: 1,
  } as GridArea;
}

function makeLineSeries(
  data: ReadonlyArray<readonly [number, number]>,
): ResolvedSeriesConfig {
  return {
    type: "line",
    id: "s0",
    name: "s0",
    data,
    rawData: data,
    sampling: "lttb",
    // Force decimation path: targetBuckets << point count
    samplingThreshold: 8,
    connectNulls: false,
    show: true,
    lineStyle: { color: "#0f0", width: 1 },
    yAxis: "y",
  } as unknown as ResolvedSeriesConfig;
}

describe("prepareSeries GPU decimation (WG-P0-1 xOffset)", () => {
  it("passes the packing xOffset (first finite time) into line.prepare for the decimated buffer", () => {
    const points: Array<[number, number]> = [];
    for (let i = 0; i < 64; i++) {
      points.push([TIME_ORIGIN_MS + i * 1000, Math.sin(i / 5)]);
    }
    const series = makeLineSeries(points);

    const rawBuffer = { label: "raw" } as unknown as GPUBuffer;
    const decimatedBuffer = { label: "decimated" } as unknown as GPUBuffer;

    const linePrepare = vi.fn();
    const decimationPrepare = vi.fn(() => 8);
    const setSeries = vi.fn();

    const dataStore: DataStore = {
      setSeries,
      appendSeries: vi.fn(),
      removeSeries: vi.fn(),
      getSeriesBuffer: vi.fn(() => rawBuffer),
      getSeriesPointCount: vi.fn(() => points.length),
      getSeriesRingLayout: vi.fn(() => ({ start: 0, capacity: 0 })),
      getSeriesContentHash: vi.fn(() => 0xabc),
      getSeriesStagingBuffer: vi.fn(() => new Float32Array(0)),
      dispose: vi.fn(),
    };

    const renderers: SeriesRenderers = {
      lineRenderers: [
        {
          prepare: linePrepare,
          render: vi.fn(),
          dispose: vi.fn(),
        } as any,
      ],
      areaRenderers: [],
      barRenderer: { prepare: vi.fn(), render: vi.fn(), dispose: vi.fn() } as any,
      scatterRenderers: [],
      scatterDensityRenderers: [],
      pieRenderers: [],
      candlestickRenderers: [],
      decimationComputes: [
        {
          prepare: decimationPrepare,
          encodeCompute: vi.fn(),
          getOutputBuffer: vi.fn(() => decimatedBuffer),
          getOutputPointCount: vi.fn(() => 8),
          dispose: vi.fn(),
        },
      ],
    };

    const context: SeriesPrepareContext = {
      currentOptions: {
        xAxis: { type: "time" },
        yAxes: [{ id: "y", min: -1 }],
        series: [series],
      } as any,
      seriesForRender: [series],
      xScale: makeScale(TIME_ORIGIN_MS, TIME_ORIGIN_MS + 63_000),
      yScales: new Map([["y", makeScale(-1, 1)]]),
      gridArea: makeGridArea(),
      dataStore,
      appendedGpuThisFrame: new Set(),
      gpuSeriesKindByIndex: ["unknown"],
      zoomState: null,
      visibleXDomain: {
        min: TIME_ORIGIN_MS,
        max: TIME_ORIGIN_MS + 63_000,
      },
      introPhase: "done",
      introProgress01: 1,
      withAlpha: (c: string) => c,
      maxRadiusCss: 4,
      lastSetSeriesCache: new Map(),
      filterGapsCache: createFilterGapsCache(),
    };

    prepareSeries(renderers, context);

    expect(setSeries).toHaveBeenCalled();
    const setOpts = setSeries.mock.calls[0]![2] as { xOffset?: number };
    expect(setOpts.xOffset).toBe(TIME_ORIGIN_MS);

    expect(decimationPrepare).toHaveBeenCalled();
    expect(linePrepare).toHaveBeenCalledTimes(1);
    // prepare(series, buffer, xScale, yScale, xOffset, ...)
    const xOffsetArg = linePrepare.mock.calls[0]![4] as number;
    expect(xOffsetArg).toBe(TIME_ORIGIN_MS);
    // Must use the decimated output buffer, not the raw one.
    expect(linePrepare.mock.calls[0]![1]).toBe(decimatedBuffer);
  });

  it("still passes xOffset=0 for non-time axes on the decimated path", () => {
    const points: Array<[number, number]> = [];
    for (let i = 0; i < 64; i++) {
      points.push([i, Math.sin(i / 5)]);
    }
    const series = makeLineSeries(points);

    const rawBuffer = { label: "raw" } as unknown as GPUBuffer;
    const decimatedBuffer = { label: "decimated" } as unknown as GPUBuffer;
    const linePrepare = vi.fn();
    const decimationPrepare = vi.fn(() => 8);

    const dataStore: DataStore = {
      setSeries: vi.fn(),
      appendSeries: vi.fn(),
      removeSeries: vi.fn(),
      getSeriesBuffer: vi.fn(() => rawBuffer),
      getSeriesPointCount: vi.fn(() => points.length),
      getSeriesRingLayout: vi.fn(() => ({ start: 0, capacity: 0 })),
      getSeriesContentHash: vi.fn(() => 0x1),
      getSeriesStagingBuffer: vi.fn(() => new Float32Array(0)),
      dispose: vi.fn(),
    };

    const renderers: SeriesRenderers = {
      lineRenderers: [
        {
          prepare: linePrepare,
          render: vi.fn(),
          dispose: vi.fn(),
        } as any,
      ],
      areaRenderers: [],
      barRenderer: { prepare: vi.fn(), render: vi.fn(), dispose: vi.fn() } as any,
      scatterRenderers: [],
      scatterDensityRenderers: [],
      pieRenderers: [],
      candlestickRenderers: [],
      decimationComputes: [
        {
          prepare: decimationPrepare,
          encodeCompute: vi.fn(),
          getOutputBuffer: vi.fn(() => decimatedBuffer),
          getOutputPointCount: vi.fn(() => 8),
          dispose: vi.fn(),
        },
      ],
    };

    prepareSeries(renderers, {
      currentOptions: {
        xAxis: { type: "value" },
        yAxes: [{ id: "y", min: -1 }],
        series: [series],
      } as any,
      seriesForRender: [series],
      xScale: makeScale(0, 63),
      yScales: new Map([["y", makeScale(-1, 1)]]),
      gridArea: makeGridArea(),
      dataStore,
      appendedGpuThisFrame: new Set(),
      gpuSeriesKindByIndex: ["unknown"],
      zoomState: null,
      visibleXDomain: { min: 0, max: 63 },
      introPhase: "done",
      introProgress01: 1,
      withAlpha: (c: string) => c,
      maxRadiusCss: 4,
      lastSetSeriesCache: new Map(),
      filterGapsCache: createFilterGapsCache(),
    });

    const xOffsetArg = linePrepare.mock.calls[0]![4] as number;
    expect(xOffsetArg).toBe(0);
  });

  it("passes ringStart/ringCapacity from getSeriesRingLayout and uses visible range on ring raw", () => {
    const points: Array<[number, number]> = [];
    for (let i = 0; i < 64; i++) {
      points.push([i, Math.sin(i / 5)]);
    }
    const series = makeLineSeries(points);

    const rawBuffer = { label: "raw" } as unknown as GPUBuffer;
    const decimatedBuffer = { label: "decimated" } as unknown as GPUBuffer;
    const linePrepare = vi.fn();
    const decimationPrepare = vi.fn(() => 8);

    const dataStore: DataStore = {
      setSeries: vi.fn(),
      appendSeries: vi.fn(),
      removeSeries: vi.fn(),
      getSeriesBuffer: vi.fn(() => rawBuffer),
      getSeriesPointCount: vi.fn(() => points.length),
      getSeriesRingLayout: vi.fn(() => ({ start: 3, capacity: 16 })),
      getSeriesContentHash: vi.fn(() => 0x99),
      getSeriesStagingBuffer: vi.fn(() => new Float32Array(0)),
      dispose: vi.fn(),
    };

    prepareSeries(
      {
        lineRenderers: [
          {
            prepare: linePrepare,
            render: vi.fn(),
            dispose: vi.fn(),
          } as any,
        ],
        areaRenderers: [],
        barRenderer: {
          prepare: vi.fn(),
          render: vi.fn(),
          dispose: vi.fn(),
        } as any,
        scatterRenderers: [],
        scatterDensityRenderers: [],
        pieRenderers: [],
        candlestickRenderers: [],
        decimationComputes: [
          {
            prepare: decimationPrepare,
            encodeCompute: vi.fn(),
            getOutputBuffer: vi.fn(() => decimatedBuffer),
            getOutputPointCount: vi.fn(() => 8),
            dispose: vi.fn(),
          },
        ],
      },
      {
        currentOptions: {
          xAxis: { type: "value" },
          yAxes: [{ id: "y", min: -1 }],
          series: [series],
        } as any,
        seriesForRender: [series],
        xScale: makeScale(0, 63),
        yScales: new Map([["y", makeScale(-1, 1)]]),
        gridArea: makeGridArea(),
        dataStore,
        appendedGpuThisFrame: new Set(),
        gpuSeriesKindByIndex: ["unknown"],
        zoomState: null,
        // Zoom into the middle so visible range is not full [0, 64)
        visibleXDomain: { min: 10, max: 40 },
        introPhase: "done",
        introProgress01: 1,
        withAlpha: (c: string) => c,
        maxRadiusCss: 4,
        lastSetSeriesCache: new Map(),
        filterGapsCache: createFilterGapsCache(),
      },
    );

    expect(decimationPrepare).toHaveBeenCalled();
    const args = decimationPrepare.mock.calls[0]![0] as {
      ringStart?: number;
      ringCapacity?: number;
      visibleStart: number;
      visibleEnd: number;
    };
    expect(args.ringStart).toBe(3);
    expect(args.ringCapacity).toBe(16);
    // Visible range from binary search on raw (not forced full [0, N)).
    expect(args.visibleStart).toBeGreaterThanOrEqual(10);
    expect(args.visibleEnd).toBeLessThanOrEqual(41);
    expect(args.visibleEnd).toBeGreaterThan(args.visibleStart);
  });

  it("falls back to full visible range when rawDataForGpu is null and still forwards ring uniforms", () => {
    // hasNullGaps(null) returns false → eligibility can pass with rawData null.
    // Skip setSeries (would getPointCount(null)) via appendedGpuThisFrame.
    const points: Array<[number, number]> = [];
    for (let i = 0; i < 64; i++) {
      points.push([i, Math.sin(i / 5)]);
    }
    const series = {
      ...makeLineSeries(points),
      rawData: null as unknown as typeof points,
      data: points,
    };

    const rawBuffer = { label: "raw" } as unknown as GPUBuffer;
    const decimatedBuffer = { label: "decimated" } as unknown as GPUBuffer;
    const linePrepare = vi.fn();
    const decimationPrepare = vi.fn(() => 8);
    const rawPointCount = 64;

    const dataStore: DataStore = {
      setSeries: vi.fn(),
      appendSeries: vi.fn(),
      removeSeries: vi.fn(),
      getSeriesBuffer: vi.fn(() => rawBuffer),
      getSeriesPointCount: vi.fn(() => rawPointCount),
      getSeriesRingLayout: vi.fn(() => ({ start: 5, capacity: 32 })),
      getSeriesContentHash: vi.fn(() => 0x42),
      getSeriesStagingBuffer: vi.fn(() => new Float32Array(0)),
      dispose: vi.fn(),
    };

    prepareSeries(
      {
        lineRenderers: [
          {
            prepare: linePrepare,
            render: vi.fn(),
            dispose: vi.fn(),
          } as any,
        ],
        areaRenderers: [],
        barRenderer: {
          prepare: vi.fn(),
          render: vi.fn(),
          dispose: vi.fn(),
        } as any,
        scatterRenderers: [],
        scatterDensityRenderers: [],
        pieRenderers: [],
        candlestickRenderers: [],
        decimationComputes: [
          {
            prepare: decimationPrepare,
            encodeCompute: vi.fn(),
            getOutputBuffer: vi.fn(() => decimatedBuffer),
            getOutputPointCount: vi.fn(() => 8),
            dispose: vi.fn(),
          },
        ],
      },
      {
        currentOptions: {
          xAxis: { type: "value" },
          yAxes: [{ id: "y", min: -1 }],
          series: [series],
        } as any,
        seriesForRender: [series],
        xScale: makeScale(0, 63),
        yScales: new Map([["y", makeScale(-1, 1)]]),
        gridArea: makeGridArea(),
        dataStore,
        appendedGpuThisFrame: new Set([0]),
        gpuSeriesKindByIndex: ["gpuDecimationRaw"],
        zoomState: null,
        visibleXDomain: { min: 10, max: 40 },
        introPhase: "done",
        introProgress01: 1,
        withAlpha: (c: string) => c,
        maxRadiusCss: 4,
        lastSetSeriesCache: new Map(),
        filterGapsCache: createFilterGapsCache(),
      },
    );

    expect(decimationPrepare).toHaveBeenCalled();
    const args = decimationPrepare.mock.calls[0]![0] as {
      ringStart?: number;
      ringCapacity?: number;
      visibleStart: number;
      visibleEnd: number;
    };
    expect(args.ringStart).toBe(5);
    expect(args.ringCapacity).toBe(32);
    // Full-range fallback when raw is null (ignores zoom domain).
    expect(args.visibleStart).toBe(0);
    expect(args.visibleEnd).toBe(rawPointCount);
  });
});
