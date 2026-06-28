// Viewport-culls pen segments into a compacted visible-index list + indirect
// draw args, mirroring the shape cull. One indirect draw then renders only the
// on-screen segments.

struct BlitzUniforms {
  viewport_camera: vec4f,
  style: vec4f,
  background_color: vec4f,
  font_params: vec4f,
  interaction: vec4f,
};

struct PathSegment {
  ax: f32,
  ay: f32,
  bx: f32,
  by: f32,
  draw_index: u32,
};

struct PathDraw {
  bounds: vec4f,
  fill_color: vec4f,
  render: vec4f, // order, drag, stroke_width, point_count
  draw: vec4f,
};

struct DrawArgs {
  vertex_count: u32,
  instance_count: atomic<u32>,
  first_vertex: u32,
  first_instance: u32,
};

@group(0) @binding(0)
var<uniform> u: BlitzUniforms;

@group(0) @binding(1)
var<storage, read> path_segments: array<PathSegment>;

@group(0) @binding(2)
var<storage, read> path_draws: array<PathDraw>;

@group(0) @binding(3)
var<storage, read_write> visible_path_segments: array<u32>;

@group(0) @binding(4)
var<storage, read_write> path_draw_args: DrawArgs;

@compute @workgroup_size(64)
fn cull_path_main(@builtin(global_invocation_id) gid: vec3u) {
  let index = gid.x;
  let total = u32(u.style.y); // path segment count
  if (index >= total) {
    return;
  }

  let seg = path_segments[index];
  let draw = path_draws[seg.draw_index];

  // Dragged strokes translate in the shader, so their stored bounds are stale;
  // keep them unconditionally rather than culling on the old position.
  if (draw.render.y > 0.5) {
    let slot = atomicAdd(&path_draw_args.instance_count, 1u);
    visible_path_segments[slot] = index;
    return;
  }

  let half = draw.render.z * 0.5;
  let a = vec2f(seg.ax, seg.ay);
  let b = vec2f(seg.bx, seg.by);
  let lo = min(a, b) - vec2f(half, half);
  let hi = max(a, b) + vec2f(half, half);

  let scale = u.style.x;
  let view_half = u.viewport_camera.xy * 0.5 / scale;
  let view_min = u.viewport_camera.zw - view_half;
  let view_max = u.viewport_camera.zw + view_half;
  if (hi.x < view_min.x || lo.x > view_max.x ||
      hi.y < view_min.y || lo.y > view_max.y) {
    return;
  }

  let slot = atomicAdd(&path_draw_args.instance_count, 1u);
  visible_path_segments[slot] = index;
}
