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

struct TriangleDraw {
  points_a: vec4f,
  points_b: vec4f,
  fill_color: vec4f,
  stroke_color: vec4f,
  stroke_width_pad: vec4f,
};

@group(0) @binding(0)
var<uniform> u: BlitzUniforms;

@group(0) @binding(1)
var<storage, read> rect_draws: array<RectDraw>;

@group(0) @binding(2)
var<storage, read> triangle_draws: array<TriangleDraw>;

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
fn rect_vertex_main(@builtin(vertex_index) vertex_index: u32) -> VertexOut {
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

@vertex
fn triangle_vertex_main(@builtin(vertex_index) vertex_index: u32) -> VertexOut {
  let draw_index = vertex_index / 3u;
  let triangle_vertex_index = vertex_index % 3u;
  let draw = triangle_draws[draw_index];
  var triangle_positions = array<vec2f, 3>(
    draw.points_a.xy,
    draw.points_a.zw,
    draw.points_b.xy
  );

  let world = triangle_positions[triangle_vertex_index];
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

fn segment_distance(point: vec2f, start: vec2f, end: vec2f) -> f32 {
  let edge = end - start;
  let offset = point - start;
  let projection = clamp(dot(offset, edge) / max(dot(edge, edge), 0.001), 0.0, 1.0);
  return length(offset - edge * projection);
}

fn triangle_stroke(world: vec2f, draw: TriangleDraw, edge_alpha: f32) -> f32 {
  let top = draw.points_a.xy;
  let right = draw.points_a.zw;
  let left = draw.points_b.xy;
  let distance_to_edge = min(
    segment_distance(world, top, right),
    min(segment_distance(world, right, left), segment_distance(world, left, top)),
  );
  return 1.0 - smoothstep(draw.stroke_width_pad.x, draw.stroke_width_pad.x + edge_alpha, distance_to_edge);
}

@fragment
fn rect_fragment_main(in: VertexOut) -> @location(0) vec4f {
  let draw = rect_draws[in.draw_index];
  let edge_alpha = 1.0 / max(u.style.x, 0.001);
  let inner = rect_alpha(in.world, draw.rect, draw.stroke_width_pad.x, edge_alpha);
  let stroke = 1.0 - inner;
  return mix(draw.fill_color, draw.stroke_color, stroke);
}

@fragment
fn triangle_fragment_main(in: VertexOut) -> @location(0) vec4f {
  let draw = triangle_draws[in.draw_index];
  let edge_alpha = 1.0 / max(u.style.x, 0.001);
  let stroke = triangle_stroke(in.world, draw, edge_alpha);
  return mix(draw.fill_color, draw.stroke_color, stroke);
}
