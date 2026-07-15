/// <reference types="@webgpu/types" />

/**
 * Unit tests for DataStore — content hash (WG-P0-2 plumbing) and staging reuse (WG-P1-9).
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

beforeAll(() => {
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

import { createDataStore } from "../createDataStore";

function createMockDevice() {
  const buffers: Array<{ size: number; destroy: ReturnType<typeof vi.fn> }> =
    [];
  const device = {
    limits: {
      maxBufferSize: 268435456,
      maxStorageBufferBindingSize: 134217728,
    },
    queue: {
      writeBuffer: vi.fn(),
      submit: vi.fn(),
    },
    createBuffer: vi.fn((desc?: GPUBufferDescriptor) => {
      const b = {
        size: desc?.size ?? 0,
        label: desc?.label ?? "",
        destroy: vi.fn(),
      };
      buffers.push(b);
      return b as unknown as GPUBuffer;
    }),
  } as unknown as GPUDevice & { __buffers: typeof buffers };
  (device as any).__buffers = buffers;
  return device;
}

describe("createDataStore", () => {
  let device: ReturnType<typeof createMockDevice>;

  beforeEach(() => {
    device = createMockDevice();
  });

  describe("getSeriesContentHash (WG-P0-2)", () => {
    it("changes when the same-N payload is rewritten into the same buffer", () => {
      const store = createDataStore(device);
      const dataA: Array<[number, number]> = [
        [0, 1],
        [1, 2],
        [2, 3],
      ];
      store.setSeries(0, dataA, { xOffset: 0 });
      const hashA = store.getSeriesContentHash(0);
      const bufferA = store.getSeriesBuffer(0);

      // Equal length, different y values — capacity fits so buffer identity is retained.
      const dataB: Array<[number, number]> = [
        [0, 1],
        [1, 99],
        [2, 3],
      ];
      store.setSeries(0, dataB, { xOffset: 0 });
      const hashB = store.getSeriesContentHash(0);
      const bufferB = store.getSeriesBuffer(0);

      expect(bufferB).toBe(bufferA);
      expect(store.getSeriesPointCount(0)).toBe(3);
      expect(hashB).not.toBe(hashA);
    });

    it("stays stable when setSeries is called with identical content", () => {
      const store = createDataStore(device);
      const data: Array<[number, number]> = [
        [10, 1],
        [20, 2],
      ];
      store.setSeries(0, data);
      const hash1 = store.getSeriesContentHash(0);
      store.setSeries(0, [
        [10, 1],
        [20, 2],
      ]);
      expect(store.getSeriesContentHash(0)).toBe(hash1);
    });
  });

  describe("staging buffer reuse (WG-P1-9)", () => {
    it("reuses the same staging Float32Array when capacity does not grow", () => {
      const store = createDataStore(device);
      store.setSeries(0, [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
      ]);
      const staging1 = store.getSeriesStagingBuffer(0);

      store.setSeries(0, [
        [0, 10],
        [1, 20],
        [2, 30],
        [3, 40],
      ]);
      const staging2 = store.getSeriesStagingBuffer(0);

      expect(staging2).toBe(staging1);
      // Packed contents must reflect the latest write (interleaved x,y).
      expect(staging2[0]).toBe(0);
      expect(staging2[1]).toBe(10);
      expect(staging2[6]).toBe(3);
      expect(staging2[7]).toBe(40);
    });

    it("allocates a larger staging buffer only when capacity grows", () => {
      const store = createDataStore(device);
      store.setSeries(0, [
        [0, 1],
        [1, 2],
      ]);
      const stagingSmall = store.getSeriesStagingBuffer(0);
      const smallLen = stagingSmall.length;

      // Grow past current capacity (pow2 growth).
      const many: Array<[number, number]> = [];
      for (let i = 0; i < 10_000; i++) many.push([i, i * 0.5]);
      store.setSeries(0, many);
      const stagingLarge = store.getSeriesStagingBuffer(0);

      expect(stagingLarge).not.toBe(stagingSmall);
      expect(stagingLarge.length).toBeGreaterThan(smallLen);
    });
  });
});
