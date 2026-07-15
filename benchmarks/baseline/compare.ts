/**
 * Compare two ChartGPU performance baseline JSON reports.
 *
 * Usage:
 *   bun run benchmarks/baseline/compare.ts baselines/main.json path/to/new.json
 *   tsx benchmarks/baseline/compare.ts baselines/main.json path/to/new.json
 *
 * Exit codes:
 *   0 — no regression beyond thresholds (or informational-only)
 *   1 — usage / parse error
 *   2 — regression detected (when --fail-on-regression is set)
 */

import * as fs from "node:fs";
import * as path from "node:path";

interface PercentileStats {
  readonly mean: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly min: number;
  readonly max: number;
}

interface ScenarioResult {
  readonly id: string;
  readonly fps: PercentileStats;
  readonly cpuMs: PercentileStats;
  readonly libraryFps: number | null;
  readonly pointCount: number;
  readonly sampling: string;
}

interface BaselineReport {
  readonly schemaVersion: number;
  readonly kind: string;
  readonly generatedAt: string;
  readonly commit: string | null;
  readonly environment?: {
    readonly userAgent?: string;
    readonly webgpuAdapter?: string | null;
    readonly devicePixelRatio?: number;
  };
  readonly config?: {
    readonly warmupFrames?: number;
    readonly measureFrames?: number;
  };
  readonly scenarios: readonly ScenarioResult[];
}

function readReport(filePath: string): BaselineReport {
  const abs = path.resolve(filePath);
  const raw = fs.readFileSync(abs, "utf8");
  const json = JSON.parse(raw) as BaselineReport;
  if (json.kind !== "chartgpu-performance-baseline") {
    throw new Error(`${filePath}: unexpected kind ${String(json.kind)}`);
  }
  if (!Array.isArray(json.scenarios)) {
    throw new Error(`${filePath}: missing scenarios[]`);
  }
  return json;
}

function pctDelta(base: number, next: number): number | null {
  if (!Number.isFinite(base) || base === 0) return null;
  return ((next - base) / base) * 100;
}

function fmt(n: number, d = 2): string {
  return Number.isFinite(n) ? n.toFixed(d) : "n/a";
}

function fmtDelta(d: number | null, invertGood: boolean): string {
  if (d == null || !Number.isFinite(d)) return "n/a";
  const sign = d > 0 ? "+" : "";
  const good = invertGood ? d < 0 : d > 0;
  const tag = Math.abs(d) < 0.05 ? "" : good ? " ✓" : " ✗";
  return `${sign}${d.toFixed(1)}%${tag}`;
}

function main(): void {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const failOnRegression = args.includes("--fail-on-regression");
  const files = args.filter((a) => !a.startsWith("--"));

  if (files.length < 2) {
    console.error(
      "Usage: bun run benchmarks/baseline/compare.ts <baseline.json> <candidate.json> [--fail-on-regression]",
    );
    process.exit(1);
  }

  const baselinePath = files[0]!;
  const candidatePath = files[1]!;
  const base = readReport(baselinePath);
  const cand = readReport(candidatePath);

  // Regress if FPS p50 drops by more than this, or cpuMs p50 rises by more than this.
  const FPS_REGRESSION_PCT = -5; // candidate worse if delta < -5%
  const CPU_REGRESSION_PCT = 8; // candidate worse if delta > +8%

  console.log("ChartGPU baseline compare");
  console.log(`  baseline:  ${baselinePath} (${base.generatedAt}, commit=${base.commit ?? "?"})`);
  console.log(`  candidate: ${candidatePath} (${cand.generatedAt}, commit=${cand.commit ?? "?"})`);
  console.log(
    `  adapters:  ${base.environment?.webgpuAdapter ?? "?"}  →  ${cand.environment?.webgpuAdapter ?? "?"}`,
  );
  console.log("");

  const baseById = new Map(base.scenarios.map((s) => [s.id, s]));
  const candById = new Map(cand.scenarios.map((s) => [s.id, s]));
  const idSet = new Set<string>();
  for (const k of Array.from(baseById.keys())) idSet.add(k);
  for (const k of Array.from(candById.keys())) idSet.add(k);
  const ids = Array.from(idSet).sort();

  let regressions = 0;

  console.log(
    "scenario".padEnd(24) +
      "fps p50".padStart(10) +
      "Δfps".padStart(12) +
      "cpu p50".padStart(10) +
      "Δcpu".padStart(12) +
      "cpu p95".padStart(10) +
      "Δcpu95".padStart(12),
  );
  console.log("-".repeat(90));

  for (const id of ids) {
    const b = baseById.get(id);
    const c = candById.get(id);
    if (!b || !c) {
      console.log(`${id.padEnd(24)} (missing in ${!b ? "baseline" : "candidate"})`);
      regressions += 1;
      continue;
    }

    const dFps = pctDelta(b.fps.p50, c.fps.p50);
    const dCpu = pctDelta(b.cpuMs.p50, c.cpuMs.p50);
    const dCpu95 = pctDelta(b.cpuMs.p95, c.cpuMs.p95);

    const fpsReg = dFps != null && dFps < FPS_REGRESSION_PCT;
    const cpuReg = dCpu != null && dCpu > CPU_REGRESSION_PCT;
    if (fpsReg || cpuReg) regressions += 1;

    console.log(
      id.padEnd(24) +
        `${fmt(c.fps.p50, 1)}`.padStart(10) +
        fmtDelta(dFps, false).padStart(12) +
        `${fmt(c.cpuMs.p50)}`.padStart(10) +
        fmtDelta(dCpu, true).padStart(12) +
        `${fmt(c.cpuMs.p95)}`.padStart(10) +
        fmtDelta(dCpu95, true).padStart(12),
    );
  }

  console.log("-".repeat(90));
  console.log(
    `Thresholds: FPS p50 regression < ${FPS_REGRESSION_PCT}% · CPU p50 regression > +${CPU_REGRESSION_PCT}%`,
  );
  console.log(`Regressions: ${regressions}`);

  if (failOnRegression && regressions > 0) {
    process.exit(2);
  }
}

main();
