import { describe, it, expect } from "vitest";
import {
  cheapCartesianContentStamp,
  cheapOHLCContentStamp,
  hashCartesianSeriesData,
  hashOHLCSeriesData,
} from "../seriesContentHash";
import type { DataPoint } from "../../config/types";

describe("seriesContentHash", () => {
  it("cheapCartesianContentStamp is O(1) and changes across calls", () => {
    const data: DataPoint[] = [
      [0, 1],
      [1, 2],
    ];
    const a = cheapCartesianContentStamp(data);
    const b = cheapCartesianContentStamp(data);
    expect(a).not.toBe(b);
    expect(typeof a).toBe("number");
  });

  it("cheapOHLCContentStamp changes across calls of same length", () => {
    const data = [
      { timestamp: 1, open: 1, high: 2, low: 0, close: 1.5 },
    ] as const;
    const a = cheapOHLCContentStamp(data);
    const b = cheapOHLCContentStamp(data);
    expect(a).not.toBe(b);
  });

  it("is stable for identical cartesian content", () => {
    const a: DataPoint[] = [
      [0, 1],
      [1, 2],
      [2, 3],
    ];
    const b: DataPoint[] = [
      [0, 1],
      [1, 2],
      [2, 3],
    ];
    expect(hashCartesianSeriesData(a)).toBe(hashCartesianSeriesData(b));
  });

  it("changes when a value mutates under the same array ref", () => {
    const data: DataPoint[] = [
      [0, 1],
      [1, 2],
      [2, 3],
    ];
    const before = hashCartesianSeriesData(data);
    (data[1] as [number, number])[1] = 42;
    const after = hashCartesianSeriesData(data);
    expect(after).not.toBe(before);
  });

  it("includes NaN gap structure", () => {
    const withGap = {
      x: [0, 1, 2],
      y: [1, Number.NaN, 3],
    };
    const noGap = {
      x: [0, 1, 2],
      y: [1, 2, 3],
    };
    expect(hashCartesianSeriesData(withGap)).not.toBe(
      hashCartesianSeriesData(noGap),
    );
  });

  it("hashes OHLC series", () => {
    const a = [
      { timestamp: 1, open: 1, high: 2, low: 0, close: 1.5 },
      { timestamp: 2, open: 1.5, high: 3, low: 1, close: 2 },
    ] as const;
    const b = [
      { timestamp: 1, open: 1, high: 2, low: 0, close: 1.5 },
      { timestamp: 2, open: 1.5, high: 3, low: 1, close: 2 },
    ] as const;
    expect(hashOHLCSeriesData(a)).toBe(hashOHLCSeriesData(b));
    const c = [
      { timestamp: 1, open: 1, high: 2, low: 0, close: 1.5 },
      { timestamp: 2, open: 1.5, high: 3, low: 1, close: 9 },
    ] as const;
    expect(hashOHLCSeriesData(c)).not.toBe(hashOHLCSeriesData(a));
  });
});
