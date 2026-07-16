/**
 * WG-P1-5 / WG-P2-1 structural contracts: two render passes (no topOverlayPass),
 * UI overlays created at annotation MSAA sample count.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ANNOTATION_OVERLAY_MSAA_SAMPLE_COUNT } from '../../gpu/textureManager';

const coordinatorPath = resolve(__dirname, '../../../createRenderCoordinator.ts');
const overlaysPath = resolve(__dirname, '../renderOverlays.ts');

describe('frame graph contracts (WG-P1-5 / WG-P2-1)', () => {
  const coordinatorSrc = readFileSync(coordinatorPath, 'utf8');
  const overlaysSrc = readFileSync(overlaysPath, 'utf8');

  it('does not open a third topOverlayPass on the swapchain', () => {
    expect(coordinatorSrc).not.toMatch(/topOverlayPass/);
    expect(overlaysSrc).not.toMatch(/topOverlayPass/);
  });

  it('creates axis/crosshair/highlight with annotation MSAA sample count', () => {
    expect(ANNOTATION_OVERLAY_MSAA_SAMPLE_COUNT).toBe(4);
    // Each of the three UI overlay creators must pass sampleCount: ANNOTATION_OVERLAY_MSAA_SAMPLE_COUNT
    expect(coordinatorSrc).toMatch(
      /createAxisRenderer\(device,\s*\{[^}]*sampleCount:\s*ANNOTATION_OVERLAY_MSAA_SAMPLE_COUNT/s
    );
    expect(coordinatorSrc).toMatch(
      /createCrosshairRenderer\(device,\s*\{[^}]*sampleCount:\s*ANNOTATION_OVERLAY_MSAA_SAMPLE_COUNT/s
    );
    expect(coordinatorSrc).toMatch(
      /createHighlightRenderer\(device,\s*\{[^}]*sampleCount:\s*ANNOTATION_OVERLAY_MSAA_SAMPLE_COUNT/s
    );
  });

  it('aliases MSAA annotation renderers to the single sampleCount-4 instances (WG-P2-1)', () => {
    expect(coordinatorSrc).toMatch(/const referenceLineRendererMsaa = referenceLineRenderer/);
    expect(coordinatorSrc).toMatch(/const annotationMarkerRendererMsaa = annotationMarkerRenderer/);
    // Must not construct a second pair of annotation renderers.
    const refCreates = (coordinatorSrc.match(/createReferenceLineRenderer\(/g) ?? []).length;
    const markerCreates = (coordinatorSrc.match(/createAnnotationMarkerRenderer\(/g) ?? []).length;
    expect(refCreates).toBe(1);
    expect(markerCreates).toBe(1);
  });

  it('draws UI overlays into the annotation overlay pass before it ends', () => {
    const overlayBegin = coordinatorSrc.indexOf('label: "renderCoordinator/annotationOverlayMsaaPass"');
    const overlayEnd = coordinatorSrc.indexOf('overlayPass.end()');
    expect(overlayBegin).toBeGreaterThan(-1);
    expect(overlayEnd).toBeGreaterThan(overlayBegin);
    const overlayBlock = coordinatorSrc.slice(overlayBegin, overlayEnd);
    expect(overlayBlock).toMatch(/highlightRenderer\.render\(overlayPass\)/);
    expect(overlayBlock).toMatch(/xAxisRenderer\.render\(overlayPass\)/);
    expect(overlayBlock).toMatch(/crosshairRenderer\.render\(overlayPass\)/);
  });
});
