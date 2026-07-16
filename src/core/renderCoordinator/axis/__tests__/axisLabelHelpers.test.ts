/**
 * Tests for axis label positioning and layout helpers.
 * Verifies correct calculation of label positions, anchors, and title placements.
 */

import { describe, it, expect } from 'vitest';
import {
  LABEL_PADDING_CSS_PX,
  getXAxisTickLabelAnchor,
  getXAxisLabelY,
  getYAxisLabelX,
  getXAxisTitleY,
  getYAxisTitleX,
  getCenterPosition,
} from '../axisLabelHelpers';

describe('getXAxisTickLabelAnchor', () => {
  it('returns middle for single tick', () => {
    expect(getXAxisTickLabelAnchor(0, 1)).toBe('middle');
  });

  it('returns start for first tick of multiple', () => {
    expect(getXAxisTickLabelAnchor(0, 5)).toBe('start');
  });

  it('returns end for last tick', () => {
    expect(getXAxisTickLabelAnchor(4, 5)).toBe('end');
  });

  it('returns middle for middle ticks', () => {
    expect(getXAxisTickLabelAnchor(1, 5)).toBe('middle');
    expect(getXAxisTickLabelAnchor(2, 5)).toBe('middle');
    expect(getXAxisTickLabelAnchor(3, 5)).toBe('middle');
  });

  it('handles two ticks correctly', () => {
    expect(getXAxisTickLabelAnchor(0, 2)).toBe('start');
    expect(getXAxisTickLabelAnchor(1, 2)).toBe('end');
  });
});

describe('getXAxisLabelY', () => {
  it('calculates Y position below plot area', () => {
    const plotBottomCss = 500;
    const tickLengthCssPx = 6;
    const fontSize = 12;

    const y = getXAxisLabelY(plotBottomCss, tickLengthCssPx, fontSize);

    // Expected: 500 + 6 + LABEL_PADDING_CSS_PX + 12 * 0.5
    // = 500 + 6 + 4 + 6 = 516
    expect(y).toBe(516);
  });

  it('accounts for different tick lengths', () => {
    const plotBottomCss = 500;
    const fontSize = 12;

    const y1 = getXAxisLabelY(plotBottomCss, 6, fontSize);
    const y2 = getXAxisLabelY(plotBottomCss, 10, fontSize);

    expect(y2 - y1).toBe(4); // Difference in tick length
  });

  it('accounts for different font sizes', () => {
    const plotBottomCss = 500;
    const tickLengthCssPx = 6;

    const y1 = getXAxisLabelY(plotBottomCss, tickLengthCssPx, 12);
    const y2 = getXAxisLabelY(plotBottomCss, tickLengthCssPx, 16);

    expect(y2 - y1).toBe(2); // Half the font size difference (16-12)/2
  });
});

describe('getYAxisLabelX', () => {
  it('calculates X position to the left of plot area', () => {
    const plotLeftCss = 60;
    const tickLengthCssPx = 6;

    const x = getYAxisLabelX(plotLeftCss, tickLengthCssPx);

    // Expected: 60 - 6 - LABEL_PADDING_CSS_PX
    // = 60 - 6 - 4 = 50
    expect(x).toBe(50);
  });

  it('accounts for different tick lengths', () => {
    const plotLeftCss = 60;

    const x1 = getYAxisLabelX(plotLeftCss, 6);
    const x2 = getYAxisLabelX(plotLeftCss, 10);

    expect(x1 - x2).toBe(4); // Difference in tick length (moves left)
  });
});

describe('getXAxisTitleY', () => {
  it('centers title between labels and canvas bottom', () => {
    const xLabelY = 520;
    const fontSize = 12;
    const canvasCssHeight = 600;
    const hasSliderZoom = false;

    const y = getXAxisTitleY(xLabelY, fontSize, canvasCssHeight, hasSliderZoom);

    // xTickLabelsBottom = 520 + 12 * 0.5 = 526
    // bottomLimit = 600 (no slider)
    // center = (526 + 600) / 2 = 563
    expect(y).toBe(563);
  });

  it('accounts for slider zoom', () => {
    const xLabelY = 520;
    const fontSize = 12;
    const canvasCssHeight = 600;
    const hasSliderZoom = true;
    const sliderHeightCssPx = 32;

    const y = getXAxisTitleY(xLabelY, fontSize, canvasCssHeight, hasSliderZoom, sliderHeightCssPx);

    // xTickLabelsBottom = 520 + 12 * 0.5 = 526
    // bottomLimit = 600 - 32 = 568
    // center = (526 + 568) / 2 = 547
    expect(y).toBe(547);
  });

  it('uses default slider height when not specified', () => {
    const xLabelY = 520;
    const fontSize = 12;
    const canvasCssHeight = 600;
    const hasSliderZoom = true;

    const y = getXAxisTitleY(xLabelY, fontSize, canvasCssHeight, hasSliderZoom);

    // Should use default slider height of 32
    expect(y).toBe(547);
  });
});

describe('getYAxisTitleX', () => {
  it('positions title to the left of tick labels', () => {
    const yLabelX = 50;
    const maxTickLabelWidth = 40;
    const titleFontSize = 14;

    const x = getYAxisTitleX(yLabelX, maxTickLabelWidth, titleFontSize);

    // yTickLabelLeft = 50 - 40 = 10
    // x = 10 - LABEL_PADDING_CSS_PX - 14 * 0.5
    // = 10 - 4 - 7 = -1
    expect(x).toBe(-1);
  });

  it('accounts for wider tick labels', () => {
    const yLabelX = 50;
    const titleFontSize = 14;

    const x1 = getYAxisTitleX(yLabelX, 40, titleFontSize);
    const x2 = getYAxisTitleX(yLabelX, 60, titleFontSize);

    expect(x1 - x2).toBe(20); // Difference in label width
  });

  it('accounts for different title font sizes', () => {
    const yLabelX = 50;
    const maxTickLabelWidth = 40;

    const x1 = getYAxisTitleX(yLabelX, maxTickLabelWidth, 14);
    const x2 = getYAxisTitleX(yLabelX, maxTickLabelWidth, 18);

    expect(x1 - x2).toBe(2); // Half the font size difference (18-14)/2
  });
});

// NOTE: measureMaxLabelWidth tests are omitted because they require a DOM environment.
// The function is a simple wrapper around getBoundingClientRect and doesn't contain
// logic that benefits from unit testing outside of browser integration tests.

describe('getCenterPosition', () => {
  it('calculates midpoint of positive values', () => {
    expect(getCenterPosition(0, 100)).toBe(50);
    expect(getCenterPosition(20, 80)).toBe(50);
  });

  it('calculates midpoint of negative values', () => {
    expect(getCenterPosition(-100, -50)).toBe(-75);
    expect(getCenterPosition(-20, -10)).toBe(-15);
  });

  it('calculates midpoint across zero', () => {
    expect(getCenterPosition(-50, 50)).toBe(0);
    expect(getCenterPosition(-100, 100)).toBe(0);
  });

  it('handles fractional results', () => {
    expect(getCenterPosition(0, 5)).toBe(2.5);
    expect(getCenterPosition(10, 13)).toBe(11.5);
  });

  it('returns same value when both coordinates are equal', () => {
    expect(getCenterPosition(42, 42)).toBe(42);
  });

  it('handles reversed order (second smaller than first)', () => {
    expect(getCenterPosition(100, 0)).toBe(50);
    expect(getCenterPosition(50, -50)).toBe(0);
  });
});

describe('LABEL_PADDING_CSS_PX constant', () => {
  it('is defined and positive', () => {
    expect(LABEL_PADDING_CSS_PX).toBeDefined();
    expect(LABEL_PADDING_CSS_PX).toBeGreaterThan(0);
    expect(LABEL_PADDING_CSS_PX).toBe(4);
  });
});
