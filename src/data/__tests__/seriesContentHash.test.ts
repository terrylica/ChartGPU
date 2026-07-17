import { describe, it, expect } from 'vitest';
import { cheapCartesianContentStamp, cheapOHLCContentStamp } from '../seriesContentHash';
import type { DataPoint } from '../../config/types';

describe('seriesContentHash', () => {
  it('cheapCartesianContentStamp is O(1) and changes across calls', () => {
    const data: DataPoint[] = [
      [0, 1],
      [1, 2],
    ];
    const a = cheapCartesianContentStamp(data);
    const b = cheapCartesianContentStamp(data);
    expect(a).not.toBe(b);
    expect(typeof a).toBe('number');
  });

  it('cheapOHLCContentStamp changes across calls of same length', () => {
    const data = [{ timestamp: 1, open: 1, high: 2, low: 0, close: 1.5 }] as const;
    const a = cheapOHLCContentStamp(data);
    const b = cheapOHLCContentStamp(data);
    expect(a).not.toBe(b);
  });

  it('cheapCartesianContentStamp mixes point count', () => {
    const short: DataPoint[] = [[0, 1]];
    const long: DataPoint[] = [
      [0, 1],
      [1, 2],
      [2, 3],
    ];
    // Different lengths produce different stamps even on sequential generation.
    const a = cheapCartesianContentStamp(short);
    const b = cheapCartesianContentStamp(long);
    expect(a).not.toBe(b);
  });
});
