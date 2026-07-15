// decimation.wgsl — GPU-side line-series decimation (downsampling).
//
// Three compute entry points, all at `@workgroup_size(64)` (the portable
// sweet-spot recommended by the WebGPU fundamentals compute-shader lesson).
//
// Output contract (shared across entry points):
//   output[0]               = raw[visibleStart]                  (first anchor, fixed)
//   output[targetBuckets-1] = raw[visibleEnd - 1]                (last anchor, fixed)
//   output[1..targetBuckets-2] = one decimated point per interior bucket
//
// Total output point count = `targetBuckets`. The caller draws `targetBuckets`
// vertices as a connected line strip of segments.
//
// Interior bucket index convention:
//   "interior bucket b" ∈ [0, targetBuckets - 2), covering raw index range
//     rangeStart = visibleStart + 1 + floor(span * b       / (targetBuckets - 2))
//     rangeEnd   = visibleStart + 1 + floor(span * (b + 1) / (targetBuckets - 2))
//   where `span = (visibleEnd - visibleStart) - 2`.
//
// Entry points:
//   1. `minMaxDecimate` — per-bucket argmin or argmax on y, mode bit 0 picks
//      min (0) vs max (1). Emits one point per bucket.
//   2. `computeBucketAverages` — per-bucket mean written into `averages`, used
//      as the stable anchor set for the parallel-LTTB pass.
//   3. `parallelLttbDecimate` — per-bucket triangle-area maximization where
//      the anchor is `averages[b - 1]` and the next reference is
//      `averages[b + 1]`. Standard "parallel LTTB" variant.
//
// Uniformity notes (Tint is strict):
//   - `workgroup_id.x` is uniform within a workgroup; it's safe to use as a
//     condition that gates a barrier.
//   - Every `workgroupBarrier()` in this file is reached by ALL threads of the
//     workgroup (no partial-workgroup returns before a barrier).

struct DecimationUniforms {
  rawPointCount : u32,
  visibleStart  : u32,
  visibleEnd    : u32,
  targetBuckets : u32,
  // Mode bit 0: 0 = min, 1 = max. Only consulted by `minMaxDecimate`.
  mode          : u32,
  // Struct padded up to 32 bytes so its size is a multiple of 16 (the minimum
  // alignment for uniform-buffer-backed structs in WGSL). The three pad words
  // are written as zero on the CPU side.
  padA          : u32,
  padB          : u32,
  padC          : u32,
};

@group(0) @binding(0) var<uniform> uni : DecimationUniforms;
@group(0) @binding(1) var<storage, read> rawPoints : array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> output : array<vec2<f32>>;
@group(0) @binding(3) var<storage, read_write> averages : array<vec2<f32>>;

// Shared-memory scratchpads for the intra-workgroup reductions. Sized to the
// literal workgroup width (64) so WGSL front-ends don't have to resolve a
// module-scope `const` into the array size.
var<workgroup> sharedIdx   : array<u32, 64>;
var<workgroup> sharedScore : array<f32, 64>;
var<workgroup> sharedSumX  : array<f32, 64>;
var<workgroup> sharedSumY  : array<f32, 64>;
var<workgroup> sharedCount : array<u32, 64>;

// Interior-bucket raw-index range, exclusive upper bound. Guarantees a
// non-empty range so reductions always have at least one candidate.
fn interiorBucketRange(bucketId : u32) -> vec2<u32> {
  let visStart = uni.visibleStart;
  let visEnd   = uni.visibleEnd;
  let buckets  = uni.targetBuckets;

  var result : vec2<u32> = vec2<u32>(visStart, visStart);

  if (buckets >= 3u && visEnd >= visStart + 2u) {
    let span     = visEnd - visStart - 2u;
    let interior = buckets - 2u;
    let lo       = visStart + 1u + (span * bucketId) / interior;
    let hi       = visStart + 1u + (span * (bucketId + 1u)) / interior;

    let maxIdx = visEnd - 1u;
    var loClamped = lo;
    if (loClamped > maxIdx) {
      loClamped = maxIdx;
    }
    var hiClamped = hi;
    if (hiClamped > maxIdx) {
      hiClamped = maxIdx;
    }
    if (hiClamped <= loClamped) {
      hiClamped = loClamped + 1u;
    }
    result = vec2<u32>(loClamped, hiClamped);
  }

  return result;
}

// WGSL has no isnan(); x != x is the IEEE-754 way to detect NaN.
fn isFiniteVec2(v : vec2<f32>) -> bool {
  return v.x == v.x && v.y == v.y;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point 1: min/max per-bucket (argmin or argmax on y).
// Dispatched with `max(targetBuckets - 2, 1)` workgroups.
// ─────────────────────────────────────────────────────────────────────────────

@compute @workgroup_size(64)
fn minMaxDecimate(
  @builtin(workgroup_id) wgid : vec3<u32>,
  @builtin(local_invocation_id) lid : vec3<u32>,
) {
  let tid      = lid.x;
  let bucketId = wgid.x;
  let buckets  = uni.targetBuckets;
  let visStart = uni.visibleStart;
  let visEnd   = uni.visibleEnd;

  // Thread 0 of workgroup 0 writes the two fixed anchors (first/last points).
  // Writes are scalar; no barrier interaction.
  if (bucketId == 0u && tid == 0u && buckets >= 1u && visEnd > visStart) {
    output[0] = rawPoints[visStart];
    if (buckets >= 2u) {
      output[buckets - 1u] = rawPoints[visEnd - 1u];
    }
  }

  let range      = interiorBucketRange(bucketId);
  let rangeStart = range.x;
  let rangeEnd   = range.y;
  let wantMax    = (uni.mode & 1u) == 1u;

  // Sentinel initialization: start at opposite extreme of what we're seeking.
  var bestY   : f32 = 3.4e38;
  if (wantMax) {
    bestY = -3.4e38;
  }
  var bestIdx : u32 = rangeStart;

  // Stride over the bucket range in workgroup-sized chunks (64 threads each).
  // When rangeStart == rangeEnd (degenerate), every thread skips the loop and
  // contributes sentinel values; the reduction still runs safely.
  var i : u32 = rangeStart + tid;
  while (i < rangeEnd) {
    let p = rawPoints[i];
    if (isFiniteVec2(p)) {
      if (wantMax) {
        if (p.y > bestY) {
          bestY = p.y;
          bestIdx = i;
        }
      } else {
        if (p.y < bestY) {
          bestY = p.y;
          bestIdx = i;
        }
      }
    }
    i = i + 64u;
  }

  sharedScore[tid] = bestY;
  sharedIdx[tid]   = bestIdx;
  workgroupBarrier();

  // Tree reduction (workgroup size is a power of two — 64).
  var stride : u32 = 32u;
  while (stride > 0u) {
    if (tid < stride) {
      let otherScore = sharedScore[tid + stride];
      let otherIdx   = sharedIdx[tid + stride];
      let mine       = sharedScore[tid];
      var take : bool = false;
      if (wantMax) {
        take = otherScore > mine;
      } else {
        take = otherScore < mine;
      }
      if (take) {
        sharedScore[tid] = otherScore;
        sharedIdx[tid]   = otherIdx;
      }
    }
    workgroupBarrier();
    stride = stride / 2u;
  }

  // Only workgroups that correspond to actual interior buckets write an output.
  // Workgroup id 0 maps to interior bucket 0 → output slot 1. The last
  // dispatched workgroup maps to interior bucket (buckets - 3) → slot buckets-2.
  if (tid == 0u && buckets >= 3u && bucketId <= buckets - 3u) {
    output[bucketId + 1u] = rawPoints[sharedIdx[0]];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point 2: per-bucket averages (pre-pass for parallel LTTB).
// Dispatched with `targetBuckets` workgroups.
//
// Workgroup 0 writes averages[0] = raw[visibleStart] (first anchor).
// Workgroup (targetBuckets - 1) writes averages[last] = raw[visibleEnd - 1].
// Interior workgroups compute the mean of raw points in their interior bucket.
// ─────────────────────────────────────────────────────────────────────────────

@compute @workgroup_size(64)
fn computeBucketAverages(
  @builtin(workgroup_id) wgid : vec3<u32>,
  @builtin(local_invocation_id) lid : vec3<u32>,
) {
  let tid      = lid.x;
  let bucketId = wgid.x;
  let buckets  = uni.targetBuckets;
  let visStart = uni.visibleStart;
  let visEnd   = uni.visibleEnd;

  // Partition: isFirstAnchor (bucket 0), isLastAnchor (bucket last), else
  // interior. All three branches are uniform per workgroup because `bucketId`
  // and `buckets` are both workgroup-uniform.
  let isFirstAnchor = buckets >= 1u && bucketId == 0u;
  let isLastAnchor  = buckets >= 2u && bucketId + 1u == buckets;
  let isInterior    = buckets >= 3u && bucketId >= 1u && bucketId + 1u < buckets;

  // Anchor writes are single-scalar, so a non-uniform guard on tid is fine.
  if (isFirstAnchor && tid == 0u && visEnd > visStart) {
    averages[0] = rawPoints[visStart];
  }
  if (isLastAnchor && tid == 0u && visEnd > visStart) {
    averages[buckets - 1u] = rawPoints[visEnd - 1u];
  }

  // Interior bucket reduction. Even when !isInterior, all threads participate
  // in the shared-memory writes + barriers so the barrier is unconditionally
  // reached by the whole workgroup (single-exit uniform control flow).
  let range      = interiorBucketRange(bucketId - select(0u, 1u, isInterior));
  var rangeStart = range.x;
  var rangeEnd   = range.y;
  if (!isInterior) {
    // Collapse the range to zero so the accumulation loop is a no-op but the
    // barrier structure still fires for the whole workgroup.
    rangeStart = 0u;
    rangeEnd   = 0u;
  }

  var sumX : f32 = 0.0;
  var sumY : f32 = 0.0;
  var cnt  : u32 = 0u;

  var i : u32 = rangeStart + tid;
  while (i < rangeEnd) {
    let p = rawPoints[i];
    if (isFiniteVec2(p)) {
      sumX = sumX + p.x;
      sumY = sumY + p.y;
      cnt  = cnt + 1u;
    }
    i = i + 64u;
  }

  sharedSumX[tid]  = sumX;
  sharedSumY[tid]  = sumY;
  sharedCount[tid] = cnt;
  workgroupBarrier();

  var stride : u32 = 32u;
  while (stride > 0u) {
    if (tid < stride) {
      sharedSumX[tid]  = sharedSumX[tid]  + sharedSumX[tid + stride];
      sharedSumY[tid]  = sharedSumY[tid]  + sharedSumY[tid + stride];
      sharedCount[tid] = sharedCount[tid] + sharedCount[tid + stride];
    }
    workgroupBarrier();
    stride = stride / 2u;
  }

  if (isInterior && tid == 0u) {
    let totalCount = sharedCount[0];
    if (totalCount == 0u) {
      // Defensive fallback: empty bucket (all NaN). Use first raw point in the
      // nominal range so the downstream LTTB pass has a usable anchor.
      averages[bucketId] = rawPoints[range.x];
    } else {
      let inv = 1.0 / f32(totalCount);
      averages[bucketId] = vec2<f32>(sharedSumX[0] * inv, sharedSumY[0] * inv);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point 3: parallel LTTB.
// Dispatched with `targetBuckets` workgroups (one per output slot).
//
// Workgroup 0 writes output[0] = first anchor.
// Workgroup (targetBuckets - 1) writes output[last] = last anchor.
// Interior workgroups maximize triangle area against (averages[b-1], averages[b+1]).
// ─────────────────────────────────────────────────────────────────────────────

@compute @workgroup_size(64)
fn parallelLttbDecimate(
  @builtin(workgroup_id) wgid : vec3<u32>,
  @builtin(local_invocation_id) lid : vec3<u32>,
) {
  let tid      = lid.x;
  let bucketId = wgid.x;
  let buckets  = uni.targetBuckets;
  let visStart = uni.visibleStart;
  let visEnd   = uni.visibleEnd;

  let isFirstAnchor = buckets >= 1u && bucketId == 0u;
  let isLastAnchor  = buckets >= 2u && bucketId + 1u == buckets;
  let isInterior    = buckets >= 3u && bucketId >= 1u && bucketId + 1u < buckets;

  if (isFirstAnchor && tid == 0u && visEnd > visStart) {
    output[0] = rawPoints[visStart];
  }
  if (isLastAnchor && tid == 0u && visEnd > visStart) {
    output[buckets - 1u] = rawPoints[visEnd - 1u];
  }

  // Interior reduction — same uniform-barrier structure as computeBucketAverages.
  let range      = interiorBucketRange(bucketId - select(0u, 1u, isInterior));
  var rangeStart = range.x;
  var rangeEnd   = range.y;
  if (!isInterior) {
    rangeStart = 0u;
    rangeEnd   = 0u;
  }

  // Safe to read `averages[bucketId ± 1]` only when interior; otherwise we read
  // a zeroed slot (harmless since we won't write output in those workgroups).
  var anchor  : vec2<f32> = vec2<f32>(0.0, 0.0);
  var nextRef : vec2<f32> = vec2<f32>(0.0, 0.0);
  if (isInterior) {
    anchor  = averages[bucketId - 1u];
    nextRef = averages[bucketId + 1u];
  }

  var bestScore : f32 = -1.0;
  var bestIdx   : u32 = rangeStart;

  var i : u32 = rangeStart + tid;
  while (i < rangeEnd) {
    let c = rawPoints[i];
    if (isFiniteVec2(c)) {
      // Unsigned triangle area (scaled by 2) via the cross product.
      let area2 = abs((anchor.x - nextRef.x) * (c.y - anchor.y)
                    - (anchor.x - c.x)     * (nextRef.y - anchor.y));
      if (area2 > bestScore) {
        bestScore = area2;
        bestIdx   = i;
      }
    }
    i = i + 64u;
  }

  sharedScore[tid] = bestScore;
  sharedIdx[tid]   = bestIdx;
  workgroupBarrier();

  var stride : u32 = 32u;
  while (stride > 0u) {
    if (tid < stride) {
      let otherScore = sharedScore[tid + stride];
      if (otherScore > sharedScore[tid]) {
        sharedScore[tid] = otherScore;
        sharedIdx[tid]   = sharedIdx[tid + stride];
      }
    }
    workgroupBarrier();
    stride = stride / 2u;
  }

  if (isInterior && tid == 0u) {
    output[bucketId] = rawPoints[sharedIdx[0]];
  }
}
