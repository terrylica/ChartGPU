import { describe, it, expect } from 'vitest';
import {
  resolveLineDrawPolicy,
  DENSE_HAIRLINE_POINT_THRESHOLD,
  DENSE_LINE_POINT_THRESHOLD,
  DENSE_LINE_MIN_WIDTH_CSS,
} from '../lineDrawPolicy';

describe('resolveLineDrawPolicy', () => {
  it('keeps standard width below threshold (group 3 1k / 10k protection)', () => {
    const r = resolveLineDrawPolicy({ pointCount: 10_000, lineWidthCssPx: 2 });
    expect(r.policy).toBe('standard');
    expect(r.effectiveLineWidthCssPx).toBe(2);
  });

  it('stays standard just under hairline threshold', () => {
    const r = resolveLineDrawPolicy({
      pointCount: DENSE_HAIRLINE_POINT_THRESHOLD - 1,
      lineWidthCssPx: 2,
    });
    expect(r.policy).toBe('standard');
    expect(r.effectiveLineWidthCssPx).toBe(2);
  });

  it('enters denseHairline at threshold (group 3 @ 50k cliff)', () => {
    const r = resolveLineDrawPolicy({
      pointCount: DENSE_HAIRLINE_POINT_THRESHOLD,
      lineWidthCssPx: 2,
    });
    expect(r.policy).toBe('denseHairline');
    expect(r.effectiveLineWidthCssPx).toBe(DENSE_LINE_MIN_WIDTH_CSS);
  });

  it('enters denseHairline for group 3 @ 50k', () => {
    const r = resolveLineDrawPolicy({ pointCount: 50_000, lineWidthCssPx: 2 });
    expect(r.policy).toBe('denseHairline');
    expect(r.effectiveLineWidthCssPx).toBe(1);
  });

  it('enters denseHairline at 1M', () => {
    const r = resolveLineDrawPolicy({ pointCount: 1_000_000, lineWidthCssPx: 2 });
    expect(r.policy).toBe('denseHairline');
    expect(r.effectiveLineWidthCssPx).toBe(DENSE_LINE_MIN_WIDTH_CSS);
  });

  it('false-positive miss: 10k stays standard (not hairline)', () => {
    const r = resolveLineDrawPolicy({
      pointCount: 10_000,
      lineWidthCssPx: 2,
    });
    expect(r.policy).not.toBe('denseHairline');
    expect(r.policy).toBe('standard');
  });

  it('defaults invalid width to 2 then may hairline', () => {
    const r = resolveLineDrawPolicy({ pointCount: 10, lineWidthCssPx: Number.NaN });
    expect(r.effectiveLineWidthCssPx).toBe(2);
    expect(r.policy).toBe('standard');
  });

  it('does not thicken hairline width 0.5 at high N', () => {
    const r = resolveLineDrawPolicy({ pointCount: 1_000_000, lineWidthCssPx: 0.5 });
    expect(r.policy).toBe('denseHairline');
    expect(r.effectiveLineWidthCssPx).toBe(0.5);
    expect(r.effectiveLineWidthCssPx).toBeLessThan(DENSE_LINE_MIN_WIDTH_CSS);
  });

  it('DENSE_LINE_POINT_THRESHOLD aliases hairline threshold', () => {
    expect(DENSE_LINE_POINT_THRESHOLD).toBe(DENSE_HAIRLINE_POINT_THRESHOLD);
  });

  it('never returns denseThin (removed dead policy)', () => {
    for (const n of [1, 10_000, 24_999, 25_000, 50_000, 1_000_000]) {
      const r = resolveLineDrawPolicy({ pointCount: n, lineWidthCssPx: 2 });
      expect(r.policy === 'standard' || r.policy === 'denseHairline').toBe(true);
      expect((r.policy as string) === 'denseThin').toBe(false);
    }
  });
});
