struct BlitzUniforms {
  viewport_camera: vec4f,
  style: vec4f,
  background_color: vec4f,
  font_params: vec4f,
  interaction: vec4f,
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

struct OvalDraw {
  oval: vec4f,
  fill_color: vec4f,
  stroke_color: vec4f,
  stroke_width_pad: vec4f,
};

struct TextDraw {
  rect: vec4f,
  uv_rect: vec4f,
  color: vec4f,
  transform: vec4f,
};

struct DrawArgs {
  vertex_count: u32,
  instance_count: u32,
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
var<storage, read> oval_draws: array<OvalDraw>;

@group(0) @binding(5)
var<storage, read_write> visible_commands: array<ShapeCommand>;

@group(0) @binding(6)
var<storage, read_write> draw_args: DrawArgs;

@group(0) @binding(7)
var<storage, read> text_draws: array<TextDraw>;

const HIDDEN_SHAPE_KIND: u32 = 0xffffffffu;

fn rotate_around(point: vec2f, center: vec2f, rotation: f32) -> vec2f {
  if (abs(rotation) < 0.00001) {
    return point;
  }
  let delta = point - center;
  let c = cos(rotation);
  let s = sin(rotation);
  return center + vec2f(delta.x * c - delta.y * s, delta.x * s + delta.y * c);
}

fn rotated_rect_bounds(rect: vec4f, center: vec2f, rotation: f32) -> vec4f {
  if (abs(rotation) < 0.00001) {
    return vec4f(rect.xy, rect.xy + rect.zw);
  }
  let p0 = rotate_around(rect.xy, center, rotation);
  let p1 = rotate_around(vec2f(rect.x + rect.z, rect.y), center, rotation);
  let p2 = rotate_around(rect.xy + rect.zw, center, rotation);
  let p3 = rotate_around(vec2f(rect.x, rect.y + rect.w), center, rotation);
  let bounds_min = min(min(p0, p1), min(p2, p3));
  let bounds_max = max(max(p0, p1), max(p2, p3));
  return vec4f(bounds_min, bounds_max);
}

// Returns world-space bounds as (min.x, min.y, max.x, max.y).
fn shape_bounds(command: vec4u) -> vec4f {
  if (command.x == 0u) {
    let draw = rect_draws[command.y];
    let r = draw.rect;
    let rotation = draw.stroke_width_pad.y;
    return rotated_rect_bounds(r, draw.stroke_width_pad.zw, rotation);
  } else if (command.x == 1u) {
    let d = triangle_draws[command.y];
    let bounds_min = min(d.points_a.xy, min(d.points_a.zw, d.points_b.xy));
    let bounds_max = max(d.points_a.xy, max(d.points_a.zw, d.points_b.xy));
    return rotated_rect_bounds(vec4f(bounds_min, bounds_max - bounds_min),
                               d.stroke_width_pad.zw, d.stroke_width_pad.y);
  } else if (command.x == 3u) {
    let t = text_draws[command.y].rect;
    return rotated_rect_bounds(t, text_draws[command.y].transform.yz,
                               text_draws[command.y].transform.x);
  }
  // Only rects/triangles/ovals/text reach the cull (paths render via their own
  // pipeline), so command.x == 2u here.
  let d = oval_draws[command.y];
  let c = d.oval;
  return rotated_rect_bounds(vec4f(c.xy - c.zw, c.zw * 2.0),
                             d.stroke_width_pad.zw, d.stroke_width_pad.y);
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
    visible_commands[index].kind_index_entity_pad = command;
    return;
  }

  let bounds = shape_bounds(command);
  let scale = u.style.x;
  let half = u.viewport_camera.xy * 0.5 / scale;
  let view_min = u.viewport_camera.zw - half;
  let view_max = u.viewport_camera.zw + half;

  if (bounds.z < view_min.x || bounds.x > view_max.x ||
      bounds.w < view_min.y || bounds.y > view_max.y) {
    visible_commands[index].kind_index_entity_pad = vec4u(HIDDEN_SHAPE_KIND, 0u, 0u, 0u);
    return;
  }

  let size = bounds.zw - bounds.xy;
  if (size.x * scale < 1.0 && size.y * scale < 1.0) {
    visible_commands[index].kind_index_entity_pad = vec4u(HIDDEN_SHAPE_KIND, 0u, 0u, 0u);
    return;
  }

  visible_commands[index].kind_index_entity_pad = command;
}
