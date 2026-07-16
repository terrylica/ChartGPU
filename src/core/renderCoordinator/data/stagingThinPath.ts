/**
 * Staging thin-path (zero-copy DataStore alias) eligibility helpers.
 *
 * Thin path = maxPoints + GPU append fast path. Coordinator runtime raw binds
 * to DataStore modular staging (no dual-pack into RingXYColumns). ChartGPU's
 * hit-test dual-store skip remains gated on `tooltip.show === false` separately
 * (lazy resync on hitTest / tooltip re-enable) — issue 1.5.
 *
 * @module stagingThinPath
 * @internal
 */

import { isStagingRingView } from '../../../data/cartesianData';

/**
 * True when coordinator runtime raw should bind to DataStore modular staging
 * instead of dual-packing into RingXYColumns / owned columns.
 *
 * `tooltipShow` is accepted for call-site compatibility / documentation; it no
 * longer gates the coordinator thin path (issue 1.5). Float32 staging precision
 * is acceptable for streaming domain; hit-test dual-store is independent.
 */
export function isStagingThinPathEligible(
  canUseFastPath: boolean,
  hasMaxPointsInFlush: boolean,
  _tooltipShow?: boolean | undefined
): boolean {
  return canUseFastPath && hasMaxPointsInFlush;
}

/**
 * After a thin-path rebind failure (DataStore throw post-append), demote any
 * live StagingRingView so dual-pack fallthrough can re-sync with the store.
 * Non-staging raw is returned unchanged.
 */
export function demoteStagingViewAfterRebindFailure<T>(raw: T | null): T | null {
  if (raw != null && isStagingRingView(raw)) {
    return null;
  }
  return raw;
}
