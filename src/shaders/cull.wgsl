struct BlitzUniforms {
  viewport_camera: vec4f,
  style: vec4f,
  background_color: vec4f,
  font_params: vec4f,
};

struct ShapeCommand {
  kind_index_entity_pad: vec4u,
};

struct RectDraw {
  rect: vec4f,
  fill_color: vec4f,
  stroke_color: vec4f,
  stroke_width_pad: vec4f,
};

struct TriangleDraw {
  points_a: vec4f,
  points_b: vec4f,
  fill_color: vec4f,
  stroke_color: vec4f,
  stroke_width_pad: vec4f,
};

struct CircleDraw {
  circle: vec4f,
  fill_color: vec4f,
  stroke_color: vec4f,
  stroke_width_pad: vec4f,
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
var<storage, read> shape_commands: array<ShapeCommand>;

@group(0) @binding(2)
var<storage, read> rect_draws: array<RectDraw>;

@group(0) @binding(3)
var<storage, read> triangle_draws: array<TriangleDraw>;

@group(0) @binding(4)
var<storage, read> circle_draws: array<CircleDraw>;

@group(0) @binding(5)
var<storage, read_write> visible_commands: array<ShapeCommand>;

@group(0) @binding(6)
var<storage, read_write> draw_args: DrawArgs;

// Returns world-space bounds as (min.x, min.y, max.x, max.y).
fn shape_bounds(command: vec4u) -> vec4f {
  if (command.x == 0u) {
    let r = rect_draws[command.y].rect;
    return vec4f(r.xy, r.xy + r.zw);
  } else if (command.x == 1u) {
    let d = triangle_draws[command.y];
    let bounds_min = min(d.points_a.xy, min(d.points_a.zw, d.points_b.xy));
    let bounds_max = max(d.points_a.xy, max(d.points_a.zw, d.points_b.xy));
    return vec4f(bounds_min, bounds_max);
  }
  let c = circle_draws[command.y].circle;
  return vec4f(c.xy - vec2f(c.z), c.xy + vec2f(c.z));
}

@compute @workgroup_size(64)
fn cull_main(@builtin(global_invocation_id) gid: vec3u) {
  let index = gid.x;
  let total = u32(u.style.z);
  if (index >= total) {
    return;
  }

  let command = shape_commands[index].kind_index_entity_pad;

  // Dragged commands are translated in the shader, so their stored bounds are
  // stale; keep them unconditionally rather than culling on the old position.
  if ((command.w & 0x80000000u) != 0u) {
    let slot = atomicAdd(&draw_args.instance_count, 1u);
    visible_commands[slot] = shape_commands[index];
    return;
  }

  let bounds = shape_bounds(command);
  let scale = u.style.x;
  let half = u.viewport_camera.xy * 0.5 / scale;
  let view_min = u.viewport_camera.zw - half;
  let view_max = u.viewport_camera.zw + half;

  if (bounds.z < view_min.x || bounds.x > view_max.x ||
      bounds.w < view_min.y || bounds.y > view_max.y) {
    return;
  }

  let size = bounds.zw - bounds.xy;
  if (size.x * scale < 1.0 && size.y * scale < 1.0) {
    return;
  }

  let slot = atomicAdd(&draw_args.instance_count, 1u);
  visible_commands[slot] = shape_commands[index];
}
