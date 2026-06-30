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

struct PathDraw {
  bounds: vec4f,
  fill_color: vec4f,
  render: vec4f, // order, drag, stroke_width, point_count
  draw: vec4f,   // base_vertex, fill_index_offset, fill_index_count, _
};

struct PathSegment {
  ax: f32,
  ay: f32,
  bx: f32,
  by: f32,
  draw_index: u32,
};

const HIDDEN_SHAPE_KIND: u32 = 0xffffffffu;

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
var<storage, read> text_draws: array<TextDraw>;

@group(0) @binding(8)
var<storage, read> path_draws: array<PathDraw>;

@group(0) @binding(9)
var<storage, read> path_segments: array<PathSegment>;

@group(0) @binding(6)
var font_atlas: texture_2d<f32>;

@group(0) @binding(7)
var font_sampler: sampler;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) world: vec2f,
  @location(1) @interpolate(flat) command_index: u32,
  @location(2) uv: vec2f,
};

struct PathVertexOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
  @location(1) world: vec2f,
  @location(2) @interpolate(flat) seg_a: vec2f,
  @location(3) @interpolate(flat) seg_b: vec2f,
  @location(4) @interpolate(flat) half_width: f32,
};

fn world_to_clip(world: vec2f) -> vec2f {
  let pixel = (world - u.viewport_camera.zw) * u.style.x + u.viewport_camera.xy * 0.5;
  return pixel / u.viewport_camera.xy * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0);
}

fn rect_bounds(rect: vec4f, vertex_index: u32) -> vec2f {
  let rect_min = rect.xy;
  let rect_max = rect.xy + rect.zw;
  var positions = array<vec2f, 6>(
    vec2f(rect_min.x, rect_min.y),
    vec2f(rect_max.x, rect_min.y),
    vec2f(rect_min.x, rect_max.y),
    vec2f(rect_min.x, rect_max.y),
    vec2f(rect_max.x, rect_min.y),
    vec2f(rect_max.x, rect_max.y)
  );
  return positions[vertex_index];
}

fn rotate_around(point: vec2f, center: vec2f, rotation: f32) -> vec2f {
  if (abs(rotation) < 0.00001) {
    return point;
  }
  let delta = point - center;
  let c = cos(rotation);
  let s = sin(rotation);
  return center + vec2f(delta.x * c - delta.y * s, delta.x * s + delta.y * c);
}

fn inverse_rotate_around(point: vec2f, center: vec2f, rotation: f32) -> vec2f {
  if (abs(rotation) < 0.00001) {
    return point;
  }
  let delta = point - center;
  let c = cos(rotation);
  let s = sin(rotation);
  return center + vec2f(delta.x * c + delta.y * s, -delta.x * s + delta.y * c);
}

fn rect_vertex(draw: RectDraw, vertex_index: u32) -> vec2f {
  let world = rect_bounds(draw.rect, vertex_index);
  return rotate_around(world, draw.stroke_width_pad.zw, draw.stroke_width_pad.y);
}

fn triangle_bounds(draw: TriangleDraw, vertex_index: u32) -> vec2f {
  let top = draw.points_a.xy;
  let right = draw.points_a.zw;
  let left = draw.points_b.xy;
  let bounds_min = min(top, min(right, left));
  let bounds_max = max(top, max(right, left));
  return rect_bounds(vec4f(bounds_min, bounds_max - bounds_min), vertex_index);
}

fn triangle_vertex(draw: TriangleDraw, vertex_index: u32) -> vec2f {
  let world = triangle_bounds(draw, vertex_index);
  return rotate_around(world, draw.stroke_width_pad.zw, draw.stroke_width_pad.y);
}

fn oval_bounds(oval: vec4f, vertex_index: u32) -> vec2f {
  let center = oval.xy;
  let radii = oval.zw;
  return rect_bounds(vec4f(center - radii, radii * 2.0), vertex_index);
}

fn oval_vertex(draw: OvalDraw, vertex_index: u32) -> vec2f {
  let world = oval_bounds(draw.oval, vertex_index);
  return rotate_around(world, draw.stroke_width_pad.zw, draw.stroke_width_pad.y);
}

fn text_vertex(draw: TextDraw, vertex_index: u32) -> vec4f {
  let world = rect_bounds(draw.rect, vertex_index);
  let rotated_world = rotate_around(world, draw.transform.yz, draw.transform.x);
  let uv_min = draw.uv_rect.xy;
  let uv_max = draw.uv_rect.zw;
  var uvs = array<vec2f, 6>(
    vec2f(uv_min.x, uv_min.y),
    vec2f(uv_max.x, uv_min.y),
    vec2f(uv_min.x, uv_max.y),
    vec2f(uv_min.x, uv_max.y),
    vec2f(uv_max.x, uv_min.y),
    vec2f(uv_max.x, uv_max.y)
  );
  return vec4f(rotated_world, uvs[vertex_index]);
}

fn path_vertex(draw: PathDraw, vertex_index: u32) -> vec2f {
  let world = rect_bounds(draw.bounds, vertex_index);
  let center = draw.bounds.xy + draw.bounds.zw * 0.5;
  return rotate_around(world, center, draw.render.w);
}

@vertex
fn shape_vertex_main(
  @builtin(vertex_index) shape_vertex_index: u32,
  @builtin(instance_index) command_index: u32,
) -> VertexOut {
  let command = shape_commands[command_index].kind_index_entity_pad;

  var world: vec2f;
  var uv = vec2f(0.0);
  if (command.x == HIDDEN_SHAPE_KIND) {
    world = vec2f(1.0e20, 1.0e20);
  } else if (command.x == 0u) {
    world = rect_vertex(rect_draws[command.y], shape_vertex_index);
  } else if (command.x == 1u) {
    world = triangle_vertex(triangle_draws[command.y], shape_vertex_index);
  } else if (command.x == 2u) {
    world = oval_vertex(oval_draws[command.y], shape_vertex_index);
  } else if (command.x == 3u) {
    let text_position = text_vertex(text_draws[command.y], shape_vertex_index);
    world = text_position.xy;
    uv = text_position.zw;
  } else {
    world = path_vertex(path_draws[command.y], shape_vertex_index);
  }

  // High bit of the order word flags a dragged command: translate the
  // rasterized position by the drag offset (interaction.xy). out.world stays in
  // original geometry space so the fragment coverage is just shifted, not warped.
  let order = command.w & 0x7fffffffu;
  let dragged = (command.w & 0x80000000u) != 0u;
  var draw_world = world;
  if (dragged) {
    draw_world = world + u.interaction.xy;
  }

  // Draw-order index as depth so the depth test resolves z-order across the
  // separately-drawn static and dynamic passes. Spread across the full [0,1]
  // range (style.w is the draw-order count) so adjacent orders never quantize
  // to the same depth; +1 keeps order 0 above the cleared 0.
  var depth = (f32(order) + 1.0) / (u.style.w + 4.0);
  // While a dragged shape hovers a new container (interaction.w), lift it into a
  // depth band above every non-dragged shape, keeping dragged shapes' relative
  // order among themselves. (interaction.z is the grid-visibility flag.)
  if (dragged && u.interaction.w > 0.5) {
    depth = (u.style.w + 2.0 + f32(order) / (u.style.w + 1.0)) / (u.style.w + 4.0);
  }
  var out: VertexOut;
  out.position = vec4f(world_to_clip(draw_world), depth, 1.0);
  out.world = world;
  out.command_index = command_index;
  out.uv = uv;
  return out;
}

@vertex
fn path_vertex_main(@builtin(vertex_index) vertex_index: u32,
                    @builtin(instance_index) instance_index: u32) -> PathVertexOut {
  // One instance per drawn segment (firstInstance = the stroke's tier offset);
  // expand it into the capsule's bounding quad for the distance-field fragment.
  let seg = path_segments[instance_index];
  let draw = path_draws[seg.draw_index];
  let half_width = draw.render.z * 0.5;
  let order = draw.render.x;
  let dragged = draw.render.y > 0.5;
  let drag_offset = select(vec2f(0.0, 0.0), u.interaction.xy, dragged);
  let center = draw.bounds.xy + draw.bounds.zw * 0.5;
  let a = rotate_around(vec2f(seg.ax, seg.ay), center, draw.render.w) + drag_offset;
  let b = rotate_around(vec2f(seg.bx, seg.by), center, draw.render.w) + drag_offset;
  let delta = b - a;
  let len = length(delta);
  let dir = select(vec2f(1.0, 0.0), delta / len, len > 0.0001);
  let nrm = vec2f(-dir.y, dir.x);
  let ea = a - dir * half_width;
  let eb = b + dir * half_width;
  var corners = array<vec2f, 4>(
    ea + nrm * half_width,
    ea - nrm * half_width,
    eb + nrm * half_width,
    eb - nrm * half_width,
  );
  var order_index = array<u32, 6>(0u, 1u, 2u, 2u, 1u, 3u);
  let corner = corners[order_index[vertex_index]];

  var depth = (order + 1.0) / (u.style.w + 4.0);
  if (dragged && u.interaction.w > 0.5) {
    depth = (u.style.w + 2.0 + order / (u.style.w + 1.0)) / (u.style.w + 4.0);
  }

  var out: PathVertexOut;
  out.position = vec4f(world_to_clip(corner), depth, 1.0);
  out.color = draw.fill_color;
  out.world = corner;
  out.seg_a = a;
  out.seg_b = b;
  out.half_width = half_width;
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

fn triangle_sign(point: vec2f, start: vec2f, end: vec2f) -> f32 {
  return (point.x - end.x) * (start.y - end.y) - (start.x - end.x) * (point.y - end.y);
}

fn triangle_alpha(world: vec2f, draw: TriangleDraw, edge_alpha: f32) -> f32 {
  let top = draw.points_a.xy;
  let right = draw.points_a.zw;
  let left = draw.points_b.xy;
  let s0 = triangle_sign(world, top, right);
  let s1 = triangle_sign(world, right, left);
  let s2 = triangle_sign(world, left, top);
  let all_positive = s0 >= 0.0 && s1 >= 0.0 && s2 >= 0.0;
  let all_negative = s0 <= 0.0 && s1 <= 0.0 && s2 <= 0.0;
  if (!all_positive && !all_negative) {
    return 0.0;
  }

  let distance_to_edge = min(
    segment_distance(world, top, right),
    min(segment_distance(world, right, left), segment_distance(world, left, top)),
  );
  return smoothstep(0.0, edge_alpha, distance_to_edge);
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

fn oval_alpha(world: vec2f, draw: OvalDraw, inset: f32, edge_alpha: f32) -> f32 {
  let radii = max(draw.oval.zw - vec2f(inset), vec2f(0.001));
  let distance_to_center = length((world - draw.oval.xy) / radii);
  let edge = edge_alpha / max(min(radii.x, radii.y), 0.001);
  return 1.0 - smoothstep(1.0 - edge, 1.0, distance_to_center);
}

fn median(value: vec3f) -> f32 {
  return max(min(value.r, value.g), min(max(value.r, value.g), value.b));
}

fn msdf_screen_range(uv_width: vec2f) -> f32 {
  let atlas_size = vec2f(u.font_params.x);
  let unit_range = vec2f(u.font_params.y) / atlas_size;
  let screen_tex_size = 1.0 / max(uv_width, vec2f(0.000001));
  return max(0.5 * dot(unit_range, screen_tex_size), 1.0);
}

@fragment
fn shape_fragment_main(in: VertexOut) -> @location(0) vec4f {
  let uv_width = fwidth(in.uv);
  let command = shape_commands[in.command_index].kind_index_entity_pad;
  if (command.x == HIDDEN_SHAPE_KIND) {
    discard;
  }
  if (command.x == 3u) {
    let draw = text_draws[command.y];
    let sample = textureSampleLevel(font_atlas, font_sampler, in.uv, 0.0);
    let signed_distance = median(sample.rgb) - 0.5;
    let coverage = clamp(signed_distance * msdf_screen_range(uv_width) + 0.5, 0.0, 1.0);
    let alpha = draw.color.a * coverage;
    if (alpha <= 0.001) {
      discard;
    }
    return vec4f(draw.color.rgb, alpha);
  }
  let edge_alpha = 1.0 / max(u.style.x, 0.001);
  var coverage: f32;
  var stroke: f32;
  var fill_color: vec4f;
  var stroke_color: vec4f;

  if (command.x == 0u) {
    let draw = rect_draws[command.y];
    let stroke_width = draw.stroke_width_pad.x;
    let local_world =
      inverse_rotate_around(in.world, draw.stroke_width_pad.zw, draw.stroke_width_pad.y);
    coverage = rect_alpha(local_world, draw.rect, 0.0, edge_alpha);
    if (stroke_width > 0.0) {
      let inner = rect_alpha(local_world, draw.rect, stroke_width, edge_alpha);
      stroke = coverage * (1.0 - inner);
    } else {
      stroke = 0.0;
    }
    fill_color = draw.fill_color;
    stroke_color = draw.stroke_color;
  } else if (command.x == 1u) {
    let draw = triangle_draws[command.y];
    let stroke_width = draw.stroke_width_pad.x;
    let local_world =
      inverse_rotate_around(in.world, draw.stroke_width_pad.zw, draw.stroke_width_pad.y);
    coverage = triangle_alpha(local_world, draw, edge_alpha);
    stroke = select(0.0, coverage * triangle_stroke(local_world, draw, edge_alpha), stroke_width > 0.0);
    fill_color = draw.fill_color;
    stroke_color = draw.stroke_color;
  } else {
    let draw = oval_draws[command.y];
    let stroke_width = draw.stroke_width_pad.x;
    let local_world =
      inverse_rotate_around(in.world, draw.stroke_width_pad.zw, draw.stroke_width_pad.y);
    coverage = oval_alpha(local_world, draw, 0.0, edge_alpha);
    if (stroke_width > 0.0) {
      let inner = oval_alpha(local_world, draw, stroke_width, edge_alpha);
      stroke = coverage * (1.0 - inner);
    } else {
      stroke = 0.0;
    }
    fill_color = draw.fill_color;
    stroke_color = draw.stroke_color;
  }

  if (coverage <= 0.001) {
    discard;
  }

  let color = mix(fill_color, stroke_color, stroke);
  let alpha = color.a * coverage;
  if (alpha <= 0.001) {
    discard;
  }
  return vec4f(color.rgb, alpha);
}

@fragment
fn path_fragment_main(in: PathVertexOut) -> @location(0) vec4f {
  // Binary coverage: MSAA antialiases the silhouette across samples, and
  // depth-write stops overlapping capsules within a stroke from blending twice.
  if (segment_distance(in.world, in.seg_a, in.seg_b) > in.half_width) {
    discard;
  }
  return in.color;
}
