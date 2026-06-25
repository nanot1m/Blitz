typedef unsigned int u32;

#include "font.generated.h"

#define EXPORT(name) __attribute__((export_name(name)))

#define BLITZ_MAX_ENTITIES 1000000u
#define BLITZ_RENDER_CHUNK_RECTS 250000u
#define BLITZ_RENDER_CHUNKS 4u
#define BLITZ_MAX_RECT_DRAWS (BLITZ_RENDER_CHUNK_RECTS * BLITZ_RENDER_CHUNKS)
#define BLITZ_MAX_TEXT_DRAWS 262144u
#define BLITZ_MAX_DYN_RECTS 1000000u
#define BLITZ_MAX_DYN_COMMANDS (BLITZ_MAX_TEXT_DRAWS + BLITZ_MAX_DYN_RECTS)
#define BLITZ_MIN_TEXT_PX 3.0f
#define BLITZ_TEXT_INPUT_BYTES 4096u
#define BLITZ_TEXT_POOL_BYTES (4u * 1024u * 1024u)
#define BLITZ_MAX_SCENE_QUERY_ITEMS 65536u
#define BLITZ_SCENE_FILE_BUFFER_BYTES (16u * 1024u * 1024u)
#define BLITZ_SCENE_FILE_MAGIC 0x5a544c42u
#define BLITZ_SCENE_FILE_VERSION 3u
#define BLITZ_SCENE_FILE_HEADER_BYTES 32u
#define BLITZ_SCENE_FILE_LEGACY_RECORD_BYTES 80u
#define BLITZ_SCENE_FILE_RECORD_BYTES 92u
#define BLITZ_HISTORY_MAX_ENTRIES 128u
#define BLITZ_HISTORY_MAX_OPS 65536u

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
#define BLITZ_COMPONENT_RESIZABLE 128u

#define BLITZ_SHAPE_RECT 0u
#define BLITZ_SHAPE_TRIANGLE 1u
#define BLITZ_SHAPE_CIRCLE 2u
#define BLITZ_SHAPE_TEXT 3u

typedef struct Vec2 {
  float x;
  float y;
} Vec2;

typedef struct ObjectId {
  u32 actor_hi;
  u32 actor_lo;
  u32 sequence_hi;
  u32 sequence_lo;
} ObjectId;

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

typedef struct SceneItem {
  ObjectId object_id;
  u32 shape_kind;
  u32 order;
  u32 selected;
  u32 text_ptr;
  u32 text_length;
  u32 _pad0;
  float bounds[4];
  float fill_color[4];
  float stroke_color[4];
  float style[2];
} SceneItem;

typedef struct EntitySnapshot {
  ObjectId object_id;
  u32 mask;
  u32 order;
  u32 _pad0;
  Vec2 position;
  Vec2 size;
  RectView rect_view;
  TriangleView triangle_view;
  CircleView circle_view;
  TextView text_view;
} EntitySnapshot;

typedef struct HistoryOp {
  u32 kind;
  u32 _pad0;
  EntitySnapshot before;
  EntitySnapshot after;
} HistoryOp;

typedef struct HistoryEntry {
  u32 op_start;
  u32 op_count;
} HistoryEntry;

typedef struct World {
  u32 entity_count;
  u32 draw_order_count;
  u32 draw_order[BLITZ_MAX_ENTITIES];
  u32 draw_order_scratch[BLITZ_MAX_ENTITIES];
  u32 selected[BLITZ_MAX_ENTITIES];
  ObjectId object_ids[BLITZ_MAX_ENTITIES];
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
static char text_input[BLITZ_TEXT_INPUT_BYTES];
static char text_pool[BLITZ_TEXT_POOL_BYTES];
static u32 text_pool_used;
static SceneItem scene_query_items[BLITZ_MAX_SCENE_QUERY_ITEMS];
static u32 scene_query_count;
static u32 scene_query_total;
static unsigned char scene_file_buffer[BLITZ_SCENE_FILE_BUFFER_BYTES];
static float selected_style[13];
static HistoryOp history_ops[BLITZ_HISTORY_MAX_OPS];
static HistoryEntry history_entries[BLITZ_HISTORY_MAX_ENTRIES];
static u32 history_touched_generation[BLITZ_MAX_ENTITIES];
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
static u32 resize_active;
static u32 resize_entity;
static u32 resize_handle;
static Vec2 resize_start_position;
static Vec2 resize_start_size;
// Selection state captured when a marquee starts, so each marquee move can
// recompute live selection as base ∪ (entities inside the current box).
static u32 marquee_base_selected[BLITZ_MAX_ENTITIES];
// Reclaimed entity slots (stack) and the count of currently-live entities.
static u32 free_slots[BLITZ_MAX_ENTITIES];
static u32 free_count;
static u32 live_count;
static Vec2 marquee_start;
static Vec2 marquee_end;
static u32 camera_fit_initialized;
static u32 scene_revision;
static float scene_start_camera_x;
static float scene_start_camera_y;
static float scene_start_camera_zoom;
static u32 object_id_actor_hi;
static u32 object_id_actor_lo;
static u32 next_object_id_sequence_hi;
static u32 next_object_id_sequence_lo;
static ObjectId last_created_object_id;
static u32 history_op_count;
static u32 history_entry_count;
static u32 history_cursor;
static u32 history_transaction_start;
static u32 history_transaction_active;
static u32 history_replaying;
static u32 history_overflowed;
static u32 history_generation;

#define BLITZ_HISTORY_CREATE 1u
#define BLITZ_HISTORY_DELETE 2u
#define BLITZ_HISTORY_UPDATE 3u

static void clear_selection(void);

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

static u32 string_length(const char *text) {
  u32 length = 0u;
  while (text[length] != '\0') {
    length += 1u;
  }
  return length;
}

static int bounds_overlap(float x, float y, float width, float height,
                          float min_x, float min_y, float max_x, float max_y) {
  return x + width >= min_x && x <= max_x && y + height >= min_y &&
         y <= max_y;
}

static u32 align4(u32 value) {
  return (value + 3u) & ~3u;
}

static void write_u32(unsigned char *buffer, u32 offset, u32 value) {
  buffer[offset] = (unsigned char)(value & 0xffu);
  buffer[offset + 1u] = (unsigned char)((value >> 8u) & 0xffu);
  buffer[offset + 2u] = (unsigned char)((value >> 16u) & 0xffu);
  buffer[offset + 3u] = (unsigned char)((value >> 24u) & 0xffu);
}

static u32 read_u32(const unsigned char *buffer, u32 offset) {
  return (u32)buffer[offset] | ((u32)buffer[offset + 1u] << 8u) |
         ((u32)buffer[offset + 2u] << 16u) |
         ((u32)buffer[offset + 3u] << 24u);
}

static ObjectId object_id_zero(void) {
  return (ObjectId){0u, 0u, 0u, 0u};
}

static u32 object_id_is_zero(ObjectId id) {
  return id.actor_hi == 0u && id.actor_lo == 0u && id.sequence_hi == 0u &&
         id.sequence_lo == 0u;
}

static u32 object_id_equal(ObjectId left, ObjectId right) {
  return left.actor_hi == right.actor_hi && left.actor_lo == right.actor_lo &&
         left.sequence_hi == right.sequence_hi &&
         left.sequence_lo == right.sequence_lo;
}

static ObjectId new_object_id(void) {
  ObjectId id = {object_id_actor_hi, object_id_actor_lo,
                 next_object_id_sequence_hi, next_object_id_sequence_lo};
  next_object_id_sequence_lo += 1u;
  if (next_object_id_sequence_lo == 0u) {
    next_object_id_sequence_hi += 1u;
  }
  last_created_object_id = id;
  return id;
}

static void advance_sequence_past(ObjectId id) {
  if (id.actor_hi != object_id_actor_hi || id.actor_lo != object_id_actor_lo) {
    return;
  }
  if (id.sequence_hi > next_object_id_sequence_hi ||
      (id.sequence_hi == next_object_id_sequence_hi &&
       id.sequence_lo >= next_object_id_sequence_lo)) {
    next_object_id_sequence_hi = id.sequence_hi;
    next_object_id_sequence_lo = id.sequence_lo + 1u;
    if (next_object_id_sequence_lo == 0u) {
      next_object_id_sequence_hi += 1u;
    }
  }
}

static void write_f32(unsigned char *buffer, u32 offset, float value) {
  union {
    float f;
    u32 u;
  } bits;
  bits.f = value;
  write_u32(buffer, offset, bits.u);
}

static float read_f32(const unsigned char *buffer, u32 offset) {
  union {
    float f;
    u32 u;
  } bits;
  bits.u = read_u32(buffer, offset);
  return bits.f;
}

static void mark_render_list_dirty(void) {
  static_dirty = 1u;
  dynamic_dirty = 1u;
  scene_revision += 1u;
}

static void mark_dynamic_dirty(void) {
  dynamic_dirty = 1u;
}

static void mark_view_dirty(void) {
  dynamic_dirty = 1u;
}

static u32 entity_order(u32 entity) {
  for (u32 order = 0u; order < world.draw_order_count; order += 1u) {
    if (world.draw_order[order] == entity) {
      return order;
    }
  }
  return BLITZ_INVALID_INDEX;
}

static EntitySnapshot snapshot_entity(u32 entity) {
  EntitySnapshot snapshot;
  snapshot.object_id = world.object_ids[entity];
  snapshot.mask = world.masks[entity];
  snapshot.order = entity_order(entity);
  snapshot._pad0 = 0u;
  snapshot.position = world.positions[entity];
  snapshot.size = world.sizes[entity];
  snapshot.rect_view = world.rect_views[entity];
  snapshot.triangle_view = world.triangle_views[entity];
  snapshot.circle_view = world.circle_views[entity];
  snapshot.text_view = world.text_views[entity];
  return snapshot;
}

static u32 find_entity_by_object_id(ObjectId object_id) {
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (world.masks[entity] != 0u &&
        object_id_equal(world.object_ids[entity], object_id)) {
      return entity;
    }
  }
  return BLITZ_INVALID_INDEX;
}

static void history_reset_internal(void) {
  history_op_count = 0u;
  history_entry_count = 0u;
  history_cursor = 0u;
  history_transaction_start = 0u;
  history_transaction_active = 0u;
  history_overflowed = 0u;
}

static void history_begin(void) {
  if (history_replaying || history_transaction_active) {
    return;
  }
  if (history_cursor < history_entry_count) {
    history_entry_count = history_cursor;
    history_op_count =
        history_cursor == 0u
            ? 0u
            : history_entries[history_cursor - 1u].op_start +
                  history_entries[history_cursor - 1u].op_count;
  }
  history_transaction_start = history_op_count;
  history_transaction_active = 1u;
  history_overflowed = 0u;
  history_generation += 1u;
  if (history_generation == 0u) {
    for (u32 entity = 0u; entity < BLITZ_MAX_ENTITIES; entity += 1u) {
      history_touched_generation[entity] = 0u;
    }
    history_generation = 1u;
  }
}

static u32 history_begin_owned(void) {
  if (history_transaction_active) {
    return 0u;
  }
  history_begin();
  return history_transaction_active;
}

static HistoryOp *history_push(u32 kind) {
  if (history_replaying) {
    return 0;
  }
  if (!history_transaction_active) {
    history_begin();
  }
  if (history_op_count >= BLITZ_HISTORY_MAX_OPS) {
    history_overflowed = 1u;
    return 0;
  }
  HistoryOp *op = &history_ops[history_op_count];
  history_op_count += 1u;
  op->kind = kind;
  op->_pad0 = 0u;
  return op;
}

static void history_record_before(u32 entity) {
  if (history_replaying || entity == BLITZ_INVALID_INDEX) {
    return;
  }
  if (history_touched_generation[entity] == history_generation) {
    return;
  }
  history_touched_generation[entity] = history_generation;
  HistoryOp *op = history_push(BLITZ_HISTORY_UPDATE);
  if (op) {
    op->before = snapshot_entity(entity);
    op->after = op->before;
  }
}

static void history_record_created(u32 entity) {
  HistoryOp *op = history_push(BLITZ_HISTORY_CREATE);
  if (op) {
    op->before.object_id = object_id_zero();
    op->after = snapshot_entity(entity);
  }
}

static void history_record_deleted(u32 entity) {
  HistoryOp *op = history_push(BLITZ_HISTORY_DELETE);
  if (op) {
    op->before = snapshot_entity(entity);
    op->after.object_id = object_id_zero();
  }
}

static void history_record_selected_before(void) {
  history_begin();
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (world.selected[entity]) {
      history_record_before(entity);
    }
  }
}

static void history_commit(void) {
  if (history_replaying || !history_transaction_active) {
    return;
  }
  if (history_overflowed || history_entry_count >= BLITZ_HISTORY_MAX_ENTRIES) {
    history_reset_internal();
    return;
  }
  u32 write = history_transaction_start;
  for (u32 index = history_transaction_start; index < history_op_count;
       index += 1u) {
    HistoryOp op = history_ops[index];
    if (op.kind == BLITZ_HISTORY_UPDATE) {
      u32 entity = find_entity_by_object_id(op.before.object_id);
      if (entity == BLITZ_INVALID_INDEX) {
        continue;
      }
      op.after = snapshot_entity(entity);
    }
    history_ops[write] = op;
    write += 1u;
  }
  history_op_count = write;
  u32 count = history_op_count - history_transaction_start;
  history_transaction_active = 0u;
  if (count == 0u) {
    return;
  }
  history_entries[history_entry_count].op_start = history_transaction_start;
  history_entries[history_entry_count].op_count = count;
  history_entry_count += 1u;
  history_cursor = history_entry_count;
}

static void history_cancel(void) {
  if (!history_transaction_active) {
    return;
  }
  history_op_count = history_transaction_start;
  history_transaction_active = 0u;
  history_overflowed = 0u;
}

static u32 ecs_create_entity(void) {
  u32 entity;
  if (free_count > 0u) {
    free_count -= 1u;
    entity = free_slots[free_count];
  } else if (world.entity_count < BLITZ_MAX_ENTITIES) {
    entity = world.entity_count;
    world.entity_count += 1u;
  } else {
    return BLITZ_INVALID_INDEX;
  }
  world.draw_order[world.draw_order_count] = entity;
  world.draw_order_count += 1u;
  world.selected[entity] = 0u;
  world.masks[entity] = 0u;
  world.object_ids[entity] = new_object_id();
  live_count += 1u;
  return entity;
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

static void ecs_set_resizable(u32 entity) {
  if (entity != BLITZ_INVALID_INDEX) {
    world.masks[entity] |= BLITZ_COMPONENT_RESIZABLE;
  }
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

static void remove_entity(u32 entity) {
  if (entity == BLITZ_INVALID_INDEX || world.masks[entity] == 0u) {
    return;
  }
  world.masks[entity] = 0u;
  world.selected[entity] = 0u;
  free_slots[free_count] = entity;
  free_count += 1u;
  live_count -= 1u;
  u32 kept = 0u;
  for (u32 index = 0u; index < world.draw_order_count; index += 1u) {
    if (world.draw_order[index] != entity) {
      world.draw_order[kept] = world.draw_order[index];
      kept += 1u;
    }
  }
  world.draw_order_count = kept;
}

static u32 restore_snapshot(EntitySnapshot snapshot) {
  u32 entity = find_entity_by_object_id(snapshot.object_id);
  if (entity == BLITZ_INVALID_INDEX) {
    entity = ecs_create_entity();
    if (entity == BLITZ_INVALID_INDEX) {
      return entity;
    }
    world.object_ids[entity] = snapshot.object_id;
    advance_sequence_past(snapshot.object_id);
  }
  world.masks[entity] = snapshot.mask;
  world.positions[entity] = snapshot.position;
  world.sizes[entity] = snapshot.size;
  world.rect_views[entity] = snapshot.rect_view;
  world.triangle_views[entity] = snapshot.triangle_view;
  world.circle_views[entity] = snapshot.circle_view;
  world.text_views[entity] = snapshot.text_view;
  world.selected[entity] = 0u;
  return entity;
}

static void move_entity_to_order(u32 entity, u32 target) {
  u32 current = entity_order(entity);
  if (current == BLITZ_INVALID_INDEX || world.draw_order_count == 0u) {
    return;
  }
  if (target >= world.draw_order_count) {
    target = world.draw_order_count - 1u;
  }
  if (current < target) {
    for (u32 index = current; index < target; index += 1u) {
      world.draw_order[index] = world.draw_order[index + 1u];
    }
  } else if (current > target) {
    for (u32 index = current; index > target; index -= 1u) {
      world.draw_order[index] = world.draw_order[index - 1u];
    }
  }
  world.draw_order[target] = entity;
}

static void history_apply_entry(HistoryEntry entry, u32 forward) {
  history_replaying = 1u;
  clear_selection();
  for (u32 offset = 0u; offset < entry.op_count; offset += 1u) {
    u32 index = forward ? entry.op_start + offset
                        : entry.op_start + entry.op_count - 1u - offset;
    HistoryOp *op = &history_ops[index];
    if ((forward && op->kind == BLITZ_HISTORY_CREATE) ||
        (!forward && op->kind == BLITZ_HISTORY_DELETE)) {
      restore_snapshot(forward ? op->after : op->before);
    } else if ((forward && op->kind == BLITZ_HISTORY_DELETE) ||
               (!forward && op->kind == BLITZ_HISTORY_CREATE)) {
      ObjectId object_id =
          forward ? op->before.object_id : op->after.object_id;
      remove_entity(find_entity_by_object_id(object_id));
    } else {
      restore_snapshot(forward ? op->after : op->before);
    }
  }
  for (u32 offset = 0u; offset < entry.op_count; offset += 1u) {
    HistoryOp *op = &history_ops[entry.op_start + offset];
    EntitySnapshot snapshot = forward ? op->after : op->before;
    if (!object_id_is_zero(snapshot.object_id)) {
      u32 entity = find_entity_by_object_id(snapshot.object_id);
      move_entity_to_order(entity, snapshot.order);
    }
  }
  selected_count = 0u;
  dragging_selection = 0u;
  drag_active = 0u;
  resize_active = 0u;
  resize_entity = BLITZ_INVALID_INDEX;
  mark_render_list_dirty();
  history_replaying = 0u;
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

static void push_resize_handle_draw(float center_x, float center_y, u32 order) {
  if (dyn_command_count >= BLITZ_MAX_DYN_COMMANDS ||
      dyn_rect_count >= BLITZ_MAX_DYN_RECTS) {
    return;
  }

  float size = 9.0f / uniforms.style[0];
  RectDraw *draw = &dyn_rects[dyn_rect_count];
  draw->rect[0] = center_x - size * 0.5f;
  draw->rect[1] = center_y - size * 0.5f;
  draw->rect[2] = size;
  draw->rect[3] = size;
  draw->fill_color[0] = 1.0f;
  draw->fill_color[1] = 1.0f;
  draw->fill_color[2] = 1.0f;
  draw->fill_color[3] = 1.0f;
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
    if (selected_count == 1u &&
        (world.masks[entity] & BLITZ_COMPONENT_RESIZABLE)) {
      float left = position.x;
      float top = position.y;
      float right = position.x + size.x;
      float bottom = position.y + size.y;
      push_resize_handle_draw(left, top, overlay_order + 1u);
      push_resize_handle_draw(right, top, overlay_order + 1u);
      push_resize_handle_draw(right, bottom, overlay_order + 1u);
      push_resize_handle_draw(left, bottom, overlay_order + 1u);
      push_resize_handle_draw((left + right) * 0.5f, top,
                              overlay_order + 1u);
      push_resize_handle_draw(right, (top + bottom) * 0.5f,
                              overlay_order + 1u);
      push_resize_handle_draw((left + right) * 0.5f, bottom,
                              overlay_order + 1u);
      push_resize_handle_draw(left, (top + bottom) * 0.5f,
                              overlay_order + 1u);
    }
  }
  push_marquee_draw(world.draw_order_count + 3u);
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

static u32 selected_resizable_entity(void) {
  if (selected_count != 1u) {
    return BLITZ_INVALID_INDEX;
  }
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (world.selected[entity] &&
        (world.masks[entity] & BLITZ_COMPONENT_RESIZABLE)) {
      return entity;
    }
  }
  return BLITZ_INVALID_INDEX;
}

static u32 hit_test_resize_handle(float world_x, float world_y, u32 entity) {
  if (entity == BLITZ_INVALID_INDEX) {
    return BLITZ_INVALID_INDEX;
  }
  Vec2 position = world.positions[entity];
  Vec2 size = world.sizes[entity];
  float hit_radius = 10.0f / uniforms.style[0];
  float centers[16] = {
      position.x,          position.y,
      position.x + size.x, position.y,
      position.x + size.x, position.y + size.y,
      position.x,          position.y + size.y,
      position.x + size.x * 0.5f, position.y,
      position.x + size.x, position.y + size.y * 0.5f,
      position.x + size.x * 0.5f, position.y + size.y,
      position.x, position.y + size.y * 0.5f,
  };
  for (u32 handle = 0u; handle < 8u; handle += 1u) {
    float dx = world_x - centers[handle * 2u];
    float dy = world_y - centers[handle * 2u + 1u];
    if (dx >= -hit_radius && dx <= hit_radius &&
        dy >= -hit_radius && dy <= hit_radius) {
      return handle;
    }
  }
  return BLITZ_INVALID_INDEX;
}

static void resize_entity_to(float world_x, float world_y) {
  if (!resize_active || resize_entity == BLITZ_INVALID_INDEX) {
    return;
  }

  float min_size = 12.0f / uniforms.style[0];
  float left = resize_start_position.x;
  float top = resize_start_position.y;
  float right = left + resize_start_size.x;
  float bottom = top + resize_start_size.y;
  float center_x = (left + right) * 0.5f;
  float center_y = (top + bottom) * 0.5f;
  float anchor_x =
      (resize_handle == 0u || resize_handle == 3u || resize_handle == 7u)
          ? right
          : left;
  float anchor_y =
      (resize_handle == 0u || resize_handle == 1u || resize_handle == 4u)
          ? bottom
          : top;
  float next_x = left;
  float next_y = top;
  float next_width = resize_start_size.x;
  float next_height = resize_start_size.y;

  if (world.masks[resize_entity] & BLITZ_COMPONENT_CIRCLE_VIEW) {
    float side = resize_start_size.x;
    if (resize_handle < 4u) {
      float width =
          world_x > anchor_x ? world_x - anchor_x : anchor_x - world_x;
      float height =
          world_y > anchor_y ? world_y - anchor_y : anchor_y - world_y;
      side = width > height ? width : height;
    } else if (resize_handle == 4u) {
      side = bottom - world_y;
    } else if (resize_handle == 5u) {
      side = world_x - left;
    } else if (resize_handle == 6u) {
      side = world_y - top;
    } else {
      side = right - world_x;
    }
    if (side < min_size) {
      side = min_size;
    }
    if (resize_handle < 4u) {
      next_x = (resize_handle == 0u || resize_handle == 3u)
                   ? anchor_x - side
                   : anchor_x;
      next_y = (resize_handle == 0u || resize_handle == 1u)
                   ? anchor_y - side
                   : anchor_y;
    } else if (resize_handle == 4u) {
      next_x = center_x - side * 0.5f;
      next_y = bottom - side;
    } else if (resize_handle == 5u) {
      next_x = left;
      next_y = center_y - side * 0.5f;
    } else if (resize_handle == 6u) {
      next_x = center_x - side * 0.5f;
      next_y = top;
    } else {
      next_x = right - side;
      next_y = center_y - side * 0.5f;
    }
    next_width = side;
    next_height = side;
  } else {
    if (resize_handle == 0u || resize_handle == 3u || resize_handle == 7u) {
      next_x = world_x < anchor_x - min_size ? world_x : anchor_x - min_size;
      next_width = anchor_x - next_x;
    } else if (resize_handle == 1u || resize_handle == 2u ||
               resize_handle == 5u) {
      next_x = anchor_x;
      next_width = world_x > anchor_x + min_size ? world_x - anchor_x : min_size;
    }
    if (resize_handle == 0u || resize_handle == 1u || resize_handle == 4u) {
      next_y = world_y < anchor_y - min_size ? world_y : anchor_y - min_size;
      next_height = anchor_y - next_y;
    } else if (resize_handle == 2u || resize_handle == 3u ||
               resize_handle == 6u) {
      next_y = anchor_y;
      next_height = world_y > anchor_y + min_size ? world_y - anchor_y : min_size;
    }
  }

  world.positions[resize_entity].x = next_x;
  world.positions[resize_entity].y = next_y;
  world.sizes[resize_entity].x = next_width;
  world.sizes[resize_entity].y = next_height;
  mark_render_list_dirty();
}

static u32 hit_test_entity(float world_x, float world_y) {
  u32 resize_target = selected_resizable_entity();
  if (hit_test_resize_handle(world_x, world_y, resize_target) !=
      BLITZ_INVALID_INDEX) {
    return resize_target;
  }
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
      return entity;
    }
  }
  return BLITZ_INVALID_INDEX;
}

static u32 create_base_rect(float x, float y, float width, float height,
                            Color fill, Color stroke, float stroke_width) {
  u32 entity = ecs_create_entity();
  if (entity == BLITZ_INVALID_INDEX) {
    return entity;
  }
  ecs_set_position(entity, x, y);
  ecs_set_size(entity, width, height);
  ecs_set_rect_view(entity, fill, stroke, stroke_width);
  world.masks[entity] |= BLITZ_COMPONENT_SELECTABLE;
  ecs_set_resizable(entity);
  if (history_transaction_active) {
    history_record_created(entity);
  }
  return entity;
}

static u32 create_base_circle(float x, float y, float width, float height,
                              Color fill, Color stroke, float stroke_width) {
  u32 entity = ecs_create_entity();
  if (entity == BLITZ_INVALID_INDEX) {
    return entity;
  }
  ecs_set_position(entity, x, y);
  ecs_set_size(entity, width, height);
  ecs_set_circle_view(entity, fill, stroke, stroke_width);
  world.masks[entity] |= BLITZ_COMPONENT_SELECTABLE;
  ecs_set_resizable(entity);
  if (history_transaction_active) {
    history_record_created(entity);
  }
  return entity;
}

static u32 create_base_triangle(float x, float y, float width, float height,
                                Color fill, Color stroke,
                                float stroke_width) {
  u32 entity = ecs_create_entity();
  if (entity == BLITZ_INVALID_INDEX) {
    return entity;
  }
  ecs_set_position(entity, x, y);
  ecs_set_size(entity, width, height);
  ecs_set_triangle_view(entity, fill, stroke, stroke_width);
  world.masks[entity] |= BLITZ_COMPONENT_SELECTABLE;
  ecs_set_resizable(entity);
  if (history_transaction_active) {
    history_record_created(entity);
  }
  return entity;
}

static u32 create_base_text(const char *text, float x, float top,
                            float font_size, Color color) {
  float padding = 4.0f;
  float width = font_text_width(text, font_size);
  float height = BLITZ_FONT_LINE_HEIGHT * font_size;
  u32 entity = ecs_create_entity();
  if (entity == BLITZ_INVALID_INDEX) {
    return entity;
  }
  ecs_set_position(entity, x - padding, top - padding);
  ecs_set_size(entity, width + padding * 2.0f, height + padding * 2.0f);
  ecs_set_text_view(entity, text, color, font_size, padding,
                    padding + BLITZ_FONT_ASCENDER * font_size);
  world.masks[entity] |= BLITZ_COMPONENT_SELECTABLE;
  if (history_transaction_active) {
    history_record_created(entity);
  }
  return entity;
}

// Template coordinates are translated before calling the same base-shape
// constructors used by user and MCP-created content.
static float slide_origin_x = 0.0f;
static float slide_origin_y = 0.0f;

static u32 create_slide_rect(float x, float y, float width, float height,
                             Color fill, Color stroke, float stroke_width) {
  return create_base_rect(slide_origin_x + x, slide_origin_y + y, width,
                          height, fill, stroke, stroke_width);
}

static u32 create_slide_text(const char *text, float x, float baseline_y,
                             float font_size, Color color) {
  float top = baseline_y - BLITZ_FONT_ASCENDER * font_size;
  return create_base_text(text, slide_origin_x + x, slide_origin_y + top,
                          font_size, color);
}

static u32 create_user_rect(float x, float y) {
  return create_base_rect(x - 90.0f, y - 55.0f, 180.0f, 110.0f,
                          (Color){0.86f, 0.92f, 1.0f, 1.0f},
                          (Color){0.20f, 0.43f, 0.85f, 1.0f}, 2.0f);
}

static u32 create_user_circle(float x, float y) {
  return create_base_circle(x - 65.0f, y - 65.0f, 130.0f, 130.0f,
                            (Color){0.86f, 0.97f, 0.93f, 1.0f},
                            (Color){0.08f, 0.58f, 0.46f, 1.0f}, 2.0f);
}

static u32 create_user_triangle(float x, float y) {
  return create_base_triangle(x - 75.0f, y - 65.0f, 150.0f, 130.0f,
                              (Color){1.0f, 0.92f, 0.85f, 1.0f},
                              (Color){0.91f, 0.31f, 0.27f, 1.0f}, 2.0f);
}

static u32 create_user_text(float x, float y) {
  const char *text = "New text";
  float font_size = 30.0f;
  float width = font_text_width(text, font_size);
  float height = BLITZ_FONT_LINE_HEIGHT * font_size;
  return create_base_text(text, x - width * 0.5f, y - height * 0.5f,
                          font_size,
                          (Color){0.08f, 0.10f, 0.13f, 1.0f});
}

static const char *copy_text_input(u32 text_length) {
  if (text_length >= BLITZ_TEXT_INPUT_BYTES ||
      text_pool_used + text_length + 1u > BLITZ_TEXT_POOL_BYTES) {
    return 0;
  }
  char *destination = &text_pool[text_pool_used];
  for (u32 i = 0u; i < text_length; i += 1u) {
    destination[i] = text_input[i];
  }
  destination[text_length] = '\0';
  text_pool_used += text_length + 1u;
  return destination;
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
  free_count = 0u;
  live_count = 0u;
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
  resize_active = 0u;
  resize_entity = BLITZ_INVALID_INDEX;
  resize_handle = 0u;
  resize_start_position.x = 0.0f;
  resize_start_position.y = 0.0f;
  resize_start_size.x = 0.0f;
  resize_start_size.y = 0.0f;
  marquee_active = 0u;
  marquee_additive = 0u;
  marquee_candidate = BLITZ_INVALID_INDEX;
  selected_count = 0u;
  spawn_count = 0u;
  text_pool_used = 0u;
  drag_last_world.x = 0.0f;
  drag_last_world.y = 0.0f;
  marquee_start.x = 0.0f;
  marquee_start.y = 0.0f;
  marquee_end.x = 0.0f;
  marquee_end.y = 0.0f;
  camera_fit_initialized = 0u;
  scene_revision = 0u;
  scene_start_camera_x = 0.0f;
  scene_start_camera_y = 0.0f;
  scene_start_camera_zoom = 1.0f;
  next_object_id_sequence_hi = 0u;
  next_object_id_sequence_lo = 1u;
  last_created_object_id = object_id_zero();
  history_replaying = 0u;
  history_reset_internal();

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

  extract_static_shapes();
  extract_dynamic();
}

EXPORT("blitz_set_actor_id")
void blitz_set_actor_id(u32 actor_hi, u32 actor_lo) {
  object_id_actor_hi = actor_hi;
  object_id_actor_lo = actor_lo;
}

EXPORT("blitz_last_created_object_id_ptr")
u32 blitz_last_created_object_id_ptr(void) {
  return (u32)&last_created_object_id;
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
      uniforms.style[0] = 1.0f;
      camera_fit_initialized = 1u;
    }
    mark_view_dirty();
  }
}

EXPORT("blitz_set_camera")
void blitz_set_camera(float x, float y, float zoom) {
  uniforms.viewport_camera[2] = x;
  uniforms.viewport_camera[3] = y;
  uniforms.style[0] = clampf(zoom, 0.01f, 12.0f);
  mark_view_dirty();
}

EXPORT("blitz_pan")
void blitz_pan(float dx_pixels, float dy_pixels) {
  uniforms.viewport_camera[2] -= dx_pixels / uniforms.style[0];
  uniforms.viewport_camera[3] -= dy_pixels / uniforms.style[0];
  mark_view_dirty();
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
  mark_view_dirty();
}

EXPORT("blitz_pointer_down")
u32 blitz_pointer_down(float screen_x, float screen_y, u32 additive) {
  float world_x = 0.0f;
  float world_y = 0.0f;
  screen_to_world(screen_x, screen_y, &world_x, &world_y);

  u32 resize_target = selected_resizable_entity();
  u32 handle = hit_test_resize_handle(world_x, world_y, resize_target);
  if (!additive && handle != BLITZ_INVALID_INDEX) {
    history_begin();
    history_record_before(resize_target);
    resize_active = 1u;
    resize_entity = resize_target;
    resize_handle = handle;
    resize_start_position = world.positions[resize_target];
    resize_start_size = world.sizes[resize_target];
    dragging_selection = 0u;
    marquee_active = 0u;
    return 3u + handle;
  }

  u32 entity = hit_test_entity(world_x, world_y);
  if (entity != BLITZ_INVALID_INDEX) {
    if (additive) {
      toggle_selection(entity);
    } else if (!world.selected[entity]) {
      select_only(entity);
    }
    dragging_selection = world.selected[entity];
    if (dragging_selection) {
      history_begin();
      for (u32 selected = 0u; selected < world.entity_count; selected += 1u) {
        if (world.selected[selected]) {
          history_record_before(selected);
        }
      }
    }
    drag_last_world.x = world_x;
    drag_last_world.y = world_y;
    return 1u;
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

EXPORT("blitz_hit_test")
u32 blitz_hit_test(float screen_x, float screen_y) {
  float world_x = 0.0f;
  float world_y = 0.0f;
  screen_to_world(screen_x, screen_y, &world_x, &world_y);
  return hit_test_entity(world_x, world_y);
}

EXPORT("blitz_resize_mode_at")
u32 blitz_resize_mode_at(float screen_x, float screen_y) {
  float world_x = 0.0f;
  float world_y = 0.0f;
  screen_to_world(screen_x, screen_y, &world_x, &world_y);
  u32 handle =
      hit_test_resize_handle(world_x, world_y, selected_resizable_entity());
  return handle == BLITZ_INVALID_INDEX ? 0u : 3u + handle;
}

EXPORT("blitz_pointer_move")
void blitz_pointer_move(float screen_x, float screen_y) {
  float world_x = 0.0f;
  float world_y = 0.0f;
  screen_to_world(screen_x, screen_y, &world_x, &world_y);
  if (resize_active) {
    resize_entity_to(world_x, world_y);
    return;
  }
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
  if (resize_active) {
    resize_active = 0u;
    resize_entity = BLITZ_INVALID_INDEX;
    mark_dynamic_dirty();
    history_commit();
    return;
  }
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
    history_commit();
    return;
  }
  dragging_selection = 0u;
  if (!marquee_active) {
    history_cancel();
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
    history_cancel();
    return;
  }

  // Selection for a dragged marquee was already applied live during move.
  marquee_active = 0u;
  marquee_candidate = BLITZ_INVALID_INDEX;
  mark_dynamic_dirty();
  history_cancel();
}

EXPORT("blitz_add_rect")
void blitz_add_rect(void) {
  u32 history_owned = history_begin_owned();
  float offset = (float)(spawn_count % 6u) * 16.0f;
  u32 entity = create_user_rect(uniforms.viewport_camera[2] + offset,
                                uniforms.viewport_camera[3] + offset);
  spawn_count += 1u;
  select_only(entity);
  mark_render_list_dirty();
  if (history_owned) history_commit();
}

EXPORT("blitz_add_circle")
void blitz_add_circle(void) {
  u32 history_owned = history_begin_owned();
  float offset = (float)(spawn_count % 6u) * 16.0f;
  u32 entity = create_user_circle(uniforms.viewport_camera[2] + offset,
                                  uniforms.viewport_camera[3] + offset);
  spawn_count += 1u;
  select_only(entity);
  mark_render_list_dirty();
  if (history_owned) history_commit();
}

EXPORT("blitz_add_triangle")
void blitz_add_triangle(void) {
  u32 history_owned = history_begin_owned();
  float offset = (float)(spawn_count % 6u) * 16.0f;
  u32 entity = create_user_triangle(uniforms.viewport_camera[2] + offset,
                                    uniforms.viewport_camera[3] + offset);
  spawn_count += 1u;
  select_only(entity);
  mark_render_list_dirty();
  if (history_owned) history_commit();
}

EXPORT("blitz_add_text")
void blitz_add_text(void) {
  u32 history_owned = history_begin_owned();
  float offset = (float)(spawn_count % 6u) * 16.0f;
  u32 entity = create_user_text(uniforms.viewport_camera[2] + offset,
                                uniforms.viewport_camera[3] + offset);
  spawn_count += 1u;
  select_only(entity);
  mark_render_list_dirty();
  if (history_owned) history_commit();
}

static void clear_scene_state(void) {
  world.entity_count = 0u;
  world.draw_order_count = 0u;
  free_count = 0u;
  live_count = 0u;
  selected_count = 0u;
  dragging_selection = 0u;
  drag_active = 0u;
  drag_offset.x = 0.0f;
  drag_offset.y = 0.0f;
  resize_active = 0u;
  resize_entity = BLITZ_INVALID_INDEX;
  uniforms.font_params[2] = 0.0f;
  uniforms.font_params[3] = 0.0f;
  marquee_active = 0u;
  marquee_candidate = BLITZ_INVALID_INDEX;
  text_pool_used = 0u;
  spawn_count = 0u;
  mark_render_list_dirty();
}

EXPORT("blitz_clear_scene")
void blitz_clear_scene(void) {
  clear_scene_state();
  history_reset_internal();
}

EXPORT("blitz_load_demo_template")
void blitz_load_demo_template(void) {
  clear_scene_state();
  history_reset_internal();
  history_begin();
  slide_origin_x = 0.0f;
  slide_origin_y = 0.0f;
  uniforms.viewport_camera[2] = 0.0f;
  uniforms.viewport_camera[3] = 0.0f;
  uniforms.style[0] = 1.0f;
  scene_start_camera_x = 0.0f;
  scene_start_camera_y = 0.0f;
  scene_start_camera_zoom = 1.0f;
  create_demo_world();
  clear_selection();
  mark_render_list_dirty();
  history_commit();
}

EXPORT("blitz_clear_selection")
void blitz_clear_selection(void) {
  clear_selection();
}

EXPORT("blitz_create_rect")
u32 blitz_create_rect(float x, float y, float width, float height,
                      float fill_r, float fill_g, float fill_b, float fill_a,
                      float stroke_r, float stroke_g, float stroke_b,
                      float stroke_a, float stroke_width) {
  if (width <= 0.0f || height <= 0.0f) {
    return BLITZ_INVALID_INDEX;
  }
  u32 history_owned = history_begin_owned();
  u32 entity = create_base_rect(
      x, y, width, height, (Color){fill_r, fill_g, fill_b, fill_a},
      (Color){stroke_r, stroke_g, stroke_b, stroke_a}, stroke_width);
  if (entity == BLITZ_INVALID_INDEX) {
    if (history_owned) history_cancel();
    return entity;
  }
  select_only(entity);
  mark_render_list_dirty();
  if (history_owned) history_commit();
  return entity;
}

EXPORT("blitz_create_circle")
u32 blitz_create_circle(float center_x, float center_y, float radius,
                        float fill_r, float fill_g, float fill_b, float fill_a,
                        float stroke_r, float stroke_g, float stroke_b,
                        float stroke_a, float stroke_width) {
  if (radius <= 0.0f) {
    return BLITZ_INVALID_INDEX;
  }
  u32 history_owned = history_begin_owned();
  u32 entity = create_base_circle(
      center_x - radius, center_y - radius, radius * 2.0f, radius * 2.0f,
      (Color){fill_r, fill_g, fill_b, fill_a},
      (Color){stroke_r, stroke_g, stroke_b, stroke_a}, stroke_width);
  if (entity == BLITZ_INVALID_INDEX) {
    if (history_owned) history_cancel();
    return entity;
  }
  select_only(entity);
  mark_render_list_dirty();
  if (history_owned) history_commit();
  return entity;
}

EXPORT("blitz_create_triangle")
u32 blitz_create_triangle(float x, float y, float width, float height,
                          float fill_r, float fill_g, float fill_b,
                          float fill_a, float stroke_r, float stroke_g,
                          float stroke_b, float stroke_a, float stroke_width) {
  if (width <= 0.0f || height <= 0.0f) {
    return BLITZ_INVALID_INDEX;
  }
  u32 history_owned = history_begin_owned();
  u32 entity = create_base_triangle(
      x, y, width, height, (Color){fill_r, fill_g, fill_b, fill_a},
      (Color){stroke_r, stroke_g, stroke_b, stroke_a}, stroke_width);
  if (entity == BLITZ_INVALID_INDEX) {
    if (history_owned) history_cancel();
    return entity;
  }
  select_only(entity);
  mark_render_list_dirty();
  if (history_owned) history_commit();
  return entity;
}

EXPORT("blitz_text_input_ptr")
u32 blitz_text_input_ptr(void) {
  return (u32)&text_input[0];
}

EXPORT("blitz_text_input_capacity")
u32 blitz_text_input_capacity(void) {
  return BLITZ_TEXT_INPUT_BYTES;
}

EXPORT("blitz_create_text")
u32 blitz_create_text(float x, float y, float font_size, float color_r,
                      float color_g, float color_b, float color_a,
                      u32 text_length) {
  if (font_size <= 0.0f || text_length == 0u) {
    return BLITZ_INVALID_INDEX;
  }
  const char *text = copy_text_input(text_length);
  if (!text) {
    return BLITZ_INVALID_INDEX;
  }
  u32 history_owned = history_begin_owned();
  u32 entity = create_base_text(
      text, x, y, font_size, (Color){color_r, color_g, color_b, color_a});
  if (entity == BLITZ_INVALID_INDEX) {
    if (history_owned) history_cancel();
    return entity;
  }
  select_only(entity);
  mark_render_list_dirty();
  if (history_owned) history_commit();
  return entity;
}

EXPORT("blitz_query_scene")
u32 blitz_query_scene(float min_x, float min_y, float max_x, float max_y,
                      u32 limit) {
  scene_query_count = 0u;
  scene_query_total = 0u;
  if (limit > BLITZ_MAX_SCENE_QUERY_ITEMS) {
    limit = BLITZ_MAX_SCENE_QUERY_ITEMS;
  }

  for (u32 order = 0u; order < world.draw_order_count; order += 1u) {
    u32 entity = world.draw_order[order];
    u32 mask = world.masks[entity];
    u32 base_required = BLITZ_COMPONENT_POSITION | BLITZ_COMPONENT_SIZE;
    if ((mask & base_required) != base_required) {
      continue;
    }
    Vec2 position = world.positions[entity];
    Vec2 size = world.sizes[entity];
    if (!bounds_overlap(position.x, position.y, size.x, size.y, min_x, min_y,
                        max_x, max_y)) {
      continue;
    }

    u32 kind = BLITZ_INVALID_INDEX;
    Color fill = {0.0f, 0.0f, 0.0f, 0.0f};
    Color stroke = {0.0f, 0.0f, 0.0f, 0.0f};
    float stroke_width = 0.0f;
    float font_size = 0.0f;
    const char *text = 0;
    if (mask & BLITZ_COMPONENT_RECT_VIEW) {
      RectView view = world.rect_views[entity];
      kind = BLITZ_SHAPE_RECT;
      fill = view.fill_color;
      stroke = view.stroke_color;
      stroke_width = view.stroke_width;
    } else if (mask & BLITZ_COMPONENT_TRIANGLE_VIEW) {
      TriangleView view = world.triangle_views[entity];
      kind = BLITZ_SHAPE_TRIANGLE;
      fill = view.fill_color;
      stroke = view.stroke_color;
      stroke_width = view.stroke_width;
    } else if (mask & BLITZ_COMPONENT_CIRCLE_VIEW) {
      CircleView view = world.circle_views[entity];
      kind = BLITZ_SHAPE_CIRCLE;
      fill = view.fill_color;
      stroke = view.stroke_color;
      stroke_width = view.stroke_width;
    } else if (mask & BLITZ_COMPONENT_TEXT_VIEW) {
      TextView view = world.text_views[entity];
      kind = BLITZ_SHAPE_TEXT;
      fill = view.color;
      font_size = view.font_size;
      text = view.text;
    } else {
      continue;
    }

    scene_query_total += 1u;
    if (scene_query_count >= limit) {
      continue;
    }
    SceneItem *item = &scene_query_items[scene_query_count];
    item->object_id = world.object_ids[entity];
    item->shape_kind = kind;
    item->order = order;
    item->selected = world.selected[entity];
    item->text_ptr = text ? (u32)text : 0u;
    item->text_length = text ? string_length(text) : 0u;
    item->_pad0 = 0u;
    item->bounds[0] = position.x;
    item->bounds[1] = position.y;
    item->bounds[2] = size.x;
    item->bounds[3] = size.y;
    item->fill_color[0] = fill.r;
    item->fill_color[1] = fill.g;
    item->fill_color[2] = fill.b;
    item->fill_color[3] = fill.a;
    item->stroke_color[0] = stroke.r;
    item->stroke_color[1] = stroke.g;
    item->stroke_color[2] = stroke.b;
    item->stroke_color[3] = stroke.a;
    item->style[0] = stroke_width;
    item->style[1] = font_size;
    scene_query_count += 1u;
  }
  return scene_query_count;
}

EXPORT("blitz_scene_query_ptr")
u32 blitz_scene_query_ptr(void) {
  return (u32)&scene_query_items[0];
}

EXPORT("blitz_scene_query_item_bytes")
u32 blitz_scene_query_item_bytes(void) {
  return sizeof(SceneItem);
}

EXPORT("blitz_scene_query_count")
u32 blitz_scene_query_count(void) {
  return scene_query_count;
}

EXPORT("blitz_scene_query_total")
u32 blitz_scene_query_total(void) {
  return scene_query_total;
}

EXPORT("blitz_scene_file_buffer_ptr")
u32 blitz_scene_file_buffer_ptr(void) {
  return (u32)&scene_file_buffer[0];
}

EXPORT("blitz_scene_file_buffer_capacity")
u32 blitz_scene_file_buffer_capacity(void) {
  return BLITZ_SCENE_FILE_BUFFER_BYTES;
}

EXPORT("blitz_scene_revision")
u32 blitz_scene_revision(void) {
  return scene_revision;
}

EXPORT("blitz_capture_start_viewpoint")
void blitz_capture_start_viewpoint(void) {
  scene_start_camera_x = uniforms.viewport_camera[2];
  scene_start_camera_y = uniforms.viewport_camera[3];
  scene_start_camera_zoom = uniforms.style[0];
}

EXPORT("blitz_scene_serialize")
u32 blitz_scene_serialize(void) {
  u32 offset = BLITZ_SCENE_FILE_HEADER_BYTES;
  u32 object_count = 0u;

  for (u32 order = 0u; order < world.draw_order_count; order += 1u) {
    u32 entity = world.draw_order[order];
    u32 mask = world.masks[entity];
    u32 kind = BLITZ_INVALID_INDEX;
    Color fill = {0.0f, 0.0f, 0.0f, 0.0f};
    Color stroke = {0.0f, 0.0f, 0.0f, 0.0f};
    float stroke_width = 0.0f;
    float font_size = 0.0f;
    float origin_x = 0.0f;
    float baseline_offset = 0.0f;
    const char *text = 0;
    u32 text_length = 0u;

    if (mask & BLITZ_COMPONENT_RECT_VIEW) {
      RectView view = world.rect_views[entity];
      kind = BLITZ_SHAPE_RECT;
      fill = view.fill_color;
      stroke = view.stroke_color;
      stroke_width = view.stroke_width;
    } else if (mask & BLITZ_COMPONENT_TRIANGLE_VIEW) {
      TriangleView view = world.triangle_views[entity];
      kind = BLITZ_SHAPE_TRIANGLE;
      fill = view.fill_color;
      stroke = view.stroke_color;
      stroke_width = view.stroke_width;
    } else if (mask & BLITZ_COMPONENT_CIRCLE_VIEW) {
      CircleView view = world.circle_views[entity];
      kind = BLITZ_SHAPE_CIRCLE;
      fill = view.fill_color;
      stroke = view.stroke_color;
      stroke_width = view.stroke_width;
    } else if (mask & BLITZ_COMPONENT_TEXT_VIEW) {
      TextView view = world.text_views[entity];
      kind = BLITZ_SHAPE_TEXT;
      fill = view.color;
      font_size = view.font_size;
      origin_x = view.origin_x;
      baseline_offset = view.baseline_offset;
      text = view.text;
      text_length = string_length(text);
    } else {
      continue;
    }

    u32 record_bytes = BLITZ_SCENE_FILE_RECORD_BYTES + align4(text_length);
    if (offset + record_bytes > BLITZ_SCENE_FILE_BUFFER_BYTES) {
      return 0u;
    }

    Vec2 position = world.positions[entity];
    Vec2 size = world.sizes[entity];
    write_u32(scene_file_buffer, offset, kind);
    write_u32(scene_file_buffer, offset + 4u, record_bytes);
    ObjectId object_id = world.object_ids[entity];
    write_u32(scene_file_buffer, offset + 8u, object_id.sequence_lo);
    write_u32(scene_file_buffer, offset + 12u, text_length);
    write_f32(scene_file_buffer, offset + 16u, position.x);
    write_f32(scene_file_buffer, offset + 20u, position.y);
    write_f32(scene_file_buffer, offset + 24u, size.x);
    write_f32(scene_file_buffer, offset + 28u, size.y);
    write_f32(scene_file_buffer, offset + 32u, fill.r);
    write_f32(scene_file_buffer, offset + 36u, fill.g);
    write_f32(scene_file_buffer, offset + 40u, fill.b);
    write_f32(scene_file_buffer, offset + 44u, fill.a);
    write_f32(scene_file_buffer, offset + 48u, stroke.r);
    write_f32(scene_file_buffer, offset + 52u, stroke.g);
    write_f32(scene_file_buffer, offset + 56u, stroke.b);
    write_f32(scene_file_buffer, offset + 60u, stroke.a);
    write_f32(scene_file_buffer, offset + 64u, stroke_width);
    write_f32(scene_file_buffer, offset + 68u, font_size);
    write_f32(scene_file_buffer, offset + 72u, origin_x);
    write_f32(scene_file_buffer, offset + 76u, baseline_offset);
    write_u32(scene_file_buffer, offset + 80u, object_id.actor_hi);
    write_u32(scene_file_buffer, offset + 84u, object_id.actor_lo);
    write_u32(scene_file_buffer, offset + 88u, object_id.sequence_hi);
    for (u32 i = 0u; i < align4(text_length); i += 1u) {
      scene_file_buffer[offset + BLITZ_SCENE_FILE_RECORD_BYTES + i] =
          i < text_length ? (unsigned char)text[i] : 0u;
    }
    offset += record_bytes;
    object_count += 1u;
  }

  write_u32(scene_file_buffer, 0u, BLITZ_SCENE_FILE_MAGIC);
  write_u32(scene_file_buffer, 4u, BLITZ_SCENE_FILE_VERSION);
  write_u32(scene_file_buffer, 8u, offset);
  write_u32(scene_file_buffer, 12u, object_count);
  write_f32(scene_file_buffer, 16u, scene_start_camera_x);
  write_f32(scene_file_buffer, 20u, scene_start_camera_y);
  write_f32(scene_file_buffer, 24u, scene_start_camera_zoom);
  write_u32(scene_file_buffer, 28u, 0u);
  return offset;
}

// Returns 0 on success. Non-zero values indicate invalid or unsupported data.
EXPORT("blitz_scene_deserialize")
u32 blitz_scene_deserialize(u32 byte_count) {
  if (byte_count < BLITZ_SCENE_FILE_HEADER_BYTES ||
      byte_count > BLITZ_SCENE_FILE_BUFFER_BYTES) {
    return 1u;
  }
  if (read_u32(scene_file_buffer, 0u) != BLITZ_SCENE_FILE_MAGIC) {
    return 2u;
  }
  u32 file_version = read_u32(scene_file_buffer, 4u);
  if (file_version != 1u && file_version != 2u &&
      file_version != BLITZ_SCENE_FILE_VERSION) {
    return 3u;
  }
  if (read_u32(scene_file_buffer, 8u) != byte_count) {
    return 4u;
  }
  u32 object_count = read_u32(scene_file_buffer, 12u);
  if (object_count > BLITZ_MAX_ENTITIES) {
    return 5u;
  }

  float camera_x = read_f32(scene_file_buffer, 16u);
  float camera_y = read_f32(scene_file_buffer, 20u);
  float camera_zoom = read_f32(scene_file_buffer, 24u);
  if (!(camera_zoom > 0.0f)) {
    return 6u;
  }

  u32 offset = BLITZ_SCENE_FILE_HEADER_BYTES;
  u32 required_text_bytes = 0u;
  u32 fixed_record_bytes = file_version >= 3u
                               ? BLITZ_SCENE_FILE_RECORD_BYTES
                               : BLITZ_SCENE_FILE_LEGACY_RECORD_BYTES;
  for (u32 index = 0u; index < object_count; index += 1u) {
    if (offset + fixed_record_bytes > byte_count) {
      return 7u;
    }
    u32 kind = read_u32(scene_file_buffer, offset);
    u32 record_bytes = read_u32(scene_file_buffer, offset + 4u);
    u32 text_length = read_u32(scene_file_buffer, offset + 12u);
    if (kind > BLITZ_SHAPE_TEXT ||
        record_bytes < fixed_record_bytes ||
        offset + record_bytes > byte_count ||
        text_length > record_bytes - fixed_record_bytes) {
      return 8u;
    }
    float width = read_f32(scene_file_buffer, offset + 24u);
    float height = read_f32(scene_file_buffer, offset + 28u);
    if (!(width > 0.0f) || !(height > 0.0f)) {
      return 9u;
    }
    if (kind == BLITZ_SHAPE_TEXT) {
      if (text_length == 0u ||
          required_text_bytes + text_length + 1u > BLITZ_TEXT_POOL_BYTES) {
        return 10u;
      }
      required_text_bytes += text_length + 1u;
    } else if (text_length != 0u) {
      return 11u;
    }
    offset += record_bytes;
  }
  if (offset != byte_count) {
    return 12u;
  }

  clear_scene_state();
  offset = BLITZ_SCENE_FILE_HEADER_BYTES;
  for (u32 index = 0u; index < object_count; index += 1u) {
    u32 kind = read_u32(scene_file_buffer, offset);
    u32 record_bytes = read_u32(scene_file_buffer, offset + 4u);
    ObjectId object_id;
    if (file_version >= 3u) {
      object_id.actor_hi = read_u32(scene_file_buffer, offset + 80u);
      object_id.actor_lo = read_u32(scene_file_buffer, offset + 84u);
      object_id.sequence_hi = read_u32(scene_file_buffer, offset + 88u);
      object_id.sequence_lo = read_u32(scene_file_buffer, offset + 8u);
    } else {
      object_id.actor_hi = 0u;
      object_id.actor_lo = 0u;
      object_id.sequence_hi = 0u;
      object_id.sequence_lo =
          file_version >= 2u ? read_u32(scene_file_buffer, offset + 8u)
                             : index + 1u;
    }
    u32 text_length = read_u32(scene_file_buffer, offset + 12u);
    float x = read_f32(scene_file_buffer, offset + 16u);
    float y = read_f32(scene_file_buffer, offset + 20u);
    float width = read_f32(scene_file_buffer, offset + 24u);
    float height = read_f32(scene_file_buffer, offset + 28u);
    Color fill = {read_f32(scene_file_buffer, offset + 32u),
                  read_f32(scene_file_buffer, offset + 36u),
                  read_f32(scene_file_buffer, offset + 40u),
                  read_f32(scene_file_buffer, offset + 44u)};
    Color stroke = {read_f32(scene_file_buffer, offset + 48u),
                    read_f32(scene_file_buffer, offset + 52u),
                    read_f32(scene_file_buffer, offset + 56u),
                    read_f32(scene_file_buffer, offset + 60u)};
    float stroke_width = read_f32(scene_file_buffer, offset + 64u);
    float font_size = read_f32(scene_file_buffer, offset + 68u);
    float origin_x = read_f32(scene_file_buffer, offset + 72u);
    float baseline_offset = read_f32(scene_file_buffer, offset + 76u);

    u32 entity = ecs_create_entity();
    if (entity == BLITZ_INVALID_INDEX) {
      clear_scene_state();
      return 13u;
    }
    if (!object_id_is_zero(object_id)) {
      world.object_ids[entity] = object_id;
      advance_sequence_past(object_id);
    }
    ecs_set_position(entity, x, y);
    ecs_set_size(entity, width, height);
    if (kind == BLITZ_SHAPE_RECT) {
      ecs_set_rect_view(entity, fill, stroke, stroke_width);
      ecs_set_resizable(entity);
    } else if (kind == BLITZ_SHAPE_TRIANGLE) {
      ecs_set_triangle_view(entity, fill, stroke, stroke_width);
      ecs_set_resizable(entity);
    } else if (kind == BLITZ_SHAPE_CIRCLE) {
      ecs_set_circle_view(entity, fill, stroke, stroke_width);
      ecs_set_resizable(entity);
    } else {
      char *text = &text_pool[text_pool_used];
      for (u32 i = 0u; i < text_length; i += 1u) {
        text[i] = (char)scene_file_buffer[
            offset + fixed_record_bytes + i];
      }
      text[text_length] = '\0';
      text_pool_used += text_length + 1u;
      ecs_set_text_view(entity, text, fill, font_size, origin_x,
                        baseline_offset);
    }
    world.masks[entity] |= BLITZ_COMPONENT_SELECTABLE;
    world.selected[entity] = 0u;
    offset += record_bytes;
  }

  uniforms.viewport_camera[2] = camera_x;
  uniforms.viewport_camera[3] = camera_y;
  uniforms.style[0] = clampf(camera_zoom, 0.01f, 12.0f);
  scene_start_camera_x = camera_x;
  scene_start_camera_y = camera_y;
  scene_start_camera_zoom = uniforms.style[0];
  mark_render_list_dirty();
  history_reset_internal();
  return 0u;
}

EXPORT("blitz_stress_test")
void blitz_stress_test(void) {
  history_reset_internal();
  const u32 columns = 200u;
  const u32 rows = 100u;
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
  history_reset_internal();
}

EXPORT("blitz_delete_selected")
void blitz_delete_selected(void) {
  if (selected_count == 0u) {
    return;
  }
  history_begin();
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (world.selected[entity]) {
      history_record_deleted(entity);
    }
  }
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (world.selected[entity]) {
      remove_entity(entity);
    }
  }
  selected_count = 0u;
  dragging_selection = 0u;
  drag_active = 0u;
  resize_active = 0u;
  resize_entity = BLITZ_INVALID_INDEX;
  mark_render_list_dirty();
  history_commit();
}

EXPORT("blitz_has_selection")
u32 blitz_has_selection(void) {
  return selected_count > 0u;
}

// Capability mask: bit 0 = geometric styles, bit 1 = text color.
EXPORT("blitz_selected_style_kind")
u32 blitz_selected_style_kind(void) {
  u32 kind = 0u;
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (!world.selected[entity]) {
      continue;
    }
    if (world.masks[entity] & BLITZ_COMPONENT_TEXT_VIEW) {
      kind |= 2u;
    }
    if (world.masks[entity] & (BLITZ_COMPONENT_RECT_VIEW |
                               BLITZ_COMPONENT_TRIANGLE_VIEW |
                               BLITZ_COMPONENT_CIRCLE_VIEW)) {
      kind |= 1u;
    }
  }
  return kind;
}

EXPORT("blitz_selected_style_ptr")
u32 blitz_selected_style_ptr(void) {
  Color fill = {0.0f, 0.0f, 0.0f, 1.0f};
  Color stroke = {0.0f, 0.0f, 0.0f, 1.0f};
  Color text_color = {0.0f, 0.0f, 0.0f, 1.0f};
  float stroke_width = 0.0f;
  u32 found_geometry = 0u;
  u32 found_text = 0u;
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (!world.selected[entity]) {
      continue;
    }
    if (!found_geometry &&
        (world.masks[entity] & (BLITZ_COMPONENT_RECT_VIEW |
                                BLITZ_COMPONENT_TRIANGLE_VIEW |
                                BLITZ_COMPONENT_CIRCLE_VIEW))) {
      found_geometry = 1u;
      if (world.masks[entity] & BLITZ_COMPONENT_RECT_VIEW) {
        RectView view = world.rect_views[entity];
        fill = view.fill_color;
        stroke = view.stroke_color;
        stroke_width = view.stroke_width;
      } else if (world.masks[entity] & BLITZ_COMPONENT_TRIANGLE_VIEW) {
        TriangleView view = world.triangle_views[entity];
        fill = view.fill_color;
        stroke = view.stroke_color;
        stroke_width = view.stroke_width;
      } else {
        CircleView view = world.circle_views[entity];
        fill = view.fill_color;
        stroke = view.stroke_color;
        stroke_width = view.stroke_width;
      }
    }
    if (!found_text && (world.masks[entity] & BLITZ_COMPONENT_TEXT_VIEW)) {
      found_text = 1u;
      text_color = world.text_views[entity].color;
    }
    if (found_geometry && found_text) {
      break;
    }
  }
  selected_style[0] = fill.r;
  selected_style[1] = fill.g;
  selected_style[2] = fill.b;
  selected_style[3] = fill.a;
  selected_style[4] = stroke.r;
  selected_style[5] = stroke.g;
  selected_style[6] = stroke.b;
  selected_style[7] = stroke.a;
  selected_style[8] = stroke_width;
  selected_style[9] = text_color.r;
  selected_style[10] = text_color.g;
  selected_style[11] = text_color.b;
  selected_style[12] = text_color.a;
  return (u32)&selected_style[0];
}

EXPORT("blitz_selected_style_f32_count")
u32 blitz_selected_style_f32_count(void) {
  return 13u;
}

EXPORT("blitz_set_selected_fill")
void blitz_set_selected_fill(float r, float g, float b) {
  u32 history_owned = !history_transaction_active;
  history_record_selected_before();
  u32 changed = 0u;
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (!world.selected[entity]) continue;
    if (world.masks[entity] & BLITZ_COMPONENT_RECT_VIEW) {
      world.rect_views[entity].fill_color.r = r;
      world.rect_views[entity].fill_color.g = g;
      world.rect_views[entity].fill_color.b = b;
      changed = 1u;
    } else if (world.masks[entity] & BLITZ_COMPONENT_TRIANGLE_VIEW) {
      world.triangle_views[entity].fill_color.r = r;
      world.triangle_views[entity].fill_color.g = g;
      world.triangle_views[entity].fill_color.b = b;
      changed = 1u;
    } else if (world.masks[entity] & BLITZ_COMPONENT_CIRCLE_VIEW) {
      world.circle_views[entity].fill_color.r = r;
      world.circle_views[entity].fill_color.g = g;
      world.circle_views[entity].fill_color.b = b;
      changed = 1u;
    }
  }
  if (changed) {
    mark_render_list_dirty();
    if (history_owned) history_commit();
  } else {
    if (history_owned) history_cancel();
  }
}

EXPORT("blitz_set_selected_fill_opacity")
void blitz_set_selected_fill_opacity(float opacity) {
  u32 history_owned = !history_transaction_active;
  history_record_selected_before();
  opacity = clampf(opacity, 0.0f, 1.0f);
  u32 changed = 0u;
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (!world.selected[entity]) continue;
    if (world.masks[entity] & BLITZ_COMPONENT_RECT_VIEW) {
      world.rect_views[entity].fill_color.a = opacity;
      changed = 1u;
    } else if (world.masks[entity] & BLITZ_COMPONENT_TRIANGLE_VIEW) {
      world.triangle_views[entity].fill_color.a = opacity;
      changed = 1u;
    } else if (world.masks[entity] & BLITZ_COMPONENT_CIRCLE_VIEW) {
      world.circle_views[entity].fill_color.a = opacity;
      changed = 1u;
    }
  }
  if (changed) {
    mark_render_list_dirty();
    if (history_owned) history_commit();
  } else {
    if (history_owned) history_cancel();
  }
}

EXPORT("blitz_set_selected_stroke")
void blitz_set_selected_stroke(float r, float g, float b) {
  u32 history_owned = !history_transaction_active;
  history_record_selected_before();
  u32 changed = 0u;
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (!world.selected[entity]) continue;
    if (world.masks[entity] & BLITZ_COMPONENT_RECT_VIEW) {
      world.rect_views[entity].stroke_color.r = r;
      world.rect_views[entity].stroke_color.g = g;
      world.rect_views[entity].stroke_color.b = b;
      changed = 1u;
    } else if (world.masks[entity] & BLITZ_COMPONENT_TRIANGLE_VIEW) {
      world.triangle_views[entity].stroke_color.r = r;
      world.triangle_views[entity].stroke_color.g = g;
      world.triangle_views[entity].stroke_color.b = b;
      changed = 1u;
    } else if (world.masks[entity] & BLITZ_COMPONENT_CIRCLE_VIEW) {
      world.circle_views[entity].stroke_color.r = r;
      world.circle_views[entity].stroke_color.g = g;
      world.circle_views[entity].stroke_color.b = b;
      changed = 1u;
    }
  }
  if (changed) {
    mark_render_list_dirty();
    if (history_owned) history_commit();
  } else {
    if (history_owned) history_cancel();
  }
}

EXPORT("blitz_set_selected_stroke_opacity")
void blitz_set_selected_stroke_opacity(float opacity) {
  u32 history_owned = !history_transaction_active;
  history_record_selected_before();
  opacity = clampf(opacity, 0.0f, 1.0f);
  u32 changed = 0u;
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (!world.selected[entity]) continue;
    if (world.masks[entity] & BLITZ_COMPONENT_RECT_VIEW) {
      world.rect_views[entity].stroke_color.a = opacity;
      changed = 1u;
    } else if (world.masks[entity] & BLITZ_COMPONENT_TRIANGLE_VIEW) {
      world.triangle_views[entity].stroke_color.a = opacity;
      changed = 1u;
    } else if (world.masks[entity] & BLITZ_COMPONENT_CIRCLE_VIEW) {
      world.circle_views[entity].stroke_color.a = opacity;
      changed = 1u;
    }
  }
  if (changed) {
    mark_render_list_dirty();
    if (history_owned) history_commit();
  } else {
    if (history_owned) history_cancel();
  }
}

EXPORT("blitz_set_selected_stroke_width")
void blitz_set_selected_stroke_width(float width) {
  u32 history_owned = !history_transaction_active;
  history_record_selected_before();
  width = clampf(width, 0.0f, 64.0f);
  u32 changed = 0u;
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (!world.selected[entity]) continue;
    if (world.masks[entity] & BLITZ_COMPONENT_RECT_VIEW) {
      world.rect_views[entity].stroke_width = width;
      changed = 1u;
    } else if (world.masks[entity] & BLITZ_COMPONENT_TRIANGLE_VIEW) {
      world.triangle_views[entity].stroke_width = width;
      changed = 1u;
    } else if (world.masks[entity] & BLITZ_COMPONENT_CIRCLE_VIEW) {
      world.circle_views[entity].stroke_width = width;
      changed = 1u;
    }
  }
  if (changed) {
    mark_render_list_dirty();
    if (history_owned) history_commit();
  } else {
    if (history_owned) history_cancel();
  }
}

EXPORT("blitz_set_selected_text_color")
void blitz_set_selected_text_color(float r, float g, float b) {
  u32 history_owned = !history_transaction_active;
  history_record_selected_before();
  u32 changed = 0u;
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (!world.selected[entity] ||
        !(world.masks[entity] & BLITZ_COMPONENT_TEXT_VIEW)) {
      continue;
    }
    world.text_views[entity].color.r = r;
    world.text_views[entity].color.g = g;
    world.text_views[entity].color.b = b;
    changed = 1u;
  }
  if (changed) {
    mark_render_list_dirty();
    if (history_owned) history_commit();
  } else {
    if (history_owned) history_cancel();
  }
}

EXPORT("blitz_set_selected_text_opacity")
void blitz_set_selected_text_opacity(float opacity) {
  u32 history_owned = !history_transaction_active;
  history_record_selected_before();
  opacity = clampf(opacity, 0.0f, 1.0f);
  u32 changed = 0u;
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (!world.selected[entity] ||
        !(world.masks[entity] & BLITZ_COMPONENT_TEXT_VIEW)) {
      continue;
    }
    world.text_views[entity].color.a = opacity;
    changed = 1u;
  }
  if (changed) {
    mark_render_list_dirty();
    if (history_owned) history_commit();
  } else {
    if (history_owned) history_cancel();
  }
}

EXPORT("blitz_select_all")
void blitz_select_all(void) {
  selected_count = 0u;
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    u32 selected =
        world.masks[entity] & BLITZ_COMPONENT_SELECTABLE ? 1u : 0u;
    world.selected[entity] = selected;
    selected_count += selected;
  }
  mark_dynamic_dirty();
}

EXPORT("blitz_bring_to_front")
void blitz_bring_to_front(void) {
  if (selected_count == 0u) {
    return;
  }
  history_record_selected_before();
  reorder_selection(0u);
  history_commit();
}

EXPORT("blitz_send_to_back")
void blitz_send_to_back(void) {
  if (selected_count == 0u) {
    return;
  }
  history_record_selected_before();
  reorder_selection(1u);
  history_commit();
}

EXPORT("blitz_history_undo")
u32 blitz_history_undo(void) {
  history_cancel();
  if (history_cursor == 0u) {
    return 0u;
  }
  history_cursor -= 1u;
  history_apply_entry(history_entries[history_cursor], 0u);
  return 1u;
}

EXPORT("blitz_history_begin")
void blitz_history_begin(void) {
  history_begin();
}

EXPORT("blitz_history_commit")
void blitz_history_commit(void) {
  history_commit();
}

EXPORT("blitz_history_redo")
u32 blitz_history_redo(void) {
  history_cancel();
  if (history_cursor >= history_entry_count) {
    return 0u;
  }
  history_apply_entry(history_entries[history_cursor], 1u);
  history_cursor += 1u;
  return 1u;
}

EXPORT("blitz_history_reset")
void blitz_history_reset(void) {
  history_reset_internal();
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
  return live_count;
}

EXPORT("blitz_selected_count")
u32 blitz_selected_count(void) {
  return selected_count;
}

// Estimated bytes actually written (a proxy for committed RAM): per-entity
// arrays up to the high-water entity count, plus the populated draw buffers.
// The statically reserved arrays are far larger but their untouched pages
// stay demand-zero and cost no physical memory.
EXPORT("blitz_wasm_live_bytes")
u32 blitz_wasm_live_bytes(void) {
  u32 per_entity = 6u * (u32)sizeof(u32) + 2u * (u32)sizeof(Vec2) +
                   (u32)sizeof(RectView) + (u32)sizeof(TriangleView) +
                   (u32)sizeof(CircleView) + (u32)sizeof(TextView);
  u32 entity_bytes = world.entity_count * per_entity;
  u32 draw_bytes = shape_command_count * (u32)sizeof(ShapeCommand) +
                   rect_draw_count * (u32)sizeof(RectDraw) +
                   triangle_draw_count * (u32)sizeof(TriangleDraw) +
                   circle_draw_count * (u32)sizeof(CircleDraw) +
                   text_draw_count * (u32)sizeof(TextDraw) +
                   dyn_command_count * (u32)sizeof(ShapeCommand) +
                   dyn_rect_count * (u32)sizeof(RectDraw);
  return entity_bytes + draw_bytes + text_pool_used;
}

EXPORT("blitz_render_chunk_rects")
u32 blitz_render_chunk_rects(void) {
  return BLITZ_RENDER_CHUNK_RECTS;
}

EXPORT("blitz_render_max_shapes")
u32 blitz_render_max_shapes(void) {
  return BLITZ_MAX_RECT_DRAWS;
}
