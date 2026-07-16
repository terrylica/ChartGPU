/**
 * Bounds computation utilities for the RenderCoordinator.
 *
 * These pure functions compute xMin/xMax/yMin/yMax bounds from data arrays
 * and aggregate bounds across series. They handle edge cases like empty data,
 * NaN/Infinity values, and zero-span domains.
 *
 * @module boundsComputation
 */

import type { OHLCDataPoint } from '../../../config/types';
import { isTupleOHLCDataPoint } from './dataPointUtils';

/**
 * Bounds type for min/max x and y values.
 */
type Bounds = Readonly<{
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}>;

/**
 * Extends bounds with OHLC candlestick data using low/high values.
 * If bounds is null, initializes bounds from OHLC points.
 *
 * @param bounds - Existing bounds or null
 * @param points - OHLC points (timestamp, open, high, low, close)
 * @returns Updated bounds or original bounds if no finite points
 */
export const extendBoundsWithOHLCDataPoints = (
  bounds: Bounds | null,
  points: ReadonlyArray<OHLCDataPoint>
): Bounds | null => {
  if (points.length === 0) return bounds;

  let xMin = bounds?.xMin ?? Number.POSITIVE_INFINITY;
  let xMax = bounds?.xMax ?? Number.NEGATIVE_INFINITY;
  let yMin = bounds?.yMin ?? Number.POSITIVE_INFINITY;
  let yMax = bounds?.yMax ?? Number.NEGATIVE_INFINITY;

  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const timestamp = isTupleOHLCDataPoint(p) ? p[0] : p.timestamp;
    const low = isTupleOHLCDataPoint(p) ? p[3] : p.low;
    const high = isTupleOHLCDataPoint(p) ? p[4] : p.high;

    if (!Number.isFinite(timestamp) || !Number.isFinite(low) || !Number.isFinite(high)) continue;
    if (timestamp < xMin) xMin = timestamp;
    if (timestamp > xMax) xMax = timestamp;
    if (low < yMin) yMin = low;
    if (high > yMax) yMax = high;
  }

  if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || !Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    return bounds;
  }

  // Keep bounds usable for downstream scale derivation.
  if (xMin === xMax) xMax = xMin + 1;
  if (yMin === yMax) yMax = yMin + 1;

  return { xMin, xMax, yMin, yMax };
};

/**
 * Ensures min ≤ max, handles infinities with defaults (0,1), handles zero-span domains.
 * Returns a usable domain for scale derivation.
 *
 * @param minCandidate - Candidate minimum value
 * @param maxCandidate - Candidate maximum value
 * @returns Normalized domain with min ≤ max, both finite
 */
export const normalizeDomain = (
  minCandidate: number,
  maxCandidate: number
): { readonly min: number; readonly max: number } => {
  let min = minCandidate;
  let max = maxCandidate;

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 1;
  }

  if (min === max) {
    max = min + 1;
  } else if (min > max) {
    const t = min;
    min = max;
    max = t;
  }

  return { min, max };
};
