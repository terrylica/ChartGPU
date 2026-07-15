import { performance } from 'node:perf_hooks';
import {
  isGpuDecimationEligible,
  mapSamplingToDecimationAlgorithm,
} from '../../src/data/gpuDecimationEligibility';
import { resolveOptions } from '../../src/config/OptionResolver';
import type { ResolvedLineSeriesConfig } from '../../src/config/OptionResolver';

// TypeScript-only acceptance checks for Stretch S1 (GPU compute-shader decimation).
//
// This file does NOT spin up a WebGPU device — Node's runtime has no gpu
// binding. Instead it exercises:
//
//   1. The eligibility + algorithm-mapping logic end-to-end from a user-visible
//      `resolveOptions` call.
//
//   2. CPU reference implementations of the three WGSL entry points
//      (`minMaxDecimate`, `computeBucketAverages`, `parallelLttbDecimate`).
//      The reference is self-contained and matches the exact bucket-range
//      convention the shader uses (see `interiorBucketRange` in
//      `src/shaders/decimation.wgsl`). That gives us a deterministic target
//      that the live-GPU test harness (the dev server / benchmark) can
//      compare against when validating numerical correctness.
//
// The live numerical-correctness check against the real shader runs in the
// browser via the dev server / benchmark pages.

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

// ─────────────────────────────────────────────────────────────────────────────
// Eligibility end-to-end
// ─────────────────────────────────────────────────────────────────────────────
{
  const resolved = resolveOptions({
    series: [
      { type: 'line', data: [[0, 1], [1, 2], [2, 3], [3, 2], [4, 1]] },
      { type: 'line', sampling: 'none', data: [[0, 1], [1, 2]] },
      { type: 'line', sampling: 'lttb', data: [[0, 1], [1, 2]] },
      { type: 'line', sampling: 'average', data: [[0, 1], [1, 2]] },
    ],
  });

  const [autoSeries, noneSeries, lttbSeries, avgSeries] = resolved.series as ReadonlyArray<ResolvedLineSeriesConfig>;

  assert(
    isGpuDecimationEligible(autoSeries, autoSeries.rawData),
    'Default (auto) line series should be eligible.',
  );
  assert(
    !isGpuDecimationEligible(noneSeries, noneSeries.rawData),
    "Line series with sampling='none' must fall back to CPU (no sampling happens).",
  );
  assert(
    isGpuDecimationEligible(lttbSeries, lttbSeries.rawData),
    "Line series with sampling='lttb' should be eligible.",
  );
  assert(
    !isGpuDecimationEligible(avgSeries, avgSeries.rawData),
    "Line series with sampling='average' must fall back to CPU (no GPU kernel).",
  );

  assert(mapSamplingToDecimationAlgorithm('auto') === 'lttb', "auto aliases to lttb.");
  assert(mapSamplingToDecimationAlgorithm('lttb') === 'lttb', "lttb maps to lttb.");
  assert(mapSamplingToDecimationAlgorithm('min') === 'min', "min maps to min.");
  assert(mapSamplingToDecimationAlgorithm('max') === 'max', "max maps to max.");
  assert(mapSamplingToDecimationAlgorithm('average') === null, "average is CPU-only.");
  assert(mapSamplingToDecimationAlgorithm('none') === null, "none does not sample.");

  console.log('[acceptance:gpu-decimation] eligibility matrix OK');
}

// ─────────────────────────────────────────────────────────────────────────────
// CPU reference implementations — must match the WGSL entry points.
// Keep this section in lock-step with `src/shaders/decimation.wgsl`. If you
// change the bucket-range convention or the anchor semantics there, update
// the references here too.
// ─────────────────────────────────────────────────────────────────────────────

type XY = readonly [number, number];

function interiorBucketRange(
  bucketId: number,
  visStart: number,
  visEnd: number,
  buckets: number,
): { lo: number; hi: number } {
  if (buckets < 3 || visEnd < visStart + 2) return { lo: visStart, hi: visStart };
  const span = visEnd - visStart - 2;
  const interior = buckets - 2;
  let lo = visStart + 1 + Math.floor((span * bucketId) / interior);
  let hi = visStart + 1 + Math.floor((span * (bucketId + 1)) / interior);
  lo = Math.min(lo, visEnd - 1);
  hi = Math.min(hi, visEnd - 1);
  if (hi <= lo) hi = lo + 1;
  return { lo, hi };
}

function cpuMinMaxDecimate(
  raw: Float32Array,
  visStart: number,
  visEnd: number,
  targetBuckets: number,
  mode: 'min' | 'max',
): Float32Array {
  const out = new Float32Array(targetBuckets * 2);
  out[0] = raw[visStart * 2 + 0]!;
  out[1] = raw[visStart * 2 + 1]!;
  out[(targetBuckets - 1) * 2 + 0] = raw[(visEnd - 1) * 2 + 0]!;
  out[(targetBuckets - 1) * 2 + 1] = raw[(visEnd - 1) * 2 + 1]!;

  if (targetBuckets < 3) return out;

  for (let b = 0; b < targetBuckets - 2; b++) {
    const { lo, hi } = interiorBucketRange(b, visStart, visEnd, targetBuckets);
    let best = mode === 'max' ? -Infinity : Infinity;
    let bestIdx = lo;
    for (let i = lo; i < hi; i++) {
      const y = raw[i * 2 + 1]!;
      if (!Number.isFinite(y)) continue;
      if (mode === 'max' ? y > best : y < best) {
        best = y;
        bestIdx = i;
      }
    }
    out[(b + 1) * 2 + 0] = raw[bestIdx * 2 + 0]!;
    out[(b + 1) * 2 + 1] = raw[bestIdx * 2 + 1]!;
  }
  return out;
}

function cpuBucketAverages(
  raw: Float32Array,
  visStart: number,
  visEnd: number,
  targetBuckets: number,
): Float32Array {
  const out = new Float32Array(targetBuckets * 2);
  out[0] = raw[visStart * 2 + 0]!;
  out[1] = raw[visStart * 2 + 1]!;
  out[(targetBuckets - 1) * 2 + 0] = raw[(visEnd - 1) * 2 + 0]!;
  out[(targetBuckets - 1) * 2 + 1] = raw[(visEnd - 1) * 2 + 1]!;

  if (targetBuckets < 3) return out;

  for (let b = 0; b < targetBuckets - 2; b++) {
    const { lo, hi } = interiorBucketRange(b, visStart, visEnd, targetBuckets);
    let sumX = 0;
    let sumY = 0;
    let cnt = 0;
    for (let i = lo; i < hi; i++) {
      const x = raw[i * 2 + 0]!;
      const y = raw[i * 2 + 1]!;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      sumX += x;
      sumY += y;
      cnt++;
    }
    if (cnt === 0) {
      out[(b + 1) * 2 + 0] = raw[lo * 2 + 0]!;
      out[(b + 1) * 2 + 1] = raw[lo * 2 + 1]!;
    } else {
      out[(b + 1) * 2 + 0] = sumX / cnt;
      out[(b + 1) * 2 + 1] = sumY / cnt;
    }
  }
  return out;
}

function cpuParallelLttb(
  raw: Float32Array,
  visStart: number,
  visEnd: number,
  targetBuckets: number,
): Float32Array {
  const averages = cpuBucketAverages(raw, visStart, visEnd, targetBuckets);
  const out = new Float32Array(targetBuckets * 2);
  out[0] = raw[visStart * 2 + 0]!;
  out[1] = raw[visStart * 2 + 1]!;
  out[(targetBuckets - 1) * 2 + 0] = raw[(visEnd - 1) * 2 + 0]!;
  out[(targetBuckets - 1) * 2 + 1] = raw[(visEnd - 1) * 2 + 1]!;

  if (targetBuckets < 3) return out;

  for (let b = 0; b < targetBuckets - 2; b++) {
    const { lo, hi } = interiorBucketRange(b, visStart, visEnd, targetBuckets);
    const aX = averages[b * 2 + 0]!; // prev slot average
    const aY = averages[b * 2 + 1]!;
    const nX = averages[(b + 2) * 2 + 0]!; // next slot average
    const nY = averages[(b + 2) * 2 + 1]!;

    let bestScore = -1;
    let bestIdx = lo;
    for (let i = lo; i < hi; i++) {
      const cX = raw[i * 2 + 0]!;
      const cY = raw[i * 2 + 1]!;
      if (!Number.isFinite(cX) || !Number.isFinite(cY)) continue;
      const area2 = Math.abs((aX - nX) * (cY - aY) - (aX - cX) * (nY - aY));
      if (area2 > bestScore) {
        bestScore = area2;
        bestIdx = i;
      }
    }
    out[(b + 1) * 2 + 0] = raw[bestIdx * 2 + 0]!;
    out[(b + 1) * 2 + 1] = raw[bestIdx * 2 + 1]!;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reference self-tests — these are what the GPU shader output must match.
// ─────────────────────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function generateSynthetic(n: number, seed = 42): Float32Array {
  const rand = mulberry32(seed);
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = i;
    const y =
      Math.sin(i * 0.01) +
      0.5 * Math.sin(i * 0.003) +
      (rand() - 0.5) * 0.2 +
      (i % 499 === 0 ? 5 : 0) +
      (i % 787 === 0 ? -5 : 0);
    out[i * 2 + 0] = x;
    out[i * 2 + 1] = y;
  }
  return out;
}

// minMaxDecimate: endpoints must be exact, each interior bucket must hold the
// argmin/argmax (on y) of its raw-index range.
{
  const N = 10_000;
  const data = generateSynthetic(N, 1);
  const B = 512;

  for (const mode of ['min', 'max'] as const) {
    const out = cpuMinMaxDecimate(data, 0, N, B, mode);

    assert(out[0] === data[0], `${mode}: first anchor x must be exact.`);
    assert(out[1] === data[1], `${mode}: first anchor y must be exact.`);
    assert(
      out[(B - 1) * 2 + 0] === data[(N - 1) * 2 + 0],
      `${mode}: last anchor x must be exact.`,
    );
    assert(
      out[(B - 1) * 2 + 1] === data[(N - 1) * 2 + 1],
      `${mode}: last anchor y must be exact.`,
    );

    // Interior buckets hold the true extremum.
    for (let b = 0; b < B - 2; b++) {
      const { lo, hi } = interiorBucketRange(b, 0, N, B);
      let truth = mode === 'max' ? -Infinity : Infinity;
      for (let i = lo; i < hi; i++) {
        const y = data[i * 2 + 1]!;
        if (mode === 'max' ? y > truth : y < truth) truth = y;
      }
      const y = out[(b + 1) * 2 + 1]!;
      assert(
        y === truth,
        `${mode}: interior bucket ${b} must hold the true extremum (got ${y}, want ${truth}).`,
      );
    }
  }
  console.log('[acceptance:gpu-decimation] min/max reference OK');
}

// parallelLttb: endpoints exact; each interior bucket must maximize the
// triangle-area-squared invariant against its (prevAvg, nextAvg) anchors.
{
  const N = 10_000;
  const data = generateSynthetic(N, 2);
  const B = 256;
  const averages = cpuBucketAverages(data, 0, N, B);
  const out = cpuParallelLttb(data, 0, N, B);

  assert(out[0] === data[0], 'lttb: first x exact.');
  assert(out[1] === data[1], 'lttb: first y exact.');
  assert(out[(B - 1) * 2] === data[(N - 1) * 2], 'lttb: last x exact.');
  assert(out[(B - 1) * 2 + 1] === data[(N - 1) * 2 + 1], 'lttb: last y exact.');

  for (let b = 0; b < B - 2; b++) {
    const { lo, hi } = interiorBucketRange(b, 0, N, B);
    const aX = averages[b * 2]!;
    const aY = averages[b * 2 + 1]!;
    const nX = averages[(b + 2) * 2]!;
    const nY = averages[(b + 2) * 2 + 1]!;

    // Find the true max-area candidate in the bucket.
    let truthScore = -1;
    for (let i = lo; i < hi; i++) {
      const cX = data[i * 2]!;
      const cY = data[i * 2 + 1]!;
      const area2 = Math.abs((aX - nX) * (cY - aY) - (aX - cX) * (nY - aY));
      if (area2 > truthScore) truthScore = area2;
    }

    // Compare against the score of the picked point.
    const pX = out[(b + 1) * 2]!;
    const pY = out[(b + 1) * 2 + 1]!;
    const picked = Math.abs((aX - nX) * (pY - aY) - (aX - pX) * (nY - aY));
    assert(
      Math.abs(picked - truthScore) < 1e-3,
      `lttb bucket ${b}: picked point score ${picked} should equal max score ${truthScore}.`,
    );
  }
  console.log('[acceptance:gpu-decimation] parallel-LTTB reference OK');
}

// Timing probe — lets CI flag pathological regressions in the reference
// implementation (which users can run locally to compare against live GPU).
{
  const N = 1_000_000;
  const B = 4000;
  const data = generateSynthetic(N, 3);

  const t0 = performance.now();
  cpuParallelLttb(data, 0, N, B);
  const t1 = performance.now();
  console.log(
    `[acceptance:gpu-decimation] CPU parallel-LTTB reference N=${N} B=${B} in ${(t1 - t0).toFixed(1)}ms`,
  );
}

console.log('[acceptance:gpu-decimation] OK');
