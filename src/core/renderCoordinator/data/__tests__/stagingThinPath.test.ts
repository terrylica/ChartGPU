/**
 * Unit tests for staging thin-path rebind-failure demote.
 * Thin-path eligibility is the append fast path (canRangedAppendLine / canUseFastPath).
 */

import { describe, it, expect } from 'vitest';
import { demoteStagingViewAfterRebindFailure } from '../stagingThinPath';
import { createStagingRingView, createRingXYColumns } from '../../../../data/cartesianData';

describe('demoteStagingViewAfterRebindFailure', () => {
  it('nulls a live StagingRingView so fallthrough can dual-pack', () => {
    const view = createStagingRingView(new Float32Array(4), 0, 2, 2, 0);
    expect(demoteStagingViewAfterRebindFailure(view)).toBeNull();
  });

  it('leaves non-staging raw unchanged', () => {
    const ring = createRingXYColumns(8);
    ring.count = 2;
    expect(demoteStagingViewAfterRebindFailure(ring)).toBe(ring);
    const cols = { x: [1], y: [2] };
    expect(demoteStagingViewAfterRebindFailure(cols)).toBe(cols);
  });

  it('passes through null', () => {
    expect(demoteStagingViewAfterRebindFailure(null)).toBeNull();
  });
});
