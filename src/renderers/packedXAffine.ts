import type { LinearScale } from '../utils/scales';

/**
 * Clip affine for buffers packed as `x' = x - xOffset` (time-axis Float32 safety).
 *
 * Must sample near `xOffset` — `computeClipAffineFromScale(0,1)` then `bx + ax*xOffset`
 * loses digits when domain is ~1e12 epoch-ms (catastrophic cancellation). Same contract as
 * candlestick packing-origin affine.
 *
 * clipX = ax * x' + b  with  b = scale(xOffset), ax = scale(xOffset+δ) - scale(xOffset) for δ=1.
 */
export function computePackedXAffineFromScale(
  scale: LinearScale,
  xOffset: number
): { readonly a: number; readonly b: number } {
  const origin = Number.isFinite(xOffset) ? xOffset : 0;
  const p0 = scale.scale(origin);
  // Unit probe: for linear scales equals (rangeSpan/domainSpan); stays exact near origin.
  const p1 = scale.scale(origin + 1);
  if (!Number.isFinite(p0)) {
    return { a: 0, b: 0 };
  }
  if (!Number.isFinite(p1)) {
    return { a: 0, b: p0 };
  }
  const a = p1 - p0;
  return { a: Number.isFinite(a) ? a : 0, b: p0 };
}
