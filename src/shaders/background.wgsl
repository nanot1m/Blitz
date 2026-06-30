struct BlitzUniforms {
  viewport_camera: vec4f,
  style: vec4f,
  background_color: vec4f,
  font_params: vec4f,
  interaction: vec4f,
};

@group(0) @binding(0)
var<uniform> u: BlitzUniforms;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) pixel: vec2f,
};

@vertex
fn background_vertex_main(@builtin(vertex_index) vertex_index: u32) -> VertexOut {
  var clip_positions = array<vec2f, 3>(
    vec2f(-1.0, -3.0),
    vec2f(-1.0, 1.0),
    vec2f(3.0, 1.0)
  );

  let clip = clip_positions[vertex_index];
  var out: VertexOut;
  out.position = vec4f(clip, 0.0, 1.0);
  out.pixel = (clip * vec2f(0.5, -0.5) + vec2f(0.5)) * u.viewport_camera.xy;
  return out;
}

fn line_alpha(world_coord: f32, spacing: f32, line_width_px: f32) -> f32 {
  let scale = max(u.style.x, 0.001);
  let cell = abs(fract(world_coord / spacing + 0.5) - 0.5) * spacing * scale;
  return 1.0 - smoothstep(line_width_px, line_width_px + 1.0, cell);
}

fn dash_alpha(pixel_coord: f32) -> f32 {
  let phase = fract(pixel_coord / 6.0) * 6.0;
  return 1.0 - smoothstep(3.0, 4.0, phase);
}

@fragment
fn background_fragment_main(in: VertexOut) -> @location(0) vec4f {
  let scale = max(u.style.x, 0.001);
  let world = (in.pixel - u.viewport_camera.xy * 0.5) / scale + u.viewport_camera.zw;
  var color = u.background_color.rgb;
  if (u.interaction.z < 0.5) {
    return vec4f(color, u.background_color.a);
  }

  let target_world = 20.0 / scale;
  let grid_size = 20.0 * exp2(floor(log2(max(target_world / 20.0, 1.0))));
  let grid_step = 5.0;
  let regular_visible = select(0.0, 1.0, grid_size * scale >= 10.0);
  let regular_width = min(1.0 / scale, 1.0) * scale;
  let bold_width = min(1.0 / scale, 4.0) * scale;
  let regular_vertical = line_alpha(world.x, grid_size, regular_width) * dash_alpha(in.pixel.y);
  let regular_horizontal = line_alpha(world.y, grid_size, regular_width) * dash_alpha(in.pixel.x);
  let bold_spacing = grid_size * grid_step;
  let bold_vertical = line_alpha(world.x, bold_spacing, bold_width);
  let bold_horizontal = line_alpha(world.y, bold_spacing, bold_width);
  let regular = max(regular_vertical, regular_horizontal) * regular_visible;
  let bold = max(bold_vertical, bold_horizontal);
  let luma = dot(u.background_color.rgb, vec3f(0.2126, 0.7152, 0.0722));
  let light_theme = select(0.0, 1.0, luma > 0.5);
  let regular_grid = mix(vec3f(0.12, 0.15, 0.18), vec3f(0.78, 0.73, 0.64), light_theme);
  let bold_grid = mix(vec3f(0.16, 0.19, 0.23), vec3f(0.66, 0.60, 0.50), light_theme);
  let regular_strength = mix(0.34, 0.22, light_theme);
  let bold_strength = mix(0.46, 0.30, light_theme);
  color = mix(color, regular_grid, min(regular * regular_strength, 1.0));
  color = mix(color, bold_grid, min(bold * bold_strength, 1.0));
  return vec4f(color, u.background_color.a);
}
