# WebGPU Fundamentals Audit Goals — ChartGPU

| | |
|--|--|
| **Status** | Active — WG-P0-1/2, WG-P1-5/9, WG-P2-1 `done`; remaining open |
| **Branch** | `performance-audit` (or dedicated fix branch) |
| **Kind** | code-change (correctness + performance) |
| **Source audit** | WebGPU Fundamentals review (2026-07-15) — lessons under [webgpu/webgpufundamentals `webgpu/lessons`](https://github.com/webgpu/webgpufundamentals/tree/main/webgpu/lessons) |
| **Primary tracker** | **This file** |
| **Related trackers** | [`OVERARCHING_PERFORMANCE_GOALS.md`](OVERARCHING_PERFORMANCE_GOALS.md) (prior program; IDs differ — do not conflate) |
| **Summary twin** | [`docs/PERFORMANCE_GOALS.md`](docs/PERFORMANCE_GOALS.md) (baseline harness how-to) |
| **Baseline of record** | [`benchmarks/baselines/main.json`](benchmarks/baselines/main.json) |
| **Harness** | [`examples/performance-baseline/`](examples/performance-baseline/) |
| **Compare** | [`benchmarks/baseline/compare.ts`](benchmarks/baseline/compare.ts) |
| **Constraints** | Do **not** use NIA. Do **not** use the outdated local WebGPU skill. Ground fixes in fundamentals lessons cited per finding + live `src/` behavior. |

**ID namespace:** all findings use the prefix **`WG-`** (WebGPU Fundamentals audit) so they never collide with `OVERARCHING_PERFORMANCE_GOALS.md` IDs (`P0-1` grid uniforms, etc.).

---

## 1. North star

Close every finding from the WebGPU Fundamentals correctness + performance audit against ChartGPU, in severity order, without regressing the production baseline, and without inventing docs that do not match `src/`.

### Success looks like

1. Every **WG-P0** finding closed (or deferred with written reason + residual risk).
2. Every **WG-P1** finding closed or deferred with harness/unit coverage plan.
3. **WG-P2 / WG-P3** triaged: `done` / `deferred` / `wontfix` with reason.
4. `AGENTS.md` and architecture comments match **actual** pass graph, decimation contracts, and DataStore growth behavior.
5. Candidate baseline JSON on the **same machine** is not worse than `main.json` beyond compare thresholds after each phase (unless finding is correctness-only / not harness-covered — then unit/acceptance/visual gate applies).
6. No silent correctness regressions (time-axis strokes, decimation refresh, density zoom, grid colors, append fast path, MSAA sampleCount match).

### Non-goals

- Full Rust rewrite or “rewrite ChartGPU in another language”.
- Re-litigating prior closed OVERARCHING items that already match `src/` (e.g. grid dynamic offsets, line bind-group identity cache) unless this audit re-opened them.
- Using timestamp-query numbers as shipping SLAs (`webgpu-timing.md`: implementation-defined).
- Blindly requesting all adapter limits/features (`webgpu-limits-and-features.md`).

---

## 2. Operating principles

1. **Severity order** — WG-P0 → WG-P1 → WG-P2 → WG-P3 unless a dependency forces reordering (noted in §8).
2. **Measure before/after** — production preview only (`build:examples` + `preview:examples` on `:4173`), never Vite dev for gate numbers.
3. **CPU ms is king when FPS is flat** — ~120 FPS is often rAF-capped; watch `cpuMs.p50` / `cpuMs.p95`.
4. **Thresholds** — FPS p50 drop **&lt; −5%** = regression; CPU ms p50 rise **&gt; +8%** = regression (`compare.ts`).
5. **Correctness-first findings** may gate on unit/acceptance/visual without full baseline if harness does not cover them — still run baseline after multi-finding phases.
6. **Update this file** when a finding moves (`open` → `in_progress` → `done` / `deferred` / `wontfix`). Append **Landed** notes.
7. **Do not push** unless the user asks.
8. **Keep three-site GPU decimation eligibility in sync** (`isGpuDecimationEligible` in baseline recompute, zoom recompute, and `prepareSeries`).

---

## 3. Frame graph (must stay accurate in docs)

**As of WG-P1-5 (source of truth = `src/`):**

```
CPU prepare
  → series upload / decimation.prepare / overlay prepare
  → ensureTextures (resize-only)

GPU encoder (one submit)
  1. Compute: scatter-density + line decimation (dirty-gated)
  2. Pass A — main 4× MSAA → resolve → mainResolveTexture
       load:clear  store:discard
       grid, series, below-series annotations
  3. Pass B — overlay 4× MSAA → resolve → swapchain
       load:clear  store:discard
       large-triangle blit + above-series annotations
       + axes / crosshair / highlight (sampleCount 4)

DOM: axis labels, tooltips, …
```

(Former Pass C `topOverlayPass` removed by WG-P1-5.)

---

## 4. Verification system of record

### 4.1 Production baseline harness

```bash
# From repo root — REQUIRED for gate numbers
bun run benchmark:baseline:preview
# = build:examples + vite preview on :4173
```

Open:

```text
http://localhost:4173/ChartGPU/examples/performance-baseline/?scenario=all&autorun=1
```

Single scenario:

```text
http://localhost:4173/ChartGPU/examples/performance-baseline/?scenario=zoom-pan-1m&autorun=1&warmup=90&measure=300
```

| Query | Default | Meaning |
|-------|---------|---------|
| `scenario` | `all` | `all` or one scenario id |
| `warmup` | `90` | Frames discarded |
| `measure` | `300` | Frames in stats |
| `autorun` | `1` | Auto-start |
| `download` | `0` | `1` auto-download JSON |

### 4.2 Autonomous capture (agents)

Wait for:

- console: `CHARTGPU_BASELINE_DONE`
- or `window.__CHARTGPU_BASELINE_DONE__ === true`

Then capture:

- `window.__CHARTGPU_BASELINE_JSON__` (string)
- or markers `CHARTGPU_BASELINE_JSON_BEGIN` … `END`

```bash
bun run benchmark:baseline:compare -- \
  benchmarks/baselines/main.json \
  /path/to/candidate.json \
  --fail-on-regression
```

### 4.3 Unit / acceptance / typecheck

```bash
bun run test
bun run build
# Acceptance examples (as relevant to finding):
# tsx examples/acceptance/...
```

### 4.4 Correctness-only smoke (recommended additions while fixing WG-P0)

Agents should add or run tests that fail **before** the fix and pass **after**:

| Finding | Suggested test focus |
|---------|----------------------|
| WG-P0-1 | Time-axis + GPU decimation: line prepare receives same `xOffset` as DataStore pack; clip affine matches non-decimated path |
| WG-P0-2 | Same buffer identity + same point count + changed payload → `encodeCompute` dispatches again (dirty true) |
| WG-P1-1 | Density: y-only scale change dirties compute; same-N content rewrite dirties compute |
| WG-P1-4 | After resize with different DPR, `gridArea.devicePixelRatio` matches `canvas.width / clientWidth` (or updated context DPR) |

---

## 5. Scenario → finding map

| Scenario / gate | Primary WG findings |
|-----------------|---------------------|
| `static-1m-lttb` | WG-P1-6, WG-P1-9, WG-P2-7, WG-P2-8, WG-P2-3/4 (CPU) |
| `hover-1m-lttb` | WG-P2-10, WG-P2-15, WG-P3-3 |
| `zoom-pan-1m` | **WG-P0-2**, WG-P1-1, WG-P2-5, WG-P2-11 |
| `stream-append-lttb` | WG-P0-2 (content rewrite), WG-P1-9, stream + decimation |
| `stream-append-none` | Append path health (contrast) |
| **Unit / acceptance (weak harness)** | **WG-P0-1** (time+decimation), WG-P1-2, WG-P1-3, WG-P1-7, WG-P1-8, WG-P2-13 |
| **Visual / memory** | WG-P1-5, WG-P2-1, WG-P2-2 |
| **Init / multi-series** | WG-P1-6, WG-P2-8 |
| **Large N / limits** | WG-P1-2, WG-P2-9 |
| **Device loss** | WG-P1-10 |

---

## 6. Status legend

| Status | Meaning |
|--------|---------|
| `open` | Not started |
| `in_progress` | Actively being fixed |
| `done` | Fix landed + verification recorded under **Landed** |
| `deferred` | Intentionally postponed with reason + residual risk |
| `wontfix` | Explicit non-fix with reason |

---

## 7. Complete findings registry

### 7.1 WG-P0 — Critical correctness

---

#### WG-P0-1 · GPU decimation forces `xOffset = 0` on time axes

| Field | Detail |
|-------|--------|
| **Status** | `done` |
| **Category** | Correctness |
| **Severity** | P0 |
| **Where** | `src/core/renderCoordinator/render/renderSeries.ts` (~303–309 decimated `prepare`); packing: `src/data/createDataStore.ts` + `packXYInto`; fold-back: `src/renderers/createLineRenderer.ts` (~235–238) |
| **Problem** | Eligible path uploads raw with real `xOffset` (first finite time value) so DataStore packs `x - xOffset`. Decimation compute copies those floats through. Line prepare is then called with **`xOffset = 0`** and a false comment: “Decimation shader emits clean (x, y) without xOffset subtraction.” Non-decimated GPU branch correctly passes `xOffset`. |
| **Why it fails** | Line clip fold-back is `bxAdjusted = bx + ax * xOffset`. With packed data and `xOffset = 0`, clip becomes `ax*(x−origin)+bx` instead of `ax*x+bx`. On epoch-ms axes this is a catastrophic horizontal shift / wrong stroke position. |
| **Fix approach** | Pass the **same** `xOffset` used for `setSeriesIfChanged` into `lineRenderers[i].prepare(...)` for the decimated buffer. Update the comment to state that decimation preserves DataStore packing. Alternative: emit absolute domain x in compute and keep prepare offset 0 — must be consistent end-to-end. |
| **Acceptance criteria** | 1) Time-axis line with `sampling: 'lttb'\|'min'\|'max'`, GPU-eligible, null-gap-free: stroke aligns with CPU path / non-decimated path within float tolerance. 2) Non-time axes unchanged. 3) Unit test asserts decimated prepare receives non-zero xOffset when packing used non-zero xOffset. 4) No baseline regression on `zoom-pan-1m` / `static-1m-lttb`. |
| **Verify** | Unit test on prepare contract; visual/acceptance time-series example; baseline compare |
| **Harness** | weak for time axes — **must** add unit test |
| **Fundamentals** | `webgpu-memory-layout.md`, `webgpu-uniforms.md`, `webgpu-storage-buffers.md` |
| **Depends on** | none |
| **Blocks** | Trustworthy GPU decimation on default time charts |
| **Landed** | Decimated `line.prepare` now receives packing `xOffset`. Unit: `prepareSeriesGpuDecimation.test.ts` asserts time-axis non-zero offset and value-axis zero. |

---

#### WG-P0-2 · Decimation dirty-gate ignores same-buffer content rewrites

| Field | Detail |
|-------|--------|
| **Status** | `done` |
| **Category** | Correctness |
| **Severity** | P0 |
| **Where** | `src/renderers/createDecimationCompute.ts` `prepare` dirty signature (~349–365); writers: `createDataStore.setSeries` (same buffer, `writeBuffer` payload) |
| **Problem** | Dirty only if algorithm / buffer **identity** / `rawPointCount` / visible window / `targetBuckets` change. `setSeries` can rewrite floats into the **same** `GPUBuffer` when capacity fits and point count is unchanged. |
| **Why it fails** | Same-length updates (animation y-values, equal-N replace, in-place setOption) leave `encodeCompute` a no-op → stroke freezes on previous decimated set until zoom/window/buckets change. |
| **Fix approach** | Include DataStore content generation (`hash32` already computed) or a monotonic `generation` counter in the dirty signature. Or expose `forceDirty()` / pass `contentVersion` from coordinator whenever `setSeries` actually wrote. Do **not** dirty on every frame if hash unchanged (preserve skip for pure pan when window unchanged). |
| **Acceptance criteria** | 1) Same buffer identity + same point count + changed y payload → compute dispatches on next encode. 2) Pure zoom with unchanged raw + unchanged visible window still skips when appropriate (or only re-runs when window/buckets change). 3) Unit test covers dirty true/false cases without requiring full GPU if encode flag is inspectable. 4) Baseline: no regression on static (should not force useless compute every frame). |
| **Verify** | Unit tests on dirty signature; `zoom-pan-1m`; animation/update path smoke |
| **Harness** | zoom-pan + stream; unit required |
| **Fundamentals** | `webgpu-compute-shaders.md`, `webgpu-storage-buffers.md`, `webgpu-copying-data.md` |
| **Depends on** | none (pair with WG-P0-1 in same PR if convenient) |
| **Blocks** | Correct live updates under GPU decimation |
| **Landed** | `contentVersion` on `prepare` (DataStore `getSeriesContentHash` / hash32). Dirty re-dispatches on same-buffer rewrite; stable version still skips. Units: `decimationCompute.test.ts` WG-P0-2 cases + `createDataStore.test.ts` hash stability. |

---

### 7.2 WG-P1 — High (major correctness or major performance)

---

#### WG-P1-1 · Scatter-density dirty-gate misses transform + content

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Correctness |
| **Severity** | P1 |
| **Where** | `src/renderers/createScatterDensityRenderer.ts` dirty block (~549–599); transform write (~608–629); `encodeCompute` gated on `computeDirty` |
| **Problem** | Dirty tracks buffer identity, point count, visible indices, bin geometry, scissor, canvas size, normalization — **not** affine transform (`ax,bx,ay,by`) and **not** payload hash. Uniforms rewrite every prepare, but compute no-ops when clean. |
| **Why it fails** | 1) Y-only zoom/pan may keep visible x-index range stable while transform changes → frozen heatmap bins. 2) Same-N content rewrite into same storage buffer freezes until another dirty signal. |
| **Fix approach** | Hash transform (or domain samples) into dirty; pass content generation/hash like WG-P0-2; dirty when `rawBounds` change if used. |
| **Acceptance criteria** | Y-only scale change re-bins; same-N data rewrite re-bins; unchanged frame still skips compute. Unit tests for dirty predicates. |
| **Verify** | Unit + density example visual; baseline optional |
| **Harness** | weak — unit required |
| **Fundamentals** | `webgpu-compute-shaders.md`, `webgpu-storage-buffers.md` |
| **Depends on** | Optionally share content-version design from WG-P0-2 |
| **Landed** | — |

---

#### WG-P1-2 · DataStore capacity vs `maxStorageBufferBindingSize`

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Correctness (large series) |
| **Severity** | P1 |
| **Where** | `src/data/createDataStore.ts` (checks `maxBufferSize` only); consumers bind full buffer as `read-only-storage` (line, decimation); `GPUContext` only floors injected devices at 32 MiB storage binding |
| **Problem** | Buffers use `VERTEX \| STORAGE \| COPY_DST`. Defaults often allow `maxBufferSize` &gt; `maxStorageBufferBindingSize` (often 128 MiB). |
| **Why it fails** | `createBuffer` can succeed; later `createBindGroup` fails → black series / uncaptured errors at multi-million points. |
| **Fix approach** | Cap growth at `min(maxBufferSize, maxStorageBufferBindingSize)`. Fail early with a clear error. Prefer binding with explicit `{ offset, size }` for used byte range where practical. |
| **Acceptance criteria** | Attempt to allocate/bind beyond storage binding max fails with descriptive error before silent bind failure. Unit/mock device limits test. Docs note minimums. |
| **Verify** | Unit with mocked limits; large-N smoke if feasible |
| **Harness** | weak |
| **Fundamentals** | `webgpu-limits-and-features.md`, `webgpu-storage-buffers.md`, `webgpu-bind-group-layouts.md` |
| **Landed** | — |

---

#### WG-P1-3 · Destroy-then-create on growth: map can retain destroyed buffer if create throws

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Correctness (OOM path) |
| **Severity** | P1 |
| **Where** | `createDataStore.ts` set/append growth; similar destroy-first patterns in several renderers |
| **Problem** | Old `buffer.destroy()` runs before new `createBuffer`. Map entry updated only after create+upload. |
| **Why it fails** | If `createBuffer` throws (OOM / limit), map still points at destroyed buffer → use-after-destroy on subsequent get/bind. |
| **Fix approach** | Create new → upload → swap into map → destroy old. Apply same transactional pattern to renderer growth helpers where easy. |
| **Acceptance criteria** | Simulated create failure leaves previous buffer usable **or** map entry removed cleanly (no destroyed handle retained). Unit test with mocked device. |
| **Verify** | Unit |
| **Harness** | none |
| **Fundamentals** | `webgpu-fundamentals.md`, `webgpu-resources.md` |
| **Landed** | — |

---

#### WG-P1-4 · Stale `devicePixelRatio` after resize / monitor change

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Correctness (layout / hit-test) |
| **Severity** | P1 |
| **Where** | `GPUContext` stores DPR at create; `ChartGPU.resizeInternal` resizes canvas with live `window.devicePixelRatio` but does not update context DPR; `computeGridArea` uses `gpuContext.devicePixelRatio` for margin→device conversion |
| **Problem** | Backing store tracks live DPR; layout math may use stale context DPR. |
| **Why it fails** | Cross-display drag / OS zoom: wrong plot margins, scissor, line widths, hit-tests. |
| **Fix approach** | On resize, update GPUContext DPR (setter or recreate state), **or** derive effective DPR as `canvas.width / clientWidth` when both valid. Invalidate `overlayPrepareMemo`. Request render. |
| **Acceptance criteria** | After simulated DPR change + resize, `gridArea.devicePixelRatio` matches effective canvas ratio; margins in device px correct. Unit/integration test. |
| **Verify** | Unit + manual multi-DPR if available |
| **Harness** | weak |
| **Fundamentals** | `webgpu-resizing-the-canvas.md` |
| **Landed** | — |

---

#### WG-P1-5 · Three render passes remain; axes/crosshair/highlight stay sampleCount 1

| Field | Detail |
|-------|--------|
| **Status** | `done` |
| **Category** | Performance + visual quality |
| **Severity** | P1 |
| **Where** | `createRenderCoordinator.ts` (~4236–4348 topOverlayPass); axis/crosshair/highlight created without `sampleCount: 4` (~1812–1832); AGENTS.md incorrectly claims Phase 4b collapsed this |
| **Problem** | Pass C loads/stores full swapchain for UI. UI overlays are single-sample while series are 4× MSAA. Dual MSAA targets still allocated (see WG-P2-2). |
| **Why it fails** | Extra bandwidth; shimmering axes/crosshair vs AA series; docs drift. |
| **Fix approach** | Finish Phase 4b: create axis/crosshair/highlight with `ANNOTATION_OVERLAY_MSAA_SAMPLE_COUNT`; draw them in overlay MSAA pass after blit + above-annotations; **delete** `topOverlayPass`. Update AGENTS.md + §3 frame graph in this file. Coordinate with WG-P2-1 (duplicate annotation renderers). |
| **Acceptance criteria** | Exactly **two** render passes in normal frame path (plus compute). Axes/crosshair/highlight pipelines `sampleCount === 4`. Visual: no regression in layering (highlight/axes on top). Baseline CPU not worse; preferably better on non-capped displays. AGENTS.md matches source. |
| **Verify** | Grep for `topOverlayPass` gone; visual; baseline `all` |
| **Harness** | all |
| **Fundamentals** | `webgpu-multisampling.md`, `webgpu-optimization.md` |
| **Depends on** | Prefer landing with WG-P2-1 |
| **Overlaps** | OVERARCHING `P1-5` (three passes + dual MSAA) — close both trackers when done |
| **Landed** | Deleted `topOverlayPass`; axis/crosshair/highlight use `ANNOTATION_OVERLAY_MSAA_SAMPLE_COUNT` and draw in overlay MSAA pass. Unit: `passGraphContract.test.ts`. §3 + AGENTS.md aligned. Prod baseline: `static-1m-lttb` cpuMs.p50 −22.2%, `zoom-pan-1m` −12.5% vs `main.json` (no FPS p50 regression). |

---

#### WG-P1-6 · PipelineCache largely defeated by per-renderer `createPipelineLayout`

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Performance (init / multi-series memory) |
| **Severity** | P1 |
| **Where** | `src/renderers/rendererUtils.ts` `createRenderPipeline` (~239–247); `PipelineCache` layout keyed by object identity |
| **Problem** | Explicit layout is created **before** cache lookup. New layout object ⇒ new cache key ⇒ miss. N line series ⇒ N equivalent pipelines. Shader modules still dedupe by WGSL. |
| **Fix approach** | Structural BGL/layout cache (signature of entries + visibility + buffer types). Look up pipeline before creating layout; only create layout on miss. Share one layout per renderer type × format × sampleCount where possible. |
| **Acceptance criteria** | Two line renderers same format/sampleCount share one cached render pipeline (assert via PipelineCache stats or identity). Init time / pipeline count does not scale linearly with series count for identical configs. Unit test on cache hits. |
| **Verify** | Unit + multi-series example init; baseline optional |
| **Harness** | weak for init; unit required |
| **Fundamentals** | `webgpu-fundamentals.md`, `webgpu-bind-group-layouts.md`, `webgpu-optimization.md` |
| **Landed** | — |

---

#### WG-P1-7 · Area null gaps become domain `(0,0)` (false fill geometry)

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Correctness |
| **Severity** | P1 |
| **Where** | `src/renderers/createAreaRenderer.ts` `createAreaVertices`; `src/shaders/area.wgsl` |
| **Problem** | Non-finite points write `0,0` in **data space**. Triangle-strip then connects neighbors through origin after transform → large false fills. Line collapses NaN in shader correctly. |
| **Fix approach** | Segment restarts / multi-draw segments / indexed strips / emit clip-space degenerates **after** transform — not data-space origin. Prefer sharing gap policy with line. |
| **Acceptance criteria** | Series with null/NaN gaps: no filled region spanning to domain origin; visual matches intended gap break (or connectNulls policy). Unit test on vertex generation. |
| **Verify** | Unit + acceptance null-gap area example |
| **Harness** | weak — unit required |
| **Fundamentals** | `webgpu-vertex-buffers.md`, `webgpu-transparency.md` |
| **Overlaps** | OVERARCHING P1-3 area path quality |
| **Landed** | — |

---

#### WG-P1-8 · Area path skips time `xOffset` (Float32 precision)

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Correctness / quality |
| **Severity** | P1 |
| **Where** | `createAreaRenderer.ts` vs line DataStore packing + xOffset fold-back |
| **Problem** | Area packs raw domain x into private vertex buffer with no origin subtraction. Float32 ULP near 1e12 is huge → shimmer under zoom. Stroke (with offset) and fill can disagree. |
| **Fix approach** | Share DataStore packing + xOffset affine fold-in, or storage-buffer area path parallel to line. |
| **Acceptance criteria** | Time-axis area fill stable under zoom (no gross jitter relative to stroke). Same xOffset contract as line. |
| **Verify** | Visual time+area; unit on packing |
| **Harness** | weak |
| **Fundamentals** | `webgpu-memory-layout.md`, `webgpu-vertex-buffers.md` |
| **Depends on** | Strong synergy with WG-P1-7 and OVERARCHING P1-3/P1-4 |
| **Landed** | — |

---

#### WG-P1-9 · `setSeries` reallocates full-capacity CPU staging every successful write

| Field | Detail |
|-------|--------|
| **Status** | `done` |
| **Category** | Performance |
| **Severity** | P1 |
| **Where** | `src/data/createDataStore.ts` `setSeries` (~210–212); also intermediate `packCartesianData` alloc |
| **Problem** | Every real write builds `new Float32Array(capacityBytes / 4)` (often pow2-grown capacity) and copies packed data. Animation clears setSeries skip cache → frequent full alloc. |
| **Fix approach** | Reuse/grow `existing.stagingBuffer` when large enough; pack in-place (as `appendSeries` already does); drop intermediate packed buffer when possible. |
| **Acceptance criteria** | Second `setSeries` of smaller/equal used floats does not allocate a new capacity-sized staging (test via reused buffer ref or instrumentation). Baseline static/hover CPU not worse; preferably better under update animation. |
| **Verify** | Unit; baseline static + animation if available |
| **Harness** | static, hover |
| **Fundamentals** | `webgpu-optimization.md`, `webgpu-copying-data.md` |
| **Landed** | Reuses `existing.stagingBuffer` when capacity fits; grows only on capacity increase. Unit: `createDataStore.test.ts` staging reuse. Residual: intermediate `packCartesianData` still allocates (defer pack-in-place). |

---

#### WG-P1-10 · Device-lost: dispose without recovery

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Production reliability |
| **Severity** | P1 |
| **Where** | `ChartGPU.ts` `device.lost` (~2667–2682); owned devices only log `uncapturederror` in `GPUContext` |
| **Problem** | On loss (non-`destroyed`), chart disposes (shared devices emit `deviceLost`). No re-init path. Transient GPU resets permanently kill the chart. |
| **Fix approach** | Document host recreate contract clearly. Optional `onDeviceLost` / auto-reinit flag. Ensure shared devices still emit event. Consider `pushErrorScope` around first-frame pipeline create for diagnostics (`webgpu-debugging.md`). |
| **Acceptance criteria** | Documented recovery steps in public/API docs. Event/callback fires for shared devices. Owned-device behavior documented (dispose vs recover). No silent hung GPU with zombie instance. |
| **Verify** | Unit/mock `device.lost`; docs review |
| **Harness** | none |
| **Fundamentals** | `webgpu-fundamentals.md` (device.lost), `webgpu-debugging.md` |
| **Landed** | — |

---

### 7.3 WG-P2 — Moderate

---

#### WG-P2-1 · Dual annotation renderers both at 4×, both prepared every frame

| Field | Detail |
|-------|--------|
| **Status** | `done` |
| **Category** | Performance (CPU waste) |
| **Severity** | P2 |
| **Where** | `createRenderCoordinator.ts` referenceLine/marker + `*Msaa` (~1841–1860, ~4184–4214) |
| **Problem** | Both pairs use sampleCount **4**. Every frame prepares **both**. Dual instances only made sense when sample counts differed. |
| **Fix approach** | Single annotation renderer (sampleCount 4) for below-series (main) and above-series (overlay) draws. |
| **Acceptance criteria** | One prepare per annotation type per frame; layering below/above series preserved. |
| **Verify** | Grep dual prepare gone; visual annotations; baseline |
| **Fundamentals** | `webgpu-optimization.md` |
| **Depends on** | Land with or before WG-P1-5 |
| **Landed** | Single `createReferenceLineRenderer` / `createAnnotationMarkerRenderer`; Msaa aliases same instance; prepare once per frame. Unit: `passGraphContract.test.ts`. |

---

#### WG-P2-2 · Two full-canvas 4× MSAA textures + resolve (VRAM)

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Performance (memory/bandwidth) |
| **Severity** | P2 |
| **Where** | `textureManager.ts` `ensureTextures` |
| **Problem** | `mainColor` 4× + `mainResolve` 1× + `overlayMsaa` 4× at full canvas. Correct design, expensive at HiDPI. No quality toggle. |
| **Fix approach** | Option `sampleCount: 1\|4` (or medium path); or collapse passes (WG-P1-5) so one 4× target may suffice for some quality modes. |
| **Acceptance criteria** | Configurable AA quality or reduced targets after pass collapse; documented memory tradeoff. No validation errors. |
| **Verify** | Memory/visual; baseline |
| **Fundamentals** | `webgpu-multisampling.md`, `webgpu-optimization.md` |
| **Depends on** | WG-P1-5 may reduce need for second 4× |
| **Landed** | — |

---

#### WG-P2-3 · Area: exact-size buffer + full CPU rebuild/`writeBuffer` every prepare

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Performance |
| **Severity** | P2 |
| **Where** | `createAreaRenderer.ts` `prepare` |
| **Problem** | New `Float32Array` + full upload every prepare; buffer grown to exact size (no pow2). |
| **Fix approach** | Pow2 grow + staging reuse; skip upload when data ref + baseline + scale signature unchanged; ideally share DataStore (WG-P1-8). |
| **Acceptance criteria** | Unchanged data does not re-upload; growth does not thrash createBuffer. |
| **Verify** | Unit; area example |
| **Fundamentals** | `webgpu-optimization.md`, `webgpu-vertex-buffers.md` |
| **Overlaps** | OVERARCHING P1-3 |
| **Landed** | — |

---

#### WG-P2-4 · Scatter / bar / candlestick / pie full instance rebuild every prepare

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Performance |
| **Severity** | P2 |
| **Where** | `createScatterRenderer.ts`, `createBarRenderer.ts`, `createCandlestickRenderer.ts`, `createPieRenderer.ts` |
| **Problem** | Each prepare repacks all instances and `writeBuffer`s used range. No content/hash skip (unlike DataStore `hash32`). |
| **Fix approach** | Hash packed bytes or data ref + style signature; skip write when unchanged. |
| **Acceptance criteria** | Static hover frames with unchanged series skip instance upload (measurable or unit-asserted). |
| **Verify** | Unit; baseline hover/static |
| **Fundamentals** | `webgpu-optimization.md`, `webgpu-vertex-buffers.md` |
| **Landed** | — |

---

#### WG-P2-5 · Scatter-density bin clear: full zero `writeBuffer` of capacity every dirty compute

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Performance |
| **Severity** | P2 |
| **Where** | `createScatterDensityRenderer.ts` `encodeCompute` (~657–665) |
| **Problem** | Correct queue ordering, but multi‑MB zero upload every pan/zoom; holds full-size zero staging in JS. |
| **Fix approach** | Prefer `encoder.clearBuffer(binsBuffer)` / `clearBuffer(maxBuffer)` before compute, or a clear kernel. |
| **Acceptance criteria** | Dirty density recompute still correct (empty bins zero; max resets); no permanent multi‑MB zero array required (or only for fallback). |
| **Verify** | Unit/visual density; zoom baseline if density scenario exists |
| **Fundamentals** | `webgpu-copying-data.md`, `webgpu-optimization.md`, `webgpu-compute-shaders.md` |
| **Landed** | — |

---

#### WG-P2-6 · Scatter density `@workgroup_size(256)` vs recommended 64

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Performance (portability) |
| **Severity** | P2 |
| **Where** | `src/shaders/scatterDensityBinning.wgsl` |
| **Problem** | Workgroup size 256 = max invocations product. Fundamentals recommend **64** unless measured. Compat defaults may be lower. |
| **Fix approach** | Benchmark 64 vs 256; default to 64 if not slower; document measurement. Check compatibility mode limits (`maxComputeInvocationsPerWorkgroup` 128). |
| **Acceptance criteria** | Workgroup size justified in comment with measurement **or** changed to 64 with no visual regression. |
| **Verify** | Density perf smoke; comment in shader |
| **Fundamentals** | `webgpu-compute-shaders.md`, `webgpu-compatibility-mode.md` |
| **Landed** | — |

---

#### WG-P2-7 · No GPU render bundles (AGENTS claim false)

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Performance / docs |
| **Severity** | P2 |
| **Where** | Entire `src/` (zero `createRenderBundleEncoder`); `overlayPrepareMemo` only skips prepare |
| **Problem** | AGENTS.md implied render bundle reuse for grid/axis. Steady-state still re-binds and re-draws every frame. |
| **Fix approach** | Implement bundles invalidated when overlay memo signature changes; **or** correct AGENTS.md if deferred. Prefer implement if CPU encode shows up in profiles. |
| **Acceptance criteria** | Either bundles execute for static grid/axis across frames with invalidation on signature change, **or** docs explicitly say prepare-memo only. |
| **Verify** | Unit for invalidation; baseline static |
| **Fundamentals** | `webgpu-optimization.md` (render bundles) |
| **Landed** | — |

---

#### WG-P2-8 · Sync-only pipeline creation; no async warm-up

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Performance (first-frame jank) |
| **Severity** | P2 |
| **Where** | `PipelineCache.ts`; `rendererPool.ts` grows synchronously |
| **Problem** | No `createRenderPipelineAsync` / warm-up. First chart / first series of each type blocks on compile. Worse with WG-P1-6. |
| **Fix approach** | Optional async warm-up after device init for common (format × sampleCount × series type). Keep sync fallback. |
| **Acceptance criteria** | Documented warm-up API or internal prewarm; first interactive frame not blocked on full multi-series compile when warm-up used. |
| **Verify** | Manual/init timing; optional unit |
| **Fundamentals** | `webgpu-optimization.md`, `webgpu-timing.md` |
| **Depends on** | Benefits from WG-P1-6 |
| **Landed** | — |

---

#### WG-P2-9 · Owned `requestDevice()` with no `requiredLimits`

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Limits / reliability |
| **Severity** | P2 |
| **Where** | `GPUContext.ts` `requestDevice()` (~240) |
| **Problem** | Owned devices take browser defaults. Failures surface late in DataStore/texture create. |
| **Fix approach** | Request floor limits from adapter (buffer, storage binding, texture 2D) matching ChartGPU needs; document minimums; fail early. Do not request “all limits”. |
| **Acceptance criteria** | Init fails early with clear message if floor unmet; successful init documents effective limits. Unit with mocks. |
| **Verify** | Unit; docs |
| **Fundamentals** | `webgpu-limits-and-features.md` |
| **Landed** | — |

---

#### WG-P2-10 · Tooltip throttle still schedules full GPU frames

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Performance (interaction) |
| **Severity** | P2 |
| **Where** | `createRenderCoordinator.ts` tooltip throttle + `requestRender` follow-up |
| **Problem** | Hit-test ~30 Hz, but follow-up still full coordinator render. Pointer already dirties for crosshair. |
| **Fix approach** | Split interaction-only vs full-scene dirty flags; tooltip-only follow-up updates DOM without re-encoding when series/zoom unchanged (harder). |
| **Acceptance criteria** | Documented behavior **or** reduced GPU submits on tooltip-only catch-up without missing crosshair/highlight correctness. |
| **Verify** | hover baseline CPU |
| **Fundamentals** | `webgpu-optimization.md` |
| **Landed** | — |

---

#### WG-P2-11 · Parallel LTTB is approximate (not sequential LTTB)

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Correctness (algorithm fidelity) / docs |
| **Severity** | P2 |
| **Where** | `src/shaders/decimation.wgsl` averages + parallel triangle max |
| **Problem** | Interior buckets maximize area vs **neighbor averages**, not previously chosen LTTB points. Not bit-identical to CPU sequential LTTB. |
| **Fix approach** | Document as parallel-LTTB approximation in public docs + shader header. Optional acceptance tolerance tests vs CPU. Do not claim bit-identical. |
| **Acceptance criteria** | Docs/API state approximation; optional test with tolerance. No silent “same as CPU lttb” claims. |
| **Verify** | Docs + optional acceptance |
| **Fundamentals** | `webgpu-compute-shaders.md` |
| **Landed** | — |

---

#### WG-P2-12 · DataStore growth: full CPU re-upload (AGENTS GPU-copy claim is false)

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Performance / docs |
| **Severity** | P2 |
| **Where** | `createDataStore.appendSeries` grow path; AGENTS.md claims GPU-to-GPU copy on growth |
| **Problem** | Grow destroys old buffer, creates without relying on GPU copy of prefix, full `writeBuffer` from CPU staging. Docs drift. |
| **Fix approach** | Either implement `COPY_SRC` + `copyBufferToBuffer` for prefix (with create-before-destroy / WG-P1-3) **or** fix AGENTS.md to match CPU staging design. Prefer docs fix unless profiling shows growth thrash. |
| **Acceptance criteria** | AGENTS.md matches code; if GPU copy landed, growth path covered by unit and no use-after-destroy. |
| **Verify** | Docs review and/or unit |
| **Fundamentals** | `webgpu-copying-data.md`, `webgpu-optimization.md` |
| **Landed** | — |

---

#### WG-P2-13 · Axis/grid/area `writeBuffer` omits TypedArray `byteOffset`

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Correctness risk (latent) |
| **Severity** | P2 |
| **Where** | `createAxisRenderer.ts`, `createGridRenderer.ts`, `createAreaRenderer.ts` patterns using `.buffer, 0, .byteLength` |
| **Problem** | Safe today because generators allocate fresh arrays (`byteOffset === 0`). Subarray/pool staging later would upload wrong range. DataStore/stream already pass offsets correctly. |
| **Fix approach** | Always pass `view.byteOffset` / `view.byteLength` (or central helper like `writeUniformBuffer`). |
| **Acceptance criteria** | All GPU uploads of TypedArrays use byteOffset-aware helper; unit covering non-zero byteOffset view. |
| **Verify** | Unit + grep audit |
| **Fundamentals** | `webgpu-copying-data.md` |
| **Landed** | — |

---

#### WG-P2-14 · Animation forces full series re-upload while interpolating

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Performance (expected cost) |
| **Severity** | P2 |
| **Where** | `createRenderCoordinator.ts` clears `lastSetSeriesCache` while update transition active |
| **Problem** | Correctness-first: in-place mutation + same array ref would skip uploads without clear. Forces pack+writeBuffer every frame during lerp. |
| **Fix approach** | Optional GPU-side lerp / dual-buffer morph; limit animated series set; document cost. Do not re-break setSeries skip. |
| **Acceptance criteria** | Documented tradeoff **or** reduced upload for animation without skip bugs. |
| **Verify** | Animation example; baseline if scenario exists |
| **Fundamentals** | `webgpu-copying-data.md` |
| **Landed** | — |

---

#### WG-P2-15 · Highlight uses fullscreen + scissor + discard

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Performance |
| **Severity** | P2 |
| **Where** | `highlight.wgsl` + `createHighlightRenderer.ts` |
| **Problem** | Large-triangle covers scissor rect; FS discards outside ring. Correct but O(plot pixels). |
| **Fix approach** | Instanced/small AA ring quad sized to radius+AA (like scatter expansion). |
| **Acceptance criteria** | Visual parity of highlight ring; reduced FS invocations (optional GPU timing). |
| **Verify** | Visual hover; hover baseline |
| **Fundamentals** | `webgpu-large-triangle-to-cover-clip-space.md`, `webgpu-optimization.md`, `webgpu-points.md` |
| **Landed** | — |

---

### 7.4 WG-P3 — Minor / hygiene

---

#### WG-P3-1 · DataStore series buffers unlabeled

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Debug / ops |
| **Severity** | P3 |
| **Where** | `createDataStore.ts` `createBuffer` |
| **Fix** | `label: \`dataStore/series/${index}\`` |
| **Acceptance** | Validation errors show series labels |
| **Fundamentals** | `webgpu-debugging.md`, `webgpu-fundamentals.md` |
| **Landed** | — |

---

#### WG-P3-2 · Dual `getCompilationInfo` handlers in decimation setup

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Hygiene |
| **Severity** | P3 |
| **Where** | `createDecimationCompute.ts` (~167–205) |
| **Fix** | Keep a single compilation-info logger |
| **Acceptance** | One async handler per module instance |
| **Fundamentals** | `webgpu-debugging.md` |
| **Landed** | — |

---

#### WG-P3-3 · Per-prepare identity mat4 / color allocs (axis, grid, crosshair)

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Performance (GC) |
| **Severity** | P3 |
| **Where** | `createAxisRenderer.ts`, `createGridRenderer.ts`, `createCrosshairRenderer.ts` |
| **Fix** | Module-level identity + reusable color scratch (match line/annotation) |
| **Acceptance** | No per-prepare `new ArrayBuffer` for identity/color on hot path |
| **Fundamentals** | `webgpu-optimization.md`, `webgpu-uniforms.md` |
| **Landed** | — |

---

#### WG-P3-4 · Line joins without miter/caps; dead locals in `line.wgsl`

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Quality / clarity |
| **Severity** | P3 |
| **Where** | `src/shaders/line.wgsl` |
| **Fix** | Remove dead locals; optional join/caps as future feature (may defer as `wontfix` for miter) |
| **Acceptance** | Dead code removed; joins documented as intentional tradeoff if unchanged |
| **Fundamentals** | `webgpu-points.md`, `webgpu-transparency.md` |
| **Landed** | — |

---

#### WG-P3-5 · Candlestick hollow via background overdraw

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Correctness edge case |
| **Severity** | P3 |
| **Where** | `createCandlestickRenderer.ts` hollow path |
| **Fix** | SDF outline hollow or stencil; or document “opaque background required” |
| **Acceptance** | Documented limitation **or** true hollow without bg overdraw |
| **Fundamentals** | `webgpu-transparency.md` |
| **Landed** | — |

---

#### WG-P3-6 · External render mode: animations stall if host does not drive rAF

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | API footgun |
| **Severity** | P3 |
| **Where** | `ChartGPU.ts` `setRenderMode('external')` + `renderFrame` |
| **Fix** | Docs: poll every frame while animating; optional `hasActiveAnimation` / `needsRender()` API |
| **Acceptance** | Documented clearly in API docs |
| **Fundamentals** | app-loop design (not a WebGPU API bug) |
| **Landed** | — |

---

#### WG-P3-7 · `'auto'` sampling / AGENTS wording vs types

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Docs / API consistency |
| **Severity** | P3 |
| **Where** | `SeriesSampling` types; `gpuDecimationEligibility.ts`; AGENTS.md; acceptance tests that mention `auto` |
| **Fix** | Either add real `auto` → `lttb` alias end-to-end, or delete `auto` claims from AGENTS/acceptance/warnings |
| **Acceptance** | Types, eligibility, AGENTS, acceptance tests consistent |
| **Fundamentals** | n/a (project consistency); compute docs only if alias routes to GPU |
| **Landed** | — |

---

#### WG-P3-8 · Fast-path append swallows all `appendSeries` errors

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Observability |
| **Severity** | P3 |
| **Where** | `createRenderCoordinator.ts` append fast path try/catch |
| **Fix** | Catch only “not initialized”; rethrow/log once for OOM/limit errors |
| **Acceptance** | Real GPU errors visible; missing-series still falls back |
| **Fundamentals** | `webgpu-debugging.md` |
| **Landed** | — |

---

#### WG-P3-9 · No `minBindingSize` on fixed uniform layouts

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Perf micro / validation locality |
| **Severity** | P3 |
| **Where** | Renderer `createBindGroupLayout` buffer entries |
| **Fix** | Set `minBindingSize` for fixed uniform structs (not runtime-sized storage arrays) |
| **Acceptance** | Fixed uniform bindings declare minBindingSize matching WGSL struct size |
| **Fundamentals** | `webgpu-bind-group-layouts.md` |
| **Landed** | — |

---

#### WG-P3-10 · No timestamp-query GPU timing in profiler

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Observability |
| **Severity** | P3 |
| **Where** | `src/profiling/PerformanceProfiler.ts` |
| **Problem** | Wall-clock only. Optional `timestamp-query` not requested/used. |
| **Fix approach** | Optional feature path with caveats from `webgpu-timing.md` (implementation-defined; not for SLAs). Prefer throughput baselines for gates. |
| **Acceptance** | Documented wontfix **or** optional GPU timestamps behind feature flag without making them gate criteria |
| **Fundamentals** | `webgpu-timing.md` |
| **Landed** | — |

---

### 7.5 Latent / portability note (track as WG-P2-L1)

#### WG-P2-L1 · Compatibility mode: storage buffers in vertex stage may be unavailable

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Category** | Portability |
| **Severity** | P2 (latent) |
| **Where** | Line/decimation path: VS `@binding` `read-only-storage` points |
| **Problem** | Compatibility mode may default `maxStorageBuffersInVertexStage` to **0** (`webgpu-compatibility-mode.md`). Core desktop Chrome is fine today. |
| **Fix approach** | Document core WebGPU requirement; or provide vertex-buffer fallback path for compat. |
| **Acceptance** | Explicit support matrix in docs; fail early if compat without storage-in-VS |
| **Fundamentals** | `webgpu-compatibility-mode.md`, `webgpu-storage-buffers.md` |
| **Landed** | — |

---

## 8. Implementation phases (goal-mode execution order)

Use these phases as **goal mode** work units. Each phase ends with: tests + (if perf-impacting) baseline compare + status updates in **this file**.

### Phase A — P0 correctness (must ship first)

| Step | Findings | Notes |
|------|----------|-------|
| A1 | **WG-P0-1** | xOffset on decimated line prepare |
| A2 | **WG-P0-2** | Content-version dirty for decimation |
| A3 | Shared content-version plumbing if useful for density | Feeds Phase B |

**Gate:** unit tests for A1/A2; `bun run test`; `zoom-pan-1m` + `static-1m-lttb` baseline compare.

### Phase B — Dirty completeness + limits

| Step | Findings |
|------|----------|
| B1 | **WG-P1-1** density dirty |
| B2 | **WG-P1-2** storage binding cap |
| B3 | **WG-P1-3** create-before-destroy |

**Gate:** unit tests; large-N/limit mocks; baseline optional.

### Phase C — Resize / layout

| Step | Findings |
|------|----------|
| C1 | **WG-P1-4** DPR on resize |

**Gate:** unit/integration; visual resize.

### Phase D — Pass graph + annotations

| Step | Findings |
|------|----------|
| D1 | **WG-P2-1** single annotation renderer |
| D2 | **WG-P1-5** collapse top overlay pass (4× UI) |
| D3 | **WG-P2-2** MSAA memory options (if not fully solved by D2) |
| D4 | Update AGENTS.md + §3 frame graph |

**Gate:** visual AA; baseline `all`; grep no `topOverlayPass`.

### Phase E — Pipeline cache + init

| Step | Findings |
|------|----------|
| E1 | **WG-P1-6** structural layout cache |
| E2 | **WG-P2-8** async warm-up (optional after E1) |
| E3 | **WG-P2-9** requiredLimits floor |

**Gate:** pipeline cache unit tests; init smoke.

### Phase F — Area correctness + upload

| Step | Findings |
|------|----------|
| F1 | **WG-P1-7** null gaps |
| F2 | **WG-P1-8** time xOffset |
| F3 | **WG-P2-3** area upload caching |

**Gate:** unit + area/null acceptance; overlaps OVERARCHING P1-3/P1-4.

### Phase G — DataStore + series upload polish

| Step | Findings |
|------|----------|
| G1 | **WG-P1-9** staging reuse |
| G2 | **WG-P2-4** instance upload skip |
| G3 | **WG-P2-5** density clearBuffer |
| G4 | **WG-P2-13** byteOffset-safe writes |
| G5 | **WG-P2-12** AGENTS growth docs or GPU copy |

**Gate:** unit; baseline static/hover/stream.

### Phase H — Interaction / compute polish

| Step | Findings |
|------|----------|
| H1 | **WG-P2-6** workgroup size |
| H2 | **WG-P2-10** tooltip dirty split |
| H3 | **WG-P2-15** highlight quad |
| H4 | **WG-P2-7** render bundles or docs |
| H5 | **WG-P2-11** parallel-LTTB docs |
| H6 | **WG-P2-14** animation upload docs/opt |
| H7 | **WG-P1-10** device-lost recovery/docs |
| H8 | **WG-P2-L1** compat matrix |

**Gate:** selective baseline + docs.

### Phase I — P3 hygiene batch

| Step | Findings |
|------|----------|
| I1 | WG-P3-1 … WG-P3-10 as a single hygiene PR (or split) |

**Gate:** `bun run test`; docs consistency (esp. WG-P3-7).

---

## 9. Task checklist (global)

- [x] Phase A: WG-P0-1, WG-P0-2
- [ ] Phase B: WG-P1-1, WG-P1-2, WG-P1-3
- [ ] Phase C: WG-P1-4
- [x] Phase D: WG-P2-1, WG-P1-5 (WG-P2-2 still open — dual MSAA textures remain)
- [ ] Phase E: WG-P1-6, WG-P2-8, WG-P2-9
- [ ] Phase F: WG-P1-7, WG-P1-8, WG-P2-3
- [x] Phase G: WG-P1-9 (remaining G items open)
- [ ] Phase H: remaining P2 + WG-P1-10 + WG-P2-L1
- [ ] Phase I: all WG-P3
- [x] AGENTS.md / frame graph match `src/` (WG-P1-5 landed)
- [ ] Final baseline `all` vs `main.json` (rebaseline only with justification)
- [ ] Cross-close overlapping OVERARCHING open items (P1-3, P1-4, P1-5) when equivalent WG items land

---

## 10. Index table (quick status)

| ID | Title | Sev | Status |
|----|-------|-----|--------|
| WG-P0-1 | Decimation `xOffset = 0` on time axes | P0 | `done` |
| WG-P0-2 | Decimation dirty ignores content rewrite | P0 | `done` |
| WG-P1-1 | Density dirty misses transform/content | P1 | `open` |
| WG-P1-2 | Storage binding size cap | P1 | `open` |
| WG-P1-3 | Destroy-before-create on growth | P1 | `open` |
| WG-P1-4 | Stale DPR after resize | P1 | `open` |
| WG-P1-5 | 3rd pass + 1× UI overlays | P1 | `done` |
| WG-P1-6 | PipelineCache layout identity miss | P1 | `open` |
| WG-P1-7 | Area null → domain (0,0) | P1 | `open` |
| WG-P1-8 | Area missing time xOffset | P1 | `open` |
| WG-P1-9 | setSeries full staging realloc | P1 | `done` |
| WG-P1-10 | Device-lost dispose-only | P1 | `open` |
| WG-P2-1 | Dual annotation prepare | P2 | `done` |
| WG-P2-2 | Dual 4× MSAA VRAM | P2 | `open` |
| WG-P2-3 | Area full rebuild every prepare | P2 | `open` |
| WG-P2-4 | Instance series full rebuild | P2 | `open` |
| WG-P2-5 | Density full zero writeBuffer | P2 | `open` |
| WG-P2-6 | Density workgroup 256 | P2 | `open` |
| WG-P2-7 | No render bundles / docs drift | P2 | `open` |
| WG-P2-8 | Sync pipeline create only | P2 | `open` |
| WG-P2-9 | No requiredLimits on requestDevice | P2 | `open` |
| WG-P2-10 | Tooltip full-frame follow-up | P2 | `open` |
| WG-P2-11 | Parallel LTTB approx docs | P2 | `open` |
| WG-P2-12 | Growth path vs AGENTS GPU copy | P2 | `open` |
| WG-P2-13 | writeBuffer missing byteOffset | P2 | `open` |
| WG-P2-14 | Animation full re-upload | P2 | `open` |
| WG-P2-15 | Highlight fullscreen FS cost | P2 | `open` |
| WG-P2-L1 | Compat VS storage buffers | P2 | `open` |
| WG-P3-1 | Unlabeled DataStore buffers | P3 | `open` |
| WG-P3-2 | Dual getCompilationInfo | P3 | `open` |
| WG-P3-3 | Overlay identity/color allocs | P3 | `open` |
| WG-P3-4 | Line joins / dead WGSL locals | P3 | `open` |
| WG-P3-5 | Candlestick hollow bg overdraw | P3 | `open` |
| WG-P3-6 | External render mode docs | P3 | `open` |
| WG-P3-7 | sampling `auto` consistency | P3 | `open` |
| WG-P3-8 | Append fast-path swallows errors | P3 | `open` |
| WG-P3-9 | minBindingSize on uniforms | P3 | `open` |
| WG-P3-10 | Timestamp-query profiler | P3 | `open` |

**Totals:** 2 P0 · 10 P1 · 16 P2 (incl. L1) · 10 P3 = **38 findings**.
**Closed this program:** WG-P0-1, WG-P0-2, WG-P1-5, WG-P1-9, WG-P2-1 (`done`).

---

## 11. Goal-mode agent instructions (copy into goal prompts)

```text
You are fixing ChartGPU findings from WEBGPU_FUNDAMENTALS_AUDIT_GOALS.md.

Rules:
1. Work one Phase (or one finding) at a time unless the phase table groups them.
2. Before coding, re-read the finding table in this file and the cited source lines in src/.
3. Do not use NIA. Do not use the outdated WebGPU skill.
4. Prefer smallest correct fix; match functional-first patterns in the repo.
5. Keep isGpuDecimationEligible three call sites in sync if you touch eligibility.
6. After code changes: bun run test; for perf-impacting work, production baseline compare.
7. Update this file: Status + Landed notes + checklist boxes.
8. Do not push unless asked.
9. Do not claim AGENTS.md Phase 4b is done until WG-P1-5 is done in source.
```

### Suggested goal prompt templates

**Phase A only:**

```text
Execute Phase A of WEBGPU_FUNDAMENTALS_AUDIT_GOALS.md (WG-P0-1 and WG-P0-2 only).
Add unit tests that fail before the fix. Run bun run test and a production baseline
compare for zoom-pan-1m + static-1m-lttb. Update finding statuses in that goals file.
```

**Single finding:**

```text
Fix WG-P0-1 from WEBGPU_FUNDAMENTALS_AUDIT_GOALS.md end-to-end (code + tests + status update).
Do not start other findings.
```

---

## 12. Strengths to preserve (do not regress)

When fixing, **keep**:

- Single `queue.submit` per frame
- MSAA `storeOp: "discard"` + resolve
- Multisampled textures without `TEXTURE_BINDING`
- Grid multi-batch colors via dynamic uniform offsets (prepare-time writes)
- Line/decimation/density bind-group identity caching
- `writeUniformBuffer` 4-byte validation + 16-byte uniform size align
- Decimation `@workgroup_size(64)` + barrier discipline
- Density atomics for binning
- Large-triangle blit pattern
- Append ranged `writeBuffer` fast path + `gpuDecimationRaw` streaming

---

## 13. Document history

| Date | Change |
|------|--------|
| 2026-07-15 | Initial registry from WebGPU Fundamentals full-repo audit (38 findings, all open) |
| 2026-07-15 | Closed WG-P0-1, WG-P0-2, WG-P1-5, WG-P1-9, WG-P2-1 with unit tests + production baseline compare |

---

*End of goal document. Agents: treat §7 as the work items, §8 as the sequence, §4 as the verification contract, §11 as the operating rules.*
