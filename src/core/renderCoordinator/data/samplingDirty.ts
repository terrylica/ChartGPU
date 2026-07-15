/**
 * Sampling / baseline dirty predicates (P1-7).
 *
 * Separates "raw data / sampling config dirty" from "presentation dirty" so
 * theme/legend/tooltip-only option updates can patch series metadata without
 * re-running the multi-stage CPU sampling pipeline.
 *
 * @module samplingDirty
 */

import type {
  ResolvedChartGPUOptions,
  ResolvedPieSeriesConfig,
  ResolvedSeriesConfig,
} from "../../../config/OptionResolver";
import type { DataPoint } from "../../../config/types";

type WithContentHash = {
  readonly contentHash?: number;
  readonly rawData?: unknown;
  readonly data?: unknown;
  readonly sampling?: unknown;
  readonly samplingThreshold?: unknown;
  readonly connectNulls?: unknown;
  readonly type?: string;
  readonly areaStyle?: unknown;
};

/**
 * Cheap structural + content check: did series raw data change?
 *
 * Uses reference equality first. When the raw ref is stable, compares
 * `contentHash` when both sides present and differ. Note: normal
 * `resolveOptions` identity-reuses contentHash for a stable data reference, so
 * in-place value mutations under the same array are **not** detected on the
 * public setOption path (callers must pass a new data reference or use
 * `appendData`). A differing contentHash under the same ref is only meaningful
 * if a caller/test manually supplies hashes.
 */
export function didSeriesDataLikelyChange(
  prev: ResolvedChartGPUOptions["series"],
  next: ResolvedChartGPUOptions["series"],
): boolean {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i++) {
    const a = prev[i]!;
    const b = next[i]!;
    if (a.type !== b.type) return true;

    if (a.type === "pie") {
      const aPie = a as ResolvedPieSeriesConfig;
      const bPie = b as ResolvedPieSeriesConfig;
      if (aPie.data !== bPie.data) return true;
      if (aPie.data.length !== bPie.data.length) return true;
    } else {
      const aAny = a as WithContentHash;
      const bAny = b as WithContentHash;
      const aRaw = (aAny.rawData ?? aAny.data) as ReadonlyArray<DataPoint>;
      const bRaw = (bAny.rawData ?? bAny.data) as ReadonlyArray<DataPoint>;
      if (aRaw !== bRaw) return true;
      // Same ref: prefer contentHash when both present (in-place mutation).
      if (
        typeof aAny.contentHash === "number" &&
        typeof bAny.contentHash === "number" &&
        aAny.contentHash !== bAny.contentHash
      ) {
        return true;
      }
      // Fallback length check for arrays without hash (defensive).
      if (
        Array.isArray(aRaw) &&
        Array.isArray(bRaw) &&
        aRaw.length !== bRaw.length
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * True when line series has a truthy `areaStyle` (forces CPU sampling path;
 * see `isGpuDecimationEligible`).
 */
export function lineHasAreaStyle(series: unknown): boolean {
  if (!series || typeof series !== "object") return false;
  const s = series as { readonly type?: string; readonly areaStyle?: unknown };
  return s.type === "line" && s.areaStyle != null;
}

/**
 * True when sampling algorithm, threshold, connectNulls, or GPU-eligibility
 * inputs (line `areaStyle` presence) changed for any series.
 * These force baseline re-sample even when the raw data reference is stable.
 */
export function didSamplingConfigChange(
  prev: ResolvedChartGPUOptions["series"],
  next: ResolvedChartGPUOptions["series"],
): boolean {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i++) {
    const a = prev[i]! as WithContentHash;
    const b = next[i]! as WithContentHash;
    if (a.sampling !== b.sampling) return true;
    if (a.samplingThreshold !== b.samplingThreshold) return true;
    if ((a.connectNulls ?? false) !== (b.connectNulls ?? false)) return true;
    // areaStyle presence flips GPU vs CPU decimation eligibility (P0-2 / P1-3/4).
    if (lineHasAreaStyle(a) !== lineHasAreaStyle(b)) return true;
  }
  return false;
}

/**
 * Baseline recompute is needed when raw data or sampling-related series config changes.
 * Presentation-only updates (theme, colors, names, legend, tooltip) return false.
 */
export function shouldRecomputeBaselineSampling(
  prev: ResolvedChartGPUOptions["series"],
  next: ResolvedChartGPUOptions["series"],
): boolean {
  return (
    didSeriesDataLikelyChange(prev, next) || didSamplingConfigChange(prev, next)
  );
}

/**
 * Patch presentation fields from `nextSeries` onto previous baseline/render series
 * while retaining already-sampled `data`, `rawData`, `rawBounds`, and `contentHash`.
 *
 * Used when setOptions is presentation-only so series colors/styles update without LTTB.
 */
export function patchSeriesPresentationKeepingSampledData(
  nextSeries: ResolvedChartGPUOptions["series"],
  previousSampled: ReadonlyArray<ResolvedSeriesConfig>,
): ResolvedSeriesConfig[] {
  const out: ResolvedSeriesConfig[] = new Array(nextSeries.length);
  for (let i = 0; i < nextSeries.length; i++) {
    const next = nextSeries[i]!;
    const prev = previousSampled[i];
    if (!prev || prev.type !== next.type || next.type === "pie") {
      out[i] = next;
      continue;
    }
    const prevAny = prev as ResolvedSeriesConfig & {
      rawData?: unknown;
      rawBounds?: unknown;
      data?: unknown;
      contentHash?: number;
    };
    const nextAny = next as { rawData?: unknown; rawBounds?: unknown; data?: unknown; contentHash?: number };
    out[i] = {
      ...next,
      rawData: prevAny.rawData ?? nextAny.rawData,
      rawBounds: prevAny.rawBounds ?? nextAny.rawBounds,
      data: prevAny.data ?? nextAny.data,
      // Keep prior hash so later dirty checks stay consistent with retained content.
      ...(typeof prevAny.contentHash === "number"
        ? { contentHash: prevAny.contentHash }
        : typeof nextAny.contentHash === "number"
          ? { contentHash: nextAny.contentHash }
          : {}),
    } as ResolvedSeriesConfig;
  }
  return out;
}
