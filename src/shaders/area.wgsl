// area.wgsl
// Area-fill from a storage buffer of domain points (shared with line stroke):
// - points[i] = vec2(x, y) in data coords (optionally x - xOffset packed)
// - Draw triangle-list with 6 vertices × (pointCount - 1) instances
//   (one trapezoid per consecutive pair point[i] → point[i+1])
// - instance_index selects the segment; vertex_index selects the 6 quad corners
// - Dual-endpoint NaN check collapses gap-spanning segments (matches line.wgsl).
//   Continuous triangle-strip collapse to clip origin does NOT restart a strip
//   and incorrectly fans through (0,0,0,0) — see GitHub issue #153.

struct VSUniforms {
  transform: mat4x4<f32>,
  baseline: f32,
  // Pad to 16-byte multiple (uniform buffer layout requirements).
  _pad0: vec3<f32>,
};

@group(0) @binding(0) var<uniform> vsUniforms: VSUniforms;

struct FSUniforms {
  color: vec4<f32>,
};

@group(0) @binding(1) var<uniform> fsUniforms: FSUniforms;

@group(0) @binding(2) var<storage, read> points: array<vec2<f32>>;

struct VSOut {
  @builtin(position) clipPosition: vec4<f32>,
};

// 6 vertices of a segment quad (2 triangles = trapezoid to baseline):
//   0: A top, 1: B top, 2: A baseline
//   3: A baseline, 4: B top, 5: B baseline
// uv.x: 0 → endpoint A, 1 → endpoint B
// uv.y: 0 → series y (top), 1 → baseline
fn segmentUv(vid: u32) -> vec2<f32> {
  switch (vid) {
    case 0u: { return vec2<f32>(0.0, 0.0); }
    case 1u: { return vec2<f32>(1.0, 0.0); }
    case 2u: { return vec2<f32>(0.0, 1.0); }
    case 3u: { return vec2<f32>(0.0, 1.0); }
    case 4u: { return vec2<f32>(1.0, 0.0); }
    default: { return vec2<f32>(1.0, 1.0); }
  }
}

@vertex
fn vsMain(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VSOut {
  var out: VSOut;
  let pA = points[instanceIndex];
  let pB = points[instanceIndex + 1u];

  // Dual-endpoint gap detection (same contract as line.wgsl).
  // Null entries are packed as NaN by the CPU. WGSL has no isnan(); use NaN != NaN.
  // Collapsing only one vertex of a continuous strip fans finite neighbors through
  // clip origin — per-segment instances fully discard when either endpoint is NaN.
  if (pA.x != pA.x || pA.y != pA.y || pB.x != pB.x || pB.y != pB.y) {
    out.clipPosition = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    return out;
  }

  let uv = segmentUv(vertexIndex);
  let p = select(pA, pB, uv.x > 0.5);
  let y = select(p.y, vsUniforms.baseline, uv.y > 0.5);
  let pos = vec2<f32>(p.x, y);
  out.clipPosition = vsUniforms.transform * vec4<f32>(pos, 0.0, 1.0);
  return out;
}

@fragment
fn fsMain() -> @location(0) vec4<f32> {
  return fsUniforms.color;
}
