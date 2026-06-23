typedef unsigned int u32;
typedef int i32;

#define EXPORT(name) __attribute__((export_name(name)))

#define BLITZ_MAX_ENTITIES 1000000u
#define BLITZ_RENDER_CHUNK_RECTS 250000u
#define BLITZ_RENDER_CHUNKS 4u
#define BLITZ_MAX_RECT_DRAWS (BLITZ_RENDER_CHUNK_RECTS * BLITZ_RENDER_CHUNKS)

#define BLITZ_GRID_SIZE 1024u
#define BLITZ_GRID_CELL_SIZE 128.0f
#define BLITZ_GRID_ORIGIN -65536.0f
#define BLITZ_GRID_CELL_COUNT (BLITZ_GRID_SIZE * BLITZ_GRID_SIZE)
#define BLITZ_INVALID_INDEX 0xffffffffu

#define BLITZ_COMPONENT_POSITION 1u
#define BLITZ_COMPONENT_SIZE 2u
#define BLITZ_COMPONENT_RECT_VIEW 4u
#define BLITZ_COMPONENT_TRIANGLE_VIEW 8u
#define BLITZ_COMPONENT_CIRCLE_VIEW 16u

#define BLITZ_MODE_DRAG 0u
#define BLITZ_MODE_PUSHBACK 1u
#define BLITZ_MODE_TRIANGLE 2u
#define BLITZ_MODE_CIRCLE 3u
#define BLITZ_MODE_RECT 4u
#define BLITZ_SHAPE_RECT 0u
#define BLITZ_SHAPE_TRIANGLE 1u
#define BLITZ_SHAPE_CIRCLE 2u
#define BLITZ_PUSHBACK_RADIUS_DEFAULT 140.0f
#define BLITZ_PUSHBACK_RADIUS_MIN 24.0f
#define BLITZ_PUSHBACK_RADIUS_MAX 640.0f
#define BLITZ_PUSHBACK_RADIUS_STEP 24.0f
#define BLITZ_PUSHBACK_DISTANCE 42.0f
#define BLITZ_PUSHBACK_SPEED 12.0f

typedef struct Vec2 {
  float x;
  float y;
} Vec2;

typedef struct Color {
  float r;
  float g;
  float b;
  float a;
} Color;

typedef struct RectView {
  Color fill_color;
  Color stroke_color;
  float stroke_width;
} RectView;

typedef struct TriangleView {
  Color fill_color;
  Color stroke_color;
  float stroke_width;
} TriangleView;

typedef struct CircleView {
  Color fill_color;
  Color stroke_color;
  float stroke_width;
} CircleView;

typedef struct BlitzUniforms {
  float viewport_camera[4];
  float style[4];
  float background_color[4];
} BlitzUniforms;

typedef struct ShapeCommand {
  u32 shape_kind;
  u32 shape_index;
  u32 entity;
  u32 _pad0;
} ShapeCommand;

typedef struct RectDraw {
  float rect[4];
  float fill_color[4];
  float stroke_color[4];
  float stroke_width_pad[4];
} RectDraw;

typedef struct TriangleDraw {
  float points_a[4];
  float points_b[4];
  float fill_color[4];
  float stroke_color[4];
  float stroke_width_pad[4];
} TriangleDraw;

typedef struct CircleDraw {
  float circle[4];
  float fill_color[4];
  float stroke_color[4];
  float stroke_width_pad[4];
} CircleDraw;

typedef struct World {
  u32 entity_count;
  u32 masks[BLITZ_MAX_ENTITIES];
  Vec2 positions[BLITZ_MAX_ENTITIES];
  Vec2 base_positions[BLITZ_MAX_ENTITIES];
  Vec2 sizes[BLITZ_MAX_ENTITIES];
  RectView rect_views[BLITZ_MAX_ENTITIES];
  TriangleView triangle_views[BLITZ_MAX_ENTITIES];
  CircleView circle_views[BLITZ_MAX_ENTITIES];
  u32 grid_heads[BLITZ_GRID_CELL_COUNT];
  u32 grid_next[BLITZ_MAX_ENTITIES];
  u32 grid_cells[BLITZ_MAX_ENTITIES];
  u32 pushback_active[BLITZ_MAX_ENTITIES];
  u32 pushback_entities[BLITZ_MAX_ENTITIES];
} World;

static BlitzUniforms uniforms;
static ShapeCommand shape_commands[BLITZ_MAX_RECT_DRAWS];
static RectDraw rect_draws[BLITZ_MAX_RECT_DRAWS];
static TriangleDraw triangle_draws[BLITZ_MAX_RECT_DRAWS];
static CircleDraw circle_draws[BLITZ_MAX_RECT_DRAWS];
static World world;
static u32 shape_command_count;
static u32 rect_draw_count;
static u32 triangle_draw_count;
static u32 circle_draw_count;
static u32 shape_command_version;
static u32 render_list_dirty;
static u32 dragging_entity;
static Vec2 drag_offset;
static u32 interaction_mode;
static u32 pushback_active_count;
static u32 pushback_cursor_active;
static Vec2 pushback_cursor;
static float pushback_radius;
static float last_time_seconds;

static float floorf_local(float value) {
  i32 truncated = (i32)value;
  if ((float)truncated > value) {
    truncated -= 1;
  }
  return (float)truncated;
}

static float clampf(float value, float min_value, float max_value) {
  if (value < min_value) {
    return min_value;
  }
  if (value > max_value) {
    return max_value;
  }
  return value;
}

static float absf_local(float value) {
  return value < 0.0f ? -value : value;
}

static float minf_local(float a, float b) {
  return a < b ? a : b;
}

static float sqrtf_local(float value) {
  if (value <= 0.0f) {
    return 0.0f;
  }

  float estimate = value;
  for (u32 i = 0u; i < 8u; i += 1u) {
    estimate = 0.5f * (estimate + value / estimate);
  }
  return estimate;
}

static i32 clampi(i32 value, i32 min_value, i32 max_value) {
  if (value < min_value) {
    return min_value;
  }
  if (value > max_value) {
    return max_value;
  }
  return value;
}

static i32 grid_coord(float world_position) {
  float cell = (world_position - BLITZ_GRID_ORIGIN) / BLITZ_GRID_CELL_SIZE;
  return (i32)floorf_local(cell);
}

static u32 grid_index(i32 x, i32 y) {
  return (u32)y * BLITZ_GRID_SIZE + (u32)x;
}

static u32 grid_cell_for_position(Vec2 position) {
  i32 x = grid_coord(position.x);
  i32 y = grid_coord(position.y);
  if (x < 0 || y < 0 || x >= (i32)BLITZ_GRID_SIZE ||
      y >= (i32)BLITZ_GRID_SIZE) {
    return BLITZ_INVALID_INDEX;
  }
  return grid_index(x, y);
}

static void mark_render_list_dirty(void) {
  render_list_dirty = 1u;
}

static void grid_clear(void) {
  for (u32 i = 0u; i < BLITZ_GRID_CELL_COUNT; i += 1u) {
    world.grid_heads[i] = BLITZ_INVALID_INDEX;
  }
}

static u32 ecs_create_entity(void) {
  u32 entity = world.entity_count;
  if (entity < BLITZ_MAX_ENTITIES) {
    world.entity_count += 1u;
    world.grid_next[entity] = BLITZ_INVALID_INDEX;
    world.grid_cells[entity] = BLITZ_INVALID_INDEX;
    world.pushback_active[entity] = 0u;
    return entity;
  }
  return BLITZ_INVALID_INDEX;
}

static void ecs_set_position(u32 entity, float x, float y) {
  if (entity == BLITZ_INVALID_INDEX) {
    return;
  }
  world.positions[entity].x = x;
  world.positions[entity].y = y;
  world.base_positions[entity].x = x;
  world.base_positions[entity].y = y;
  world.masks[entity] |= BLITZ_COMPONENT_POSITION;
}

static void ecs_set_size(u32 entity, float width, float height) {
  if (entity == BLITZ_INVALID_INDEX) {
    return;
  }
  world.sizes[entity].x = width;
  world.sizes[entity].y = height;
  world.masks[entity] |= BLITZ_COMPONENT_SIZE;
}

static void ecs_set_rect_view(u32 entity, Color fill_color, Color stroke_color,
                              float stroke_width) {
  if (entity == BLITZ_INVALID_INDEX) {
    return;
  }
  world.rect_views[entity].fill_color = fill_color;
  world.rect_views[entity].stroke_color = stroke_color;
  world.rect_views[entity].stroke_width = stroke_width;
  world.masks[entity] |= BLITZ_COMPONENT_RECT_VIEW;
}

static void ecs_set_triangle_view(u32 entity, Color fill_color,
                                  Color stroke_color, float stroke_width) {
  if (entity == BLITZ_INVALID_INDEX) {
    return;
  }
  world.triangle_views[entity].fill_color = fill_color;
  world.triangle_views[entity].stroke_color = stroke_color;
  world.triangle_views[entity].stroke_width = stroke_width;
  world.masks[entity] |= BLITZ_COMPONENT_TRIANGLE_VIEW;
}

static void ecs_set_circle_view(u32 entity, Color fill_color,
                                Color stroke_color, float stroke_width) {
  if (entity == BLITZ_INVALID_INDEX) {
    return;
  }
  world.circle_views[entity].fill_color = fill_color;
  world.circle_views[entity].stroke_color = stroke_color;
  world.circle_views[entity].stroke_width = stroke_width;
  world.masks[entity] |= BLITZ_COMPONENT_CIRCLE_VIEW;
}

static void grid_insert(u32 entity) {
  if (entity == BLITZ_INVALID_INDEX) {
    return;
  }
  u32 cell = grid_cell_for_position(world.positions[entity]);
  if (cell == BLITZ_INVALID_INDEX) {
    world.grid_cells[entity] = BLITZ_INVALID_INDEX;
    return;
  }

  world.grid_next[entity] = world.grid_heads[cell];
  world.grid_heads[cell] = entity;
  world.grid_cells[entity] = cell;
}

static void grid_remove(u32 entity) {
  if (entity == BLITZ_INVALID_INDEX) {
    return;
  }

  u32 cell = world.grid_cells[entity];
  if (cell == BLITZ_INVALID_INDEX) {
    return;
  }

  u32 current = world.grid_heads[cell];
  u32 previous = BLITZ_INVALID_INDEX;
  while (current != BLITZ_INVALID_INDEX) {
    if (current == entity) {
      if (previous == BLITZ_INVALID_INDEX) {
        world.grid_heads[cell] = world.grid_next[current];
      } else {
        world.grid_next[previous] = world.grid_next[current];
      }
      world.grid_next[current] = BLITZ_INVALID_INDEX;
      world.grid_cells[current] = BLITZ_INVALID_INDEX;
      return;
    }
    previous = current;
    current = world.grid_next[current];
  }
}

static void grid_update(u32 entity) {
  u32 previous_cell = world.grid_cells[entity];
  u32 next_cell = grid_cell_for_position(world.positions[entity]);
  if (previous_cell == next_cell) {
    return;
  }

  grid_remove(entity);
  grid_insert(entity);
}

static void set_entity_base_position(u32 entity, float x, float y) {
  if (entity == BLITZ_INVALID_INDEX) {
    return;
  }

  world.positions[entity].x = x;
  world.positions[entity].y = y;
  world.base_positions[entity].x = x;
  world.base_positions[entity].y = y;
  grid_update(entity);
  mark_render_list_dirty();
}

static void push_rect_draw(u32 entity) {
  if (shape_command_count >= BLITZ_MAX_RECT_DRAWS ||
      rect_draw_count >= BLITZ_MAX_RECT_DRAWS) {
    return;
  }

  Vec2 position = world.positions[entity];
  Vec2 size = world.sizes[entity];
  RectView view = world.rect_views[entity];
  RectDraw *draw = &rect_draws[rect_draw_count];

  draw->rect[0] = position.x;
  draw->rect[1] = position.y;
  draw->rect[2] = size.x;
  draw->rect[3] = size.y;

  draw->fill_color[0] = view.fill_color.r;
  draw->fill_color[1] = view.fill_color.g;
  draw->fill_color[2] = view.fill_color.b;
  draw->fill_color[3] = view.fill_color.a;

  draw->stroke_color[0] = view.stroke_color.r;
  draw->stroke_color[1] = view.stroke_color.g;
  draw->stroke_color[2] = view.stroke_color.b;
  draw->stroke_color[3] = view.stroke_color.a;

  draw->stroke_width_pad[0] = view.stroke_width;
  draw->stroke_width_pad[1] = 0.0f;
  draw->stroke_width_pad[2] = 0.0f;
  draw->stroke_width_pad[3] = 0.0f;

  shape_commands[shape_command_count].shape_kind = (u32)BLITZ_SHAPE_RECT;
  shape_commands[shape_command_count].shape_index = rect_draw_count;
  shape_commands[shape_command_count].entity = entity;
  shape_commands[shape_command_count]._pad0 = 0u;
  rect_draw_count += 1u;
  shape_command_count += 1u;
}

static void push_triangle_draw(u32 entity) {
  if (shape_command_count >= BLITZ_MAX_RECT_DRAWS ||
      triangle_draw_count >= BLITZ_MAX_RECT_DRAWS) {
    return;
  }

  Vec2 position = world.positions[entity];
  Vec2 size = world.sizes[entity];
  TriangleView view = world.triangle_views[entity];
  TriangleDraw *draw = &triangle_draws[triangle_draw_count];

  float min_x = position.x;
  float min_y = position.y;
  float max_x = position.x + size.x;
  float max_y = position.y + size.y;
  float center_x = min_x + size.x * 0.5f;

  draw->points_a[0] = center_x;
  draw->points_a[1] = min_y;
  draw->points_a[2] = max_x;
  draw->points_a[3] = max_y;
  draw->points_b[0] = min_x;
  draw->points_b[1] = max_y;
  draw->points_b[2] = 0.0f;
  draw->points_b[3] = 0.0f;

  draw->fill_color[0] = view.fill_color.r;
  draw->fill_color[1] = view.fill_color.g;
  draw->fill_color[2] = view.fill_color.b;
  draw->fill_color[3] = view.fill_color.a;

  draw->stroke_color[0] = view.stroke_color.r;
  draw->stroke_color[1] = view.stroke_color.g;
  draw->stroke_color[2] = view.stroke_color.b;
  draw->stroke_color[3] = view.stroke_color.a;

  draw->stroke_width_pad[0] = view.stroke_width;
  draw->stroke_width_pad[1] = 0.0f;
  draw->stroke_width_pad[2] = 0.0f;
  draw->stroke_width_pad[3] = 0.0f;

  shape_commands[shape_command_count].shape_kind = (u32)BLITZ_SHAPE_TRIANGLE;
  shape_commands[shape_command_count].shape_index = triangle_draw_count;
  shape_commands[shape_command_count].entity = entity;
  shape_commands[shape_command_count]._pad0 = 0u;
  triangle_draw_count += 1u;
  shape_command_count += 1u;
}

static void push_circle_draw(u32 entity) {
  if (shape_command_count >= BLITZ_MAX_RECT_DRAWS ||
      circle_draw_count >= BLITZ_MAX_RECT_DRAWS) {
    return;
  }

  Vec2 position = world.positions[entity];
  Vec2 size = world.sizes[entity];
  CircleView view = world.circle_views[entity];
  CircleDraw *draw = &circle_draws[circle_draw_count];

  float radius = minf_local(size.x, size.y) * 0.5f;
  draw->circle[0] = position.x + size.x * 0.5f;
  draw->circle[1] = position.y + size.y * 0.5f;
  draw->circle[2] = radius;
  draw->circle[3] = 0.0f;

  draw->fill_color[0] = view.fill_color.r;
  draw->fill_color[1] = view.fill_color.g;
  draw->fill_color[2] = view.fill_color.b;
  draw->fill_color[3] = view.fill_color.a;

  draw->stroke_color[0] = view.stroke_color.r;
  draw->stroke_color[1] = view.stroke_color.g;
  draw->stroke_color[2] = view.stroke_color.b;
  draw->stroke_color[3] = view.stroke_color.a;

  draw->stroke_width_pad[0] = view.stroke_width;
  draw->stroke_width_pad[1] = 0.0f;
  draw->stroke_width_pad[2] = 0.0f;
  draw->stroke_width_pad[3] = 0.0f;

  shape_commands[shape_command_count].shape_kind = (u32)BLITZ_SHAPE_CIRCLE;
  shape_commands[shape_command_count].shape_index = circle_draw_count;
  shape_commands[shape_command_count].entity = entity;
  shape_commands[shape_command_count]._pad0 = 0u;
  circle_draw_count += 1u;
  shape_command_count += 1u;
}

static int entity_in_cursor_radius_for_mode(u32 entity, u32 mode) {
  if (interaction_mode != mode || !pushback_cursor_active) {
    return 0;
  }

  Vec2 position = world.positions[entity];
  Vec2 size = world.sizes[entity];
  float center_x = position.x + size.x * 0.5f;
  float center_y = position.y + size.y * 0.5f;
  float dx = center_x - pushback_cursor.x;
  float dy = center_y - pushback_cursor.y;
  float radius_sq = pushback_radius * pushback_radius;
  return dx * dx + dy * dy <= radius_sq;
}

static void replace_entity_with_mode_shape(u32 entity) {
  if (entity == BLITZ_INVALID_INDEX) {
    return;
  }

  if (interaction_mode == BLITZ_MODE_RECT &&
      (world.masks[entity] &
       (BLITZ_COMPONENT_RECT_VIEW | BLITZ_COMPONENT_TRIANGLE_VIEW |
        BLITZ_COMPONENT_CIRCLE_VIEW))) {
    world.masks[entity] |= BLITZ_COMPONENT_RECT_VIEW;
    world.masks[entity] &= ~BLITZ_COMPONENT_TRIANGLE_VIEW;
    world.masks[entity] &= ~BLITZ_COMPONENT_CIRCLE_VIEW;
  } else if (interaction_mode == BLITZ_MODE_TRIANGLE &&
      (world.masks[entity] &
       (BLITZ_COMPONENT_RECT_VIEW | BLITZ_COMPONENT_TRIANGLE_VIEW |
        BLITZ_COMPONENT_CIRCLE_VIEW))) {
    world.masks[entity] |= BLITZ_COMPONENT_TRIANGLE_VIEW;
    world.masks[entity] &= ~BLITZ_COMPONENT_RECT_VIEW;
    world.masks[entity] &= ~BLITZ_COMPONENT_CIRCLE_VIEW;
  } else if (interaction_mode == BLITZ_MODE_CIRCLE &&
             (world.masks[entity] &
              (BLITZ_COMPONENT_RECT_VIEW | BLITZ_COMPONENT_TRIANGLE_VIEW |
               BLITZ_COMPONENT_CIRCLE_VIEW))) {
    world.masks[entity] |= BLITZ_COMPONENT_CIRCLE_VIEW;
    world.masks[entity] &= ~BLITZ_COMPONENT_RECT_VIEW;
    world.masks[entity] &= ~BLITZ_COMPONENT_TRIANGLE_VIEW;
  }
}

static int entity_in_cursor_radius(u32 entity) {
  if (!pushback_cursor_active) {
    return 0;
  }

  Vec2 position = world.positions[entity];
  Vec2 size = world.sizes[entity];
  float center_x = position.x + size.x * 0.5f;
  float center_y = position.y + size.y * 0.5f;
  float dx = center_x - pushback_cursor.x;
  float dy = center_y - pushback_cursor.y;
  float radius_sq = pushback_radius * pushback_radius;
  return dx * dx + dy * dy <= radius_sq;
}

static void replace_cursor_radius_with_mode_shape(void) {
  if (!pushback_cursor_active ||
      (interaction_mode != BLITZ_MODE_RECT && interaction_mode != BLITZ_MODE_TRIANGLE &&
       interaction_mode != BLITZ_MODE_CIRCLE)) {
    return;
  }

  i32 min_cell_x =
      clampi(grid_coord(pushback_cursor.x - pushback_radius) - 1, 0,
             (i32)BLITZ_GRID_SIZE - 1);
  i32 min_cell_y =
      clampi(grid_coord(pushback_cursor.y - pushback_radius) - 1, 0,
             (i32)BLITZ_GRID_SIZE - 1);
  i32 max_cell_x =
      clampi(grid_coord(pushback_cursor.x + pushback_radius) + 1, 0,
             (i32)BLITZ_GRID_SIZE - 1);
  i32 max_cell_y =
      clampi(grid_coord(pushback_cursor.y + pushback_radius) + 1, 0,
             (i32)BLITZ_GRID_SIZE - 1);

  u32 base_required = BLITZ_COMPONENT_POSITION | BLITZ_COMPONENT_SIZE;
  for (i32 y = min_cell_y; y <= max_cell_y; y += 1) {
    for (i32 x = min_cell_x; x <= max_cell_x; x += 1) {
      u32 entity = world.grid_heads[grid_index(x, y)];
      while (entity != BLITZ_INVALID_INDEX) {
        if ((world.masks[entity] & base_required) == base_required &&
            (world.masks[entity] &
             (BLITZ_COMPONENT_RECT_VIEW | BLITZ_COMPONENT_TRIANGLE_VIEW |
              BLITZ_COMPONENT_CIRCLE_VIEW)) &&
            entity_in_cursor_radius(entity)) {
          replace_entity_with_mode_shape(entity);
        }
        entity = world.grid_next[entity];
      }
    }
  }

  mark_render_list_dirty();
}

static int rect_intersects_view(u32 entity, float min_x, float min_y,
                                float max_x, float max_y) {
  Vec2 position = world.positions[entity];
  Vec2 size = world.sizes[entity];
  float rect_min_x = position.x;
  float rect_min_y = position.y;
  float rect_max_x = position.x + size.x;
  float rect_max_y = position.y + size.y;
  return rect_max_x >= min_x && rect_min_x <= max_x && rect_max_y >= min_y &&
         rect_min_y <= max_y;
}

static void extract_render_draws(void) {
  if (!render_list_dirty) {
    return;
  }

  shape_command_count = 0u;
  rect_draw_count = 0u;
  triangle_draw_count = 0u;
  circle_draw_count = 0u;

  float half_w = uniforms.viewport_camera[0] * 0.5f / uniforms.style[0];
  float half_h = uniforms.viewport_camera[1] * 0.5f / uniforms.style[0];
  float view_min_x = uniforms.viewport_camera[2] - half_w;
  float view_min_y = uniforms.viewport_camera[3] - half_h;
  float view_max_x = uniforms.viewport_camera[2] + half_w;
  float view_max_y = uniforms.viewport_camera[3] + half_h;
  u32 base_required = BLITZ_COMPONENT_POSITION | BLITZ_COMPONENT_SIZE;

  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if ((world.masks[entity] & base_required) == base_required &&
        rect_intersects_view(entity, view_min_x, view_min_y, view_max_x,
                             view_max_y)) {
      u32 has_rect = world.masks[entity] & BLITZ_COMPONENT_RECT_VIEW;
      u32 has_triangle = world.masks[entity] & BLITZ_COMPONENT_TRIANGLE_VIEW;
      u32 has_circle = world.masks[entity] & BLITZ_COMPONENT_CIRCLE_VIEW;
      u32 has_shape = has_rect || has_triangle || has_circle;
      u32 draw_circle =
          has_shape &&
          entity_in_cursor_radius_for_mode(entity, BLITZ_MODE_CIRCLE);
      u32 draw_triangle =
          has_shape &&
          entity_in_cursor_radius_for_mode(entity, BLITZ_MODE_TRIANGLE);
      u32 draw_rect =
          has_shape &&
          entity_in_cursor_radius_for_mode(entity, BLITZ_MODE_RECT);
      if (draw_rect) {
        push_rect_draw(entity);
      } else if (draw_circle) {
        push_circle_draw(entity);
      } else if (draw_triangle) {
        push_triangle_draw(entity);
      } else if (has_rect) {
        push_rect_draw(entity);
      } else if (has_circle) {
        push_circle_draw(entity);
      } else if (has_triangle) {
        push_triangle_draw(entity);
      }
    }
  }

  uniforms.style[2] = (float)shape_command_count;
  shape_command_version += 1u;
  render_list_dirty = 0u;
}

static void screen_to_world(float screen_x, float screen_y, float *world_x,
                            float *world_y) {
  float half_w = uniforms.viewport_camera[0] * 0.5f;
  float half_h = uniforms.viewport_camera[1] * 0.5f;
  *world_x =
      (screen_x - half_w) / uniforms.style[0] + uniforms.viewport_camera[2];
  *world_y =
      (screen_y - half_h) / uniforms.style[0] + uniforms.viewport_camera[3];
}

static int point_in_rect(float world_x, float world_y, u32 entity) {
  Vec2 position = world.positions[entity];
  Vec2 size = world.sizes[entity];
  return world_x >= position.x && world_y >= position.y &&
         world_x <= position.x + size.x && world_y <= position.y + size.y;
}

static float triangle_sign(float px, float py, float ax, float ay, float bx,
                           float by) {
  return (px - bx) * (ay - by) - (ax - bx) * (py - by);
}

static int point_in_triangle(float world_x, float world_y, u32 entity) {
  Vec2 position = world.positions[entity];
  Vec2 size = world.sizes[entity];
  float top_x = position.x + size.x * 0.5f;
  float top_y = position.y;
  float right_x = position.x + size.x;
  float right_y = position.y + size.y;
  float left_x = position.x;
  float left_y = position.y + size.y;

  float d1 = triangle_sign(world_x, world_y, top_x, top_y, right_x, right_y);
  float d2 = triangle_sign(world_x, world_y, right_x, right_y, left_x, left_y);
  float d3 = triangle_sign(world_x, world_y, left_x, left_y, top_x, top_y);
  int has_negative = d1 < 0.0f || d2 < 0.0f || d3 < 0.0f;
  int has_positive = d1 > 0.0f || d2 > 0.0f || d3 > 0.0f;
  return !(has_negative && has_positive);
}

static int point_in_circle(float world_x, float world_y, u32 entity) {
  Vec2 position = world.positions[entity];
  Vec2 size = world.sizes[entity];
  float radius = minf_local(size.x, size.y) * 0.5f;
  float center_x = position.x + size.x * 0.5f;
  float center_y = position.y + size.y * 0.5f;
  float dx = world_x - center_x;
  float dy = world_y - center_y;
  return dx * dx + dy * dy <= radius * radius;
}

static u32 start_dragging_entity(float world_x, float world_y, u32 entity) {
  dragging_entity = entity;
  drag_offset.x = world_x - world.positions[entity].x;
  drag_offset.y = world_y - world.positions[entity].y;
  return 1u;
}

static void pushback_track_entity(u32 entity) {
  if (entity == BLITZ_INVALID_INDEX || world.pushback_active[entity]) {
    return;
  }

  world.pushback_active[entity] = 1u;
  world.pushback_entities[pushback_active_count] = entity;
  pushback_active_count += 1u;
}

static Vec2 pushback_target_for_entity(u32 entity, u32 *in_range) {
  Vec2 base = world.base_positions[entity];
  Vec2 size = world.sizes[entity];
  Vec2 target = base;
  *in_range = 0u;

  if (!pushback_cursor_active || interaction_mode != BLITZ_MODE_PUSHBACK) {
    return target;
  }

  float center_x = base.x + size.x * 0.5f;
  float center_y = base.y + size.y * 0.5f;
  float dx = center_x - pushback_cursor.x;
  float dy = center_y - pushback_cursor.y;
  float distance_sq = dx * dx + dy * dy;
  float radius_sq = pushback_radius * pushback_radius;
  if (distance_sq > radius_sq) {
    return target;
  }

  float distance = sqrtf_local(distance_sq);
  if (distance < 0.001f) {
    dx = 1.0f;
    dy = 0.0f;
    distance = 1.0f;
  }

  float falloff = 1.0f - distance / pushback_radius;
  float max_push = minf_local(BLITZ_PUSHBACK_DISTANCE, pushback_radius * 0.25f);
  float push = falloff * falloff * falloff * max_push;
  target.x = base.x + dx / distance * push;
  target.y = base.y + dy / distance * push;
  *in_range = 1u;
  return target;
}

static u32 tween_entity_to(u32 entity, Vec2 target, float dt) {
  Vec2 position = world.positions[entity];
  float alpha = clampf(dt * BLITZ_PUSHBACK_SPEED, 0.0f, 1.0f);
  float next_x = position.x + (target.x - position.x) * alpha;
  float next_y = position.y + (target.y - position.y) * alpha;
  float dx = target.x - next_x;
  float dy = target.y - next_y;

  if (dx * dx + dy * dy < 0.0001f) {
    next_x = target.x;
    next_y = target.y;
  }

  if (absf_local(next_x - position.x) < 0.0001f &&
      absf_local(next_y - position.y) < 0.0001f) {
    return 0u;
  }

  world.positions[entity].x = next_x;
  world.positions[entity].y = next_y;
  return 1u;
}

static void scan_pushback_cursor_cells(void) {
  if (!pushback_cursor_active || interaction_mode != BLITZ_MODE_PUSHBACK) {
    return;
  }

  i32 min_cell_x =
      clampi(grid_coord(pushback_cursor.x - pushback_radius) - 1, 0,
             (i32)BLITZ_GRID_SIZE - 1);
  i32 min_cell_y =
      clampi(grid_coord(pushback_cursor.y - pushback_radius) - 1, 0,
             (i32)BLITZ_GRID_SIZE - 1);
  i32 max_cell_x =
      clampi(grid_coord(pushback_cursor.x + pushback_radius) + 1, 0,
             (i32)BLITZ_GRID_SIZE - 1);
  i32 max_cell_y =
      clampi(grid_coord(pushback_cursor.y + pushback_radius) + 1, 0,
             (i32)BLITZ_GRID_SIZE - 1);

  for (i32 y = min_cell_y; y <= max_cell_y; y += 1) {
    for (i32 x = min_cell_x; x <= max_cell_x; x += 1) {
      u32 entity = world.grid_heads[grid_index(x, y)];
      while (entity != BLITZ_INVALID_INDEX) {
        u32 in_range = 0u;
        pushback_target_for_entity(entity, &in_range);
        if (in_range) {
          pushback_track_entity(entity);
        }
        entity = world.grid_next[entity];
      }
    }
  }
}

static void update_pushback(float dt) {
  if (dt <= 0.0f) {
    return;
  }

  scan_pushback_cursor_cells();

  u32 i = 0u;
  while (i < pushback_active_count) {
    u32 entity = world.pushback_entities[i];
    u32 in_range = 0u;
    Vec2 target = pushback_target_for_entity(entity, &in_range);
    u32 moved = tween_entity_to(entity, target, dt);
    Vec2 position = world.positions[entity];
    Vec2 base = world.base_positions[entity];
    u32 at_base = absf_local(position.x - base.x) < 0.0001f &&
                  absf_local(position.y - base.y) < 0.0001f;

    if (moved) {
      mark_render_list_dirty();
    }

    if (!in_range && at_base) {
      world.pushback_active[entity] = 0u;
      pushback_active_count -= 1u;
      world.pushback_entities[i] = world.pushback_entities[pushback_active_count];
      continue;
    }

    i += 1u;
  }
}

static void create_demo_world(void) {
  u32 columns = 1000u;
  u32 rows = 1000u;
  float spacing = 24.0f;
  float rect_size = 12.0f;
  float origin = -((float)columns * spacing) * 0.5f;

  for (u32 y = 0u; y < rows; y += 1u) {
    for (u32 x = 0u; x < columns; x += 1u) {
      if (world.entity_count >= BLITZ_MAX_ENTITIES) {
        break;
      }

      u32 entity = ecs_create_entity();
      float px = origin + (float)x * spacing;
      float py = origin + (float)y * spacing;
      float hue_a = (float)(x % 17u) / 17.0f;
      float hue_b = (float)(y % 19u) / 19.0f;

      ecs_set_position(entity, px, py);
      ecs_set_size(entity, rect_size, rect_size);
      ecs_set_rect_view(
          entity, (Color){0.12f + hue_a * 0.55f, 0.25f + hue_b * 0.45f, 0.68f, 1.0f},
          (Color){0.08f, 0.32f, 1.0f, 1.0f}, 1.5f);
      ecs_set_triangle_view(
          entity, (Color){0.12f + hue_a * 0.55f, 0.25f + hue_b * 0.45f, 0.68f, 1.0f},
          (Color){1.0f, 0.86f, 0.1f, 1.0f}, 1.5f);
      ecs_set_circle_view(
          entity, (Color){0.12f + hue_a * 0.55f, 0.25f + hue_b * 0.45f, 0.68f, 1.0f},
          (Color){1.0f, 1.0f, 1.0f, 1.0f}, 1.5f);
      grid_insert(entity);
    }
  }
}

EXPORT("blitz_init")
void blitz_init(void) {
  world.entity_count = 0u;
  shape_command_count = 0u;
  rect_draw_count = 0u;
  triangle_draw_count = 0u;
  circle_draw_count = 0u;
  shape_command_version = 0u;
  render_list_dirty = 1u;
  dragging_entity = BLITZ_INVALID_INDEX;
  drag_offset.x = 0.0f;
  drag_offset.y = 0.0f;
  interaction_mode = BLITZ_MODE_DRAG;
  pushback_active_count = 0u;
  pushback_cursor_active = 0u;
  pushback_cursor.x = 0.0f;
  pushback_cursor.y = 0.0f;
  pushback_radius = BLITZ_PUSHBACK_RADIUS_DEFAULT;
  last_time_seconds = 0.0f;
  grid_clear();

  uniforms.viewport_camera[0] = 1.0f;
  uniforms.viewport_camera[1] = 1.0f;
  uniforms.viewport_camera[2] = 0.0f;
  uniforms.viewport_camera[3] = 0.0f;
  uniforms.style[0] = 1.0f;
  uniforms.style[1] = 0.0f;
  uniforms.style[2] = 0.0f;
  uniforms.style[3] = 0.0f;

  uniforms.background_color[0] = 0.058f;
  uniforms.background_color[1] = 0.075f;
  uniforms.background_color[2] = 0.092f;
  uniforms.background_color[3] = 1.0f;

  create_demo_world();
  extract_render_draws();
}

EXPORT("blitz_resize")
void blitz_resize(float width, float height) {
  float next_width = width > 1.0f ? width : 1.0f;
  float next_height = height > 1.0f ? height : 1.0f;
  if (uniforms.viewport_camera[0] != next_width ||
      uniforms.viewport_camera[1] != next_height) {
    uniforms.viewport_camera[0] = next_width;
    uniforms.viewport_camera[1] = next_height;
    mark_render_list_dirty();
  }
}

EXPORT("blitz_set_camera")
void blitz_set_camera(float x, float y, float zoom) {
  uniforms.viewport_camera[2] = x;
  uniforms.viewport_camera[3] = y;
  uniforms.style[0] = clampf(zoom, 0.15f, 12.0f);
  mark_render_list_dirty();
}

EXPORT("blitz_pan")
void blitz_pan(float dx_pixels, float dy_pixels) {
  uniforms.viewport_camera[2] -= dx_pixels / uniforms.style[0];
  uniforms.viewport_camera[3] -= dy_pixels / uniforms.style[0];
  mark_render_list_dirty();
}

EXPORT("blitz_zoom_at")
void blitz_zoom_at(float screen_x, float screen_y, float zoom_delta) {
  float before_x = 0.0f;
  float before_y = 0.0f;
  float after_x = 0.0f;
  float after_y = 0.0f;

  screen_to_world(screen_x, screen_y, &before_x, &before_y);
  uniforms.style[0] = clampf(uniforms.style[0] * zoom_delta, 0.15f, 12.0f);
  screen_to_world(screen_x, screen_y, &after_x, &after_y);

  uniforms.viewport_camera[2] += before_x - after_x;
  uniforms.viewport_camera[3] += before_y - after_y;
  mark_render_list_dirty();
}

EXPORT("blitz_pointer_down")
u32 blitz_pointer_down(float screen_x, float screen_y) {
  float world_x = 0.0f;
  float world_y = 0.0f;
  screen_to_world(screen_x, screen_y, &world_x, &world_y);
  extract_render_draws();

  for (u32 i = shape_command_count; i > 0u; i -= 1u) {
    ShapeCommand command = shape_commands[i - 1u];
    u32 entity = command.entity;
    u32 hit = 0u;
    if (command.shape_kind == BLITZ_SHAPE_CIRCLE) {
      hit = (u32)point_in_circle(world_x, world_y, entity);
    } else if (command.shape_kind == BLITZ_SHAPE_TRIANGLE) {
      hit = (u32)point_in_triangle(world_x, world_y, entity);
    } else {
      hit = (u32)point_in_rect(world_x, world_y, entity);
    }
    if (hit) {
      return start_dragging_entity(world_x, world_y, entity);
    }
  }

  dragging_entity = BLITZ_INVALID_INDEX;
  return 0u;
}

EXPORT("blitz_pointer_move")
void blitz_pointer_move(float screen_x, float screen_y) {
  if (dragging_entity == BLITZ_INVALID_INDEX) {
    return;
  }

  float world_x = 0.0f;
  float world_y = 0.0f;
  screen_to_world(screen_x, screen_y, &world_x, &world_y);
  world.positions[dragging_entity].x = world_x - drag_offset.x;
  world.positions[dragging_entity].y = world_y - drag_offset.y;
  set_entity_base_position(dragging_entity, world.positions[dragging_entity].x,
                           world.positions[dragging_entity].y);
}

EXPORT("blitz_pointer_up")
void blitz_pointer_up(void) {
  dragging_entity = BLITZ_INVALID_INDEX;
}

EXPORT("blitz_set_interaction_mode")
void blitz_set_interaction_mode(u32 mode) {
  u32 previous_mode = interaction_mode;
  interaction_mode =
      mode == BLITZ_MODE_PUSHBACK || mode == BLITZ_MODE_TRIANGLE ||
              mode == BLITZ_MODE_CIRCLE || mode == BLITZ_MODE_RECT
          ? mode
          : BLITZ_MODE_DRAG;
  dragging_entity = BLITZ_INVALID_INDEX;
  if (interaction_mode == BLITZ_MODE_DRAG) {
    pushback_cursor_active = 0u;
  }
  if (previous_mode == BLITZ_MODE_RECT || previous_mode == BLITZ_MODE_TRIANGLE ||
      previous_mode == BLITZ_MODE_CIRCLE || interaction_mode == BLITZ_MODE_RECT ||
      interaction_mode == BLITZ_MODE_TRIANGLE || interaction_mode == BLITZ_MODE_CIRCLE) {
    mark_render_list_dirty();
  }
}

EXPORT("blitz_interaction_move")
void blitz_interaction_move(float screen_x, float screen_y) {
  screen_to_world(screen_x, screen_y, &pushback_cursor.x, &pushback_cursor.y);
  pushback_cursor_active = 1u;
  if (interaction_mode == BLITZ_MODE_RECT || interaction_mode == BLITZ_MODE_TRIANGLE ||
      interaction_mode == BLITZ_MODE_CIRCLE) {
    mark_render_list_dirty();
  }
}

EXPORT("blitz_interaction_click")
void blitz_interaction_click(float screen_x, float screen_y) {
  screen_to_world(screen_x, screen_y, &pushback_cursor.x, &pushback_cursor.y);
  pushback_cursor_active = 1u;
  replace_cursor_radius_with_mode_shape();
}

EXPORT("blitz_interaction_leave")
void blitz_interaction_leave(void) {
  u32 was_shape_active =
      (interaction_mode == BLITZ_MODE_RECT || interaction_mode == BLITZ_MODE_TRIANGLE ||
       interaction_mode == BLITZ_MODE_CIRCLE) &&
      pushback_cursor_active;
  pushback_cursor_active = 0u;
  if (was_shape_active) {
    mark_render_list_dirty();
  }
}

EXPORT("blitz_adjust_interaction_radius")
void blitz_adjust_interaction_radius(float delta_steps) {
  pushback_radius =
      clampf(pushback_radius + delta_steps * BLITZ_PUSHBACK_RADIUS_STEP,
             BLITZ_PUSHBACK_RADIUS_MIN, BLITZ_PUSHBACK_RADIUS_MAX);
  if (interaction_mode == BLITZ_MODE_RECT || interaction_mode == BLITZ_MODE_TRIANGLE ||
      interaction_mode == BLITZ_MODE_CIRCLE) {
    mark_render_list_dirty();
  }
}

EXPORT("blitz_uniform_ptr")
u32 blitz_uniform_ptr(void) {
  return (u32)&uniforms;
}

EXPORT("blitz_uniform_f32_count")
u32 blitz_uniform_f32_count(void) {
  return sizeof(BlitzUniforms) / sizeof(float);
}

EXPORT("blitz_shape_command_ptr")
u32 blitz_shape_command_ptr(void) {
  extract_render_draws();
  return (u32)&shape_commands[0];
}

EXPORT("blitz_shape_command_u32_count")
u32 blitz_shape_command_u32_count(void) {
  return sizeof(ShapeCommand) / sizeof(u32);
}

EXPORT("blitz_shape_command_count")
u32 blitz_shape_command_count(void) {
  return shape_command_count;
}

EXPORT("blitz_shape_command_version")
u32 blitz_shape_command_version(void) {
  return shape_command_version;
}

EXPORT("blitz_rect_draw_ptr")
u32 blitz_rect_draw_ptr(void) {
  extract_render_draws();
  return (u32)&rect_draws[0];
}

EXPORT("blitz_rect_draw_f32_count")
u32 blitz_rect_draw_f32_count(void) {
  return sizeof(RectDraw) / sizeof(float);
}

EXPORT("blitz_rect_draw_count")
u32 blitz_rect_draw_count(void) {
  return rect_draw_count;
}

EXPORT("blitz_triangle_draw_ptr")
u32 blitz_triangle_draw_ptr(void) {
  extract_render_draws();
  return (u32)&triangle_draws[0];
}

EXPORT("blitz_triangle_draw_f32_count")
u32 blitz_triangle_draw_f32_count(void) {
  return sizeof(TriangleDraw) / sizeof(float);
}

EXPORT("blitz_triangle_draw_count")
u32 blitz_triangle_draw_count(void) {
  return triangle_draw_count;
}

EXPORT("blitz_circle_draw_ptr")
u32 blitz_circle_draw_ptr(void) {
  extract_render_draws();
  return (u32)&circle_draws[0];
}

EXPORT("blitz_circle_draw_f32_count")
u32 blitz_circle_draw_f32_count(void) {
  return sizeof(CircleDraw) / sizeof(float);
}

EXPORT("blitz_circle_draw_count")
u32 blitz_circle_draw_count(void) {
  return circle_draw_count;
}

EXPORT("blitz_entity_count")
u32 blitz_entity_count(void) {
  return world.entity_count;
}

EXPORT("blitz_render_chunk_rects")
u32 blitz_render_chunk_rects(void) {
  return BLITZ_RENDER_CHUNK_RECTS;
}

EXPORT("blitz_render_max_shapes")
u32 blitz_render_max_shapes(void) {
  return BLITZ_MAX_RECT_DRAWS;
}

EXPORT("blitz_time")
void blitz_time(float seconds) {
  float dt = seconds - last_time_seconds;
  last_time_seconds = seconds;
  dt = clampf(dt, 0.0f, 0.05f);
  uniforms.style[1] = seconds;
  update_pushback(dt);
}
