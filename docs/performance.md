# Performance Guide

Optimize ChartGPU for large datasets and real-time streaming.

## Sampling

**When:** Dataset > 5K points per series (default `samplingThreshold`), or frame rate drops.

**Defaults:** `sampling: 'lttb'`, `samplingThreshold: 5000`

**Algorithms:**

| Algorithm | Best for | Preserves |
|-----------|----------|-----------|
| `lttb` (default) | General time-series | Shape, peaks, outliers |
| `average` | Noisy data | Trends |
| `max` / `min` | Spikes | Peaks / valleys |
| `none` | Small datasets (<5K) | All points |

**GPU decimation (line, `lttb`/`min`/`max`, null-gap-free):** compute shaders replace CPU sampling. When points-per-bucket exceed **512**, each bucket evaluates a uniform **512-candidate** set (endpoints included) instead of every raw point — exact below that density; approximate extrema/shape at extreme N (e.g. 10M pts / 2500 buckets). This bounds GPU bandwidth for FIFO streaming without changing `sampling` mode.

**Config:** Per-series `sampling`, `samplingThreshold` in [options](api/options.md#series-configuration). See [`examples/sampling/`](../examples/sampling/).

## Zoom-aware resampling

Zoom triggers resampling on visible range only. Target scales with zoom level (capped at 200K points). Debounce ~100ms.

**Y-axis bounds:** `yAxis.autoBounds: 'visible'` (default) rescales to visible data; `'global'` uses full dataset bounds.

## Streaming

**Recommended config:**
- `animation: false`
- `autoScroll: true`
- `dataZoom: [{ type: 'inside' }, { type: 'slider' }]`
- `sampling: 'lttb'`, `samplingThreshold: 2500`

**Memory:** Trim when `rawData.length > maxPoints` — `setOption({ series: [{ data: rawData.slice(-maxPoints) }] })`. See [`examples/live-streaming/`](../examples/live-streaming/).

## appendData vs setOption

| Method | Use case | GPU upload | Animation |
|--------|----------|------------|-----------|
| `appendData(index, newPoints)` | Streaming, incremental | Incremental when possible | No |
| `setOption({ series })` | Full replacement |

**appendData:** Cartesian only, append-only. **setOption:** Full data/config changes, supports animation.

## Memory & disposal

- Call `chart.dispose()` when chart is no longer needed.
- Buffer growth: geometric (power-of-two). No shrinking until disposal.
- Time axis: ChartGPU rebases epoch-ms internally for Float32 precision.

## Performance baseline (regression tracking)

**Location:** [`examples/performance-baseline/`](../examples/performance-baseline/)

Fixed scenarios (static redraw, hover, zoom/pan, stream append) that emit JSON with FPS and CPU frame-time percentiles. Use this before/after performance work.

```bash
bun run benchmark:baseline:preview
# open http://localhost:4173/ChartGPU/examples/performance-baseline/?scenario=all&autorun=1&download=1
# save JSON → benchmarks/baselines/main.json
bun run benchmark:baseline:compare -- benchmarks/baselines/main.json ./candidate.json
```

Details: [`benchmarks/baseline/README.md`](../benchmarks/baseline/README.md), [`benchmarks/baselines/README.md`](../benchmarks/baselines/README.md).

**Important:** Measure against the **production** examples build (`preview:examples`), not the Vite dev server.

## Benchmark (1M points)

**Location:** [`examples/million-points/`](../examples/million-points/)

**Steps:** `npm run dev` → `http://localhost:5176/examples/million-points/` → Enable "Benchmark mode".

**Stats:** FPS, CPU submit time, GPU time, rendered point count. CPU > GPU time: CPU-bound; GPU > CPU: GPU-bound.

## Checklist

- [ ] Enable sampling for datasets >5K
- [ ] Use `appendData` for streaming
- [ ] Bound memory with periodic trim
- [ ] Disable animation for streaming
- [ ] Call `dispose()` when done
- [ ] Profile with DevTools

## See also

- [API Reference](api/README.md) — Sampling, zoom, lifecycle
- [Getting Started](GETTING_STARTED.md)
- [examples/sampling/](../examples/sampling/), [examples/live-streaming/](../examples/live-streaming/), [examples/million-points/](../examples/million-points/)
