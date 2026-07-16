/**
 * Area geometry identity cache: skip vertex writeBuffer when data ref is stable;
 * rebuild on new ref or after invalidateGeometry (animation interpolation).
 */

/// <reference types="@webgpu/types" />

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createLinearScale } from '../../utils/scales';
import type { ResolvedAreaSeriesConfig } from '../../config/OptionResolver';
import type { DataPoint } from '../../config/types';

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

import { createAreaRenderer } from '../createAreaRenderer';
import { writeUniformBuffer } from '../rendererUtils';

vi.mock('../rendererUtils', () => ({
  createRenderPipeline: vi.fn(() => ({})),
  createUniformBuffer: vi.fn(() => ({ destroy: vi.fn() })),
  writeUniformBuffer: vi.fn(),
}));

const writeUniformBufferMock = writeUniformBuffer as ReturnType<typeof vi.fn>;

function createMockDevice() {
  return {
    label: 'mockDevice',
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
  extra: Partial<ResolvedAreaSeriesConfig> = {}
): ResolvedAreaSeriesConfig {
  return {
    type: 'area',
    name: 'a',
    data,
    rawData: data,
    color: '#0af',
    areaStyle: { opacity: 0.3, color: '#0af' },
    sampling: 'none',
    samplingThreshold: 5000,
    connectNulls: false,
    yAxis: 'y',
    visible: true,
    ...extra,
  } as ResolvedAreaSeriesConfig;
}

describe('createAreaRenderer geometry cache', () => {
  it('skips vertex writeBuffer on second prepare with same data ref (axes-only)', () => {
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

  it('re-uploads vertices when data reference changes', () => {
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

  it('re-uploads after invalidateGeometry even with same data ref', () => {
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

  it('packs N*8 bytes (not N*16 strip expansion) into private storage (1.4)', () => {
    const device = createMockDevice();
    const writeBuffer = device.queue.writeBuffer as ReturnType<typeof vi.fn>;
    const renderer = createAreaRenderer(device);
    const n = 10;
    const data: DataPoint[] = Array.from({ length: n }, (_, i) => [i, i]);
    const xScale = createLinearScale().domain(0, n).range(0, 100);
    const yScale = createLinearScale().domain(0, n).range(100, 0);

    renderer.prepare(areaConfig(data), data, xScale, yScale, 0);
    const sizes = writeBuffer.mock.calls.map((c) => c[4]).filter((s): s is number => typeof s === 'number');
    expect(sizes).toContain(n * 8);
    expect(sizes).not.toContain(n * 16);
    renderer.dispose();
  });

  it('skips private writeBuffer when binding external storage buffer', () => {
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
    const external = { size: 1024, destroy: vi.fn() } as unknown as GPUBuffer;

    renderer.prepare(areaConfig(data), data, xScale, yScale, 0, external, 3, 0);
    expect(writeBuffer).not.toHaveBeenCalled();
    renderer.dispose();
  });

  it('throws when storageBuffer is set without pointCountOverride', () => {
    const device = createMockDevice();
    const renderer = createAreaRenderer(device);
    const data: DataPoint[] = [
      [0, 1],
      [1, 2],
    ];
    const xScale = createLinearScale().domain(0, 2).range(0, 100);
    const yScale = createLinearScale().domain(0, 3).range(100, 0);
    const external = { size: 1024, destroy: vi.fn() } as unknown as GPUBuffer;
    expect(() => renderer.prepare(areaConfig(data), data, xScale, yScale, 0, external)).toThrow(/pointCountOverride/);
    renderer.dispose();
  });

  it('skips uniform writes on second prepare with identical inputs (issue 2.5)', () => {
    const device = createMockDevice();
    writeUniformBufferMock.mockClear();
    const renderer = createAreaRenderer(device);
    const data: DataPoint[] = [
      [0, 1],
      [1, 2],
      [2, 0],
    ];
    const xScale = createLinearScale().domain(0, 2).range(0, 100);
    const yScale = createLinearScale().domain(0, 2).range(100, 0);
    const cfg = areaConfig(data);

    renderer.prepare(cfg, data, xScale, yScale, 0);
    const afterFirst = writeUniformBufferMock.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);

    writeUniformBufferMock.mockClear();
    renderer.prepare(cfg, data, xScale, yScale, 0);
    expect(writeUniformBufferMock).not.toHaveBeenCalled();

    // Scale change → VS uniform write.
    writeUniformBufferMock.mockClear();
    const y2 = createLinearScale().domain(-1, 3).range(100, 0);
    renderer.prepare(cfg, data, xScale, y2, 0);
    expect(writeUniformBufferMock.mock.calls.length).toBeGreaterThan(0);
    renderer.dispose();
  });
});
