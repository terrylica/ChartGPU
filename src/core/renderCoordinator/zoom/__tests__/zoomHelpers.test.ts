import { describe, it, expect } from 'vitest';
import { isFullSpanZoom } from '../zoomHelpers';

describe('isFullSpanZoom', () => {
  it('treats null as full span', () => {
    expect(isFullSpanZoom(null)).toBe(true);
    expect(isFullSpanZoom(undefined)).toBe(true);
  });
  it('accepts 0–100 and edge tolerance', () => {
    expect(isFullSpanZoom({ start: 0, end: 100 })).toBe(true);
    expect(isFullSpanZoom({ start: -0.1, end: 100.1 })).toBe(true);
  });
  it('rejects partial zoom', () => {
    expect(isFullSpanZoom({ start: 25, end: 75 })).toBe(false);
  });
});
