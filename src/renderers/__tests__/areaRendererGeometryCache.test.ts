/**
 * Area geometry identity cache: skip vertex writeBuffer when data ref is stable;
 * rebuild on new ref or after invalidateGeometry (animation interpolation).
 */

/// <reference types="@webgpu/types" />

import { describe, it, expect, beforeAll, vi } from "vitest";
import { createLinearScale } from "../../utils/scales";
import type { ResolvedAreaSeriesConfig } from "../../config/OptionResolver";
import type { DataPoint } from "../../config/types";

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

import { createAreaRenderer } from "../createAreaRenderer";

vi.mock("../rendererUtils", () => ({
  createRenderPipeline: vi.fn(() => ({})),
  createUniformBuffer: vi.fn(() => ({ destroy: vi.fn() })),
  writeUniformBuffer: vi.fn(),
}));

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
      size: 256 * 1024,
    })),
    createBindGroupLayout: vi.fn(() => ({})),
    createBindGroup: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createShaderModule: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({})),
  } as unknown as GPUDevice;
}

function areaConfig(
  data: ReadonlyArray<DataPoint>,
  extra: Partial<ResolvedAreaSeriesConfig> = {},
): ResolvedAreaSeriesConfig {
  return {
    type: "area",
    name: "a",
    data,
    rawData: data,
    color: "#0af",
    areaStyle: { opacity: 0.3, color: "#0af" },
    sampling: "none",
    samplingThreshold: 5000,
    connectNulls: false,
    yAxis: "y",
    visible: true,
    ...extra,
  } as ResolvedAreaSeriesConfig;
}

describe("createAreaRenderer geometry cache", () => {
  it("skips vertex writeBuffer on second prepare with same data ref (axes-only)", () => {
    const device = createMockDevice();
    const writeBuffer = device.queue.writeBuffer as ReturnType<typeof vi.fn>;
    const renderer = createAreaRenderer(device);
    const data: DataPoint[] = [
      [0, 1],
      [1, 2],
      [2, 0],
    ];
    const xScale = createLinearScale().domain(0, 2).range(0, 100);
    const yScaleA = createLinearScale().domain(0, 2).range(100, 0);
    const yScaleB = createLinearScale().domain(-1, 3).range(100, 0);
    const cfg = areaConfig(data);

    renderer.prepare(cfg, data, xScale, yScaleA, 0);
    // Uniforms go through mocked writeUniformBuffer; queue.writeBuffer is vertex-only.
    expect(writeBuffer).toHaveBeenCalledTimes(1);

    // Axes-only: new y scale, same data identity — no second vertex upload.
    renderer.prepare(cfg, data, xScale, yScaleB, 0);
    expect(writeBuffer).toHaveBeenCalledTimes(1);

    renderer.dispose();
  });

  it("re-uploads vertices when data reference changes", () => {
    const device = createMockDevice();
    const writeBuffer = device.queue.writeBuffer as ReturnType<typeof vi.fn>;
    const renderer = createAreaRenderer(device);
    const data1: DataPoint[] = [
      [0, 1],
      [1, 2],
      [2, 0],
    ];
    const data2: DataPoint[] = [
      [0, 9],
      [1, 8],
      [2, 7],
    ];
    const xScale = createLinearScale().domain(0, 2).range(0, 100);
    const yScale = createLinearScale().domain(0, 10).range(100, 0);

    renderer.prepare(areaConfig(data1), data1, xScale, yScale, 0);
    renderer.prepare(areaConfig(data2), data2, xScale, yScale, 0);
    expect(writeBuffer).toHaveBeenCalledTimes(2);
    renderer.dispose();
  });

  it("re-uploads after invalidateGeometry even with same data ref", () => {
    const device = createMockDevice();
    const writeBuffer = device.queue.writeBuffer as ReturnType<typeof vi.fn>;
    const renderer = createAreaRenderer(device);
    const data: DataPoint[] = [
      [0, 1],
      [1, 2],
      [2, 3],
    ];
    const xScale = createLinearScale().domain(0, 2).range(0, 100);
    const yScale = createLinearScale().domain(0, 3).range(100, 0);
    const cfg = areaConfig(data);

    renderer.prepare(cfg, data, xScale, yScale, 0);
    // Mutate under stable ref (interpolation contract).
    (data[1] as [number, number])[1] = 99;
    renderer.invalidateGeometry();
    renderer.prepare(cfg, data, xScale, yScale, 0);
    expect(writeBuffer).toHaveBeenCalledTimes(2);
    renderer.dispose();
  });
});
