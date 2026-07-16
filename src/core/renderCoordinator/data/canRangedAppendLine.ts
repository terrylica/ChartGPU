/**
 * Pure eligibility for O(k) DataStore.appendSeries on line series.
 *
 * Full raw resident kinds (`fullRawLine`, `gpuDecimationRaw`) are append-safe at
 * any zoom — the buffer holds full raw, not a zoomed sampled slice.
 * Cold `unknown` unlocks when sampling is `'none'` or GPU decimation is eligible
 * (before the first prepare tags the kind).
 *
 * @module canRangedAppendLine
 * @internal
 */

import type { ResolvedSeriesConfig } from '../../../config/OptionResolver';
import type { CartesianSeriesData, SeriesSampling, SeriesType } from '../../../config/types';
import { isGpuDecimationEligible } from '../../../data/gpuDecimationEligibility';

/** What DataStore currently holds for a series index (written by prepareSeries). */
export type DataStoreBufferKind = 'unknown' | 'fullRawLine' | 'gpuDecimationRaw' | 'other';

export type CanRangedAppendLineInput = {
  readonly seriesType: SeriesType | string;
  readonly sampling: SeriesSampling | string | undefined;
  readonly kind: DataStoreBufferKind;
  /** Runtime raw (or series raw) for GPU-decimation eligibility when kind is cold/active. */
  readonly rawData: CartesianSeriesData | null | undefined;
  /** Full series config when available (areaStyle, samplingThreshold, etc.). */
  readonly series?: ResolvedSeriesConfig | null;
};

/**
 * True when ranged append may write only the new points without full setSeries.
 */
export function canRangedAppendLine(input: CanRangedAppendLineInput): boolean {
  if (input.seriesType !== 'line') return false;

  const kind = input.kind;
  const isGpuDecimationActive = kind === 'gpuDecimationRaw';
  const sampling = input.sampling;

  const seriesForEligibility: ResolvedSeriesConfig =
    input.series ??
    ({
      type: 'line',
      sampling: (sampling ?? 'lttb') as SeriesSampling,
    } as ResolvedSeriesConfig);

  const raw = input.rawData ?? null;
  const isGpuDecimationEligibleNow =
    raw != null && isGpuDecimationEligible(seriesForEligibility, raw);

  // fullRawLine / gpuDecimationRaw: buffer holds full raw (any zoom).
  // unknown + (none | GPU-eligible): cold path before first prepare tags kind.
  const kindAllows =
    kind === 'fullRawLine' ||
    isGpuDecimationActive ||
    (kind === 'unknown' && (isGpuDecimationEligibleNow || sampling === 'none'));

  if (!kindAllows) return false;

  // GPU path and sampling none both keep full raw at any zoom.
  return isGpuDecimationActive || isGpuDecimationEligibleNow || sampling === 'none';
}
