# SciChart.js vs ChartGPU — Local Baseline Comparisons

Generated from Local IndexedDB results on the SciChart JavaScript Chart Performance Test Suite (`http://localhost:5173/`).

| Library | Version |
|---|---|
| **ChartGPU** | `ChartGPU 0.3.4-local` |
| **SciChart.js** | `SciChart.js 5.0.0-beta.169` |

**Machine:** same browser session / same suite for both libraries.

---

## 1. Ingestion rate only (pts/sec)

Primary metric: **Data Ingestion Rate (pts/sec)**.

### FIFO / ECG Chart Performance Test

| Parameters | ChartGPU | SciChart.js |
|---|---:|---:|
| 5 series, 100 pts, +100/frame | 59.8k | 59.8k |
| 5 series, 10,000 pts, +1,000/frame | 613.1k | 611.9k |
| 5 series, 100,000 pts, +10,000/frame | 5.04M | 6.12M |
| 5 series, 1,000,000 pts, +100,000/frame | 8.37M | 61.19M |
| 5 series, 5,000,000 pts, +250,000/frame | — | 111.34M |
| 5 series, 10,000,000 pts, +250,000/frame | — | 92.84M |

### Line series which is unsorted in x

| Parameters | ChartGPU | SciChart.js |
|---|---:|---:|
| 1 series, 1,000 pts | 119.4k | 119.4k |
| 1 series, 10,000 pts | 1.19M | 1.19M |
| 1 series, 50,000 pts | 1.66M | 5.70M |
| 1 series, 100,000 pts | 1.74M | 5.96M |
| 1 series, 200,000 pts | 1.79M | 6.15M |
| 1 series, 500,000 pts | 1.97M | 6.18M |
| 1 series, 1,000,000 pts | 2.53M | 6.44M |
| 1 series, 5,000,000 pts | 3.41M | 7.84M |
| 1 series, 10,000,000 pts | SKIPPED | HANGING |

### Brownian Motion Scatter Series

| Parameters | ChartGPU | SciChart.js |
|---|---:|---:|
| 1 series, 1,000 pts | 119.3k | 115.8k |
| 1 series, 10,000 pts | 1.19M | 1.19M |
| 1 series, 50,000 pts | 5.97M | 5.96M |
| 1 series, 100,000 pts | 11.47M | 11.92M |
| 1 series, 200,000 pts | 12.39M | 23.85M |
| 1 series, 500,000 pts | 10.69M | 59.69M |
| 1 series, 1,000,000 pts | 10.82M | 66.07M |
| 1 series, 5,000,000 pts | 9.14M | 64.21M |
| 1 series, 10,000,000 pts | 8.02M | 63.39M |

### Mountain Chart Performance Test

| Parameters | ChartGPU | SciChart.js |
|---|---:|---:|
| 1 series, 1,000 pts | 8.3k | 9.3k |
| 1 series, 10,000 pts | 465.1k | 438.6k |
| 1 series, 50,000 pts | 2.21M | 2.29M |
| 1 series, 100,000 pts | 4.12M | 4.65M |
| 1 series, 200,000 pts | 8.93M | 9.52M |
| 1 series, 500,000 pts | 10.80M | 23.15M |
| 1 series, 1,000,000 pts | 11.79M | 46.51M |
| 1 series, 5,000,000 pts | 13.71M | 62.19M |
| 1 series, 10,000,000 pts | 13.56M | 72.52M |

### Column chart with data ascending in X

| Parameters | ChartGPU | SciChart.js |
|---|---:|---:|
| 1 series, 1,000 pts | 9.0k | 5.6k |
| 1 series, 10,000 pts | 473.9k | 452.5k |
| 1 series, 50,000 pts | 2.08M | 2.30M |
| 1 series, 100,000 pts | 4.41M | 4.48M |
| 1 series, 200,000 pts | 9.43M | 9.26M |
| 1 series, 500,000 pts | 8.94M | 22.12M |
| 1 series, 1,000,000 pts | 8.73M | 43.67M |
| 1 series, 5,000,000 pts | 11.71M | 68.49M |
| 1 series, 10,000,000 pts | 10.67M | 87.34M |

### Candlestick series test

| Parameters | ChartGPU | SciChart.js |
|---|---:|---:|
| 1 series, 1,000 pts | 8.8k | 5.1k |
| 1 series, 10,000 pts | 446.4k | 226.8k |
| 1 series, 50,000 pts | 2.05M | 1.05M |
| 1 series, 100,000 pts | 3.77M | 1.84M |
| 1 series, 200,000 pts | 9.01M | 3.99M |
| 1 series, 500,000 pts | 15.97M | 8.04M |
| 1 series, 1,000,000 pts | 14.51M | 13.97M |
| 1 series, 5,000,000 pts | 20.86M | 25.60M |
| 1 series, 10,000,000 pts | 27.77M | 23.29M |

### Multi Chart Performance Test

| Parameters | ChartGPU | SciChart.js |
|---|---:|---:|
| 1 chart, 1 series, 100,000 pts, +10,000/frame | 165.63M | 225.77M |
| 2 charts, 1 series, 100,000 pts, +10,000/frame | 84.77M | 234.21M |
| 4 charts, 1 series, 100,000 pts, +10,000/frame | 53.84M | 260.41M |
| 8 charts, 1 series, 100,000 pts, +10,000/frame | 45.62M | 368.47M |
| 16 charts, 1 series, 100,000 pts, +10,000/frame | 37.45M | 215.26M |
| 32 charts, 1 series, 100,000 pts, +10,000/frame | 23.01M | 161.14M |
| 64 charts, 1 series, 100,000 pts, +10,000/frame | SKIPPED | 98.83M |
| 128 charts, 1 series, 100,000 pts, +10,000/frame | — | 48.06M |

### Series Compression Test

| Parameters | ChartGPU | SciChart.js |
|---|---:|---:|
| 1 series, 1,000 pts, +100/frame | 12.3k | 12.3k |
| 1 series, 10,000 pts, +1,000/frame | 122.6k | 122.4k |
| 1 series, 100,000 pts, +10,000/frame | 996.5k | 1.22M |
| 1 series, 1,000,000 pts, +100,000/frame | 3.32M | 10.50M |
| 1 series, 10,000,000 pts, +1,000,000/frame | 8.80M | 34.93M |

### Point series, sorted, updating y-values

| Parameters | ChartGPU | SciChart.js |
|---|---:|---:|
| 1 series, 1,000 pts | 119.4k | 118.5k |
| 1 series, 10,000 pts | 1.19M | 1.19M |
| 1 series, 50,000 pts | 5.97M | 5.95M |
| 1 series, 100,000 pts | 11.12M | 11.90M |
| 1 series, 200,000 pts | 11.97M | 23.85M |
| 1 series, 500,000 pts | 11.66M | 32.17M |
| 1 series, 1,000,000 pts | 11.56M | 33.29M |
| 1 series, 5,000,000 pts | 11.22M | 34.51M |
| 1 series, 10,000,000 pts | 10.61M | 26.36M |

### N line series M points

| Parameters | ChartGPU | SciChart.js |
|---|---:|---:|
| 100 series, 100 pts | 65.0k | 42.1k |
| 200 series, 200 pts | 644.1k | 883.0k |
| 500 series, 500 pts | 2.33M | 4.06M |
| 1000 series, 1,000 pts | 2.21M | 12.00M |
| 2000 series, 2,000 pts | 5.37M | 24.42M |
| 4000 series, 4,000 pts | 7.13M | 41.14M |
| 8000 series, 8,000 pts | SKIPPED | 40.03M |

---

## 2. Full comparison (ingestion rate + FPS + winner)

Ingestion rate is the primary metric; average FPS is included for context. Winner is decided by ingestion rate (±3% = tie).

### FIFO / ECG Chart Performance Test

| Parameters | ChartGPU ingest | SciChart ingest | Winner | ChartGPU FPS | SciChart FPS |
|---|---:|---:|:---:|---:|---:|
| 5 series, 100 pts, +100/frame | 59.8k | 59.8k | tie | 119.4 | 119.2 |
| 5 series, 10,000 pts, +1,000/frame | 613.1k | 611.9k | tie | 119.3 | 119.1 |
| 5 series, 100,000 pts, +10,000/frame | 5.04M | 6.12M | SciChart | 97.5 | 119.1 |
| 5 series, 1,000,000 pts, +100,000/frame | 8.37M | 61.19M | SciChart | 13.5 | 119.1 |
| 5 series, 5,000,000 pts, +250,000/frame | — | 111.34M | SciChart | — | 82.4 |
| 5 series, 10,000,000 pts, +250,000/frame | — | 92.84M | SciChart | — | 61.0 |

### Line series which is unsorted in x

| Parameters | ChartGPU ingest | SciChart ingest | Winner | ChartGPU FPS | SciChart FPS |
|---|---:|---:|:---:|---:|---:|
| 1 series, 1,000 pts | 119.4k | 119.4k | tie | 119.4 | 119.4 |
| 1 series, 10,000 pts | 1.19M | 1.19M | tie | 119.2 | 119.2 |
| 1 series, 50,000 pts | 1.66M | 5.70M | SciChart | 33.2 | 113.9 |
| 1 series, 100,000 pts | 1.74M | 5.96M | SciChart | 17.4 | 59.6 |
| 1 series, 200,000 pts | 1.79M | 6.15M | SciChart | 9.0 | 30.8 |
| 1 series, 500,000 pts | 1.97M | 6.18M | SciChart | 3.9 | 12.4 |
| 1 series, 1,000,000 pts | 2.53M | 6.44M | SciChart | 2.5 | 6.4 |
| 1 series, 5,000,000 pts | 3.41M | 7.84M | SciChart | 0.7 | 1.6 |
| 1 series, 10,000,000 pts | SKIPPED | HANGING | — | SKIPPED | HANGING |

### Brownian Motion Scatter Series

| Parameters | ChartGPU ingest | SciChart ingest | Winner | ChartGPU FPS | SciChart FPS |
|---|---:|---:|:---:|---:|---:|
| 1 series, 1,000 pts | 119.3k | 115.8k | ChartGPU | 119.3 | 115.8 |
| 1 series, 10,000 pts | 1.19M | 1.19M | tie | 119.2 | 119.1 |
| 1 series, 50,000 pts | 5.97M | 5.96M | tie | 119.3 | 119.2 |
| 1 series, 100,000 pts | 11.47M | 11.92M | SciChart | 114.7 | 119.2 |
| 1 series, 200,000 pts | 12.39M | 23.85M | SciChart | 61.9 | 119.3 |
| 1 series, 500,000 pts | 10.69M | 59.69M | SciChart | 21.4 | 119.4 |
| 1 series, 1,000,000 pts | 10.82M | 66.07M | SciChart | 10.8 | 66.1 |
| 1 series, 5,000,000 pts | 9.14M | 64.21M | SciChart | 1.8 | 12.8 |
| 1 series, 10,000,000 pts | 8.02M | 63.39M | SciChart | 0.8 | 6.3 |

### Mountain Chart Performance Test

| Parameters | ChartGPU ingest | SciChart ingest | Winner | ChartGPU FPS | SciChart FPS |
|---|---:|---:|:---:|---:|---:|
| 1 series, 1,000 pts | 8.3k | 9.3k | SciChart | 119.1 | 119.3 |
| 1 series, 10,000 pts | 465.1k | 438.6k | ChartGPU | 119.3 | 119.1 |
| 1 series, 50,000 pts | 2.21M | 2.29M | SciChart | 119.5 | 119.2 |
| 1 series, 100,000 pts | 4.12M | 4.65M | SciChart | 119.4 | 119.2 |
| 1 series, 200,000 pts | 8.93M | 9.52M | SciChart | 119.5 | 119.3 |
| 1 series, 500,000 pts | 10.80M | 23.15M | SciChart | 62.2 | 119.4 |
| 1 series, 1,000,000 pts | 11.79M | 46.51M | SciChart | 31.9 | 119.7 |
| 1 series, 5,000,000 pts | 13.71M | 62.19M | SciChart | 6.2 | 119.6 |
| 1 series, 10,000,000 pts | 13.56M | 72.52M | SciChart | 2.7 | 119.4 |

### Column chart with data ascending in X

| Parameters | ChartGPU ingest | SciChart ingest | Winner | ChartGPU FPS | SciChart FPS |
|---|---:|---:|:---:|---:|---:|
| 1 series, 1,000 pts | 9.0k | 5.6k | ChartGPU | 119.4 | 112.9 |
| 1 series, 10,000 pts | 473.9k | 452.5k | ChartGPU | 119.3 | 119.1 |
| 1 series, 50,000 pts | 2.08M | 2.30M | SciChart | 119.3 | 119.1 |
| 1 series, 100,000 pts | 4.41M | 4.48M | tie | 119.3 | 119.2 |
| 1 series, 200,000 pts | 9.43M | 9.26M | tie | 91.3 | 119.2 |
| 1 series, 500,000 pts | 8.94M | 22.12M | SciChart | 39.3 | 119.5 |
| 1 series, 1,000,000 pts | 8.73M | 43.67M | SciChart | 19.4 | 119.7 |
| 1 series, 5,000,000 pts | 11.71M | 68.49M | SciChart | 3.7 | 119.7 |
| 1 series, 10,000,000 pts | 10.67M | 87.34M | SciChart | 1.6 | 119.6 |

### Candlestick series test

| Parameters | ChartGPU ingest | SciChart ingest | Winner | ChartGPU FPS | SciChart FPS |
|---|---:|---:|:---:|---:|---:|
| 1 series, 1,000 pts | 8.8k | 5.1k | ChartGPU | 119.3 | 116.2 |
| 1 series, 10,000 pts | 446.4k | 226.8k | ChartGPU | 119.3 | 119.1 |
| 1 series, 50,000 pts | 2.05M | 1.05M | ChartGPU | 119.5 | 119.2 |
| 1 series, 100,000 pts | 3.77M | 1.84M | ChartGPU | 119.5 | 119.1 |
| 1 series, 200,000 pts | 9.01M | 3.99M | ChartGPU | 119.6 | 119.3 |
| 1 series, 500,000 pts | 15.97M | 8.04M | ChartGPU | 119.6 | 119.0 |
| 1 series, 1,000,000 pts | 14.51M | 13.97M | ChartGPU | 83.6 | 119.2 |
| 1 series, 5,000,000 pts | 20.86M | 25.60M | SciChart | 20.0 | 118.8 |
| 1 series, 10,000,000 pts | 27.77M | 23.29M | ChartGPU | 10.1 | 117.3 |

### Multi Chart Performance Test

| Parameters | ChartGPU ingest | SciChart ingest | Winner | ChartGPU FPS | SciChart FPS |
|---|---:|---:|:---:|---:|---:|
| 1 chart, 1 series, 100,000 pts, +10,000/frame | 165.63M | 225.77M | SciChart | 101.6 | 119.1 |
| 2 charts, 1 series, 100,000 pts, +10,000/frame | 84.77M | 234.21M | SciChart | 68.6 | 118.3 |
| 4 charts, 1 series, 100,000 pts, +10,000/frame | 53.84M | 260.41M | SciChart | 47.9 | 118.9 |
| 8 charts, 1 series, 100,000 pts, +10,000/frame | 45.62M | 368.47M | SciChart | 27.6 | 98.0 |
| 16 charts, 1 series, 100,000 pts, +10,000/frame | 37.45M | 215.26M | SciChart | 14.9 | 47.8 |
| 32 charts, 1 series, 100,000 pts, +10,000/frame | 23.01M | 161.14M | SciChart | 5.8 | 25.5 |
| 64 charts, 1 series, 100,000 pts, +10,000/frame | SKIPPED | 98.83M | SciChart | SKIPPED | 10.8 |
| 128 charts, 1 series, 100,000 pts, +10,000/frame | — | 48.06M | SciChart | — | 3.3 |

### Series Compression Test

| Parameters | ChartGPU ingest | SciChart ingest | Winner | ChartGPU FPS | SciChart FPS |
|---|---:|---:|:---:|---:|---:|
| 1 series, 1,000 pts, +100/frame | 12.3k | 12.3k | tie | 119.3 | 119.3 |
| 1 series, 10,000 pts, +1,000/frame | 122.6k | 122.4k | tie | 119.2 | 119.1 |
| 1 series, 100,000 pts, +10,000/frame | 996.5k | 1.22M | SciChart | 96.3 | 118.8 |
| 1 series, 1,000,000 pts, +100,000/frame | 3.32M | 10.50M | SciChart | 29.9 | 101.6 |
| 1 series, 10,000,000 pts, +1,000,000/frame | 8.80M | 34.93M | SciChart | 5.5 | 31.6 |

### Point series, sorted, updating y-values

| Parameters | ChartGPU ingest | SciChart ingest | Winner | ChartGPU FPS | SciChart FPS |
|---|---:|---:|:---:|---:|---:|
| 1 series, 1,000 pts | 119.4k | 118.5k | tie | 119.4 | 118.5 |
| 1 series, 10,000 pts | 1.19M | 1.19M | tie | 119.4 | 119.1 |
| 1 series, 50,000 pts | 5.97M | 5.95M | tie | 119.4 | 119.0 |
| 1 series, 100,000 pts | 11.12M | 11.90M | SciChart | 111.2 | 119.0 |
| 1 series, 200,000 pts | 11.97M | 23.85M | SciChart | 59.8 | 119.3 |
| 1 series, 500,000 pts | 11.66M | 32.17M | SciChart | 23.3 | 64.3 |
| 1 series, 1,000,000 pts | 11.56M | 33.29M | SciChart | 11.6 | 33.3 |
| 1 series, 5,000,000 pts | 11.22M | 34.51M | SciChart | 2.2 | 6.9 |
| 1 series, 10,000,000 pts | 10.61M | 26.36M | SciChart | 1.1 | 2.6 |

### N line series M points

| Parameters | ChartGPU ingest | SciChart ingest | Winner | ChartGPU FPS | SciChart FPS |
|---|---:|---:|:---:|---:|---:|
| 100 series, 100 pts | 65.0k | 42.1k | ChartGPU | 115.3 | 114.9 |
| 200 series, 200 pts | 644.1k | 883.0k | SciChart | 119.5 | 118.9 |
| 500 series, 500 pts | 2.33M | 4.06M | SciChart | 82.0 | 118.7 |
| 1000 series, 1,000 pts | 2.21M | 12.00M | SciChart | 31.0 | 99.2 |
| 2000 series, 2,000 pts | 5.37M | 24.42M | SciChart | 9.2 | 43.0 |
| 4000 series, 4,000 pts | 7.13M | 41.14M | SciChart | 2.1 | 8.3 |
| 8000 series, 8,000 pts | SKIPPED | 40.03M | SciChart | SKIPPED | 2.4 |

### Scoreboard (by ingestion rate per config)

- ChartGPU wins: **13**
- SciChart wins: **53**
- Ties (±3%): **13**
- Incomplete / error: **1**

---

## Notes

- ChartGPU FIFO configs at 5M / 10M points did not complete in the Local run.
- ChartGPU Multi Chart skips at 64+ charts (GPU memory guard in harness).
- Unsorted line at 10M: ChartGPU SKIPPED, SciChart HANGING.
- Source data: Local IndexedDB export captured during the browser-harness baseline runs.
