# Performance baseline tooling

| Path | Role |
|------|------|
| [`examples/performance-baseline/`](../../examples/performance-baseline/) | Browser harness (FPS + CPU ms, JSON report) |
| [`compare.ts`](./compare.ts) | Diff two reports |
| [`../baselines/`](../baselines/) | Checked-in machine baselines (`main.json`) |

## Quick start

```bash
# Production build + preview (port 4173)
bun run benchmark:baseline:preview
```

Open:

```
http://localhost:4173/ChartGPU/examples/performance-baseline/?scenario=all&autorun=1&download=1
```

Save the downloaded JSON to `benchmarks/baselines/main.json` after a clean run on your reference machine.

## Compare

```bash
bun run benchmark:baseline:compare -- benchmarks/baselines/main.json ./candidate.json
```

## Design notes

- Uses `renderMode: 'external'` and measures wall time around dirty + `renderFrame()`.
- Canvas locked to **1280×720 CSS** for stable DPR×size on a given machine.
- Scenarios map to audit hot paths (hover full-frame, zoom resample, stream append LTTB vs none).
- Prefer production preview over `bun run dev` (dev overhead masks regressions).
