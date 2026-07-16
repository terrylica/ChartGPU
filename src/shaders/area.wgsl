// area.wgsl
// Area-fill from a storage buffer of domain points (shared with line stroke):
// - points[i] = vec2(x, y) in data coords (optionally x - xOffset packed)
// - Draw triangle-strip with vertexCount = pointCount * 2
// - vertex_index / 2 selects the point; parity selects top (y) vs baseline
// - Null/NaN points collapse to a degenerate position (zero-area strip breaks)

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

@vertex
fn vsMain(@builtin(vertex_index) vertexIndex: u32) -> VSOut {
  var out: VSOut;
  let pointIndex = vertexIndex / 2u;
  let useBaseline = (vertexIndex & 1u) == 1u;
  let p = points[pointIndex];

  // Gap detection: NaN != NaN (same contract as line.wgsl).
  if (p.x != p.x || p.y != p.y) {
    out.clipPosition = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    return out;
  }

  let y = select(p.y, vsUniforms.baseline, useBaseline);
  let pos = vec2<f32>(p.x, y);
  out.clipPosition = vsUniforms.transform * vec4<f32>(pos, 0.0, 1.0);
  return out;
}

@fragment
fn fsMain() -> @location(0) vec4<f32> {
  return fsUniforms.color;
}
