# SciChart Benchmark Session Handoff

**Date:** 2026-07-15  
**Purpose:** Resume ChartGPU optimization against the SciChart.js performance suite without re-discovering setup.

---

## Goal

Iterate ChartGPU performance **test-by-test** using SciChart’s official JS chart performance suite as source of truth (Local results, same machine). Primary comparison metric of interest: **Ingestion Rate (pts/sec)**; FPS still matters for interpretation.

---

## Repos & servers

| Item | Path / detail |
|------|----------------|
| ChartGPU library | `/Users/huntergemmer/projects/hunter/chart-gpu` |
| Performance suite | `/Users/huntergemmer/projects/hunter/javascript-chart-performance-test-suite` |
| Suite URL | `http://localhost:5173/` (Vite root = `public/`) |
| Dev server | `cd javascript-chart-performance-test-suite && bun run dev` |
| Local ChartGPU dist | suite serves `../chart-gpu/dist` at **`/local-chartgpu/`** |

### Local ChartGPU wiring (already done)

- `javascript-chart-performance-test-suite/vite.config.js` — middleware `/local-chartgpu` → `CHARTGPU_DIST` or `../chart-gpu/dist`
- `public/chartgpu/chartgpu.html` — tries `/local-chartgpu/index.js` first, CDN fallback
- `public/chartgpu/chartgpu_tests.js` — `eLibVersion()` returns `0.3.4-local` when local source loaded
- Rebuild ChartGPU after lib changes: `cd chart-gpu && bun run build` (dist is self-contained ES bundle)

### Optional Playwright (broken for discovery; prefer browser-harness)

- `LIBRARY=chartgpu playwright test` filter added in `tests/global-setup.js`
- Playwright global setup looks for `.run-test-link` which **does not exist** (links only have `title="Run Test"`)
- Browser harness + user’s Chrome is the working path (WebGPU + Local IndexedDB)

---

## Baseline runs completed (Local IndexedDB)

| Library | Version tag | Status |
|---------|-------------|--------|
| ChartGPU | `0.3.4-local` (`/local-chartgpu/index.js`) | Groups 1–6, 8–10 OK; FIFO partial (missing 5M/10M); multi-chart skips 64+ |
| SciChart.js | `5.0.0-beta.169` | Groups 1–10 complete |

**Test group IDs** (`before.js` `G_TEST_GROUPS`):

| ID | Name | ChartGPU |
|----|------|----------|
| 1 | N line series M points | yes |
| 2 | Brownian Motion Scatter | yes |
| 3 | Line unsorted in x | yes |
| 4 | Point series sorted Y updates | yes |
| 5 | Column ascending X | yes |
| 6 | Candlestick | yes |
| 7 | FIFO / ECG | yes (re-run incomplete at large N) |
| 8 | Mountain | yes |
| 9 | Series compression | yes |
| 10 | Multi chart | yes (skip >32 in harness) |
| 11–13 | Heatmap / 3D | **not supported** by ChartGPU harness |

**URLs:**

```
http://localhost:5173/chartgpu/chartgpu.html?test_group_id=N
http://localhost:5173/scichart/scichart.html?test_group_id=N
```

Wait for `.results-table-ready`. Close tab between groups. Avoid hammering `Runtime.evaluate` during heavy FIFO (main thread blocks CDP).

---

## Saved comparison artifacts

| File | Contents |
|------|----------|
| `chart-gpu/docs/scichart-vs-chartgpu-local-baseline.md` | Full handoff comparison: (1) ingest-only tables (2) ingest + FPS + winner + scoreboard |
| `javascript-chart-performance-test-suite/tests/scichart-vs-chartgpu-local.md` | Same content |
| `javascript-chart-performance-test-suite/tests/chartgpu-local-baseline.json` | ChartGPU group results from harness |
| `javascript-chart-performance-test-suite/tests/scichart-local-baseline.json` | SciChart group results |
| `javascript-chart-performance-test-suite/tests/local-idb-cgpu-scichart.json` | Raw Local IndexedDB extract (both libs) |

**Scoreboard (ingest rate, per config):** ChartGPU **13** · SciChart **48** · ties **13** · incomplete **6**

---

## How ingestion rate is computed (important)

Suite metric is **not pure network ingest**:

- Streaming (FIFO, compression, multi): roughly **points-per-frame × FPS**
- Static/zoom loops: effectively **point count × sustained FPS** during update loop

So multi-million “M pts/sec” on mountain/column for SciChart ≈ **still ~120 FPS redrawing static data**, not 90M new points/sec.

---

## Performance hypotheses (ordered by leverage)

1. **Axes-only / data-identity skip in `setOption`**  
   Mountain, column, candlestick, N×M only change axis range but harness rebuilds series option objects every frame. SciChart likely only mutates visible range. Explains largest gaps (column/mountain at 5M–10M: SciChart stays ~120 FPS, ChartGPU collapses).

2. **Full series rewrite path**  
   Scatter / unsorted line / point Y-update: regenerate all points + full `setOption` every frame → O(n) JS + GPU upload. ChartGPU plateaus ~8–12M “ingest”; SciChart keeps scaling with FPS.

3. **FIFO / streaming**  
   Low N: tied. At 1M+: SciChart ~7× ahead. ChartGPU has append fast path only under narrow conditions; FIFO window reset uses full `setOption`. Large FIFO incomplete for ChartGPU (main-thread hang during poll).

4. **`sampling: 'none'` in many harness cases**  
   Forces raw geometry; SciChart may cache/decimate smarter on redraw.

5. **Multi-chart**  
   Per-instance overhead; ChartGPU harness skips >32 charts (OOM guard).

6. **Candlestick exception**  
   ChartGPU **wins** ingest on most sizes (~2× through 500k). Don’t over-generalize; at 5M+ SciChart still holds higher FPS.

---

## ChartGPU harness quirks (`chartgpu_tests.js`)

- Almost every `updateChart` builds full `options` + `series: [{...}]` and `setOption`
- Zoom-style tests: data static, yMin/yMax expand → still pass full series
- Scatter/line rewrite: new DATA array every frame
- FIFO: `appendData` then sometimes full `setOption` on sliding window; `sampling: 'lttb'`
- Series compression: `appendData` + LTTB
- Multi-chart: skips `chartsNum > 32`
- N×M: skips `seriesNum > 4000` (comment says OOM ~8000)

Prefer **library fixes** that make idiomatic full-`setOption` cheap when data ref unchanged; only change harness if SciChart’s harness is clearly more idiomatic.

---

## Suggested next work (not yet started)

1. Profile/fix `setOption` path: skip series data re-upload when data array identity unchanged and only axes/grid change.
2. Re-run **Mountain** + **Column** (groups 8, 5) and compare ingest/FPS to Local baseline.
3. Then streaming: Series compression (9) + complete FIFO (7).
4. Then scatter / point update (2, 4) / unsorted line (3).
5. Re-run SciChart only if needed for same-session fairness; current SciChart Local baseline is valid.

### Re-baseline loop

```
bun run build   # in chart-gpu
# suite already serves /local-chartgpu from dist
# browser-harness: open chartgpu.html?test_group_id=N, wait .results-table-ready
# refresh homepage Local → Ingestion Rate metric
```

---

## AGENTS.md reminders relevant here

- Profile **production** builds for ChartGPU examples; suite uses library dist (good).
- Line/area/scatter bind-group cache by buffer identity.
- `lastSetSeriesCache` must clear during animation interpolation.
- GPU decimation eligibility must stay in sync across three call sites if touching sampling.
- Append fast path conditions: line, sampling none or gpuDecimationRaw, full zoom, etc.

---

## Browser harness tips

- Use `browser-harness` against user’s Chrome (not Playwright) for WebGPU + Local IDB.
- Hung FIFO tab: `Target.getTargets` + `Target.closeTarget` (don’t rely on `Runtime.evaluate` on blocked page).
- Gentle poll during long tests (5–10s), not 2s evaluate spam.

---

## One-line summary for next agent

**Local ChartGPU 0.3.4-local is wired into SciChart’s suite; both libs baselined; comparisons saved under `docs/scichart-vs-chartgpu-local-baseline.md`. Biggest gap is static zoom redraw redoing full data path every frame—fix `setOption` data-identity skip first, then re-run mountain/column against Local ingest metric.**
