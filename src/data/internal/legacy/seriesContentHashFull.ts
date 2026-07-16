/**
 * Full O(N) content hashes — production-dead (issue 3.1).
 * Prefer cheapCartesianContentStamp / DataStore FNV. Kept for unit tests only.
 * @module seriesContentHashFull
 * @internal
 */

import type { CartesianSeriesData, OHLCDataPoint, OHLCDataPointTuple } from '../../../config/types';
import { getPointCount, getX, getY } from '../../cartesianData';

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;
const floatBitsScratch = new DataView(new ArrayBuffer(8));

const mixUint = (h: number, v: number): number => Math.imul(h ^ (v >>> 0), FNV_PRIME) >>> 0;

const mixFloat = (h: number, v: number): number => {
  if (!Number.isFinite(v)) {
    return mixUint(h, 0x7fc00000);
  }
  floatBitsScratch.setFloat64(0, v, true);
  h = mixUint(h, floatBitsScratch.getUint32(0, true));
  h = mixUint(h, floatBitsScratch.getUint32(4, true));
  return h;
};

/** @deprecated Production-dead full scan — tests/legacy only (issue 3.1). */
export function hashCartesianSeriesData(data: CartesianSeriesData): number {
  let h = FNV_OFFSET >>> 0;
  const n = getPointCount(data);
  h = mixUint(h, n);
  for (let i = 0; i < n; i++) {
    h = mixFloat(h, getX(data, i));
    h = mixFloat(h, getY(data, i));
  }
  return h >>> 0;
}

const isTupleOHLC = (p: OHLCDataPoint): p is OHLCDataPointTuple => Array.isArray(p);

/** @deprecated Production-dead full scan — tests/legacy only (issue 3.1). */
export function hashOHLCSeriesData(data: ReadonlyArray<OHLCDataPoint>): number {
  let h = FNV_OFFSET >>> 0;
  h = mixUint(h, data.length);
  for (let i = 0; i < data.length; i++) {
    const p = data[i]!;
    if (isTupleOHLC(p)) {
      h = mixFloat(h, p[0]);
      h = mixFloat(h, p[1]);
      h = mixFloat(h, p[2]);
      h = mixFloat(h, p[3]);
      h = mixFloat(h, p[4]);
    } else {
      h = mixFloat(h, p.timestamp);
      h = mixFloat(h, p.open);
      h = mixFloat(h, p.close);
      h = mixFloat(h, p.low);
      h = mixFloat(h, p.high);
    }
  }
  return h >>> 0;
}
