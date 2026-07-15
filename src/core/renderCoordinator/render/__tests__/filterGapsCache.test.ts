/**
 * P2-12: filterGaps cache reuses filtered series until data ref changes.
 */

import { describe, it, expect } from "vitest";
import {
  createFilterGapsCache,
  getFilteredGapsCached,
} from "../filterGapsCache";
import { filterGaps } from "../../../../data/cartesianData";
import type { DataPoint } from "../../../../config/types";

describe("filterGapsCache (P2-12)", () => {
  it("returns same filtered array ref when data ref is unchanged", () => {
    const data: (DataPoint | null)[] = [
      [0, 1],
      null,
      [2, 3],
      null,
      [4, 5],
    ];
    const cache = createFilterGapsCache();
    const a = getFilteredGapsCached(cache, 0, data);
    const b = getFilteredGapsCached(cache, 0, data);
    expect(a).toBe(b);
    expect(a).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ]);
  });

  it("recomputes when data reference changes", () => {
    const data1: (DataPoint | null)[] = [[0, 1], null, [2, 3]];
    const data2: (DataPoint | null)[] = [[0, 1], null, [2, 9]];
    const cache = createFilterGapsCache();
    const a = getFilteredGapsCached(cache, 0, data1);
    const b = getFilteredGapsCached(cache, 0, data2);
    expect(a).not.toBe(b);
    expect(b).toEqual([
      [0, 1],
      [2, 9],
    ]);
  });

  it("isolates cache entries by series index", () => {
    const dataA: (DataPoint | null)[] = [[0, 1], null, [1, 2]];
    const dataB: (DataPoint | null)[] = [[0, 10], null, [1, 20]];
    const cache = createFilterGapsCache();
    const a1 = getFilteredGapsCached(cache, 0, dataA);
    const b1 = getFilteredGapsCached(cache, 1, dataB);
    const a2 = getFilteredGapsCached(cache, 0, dataA);
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b1);
  });

  it("matches uncached filterGaps result for object-array input", () => {
    const data: (DataPoint | null)[] = [
      { x: 0, y: 1 },
      null,
      { x: 2, y: 3 },
    ];
    const cache = createFilterGapsCache();
    const cached = getFilteredGapsCached(cache, 0, data);
    const direct = filterGaps(data);
    expect(cached).toEqual(direct);
  });

  it("matches filterGaps for XYArraysData with NaN gaps", () => {
    const data = {
      x: [0, 1, 2, 3],
      y: [1, Number.NaN, 3, 4],
    };
    const cache = createFilterGapsCache();
    const cached = getFilteredGapsCached(cache, 0, data);
    const again = getFilteredGapsCached(cache, 0, data);
    expect(cached).toBe(again);
    expect(cached).toEqual(filterGaps(data));
  });

  it("recomputes when the same data ref grows (streaming append)", () => {
    // MutableXYColumns-style: append mutates under stable object identity.
    const data = {
      x: [0, 1, 2],
      y: [1, Number.NaN, 3],
    };
    const cache = createFilterGapsCache();
    const before = getFilteredGapsCached(cache, 0, data);
    expect(before).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(getFilteredGapsCached(cache, 0, data)).toBe(before);

    // Same object ref, longer columns (flushPendingAppends path).
    data.x.push(3, 4);
    data.y.push(Number.NaN, 5);

    const after = getFilteredGapsCached(cache, 0, data);
    expect(after).not.toBe(before);
    expect(after).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ]);
    expect(after).toEqual(filterGaps(data));
    // Stable after growth until the next length change.
    expect(getFilteredGapsCached(cache, 0, data)).toBe(after);
  });

  it("recomputes when a DataPoint array grows under the same ref", () => {
    const data: (DataPoint | null)[] = [[0, 1], null, [2, 3]];
    const cache = createFilterGapsCache();
    const before = getFilteredGapsCached(cache, 0, data);
    data.push(null, [4, 5]);
    const after = getFilteredGapsCached(cache, 0, data);
    expect(after).not.toBe(before);
    expect(after).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ]);
  });

  it("explicit delete forces recompute after same-ref value mutation without length change", () => {
    const data = {
      x: [0, 1, 2],
      y: [1, Number.NaN, 3],
    };
    const cache = createFilterGapsCache();
    const before = getFilteredGapsCached(cache, 0, data);
    // In-place value mutation (update animation style) — length unchanged.
    data.y[2] = 99;
    // Without invalidation, length fingerprint would still hit.
    expect(getFilteredGapsCached(cache, 0, data)).toBe(before);
    cache.delete(0);
    const after = getFilteredGapsCached(cache, 0, data);
    expect(after).not.toBe(before);
    expect(after).toEqual([
      [0, 1],
      [2, 99],
    ]);
  });

  it("coordinator flushPendingAppends invalidates filterGapsCache per series (structural)", async () => {
    // Append mutates MutableXYColumns under a stable ref; the flush path must
    // delete the series' filterGapsCache entry (defense in depth with pointCount).
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../../createRenderCoordinator.ts"),
      "utf8",
    );
    const flushIdx = src.indexOf("const flushPendingAppends");
    expect(flushIdx).toBeGreaterThan(-1);
    // Look only inside flushPendingAppends body (until executeFlush).
    const executeFlushIdx = src.indexOf("const executeFlush", flushIdx);
    const flushBody = src.slice(
      flushIdx,
      executeFlushIdx > flushIdx ? executeFlushIdx : flushIdx + 8000,
    );
    expect(flushBody).toMatch(/filterGapsCache\.delete\(\s*seriesIndex\s*\)/);
    expect(flushBody).toMatch(/lastSetSeriesCache\.delete\(\s*seriesIndex\s*\)/);
  });
});
