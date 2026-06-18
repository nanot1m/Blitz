struct BlitzUniforms {
  viewport_camera: vec4f,
  style: vec4f,
  background_color: vec4f,
};

struct RectDraw {
  rect: vec4f,
  fill_color: vec4f,
  stroke_color: vec4f,
  stroke_width_pad: vec4f,
};

@group(0) @binding(0)
var<uniform> u: BlitzUniforms;

@group(0) @binding(1)
var<storage, read> rect_draws: array<RectDraw>;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) world: vec2f,
  @location(1) @interpolate(flat) draw_index: u32,
};

fn world_to_clip(world: vec2f) -> vec2f {
  let pixel = (world - u.viewport_camera.zw) * u.style.x + u.viewport_camera.xy * 0.5;
  return pixel / u.viewport_camera.xy * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0);
}

@vertex
fn vertex_main(@builtin(vertex_index) vertex_index: u32) -> VertexOut {
  let draw_index = vertex_index / 6u;
  let rect_vertex_index = vertex_index % 6u;
  let draw = rect_draws[draw_index];
  let rect_min = draw.rect.xy;
  let rect_max = draw.rect.xy + draw.rect.zw;
  var rect_positions = array<vec2f, 6>(
    vec2f(rect_min.x, rect_min.y),
    vec2f(rect_max.x, rect_min.y),
    vec2f(rect_min.x, rect_max.y),
    vec2f(rect_min.x, rect_max.y),
    vec2f(rect_max.x, rect_min.y),
    vec2f(rect_max.x, rect_max.y)
  );

  let world = rect_positions[rect_vertex_index];
  var out: VertexOut;
  out.position = vec4f(world_to_clip(world), 0.0, 1.0);
  out.world = world;
  out.draw_index = draw_index;
  return out;
}

fn rect_alpha(world: vec2f, rect: vec4f, inset: f32, edge_alpha: f32) -> f32 {
  let rect_min = rect.xy + vec2f(inset);
  let rect_max = rect.xy + rect.zw - vec2f(inset);
  let inside_min = smoothstep(rect_min, rect_min + vec2f(edge_alpha), world);
  let inside_max = 1.0 - smoothstep(rect_max - vec2f(edge_alpha), rect_max, world);
  return inside_min.x * inside_min.y * inside_max.x * inside_max.y;
}

@fragment
fn fragment_main(in: VertexOut) -> @location(0) vec4f {
  let draw = rect_draws[in.draw_index];
  let edge_alpha = 1.0 / max(u.style.x, 0.001);
  let inner = rect_alpha(in.world, draw.rect, draw.stroke_width_pad.x, edge_alpha);
  let stroke = 1.0 - inner;
  return mix(draw.fill_color, draw.stroke_color, stroke);
}
