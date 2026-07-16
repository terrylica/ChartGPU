/**
 * Internal cartesian data abstraction for CartesianSeriesData.
 *
 * Provides high-performance, allocation-minimizing primitives to support all three cartesian formats:
 * - ReadonlyArray<DataPoint> (tuple or object)
 * - XYArraysData (separate x/y/size arrays)
 * - InterleavedXYData (typed array view with [x0,y0,x1,y1,...] layout)
 *
 * DO NOT export from public entrypoint (src/index.ts). This is internal-only.
 *
 * @module cartesianData
 * @internal
 */

import type {
  CartesianSeriesData,
  DataPoint,
  XYArraysData,
  InterleavedXYData,
} from "../config/types";

/**
 * Bounds type for min/max x and y values.
 */
export type Bounds = Readonly<{
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}>;

/**
 * Type for typed arrays with numeric indexing (excluding DataView and BigInt arrays).
 * BigInt arrays are excluded because coordinates must be numbers, not bigints.
 */
type TypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array;

/**
 * Fixed-capacity modular ring used by FIFO streaming (`maxPoints`).
 * Chronological index `i` maps to physical `(start + i) % capacity`.
 * Internal-only — not part of the public CartesianSeriesData union, but accepted
 * at runtime by getX/getY/getPointCount so coordinator columns stay O(append).
 */
export type RingXYColumns = {
  readonly __ring: true;
  x: Float64Array;
  y: Float64Array;
  size?: Float64Array;
  start: number;
  count: number;
  capacity: number;
};

export function isRingXYColumns(data: unknown): data is RingXYColumns {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as RingXYColumns).__ring === true &&
    typeof (data as RingXYColumns).capacity === "number"
  );
}

/**
 * Type guard for XYArraysData format.
 */
function isXYArraysData(data: CartesianSeriesData): data is XYArraysData {
  // Ring columns also have x/y; detect them first so we don't treat modular
  // storage as linear XYArraysData (wrong length / indexing).
  if (isRingXYColumns(data)) return false;
  return (
    typeof data === "object" &&
    data !== null &&
    !Array.isArray(data) &&
    "x" in data &&
    "y" in data &&
    typeof (data as any).x === "object" &&
    typeof (data as any).y === "object" &&
    "length" in (data as any).x &&
    "length" in (data as any).y
  );
}

/**
 * Creates a fixed-capacity ring for FIFO streaming. Physical buffers are sized
 * to `capacity`; logical length starts at 0.
 */
export function createRingXYColumns(capacity: number): RingXYColumns {
  const cap = Math.max(1, capacity | 0);
  return {
    __ring: true,
    x: new Float64Array(cap),
    y: new Float64Array(cap),
    start: 0,
    count: 0,
    capacity: cap,
  };
}

/**
 * Appends points into a ring, applying the same drop/keep plan as
 * `planMaxPointsWindow`. Drop first, then write — O(keepNewCount) only.
 * Never rewrites the retained window.
 */
export function appendIntoRingXY(
  ring: RingXYColumns,
  src: CartesianSeriesData,
  newSrcOffset: number,
  keepNewCount: number,
  dropPrevCount: number,
): void {
  const cap = ring.capacity;
  if (dropPrevCount > 0) {
    if (dropPrevCount >= ring.count) {
      ring.start = 0;
      ring.count = 0;
    } else {
      ring.start = (ring.start + dropPrevCount) % cap;
      ring.count -= dropPrevCount;
    }
  }
  if (keepNewCount <= 0) return;
  // After drop, free space is enough for keepNewCount (plan guarantees
  // count + keepNewCount <= capacity). Write head is the first free slot.
  let write = (ring.start + ring.count) % cap;
  for (let i = 0; i < keepNewCount; i++) {
    const srcIdx = newSrcOffset + i;
    ring.x[write] = getX(src, srcIdx);
    ring.y[write] = getY(src, srcIdx);
    write++;
    if (write >= cap) write = 0;
  }
  ring.count = Math.min(cap, ring.count + keepNewCount);
}

/**
 * Type guard for InterleavedXYData format (ArrayBufferView).
 */
function isInterleavedXYData(
  data: CartesianSeriesData,
): data is InterleavedXYData {
  return (
    typeof data === "object" &&
    data !== null &&
    !Array.isArray(data) &&
    ArrayBuffer.isView(data)
  );
}

/**
 * Type guard for tuple DataPoint format.
 */
function isTupleDataPoint(
  p: DataPoint,
): p is readonly [number, number, number?] {
  return Array.isArray(p);
}

/**
 * Returns the number of points in the CartesianSeriesData.
 */
export function getPointCount(data: CartesianSeriesData): number {
  if (isRingXYColumns(data)) {
    return data.count;
  }
  if (isXYArraysData(data)) {
    // Use minimum of x and y array lengths for safety
    return Math.min(data.x.length, data.y.length);
  }

  if (isInterleavedXYData(data)) {
    // DataView is unsupported - throw clear error
    if (data instanceof DataView) {
      throw new Error(
        "DataView is not supported for InterleavedXYData. Use typed arrays (Float32Array, Float64Array, etc.).",
      );
    }
    // Interpret pointCount as floor(length/2), tolerant of odd length
    // Cast to typed array with numeric indexing after DataView check
    const arr = data as TypedArray;
    return Math.floor(arr.length / 2);
  }

  // ReadonlyArray<DataPoint>
  return data.length;
}

/**
 * Returns the x-coordinate of the point at index i.
 * Returns NaN if the point is undefined, null, or non-object (for DataPoint[] format).
 * This allows callers using `Number.isFinite()` to naturally skip missing points.
 */
export function getX(data: CartesianSeriesData, i: number): number {
  if (isRingXYColumns(data)) {
    if (i < 0 || i >= data.count) return NaN;
    return data.x[(data.start + i) % data.capacity]!;
  }
  if (isXYArraysData(data)) {
    return data.x[i]!;
  }

  if (isInterleavedXYData(data)) {
    if (data instanceof DataView) {
      throw new Error(
        "DataView is not supported for InterleavedXYData. Use typed arrays (Float32Array, Float64Array, etc.).",
      );
    }
    const arr = data as TypedArray;
    return arr[i * 2]!;
  }

  // ReadonlyArray<DataPoint>
  const p = data[i];
  // Guard against undefined/null/non-object entries (sparse arrays, holes)
  if (p === undefined || p === null || typeof p !== "object") {
    return NaN;
  }
  return isTupleDataPoint(p) ? p[0] : p.x;
}

/**
 * Returns the y-coordinate of the point at index i.
 * Returns NaN if the point is undefined, null, or non-object (for DataPoint[] format).
 * This allows callers using `Number.isFinite()` to naturally skip missing points.
 */
export function getY(data: CartesianSeriesData, i: number): number {
  if (isRingXYColumns(data)) {
    if (i < 0 || i >= data.count) return NaN;
    return data.y[(data.start + i) % data.capacity]!;
  }
  if (isXYArraysData(data)) {
    return data.y[i]!;
  }

  if (isInterleavedXYData(data)) {
    if (data instanceof DataView) {
      throw new Error(
        "DataView is not supported for InterleavedXYData. Use typed arrays (Float32Array, Float64Array, etc.).",
      );
    }
    const arr = data as TypedArray;
    return arr[i * 2 + 1]!;
  }

  // ReadonlyArray<DataPoint>
  const p = data[i];
  // Guard against undefined/null/non-object entries (sparse arrays, holes)
  if (p === undefined || p === null || typeof p !== "object") {
    return NaN;
  }
  return isTupleDataPoint(p) ? p[1] : p.y;
}

/**
 * Returns the size value of the point at index i, or undefined if not available.
 * Returns undefined if the point is undefined, null, or non-object (for DataPoint[] format).
 * Note: InterleavedXYData does NOT support interleaved size (use XYArraysData.size if needed).
 */
export function getSize(
  data: CartesianSeriesData,
  i: number,
): number | undefined {
  if (isRingXYColumns(data)) {
    if (!data.size || i < 0 || i >= data.count) return undefined;
    return data.size[(data.start + i) % data.capacity];
  }
  if (isXYArraysData(data)) {
    return data.size?.[i];
  }

  if (isInterleavedXYData(data)) {
    // Size is not interleaved in InterleavedXYData format
    return undefined;
  }

  // ReadonlyArray<DataPoint>
  const p = data[i];
  // Guard against undefined/null/non-object entries (sparse arrays, holes)
  if (p === undefined || p === null || typeof p !== "object") {
    return undefined;
  }
  return isTupleDataPoint(p) ? p[2] : p.size;
}

/**
 * Packs XY coordinates from CartesianSeriesData into a Float32Array in interleaved layout.
 *
 * Writes `pointCount` points starting at `srcPointOffset` in the source data
 * into `out` starting at `outFloatOffset` (measured in float32 elements, not bytes).
 *
 * Each point writes 2 floats: [x - xOffset, y].
 * Size dimension is NOT packed (use getSize() separately if needed).
 *
 * @param out - Target Float32Array to write into
 * @param outFloatOffset - Starting offset in `out` (in float32 elements)
 * @param src - Source CartesianSeriesData
 * @param srcPointOffset - Starting point index in source
 * @param pointCount - Number of points to pack
 * @param xOffset - Value to subtract from x coordinates (for Float32 precision preservation)
 */
export function packXYInto(
  out: Float32Array,
  outFloatOffset: number,
  src: CartesianSeriesData,
  srcPointOffset: number,
  pointCount: number,
  xOffset: number,
): void {
  const availablePoints = getPointCount(src) - srcPointOffset;
  const actualPointCount = Math.min(pointCount, availablePoints);

  if (actualPointCount <= 0) return;

  // Validate output buffer capacity
  const requiredOutLength = outFloatOffset + actualPointCount * 2;
  if (requiredOutLength > out.length) {
    throw new Error(
      `packXYInto: output buffer too small (need ${requiredOutLength} floats, have ${out.length})`,
    );
  }

  if (isRingXYColumns(src)) {
    const cap = src.capacity;
    let phys = (src.start + srcPointOffset) % cap;
    for (let i = 0; i < actualPointCount; i++) {
      const outIdx = outFloatOffset + i * 2;
      out[outIdx] = src.x[phys]! - xOffset;
      out[outIdx + 1] = src.y[phys]!;
      phys++;
      if (phys >= cap) phys = 0;
    }
    return;
  }

  if (isXYArraysData(src)) {
    // Fast path: bulk copy with xOffset adjustment
    for (let i = 0; i < actualPointCount; i++) {
      const srcIdx = srcPointOffset + i;
      const outIdx = outFloatOffset + i * 2;
      out[outIdx] = src.x[srcIdx]! - xOffset;
      out[outIdx + 1] = src.y[srcIdx]!;
    }
    return;
  }

  if (isInterleavedXYData(src)) {
    if (src instanceof DataView) {
      throw new Error(
        "DataView is not supported for InterleavedXYData. Use typed arrays (Float32Array, Float64Array, etc.).",
      );
    }

    const arr = src as TypedArray;

    // Fast path: bulk copy with xOffset adjustment
    for (let i = 0; i < actualPointCount; i++) {
      const srcIdx = (srcPointOffset + i) * 2;
      const outIdx = outFloatOffset + i * 2;
      out[outIdx] = arr[srcIdx]! - xOffset;
      out[outIdx + 1] = arr[srcIdx + 1]!;
    }
    return;
  }

  // ReadonlyArray<DataPoint> path
  for (let i = 0; i < actualPointCount; i++) {
    const srcIdx = srcPointOffset + i;
    const outIdx = outFloatOffset + i * 2;
    const p = src[srcIdx];

    // Guard against undefined/null/non-object entries (sparse arrays, holes)
    if (p === undefined || p === null || typeof p !== "object") {
      out[outIdx] = NaN;
      out[outIdx + 1] = NaN;
      continue;
    }

    const x = isTupleDataPoint(p) ? p[0] : p.x;
    const y = isTupleDataPoint(p) ? p[1] : p.y;

    out[outIdx] = x - xOffset;
    out[outIdx + 1] = y;
  }
}

/**
 * Computes xMin/xMax/yMin/yMax bounds from CartesianSeriesData.
 * Skips non-finite x or y values. Returns null if no finite points found.
 * Ensures xMin !== xMax and yMin !== yMax for scale derivation (expands max by +1 if needed).
 *
 * @param data - CartesianSeriesData in any supported format
 * @returns Bounds object or null if no finite points
 */
export function computeRawBoundsFromCartesianData(
  data: CartesianSeriesData,
): Bounds | null {
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;

  // Hoist type detection outside loop to avoid per-point type checks
  if (isRingXYColumns(data)) {
    const n = data.count;
    const cap = data.capacity;
    let phys = data.start;
    for (let i = 0; i < n; i++) {
      const x = data.x[phys]!;
      const y = data.y[phys]!;
      phys++;
      if (phys >= cap) phys = 0;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
  } else if (isXYArraysData(data)) {
    // Fast path for XYArraysData
    const count = Math.min(data.x.length, data.y.length);
    for (let i = 0; i < count; i++) {
      const x = data.x[i]!;
      const y = data.y[i]!;

      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
  } else if (isInterleavedXYData(data)) {
    // Fast path for InterleavedXYData
    if (data instanceof DataView) {
      throw new Error(
        "DataView is not supported for InterleavedXYData. Use typed arrays (Float32Array, Float64Array, etc.).",
      );
    }

    const arr = data as TypedArray;
    const count = Math.floor(arr.length / 2);

    for (let i = 0; i < count; i++) {
      const x = arr[i * 2]!;
      const y = arr[i * 2 + 1]!;

      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
  } else {
    // Array<DataPoint> path: use helper functions
    const count = data.length;
    for (let i = 0; i < count; i++) {
      const x = getX(data, i);
      const y = getY(data, i);

      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
  }

  if (
    !Number.isFinite(xMin) ||
    !Number.isFinite(xMax) ||
    !Number.isFinite(yMin) ||
    !Number.isFinite(yMax)
  ) {
    return null;
  }

  // Preserve existing behavior: if min==max, expand max by +1 for usability
  if (xMin === xMax) xMax = xMin + 1;
  if (yMin === yMax) yMax = yMin + 1;

  return { xMin, xMax, yMin, yMax };
}

/**
 * Returns true if a CartesianSeriesData array contains any null entries (gap markers).
 * Only applies to ReadonlyArray<DataPoint | null> format — XYArraysData and
 * InterleavedXYData cannot contain null entries and always return false.
 */
export function hasNullGaps(data: CartesianSeriesData): boolean {
  if (isRingXYColumns(data)) return false;
  if (!Array.isArray(data)) return false;
  return data.includes(null);
}

/**
 * Drops the oldest `dropCount` points from mutable x/y (and optional size) columns
 * in place via `copyWithin` — used by FIFO / maxPoints streaming without reallocating
 * the backing arrays when possible.
 */
export function dropPrefixXY(
  x: number[],
  y: number[],
  dropCount: number,
  size?: (number | undefined)[],
): void {
  if (dropCount <= 0) return;
  if (dropCount >= x.length) {
    x.length = 0;
    y.length = 0;
    if (size) size.length = 0;
    return;
  }
  x.copyWithin(0, dropCount);
  y.copyWithin(0, dropCount);
  x.length -= dropCount;
  y.length -= dropCount;
  if (size) {
    size.copyWithin(0, dropCount);
    size.length -= dropCount;
  }
}

/**
 * Removes null entries from a DataPoint array.
 * Used by connectNulls to strip gap markers before GPU upload,
 * so the line/area draws through gaps instead of breaking.
 */
export function filterNullGaps(
  data: ReadonlyArray<DataPoint | null>,
): ReadonlyArray<DataPoint> {
  return data.filter((p): p is DataPoint => p !== null);
}

/**
 * Removes gap entries (null or NaN) from any CartesianSeriesData format.
 *
 * Null entries in DataPoint[] arrays are a direct gap marker. NaN x/y values
 * in XYArraysData and InterleavedXYData arise when cartesianDataToMutableColumns
 * converts null DataPoint entries into NaN pairs for the columnar format.
 *
 * Used by connectNulls to strip all gap markers regardless of data format,
 * so the line/area draws through gaps instead of breaking.
 *
 * Returns a DataPointTuple[] with only finite-coordinate points.
 */
export function filterGaps(
  data: CartesianSeriesData,
): ReadonlyArray<DataPoint> {
  if (Array.isArray(data)) {
    // ReadonlyArray<DataPoint | null> — filter nulls and NaN entries
    return (data as ReadonlyArray<DataPoint | null>).filter(
      (p): p is DataPoint => {
        if (p === null || p === undefined) return false;
        if (typeof p !== "object") return false;
        const x = isTupleDataPoint(p) ? p[0] : p.x;
        const y = isTupleDataPoint(p) ? p[1] : p.y;
        return Number.isFinite(x) && Number.isFinite(y);
      },
    );
  }

  // XYArraysData or InterleavedXYData — filter out indices where x or y is NaN
  const count = getPointCount(data);
  const result: DataPoint[] = [];
  for (let i = 0; i < count; i++) {
    const x = getX(data, i);
    const y = getY(data, i);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      result.push([x, y]);
    }
  }
  return result;
}
