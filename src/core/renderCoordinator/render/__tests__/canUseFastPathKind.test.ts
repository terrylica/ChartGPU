/**
 * Ranged-append / fullRawLine tagging — behavior via pure canRangedAppendLine
 * and prepareSeries kind tagging unit coverage (not source greps).
 */

import { describe, it, expect } from 'vitest';
import { canRangedAppendLine } from '../../data/canRangedAppendLine';

describe('canUseFastPath kind tagging (issue 1.6)', () => {
  const raw = { x: [0, 1], y: [0, 1] };

  it('unlocks sampling none on cold unknown kind (not only GPU-eligible)', () => {
    expect(
      canRangedAppendLine({
        seriesType: 'line',
        sampling: 'none',
        kind: 'unknown',
        rawData: raw,
        series: { type: 'line', sampling: 'none' },
      })
    ).toBe(true);
  });

  it('does not require full-span zoom for sampling none ranged append', () => {
    // fullRawLine is append-safe regardless of zoom state (zoom not an input).
    expect(
      canRangedAppendLine({
        seriesType: 'line',
        sampling: 'none',
        kind: 'fullRawLine',
        rawData: raw,
        series: { type: 'line', sampling: 'none' },
      })
    ).toBe(true);
  });

  it('tags path remains pure: fullRawLine kind is enough for none sampling', () => {
    expect(
      canRangedAppendLine({
        seriesType: 'line',
        sampling: 'none',
        kind: 'fullRawLine',
        rawData: raw,
      })
    ).toBe(true);
  });
});
