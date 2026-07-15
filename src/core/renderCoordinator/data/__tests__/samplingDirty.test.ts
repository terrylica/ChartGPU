/**
 * P1-7: sampling dirty flags + presentation patch without re-sample.
 */

import { describe, it, expect, vi } from "vitest";
import {
  didSeriesDataLikelyChange,
  didSamplingConfigChange,
  shouldRecomputeBaselineSampling,
  patchSeriesPresentationKeepingSampledData,
  lineHasAreaStyle,
} from "../samplingDirty";
import {
  resolveOptions,
  canReuseResolvedSeriesSample,
  type ResolvedSeriesConfig,
} from "../../../../config/OptionResolver";
import * as sampleSeriesModule from "../../../../data/sampleSeries";
import { hashCartesianSeriesData } from "../../../../data/seriesContentHash";
import type { DataPoint } from "../../../../config/types";

function lineSeries(
  data: ReadonlyArray<DataPoint>,
  extra: Record<string, unknown> = {},
): ResolvedSeriesConfig {
  const contentHash =
    typeof extra.contentHash === "number"
      ? (extra.contentHash as number)
      : hashCartesianSeriesData(data as DataPoint[]);
  return {
    type: "line",
    name: "s",
    data,
    rawData: data,
    color: "#0af",
    lineStyle: { width: 2, opacity: 1, color: "#0af" },
    sampling: "lttb",
    samplingThreshold: 5000,
    connectNulls: false,
    yAxis: "y",
    visible: true,
    contentHash,
    ...extra,
  } as ResolvedSeriesConfig;
}

describe("samplingDirty predicates (P1-7)", () => {
  it("didSeriesDataLikelyChange is false for same data refs and same contentHash", () => {
    const data: DataPoint[] = [
      [0, 1],
      [1, 2],
      [2, 3],
    ];
    const h = hashCartesianSeriesData(data);
    const a = [lineSeries(data, { contentHash: h })];
    const b = [lineSeries(data, { color: "#f00", name: "renamed", contentHash: h })];
    expect(didSeriesDataLikelyChange(a, b)).toBe(false);
  });

  it("didSeriesDataLikelyChange is true when data ref changes", () => {
    const a = [lineSeries([[0, 1], [1, 2]])];
    const b = [lineSeries([[0, 1], [1, 9]])];
    expect(didSeriesDataLikelyChange(a, b)).toBe(true);
  });

  it("didSeriesDataLikelyChange is true when contentHash differs under same ref", () => {
    const data: DataPoint[] = [
      [0, 1],
      [1, 2],
      [2, 3],
    ];
    const before = hashCartesianSeriesData(data);
    const a = [lineSeries(data, { contentHash: before })];
    // In-place mutation
    (data[1] as [number, number])[1] = 99;
    const after = hashCartesianSeriesData(data);
    expect(after).not.toBe(before);
    const b = [lineSeries(data, { contentHash: after })];
    expect(didSeriesDataLikelyChange(a, b)).toBe(true);
  });

  it("didSamplingConfigChange detects sampling threshold change", () => {
    const data: DataPoint[] = [[0, 1], [1, 2]];
    const a = [lineSeries(data, { samplingThreshold: 1000 })];
    const b = [lineSeries(data, { samplingThreshold: 2000 })];
    expect(didSamplingConfigChange(a, b)).toBe(true);
    expect(shouldRecomputeBaselineSampling(a, b)).toBe(true);
  });

  it("didSamplingConfigChange detects line areaStyle presence flip", () => {
    const data: DataPoint[] = [[0, 1], [1, 2], [2, 3]];
    const without = [lineSeries(data)];
    const withFill = [
      lineSeries(data, {
        areaStyle: { opacity: 0.3, color: "#0af" },
      }),
    ];
    expect(lineHasAreaStyle(without[0])).toBe(false);
    expect(lineHasAreaStyle(withFill[0])).toBe(true);
    expect(didSamplingConfigChange(without, withFill)).toBe(true);
    expect(didSamplingConfigChange(withFill, without)).toBe(true);
    expect(shouldRecomputeBaselineSampling(without, withFill)).toBe(true);
    // Color-only presentation still clean when areaStyle stays present.
    const withFillOtherColor = [
      lineSeries(data, {
        areaStyle: { opacity: 0.3, color: "#f00" },
        color: "#f00",
      }),
    ];
    expect(didSamplingConfigChange(withFill, withFillOtherColor)).toBe(false);
  });

  it("shouldRecomputeBaselineSampling is false for presentation-only", () => {
    const data: DataPoint[] = [[0, 1], [1, 2], [2, 3]];
    const a = [lineSeries(data, { color: "#0af" })];
    const b = [lineSeries(data, { color: "#f0f", name: "Theme update" })];
    expect(shouldRecomputeBaselineSampling(a, b)).toBe(false);
  });

  it("patchSeriesPresentationKeepingSampledData reuses sampled data ref", () => {
    const raw: DataPoint[] = Array.from({ length: 100 }, (_, i) => [
      i,
      Math.sin(i),
    ]);
    const sampled: DataPoint[] = [
      [0, 0],
      [50, 1],
      [99, 0],
    ];
    const h = hashCartesianSeriesData(raw);
    const previous = [
      lineSeries(raw, {
        data: sampled,
        rawData: raw,
        color: "#0af",
        contentHash: h,
      }),
    ];
    const nextMeta = [
      lineSeries(raw, {
        data: raw, // would-be re-sampled placeholder
        rawData: raw,
        color: "#ff0",
        name: "after theme",
        contentHash: h,
      }),
    ];
    const patched = patchSeriesPresentationKeepingSampledData(
      nextMeta,
      previous,
    );
    expect(patched[0]!.color).toBe("#ff0");
    expect((patched[0] as { name?: string }).name).toBe("after theme");
    expect((patched[0] as { data: unknown }).data).toBe(sampled);
    expect((patched[0] as { rawData: unknown }).rawData).toBe(raw);
    expect((patched[0] as { contentHash?: number }).contentHash).toBe(h);
  });
});

describe("setOptions presentation-only Y bounds (P1-7 regression)", () => {
  it("coordinator presentation-only branch refills visible Y bounds cache (structural)", async () => {
    // Theme/color setOptions clears cachedVisibleYBoundsByAxis then must
    // call recomputeCachedVisibleYBoundsIfNeeded on the non-resample path.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../../createRenderCoordinator.ts"),
      "utf8",
    );
    const marker = "Presentation-only: patch series metadata";
    const idx = src.indexOf(marker);
    expect(idx).toBeGreaterThan(-1);
    const branchEnd = src.indexOf("Tooltip enablement may change at runtime", idx);
    const branch = src.slice(idx, branchEnd > idx ? branchEnd : idx + 1200);
    expect(branch).toMatch(/recomputeCachedVisibleYBoundsIfNeeded\s*\(\s*\)/);
  });
});

describe("OptionResolver sample reuse (P1-7)", () => {
  it("reuses previous sampled data when raw ref, content, and sampling are unchanged", () => {
    const data: DataPoint[] = Array.from({ length: 200 }, (_, i) => [
      i,
      i % 17,
    ]);
    const first = resolveOptions({
      series: [{ type: "line", data, sampling: "lttb", samplingThreshold: 20 }],
    });
    const sampledRef = first.series[0]!.data;

    const spy = vi.spyOn(sampleSeriesModule, "sampleSeriesDataPoints");
    const second = resolveOptions(
      {
        theme: "light",
        series: [
          {
            type: "line",
            data,
            sampling: "lttb",
            samplingThreshold: 20,
            color: "#c0ffee",
          },
        ],
      },
      { previousResolved: first },
    );
    expect(spy).not.toHaveBeenCalled();
    expect(second.series[0]!.data).toBe(sampledRef);
    expect(second.series[0]!.color).toBe("#c0ffee");
    spy.mockRestore();
  });

  it("re-samples when data array identity changes", () => {
    const data1: DataPoint[] = Array.from({ length: 200 }, (_, i) => [i, i]);
    const data2: DataPoint[] = Array.from({ length: 200 }, (_, i) => [i, i * 2]);
    const first = resolveOptions({
      series: [{ type: "line", data: data1, sampling: "lttb", samplingThreshold: 20 }],
    });
    const spy = vi.spyOn(sampleSeriesModule, "sampleSeriesDataPoints");
    resolveOptions(
      {
        series: [
          { type: "line", data: data2, sampling: "lttb", samplingThreshold: 20 },
        ],
      },
      { previousResolved: first },
    );
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("re-samples when values mutate in place under the same array ref", () => {
    const data: DataPoint[] = Array.from({ length: 200 }, (_, i) => [i, i]);
    const first = resolveOptions({
      series: [{ type: "line", data, sampling: "lttb", samplingThreshold: 20 }],
    });
    const firstSampled = first.series[0]!.data;
    // Mutate under stable ref (historical setOption contract).
    (data[50] as [number, number])[1] = 99999;

    const spy = vi.spyOn(sampleSeriesModule, "sampleSeriesDataPoints");
    const second = resolveOptions(
      {
        series: [
          { type: "line", data, sampling: "lttb", samplingThreshold: 20 },
        ],
      },
      { previousResolved: first },
    );
    expect(spy).toHaveBeenCalled();
    expect(second.series[0]!.data).not.toBe(firstSampled);
    spy.mockRestore();
  });

  it("canReuseResolvedSeriesSample gates correctly", () => {
    const data: DataPoint[] = [[0, 1], [1, 2]];
    const resolved = resolveOptions({
      series: [{ type: "line", data, sampling: "none" }],
    }).series[0]!;
    const hash = hashCartesianSeriesData(data);
    expect(
      canReuseResolvedSeriesSample(
        resolved,
        "line",
        data,
        "none",
        5000,
        false,
        hash,
      ),
    ).toBe(true);
    expect(
      canReuseResolvedSeriesSample(
        resolved,
        "line",
        data,
        "lttb",
        5000,
        false,
        hash,
      ),
    ).toBe(false);
    expect(
      canReuseResolvedSeriesSample(
        resolved,
        "line",
        [[0, 9]],
        "none",
        5000,
        false,
        hashCartesianSeriesData([[0, 9]]),
      ),
    ).toBe(false);
    // Wrong hash → no reuse even with same ref
    expect(
      canReuseResolvedSeriesSample(
        resolved,
        "line",
        data,
        "none",
        5000,
        false,
        hash ^ 1,
      ),
    ).toBe(false);
  });
});
