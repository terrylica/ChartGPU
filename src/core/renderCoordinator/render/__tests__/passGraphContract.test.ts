/**
 * Frame graph contracts — behavior via frameRender.planGpuFrame and exported APIs.
 */

import { describe, it, expect } from 'vitest';
import {
  MAIN_SCENE_MSAA_SAMPLE_COUNT,
  ANNOTATION_OVERLAY_MSAA_SAMPLE_COUNT,
} from '../../gpu/textureManager';
import {
  planGpuFrame,
  framePlanIncludesDenseHairline,
  framePlanIncludesAnnotationOverlay,
  hasDenseHairlineLines,
  renderDenseHairlineLines,
  prepareSeries,
  encodeFrameComputePasses,
  encodeMainSeriesPass,
} from '../frameRender';

describe('frame graph contracts (WG-P1-5 / WG-P2-1)', () => {
  it('uses legal MSAA sample counts (1|4 only; overlay annotation constant is 4)', () => {
    expect(ANNOTATION_OVERLAY_MSAA_SAMPLE_COUNT).toBe(4);
    expect(MAIN_SCENE_MSAA_SAMPLE_COUNT).toBe(4);
  });

  it('planGpuFrame owns pass order and texture flags used by the coordinator', () => {
    const hair = planGpuFrame({ msaaSampleCount: 4, hasDenseHairline: true });
    expect(hair.passOrder).toEqual(['main', 'denseHairline', 'annotationOverlay']);
    expect(framePlanIncludesDenseHairline(hair)).toBe(true);
    expect(framePlanIncludesAnnotationOverlay(hair)).toBe(true);
    expect(hair.useDirectSwapchainResolve).toBe(false);
    expect(hair.needResolveAndOverlay).toBe(true);

    const direct = planGpuFrame({ msaaSampleCount: 4, hasDenseHairline: false });
    expect(direct.passOrder).toEqual(['main', 'annotationOverlay']);
    expect(direct.useDirectSwapchainResolve).toBe(true);
    expect(framePlanIncludesAnnotationOverlay(direct)).toBe(false);
  });

  it('exports series prepare/draw and encode helpers (frame ownership)', () => {
    expect(typeof prepareSeries).toBe('function');
    expect(typeof hasDenseHairlineLines).toBe('function');
    expect(typeof renderDenseHairlineLines).toBe('function');
    expect(typeof encodeFrameComputePasses).toBe('function');
    expect(typeof encodeMainSeriesPass).toBe('function');
  });
});
