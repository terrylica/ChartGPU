/**
 * Regression test for the GPU decimation bucket-index overflow.
 *
 * WGSL `u32` wraps at 2^32. The old interior-bucket formula
 *   lo = visStart + 1 + (span * bucketId) / interior
 * first overflows around span ≈ 859k with default samplingThreshold=5000
 * (interior=4998). That produced the ultimate-benchmark "cut": early buckets
 * correct, later buckets mapped to the wrong raw indices.
 *
 * The shader now uses mulDivU32 (overflow-safe). This test ports the same
 * algorithm so we lock the contract without a live GPU.
 */

import { describe, it, expect } from 'vitest';

/** Mirror of `umul64` in decimation.wgsl — returns [hi, lo]. */
function umul64(a: number, b: number): [number, number] {
  const aLo = a & 0xffff;
  const aHi = a >>> 16;
  const bLo = b & 0xffff;
  const bHi = b >>> 16;
  const p0 = Math.imul(aLo, bLo) >>> 0;
  const p1 = Math.imul(aLo, bHi) >>> 0;
  const p2 = Math.imul(aHi, bLo) >>> 0;
  const p3 = Math.imul(aHi, bHi) >>> 0;
  const mid = ((p0 >>> 16) + (p1 & 0xffff) + (p2 & 0xffff)) >>> 0;
  const lo = ((p0 & 0xffff) | ((mid & 0xffff) << 16)) >>> 0;
  const hi = (p3 + (p1 >>> 16) + (p2 >>> 16) + (mid >>> 16)) >>> 0;
  return [hi, lo];
}

/** Mirror of `udiv64by32` in decimation.wgsl. */
function udiv64by32(hi: number, lo: number, d: number): number {
  if (d === 0) return 0;
  let rem = hi % d;
  let quot = 0;
  for (let i = 0; i < 32; i++) {
    const bit = 31 - i;
    const loBit = (lo >>> bit) & 1;
    const candidate = (rem * 2 + loBit) >>> 0;
    quot = (quot << 1) >>> 0;
    if (candidate >= d) {
      rem = candidate - d;
      quot |= 1;
    } else {
      rem = candidate;
    }
  }
  return quot >>> 0;
}

/** Mirror of `mulDivU32` in decimation.wgsl. */
function mulDivU32(a: number, b: number, denom: number): number {
  a = a >>> 0;
  b = b >>> 0;
  denom = denom >>> 0;
  if (denom === 0 || a === 0 || b === 0) return 0;
  if (a <= Math.floor(0xffffffff / b)) {
    return Math.floor((a * b) / denom);
  }
  const q = Math.floor(a / denom);
  const r = a % denom;
  const main = Math.imul(q, b) >>> 0;
  if (r === 0) return main;
  if (r <= Math.floor(0xffffffff / b)) {
    return (main + Math.floor((r * b) / denom)) >>> 0;
  }
  const [hi, lo] = umul64(r, b);
  return (main + udiv64by32(hi, lo, denom)) >>> 0;
}

/** Naive (pre-fix) u32-wrapping multiply-divide. */
function mulDivU32Naive(a: number, b: number, denom: number): number {
  const prod = Math.imul(a >>> 0, b >>> 0) >>> 0; // wraps like WGSL u32
  return Math.floor(prod / denom);
}

describe('decimation mulDivU32 (bucket index overflow regression)', () => {
  it('matches exact floor(a*b/d) across the full interior range for 2.9M-span LTTB', () => {
    const span = 2_900_000 - 2;
    const interior = 5000 - 2; // default samplingThreshold
    for (let b = 0; b <= interior; b++) {
      const got = mulDivU32(span, b, interior);
      const exp = Math.floor((span * b) / interior);
      expect(got).toBe(exp);
    }
  });

  it('naive u32 mul diverges past ~859k span (documents the production bug)', () => {
    const interior = 4998;
    const span = 2_900_000 - 2;
    // High bucket ids wrap under naive mul — this is the visual "cut".
    const b = 2000;
    const naive = mulDivU32Naive(span, b, interior);
    const safe = mulDivU32(span, b, interior);
    const exp = Math.floor((span * b) / interior);
    expect(safe).toBe(exp);
    expect(naive).not.toBe(exp);
    expect(naive).toBeLessThan(exp);
  });

  it('first overflows for last interior bucket near span ≈ 859509', () => {
    const interior = 4998;
    const lastB = interior - 1;
    // Below threshold: naive still matches
    const okSpan = 859_000;
    expect(mulDivU32Naive(okSpan, lastB, interior)).toBe(Math.floor((okSpan * lastB) / interior));
    // Above threshold: naive wraps
    const badSpan = 860_000;
    expect(mulDivU32Naive(badSpan, lastB, interior)).not.toBe(Math.floor((badSpan * lastB) / interior));
    expect(mulDivU32(badSpan, lastB, interior)).toBe(Math.floor((badSpan * lastB) / interior));
  });
});

/**
 * Mirror of bucketCandidateCount / candidateRawIndex in decimation.wgsl.
 * Dense-bucket cap bounds GPU reads at extreme FIFO N (10M×5 LTTB).
 */
const MAX_BUCKET_CANDIDATES = 512;

function bucketCandidateCount(rangeLen: number): number {
  rangeLen = rangeLen >>> 0;
  return rangeLen > MAX_BUCKET_CANDIDATES ? MAX_BUCKET_CANDIDATES : rangeLen;
}

function candidateRawIndex(rangeStart: number, rangeLen: number, s: number, candCount: number): number {
  rangeStart = rangeStart >>> 0;
  rangeLen = rangeLen >>> 0;
  s = s >>> 0;
  candCount = candCount >>> 0;
  if (candCount <= 1 || rangeLen <= 1) return rangeStart;
  if (candCount >= rangeLen) return rangeStart + s;
  return rangeStart + mulDivU32(rangeLen - 1, s, candCount - 1);
}

describe('decimation dense-bucket candidate cap (FIFO 10M LTTB)', () => {
  it('full-scans when rangeLen ≤ 512 (1M×2500 ≈ 400 pts/bucket — no 1M regression)', () => {
    const rangeLen = 400;
    expect(bucketCandidateCount(rangeLen)).toBe(400);
    for (let s = 0; s < rangeLen; s++) {
      expect(candidateRawIndex(10, rangeLen, s, rangeLen)).toBe(10 + s);
    }
  });

  it('caps at 512 and includes endpoints for oversized buckets (10M path)', () => {
    const rangeStart = 1000;
    const rangeLen = 4000; // ~10M / 2500
    const candCount = bucketCandidateCount(rangeLen);
    expect(candCount).toBe(512);
    expect(candidateRawIndex(rangeStart, rangeLen, 0, candCount)).toBe(rangeStart);
    expect(candidateRawIndex(rangeStart, rangeLen, candCount - 1, candCount)).toBe(rangeStart + rangeLen - 1);
    // Monotonic non-decreasing candidate indices
    let prev = -1;
    for (let s = 0; s < candCount; s++) {
      const idx = candidateRawIndex(rangeStart, rangeLen, s, candCount);
      expect(idx).toBeGreaterThanOrEqual(rangeStart);
      expect(idx).toBeLessThan(rangeStart + rangeLen);
      expect(idx).toBeGreaterThanOrEqual(prev);
      prev = idx;
    }
  });

  it('false-positive guard: rangeLen exactly 512 is not subsampled', () => {
    expect(bucketCandidateCount(512)).toBe(512);
    expect(bucketCandidateCount(513)).toBe(512);
    expect(candidateRawIndex(0, 512, 511, 512)).toBe(511);
  });

  it('degenerate rangeLen 0/1 and candCount ≤ 1 match WGSL early-outs', () => {
    // bucketCandidateCount: empty / singleton ranges stay exact (no cap).
    expect(bucketCandidateCount(0)).toBe(0);
    expect(bucketCandidateCount(1)).toBe(1);

    // candidateRawIndex: candCount <= 1 or rangeLen <= 1 → rangeStart.
    expect(candidateRawIndex(42, 0, 0, 0)).toBe(42);
    expect(candidateRawIndex(42, 1, 0, 1)).toBe(42);
    expect(candidateRawIndex(7, 100, 0, 0)).toBe(7);
    expect(candidateRawIndex(7, 100, 0, 1)).toBe(7);
    expect(candidateRawIndex(7, 1, 0, 1)).toBe(7);
    // rangeLen <= 1 takes precedence even if candCount looks larger.
    expect(candidateRawIndex(9, 1, 3, 5)).toBe(9);
  });
});
