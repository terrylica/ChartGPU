/**
 * P2-5: Line prepare must not O(n)-scan series data for bounds.
 * Affine is derived from scale.scale(0)/scale.scale(1) only.
 */

/// <reference types="@webgpu/types" />

import {
  describe,
  it,
  expect,
  beforeAll,
  vi,
  type Mock,
} from "vitest";
import { createLinearScale } from "../../utils/scales";
import type { ResolvedLineSeriesConfig } from "../../config/OptionResolver";
import type { DataPoint } from "../../config/types";
import * as cartesianData from "../../data/cartesianData";

beforeAll(() => {
  // @ts-ignore
  globalThis.GPUShaderStage = { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
  // @ts-ignore
  globalThis.GPUBufferUsage = {
    MAP_READ: 0x0001,
    MAP_WRITE: 0x0002,
    COPY_SRC: 0x0004,
    COPY_DST: 0x0008,
    INDEX: 0x0010,
    VERTEX: 0x0020,
    UNIFORM: 0x0040,
    STORAGE: 0x0080,
    INDIRECT: 0x0100,
    QUERY_RESOLVE: 0x0200,
  };
});

import { createLineRenderer } from "../createLineRenderer";

function createMockDevice() {
  return {
    label: "mockDevice",
    limits: {
      maxUniformBufferBindingSize: 65536,
      minUniformBufferOffsetAlignment: 256,
    },
    queue: {
      writeBuffer: vi.fn(),
      submit: vi.fn(),
    },
    createBuffer: vi.fn(() => ({
      destroy: vi.fn(),
      size: 256,
    })),
    createBindGroupLayout: vi.fn(() => ({})),
    createBindGroup: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createShaderModule: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({})),
  } as unknown as GPUDevice;
}

vi.mock("../rendererUtils", () => ({
  createRenderPipeline: vi.fn(() => ({})),
  createUniformBuffer: vi.fn(() => ({ destroy: vi.fn() })),
  writeUniformBuffer: vi.fn(),
}));

describe("createLineRenderer bounds (P2-5)", () => {
  it("does not call computeRawBoundsFromCartesianData during prepare", () => {
    const boundsSpy = vi.spyOn(
      cartesianData,
      "computeRawBoundsFromCartesianData",
    );
    const device = createMockDevice();
    const renderer = createLineRenderer(device);
    const data: DataPoint[] = Array.from({ length: 50_000 }, (_, i) => [
      i,
      Math.sin(i * 0.01),
    ]);
    const series = {
      type: "line",
      data,
      rawData: data,
      color: "#0af",
      lineStyle: { width: 2, opacity: 1, color: "#0af" },
      sampling: "none",
      samplingThreshold: 5000,
      connectNulls: false,
      yAxis: "y",
      visible: true,
    } as ResolvedLineSeriesConfig;

    const xScale = createLinearScale().domain(0, 50_000).range(-1, 1);
    const yScale = createLinearScale().domain(-1, 1).range(1, -1);
    const dataBuffer = { label: "data" } as GPUBuffer;

    renderer.prepare(series, dataBuffer, xScale, yScale, 0, 2, 1280, 720);

    expect(boundsSpy).not.toHaveBeenCalled();
    boundsSpy.mockRestore();
    renderer.dispose();
  });

  it("samples scale affine only at 0 and 1 (not per-point)", () => {
    const device = createMockDevice();
    const renderer = createLineRenderer(device);
    const data: DataPoint[] = Array.from({ length: 10_000 }, (_, i) => [
      i,
      i,
    ]);
    const series = {
      type: "line",
      data,
      rawData: data,
      color: "#0af",
      lineStyle: { width: 2, opacity: 1, color: "#0af" },
      sampling: "none",
      samplingThreshold: 5000,
      connectNulls: false,
      yAxis: "y",
      visible: true,
    } as ResolvedLineSeriesConfig;

    const xScale = createLinearScale().domain(0, 10_000).range(-1, 1);
    const yScale = createLinearScale().domain(0, 10_000).range(1, -1);
    const xScaleSpy = vi.spyOn(xScale, "scale");
    const yScaleSpy = vi.spyOn(yScale, "scale");
    const dataBuffer = { label: "data" } as GPUBuffer;

    renderer.prepare(series, dataBuffer, xScale, yScale, 0, 2, 1280, 720);

    // Affine from (0,1) only — four scale() calls total across both axes.
    expect(xScaleSpy.mock.calls.map((c) => c[0])).toEqual([0, 1]);
    expect(yScaleSpy.mock.calls.map((c) => c[0])).toEqual([0, 1]);
    // Must not scale each data point (would be O(n)).
    expect(xScaleSpy).toHaveBeenCalledTimes(2);
    expect(yScaleSpy).toHaveBeenCalledTimes(2);

    xScaleSpy.mockRestore();
    yScaleSpy.mockRestore();
    renderer.dispose();
  });

  it("structurally does not import bounds scan into prepare path", async () => {
    // Source-level regression: prepare path must stay on affine (0,1).
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../createLineRenderer.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/computeRawBoundsFromCartesianData/);
    expect(src).toMatch(/computeClipAffineFromScale\(xScale, 0, 1\)/);
    expect(src).toMatch(/computeClipAffineFromScale\(yScale, 0, 1\)/);
  });
});
