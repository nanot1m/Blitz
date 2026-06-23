typedef unsigned int u32;

#include "font.generated.h"

#define EXPORT(name) __attribute__((export_name(name)))

#define BLITZ_MAX_ENTITIES 2000000u
#define BLITZ_RENDER_CHUNK_RECTS 250000u
#define BLITZ_RENDER_CHUNKS 4u
#define BLITZ_MAX_RECT_DRAWS (BLITZ_RENDER_CHUNK_RECTS * BLITZ_RENDER_CHUNKS)
#define BLITZ_MAX_TEXT_DRAWS 262144u
#define BLITZ_MAX_DYN_RECTS 2000000u
#define BLITZ_MAX_DYN_COMMANDS (BLITZ_MAX_TEXT_DRAWS + BLITZ_MAX_DYN_RECTS)
#define BLITZ_MIN_TEXT_PX 3.0f

#define BLITZ_INVALID_INDEX 0xffffffffu
// High bit of a command's order word: set while the command's entity is being
// dragged, so the shader translates it by the drag offset instead of rebuilding.
#define BLITZ_DRAG_FLAG 0x80000000u

#define BLITZ_COMPONENT_POSITION 1u
#define BLITZ_COMPONENT_SIZE 2u
#define BLITZ_COMPONENT_RECT_VIEW 4u
#define BLITZ_COMPONENT_TRIANGLE_VIEW 8u
#define BLITZ_COMPONENT_CIRCLE_VIEW 16u
#define BLITZ_COMPONENT_TEXT_VIEW 32u
#define BLITZ_COMPONENT_SELECTABLE 64u

#define BLITZ_SHAPE_RECT 0u
#define BLITZ_SHAPE_TRIANGLE 1u
#define BLITZ_SHAPE_CIRCLE 2u
#define BLITZ_SHAPE_TEXT 3u

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

typedef struct TextView {
  const char *text;
  Color color;
  float font_size;
  float origin_x;
  float baseline_offset;
} TextView;

typedef struct BlitzUniforms {
  float viewport_camera[4];
  float style[4];
  float background_color[4];
  float font_params[4];
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

typedef struct TextDraw {
  float rect[4];
  float uv_rect[4];
  float color[4];
} TextDraw;

typedef struct World {
  u32 entity_count;
  u32 draw_order_count;
  u32 draw_order[BLITZ_MAX_ENTITIES];
  u32 draw_order_scratch[BLITZ_MAX_ENTITIES];
  u32 selected[BLITZ_MAX_ENTITIES];
  u32 masks[BLITZ_MAX_ENTITIES];
  Vec2 positions[BLITZ_MAX_ENTITIES];
  Vec2 sizes[BLITZ_MAX_ENTITIES];
  RectView rect_views[BLITZ_MAX_ENTITIES];
  TriangleView triangle_views[BLITZ_MAX_ENTITIES];
  CircleView circle_views[BLITZ_MAX_ENTITIES];
  TextView text_views[BLITZ_MAX_ENTITIES];
} World;

static BlitzUniforms uniforms;
static ShapeCommand shape_commands[BLITZ_MAX_RECT_DRAWS];
static RectDraw rect_draws[BLITZ_MAX_RECT_DRAWS];
static TriangleDraw triangle_draws[BLITZ_MAX_RECT_DRAWS];
static CircleDraw circle_draws[BLITZ_MAX_RECT_DRAWS];
static TextDraw text_draws[BLITZ_MAX_TEXT_DRAWS];
static ShapeCommand dyn_commands[BLITZ_MAX_DYN_COMMANDS];
static RectDraw dyn_rects[BLITZ_MAX_DYN_RECTS];
static World world;
static u32 shape_command_count;
static u32 rect_draw_count;
static u32 triangle_draw_count;
static u32 circle_draw_count;
static u32 text_draw_count;
static u32 dyn_command_count;
static u32 dyn_rect_count;
static u32 shape_command_version;
static u32 dyn_version;
static u32 static_dirty;
static u32 dynamic_dirty;
static u32 dragging_selection;
static u32 marquee_active;
static u32 marquee_additive;
static u32 marquee_candidate;
static u32 selected_count;
static u32 spawn_count;
static Vec2 drag_last_world;
static Vec2 drag_offset;
static u32 drag_active;
// Selection state captured when a marquee starts, so each marquee move can
// recompute live selection as base ∪ (entities inside the current box).
static u32 marquee_base_selected[BLITZ_MAX_ENTITIES];
static Vec2 marquee_start;
static Vec2 marquee_end;
static u32 camera_fit_initialized;

static float clampf(float value, float min_value, float max_value) {
  if (value < min_value) {
    return min_value;
  }
  if (value > max_value) {
    return max_value;
  }
  return value;
}

static float minf_local(float a, float b) {
  return a < b ? a : b;
}

static void mark_render_list_dirty(void) {
  static_dirty = 1u;
  dynamic_dirty = 1u;
}

static void mark_dynamic_dirty(void) {
  dynamic_dirty = 1u;
}

static u32 ecs_create_entity(void) {
  u32 entity = world.entity_count;
  if (entity < BLITZ_MAX_ENTITIES) {
    world.entity_count += 1u;
    world.draw_order[world.draw_order_count] = entity;
    world.draw_order_count += 1u;
    world.selected[entity] = 0u;
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

static void ecs_set_text_view(u32 entity, const char *text, Color color,
                              float font_size, float origin_x,
                              float baseline_offset) {
  if (entity == BLITZ_INVALID_INDEX) {
    return;
  }
  world.text_views[entity].text = text;
  world.text_views[entity].color = color;
  world.text_views[entity].font_size = font_size;
  world.text_views[entity].origin_x = origin_x;
  world.text_views[entity].baseline_offset = baseline_offset;
  world.masks[entity] |= BLITZ_COMPONENT_TEXT_VIEW;
}

static void clear_selection(void) {
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    world.selected[entity] = 0u;
  }
  selected_count = 0u;
  mark_dynamic_dirty();
}

static void select_only(u32 entity) {
  clear_selection();
  if (entity != BLITZ_INVALID_INDEX) {
    world.selected[entity] = 1u;
    selected_count = 1u;
  }
}

static void toggle_selection(u32 entity) {
  if (world.selected[entity]) {
    world.selected[entity] = 0u;
    selected_count -= 1u;
  } else {
    world.selected[entity] = 1u;
    selected_count += 1u;
  }
  mark_dynamic_dirty();
}

static void snapshot_selection_base(void) {
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    marquee_base_selected[entity] = world.selected[entity];
  }
}

static void marquee_apply_live(void) {
  float min_x = minf_local(marquee_start.x, marquee_end.x);
  float min_y = minf_local(marquee_start.y, marquee_end.y);
  float max_x = marquee_start.x > marquee_end.x ? marquee_start.x : marquee_end.x;
  float max_y = marquee_start.y > marquee_end.y ? marquee_start.y : marquee_end.y;
  u32 count = 0u;
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    u32 sel = marquee_base_selected[entity];
    if (!sel && (world.masks[entity] & BLITZ_COMPONENT_SELECTABLE)) {
      Vec2 position = world.positions[entity];
      Vec2 size = world.sizes[entity];
      if (position.x >= min_x && position.y >= min_y &&
          position.x + size.x <= max_x && position.y + size.y <= max_y) {
        sel = 1u;
      }
    }
    world.selected[entity] = sel;
    count += sel;
  }
  selected_count = count;
}

static void reorder_selection(u32 selected_first) {
  u32 output = 0u;
  for (u32 pass = 0u; pass < 2u; pass += 1u) {
    u32 want_selected = selected_first ? pass == 0u : pass == 1u;
    for (u32 i = 0u; i < world.draw_order_count; i += 1u) {
      u32 entity = world.draw_order[i];
      if (world.selected[entity] == want_selected) {
        world.draw_order_scratch[output] = entity;
        output += 1u;
      }
    }
  }
  for (u32 i = 0u; i < world.draw_order_count; i += 1u) {
    world.draw_order[i] = world.draw_order_scratch[i];
  }
  mark_render_list_dirty();
}

static void push_rect_draw(u32 entity, u32 order) {
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
  shape_commands[shape_command_count]._pad0 = order;
  rect_draw_count += 1u;
  shape_command_count += 1u;
}

static void push_selection_draw(u32 entity, u32 order) {
  if (dyn_command_count >= BLITZ_MAX_DYN_COMMANDS ||
      dyn_rect_count >= BLITZ_MAX_DYN_RECTS) {
    return;
  }

  Vec2 position = world.positions[entity];
  Vec2 size = world.sizes[entity];
  float inset = 3.0f / uniforms.style[0];
  RectDraw *draw = &dyn_rects[dyn_rect_count];
  draw->rect[0] = position.x - inset;
  draw->rect[1] = position.y - inset;
  draw->rect[2] = size.x + inset * 2.0f;
  draw->rect[3] = size.y + inset * 2.0f;
  draw->fill_color[0] = 0.0f;
  draw->fill_color[1] = 0.0f;
  draw->fill_color[2] = 0.0f;
  draw->fill_color[3] = 0.0f;
  draw->stroke_color[0] = 0.12f;
  draw->stroke_color[1] = 0.48f;
  draw->stroke_color[2] = 1.0f;
  draw->stroke_color[3] = 1.0f;
  draw->stroke_width_pad[0] = 2.0f / uniforms.style[0];
  draw->stroke_width_pad[1] = 0.0f;
  draw->stroke_width_pad[2] = 0.0f;
  draw->stroke_width_pad[3] = 0.0f;

  dyn_commands[dyn_command_count].shape_kind = BLITZ_SHAPE_RECT;
  dyn_commands[dyn_command_count].shape_index = dyn_rect_count;
  dyn_commands[dyn_command_count].entity = BLITZ_INVALID_INDEX;
  dyn_commands[dyn_command_count]._pad0 = order;
  dyn_rect_count += 1u;
  dyn_command_count += 1u;
}

static void push_marquee_draw(u32 order) {
  if (!marquee_active || dyn_command_count >= BLITZ_MAX_DYN_COMMANDS ||
      dyn_rect_count >= BLITZ_MAX_DYN_RECTS) {
    return;
  }

  float min_x = minf_local(marquee_start.x, marquee_end.x);
  float min_y = minf_local(marquee_start.y, marquee_end.y);
  float max_x = marquee_start.x > marquee_end.x ? marquee_start.x : marquee_end.x;
  float max_y = marquee_start.y > marquee_end.y ? marquee_start.y : marquee_end.y;
  RectDraw *draw = &dyn_rects[dyn_rect_count];
  draw->rect[0] = min_x;
  draw->rect[1] = min_y;
  draw->rect[2] = max_x - min_x;
  draw->rect[3] = max_y - min_y;
  draw->fill_color[0] = 0.12f;
  draw->fill_color[1] = 0.48f;
  draw->fill_color[2] = 1.0f;
  draw->fill_color[3] = 0.10f;
  draw->stroke_color[0] = 0.12f;
  draw->stroke_color[1] = 0.48f;
  draw->stroke_color[2] = 1.0f;
  draw->stroke_color[3] = 0.95f;
  draw->stroke_width_pad[0] = 1.0f / uniforms.style[0];
  draw->stroke_width_pad[1] = 0.0f;
  draw->stroke_width_pad[2] = 0.0f;
  draw->stroke_width_pad[3] = 0.0f;

  dyn_commands[dyn_command_count].shape_kind = BLITZ_SHAPE_RECT;
  dyn_commands[dyn_command_count].shape_index = dyn_rect_count;
  dyn_commands[dyn_command_count].entity = BLITZ_INVALID_INDEX;
  dyn_commands[dyn_command_count]._pad0 = order;
  dyn_rect_count += 1u;
  dyn_command_count += 1u;
}

static void push_triangle_draw(u32 entity, u32 order) {
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
  shape_commands[shape_command_count]._pad0 = order;
  triangle_draw_count += 1u;
  shape_command_count += 1u;
}

static void push_circle_draw(u32 entity, u32 order) {
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
  shape_commands[shape_command_count]._pad0 = order;
  circle_draw_count += 1u;
  shape_command_count += 1u;
}

static const FontGlyphMetric *font_glyph_metric(u32 codepoint) {
  u32 low = 0u;
  u32 high = BLITZ_FONT_GLYPH_COUNT;
  while (low < high) {
    u32 middle = low + (high - low) / 2u;
    u32 candidate = blitz_font_glyphs[middle].codepoint;
    if (candidate < codepoint) {
      low = middle + 1u;
    } else {
      high = middle;
    }
  }
  if (low < BLITZ_FONT_GLYPH_COUNT &&
      blitz_font_glyphs[low].codepoint == codepoint) {
    return &blitz_font_glyphs[low];
  }
  if (codepoint != BLITZ_FONT_REPLACEMENT_CODEPOINT) {
    return font_glyph_metric(BLITZ_FONT_REPLACEMENT_CODEPOINT);
  }
  return &blitz_font_glyphs[0];
}

static u32 utf8_continuation(unsigned char value) {
  return (value & 0xc0u) == 0x80u;
}

static u32 utf8_next(const char **cursor) {
  const unsigned char *text = (const unsigned char *)*cursor;
  u32 first = text[0];
  if (first < 0x80u) {
    *cursor += 1;
    return first;
  }

  u32 codepoint = BLITZ_FONT_REPLACEMENT_CODEPOINT;
  u32 length = 1u;
  if (first >= 0xc2u && first <= 0xdfu && utf8_continuation(text[1])) {
    codepoint = ((first & 0x1fu) << 6u) | (text[1] & 0x3fu);
    length = 2u;
  } else if (first >= 0xe0u && first <= 0xefu &&
             utf8_continuation(text[1]) && utf8_continuation(text[2])) {
    u32 candidate = ((first & 0x0fu) << 12u) |
                    ((text[1] & 0x3fu) << 6u) | (text[2] & 0x3fu);
    if (candidate >= 0x800u &&
        !(candidate >= 0xd800u && candidate <= 0xdfffu)) {
      codepoint = candidate;
      length = 3u;
    }
  } else if (first >= 0xf0u && first <= 0xf4u &&
             utf8_continuation(text[1]) && utf8_continuation(text[2]) &&
             utf8_continuation(text[3])) {
    u32 candidate = ((first & 0x07u) << 18u) |
                    ((text[1] & 0x3fu) << 12u) |
                    ((text[2] & 0x3fu) << 6u) | (text[3] & 0x3fu);
    if (candidate >= 0x10000u && candidate <= 0x10ffffu) {
      codepoint = candidate;
      length = 4u;
    }
  }

  *cursor += length;
  return codepoint;
}

static float font_text_width(const char *text, float font_size) {
  float width = 0.0f;
  while (*text != '\0') {
    const FontGlyphMetric *glyph = font_glyph_metric(utf8_next(&text));
    width += glyph->advance * font_size;
  }
  return width;
}

static void push_text_draws(u32 entity, u32 order) {
  TextView view = world.text_views[entity];
  Vec2 position = world.positions[entity];
  const char *text = view.text;
  float pen_x = position.x + view.origin_x;
  float baseline_y = position.y + view.baseline_offset;
  while (*text != '\0') {
    u32 codepoint = utf8_next(&text);
    const FontGlyphMetric *glyph = font_glyph_metric(codepoint);

    if (codepoint != (u32)' ' &&
        dyn_command_count < BLITZ_MAX_DYN_COMMANDS &&
        text_draw_count < BLITZ_MAX_TEXT_DRAWS) {
      TextDraw *draw = &text_draws[text_draw_count];
      draw->rect[0] = pen_x + glyph->plane_left * view.font_size;
      draw->rect[1] = baseline_y + glyph->plane_top * view.font_size;
      draw->rect[2] = glyph->plane_width * view.font_size;
      draw->rect[3] = glyph->plane_height * view.font_size;
      draw->uv_rect[0] = glyph->uv_left;
      draw->uv_rect[1] = glyph->uv_top;
      draw->uv_rect[2] = glyph->uv_right;
      draw->uv_rect[3] = glyph->uv_bottom;
      draw->color[0] = view.color.r;
      draw->color[1] = view.color.g;
      draw->color[2] = view.color.b;
      draw->color[3] = view.color.a;

      dyn_commands[dyn_command_count].shape_kind = BLITZ_SHAPE_TEXT;
      dyn_commands[dyn_command_count].shape_index = text_draw_count;
      dyn_commands[dyn_command_count].entity = entity;
      dyn_commands[dyn_command_count]._pad0 = order;
      text_draw_count += 1u;
      dyn_command_count += 1u;
    }

    pen_x += glyph->advance * view.font_size;
  }
}

static int text_visible_in_view(u32 entity, float scale, float min_x,
                                float min_y, float max_x, float max_y) {
  Vec2 position = world.positions[entity];
  Vec2 size = world.sizes[entity];
  if (position.x + size.x < min_x || position.x > max_x ||
      position.y + size.y < min_y || position.y > max_y) {
    return 0;
  }
  // Cull by line height: text below a few pixels tall is unreadable.
  if (size.y * scale < BLITZ_MIN_TEXT_PX) {
    return 0;
  }
  return 1;
}

// Full unculled shape stream (rects/triangles/circles), rebuilt only on
// structural change. The GPU compute pass culls it against the viewport.
static void extract_static_shapes(void) {
  if (!static_dirty) {
    return;
  }

  shape_command_count = 0u;
  rect_draw_count = 0u;
  triangle_draw_count = 0u;
  circle_draw_count = 0u;
  u32 base_required = BLITZ_COMPONENT_POSITION | BLITZ_COMPONENT_SIZE;

  for (u32 order_index = 0u; order_index < world.draw_order_count;
       order_index += 1u) {
    u32 entity = world.draw_order[order_index];
    if ((world.masks[entity] & base_required) != base_required) {
      continue;
    }
    u32 order = order_index;
    if (drag_active && world.selected[entity]) {
      order |= BLITZ_DRAG_FLAG;
    }
    if (world.masks[entity] & BLITZ_COMPONENT_RECT_VIEW) {
      push_rect_draw(entity, order);
    } else if (world.masks[entity] & BLITZ_COMPONENT_CIRCLE_VIEW) {
      push_circle_draw(entity, order);
    } else if (world.masks[entity] & BLITZ_COMPONENT_TRIANGLE_VIEW) {
      push_triangle_draw(entity, order);
    }
  }

  uniforms.style[2] = (float)shape_command_count;
  uniforms.style[3] = (float)world.draw_order_count;
  shape_command_version += 1u;
  static_dirty = 0u;
}

// Per-frame stream: visible text glyphs plus selection/marquee overlays.
// Overlays use an order key above every shape so they draw on top.
static void extract_dynamic(void) {
  if (!dynamic_dirty) {
    return;
  }

  dyn_command_count = 0u;
  dyn_rect_count = 0u;
  text_draw_count = 0u;

  float scale = uniforms.style[0];
  float half_w = uniforms.viewport_camera[0] * 0.5f / scale;
  float half_h = uniforms.viewport_camera[1] * 0.5f / scale;
  float view_min_x = uniforms.viewport_camera[2] - half_w;
  float view_min_y = uniforms.viewport_camera[3] - half_h;
  float view_max_x = uniforms.viewport_camera[2] + half_w;
  float view_max_y = uniforms.viewport_camera[3] + half_h;
  u32 base_required = BLITZ_COMPONENT_POSITION | BLITZ_COMPONENT_SIZE;

  for (u32 order_index = 0u; order_index < world.draw_order_count;
       order_index += 1u) {
    u32 entity = world.draw_order[order_index];
    if ((world.masks[entity] & base_required) != base_required) {
      continue;
    }
    if (!(world.masks[entity] & BLITZ_COMPONENT_TEXT_VIEW)) {
      continue;
    }
    if (text_visible_in_view(entity, scale, view_min_x, view_min_y, view_max_x,
                             view_max_y)) {
      u32 order = order_index;
      if (drag_active && world.selected[entity]) {
        order |= BLITZ_DRAG_FLAG;
      }
      push_text_draws(entity, order);
    }
  }

  u32 overlay_order = world.draw_order_count + 1u;
  if (drag_active) {
    overlay_order |= BLITZ_DRAG_FLAG;
  }
  for (u32 i = 0u; i < world.draw_order_count; i += 1u) {
    u32 entity = world.draw_order[i];
    if (!world.selected[entity]) {
      continue;
    }
    // Only draw outlines for selected shapes that are actually visible, so
    // select-all stays bounded by the screen rather than the dyn buffer cap.
    Vec2 position = world.positions[entity];
    Vec2 size = world.sizes[entity];
    if (position.x + size.x < view_min_x || position.x > view_max_x ||
        position.y + size.y < view_min_y || position.y > view_max_y) {
      continue;
    }
    if (size.x * scale < 1.0f && size.y * scale < 1.0f) {
      continue;
    }
    push_selection_draw(entity, overlay_order);
  }
  push_marquee_draw(world.draw_order_count + 2u);
  uniforms.style[3] = (float)world.draw_order_count;
  dyn_version += 1u;
  dynamic_dirty = 0u;
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

// Translates demo-slide coordinates so create_demo_world can be instanced
// at grid offsets without touching its hardcoded layout.
static float slide_origin_x = 0.0f;
static float slide_origin_y = 0.0f;

static u32 create_slide_rect(float x, float y, float width, float height,
                             Color fill, Color stroke, float stroke_width) {
  u32 entity = ecs_create_entity();
  ecs_set_position(entity, slide_origin_x + x, slide_origin_y + y);
  ecs_set_size(entity, width, height);
  ecs_set_rect_view(entity, fill, stroke, stroke_width);
  world.masks[entity] |= BLITZ_COMPONENT_SELECTABLE;
  return entity;
}

static void create_slide_text(const char *text, float x, float baseline_y,
                              float font_size, Color color) {
  float padding = 4.0f;
  float top = baseline_y - BLITZ_FONT_ASCENDER * font_size;
  float width = font_text_width(text, font_size);
  float height = BLITZ_FONT_LINE_HEIGHT * font_size;
  u32 entity = ecs_create_entity();
  ecs_set_position(entity, slide_origin_x + x - padding,
                   slide_origin_y + top - padding);
  ecs_set_size(entity, width + padding * 2.0f, height + padding * 2.0f);
  ecs_set_text_view(entity, text, color, font_size, padding,
                    padding + BLITZ_FONT_ASCENDER * font_size);
  world.masks[entity] |= BLITZ_COMPONENT_SELECTABLE;
}

static u32 create_user_rect(float x, float y) {
  u32 entity = ecs_create_entity();
  ecs_set_position(entity, x - 90.0f, y - 55.0f);
  ecs_set_size(entity, 180.0f, 110.0f);
  ecs_set_rect_view(entity, (Color){0.86f, 0.92f, 1.0f, 1.0f},
                    (Color){0.20f, 0.43f, 0.85f, 1.0f}, 2.0f);
  world.masks[entity] |= BLITZ_COMPONENT_SELECTABLE;
  return entity;
}

static u32 create_user_circle(float x, float y) {
  u32 entity = ecs_create_entity();
  ecs_set_position(entity, x - 65.0f, y - 65.0f);
  ecs_set_size(entity, 130.0f, 130.0f);
  ecs_set_circle_view(entity, (Color){0.86f, 0.97f, 0.93f, 1.0f},
                      (Color){0.08f, 0.58f, 0.46f, 1.0f}, 2.0f);
  world.masks[entity] |= BLITZ_COMPONENT_SELECTABLE;
  return entity;
}

static u32 create_user_triangle(float x, float y) {
  u32 entity = ecs_create_entity();
  ecs_set_position(entity, x - 75.0f, y - 65.0f);
  ecs_set_size(entity, 150.0f, 130.0f);
  ecs_set_triangle_view(entity, (Color){1.0f, 0.92f, 0.85f, 1.0f},
                        (Color){0.91f, 0.31f, 0.27f, 1.0f}, 2.0f);
  world.masks[entity] |= BLITZ_COMPONENT_SELECTABLE;
  return entity;
}

static u32 create_user_text(float x, float y) {
  const char *text = "New text";
  float font_size = 30.0f;
  float padding = 4.0f;
  float width = font_text_width(text, font_size);
  float height = BLITZ_FONT_LINE_HEIGHT * font_size;
  u32 entity = ecs_create_entity();
  ecs_set_position(entity, x - width * 0.5f - padding,
                   y - height * 0.5f - padding);
  ecs_set_size(entity, width + padding * 2.0f, height + padding * 2.0f);
  ecs_set_text_view(entity, text, (Color){0.08f, 0.10f, 0.13f, 1.0f},
                    font_size, padding,
                    padding + BLITZ_FONT_ASCENDER * font_size);
  world.masks[entity] |= BLITZ_COMPONENT_SELECTABLE;
  return entity;
}

static void create_demo_world(void) {
  Color transparent = {0.0f, 0.0f, 0.0f, 0.0f};

  create_slide_rect(-560.0f, -315.0f, 1120.0f, 630.0f,
                    (Color){0.965f, 0.972f, 0.984f, 1.0f}, transparent, 0.0f);
  create_slide_rect(-560.0f, -315.0f, 300.0f, 630.0f,
                    (Color){0.075f, 0.095f, 0.13f, 1.0f}, transparent, 0.0f);
  create_slide_rect(-560.0f, -315.0f, 300.0f, 9.0f,
                    (Color){0.11f, 0.72f, 0.61f, 1.0f}, transparent, 0.0f);
  create_slide_rect(-260.0f, -315.0f, 820.0f, 9.0f,
                    (Color){0.91f, 0.31f, 0.27f, 1.0f}, transparent, 0.0f);

  create_slide_rect(-500.0f, 20.0f, 190.0f, 2.0f,
                    (Color){0.23f, 0.28f, 0.35f, 1.0f}, transparent, 0.0f);
  create_slide_rect(-500.0f, 74.0f, 150.0f, 2.0f,
                    (Color){0.23f, 0.28f, 0.35f, 1.0f}, transparent, 0.0f);
  create_slide_rect(-500.0f, 128.0f, 110.0f, 2.0f,
                    (Color){0.23f, 0.28f, 0.35f, 1.0f}, transparent, 0.0f);

  create_slide_rect(-205.0f, 15.0f, 338.0f, 100.0f,
                    (Color){1.0f, 1.0f, 1.0f, 1.0f},
                    (Color){0.86f, 0.88f, 0.91f, 1.0f}, 1.0f);
  create_slide_rect(161.0f, 15.0f, 338.0f, 100.0f,
                    (Color){1.0f, 1.0f, 1.0f, 1.0f},
                    (Color){0.86f, 0.88f, 0.91f, 1.0f}, 1.0f);

  create_slide_rect(-205.0f, 145.0f, 704.0f, 154.0f,
                    (Color){0.925f, 0.94f, 0.96f, 1.0f}, transparent, 0.0f);
  create_slide_rect(-42.0f, 188.0f, 480.0f, 13.0f,
                    (Color){0.86f, 0.88f, 0.91f, 1.0f}, transparent, 0.0f);
  create_slide_rect(-42.0f, 188.0f, 398.0f, 13.0f,
                    (Color){0.91f, 0.31f, 0.27f, 1.0f}, transparent, 0.0f);
  create_slide_rect(-42.0f, 230.0f, 480.0f, 13.0f,
                    (Color){0.86f, 0.88f, 0.91f, 1.0f}, transparent, 0.0f);
  create_slide_rect(-42.0f, 230.0f, 318.0f, 13.0f,
                    (Color){0.11f, 0.72f, 0.61f, 1.0f}, transparent, 0.0f);
  create_slide_rect(-42.0f, 272.0f, 480.0f, 13.0f,
                    (Color){0.86f, 0.88f, 0.91f, 1.0f}, transparent, 0.0f);
  create_slide_rect(-42.0f, 272.0f, 226.0f, 13.0f,
                    (Color){0.27f, 0.43f, 0.89f, 1.0f}, transparent, 0.0f);

  create_slide_text("BLITZ", -500.0f, -222.0f, 52.0f,
                    (Color){1.0f, 1.0f, 1.0f, 1.0f});
  create_slide_text("GPU-NATIVE CANVAS", -500.0f, -172.0f, 16.0f,
                    (Color){0.55f, 0.90f, 0.82f, 1.0f});
  create_slide_text("One draw call.", -205.0f, -184.0f, 58.0f,
                    (Color){0.08f, 0.10f, 0.13f, 1.0f});
  create_slide_text("Every visual layer.", -205.0f, -122.0f, 58.0f,
                    (Color){0.08f, 0.10f, 0.13f, 1.0f});
  create_slide_text("Shapes and MSDF text share one ordered command stream.",
                    -202.0f, -65.0f, 20.0f,
                    (Color){0.32f, 0.36f, 0.42f, 1.0f});

  create_slide_text("RENDER MODEL", -500.0f, -45.0f, 14.0f,
                    (Color){0.55f, 0.90f, 0.82f, 1.0f});
  create_slide_text("Rects", -500.0f, 1.0f, 21.0f,
                    (Color){0.95f, 0.97f, 1.0f, 1.0f});
  create_slide_text("Text", -500.0f, 55.0f, 21.0f,
                    (Color){0.95f, 0.97f, 1.0f, 1.0f});
  create_slide_text("Z-order", -500.0f, 109.0f, 21.0f,
                    (Color){0.95f, 0.97f, 1.0f, 1.0f});
  create_slide_text("1 pipeline", -500.0f, 232.0f, 17.0f,
                    (Color){0.68f, 0.72f, 0.78f, 1.0f});
  create_slide_text("Ελληνικά · Русский · Việt", -500.0f, 274.0f, 12.0f,
                    (Color){0.55f, 0.90f, 0.82f, 1.0f});

  create_slide_text("01", -178.0f, 57.0f, 18.0f,
                    (Color){0.91f, 0.31f, 0.27f, 1.0f});
  create_slide_text("Unified", -130.0f, 55.0f, 24.0f,
                    (Color){0.08f, 0.10f, 0.13f, 1.0f});
  create_slide_text("Command order preserves every layer.", -178.0f, 91.0f,
                    15.0f, (Color){0.36f, 0.40f, 0.46f, 1.0f});

  create_slide_text("02", 188.0f, 57.0f, 18.0f,
                    (Color){0.08f, 0.55f, 0.48f, 1.0f});
  create_slide_text("Scalable", 236.0f, 55.0f, 24.0f,
                    (Color){0.08f, 0.10f, 0.13f, 1.0f});
  create_slide_text("Storage buffers keep CPU work flat.", 188.0f, 91.0f,
                    15.0f, (Color){0.36f, 0.40f, 0.46f, 1.0f});

  create_slide_text("FRAME COMPOSITION", -178.0f, 159.0f, 14.0f,
                    (Color){0.36f, 0.40f, 0.46f, 1.0f});
  create_slide_text("Geometry", -178.0f, 204.0f, 15.0f,
                    (Color){0.19f, 0.22f, 0.27f, 1.0f});
  create_slide_text("Typography", -178.0f, 246.0f, 15.0f,
                    (Color){0.19f, 0.22f, 0.27f, 1.0f});
  create_slide_text("Interaction", -178.0f, 288.0f, 15.0f,
                    (Color){0.19f, 0.22f, 0.27f, 1.0f});
}

EXPORT("blitz_init")
void blitz_init(void) {
  world.entity_count = 0u;
  world.draw_order_count = 0u;
  shape_command_count = 0u;
  rect_draw_count = 0u;
  triangle_draw_count = 0u;
  circle_draw_count = 0u;
  text_draw_count = 0u;
  dyn_command_count = 0u;
  dyn_rect_count = 0u;
  shape_command_version = 0u;
  dyn_version = 0u;
  static_dirty = 1u;
  dynamic_dirty = 1u;
  dragging_selection = 0u;
  drag_active = 0u;
  drag_offset.x = 0.0f;
  drag_offset.y = 0.0f;
  marquee_active = 0u;
  marquee_additive = 0u;
  marquee_candidate = BLITZ_INVALID_INDEX;
  selected_count = 0u;
  spawn_count = 0u;
  drag_last_world.x = 0.0f;
  drag_last_world.y = 0.0f;
  marquee_start.x = 0.0f;
  marquee_start.y = 0.0f;
  marquee_end.x = 0.0f;
  marquee_end.y = 0.0f;
  camera_fit_initialized = 0u;

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

  uniforms.font_params[0] = BLITZ_FONT_ATLAS_SIZE;
  uniforms.font_params[1] = BLITZ_FONT_MSDF_SPREAD;
  uniforms.font_params[2] = 0.0f;
  uniforms.font_params[3] = 0.0f;

  create_demo_world();
  extract_static_shapes();
  extract_dynamic();
}

EXPORT("blitz_resize")
void blitz_resize(float width, float height) {
  float next_width = width > 1.0f ? width : 1.0f;
  float next_height = height > 1.0f ? height : 1.0f;
  if (uniforms.viewport_camera[0] != next_width ||
      uniforms.viewport_camera[1] != next_height) {
    uniforms.viewport_camera[0] = next_width;
    uniforms.viewport_camera[1] = next_height;
    if (!camera_fit_initialized) {
      uniforms.style[0] =
          clampf(minf_local(next_width / 1200.0f, next_height / 675.0f),
                 0.005f, 12.0f);
      camera_fit_initialized = 1u;
    }
    mark_dynamic_dirty();
  }
}

EXPORT("blitz_set_camera")
void blitz_set_camera(float x, float y, float zoom) {
  uniforms.viewport_camera[2] = x;
  uniforms.viewport_camera[3] = y;
  uniforms.style[0] = clampf(zoom, 0.01f, 12.0f);
  mark_dynamic_dirty();
}

EXPORT("blitz_pan")
void blitz_pan(float dx_pixels, float dy_pixels) {
  uniforms.viewport_camera[2] -= dx_pixels / uniforms.style[0];
  uniforms.viewport_camera[3] -= dy_pixels / uniforms.style[0];
  mark_dynamic_dirty();
}

EXPORT("blitz_zoom_at")
void blitz_zoom_at(float screen_x, float screen_y, float zoom_delta) {
  float before_x = 0.0f;
  float before_y = 0.0f;
  float after_x = 0.0f;
  float after_y = 0.0f;

  screen_to_world(screen_x, screen_y, &before_x, &before_y);
  uniforms.style[0] = clampf(uniforms.style[0] * zoom_delta, 0.01f, 12.0f);
  screen_to_world(screen_x, screen_y, &after_x, &after_y);

  uniforms.viewport_camera[2] += before_x - after_x;
  uniforms.viewport_camera[3] += before_y - after_y;
  mark_dynamic_dirty();
}

EXPORT("blitz_pointer_down")
u32 blitz_pointer_down(float screen_x, float screen_y, u32 additive) {
  float world_x = 0.0f;
  float world_y = 0.0f;
  screen_to_world(screen_x, screen_y, &world_x, &world_y);

  for (u32 i = world.draw_order_count; i > 0u; i -= 1u) {
    u32 entity = world.draw_order[i - 1u];
    if (!(world.masks[entity] & BLITZ_COMPONENT_SELECTABLE)) {
      continue;
    }
    u32 hit = 0u;
    if (world.masks[entity] & BLITZ_COMPONENT_CIRCLE_VIEW) {
      hit = (u32)point_in_circle(world_x, world_y, entity);
    } else if (world.masks[entity] & BLITZ_COMPONENT_TRIANGLE_VIEW) {
      hit = (u32)point_in_triangle(world_x, world_y, entity);
    } else {
      hit = (u32)point_in_rect(world_x, world_y, entity);
    }
    if (hit) {
      if (additive) {
        toggle_selection(entity);
      } else if (!world.selected[entity]) {
        select_only(entity);
      }
      dragging_selection = world.selected[entity];
      drag_last_world.x = world_x;
      drag_last_world.y = world_y;
      return 1u;
    }
  }

  dragging_selection = 0u;
  if (!additive) {
    clear_selection();
  }
  marquee_active = 1u;
  marquee_additive = additive;
  marquee_candidate = BLITZ_INVALID_INDEX;
  marquee_start.x = world_x;
  marquee_start.y = world_y;
  marquee_end = marquee_start;
  snapshot_selection_base();
  mark_dynamic_dirty();
  return 2u;
}

EXPORT("blitz_pointer_move")
void blitz_pointer_move(float screen_x, float screen_y) {
  float world_x = 0.0f;
  float world_y = 0.0f;
  screen_to_world(screen_x, screen_y, &world_x, &world_y);
  if (marquee_active) {
    marquee_end.x = world_x;
    marquee_end.y = world_y;
    marquee_apply_live();
    mark_dynamic_dirty();
    return;
  }
  if (!dragging_selection) {
    return;
  }

  // First motion: rebuild once so the dragged commands get the drag flag, then
  // each frame only updates the offset uniform (no extraction/re-upload).
  if (!drag_active) {
    drag_active = 1u;
    drag_offset.x = 0.0f;
    drag_offset.y = 0.0f;
    mark_render_list_dirty();
  }
  drag_offset.x += world_x - drag_last_world.x;
  drag_offset.y += world_y - drag_last_world.y;
  drag_last_world.x = world_x;
  drag_last_world.y = world_y;
  uniforms.font_params[2] = drag_offset.x;
  uniforms.font_params[3] = drag_offset.y;
}

EXPORT("blitz_pointer_up")
void blitz_pointer_up(void) {
  if (drag_active) {
    for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
      if (world.selected[entity]) {
        world.positions[entity].x += drag_offset.x;
        world.positions[entity].y += drag_offset.y;
      }
    }
    drag_offset.x = 0.0f;
    drag_offset.y = 0.0f;
    uniforms.font_params[2] = 0.0f;
    uniforms.font_params[3] = 0.0f;
    drag_active = 0u;
    dragging_selection = 0u;
    mark_render_list_dirty();
    return;
  }
  dragging_selection = 0u;
  if (!marquee_active) {
    return;
  }

  float min_x = minf_local(marquee_start.x, marquee_end.x);
  float min_y = minf_local(marquee_start.y, marquee_end.y);
  float max_x = marquee_start.x > marquee_end.x ? marquee_start.x : marquee_end.x;
  float max_y = marquee_start.y > marquee_end.y ? marquee_start.y : marquee_end.y;
  float click_threshold = 4.0f / uniforms.style[0];
  if (max_x - min_x <= click_threshold && max_y - min_y <= click_threshold) {
    if (marquee_candidate != BLITZ_INVALID_INDEX) {
      if (marquee_additive) {
        toggle_selection(marquee_candidate);
      } else {
        select_only(marquee_candidate);
      }
    }
    marquee_active = 0u;
    marquee_candidate = BLITZ_INVALID_INDEX;
    mark_dynamic_dirty();
    return;
  }

  // Selection for a dragged marquee was already applied live during move.
  marquee_active = 0u;
  marquee_candidate = BLITZ_INVALID_INDEX;
  mark_dynamic_dirty();
}

EXPORT("blitz_add_rect")
void blitz_add_rect(void) {
  float offset = (float)(spawn_count % 6u) * 16.0f;
  u32 entity = create_user_rect(uniforms.viewport_camera[2] + offset,
                                uniforms.viewport_camera[3] + offset);
  spawn_count += 1u;
  select_only(entity);
  mark_render_list_dirty();
}

EXPORT("blitz_add_circle")
void blitz_add_circle(void) {
  float offset = (float)(spawn_count % 6u) * 16.0f;
  u32 entity = create_user_circle(uniforms.viewport_camera[2] + offset,
                                  uniforms.viewport_camera[3] + offset);
  spawn_count += 1u;
  select_only(entity);
  mark_render_list_dirty();
}

EXPORT("blitz_add_triangle")
void blitz_add_triangle(void) {
  float offset = (float)(spawn_count % 6u) * 16.0f;
  u32 entity = create_user_triangle(uniforms.viewport_camera[2] + offset,
                                    uniforms.viewport_camera[3] + offset);
  spawn_count += 1u;
  select_only(entity);
  mark_render_list_dirty();
}

EXPORT("blitz_add_text")
void blitz_add_text(void) {
  float offset = (float)(spawn_count % 6u) * 16.0f;
  u32 entity = create_user_text(uniforms.viewport_camera[2] + offset,
                                uniforms.viewport_camera[3] + offset);
  spawn_count += 1u;
  select_only(entity);
  mark_render_list_dirty();
}

EXPORT("blitz_stress_test")
void blitz_stress_test(void) {
  const u32 columns = 200u;
  const u32 rows = 200u;
  const float pitch_x = 1240.0f;
  const float pitch_y = 750.0f;
  float base_x = -0.5f * (float)(columns - 1u) * pitch_x;
  float base_y = -0.5f * (float)(rows - 1u) * pitch_y;
  for (u32 row = 0u; row < rows; row += 1u) {
    for (u32 col = 0u; col < columns; col += 1u) {
      slide_origin_x = base_x + (float)col * pitch_x;
      slide_origin_y = base_y + (float)row * pitch_y;
      create_demo_world();
    }
  }
  slide_origin_x = 0.0f;
  slide_origin_y = 0.0f;
  mark_render_list_dirty();
}

EXPORT("blitz_delete_selected")
void blitz_delete_selected(void) {
  if (selected_count == 0u) {
    return;
  }
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (world.selected[entity]) {
      world.masks[entity] = 0u;
      world.selected[entity] = 0u;
    }
  }
  selected_count = 0u;
  dragging_selection = 0u;
  mark_render_list_dirty();
}

EXPORT("blitz_has_selection")
u32 blitz_has_selection(void) {
  return selected_count > 0u;
}

EXPORT("blitz_bring_to_front")
void blitz_bring_to_front(void) {
  if (selected_count == 0u) {
    return;
  }
  reorder_selection(0u);
}

EXPORT("blitz_send_to_back")
void blitz_send_to_back(void) {
  if (selected_count == 0u) {
    return;
  }
  reorder_selection(1u);
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
  extract_static_shapes();
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
  extract_static_shapes();
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
  extract_static_shapes();
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
  extract_static_shapes();
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

EXPORT("blitz_text_draw_ptr")
u32 blitz_text_draw_ptr(void) {
  extract_dynamic();
  return (u32)&text_draws[0];
}

EXPORT("blitz_text_draw_f32_count")
u32 blitz_text_draw_f32_count(void) {
  return sizeof(TextDraw) / sizeof(float);
}

EXPORT("blitz_text_draw_count")
u32 blitz_text_draw_count(void) {
  return text_draw_count;
}

EXPORT("blitz_render_max_text_draws")
u32 blitz_render_max_text_draws(void) {
  return BLITZ_MAX_TEXT_DRAWS;
}

EXPORT("blitz_dyn_command_ptr")
u32 blitz_dyn_command_ptr(void) {
  extract_dynamic();
  return (u32)&dyn_commands[0];
}

EXPORT("blitz_dyn_command_count")
u32 blitz_dyn_command_count(void) {
  return dyn_command_count;
}

EXPORT("blitz_dyn_version")
u32 blitz_dyn_version(void) {
  return dyn_version;
}

EXPORT("blitz_dyn_rect_ptr")
u32 blitz_dyn_rect_ptr(void) {
  extract_dynamic();
  return (u32)&dyn_rects[0];
}

EXPORT("blitz_dyn_rect_count")
u32 blitz_dyn_rect_count(void) {
  return dyn_rect_count;
}

EXPORT("blitz_render_max_dyn_commands")
u32 blitz_render_max_dyn_commands(void) {
  return BLITZ_MAX_DYN_COMMANDS;
}

EXPORT("blitz_render_max_dyn_rects")
u32 blitz_render_max_dyn_rects(void) {
  return BLITZ_MAX_DYN_RECTS;
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
