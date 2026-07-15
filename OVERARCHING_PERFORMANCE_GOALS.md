# Overarching Performance Goals — ChartGPU

| | |
|--|--|
| **Status** | Active |
| **Branch** | `performance-audit` |
| **Owner** | ChartGPU maintainers + agents |
| **Primary tracker** | This file |
| **Audit detail** | [`audit.md`](audit.md) |
| **Baseline of record** | [`benchmarks/baselines/main.json`](benchmarks/baselines/main.json) |
| **Harness** | [`examples/performance-baseline/`](examples/performance-baseline/) |
| **Compare tool** | [`benchmarks/baseline/compare.ts`](benchmarks/baseline/compare.ts) |
| **Related** | [`docs/PERFORMANCE_GOALS.md`](docs/PERFORMANCE_GOALS.md) (summary twin) |

---

## 1. North star

Make ChartGPU **measurably faster and more correct** on large datasets, streaming, and interaction — without regressions — using a fixed production baseline and an ordered finding registry.

### Success looks like

1. Every **P0** finding closed (or explicitly deferred with reason).
2. Every **P1** finding closed or deferred with a harness coverage plan.
3. P2/P3 triaged (fix / defer / wontfix).
4. Docs/`AGENTS.md`/`dist` match **`src/`** (no phantom optimizations).
5. Candidate baseline JSON on the **same machine** is not worse than `main.json` beyond thresholds after each phase.
6. No silent correctness regressions (grid colors, sampling shape, append behavior).

### Non-goals (for this program)

- Full Rust rewrite.
- “TypeScript 7 rewrite” of the library (toolchain upgrade only, separate).
- Chasing FPS on refresh-capped displays without watching **CPU ms**.

---

## 2. Operating principles

1. **Measure before and after** — no claim of done without baseline compare (unless correctness-only).
2. **Production builds only** — `build:examples` + `preview:examples`, never Vite dev for gate numbers.
3. **Same machine deltas** — `main.json` is machine-specific (Apple Metal reference); do not compare across GPUs as absolute truth.
4. **CPU ms is king when FPS is flat** — ~120 FPS on a high-refresh panel is often rAF-capped; watch `cpuMs.p50` / `cpuMs.p95`.
5. **Severity order** — P0 → P1 → P2 → P3 unless a dependency forces reordering.
6. **Autonomous verification first** — console markers + window globals + `compare.ts` so agents can gate themselves.

---

## 3. Measurement system of record

### 3.1 Baseline file

| Field | Value |
|-------|--------|
| Path | `benchmarks/baselines/main.json` |
| Schema | `kind: "chartgpu-performance-baseline"`, `schemaVersion: 1` |
| Generated | `2026-07-15T19:05:38.955Z` |
| Adapter | `apple / metal-3 / 0x0000` |
| Browser | Chrome 150 · macOS |
| Canvas | **1280×720 CSS**, DPR **2** |
| Warmup / measure | **90** / **300** frames |
| Notes | Rebaselined after Phases 1–4 (grid uniforms, hover path, bind-group/setSeries skip, GPU decimation + stream LTTB fast path) |

### 3.2 Baseline numbers

| Scenario | FPS p50 | FPS mean | CPU ms p50 | CPU ms p95 | Library FPS | Drops |
|----------|---------|----------|------------|------------|-------------|-------|
| `static-1m-lttb` | 120.48 | 120.30 | 0.90 | 1.90 | 120.00 | 0 |
| `hover-1m-lttb` | 120.48 | 120.26 | 0.80 | 2.00 | 120.01 | 0 |
| `zoom-pan-1m` | 120.48 | 120.20 | 0.80 | 1.90 | 119.98 | 0 |
| `stream-append-lttb` | 120.48 | 120.21 | 0.60 | 1.10 | 120.00 | 0 |
| `stream-append-none` | 120.48 | 120.24 | 0.70 | 1.60 | 119.95 | 0 |

### 3.3 Regression thresholds

From `benchmarks/baseline/compare.ts`:

| Signal | Regression if |
|--------|----------------|
| FPS p50 | candidate vs baseline **&lt; −5%** |
| CPU ms p50 | candidate vs baseline **&gt; +8%** |

Optional CLI gate: `--fail-on-regression` (exit code **2**).

### 3.4 Scenarios (what each means)

| ID | Stimulus | Stresses |
|----|----------|----------|
| `static-1m-lttb` | 1M LTTB; force dirty via interaction-x oscillation | Steady full redraw, bind groups, setSeries pack |
| `hover-1m-lttb` | Sweep `setInteractionX` | Full hover path, hit-test, tooltip/highlight |
| `zoom-pan-1m` | Cycle zoom windows | Resample + re-upload |
| `stream-append-lttb` | Seed 50k + append 64/frame, LTTB | Streaming + sampling (slow path) |
| `stream-append-none` | Same, `sampling: 'none'` | Incremental append fast path |

---

## 4. How to run the benchmark

### 4.1 Production preview (required)

```bash
# Repo root
bun run benchmark:baseline:preview
# → vite build examples + preview :4173
```

**Full suite (auto-run + optional download):**

```text
http://localhost:4173/ChartGPU/examples/performance-baseline/?scenario=all&autorun=1&download=1
```

**Single scenario:**

```text
http://localhost:4173/ChartGPU/examples/performance-baseline/?scenario=hover-1m-lttb&autorun=1&warmup=90&measure=300
```

| Query | Default | Meaning |
|-------|---------|---------|
| `scenario` | `all` | `all` or one scenario id |
| `warmup` | `90` | Discarded frames |
| `measure` | `300` | Measured frames |
| `autorun` | `1` | `0` = wait for UI button |
| `download` | `0` | `1` = auto-download JSON |

**Never** use `bun run dev` for gate metrics.

### 4.2 Browser console (manual)

After the run completes:

```js
window.__CHARTGPU_BASELINE_DONE__     // true when finished
window.__CHARTGPU_BASELINE_REPORT__   // structured object
window.__CHARTGPU_BASELINE_JSON__     // compact JSON string

// Pretty-print
console.log(JSON.stringify(window.__CHARTGPU_BASELINE_REPORT__, null, 2))
```

### 4.3 Console markers (autonomous log scrape)

On completion the harness logs:

```text
CHARTGPU_BASELINE_DONE
CHARTGPU_BASELINE_JSON_BEGIN
{...one-line JSON...}
CHARTGPU_BASELINE_JSON_END
```

Agents: wait for `CHARTGPU_BASELINE_DONE`, then parse the line between `BEGIN` and `END`, **or** read `window.__CHARTGPU_BASELINE_JSON__`.

### 4.4 CLI compare

```bash
bun run benchmark:baseline:compare -- \
  benchmarks/baselines/main.json \
  /path/to/candidate.json

bun run benchmark:baseline:compare -- \
  benchmarks/baselines/main.json \
  /path/to/candidate.json \
  --fail-on-regression
```

### 4.5 Autonomous agent loop

```text
1. bun run build:examples
2. Start preview on :4173 (or reuse running preview)
3. Navigate to:
   /ChartGPU/examples/performance-baseline/?scenario=all&autorun=1
   (or a single scenario mapped to the finding)
4. Wait until:
   - console contains CHARTGPU_BASELINE_DONE, OR
   - window.__CHARTGPU_BASELINE_DONE__ === true
   (timeout: several minutes for full suite — 1M data gen × 5 scenarios)
5. Capture window.__CHARTGPU_BASELINE_JSON__ → candidate.json
6. bun run benchmark:baseline:compare -- benchmarks/baselines/main.json candidate.json
7. FAIL the step if exit 2 (unless finding is correctness-only / not harness-covered)
8. Update finding Status in this document
9. Do not push unless the user asks
```

Playwright-style wait:

```js
await page.goto(BASELINE_URL);
await page.waitForFunction(
  () => window.__CHARTGPU_BASELINE_DONE__ === true,
  null,
  { timeout: 600_000 },
);
const json = await page.evaluate(() => window.__CHARTGPU_BASELINE_JSON__);
```

---

## 5. Scenario → finding map

| Scenario | Primary findings |
|----------|------------------|
| `static-1m-lttb` | P1-1, P1-2, P1-5, P1-6, P1-7 |
| `hover-1m-lttb` | **P0-4**, **P0-5**, P1-8, P3-7 |
| `zoom-pan-1m` | **P0-2**, P1-7, P1-10 |
| `stream-append-lttb` | **P0-3**, P0-2 |
| `stream-append-none` | Append fast-path health (contrast with LTTB stream) |

**Weak / not covered by default suite** (need visual, unit, or harness extension):

- **P0-1** grid dual-color correctness  
- **P1-3 / P1-4** area paths  
- **P1-9** annotations  
- **P2-1 / P2-2** pipeline startup  
- **P2-8** resize thrash  
- **P2-9** GPU timestamps  
- **P2-11** docs drift  

---

## 6. Complete findings registry

**Status values:** `open` · `in_progress` · `done` · `deferred` · `wontfix`

### 6.1 P0 — Critical

#### P0-1 · Grid multi-batch FS uniforms via `writeBuffer` in `render()`

| Field | Detail |
|-------|--------|
| **Status** | `done` |
| **Where** | `src/renderers/createGridRenderer.ts` |
| **Problem** | Per-batch `queue.writeBuffer` into one FS uniform then `draw()`; draws may all see last color (correctness) + waste |
| **Fix** | Dynamic uniform offsets (`minUniformBufferOffsetAlignment`, often 256) or vertex colors |
| **Verify** | Distinct H/V grid colors; unit/visual; baseline optional |
| **Harness** | weak |
| **Landed** | FS binding `hasDynamicOffset: true`; colors written in `prepare()` into geometrically-grown slots; `render()` only sets bind group + draw |

#### P0-2 · CPU LTTB only — GPU decimation missing from `src/`

| Field | Detail |
|-------|--------|
| **Status** | `done` |
| **Where** | `createRenderCoordinator.ts`, `sampleSeries.ts`; no `src/shaders/decimation.wgsl` |
| **Problem** | Large series always CPU-sample; docs/dist may claim GPU path |
| **Fix** | GPU decimation + single eligibility gate (baseline / zoom / prepare) |
| **Verify** | `zoom-pan-1m`, `stream-append-lttb` CPU ↓; visual sampling parity |
| **Harness** | zoom + stream LTTB |
| **Landed** | `decimation.wgsl` + `createDecimationCompute` + `isGpuDecimationEligible` (lttb/min/max, no gaps, line without areaStyle). Gate used in baseline recompute, zoom recompute, and prepareSeries. Line+areaStyle stays on CPU until P1-3/P1-4. |

#### P0-3 · Streaming + default sampling defeats incremental append

| Field | Detail |
|-------|--------|
| **Status** | `done` |
| **Where** | `canUseFastPath` requires `sampling === 'none'`; flush resamples full baseline |
| **Problem** | Live LTTB streaming is O(n) CPU + full re-upload |
| **Fix** | Raw append + GPU decimation, or windowed sampling; expand fast path |
| **Verify** | `stream-append-lttb` CPU approaches `stream-append-none` |
| **Harness** | stream LTTB vs none |
| **Landed** | `gpuDecimationRaw` kind expands append fast path; stream LTTB CPU now matches stream-none (~0.6 ms p50) |

#### P0-4 · Pointer move triggers full chart `render()` every time

| Field | Detail |
|-------|--------|
| **Status** | `done` (partial — full overlay-only path deferred) |
| **Where** | `onMouseMove` → `requestRender()` in coordinator |
| **Problem** | Hover drives full prepare/encode/DOM |
| **Fix** | Throttle; overlay-only path; skip series prepare when stable |
| **Verify** | `hover-1m-lttb` CPU ↓ |
| **Harness** | hover |
| **Landed** | Tooltip hit-test throttled to ~30 Hz with scheduled follow-up render; crosshair still tracks every frame. Overlay-only GPU path remains open if further hover CPU is needed. |

#### P0-5 · Duplicate `findNearestPoint` per hover frame

| Field | Detail |
|-------|--------|
| **Status** | `done` |
| **Where** | Tooltip path + `renderOverlays` highlight |
| **Problem** | 2× hit-test per frame |
| **Fix** | Share one match for tooltip + highlight |
| **Verify** | `hover-1m-lttb` CPU; unit tests |
| **Harness** | hover |
| **Landed** | Coordinator computes `sharedNearestMatch` once per mouse-in-grid frame; passed to `prepareOverlays` and reused by item-mode tooltip |

---

### 6.2 P1 — High

#### P1-1 · Line `createBindGroup` every `prepare()`

| Field | Detail |
|-------|--------|
| **Status** | `done` |
| **Where** | `createLineRenderer.ts` |
| **Fix** | Cache bind group by `dataBuffer` identity |
| **Verify** | static + hover CPU |
| **Harness** | static, hover |
| **Landed** | `boundDataBuffer` identity check; rebuild only when DataStore reallocates |

#### P1-2 · `DataStore.setSeries` packs/hashes before skip

| Field | Detail |
|-------|--------|
| **Status** | `done` |
| **Where** | `createDataStore.ts` / `renderSeries.ts` |
| **Fix** | Cheap dirty check before pack; reuse staging |
| **Verify** | static CPU when data unchanged |
| **Harness** | static |
| **Landed** | `LastSetSeriesCache` in `prepareSeries` skips `setSeries` when data ref + xOffset unchanged; cleared during update-animation interpolation and runtime series re-init |

#### P1-3 · Area full vertex rebuild + upload every prepare

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Where** | `createAreaRenderer.ts` |
| **Fix** | Domain GPU data + uniforms; skip upload when unchanged |
| **Verify** | Extend harness or area example + CPU |
| **Harness** | extend if fixing |

#### P1-4 · Line + `areaStyle` dual data paths

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Where** | `renderSeries.ts` |
| **Fix** | Shared GPU data; fill then stroke |
| **Verify** | with P1-3 |
| **Harness** | extend |

#### P1-5 · Three passes + dual 4× MSAA

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Where** | `textureManager.ts`, coordinator |
| **Fix** | Profile; collapse passes; optional 2×; skip unused overlay MSAA |
| **Verify** | Visual AA; memory; FPS on non-capped displays |
| **Harness** | all (GPU-bound) |

#### P1-6 · No render bundles / overlay prepare memo

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Where** | `renderOverlays.ts`, grid/axis |
| **Fix** | Memo signatures; optional `GPURenderBundle` |
| **Verify** | static/hover CPU |
| **Harness** | static, hover |

#### P1-7 · Redundant multi-stage CPU sampling

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Where** | OptionResolver + baseline + zoom |
| **Fix** | Dirty flags; skip baseline when raw unchanged |
| **Verify** | theme-only setOption unit; zoom CPU |
| **Harness** | zoom |

#### P1-8 · Non-monotonic hit-test O(n)

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Where** | `findNearestPoint.ts` |
| **Fix** | Domain spatial index + WeakMap |
| **Verify** | Unit tests unsorted series |
| **Harness** | weak (line is monotonic) |

#### P1-9 · Duplicate MSAA / non-MSAA annotation prepare

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Where** | coordinator annotation pairs |
| **Fix** | Share upload; dual draw only |
| **Verify** | annotation examples |
| **Harness** | weak |

#### P1-10 · Clip-space instance re-upload on zoom (bar/scatter/candle/pie)

| Field | Detail |
|-------|--------|
| **Status** | `open` |
| **Where** | respective renderers |
| **Fix** | Domain + uniform transform |
| **Verify** | Extend harness for scatter/bar |
| **Harness** | extend |

---

### 6.3 P2 — Medium

| ID | Title | Status | Where | Fix (short) | Verify |
|----|-------|--------|-------|-------------|--------|
| P2-1 | Sync-only pipeline creation | open | `rendererUtils`, `PipelineCache` | `create*PipelineAsync` + warm-up | Startup hitch |
| P2-2 | No `compilationHints` | open | shader create | Entry-point hints | Startup |
| P2-3 | Per-renderer layouts hurt cache | open | `rendererUtils` | Shared layouts | Multi-chart |
| P2-4 | Append growth full CPU re-upload | open | `createDataStore` | `COPY_SRC` + GPU copy | Stream growth |
| P2-5 | Line bounds O(n) every prepare | open | `createLineRenderer` | Cached `rawBounds` | large `none` series |
| P2-6 | Density bins cleared via writeBuffer | open | scatter density | GPU clear | density example |
| P2-7 | Clear before full-screen blit | open | overlay pass | Profile loadOp | GPU bandwidth |
| P2-8 | Resize thrash MSAA textures | open | textureManager | Hysteresis / pad | resize stress |
| P2-9 | No GPU timestamp queries | open | ChartGPU, GPUContext | Feature + timestamps | metrics API |
| P2-10 | Default device limits only | open | GPUContext | Optional large limits | huge series |
| P2-11 | Docs / AGENTS / dist vs src drift | open | docs, dist | Align or re-land | review |
| P2-12 | `filterGaps` alloc every frame | open | renderSeries | Cache until dirty | connectNulls |

---

### 6.4 P3 — Low

| ID | Title | Status | Fix (short) |
|----|-------|--------|-------------|
| P3-1 | No `mappedAtCreation` | open / deferred | Optional huge static uploads |
| P3-2 | PoT buffer growth VRAM | document | Document tradeoff |
| P3-3 | Overlay small ArrayBuffer allocs | open | Scratch buffers |
| P3-4 | STORAGE on all DataStore buffers | open | Usage by series kind |
| P3-5 | Blit clear-then-cover | open | See P2-7 |
| P3-6 | Bar hit-test category sort | open | Cache category step |
| P3-7 | DOM labels every hover full render | open | Skip when only pointer moved |
| P3-8 | Eager layouts on pool growth | open | Warm-up off critical path |

---

## 7. Patterns that must not regress

- Single encoder + single `queue.submit` per chart frame  
- MSAA `storeOp: "discard"` after resolve  
- Top overlay `loadOp: "load"` on swapchain  
- DataStore append ranged `writeBuffer` + incremental hash  
- Content-hash GPU upload skip (improve pre-pack check — P1-2)  
- StreamBuffer double-buffer + word-diff  
- Scatter density dirty gate + bind-group cache  
- PipelineCache shader dedupe  
- Zoom resample debounce; append flush coalescing  
- Explicit GPU `destroy()` / dispose  

---

## 8. Phased execution plan

| Phase | Scope | Outcome |
|-------|--------|---------|
| **0** | Harness + `main.json` + this goal doc | **Done** — measurement & tracking |
| **1** | P0-1 | **Done** — grid dynamic-offset FS uniforms |
| **2** | P0-5, P0-4 | **Done** (P0-4 partial) — shared nearest match + 30 Hz tooltip throttle |
| **3** | P1-1, P1-2 | **Done** — line bind-group cache + setSeries ref skip |
| **4** | P0-2, P0-3 | **Done** — GPU decimation + stream LTTB fast path |
| **5** | P1-6, P1-7, P2-5, P2-12 | Encode / sampling churn |
| **6** | P1-3, P1-4, P1-9, P1-10 | Series structural |
| **7** | P1-5, P2-7 | Pass / MSAA budget (profile first) |
| **8** | P2-1, P2-2, P2-9 | Startup + observability |
| **9** | Remaining P2/P3 + P2-11 | Cleanup & docs truth |

### Phase exit criteria

1. Code + tests as needed for the phase findings.  
2. Production baseline run (mapped scenarios or `all`).  
3. `compare.ts` clean vs `main.json` (or justified re-baseline).  
4. Status fields updated in **this file**.  
5. No push unless requested.

---

## 9. Definition of done (program)

- [x] All **P0** → `done` or `deferred` with written reason *(P0-4 partial: tooltip throttle landed; overlay-only path deferred)*  
- [ ] All **P1** → `done` or `deferred` with harness plan *(P1-1, P1-2 done; rest open)*  
- [ ] All **P2/P3** triaged  
- [ ] **P2-11** closed (docs/`AGENTS.md`/`dist` match `src/`)  
- [ ] Fresh full-suite JSON compared to final baseline  
- [ ] Correctness checks pass (grid dual color, sampling, append)  
- [ ] No unexplained CPU/FPS regressions on the reference machine  

### Rebaseline note (Phases 1–4)

`main.json` was replaced on 2026-07-15 with the browser suite at  
`chartgpu-baseline-2026-07-15T19-05-38-959Z.json` (post GPU-decimation + hover work).  
Prior pre-optimization reference: static 0.70 / hover 1.55 / zoom 0.90 / stream-lttb 1.70 / stream-none 1.00 CPU ms p50.

---

## 10. Agent checklist (paste into task prompts)

```text
OVERARCHING GOAL: ChartGPU performance
Source of truth: OVERARCHING_PERFORMANCE_GOALS.md

Before coding:
- [ ] Pick finding ID(s) from §6
- [ ] Note harness scenario(s) from §5
- [ ] Read audit.md section for that finding if needed

After coding:
- [ ] bun run build:examples (+ preview:examples if not running)
- [ ] Open performance-baseline with autorun for mapped scenario(s)
- [ ] Wait for CHARTGPU_BASELINE_DONE / __CHARTGPU_BASELINE_DONE__
- [ ] Capture __CHARTGPU_BASELINE_JSON__ → candidate.json
- [ ] bun run benchmark:baseline:compare -- benchmarks/baselines/main.json candidate.json
- [ ] Update Status in OVERARCHING_PERFORMANCE_GOALS.md
- [ ] Do not push unless asked
```

---

## 11. Document map

| Path | Role |
|------|------|
| **`OVERARCHING_PERFORMANCE_GOALS.md`** | **This file — program control plane** |
| `audit.md` | Full audit narrative + WebGPU spec grounding |
| `docs/PERFORMANCE_GOALS.md` | Shorter twin / pointer into the same program |
| `docs/performance.md` | End-user performance guide |
| `examples/performance-baseline/` | Browser harness |
| `benchmarks/baselines/main.json` | Numeric baseline of record |
| `benchmarks/baseline/compare.ts` | CLI regression compare |
| `benchmarks/baseline/README.md` | Operator notes |

---

## 12. Finding index (quick)

| ID | Sev | One-line | Status |
|----|-----|----------|--------|
| P0-1 | P0 | Grid FS uniforms in `render()` (correctness) | done |
| P0-2 | P0 | GPU decimation missing; CPU LTTB only | done |
| P0-3 | P0 | Stream + sampling defeats append fast path | done |
| P0-4 | P0 | Mousemove → full render | done (partial) |
| P0-5 | P0 | Double `findNearestPoint` | done |
| P1-1 | P1 | Line bind group every prepare | done |
| P1-2 | P1 | setSeries pack/hash before skip | done |
| P1-3 | P1 | Area full rebuild/upload | open |
| P1-4 | P1 | Line+areaStyle dual path | open |
| P1-5 | P1 | 3 passes + dual 4× MSAA | open |
| P1-6 | P1 | No bundles / overlay memo | open |
| P1-7 | P1 | Redundant multi-stage sampling | open |
| P1-8 | P1 | Non-monotonic hit-test O(n) | open |
| P1-9 | P1 | Dup annotation prepare | open |
| P1-10 | P1 | Clip-space instance re-upload | open |
| P2-1…P2-12 | P2 | Startup, copy, density, resize, timestamps, docs… | open |
| P3-1…P3-8 | P3 | Mapping, allocs, STORAGE flags, DOM on hover… | open |

---

*This is the overarching source of truth for the performance program. Update statuses here as work lands. Prefer editing this file over creating parallel trackers.*
