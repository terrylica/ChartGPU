/**
 * Axis label layout helpers used by renderAxisLabels.
 * @module axisLabelHelpers
 */


const LABEL_PADDING_CSS_PX = 4;

export function getYAxisLabelX(plotLeftCss: number, tickLengthCssPx: number): number {
  return plotLeftCss - tickLengthCssPx - LABEL_PADDING_CSS_PX;
}

export function getRightYAxisLabelX(plotRightCss: number, tickLengthCssPx: number): number {
  return plotRightCss + tickLengthCssPx + LABEL_PADDING_CSS_PX;
}

export function getYAxisTitleX(yLabelX: number, maxTickLabelWidth: number, titleFontSize: number): number {
  const yTickLabelLeft = yLabelX - maxTickLabelWidth;
  return yTickLabelLeft - LABEL_PADDING_CSS_PX - titleFontSize * 0.5;
}

export function getRightYAxisTitleX(yLabelX: number, maxTickLabelWidth: number, titleFontSize: number): number {
  const yTickLabelRight = yLabelX + maxTickLabelWidth;
  return yTickLabelRight + LABEL_PADDING_CSS_PX + titleFontSize * 0.5;
}
