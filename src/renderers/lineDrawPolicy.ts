/**
 * Line draw policy for dense high-N paths (group 3 unsorted full rewrite; also any line at N≥threshold).
 *
 * At high segment counts, fill from thick AA quads under 4× MSAA dominates the frame.
 * This policy switches **draw only** to a 1-device-px `line-list` hairline when N is large —
 * does not change sampling, packing, or data residency. Applies to all line series above
 * {@link DENSE_HAIRLINE_POINT_THRESHOLD} (including non-decimated high-N lines), not only
 * group-3 unsorted rewrites. FIFO suite rows stay under threshold when GPU/CPU decimation
 * keeps displayed points low.
 *
 * @module lineDrawPolicy
 * @internal
 */

export type LineDrawPolicy = 'standard' | 'denseHairline';

export type LineDrawPolicyInput = Readonly<{
  readonly pointCount: number;
  readonly lineWidthCssPx: number;
}>;

export type LineDrawPolicyResult = Readonly<{
  readonly policy: LineDrawPolicy;
  /** Effective CSS width for the AA-quad path. Hairline ignores width (native 1 device px). */
  readonly effectiveLineWidthCssPx: number;
}>;

/**
 * Enter dense hairline (line-list) at/above this point count.
 * Chosen so group 3 **10k** stays full AA quads (~display refresh) while **50k**
 * leaves the AA-quad fill cliff (primary DoD row).
 */
export const DENSE_HAIRLINE_POINT_THRESHOLD = 25_000;

/**
 * @deprecated Prefer {@link DENSE_HAIRLINE_POINT_THRESHOLD}. Alias retained for
 * residual tests / call sites that still name the older soft-thin threshold.
 */
export const DENSE_LINE_POINT_THRESHOLD = DENSE_HAIRLINE_POINT_THRESHOLD;

/** Floor width reported for hairline bookkeeping (CSS px). Native stroke is 1 device px. */
export const DENSE_LINE_MIN_WIDTH_CSS = 1;

/**
 * Resolve draw-only line policy for high-N rewrites.
 *
 * - `standard`: screen-space AA quads (width honored)
 * - `denseHairline`: WebGPU `line-list` (1 device px), drawn in a post-resolve sampleCount:1 pass
 */
export function resolveLineDrawPolicy(input: LineDrawPolicyInput): LineDrawPolicyResult {
  const w =
    Number.isFinite(input.lineWidthCssPx) && input.lineWidthCssPx > 0 ? input.lineWidthCssPx : 2;
  if (input.pointCount < DENSE_HAIRLINE_POINT_THRESHOLD) {
    return { policy: 'standard', effectiveLineWidthCssPx: w };
  }
  // Hairline: native line width is always 1 device px; report min(w, 1) for uniform bookkeeping.
  const floor = Math.min(w, DENSE_LINE_MIN_WIDTH_CSS);
  return {
    policy: 'denseHairline',
    effectiveLineWidthCssPx: floor,
  };
}
