import { describe, it, expect, vi } from "vitest";
import {
  resolveOptions,
  resolveSeriesContentHash,
  type ResolvedSeriesConfig,
} from "../OptionResolver";
import type { DataPoint, OHLCDataPoint } from "../types";
import { getPointCount } from "../../data/cartesianData";
import * as seriesContentHashModule from "../../data/seriesContentHash";

describe("OptionResolver - connectNulls", () => {
  it("defaults connectNulls to false for line series", () => {
    const resolved = resolveOptions({
      series: [
        {
          type: "line",
          data: [
            [0, 1],
            [1, 2],
          ],
        },
      ],
    });
    const series = resolved.series[0];
    expect(series.type).toBe("line");
    if (series.type === "line") {
      expect(series.connectNulls).toBe(false);
    }
  });

  it("resolves connectNulls: true for line series", () => {
    const resolved = resolveOptions({
      series: [
        {
          type: "line",
          data: [
            [0, 1],
            [1, 2],
          ],
          connectNulls: true,
        },
      ],
    });
    const series = resolved.series[0];
    if (series.type === "line") {
      expect(series.connectNulls).toBe(true);
    }
  });

  it("defaults connectNulls to false for area series", () => {
    const resolved = resolveOptions({
      series: [
        {
          type: "area",
          data: [
            [0, 1],
            [1, 2],
          ],
        },
      ],
    });
    const series = resolved.series[0];
    expect(series.type).toBe("area");
    if (series.type === "area") {
      expect(series.connectNulls).toBe(false);
    }
  });

  it("resolves connectNulls: true for area series", () => {
    const resolved = resolveOptions({
      series: [
        {
          type: "area",
          data: [
            [0, 1],
            [1, 2],
          ],
          connectNulls: true,
        },
      ],
    });
    const series = resolved.series[0];
    if (series.type === "area") {
      expect(series.connectNulls).toBe(true);
    }
  });
});

describe("OptionResolver - sampling bypass with gaps", () => {
  it("bypasses LTTB sampling when line data contains null gaps", () => {
    const dataWithGaps: (DataPoint | null)[] = [];
    for (let i = 0; i < 10000; i++) {
      dataWithGaps.push(i === 5000 ? null : [i, Math.sin(i)]);
    }
    const resolved = resolveOptions({
      series: [
        {
          type: "line",
          data: dataWithGaps,
          sampling: "lttb",
          samplingThreshold: 5000,
        },
      ],
    });
    const series = resolved.series[0];
    if (series.type === "line") {
      // Data should not be downsampled — null gaps must be preserved
      expect(getPointCount(series.data)).toBe(10000);
    }
  });

  it("bypasses LTTB sampling when area data contains null gaps", () => {
    const dataWithGaps: (DataPoint | null)[] = [];
    for (let i = 0; i < 10000; i++) {
      dataWithGaps.push(i === 5000 ? null : [i, Math.sin(i)]);
    }
    const resolved = resolveOptions({
      series: [
        {
          type: "area",
          data: dataWithGaps,
          sampling: "lttb",
          samplingThreshold: 5000,
        },
      ],
    });
    const series = resolved.series[0];
    if (series.type === "area") {
      // Data should not be downsampled — null gaps must be preserved
      expect(getPointCount(series.data)).toBe(10000);
    }
  });

  it("applies sampling normally when line data has no null gaps", () => {
    const data: DataPoint[] = [];
    for (let i = 0; i < 10000; i++) {
      data.push([i, Math.sin(i)]);
    }
    const resolved = resolveOptions({
      series: [
        {
          type: "line",
          data,
          sampling: "lttb",
          samplingThreshold: 5000,
        },
      ],
    });
    const series = resolved.series[0];
    if (series.type === "line") {
      expect(getPointCount(series.data)).toBeLessThanOrEqual(5000);
    }
  });

  it("applies sampling normally when area data has no null gaps", () => {
    const data: DataPoint[] = [];
    for (let i = 0; i < 10000; i++) {
      data.push([i, Math.sin(i)]);
    }
    const resolved = resolveOptions({
      series: [
        {
          type: "area",
          data,
          sampling: "lttb",
          samplingThreshold: 5000,
        },
      ],
    });
    const series = resolved.series[0];
    if (series.type === "area") {
      expect(getPointCount(series.data)).toBeLessThanOrEqual(5000);
    }
  });
});

describe("resolveSeriesContentHash", () => {
  it("reuses previous hash when type and raw data identity match", () => {
    const data: DataPoint[] = [
      [0, 1],
      [1, 2],
    ];
    const prev = {
      type: "line",
      rawData: data,
      data,
      contentHash: 0xabc,
    } as unknown as ResolvedSeriesConfig;
    let hashCalls = 0;
    const hash = resolveSeriesContentHash(prev, "line", data, () => {
      hashCalls++;
      return 0xdead;
    });
    expect(hash).toBe(0xabc);
    expect(hashCalls).toBe(0);
  });

  it("recomputes when data reference changes", () => {
    const prevData: DataPoint[] = [[0, 1]];
    const nextData: DataPoint[] = [[0, 2]];
    const prev = {
      type: "bar",
      rawData: prevData,
      data: prevData,
      contentHash: 1,
    } as unknown as ResolvedSeriesConfig;
    const hash = resolveSeriesContentHash(prev, "bar", nextData, () => 42);
    expect(hash).toBe(42);
  });

  it("recomputes when series type changes", () => {
    const data: DataPoint[] = [[0, 1]];
    const prev = {
      type: "line",
      rawData: data,
      data,
      contentHash: 7,
    } as unknown as ResolvedSeriesConfig;
    const hash = resolveSeriesContentHash(prev, "bar", data, () => 99);
    expect(hash).toBe(99);
  });

  it("recomputes when previous contentHash is missing", () => {
    const data: DataPoint[] = [[0, 1]];
    const prev = {
      type: "scatter",
      rawData: data,
      data,
    } as unknown as ResolvedSeriesConfig;
    const hash = resolveSeriesContentHash(prev, "scatter", data, () => 11);
    expect(hash).toBe(11);
  });
});

describe("OptionResolver candlestick contentHash reuse", () => {
  it("reuses OHLC contentHash without full scan on stable data ref", () => {
    const data: OHLCDataPoint[] = [
      [0, 1, 2, 0.5, 2.5],
      [1, 2, 1.5, 1, 2.2],
    ];
    // Suppress one-time candlestick warning.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const first = resolveOptions({
      series: [{ type: "candlestick", data, sampling: "none" }],
    });
    const hashSpy = vi.spyOn(seriesContentHashModule, "hashOHLCSeriesData");
    const second = resolveOptions(
      {
        series: [{ type: "candlestick", data, sampling: "none", color: "#f00" }],
        yAxis: { min: 0, max: 10 },
      },
      { previousResolved: first },
    );
    expect(hashSpy).not.toHaveBeenCalled();
    expect((second.series[0] as { contentHash?: number }).contentHash).toBe(
      (first.series[0] as { contentHash?: number }).contentHash,
    );
    hashSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
