/**
 * Detect full-series rewrite shapes for setOption fast paths.
 *
 * Used when harnesses regenerate a new data array every frame (SciChart suite
 * groups 2/3/4). Detection must not false-positive Brownian scatter (x and y
 * both change) as y-only.
 *
 * @module seriesRewriteDetect
 * @internal
 */

import type { CartesianSeriesData } from "../config/types";
import { getPointCount, getX, getY } from "./cartesianData";

/**
 * True when every finite x equals its index (0..n-1) within a tight epsilon.
 * Matches SciChart group 4 (`x = i`) without matching Brownian scatter (group 2).
 *
 * Samples endpoints + mid first for a cheap reject, then verifies all points.
 * Empty series returns false (no meaningful y-only path).
 */
export function isIndexSortedX(data: CartesianSeriesData): boolean {
  const n = getPointCount(data);
  if (n <= 0) return false;

  // Cheap reject: endpoints and midpoint must already look like indices.
  const samples = n === 1 ? [0] : n === 2 ? [0, 1] : [0, (n / 2) | 0, n - 1];
  for (let s = 0; s < samples.length; s++) {
    const i = samples[s]!;
    const x = getX(data, i);
    if (!Number.isFinite(x) || Math.abs(x - i) > 1e-6) return false;
  }

  for (let i = 0; i < n; i++) {
    const x = getX(data, i);
    if (!Number.isFinite(x) || Math.abs(x - i) > 1e-6) return false;
  }
  return true;
}

/**
 * Compare x channel of `next` against interleaved staging `[x0,y0,x1,y1,...]`
 * packed with the same `xOffset`. Returns true only when lengths match and every
 * finite x equals the prior packed x (y may differ).
 *
 * Used for y-only GPU rewrites without false-positiving Brownian xy updates.
 */
export function isYOnlyRewriteAgainstStaging(
  next: CartesianSeriesData,
  staging: Float32Array,
  pointCount: number,
  xOffset: number,
): boolean {
  const n = getPointCount(next);
  if (n !== pointCount || n <= 0) return false;
  if (staging.length < n * 2) return false;

  for (let i = 0; i < n; i++) {
    const x = getX(next, i);
    const prevX = staging[i * 2]! + xOffset;
    // NaN x on either side: treat as not y-only (gap structure may have moved).
    if (!Number.isFinite(x) || !Number.isFinite(prevX)) return false;
    if (x !== prevX) return false;
  }
  return true;
}

/**
 * Pack only the y channel into an existing interleaved staging buffer, leaving
 * x (and any padding beyond `pointCount`) untouched. `out` must already hold
 * valid x values for `pointCount` points.
 */
export function packYOnlyInto(
  out: Float32Array,
  src: CartesianSeriesData,
  pointCount: number,
): void {
  const n = Math.min(pointCount, getPointCount(src));
  for (let i = 0; i < n; i++) {
    out[i * 2 + 1] = getY(src, i);
  }
}
