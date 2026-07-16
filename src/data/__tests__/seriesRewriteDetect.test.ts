import { describe, it, expect } from "vitest";
import {
  isIndexSortedX,
  isYOnlyRewriteAgainstStaging,
  packYOnlyInto,
} from "../seriesRewriteDetect";
import type { DataPoint } from "../../config/types";

describe("seriesRewriteDetect", () => {
  describe("isIndexSortedX", () => {
    it("accepts x = i for sorted point series (group 4 shape)", () => {
      const data: DataPoint[] = [
        [0, 1.2],
        [1, 3.4],
        [2, 0.5],
        [3, 9],
      ];
      expect(isIndexSortedX(data)).toBe(true);
    });

    it("rejects Brownian scatter where x drifts (group 2 shape)", () => {
      const data: DataPoint[] = [
        [0.1, 1],
        [1.2, 2],
        [1.9, 3],
        [3.4, 4],
      ];
      expect(isIndexSortedX(data)).toBe(false);
    });

    it("rejects empty series", () => {
      expect(isIndexSortedX([])).toBe(false);
    });

    it("rejects single point with non-zero x", () => {
      expect(isIndexSortedX([[5, 1]])).toBe(false);
    });

    it("accepts single point at x=0", () => {
      expect(isIndexSortedX([[0, 42]])).toBe(true);
    });
  });

  describe("isYOnlyRewriteAgainstStaging", () => {
    it("detects y-only change against packed staging", () => {
      const staging = new Float32Array([0, 1, 1, 2, 2, 3]);
      const next: DataPoint[] = [
        [0, 10],
        [1, 20],
        [2, 30],
      ];
      expect(isYOnlyRewriteAgainstStaging(next, staging, 3, 0)).toBe(true);
    });

    it("rejects when any x changes (Brownian scatter)", () => {
      const staging = new Float32Array([0, 1, 1, 2, 2, 3]);
      const next: DataPoint[] = [
        [0.5, 10],
        [1, 20],
        [2, 30],
      ];
      expect(isYOnlyRewriteAgainstStaging(next, staging, 3, 0)).toBe(false);
    });

    it("rejects length mismatch", () => {
      const staging = new Float32Array([0, 1, 1, 2]);
      const next: DataPoint[] = [
        [0, 1],
        [1, 2],
        [2, 3],
      ];
      expect(isYOnlyRewriteAgainstStaging(next, staging, 2, 0)).toBe(false);
    });

    it("respects xOffset on staging", () => {
      const xOffset = 1000;
      const staging = new Float32Array([0, 1, 1, 2]); // packed as x - xOffset
      const next: DataPoint[] = [
        [1000, 9],
        [1001, 8],
      ];
      expect(isYOnlyRewriteAgainstStaging(next, staging, 2, xOffset)).toBe(
        true,
      );
    });
  });

  describe("packYOnlyInto", () => {
    it("updates only y floats", () => {
      const out = new Float32Array([0, 1, 1, 2, 2, 3]);
      packYOnlyInto(
        out,
        [
          [0, 10],
          [1, 20],
          [2, 30],
        ],
        3,
      );
      expect(Array.from(out)).toEqual([0, 10, 1, 20, 2, 30]);
    });
  });
});
