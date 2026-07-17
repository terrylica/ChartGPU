import { describe, it, expect } from 'vitest';
import { getYAxisLabelX, getRightYAxisLabelX, getYAxisTitleX, getRightYAxisTitleX } from '../axisLabelHelpers';

describe('axisLabelHelpers (production exports)', () => {
  it('computes left/right label X', () => {
    expect(getYAxisLabelX(70, 6)).toBeLessThan(70);
    expect(getRightYAxisLabelX(400, 6)).toBeGreaterThan(400);
  });
  it('computes title X from label position', () => {
    const yLabelX = getYAxisLabelX(70, 6);
    expect(getYAxisTitleX(yLabelX, 40, 12)).toBeLessThan(yLabelX);
    const r = getRightYAxisLabelX(400, 6);
    expect(getRightYAxisTitleX(r, 40, 12)).toBeGreaterThan(r);
  });
});
