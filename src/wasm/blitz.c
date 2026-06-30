typedef unsigned int u32;
typedef unsigned short u16;
typedef unsigned long usize;

#include "font.generated.h"

#define EXPORT(name) __attribute__((export_name(name)))

usize strlen(const char *text) {
  usize length = 0;
  while (text[length] != '\0') {
    length += 1;
  }
  return length;
}

// --- Configuration & limits ------------------------------------------------
// Capacity ceiling, not a reservation: all per-entity storage grows on demand,
// so this only bounds entity creation and the render dispatch. 4M keeps the
// single-dimension GPU cull dispatch (ceil(n/64) workgroups) under the 65535
// limit; the wasm32 4 GB linear-memory ceiling is the next wall beyond that.
#define BLITZ_MAX_ENTITIES 4000000u
#define BLITZ_RENDER_CHUNK_RECTS 250000u
// Every entity may be a renderable static shape, so the draw-stream ceiling
// tracks the entity ceiling.
#define BLITZ_MAX_RECT_DRAWS BLITZ_MAX_ENTITIES
#define BLITZ_MAX_TEXT_DRAWS 262144u
#define BLITZ_MAX_DYN_RECTS 1000000u
#define BLITZ_MAX_DYN_COMMANDS (BLITZ_MAX_TEXT_DRAWS + BLITZ_MAX_DYN_RECTS)
#define BLITZ_MIN_TEXT_PX 3.0f
#define BLITZ_TEXT_INPUT_BYTES 4096u
#define BLITZ_TEXT_POOL_BYTES (16u * 1024u * 1024u)
#define BLITZ_MAX_SCENE_QUERY_ITEMS 65536u
// Demand-grown (allocated only during serialize/deserialize), so this is the
// load-acceptance ceiling, not a reservation. 512 MB covers a full ~4M-entity
// scene (records + text); it is the load/restore size guard.
#define BLITZ_SCENE_FILE_BUFFER_BYTES (512u * 1024u * 1024u)
#define BLITZ_SCENE_FILE_MAGIC 0x5a544c42u
#define BLITZ_SCENE_FILE_VERSION 8u
#define BLITZ_SCENE_FILE_HEADER_BYTES 32u
#define BLITZ_SCENE_FILE_LEGACY_RECORD_BYTES 80u
#define BLITZ_SCENE_FILE_RECORD_BYTES 92u
#define BLITZ_SCENE_FILE_V4_RECORD_BYTES 108u
#define BLITZ_SCENE_FILE_V6_RECORD_BYTES 112u
// v8 appends the parent's object_id (16B) + relative offset (8B) at +112.
#define BLITZ_SCENE_FILE_V8_RECORD_BYTES 136u
#define BLITZ_MAX_TEXT_LAYOUT_LINES 256u
#define BLITZ_CONTAINER_RETARGET_SELECTION_LIMIT 32u
#define BLITZ_PATH_INPUT_POINTS 8192u
// Coarse LOD keeps every Nth point; used only when a stroke is very small on
// screen. Keep this conservative: high strides make handwriting visibly angular.
#define BLITZ_PATH_LOD_STRIDE 4u

#define BLITZ_INVALID_INDEX 0xffffffffu
// High bit of a command's order word: set while the command's entity is being
// dragged, so the shader translates it by the drag offset instead of rebuilding.
#define BLITZ_DRAG_FLAG 0x80000000u

// Component bitmask: which components an entity carries.
#define BLITZ_COMPONENT_POSITION 1u
#define BLITZ_COMPONENT_SIZE 2u
#define BLITZ_COMPONENT_RECT_VIEW 4u
#define BLITZ_COMPONENT_TRIANGLE_VIEW 8u
#define BLITZ_COMPONENT_OVAL_VIEW 16u
#define BLITZ_COMPONENT_TEXT_VIEW 32u
#define BLITZ_COMPONENT_SELECTABLE 64u
#define BLITZ_COMPONENT_RESIZABLE_X 128u
#define BLITZ_COMPONENT_RESIZABLE_Y 256u
#define BLITZ_COMPONENT_RELATIVE_TRANSFORM 512u
#define BLITZ_COMPONENT_CONTAINER 1024u
#define BLITZ_COMPONENT_FRAME_VIEW 2048u
#define BLITZ_COMPONENT_PATH_VIEW 4096u

// Shape-kind discriminants (SceneItem.shape_kind, debug queries).
#define BLITZ_SHAPE_RECT 0u
#define BLITZ_SHAPE_TRIANGLE 1u
#define BLITZ_SHAPE_OVAL 2u
#define BLITZ_SHAPE_TEXT 3u
#define BLITZ_SHAPE_FRAME 4u
#define BLITZ_SHAPE_PATH 5u

// blitz_update_object field-change bitmask.
#define BLITZ_UPDATE_X 1u
#define BLITZ_UPDATE_Y 2u
#define BLITZ_UPDATE_WIDTH 4u
#define BLITZ_UPDATE_HEIGHT 8u
#define BLITZ_UPDATE_FILL 16u
#define BLITZ_UPDATE_STROKE 32u
#define BLITZ_UPDATE_STROKE_WIDTH 64u
#define BLITZ_UPDATE_TEXT 128u
#define BLITZ_UPDATE_FONT_SIZE 256u
#define BLITZ_UPDATE_TEXT_COLOR 512u
#define BLITZ_UPDATE_MAX_WIDTH 1024u
#define BLITZ_UPDATE_LINE_HEIGHT 2048u
#define BLITZ_UPDATE_MAX_LINES 4096u
#define BLITZ_UPDATE_ALIGN 8192u

// --- Data structures -------------------------------------------------------
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

// Per-entity LWW version: merges compare (lamport, actor_hi, actor_lo), so the
// actor id breaks ties and the outcome is independent of delivery order.
typedef struct CrdtVersion {
  u32 lamport;
  u32 actor_hi;
  u32 actor_lo;
} CrdtVersion;

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

typedef struct OvalView {
  Color fill_color;
  Color stroke_color;
  float stroke_width;
} OvalView;

typedef struct TextView {
  const char *text;
  Color color;
  float font_size;
  float origin_x;
  float baseline_offset;
  float max_width;
  float line_height;
  u32 max_lines;
  u32 align;
} TextView;

typedef struct FrameView {
  const char *title;
  Color title_color;
  float title_font_size;
} FrameView;

typedef struct PathView {
  Vec2 *points;
  u32 point_count;
  Color fill_color;
  float stroke_width;
} PathView;

typedef struct RelativeTransform {
  u32 parent;
  float offset_x;
  float offset_y;
} RelativeTransform;

typedef struct TextLayoutLine {
  u32 start;
  u32 length;
  float width;
} TextLayoutLine;

typedef struct BlitzUniforms {
  float viewport_camera[4];
  float style[4];
  float background_color[4];
  float font_params[4];
  float interaction[4];
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

typedef struct OvalDraw {
  float oval[4];
  float fill_color[4];
  float stroke_color[4];
  float stroke_width_pad[4];
} OvalDraw;

typedef struct TextDraw {
  float rect[4];
  float uv_rect[4];
  float color[4];
} TextDraw;

typedef struct PathDraw {
  float bounds[4];
  float fill_color[4];
  float render[4];      // order, drag, stroke_width, point_count
  float draw_params[4]; // base_vertex, fill_index_offset, fill_index_count, _
} PathDraw;

// One capsule per pen segment: the GPU expands it to a rounded-rect quad and
// shades it with a distance field, so joins are round and ends are capped.
// Color/width/order are shared across a stroke, so they live in the PathDraw
// referenced by draw_index rather than being duplicated on every segment.
typedef struct PathSegment {
  float ax;
  float ay;
  float bx;
  float by;
  u32 draw_index;
} PathSegment;

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
  float style[6];
  ObjectId parent_object_id;
  u32 component_mask;
  u32 selected_subtree;
} SceneItem;

// Per-entity SoA storage. Indexed by entity slot; the arrays are arena-backed
// pointers that grow in lockstep to entity_count, all accessed as
// `world.member[entity]`.
typedef struct World {
  u32 entity_count;
  u32 draw_order_count;
  u32 *draw_order;
  u32 *draw_order_scratch;
  u32 *selected;
  ObjectId *object_ids;
  u32 *masks;
  Vec2 *positions;
  Vec2 *sizes;
  RectView *rect_views;
  TriangleView *triangle_views;
  OvalView *oval_views;
  TextView *text_views;
  FrameView *frame_views;
  PathView *path_views;
  RelativeTransform *relative_transforms;
  u32 *first_child;
  u32 *next_sibling;
  u32 *prev_sibling;
} World;

// --- Global state ----------------------------------------------------------
static BlitzUniforms uniforms;
// Render output: extracted on scene change, uploaded to the GPU.
static ShapeCommand *shape_commands;
static RectDraw *rect_draws;
static TriangleDraw *triangle_draws;
static OvalDraw *oval_draws;
static TextDraw *text_draws;
static PathDraw *path_draws;
static PathSegment *path_segments;
static ShapeCommand *dyn_commands;
static RectDraw *dyn_rects;
// Grown-on-demand capacities for the buffers above.
static u32 shape_commands_cap;
static u32 rect_draws_cap;
static u32 triangle_draws_cap;
static u32 oval_draws_cap;
static u32 text_draws_cap;
static u32 path_draws_cap;
static u32 path_segments_cap;
static u32 dyn_commands_cap;
static u32 dyn_rects_cap;
// Input staging: JS writes text / pen points here before create/update.
static char text_input[BLITZ_TEXT_INPUT_BYTES];
static float path_input[BLITZ_PATH_INPUT_POINTS * 2u];
static Vec2 path_draft_points[BLITZ_PATH_INPUT_POINTS];
static PathView path_draft_view;
// The in-progress pen stroke has its own tiny buffers + version so editing it
// never re-tessellates the committed (static) segment stream.
static PathSegment *path_draft_segments;
static u32 path_draft_segments_cap;
static u32 path_draft_segment_count;
static PathDraw path_draft_draw;
static u32 path_draft_version;
// Text storage pool + last layout_text() result.
static char *text_pool;
static u32 text_pool_capacity;
static TextLayoutLine text_layout_lines[BLITZ_MAX_TEXT_LAYOUT_LINES];
static u32 text_layout_line_count;
static float text_layout_width;
static float text_layout_height;
static u32 text_layout_overflow;
static u32 text_pool_used;
// Scene query results (hit-test / viewport queries).
static SceneItem *scene_query_items;
static u32 scene_query_items_cap;
static u32 scene_query_count;
static u32 scene_query_total;
// Scene serialization buffer.
static unsigned char *scene_file_buffer;
static u32 scene_file_capacity;
// Selected-entity inspector outputs.
static float selected_style[15];
static SceneItem selected_debug_item;
static u32 selected_debug_mask;
static const char *selected_frame_title;
// The ECS world.
static World world;
// Live counts from the last extraction.
static u32 shape_command_count;
static u32 rect_draw_count;
static u32 triangle_draw_count;
static u32 oval_draw_count;
static u32 path_draw_count;
static u32 path_segment_count;
static u32 path_draft_active;
static u32 text_draw_count;
static u32 visible_text_shape_count;
static u32 container_entity_count;
static u32 dyn_command_count;
static u32 dyn_overlay_command_start;
static u32 dyn_rect_count;
// Render-stream versions + dirty flags.
static u32 shape_command_version;
static u32 dyn_version;
static u32 static_dirty;
static u32 dynamic_dirty;
// Interaction state: drag, marquee, resize.
static u32 dragging_selection;
static u32 marquee_active;
static u32 marquee_additive;
static u32 marquee_candidate;
static u32 selected_count;
static u32 spawn_count;
static Vec2 drag_last_world;
static Vec2 drag_offset;
static u32 drag_active;
static u32 drag_hover_container;
static u32 drag_top_level_count;
static u32 resize_active;
static u32 resize_entity;
static u32 resize_handle;
static u32 hidden_text_entity;
// Per-entity scratch arrays: pointers into the ECS block, bound by
// ecs_bind_pointers alongside the World components.
static u32 *transform_dirty;
static u32 *transform_dirty_entities;
static u32 transform_dirty_count;
static u32 *draw_order_seen;
static u32 draw_order_normalization_deferred;
static u32 draw_order_normalization_pending;
static u32 *duplicate_entity_map;
static u32 *internal_clipboard_sources;
static u32 internal_clipboard_count;
static float internal_clipboard_bounds[4];
static Vec2 resize_start_position;
static Vec2 resize_start_size;
// Selection state captured when a marquee starts, so each marquee move can
// recompute live selection as base ∪ (entities inside the current box).
static u32 *marquee_base_selected;
// Reclaimed entity slots (stack) and the count of currently-live entities.
static u32 *free_slots;
static u32 free_count;
static u32 live_count;
// CRDT state: per-entity versions (an ECS array), the Lamport clock, the queue
// of local changes awaiting broadcast, and a tombstone table that lets deletes
// win against — and survive — a late update for the same object.
typedef struct CrdtTombstone {
  ObjectId id;
  CrdtVersion version;
  u32 used;
} CrdtTombstone;
static CrdtVersion *crdt_versions;
static u32 crdt_clock;
// Draw order is synced as one last-writer-wins register: a reorder bumps this
// version and the whole order ships; a peer with an older version adopts it.
static CrdtVersion crdt_order_version;
static u32 crdt_order_dirty;
// crdt_collab_enabled gates the broadcast queue (per connection). crdt_ever_-
// enabled is sticky once collaboration starts, so deletes keep tombstoning even
// after disconnect and still propagate on the next reconnect's baseline.
static u32 crdt_collab_enabled;
static u32 crdt_ever_enabled;
static ObjectId *crdt_dirty_ids;
static u32 crdt_dirty_count;
static u32 crdt_dirty_cap;
static CrdtTombstone *crdt_tombstones;
static u32 crdt_tombstone_cap;
static u32 crdt_tombstone_count;
// Child ops whose parent wasn't present yet (it arrived in an earlier message
// or arrives later); retried after every applied batch until the parent exists.
typedef struct CrdtPendingParent {
  ObjectId child;
  ObjectId parent;
  float offset_x;
  float offset_y;
} CrdtPendingParent;
static CrdtPendingParent *crdt_pending_parents;
static u32 crdt_pending_parent_count;
static u32 crdt_pending_parent_cap;

// --- Memory allocator (free-list over linear memory) -----------------------
// General free-list allocator over Wasm linear memory. Every demand buffer (the
// per-entity SoA block, render draw buffers, the scene file buffer) allocates
// through it, so multiple regions each grow independently without a fixed
// max-size reservation. Blocks carry a 16-byte header; freed blocks are reused
// first-fit before the bump pointer extends memory via memory.grow. Allocation
// happens at entity-create and extraction time, never per frame on an unchanged
// scene. Each block has its own address, so callers re-read pointers after a
// grow; a block is never moved while live.
extern unsigned char __heap_base;

typedef struct BlockHeader {
  usize size;
  struct BlockHeader *next_free;
} BlockHeader;
#define BLITZ_HEADER_BYTES 16u

static usize heap_top;
static BlockHeader *heap_free_list;

static void copy_bytes(unsigned char *dst, const unsigned char *src, usize n) {
  for (usize i = 0u; i < n; i += 1u) {
    dst[i] = src[i];
  }
}

static usize align16(usize n) { return (n + 15u) & ~((usize)15u); }

static void heap_reset(void) {
  heap_top = align16((usize)&__heap_base);
  heap_free_list = 0;
}

static int heap_ensure(usize end) {
  usize have = (usize)__builtin_wasm_memory_size(0) * 65536u;
  if (end > have) {
    usize pages = (end - have + 65535u) / 65536u;
    if (__builtin_wasm_memory_grow(0, pages) == (usize)-1) {
      return 0;
    }
  }
  return 1;
}

static usize block_end(BlockHeader *block) {
  return (usize)block + BLITZ_HEADER_BYTES + block->size;
}

static void *blitz_alloc(usize size) {
  size = align16(size);
  BlockHeader *prev = 0;
  BlockHeader *block = heap_free_list;
  while (block) {
    if (block->size >= size) {
      usize remainder = block->size - size;
      if (remainder >= BLITZ_HEADER_BYTES + 16u) {
        // Split: keep `size` here and return the tail to the free list in place,
        // so a large coalesced region isn't consumed whole by a small request.
        BlockHeader *tail =
            (BlockHeader *)((usize)block + BLITZ_HEADER_BYTES + size);
        tail->size = remainder - BLITZ_HEADER_BYTES;
        tail->next_free = block->next_free;
        block->size = size;
        if (prev) {
          prev->next_free = tail;
        } else {
          heap_free_list = tail;
        }
      } else if (prev) {
        prev->next_free = block->next_free;
      } else {
        heap_free_list = block->next_free;
      }
      return (void *)((unsigned char *)block + BLITZ_HEADER_BYTES);
    }
    prev = block;
    block = block->next_free;
  }
  usize header = heap_top;
  usize data = header + BLITZ_HEADER_BYTES;
  if (!heap_ensure(data + size)) {
    return 0;
  }
  heap_top = data + size;
  ((BlockHeader *)header)->size = size;
  ((BlockHeader *)header)->next_free = 0;
  return (void *)data;
}

// The free list is kept sorted by address so a freed block can merge with its
// physical neighbors into a larger reusable region, and the highest block can
// be handed back to the bump pointer. Without coalescing, blocks freed below
// the draw buffers (e.g. old ECS blocks after the ECS array relocates) would
// strand and inflate the committed footprint.
static void blitz_free(void *ptr) {
  if (!ptr) {
    return;
  }
  BlockHeader *block =
      (BlockHeader *)((unsigned char *)ptr - BLITZ_HEADER_BYTES);
  BlockHeader *prev = 0;
  BlockHeader *next = heap_free_list;
  while (next && next < block) {
    prev = next;
    next = next->next_free;
  }
  block->next_free = next;
  if (prev) {
    prev->next_free = block;
  } else {
    heap_free_list = block;
  }
  if (next && block_end(block) == (usize)next) {
    block->size += BLITZ_HEADER_BYTES + next->size;
    block->next_free = next->next_free;
  }
  if (prev && block_end(prev) == (usize)block) {
    prev->size += BLITZ_HEADER_BYTES + block->size;
    prev->next_free = block->next_free;
    block = prev;
  }
  // If the merged block is now the highest one and reaches the top of the heap,
  // return it to the bump pointer.
  if (block->next_free == 0 && block_end(block) == heap_top) {
    if (heap_free_list == block) {
      heap_free_list = 0;
    } else {
      BlockHeader *scan = heap_free_list;
      while (scan && scan->next_free != block) {
        scan = scan->next_free;
      }
      if (scan) {
        scan->next_free = 0;
      }
    }
    heap_top = (usize)block;
  }
}

// Grow an allocation, preserving the first `keep` bytes. Returns a possibly new
// address; callers must re-read it.
static void *blitz_realloc(void *ptr, usize keep, usize new_size) {
  if (!ptr) {
    return blitz_alloc(new_size);
  }
  BlockHeader *block =
      (BlockHeader *)((unsigned char *)ptr - BLITZ_HEADER_BYTES);
  if (block->size >= align16(new_size)) {
    return ptr;
  }
  void *next = blitz_alloc(new_size);
  if (next) {
    copy_bytes((unsigned char *)next, (const unsigned char *)ptr, keep);
    blitz_free(ptr);
  }
  return next;
}

// Reserve a render buffer for `need` elements. Contents are rebuilt every
// extraction, so growth frees the old block and allocates a fresh one with no
// copy. Returns the (possibly new) base; *cap is updated, or set to 0 on
// allocation failure.
static void *draw_reserve(void *ptr, u32 *cap, u32 need, usize stride) {
  if (need <= *cap) {
    return ptr;
  }
  u32 new_cap = *cap ? *cap : 256u;
  while (new_cap < need) {
    new_cap *= 2u;
  }
  blitz_free(ptr);
  void *next = blitz_alloc((usize)new_cap * stride);
  *cap = next ? new_cap : 0u;
  return next;
}

// Ensure a render buffer can hold index `count` (used mid-extraction as entries
// are appended), preserving entries already written this pass.
static void *dyn_grow(void *ptr, u32 *cap, u32 count, usize stride) {
  if (count < *cap) {
    return ptr;
  }
  u32 new_cap = *cap ? *cap : 256u;
  while (new_cap <= count) {
    new_cap *= 2u;
  }
  void *next = blitz_realloc(ptr, (usize)count * stride, (usize)new_cap * stride);
  *cap = next ? new_cap : 0u;
  return next;
}

// Ensure the scene file buffer spans `bytes`, preserving `keep` bytes (0 when
// the buffer is about to be overwritten wholesale).
static int scene_file_ensure(u32 bytes, u32 keep) {
  if (bytes <= scene_file_capacity) {
    return 1;
  }
  u32 new_cap = scene_file_capacity ? scene_file_capacity : 65536u;
  while (new_cap < bytes) {
    new_cap *= 2u;
  }
  void *next = blitz_realloc(scene_file_buffer, keep, new_cap);
  if (!next) {
    return 0;
  }
  scene_file_buffer = (unsigned char *)next;
  scene_file_capacity = new_cap;
  return 1;
}

// Grow the text pool to hold `extra` more bytes. The pool can relocate, so any
// stored string pointer that falls within the old pool range is rebased to the
// new block; pointers outside it (string literals from the demo template) are
// left untouched. Callers compute fresh pointers from text_pool after this.
static int text_pool_ensure(u32 extra) {
  u32 need = text_pool_used + extra;
  if (need <= text_pool_capacity) {
    return 1;
  }
  u32 new_cap = text_pool_capacity ? text_pool_capacity : 65536u;
  while (new_cap < need) {
    new_cap *= 2u;
  }
  char *old = text_pool;
  u32 used = text_pool_used;
  char *next = (char *)blitz_realloc(text_pool, used, new_cap);
  if (!next) {
    return 0;
  }
  if (old && next != old) {
    for (u32 i = 0u; i < world.entity_count; i += 1u) {
      u32 mask = world.masks[i];
      if (mask & BLITZ_COMPONENT_TEXT_VIEW) {
        const char *p = world.text_views[i].text;
        if (p >= old && p < old + used) {
          world.text_views[i].text = next + (p - old);
        }
      }
      if (mask & BLITZ_COMPONENT_FRAME_VIEW) {
        const char *p = world.frame_views[i].title;
        if (p && p >= old && p < old + used) {
          world.frame_views[i].title = next + (p - old);
        }
      }
    }
  }
  text_pool = next;
  text_pool_capacity = new_cap;
  return 1;
}

// --- ECS storage & layout --------------------------------------------------
static unsigned char *ecs_block;
static u32 entity_capacity;

// Component byte strides in block-layout order. Must match the World member
// order and ecs_bind_pointers below.
static const u32 ecs_strides[] = {
    sizeof(u32),               // draw_order
    sizeof(u32),               // draw_order_scratch
    sizeof(u32),               // selected
    sizeof(ObjectId),          // object_ids
    sizeof(u32),               // masks
    sizeof(Vec2),              // positions
    sizeof(Vec2),              // sizes
    sizeof(RectView),          // rect_views
    sizeof(TriangleView),      // triangle_views
    sizeof(OvalView),          // oval_views
    sizeof(TextView),          // text_views
    sizeof(FrameView),         // frame_views
    sizeof(PathView),          // path_views
    sizeof(RelativeTransform), // relative_transforms
    sizeof(u32),               // first_child
    sizeof(u32),               // next_sibling
    sizeof(u32),               // prev_sibling
    sizeof(u32),               // transform_dirty
    sizeof(u32),               // transform_dirty_entities
    sizeof(u32),               // draw_order_seen
    sizeof(u32),               // duplicate_entity_map
    sizeof(u32),               // internal_clipboard_sources
    sizeof(u32),               // marquee_base_selected
    sizeof(u32),               // free_slots
    sizeof(CrdtVersion),       // crdt_versions
};
#define BLITZ_ECS_ARRAYS ((u32)(sizeof(ecs_strides) / sizeof(ecs_strides[0])))

static usize ecs_total_stride(void) {
  usize total = 0u;
  for (u32 i = 0u; i < BLITZ_ECS_ARRAYS; i += 1u) {
    total += ecs_strides[i];
  }
  return total;
}

// Byte offset of component `index` within a block of the given capacity.
static usize ecs_offset(u32 index, u32 capacity) {
  usize prefix = 0u;
  for (u32 i = 0u; i < index; i += 1u) {
    prefix += ecs_strides[i];
  }
  return (usize)capacity * prefix;
}

static void ecs_bind_pointers(u32 capacity) {
  world.draw_order = (u32 *)(ecs_block + ecs_offset(0u, capacity));
  world.draw_order_scratch = (u32 *)(ecs_block + ecs_offset(1u, capacity));
  world.selected = (u32 *)(ecs_block + ecs_offset(2u, capacity));
  world.object_ids = (ObjectId *)(ecs_block + ecs_offset(3u, capacity));
  world.masks = (u32 *)(ecs_block + ecs_offset(4u, capacity));
  world.positions = (Vec2 *)(ecs_block + ecs_offset(5u, capacity));
  world.sizes = (Vec2 *)(ecs_block + ecs_offset(6u, capacity));
  world.rect_views = (RectView *)(ecs_block + ecs_offset(7u, capacity));
  world.triangle_views = (TriangleView *)(ecs_block + ecs_offset(8u, capacity));
  world.oval_views = (OvalView *)(ecs_block + ecs_offset(9u, capacity));
  world.text_views = (TextView *)(ecs_block + ecs_offset(10u, capacity));
  world.frame_views = (FrameView *)(ecs_block + ecs_offset(11u, capacity));
  world.path_views = (PathView *)(ecs_block + ecs_offset(12u, capacity));
  world.relative_transforms =
      (RelativeTransform *)(ecs_block + ecs_offset(13u, capacity));
  world.first_child = (u32 *)(ecs_block + ecs_offset(14u, capacity));
  world.next_sibling = (u32 *)(ecs_block + ecs_offset(15u, capacity));
  world.prev_sibling = (u32 *)(ecs_block + ecs_offset(16u, capacity));
  transform_dirty = (u32 *)(ecs_block + ecs_offset(17u, capacity));
  transform_dirty_entities = (u32 *)(ecs_block + ecs_offset(18u, capacity));
  draw_order_seen = (u32 *)(ecs_block + ecs_offset(19u, capacity));
  duplicate_entity_map = (u32 *)(ecs_block + ecs_offset(20u, capacity));
  internal_clipboard_sources = (u32 *)(ecs_block + ecs_offset(21u, capacity));
  marquee_base_selected = (u32 *)(ecs_block + ecs_offset(22u, capacity));
  free_slots = (u32 *)(ecs_block + ecs_offset(23u, capacity));
  crdt_versions = (CrdtVersion *)(ecs_block + ecs_offset(24u, capacity));
}

// Grow the per-entity block to hold `count` slots. If the block is the last
// allocation it extends in place (just more pages, no copy, no abandoned
// block); otherwise it relocates to a fresh block. Either way the sub-arrays
// are re-strided to the new capacity's offsets — back-to-front in place (new
// offsets only ever grow), forward when relocating to a distinct block.
static int ecs_storage_reserve(u32 count) {
  if (count <= entity_capacity) {
    return 1;
  }
  u32 new_cap = entity_capacity ? entity_capacity : 1024u;
  while (new_cap < count) {
    new_cap *= 2u;
  }
  usize new_bytes = (usize)new_cap * ecs_total_stride();
  u32 live = world.entity_count;

  if (ecs_block && entity_capacity) {
    BlockHeader *header =
        (BlockHeader *)(ecs_block - BLITZ_HEADER_BYTES);
    if ((usize)ecs_block + header->size == heap_top) {
      if (!heap_ensure((usize)ecs_block + align16(new_bytes))) {
        return 0;
      }
      heap_top = (usize)ecs_block + align16(new_bytes);
      header->size = align16(new_bytes);
      for (u32 step = BLITZ_ECS_ARRAYS; step > 0u; step -= 1u) {
        u32 i = step - 1u;
        usize src = ecs_offset(i, entity_capacity);
        usize dst = ecs_offset(i, new_cap);
        if (dst != src) {
          for (usize b = (usize)live * ecs_strides[i]; b > 0u; b -= 1u) {
            ecs_block[dst + b - 1u] = ecs_block[src + b - 1u];
          }
        }
      }
      entity_capacity = new_cap;
      ecs_bind_pointers(new_cap);
      return 1;
    }
  }

  unsigned char *next = (unsigned char *)blitz_alloc(new_bytes);
  if (!next) {
    return 0;
  }
  if (ecs_block && entity_capacity) {
    for (u32 i = 0u; i < BLITZ_ECS_ARRAYS; i += 1u) {
      copy_bytes(next + ecs_offset(i, new_cap),
                 ecs_block + ecs_offset(i, entity_capacity),
                 (usize)live * ecs_strides[i]);
    }
    blitz_free(ecs_block);
  }
  ecs_block = next;
  entity_capacity = new_cap;
  ecs_bind_pointers(new_cap);
  return 1;
}

// --- History state ---------------------------------------------------------
// Declared here (ahead of ecs_storage_init) so the heap reset can drop the
// stacks and scratch; the engine itself lives further down.
#define BLITZ_HISTORY_MAX_STEPS 64u
#define BLITZ_HISTORY_MAX_BYTES (256u * 1024u * 1024u)

typedef struct {
  ObjectId id;
  u32 entity;  // last-known index; an O(1) hint so apply avoids a per-entry scan
  u32 before_offset;  // BLITZ_INVALID_INDEX when absent (a create)
  u32 after_offset;   // BLITZ_INVALID_INDEX when absent (a delete)
} HistoryEntry;

typedef struct {
  HistoryEntry *entries;
  u32 entry_count;
  unsigned char *bytes;  // before+after record blobs; entry offsets index here
  u32 byte_count;
  u32 epoch;  // unique state id, for dirty tracking
  // Draw-order (z-order) snapshots, present only when the transaction reordered
  // or deleted. Stored as object_ids (not indices) so they survive the index
  // reuse that a delete/undo causes; restored as a permutation of the live set.
  ObjectId *order_before;
  u32 order_before_count;
  ObjectId *order_after;
  u32 order_after_count;
} HistoryTransaction;

typedef struct {
  ObjectId id;
  u32 entity;  // index recorded at capture time; verified live before after-capture
  u32 before_offset;  // into history_scratch_bytes, or BLITZ_INVALID_INDEX
  u32 after_offset;
} HistoryScratchEntry;

static HistoryTransaction history_undo_stack[BLITZ_HISTORY_MAX_STEPS];
static HistoryTransaction history_redo_stack[BLITZ_HISTORY_MAX_STEPS];
static u32 history_undo_count;
static u32 history_redo_count;
static u32 history_total_bytes;
static u32 history_epoch_counter;
static u32 history_transaction_active;
static u32 history_replaying;
static HistoryScratchEntry *history_scratch_entries;
static u32 history_scratch_entry_count;
static u32 history_scratch_entry_cap;
static unsigned char *history_scratch_bytes;
static u32 history_scratch_byte_count;
static u32 history_scratch_byte_cap;
// Per-apply id->entry index map, so parent relink during a bulk undo resolves
// in-transaction parents in O(1) instead of scanning the whole world.
static u32 *history_apply_map;
static u32 history_apply_map_cap;
// Pre-mutation draw_order snapshot for the open transaction (object_ids), taken
// lazily the first time a reorder/delete happens so other edits pay nothing.
static ObjectId *history_order_scratch;
static u32 history_order_scratch_cap;
static u32 history_order_before_count;
static u32 history_order_dirty;
// id->entity table over all live entities, used to rebuild draw_order from an
// object_id snapshot in O(n) instead of a scan per entry.
static u32 *history_order_map;
static u32 history_order_map_cap;

static void ecs_storage_init(void) {
  // blitz_init resets the whole heap, releasing every demand block wholesale,
  // so all heap-backed pointers must be cleared here.
  heap_reset();
  shape_commands = 0;
  rect_draws = 0;
  triangle_draws = 0;
  oval_draws = 0;
  text_draws = 0;
  path_draws = 0;
  path_segments = 0;
  path_draft_segments = 0;
  dyn_commands = 0;
  dyn_rects = 0;
  scene_file_buffer = 0;
  scene_file_capacity = 0u;
  text_pool = 0;
  text_pool_capacity = 0u;
  scene_query_items = 0;
  scene_query_items_cap = 0u;
  shape_commands_cap = 0u;
  rect_draws_cap = 0u;
  triangle_draws_cap = 0u;
  oval_draws_cap = 0u;
  text_draws_cap = 0u;
  path_draws_cap = 0u;
  path_segments_cap = 0u;
  path_draft_segments_cap = 0u;
  dyn_commands_cap = 0u;
  dyn_rects_cap = 0u;
  ecs_block = 0;
  entity_capacity = 0u;
  world.draw_order = 0;
  world.draw_order_scratch = 0;
  world.selected = 0;
  world.object_ids = 0;
  world.masks = 0;
  world.positions = 0;
  world.sizes = 0;
  world.rect_views = 0;
  world.triangle_views = 0;
  world.oval_views = 0;
  world.text_views = 0;
  world.frame_views = 0;
  world.path_views = 0;
  world.relative_transforms = 0;
  world.first_child = 0;
  world.next_sibling = 0;
  world.prev_sibling = 0;
  transform_dirty = 0;
  transform_dirty_entities = 0;
  draw_order_seen = 0;
  duplicate_entity_map = 0;
  internal_clipboard_sources = 0;
  marquee_base_selected = 0;
  free_slots = 0;
  crdt_versions = 0;
  // The heap reset above invalidates the CRDT change queue and tombstone table;
  // drop them and reset the Lamport clock for the fresh scene.
  crdt_clock = 0u;
  crdt_order_version = (CrdtVersion){0u, 0u, 0u};
  crdt_order_dirty = 0u;
  crdt_collab_enabled = 0u;
  crdt_ever_enabled = 0u;
  crdt_dirty_ids = 0;
  crdt_dirty_count = 0u;
  crdt_dirty_cap = 0u;
  crdt_tombstones = 0;
  crdt_tombstone_cap = 0u;
  crdt_tombstone_count = 0u;
  crdt_pending_parents = 0;
  crdt_pending_parent_count = 0u;
  crdt_pending_parent_cap = 0u;
  // The heap reset above invalidates every history allocation; drop the stacks
  // and scratch without freeing (those pointers are already gone).
  history_undo_count = 0u;
  history_redo_count = 0u;
  history_total_bytes = 0u;
  history_epoch_counter = 0u;
  history_transaction_active = 0u;
  history_replaying = 0u;
  history_scratch_entries = 0;
  history_scratch_entry_count = 0u;
  history_scratch_entry_cap = 0u;
  history_scratch_bytes = 0;
  history_scratch_byte_count = 0u;
  history_scratch_byte_cap = 0u;
  history_apply_map = 0;
  history_apply_map_cap = 0u;
  history_order_scratch = 0;
  history_order_scratch_cap = 0u;
  history_order_before_count = 0u;
  history_order_dirty = 0u;
  history_order_map = 0;
  history_order_map_cap = 0u;
}

// Reserve room for one more entry in the dynamic stream before a push: grow the
// buffers and report whether the (possibly relocated) buffers are usable. Both
// buffers a push touches are reserved together.
static int dyn_rect_reserve(void) {
  if (dyn_command_count >= BLITZ_MAX_DYN_COMMANDS ||
      dyn_rect_count >= BLITZ_MAX_DYN_RECTS) {
    return 0;
  }
  dyn_commands = (ShapeCommand *)dyn_grow(dyn_commands, &dyn_commands_cap,
                                          dyn_command_count, sizeof(ShapeCommand));
  dyn_rects = (RectDraw *)dyn_grow(dyn_rects, &dyn_rects_cap, dyn_rect_count,
                                   sizeof(RectDraw));
  return dyn_commands != 0 && dyn_rects != 0;
}
static int dyn_text_reserve(void) {
  if (dyn_command_count >= BLITZ_MAX_DYN_COMMANDS ||
      text_draw_count >= BLITZ_MAX_TEXT_DRAWS) {
    return 0;
  }
  dyn_commands = (ShapeCommand *)dyn_grow(dyn_commands, &dyn_commands_cap,
                                          dyn_command_count, sizeof(ShapeCommand));
  text_draws = (TextDraw *)dyn_grow(text_draws, &text_draws_cap, text_draw_count,
                                    sizeof(TextDraw));
  return dyn_commands != 0 && text_draws != 0;
}
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

static void clear_selection(void);
static void extract_static_shapes(void);
static void extract_dynamic(void);
static void normalize_draw_order_hierarchy(void);
static void request_draw_order_normalize(void);
static void mark_static_dynamic_dirty(void);
static void flush_draw_order_normalize(void);
static int point_in_rect(float world_x, float world_y, u32 entity);
static int point_in_triangle(float world_x, float world_y, u32 entity);
static int point_in_oval(float world_x, float world_y, u32 entity);

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

static float maxf_local(float a, float b) {
  return a > b ? a : b;
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

// --- Byte writers & object IDs ---------------------------------------------
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

// --- CRDT: per-entity LWW merge --------------------------------------------
// Conflict resolution is "newest wins": compare (lamport, actor_hi, actor_lo).
static int crdt_version_newer(CrdtVersion a, CrdtVersion b) {
  if (a.lamport != b.lamport) {
    return a.lamport > b.lamport;
  }
  if (a.actor_hi != b.actor_hi) {
    return a.actor_hi > b.actor_hi;
  }
  return a.actor_lo > b.actor_lo;
}

static u32 crdt_hash(ObjectId id) {
  u32 h = id.actor_hi * 2654435761u;
  h ^= id.actor_lo * 2246822519u;
  h ^= id.sequence_hi * 3266489917u;
  h ^= id.sequence_lo * 668265263u;
  h ^= h >> 15;
  return h;
}

// Open-addressing slot for `id` in the tombstone table: the existing entry or
// the first empty slot. Returns 0 only if the table is unallocated/full.
static CrdtTombstone *crdt_tombstone_slot(ObjectId id) {
  if (crdt_tombstone_cap == 0u) {
    return 0;
  }
  u32 mask = crdt_tombstone_cap - 1u;
  u32 slot = crdt_hash(id) & mask;
  for (u32 probe = 0u; probe < crdt_tombstone_cap; probe += 1u) {
    CrdtTombstone *entry = &crdt_tombstones[slot];
    if (!entry->used || object_id_equal(entry->id, id)) {
      return entry;
    }
    slot = (slot + 1u) & mask;
  }
  return 0;
}

static u32 crdt_tombstone_grow(void) {
  u32 next = crdt_tombstone_cap ? crdt_tombstone_cap * 2u : 256u;
  CrdtTombstone *grown =
      (CrdtTombstone *)blitz_alloc((usize)next * sizeof(CrdtTombstone));
  if (!grown) {
    return 0u;
  }
  for (u32 i = 0u; i < next; i += 1u) {
    grown[i].used = 0u;
  }
  CrdtTombstone *old = crdt_tombstones;
  u32 old_cap = crdt_tombstone_cap;
  crdt_tombstones = grown;
  crdt_tombstone_cap = next;
  u32 mask = next - 1u;
  for (u32 i = 0u; i < old_cap; i += 1u) {
    if (old && old[i].used) {
      u32 slot = crdt_hash(old[i].id) & mask;
      while (grown[slot].used) {
        slot = (slot + 1u) & mask;
      }
      grown[slot] = old[i];
    }
  }
  if (old) {
    blitz_free(old);
  }
  return 1u;
}

// Tombstones are never cleared: a resurrected entity (a newer upsert) is found
// live, so apply compares against the live version and ignores the stale stone.
static void crdt_tombstone_set(ObjectId id, CrdtVersion version) {
  if ((crdt_tombstone_count + 1u) * 2u > crdt_tombstone_cap) {
    if (!crdt_tombstone_grow()) {
      return;
    }
  }
  CrdtTombstone *entry = crdt_tombstone_slot(id);
  if (!entry) {
    return;
  }
  if (!entry->used) {
    entry->used = 1u;
    entry->id = id;
    crdt_tombstone_count += 1u;
  }
  entry->version = version;
}

static u32 crdt_tombstone_version(ObjectId id, CrdtVersion *out) {
  CrdtTombstone *entry = crdt_tombstone_slot(id);
  if (entry && entry->used) {
    *out = entry->version;
    return 1u;
  }
  return 0u;
}

// Drop a tombstone (open-addressing backward-shift, Knuth 6.4 algorithm R) when
// its id is resurrected by a newer upsert — so the table holds only ids that are
// currently deleted, not every id ever deleted.
static void crdt_tombstone_remove(ObjectId id) {
  if (crdt_tombstone_cap == 0u) {
    return;
  }
  u32 mask = crdt_tombstone_cap - 1u;
  u32 i = crdt_hash(id) & mask;
  while (crdt_tombstones[i].used &&
         !object_id_equal(crdt_tombstones[i].id, id)) {
    i = (i + 1u) & mask;
  }
  if (!crdt_tombstones[i].used) {
    return;
  }
  crdt_tombstone_count -= 1u;
  u32 j = i;
  for (;;) {
    crdt_tombstones[i].used = 0u;
    u32 k;
    do {
      j = (j + 1u) & mask;
      if (!crdt_tombstones[j].used) {
        return;
      }
      k = crdt_hash(crdt_tombstones[j].id) & mask;
    } while ((i <= j) ? (i < k && k <= j) : (i < k || k <= j));
    crdt_tombstones[i] = crdt_tombstones[j];
    i = j;
  }
}

static void crdt_mark_dirty(ObjectId id) {
  if (crdt_dirty_count >= crdt_dirty_cap) {
    u32 next = crdt_dirty_cap ? crdt_dirty_cap * 2u : 256u;
    ObjectId *grown = (ObjectId *)blitz_realloc(
        crdt_dirty_ids, (usize)crdt_dirty_count * sizeof(ObjectId),
        (usize)next * sizeof(ObjectId));
    if (!grown) {
      return;
    }
    crdt_dirty_ids = grown;
    crdt_dirty_cap = next;
  }
  crdt_dirty_ids[crdt_dirty_count] = id;
  crdt_dirty_count += 1u;
}

// Stamp a locally-edited entity (current clock + local actor). The live version
// always advances (so a later baseline carries it); the tombstone table and
// broadcast queue only grow while collaborating.
static void crdt_stamp_local(u32 entity, ObjectId id, u32 deleted) {
  CrdtVersion version = {crdt_clock, object_id_actor_hi, object_id_actor_lo};
  if (!deleted && entity != BLITZ_INVALID_INDEX) {
    crdt_versions[entity] = version;
  }
  // Track deletes once collaboration has ever been on (sticky), so an offline
  // delete still ships on the next reconnect's baseline. An undo that resurrects
  // a deleted id drops its now-stale tombstone.
  if (crdt_ever_enabled) {
    if (deleted) {
      crdt_tombstone_set(id, version);
    } else if (crdt_tombstone_count > 0u) {
      crdt_tombstone_remove(id);
    }
  }
  if (crdt_collab_enabled) {
    crdt_mark_dirty(id);
  }
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

static u32 entity_for_object_id(ObjectId id) {
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (world.masks[entity] != 0u &&
        object_id_equal(world.object_ids[entity], id)) {
      return entity;
    }
  }
  return BLITZ_INVALID_INDEX;
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

// --- Dirty flags & invalidation --------------------------------------------
static void mark_render_list_dirty(void) {
  static_dirty = 1u;
  dynamic_dirty = 1u;
  scene_revision += 1u;
}

static void mark_static_dynamic_dirty(void) {
  static_dirty = 1u;
  dynamic_dirty = 1u;
}

static void mark_dynamic_dirty(void) {
  dynamic_dirty = 1u;
}

static void mark_view_dirty(void) {
  dynamic_dirty = 1u;
}

static void mark_transform_dirty(u32 entity) {
  if (entity == BLITZ_INVALID_INDEX || world.masks[entity] == 0u) {
    return;
  }
  if (!transform_dirty[entity]) {
    transform_dirty[entity] = 1u;
    transform_dirty_entities[transform_dirty_count] = entity;
    transform_dirty_count += 1u;
  }
}

static void mark_transform_subtree_dirty(u32 entity) {
  if (entity == BLITZ_INVALID_INDEX || world.masks[entity] == 0u) {
    return;
  }
  for (u32 child = world.first_child[entity]; child != BLITZ_INVALID_INDEX;
       child = world.next_sibling[child]) {
    // An already-dirty child's subtree was marked when it was dirtied (dirtying
    // is always paired with this walk), so stop there — keeps marking a deeply
    // nested hierarchy linear instead of re-walking overlapping subtrees.
    if (!transform_dirty[child]) {
      mark_transform_dirty(child);
      mark_transform_subtree_dirty(child);
    }
  }
}

// --- Entity hierarchy & containers -----------------------------------------
static void detach_from_parent(u32 entity) {
  if (entity == BLITZ_INVALID_INDEX ||
      !(world.masks[entity] & BLITZ_COMPONENT_RELATIVE_TRANSFORM)) {
    return;
  }
  u32 parent = world.relative_transforms[entity].parent;
  u32 previous = world.prev_sibling[entity];
  u32 next = world.next_sibling[entity];
  if (previous != BLITZ_INVALID_INDEX) {
    world.next_sibling[previous] = next;
  } else if (parent != BLITZ_INVALID_INDEX) {
    world.first_child[parent] = next;
  }
  if (next != BLITZ_INVALID_INDEX) {
    world.prev_sibling[next] = previous;
  }
  world.prev_sibling[entity] = BLITZ_INVALID_INDEX;
  world.next_sibling[entity] = BLITZ_INVALID_INDEX;
  world.relative_transforms[entity].parent = BLITZ_INVALID_INDEX;
  world.relative_transforms[entity].offset_x = 0.0f;
  world.relative_transforms[entity].offset_y = 0.0f;
  world.masks[entity] &= ~BLITZ_COMPONENT_RELATIVE_TRANSFORM;
}

static u32 transform_is_descendant(u32 ancestor, u32 candidate) {
  for (u32 child = world.first_child[ancestor]; child != BLITZ_INVALID_INDEX;
       child = world.next_sibling[child]) {
    if (child == candidate || transform_is_descendant(child, candidate)) {
      return 1u;
    }
  }
  return 0u;
}

static u32 entity_has_selected_ancestor(u32 entity) {
  if (entity == BLITZ_INVALID_INDEX) {
    return 0u;
  }
  u32 parent = world.relative_transforms[entity].parent;
  while (parent != BLITZ_INVALID_INDEX && world.masks[parent] != 0u) {
    if (world.selected[parent]) {
      return 1u;
    }
    parent = world.relative_transforms[parent].parent;
  }
  return 0u;
}

static u32 entity_is_dragged(u32 entity) {
  return world.selected[entity] || entity_has_selected_ancestor(entity);
}

static u32 selected_top_level_count_capped(u32 cap) {
  u32 count = 0u;
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (world.selected[entity] && !entity_has_selected_ancestor(entity)) {
      count += 1u;
      if (count >= cap) {
        return count;
      }
    }
  }
  return count;
}

static u32 attach_relative_transform(u32 entity, u32 parent, float offset_x,
                                     float offset_y) {
  if (entity == BLITZ_INVALID_INDEX || parent == BLITZ_INVALID_INDEX ||
      entity == parent || world.masks[entity] == 0u ||
      world.masks[parent] == 0u || transform_is_descendant(entity, parent)) {
    return 0u;
  }
  detach_from_parent(entity);
  world.relative_transforms[entity].parent = parent;
  world.relative_transforms[entity].offset_x = offset_x;
  world.relative_transforms[entity].offset_y = offset_y;
  world.prev_sibling[entity] = BLITZ_INVALID_INDEX;
  world.next_sibling[entity] = world.first_child[parent];
  if (world.first_child[parent] != BLITZ_INVALID_INDEX) {
    world.prev_sibling[world.first_child[parent]] = entity;
  }
  world.first_child[parent] = entity;
  world.masks[entity] |= BLITZ_COMPONENT_RELATIVE_TRANSFORM;
  mark_transform_dirty(entity);
  mark_transform_subtree_dirty(entity);
  request_draw_order_normalize();
  mark_render_list_dirty();
  return 1u;
}

static u32 entity_bounds_inside(u32 entity, u32 container) {
  Vec2 position = world.positions[entity];
  Vec2 size = world.sizes[entity];
  Vec2 container_position = world.positions[container];
  Vec2 container_size = world.sizes[container];
  return position.x >= container_position.x &&
         position.y >= container_position.y &&
         position.x + size.x <= container_position.x + container_size.x &&
         position.y + size.y <= container_position.y + container_size.y;
}

static u32 container_target_for_entity(u32 entity, u32 exclude_selected,
                                       u32 require_full_containment) {
  if (entity == BLITZ_INVALID_INDEX || world.masks[entity] == 0u) {
    return BLITZ_INVALID_INDEX;
  }
  float center_x = world.positions[entity].x + world.sizes[entity].x * 0.5f;
  float center_y = world.positions[entity].y + world.sizes[entity].y * 0.5f;
  for (u32 i = world.draw_order_count; i > 0u; i -= 1u) {
    u32 container = world.draw_order[i - 1u];
    if (!(world.masks[container] & BLITZ_COMPONENT_CONTAINER) ||
        container == entity || (exclude_selected && world.selected[container]) ||
        transform_is_descendant(entity, container)) {
      continue;
    }
    if (require_full_containment && !entity_bounds_inside(entity, container)) {
      continue;
    }
    u32 hit = 0u;
    if (world.masks[container] & BLITZ_COMPONENT_OVAL_VIEW) {
      hit = (u32)point_in_oval(center_x, center_y, container);
    } else if (world.masks[container] & BLITZ_COMPONENT_TRIANGLE_VIEW) {
      hit = (u32)point_in_triangle(center_x, center_y, container);
    } else {
      hit = (u32)point_in_rect(center_x, center_y, container);
    }
    if (hit) {
      return container;
    }
  }
  return BLITZ_INVALID_INDEX;
}

static u32 attach_entity_to_container_target(u32 entity, u32 target) {
  if (entity == BLITZ_INVALID_INDEX || target == BLITZ_INVALID_INDEX ||
      entity == target || world.masks[entity] == 0u ||
      world.masks[target] == 0u) {
    return 0u;
  }
  return attach_relative_transform(entity, target,
                                   world.positions[entity].x -
                                       world.positions[target].x,
                                   world.positions[entity].y -
                                       world.positions[target].y);
}

static void set_container_component(u32 entity, u32 enabled) {
  if (entity == BLITZ_INVALID_INDEX || world.masks[entity] == 0u) {
    return;
  }
  u32 has_container = (world.masks[entity] & BLITZ_COMPONENT_CONTAINER) != 0u;
  if (enabled && !has_container) {
    world.masks[entity] |= BLITZ_COMPONENT_CONTAINER;
    container_entity_count += 1u;
  } else if (!enabled && has_container) {
    world.masks[entity] &= ~BLITZ_COMPONENT_CONTAINER;
    if (container_entity_count > 0u) {
      container_entity_count -= 1u;
    }
  }
}

static void attach_new_entity_to_container_target(u32 entity) {
  if (container_entity_count == 0u) {
    return;
  }
  u32 target = container_target_for_entity(entity, 0u, 0u);
  if (target != BLITZ_INVALID_INDEX) {
    attach_entity_to_container_target(entity, target);
  }
}

static u32 attach_contained_items_to_container(u32 container) {
  if (container == BLITZ_INVALID_INDEX ||
      !(world.masks[container] & BLITZ_COMPONENT_CONTAINER)) {
    return 0u;
  }
  u32 start_index = world.draw_order_count;
  for (u32 i = 0u; i < world.draw_order_count; i += 1u) {
    if (world.draw_order[i] == container) {
      start_index = i + 1u;
      break;
    }
  }
  u32 changed = 0u;
  draw_order_normalization_deferred += 1u;
  for (u32 i = start_index; i < world.draw_order_count; i += 1u) {
    u32 entity = world.draw_order[i];
    if (entity == container || world.masks[entity] == 0u ||
        transform_is_descendant(container, entity) ||
        transform_is_descendant(entity, container)) {
      continue;
    }
    u32 target = container_target_for_entity(entity, 0u, 1u);
    if (target == container) {
      changed |= attach_entity_to_container_target(entity, container);
    }
  }
  draw_order_normalization_deferred -= 1u;
  if (draw_order_normalization_pending) {
    flush_draw_order_normalize();
  }
  return changed;
}

static u32 detach_container_children_to_underlying_targets(u32 container) {
  u32 changed = 0u;
  draw_order_normalization_deferred += 1u;
  while (world.first_child[container] != BLITZ_INVALID_INDEX) {
    u32 child = world.first_child[container];
    detach_from_parent(child);
    mark_transform_subtree_dirty(child);
    u32 target = container_target_for_entity(child, 0u, 1u);
    if (target != BLITZ_INVALID_INDEX) {
      changed |= attach_entity_to_container_target(child, target);
    } else {
      changed = 1u;
    }
  }
  draw_order_normalization_deferred -= 1u;
  if (draw_order_normalization_pending) {
    flush_draw_order_normalize();
  }
  return changed;
}

static u32 set_entity_container(u32 entity, u32 enabled) {
  if (entity == BLITZ_INVALID_INDEX || world.masks[entity] == 0u) {
    return 0u;
  }
  if (enabled) {
    if (world.masks[entity] & BLITZ_COMPONENT_CONTAINER) {
      return 0u;
    }
    set_container_component(entity, 1u);
    attach_contained_items_to_container(entity);
    mark_render_list_dirty();
    return 1u;
  }
  if (!(world.masks[entity] & BLITZ_COMPONENT_CONTAINER)) {
    return 0u;
  }
  set_container_component(entity, 0u);
  detach_container_children_to_underlying_targets(entity);
  mark_render_list_dirty();
  return 1u;
}

static void cleanup_entity_hierarchy(u32 entity) {
  while (world.first_child[entity] != BLITZ_INVALID_INDEX) {
    detach_from_parent(world.first_child[entity]);
  }
  detach_from_parent(entity);
  transform_dirty[entity] = 0u;
  world.first_child[entity] = BLITZ_INVALID_INDEX;
  world.next_sibling[entity] = BLITZ_INVALID_INDEX;
  world.prev_sibling[entity] = BLITZ_INVALID_INDEX;
  world.relative_transforms[entity].parent = BLITZ_INVALID_INDEX;
  world.relative_transforms[entity].offset_x = 0.0f;
  world.relative_transforms[entity].offset_y = 0.0f;
  if (hidden_text_entity == entity) {
    hidden_text_entity = BLITZ_INVALID_INDEX;
  }
}

static void release_entity_resources(u32 entity) {
  if (world.masks[entity] & BLITZ_COMPONENT_PATH_VIEW) {
    blitz_free(world.path_views[entity].points);
    world.path_views[entity].points = 0;
    world.path_views[entity].point_count = 0u;
  }
}

// --- Relative transforms ---------------------------------------------------
static void resolve_transform_entity(u32 entity, u32 depth) {
  if (entity == BLITZ_INVALID_INDEX || !transform_dirty[entity] ||
      depth > BLITZ_MAX_ENTITIES) {
    return;
  }
  if (world.masks[entity] & BLITZ_COMPONENT_RELATIVE_TRANSFORM) {
    RelativeTransform relative = world.relative_transforms[entity];
    resolve_transform_entity(relative.parent, depth + 1u);
    if (relative.parent != BLITZ_INVALID_INDEX &&
        world.masks[relative.parent] != 0u) {
      world.positions[entity].x =
          world.positions[relative.parent].x + relative.offset_x;
      world.positions[entity].y =
          world.positions[relative.parent].y + relative.offset_y;
    }
  }
  transform_dirty[entity] = 0u;
}

static void system_resolve_relative_transforms(void) {
  if (transform_dirty_count == 0u) {
    return;
  }
  u32 count = transform_dirty_count;
  for (u32 i = 0u; i < count; i += 1u) {
    resolve_transform_entity(transform_dirty_entities[i], 0u);
  }
  transform_dirty_count = 0u;
}

// --- Frame update ----------------------------------------------------------
static void world_sync_for_read(void) {
  system_resolve_relative_transforms();
}

static void world_update_for_frame(void) {
  system_resolve_relative_transforms();
  extract_static_shapes();
  extract_dynamic();
}

// --- History (undo/redo) ---------------------------------------------------
// Delta-based: a transaction records the BEFORE and AFTER V8 record of every
// entity it touches. Undo restores BEFORE (re-creating deletes, removing
// creates); redo restores AFTER. Records are keyed by object_id, so entity-slot
// reuse and parent links survive a round-trip. Budget: BLITZ_HISTORY_MAX_STEPS
// steps and BLITZ_HISTORY_MAX_BYTES of record payload, oldest evicted first.
// A transaction is assumed to be one logical op: it never both creates and
// modifies the same entity, so scratch entries are appended without dedup
// (keeping record capture linear even for whole-selection transforms).
// Transaction/scratch types and state are declared ahead of ecs_storage_init so
// the heap reset there can drop them; see the "History state" block above.

static u32 capture_entity_record(unsigned char *buf, u32 offset, u32 entity);
static u32 apply_entity_record_into(const unsigned char *buf, u32 offset,
                                    u32 entity);
static void apply_record_parent(HistoryTransaction *txn, u32 have_map,
                                const unsigned char *buf, u32 offset, u32 child);

static u32 history_entity_payload_bytes(u32 entity) {
  u32 mask = world.masks[entity];
  if (mask & BLITZ_COMPONENT_PATH_VIEW) {
    return world.path_views[entity].point_count * 8u;
  }
  if ((mask & BLITZ_COMPONENT_RECT_VIEW) && (mask & BLITZ_COMPONENT_FRAME_VIEW)) {
    const char *title = world.frame_views[entity].title;
    return align4(title ? string_length(title) : 0u);
  }
  if (mask & BLITZ_COMPONENT_TEXT_VIEW) {
    const char *text = world.text_views[entity].text;
    return align4(text ? string_length(text) : 0u);
  }
  return 0u;
}

static u32 history_scratch_reserve_bytes(u32 needed) {
  if (history_scratch_byte_count + needed <= history_scratch_byte_cap) {
    return 1u;
  }
  u32 next = history_scratch_byte_cap ? history_scratch_byte_cap : 65536u;
  while (next < history_scratch_byte_count + needed) {
    next *= 2u;
  }
  unsigned char *grown = (unsigned char *)blitz_realloc(
      history_scratch_bytes, history_scratch_byte_count, next);
  if (!grown) {
    return 0u;
  }
  history_scratch_bytes = grown;
  history_scratch_byte_cap = next;
  return 1u;
}

static u32 history_scratch_reserve_entries(u32 needed) {
  if (history_scratch_entry_count + needed <= history_scratch_entry_cap) {
    return 1u;
  }
  u32 next = history_scratch_entry_cap ? history_scratch_entry_cap : 256u;
  while (next < history_scratch_entry_count + needed) {
    next *= 2u;
  }
  HistoryScratchEntry *grown = (HistoryScratchEntry *)blitz_realloc(
      history_scratch_entries,
      (usize)history_scratch_entry_count * sizeof(HistoryScratchEntry),
      (usize)next * sizeof(HistoryScratchEntry));
  if (!grown) {
    return 0u;
  }
  history_scratch_entries = grown;
  history_scratch_entry_cap = next;
  return 1u;
}

static void history_scratch_reset(void) {
  history_scratch_entry_count = 0u;
  history_scratch_byte_count = 0u;
  history_order_dirty = 0u;
  history_order_before_count = 0u;
}

// Snapshot the current draw order the first time a transaction reorders, so undo
// can put it back. No-op when no transaction is open or while replaying.
static void history_record_order_before(void) {
  if (!history_transaction_active || history_replaying || history_order_dirty) {
    return;
  }
  if (world.draw_order_count > history_order_scratch_cap) {
    u32 next = history_order_scratch_cap ? history_order_scratch_cap : 256u;
    while (next < world.draw_order_count) {
      next *= 2u;
    }
    ObjectId *grown = (ObjectId *)blitz_realloc(
        history_order_scratch, 0, (usize)next * sizeof(ObjectId));
    if (!grown) {
      return;
    }
    history_order_scratch = grown;
    history_order_scratch_cap = next;
  }
  for (u32 i = 0u; i < world.draw_order_count; i += 1u) {
    history_order_scratch[i] = world.object_ids[world.draw_order[i]];
  }
  history_order_before_count = world.draw_order_count;
  history_order_dirty = 1u;
}

static void history_txn_begin(void) {
  history_scratch_reset();
  history_transaction_active = 1u;
}

static void history_capture_before(u32 entity) {
  if (history_replaying || !history_scratch_reserve_entries(1u)) {
    return;
  }
  u32 max_record =
      BLITZ_SCENE_FILE_V8_RECORD_BYTES + history_entity_payload_bytes(entity);
  if (!history_scratch_reserve_bytes(max_record)) {
    return;
  }
  u32 offset = history_scratch_byte_count;
  u32 written = capture_entity_record(history_scratch_bytes, offset, entity);
  if (written == 0u) {
    return;
  }
  history_scratch_byte_count += written;
  HistoryScratchEntry *e =
      &history_scratch_entries[history_scratch_entry_count++];
  e->id = world.object_ids[entity];
  e->entity = entity;
  e->before_offset = offset;
  e->after_offset = BLITZ_INVALID_INDEX;
}

static void history_free_transaction(HistoryTransaction *txn) {
  if (txn->entries) {
    blitz_free(txn->entries);
  }
  if (txn->bytes) {
    blitz_free(txn->bytes);
  }
  if (txn->order_before) {
    blitz_free(txn->order_before);
  }
  if (txn->order_after) {
    blitz_free(txn->order_after);
  }
  txn->entries = 0;
  txn->bytes = 0;
  txn->entry_count = 0u;
  txn->byte_count = 0u;
  txn->order_before = 0;
  txn->order_after = 0;
  txn->order_before_count = 0u;
  txn->order_after_count = 0u;
}

// Total heap a transaction holds against the budget: record blobs plus the
// draw-order snapshots (which carry no record bytes but can be large).
static u32 history_txn_bytes(const HistoryTransaction *txn) {
  return txn->byte_count +
         (txn->order_before_count + txn->order_after_count) *
             (u32)sizeof(ObjectId);
}

static void history_clear_redo(void) {
  for (u32 i = 0u; i < history_redo_count; i += 1u) {
    history_total_bytes -= history_txn_bytes(&history_redo_stack[i]);
    history_free_transaction(&history_redo_stack[i]);
  }
  history_redo_count = 0u;
}

static void history_pop_oldest(HistoryTransaction *stack, u32 *count) {
  history_total_bytes -= history_txn_bytes(&stack[0]);
  history_free_transaction(&stack[0]);
  for (u32 i = 1u; i < *count; i += 1u) {
    stack[i - 1u] = stack[i];
  }
  *count -= 1u;
}

static u32 history_records_equal(u32 off_a, u32 off_b) {
  u32 size_a = read_u32(history_scratch_bytes, off_a + 4u);
  u32 size_b = read_u32(history_scratch_bytes, off_b + 4u);
  if (size_a != size_b) {
    return 0u;
  }
  for (u32 i = 0u; i < size_a; i += 1u) {
    if (history_scratch_bytes[off_a + i] != history_scratch_bytes[off_b + i]) {
      return 0u;
    }
  }
  return 1u;
}

static u32 history_entry_kept(const HistoryScratchEntry *e) {
  u32 has_before = e->before_offset != BLITZ_INVALID_INDEX;
  u32 has_after = e->after_offset != BLITZ_INVALID_INDEX;
  if (!has_before && !has_after) {
    return 0u;
  }
  if (has_before && has_after &&
      history_records_equal(e->before_offset, e->after_offset)) {
    return 0u;
  }
  return 1u;
}

static void history_reset_internal(void) {
  history_transaction_active = 0u;
  history_scratch_reset();
  history_clear_redo();
  for (u32 i = 0u; i < history_undo_count; i += 1u) {
    history_total_bytes -= history_txn_bytes(&history_undo_stack[i]);
    history_free_transaction(&history_undo_stack[i]);
  }
  history_undo_count = 0u;
}

static void history_begin(void) {
  history_txn_begin();
}

static u32 history_begin_owned(void) {
  if (history_transaction_active) {
    return 0u;
  }
  history_txn_begin();
  return 1u;
}

static void history_record_before(u32 entity) {
  if (!history_transaction_active) {
    history_txn_begin();
  }
  history_capture_before(entity);
}

static void history_record_created(u32 entity) {
  if (!history_transaction_active || history_replaying ||
      !history_scratch_reserve_entries(1u)) {
    return;
  }
  HistoryScratchEntry *e =
      &history_scratch_entries[history_scratch_entry_count++];
  e->id = world.object_ids[entity];
  e->entity = entity;
  e->before_offset = BLITZ_INVALID_INDEX;
  e->after_offset = BLITZ_INVALID_INDEX;
}

static void history_record_deleted(u32 entity) {
  if (!history_transaction_active) {
    history_txn_begin();
  }
  history_capture_before(entity);
}

static void history_record_selected_before(void) {
  if (!history_transaction_active) {
    history_txn_begin();
  }
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (world.selected[entity]) {
      history_capture_before(entity);
    }
  }
}

static void history_commit(void) {
  if (!history_transaction_active) {
    return;
  }
  history_transaction_active = 0u;
  if (history_replaying) {
    history_scratch_reset();
    return;
  }

  for (u32 i = 0u; i < history_scratch_entry_count; i += 1u) {
    HistoryScratchEntry *e = &history_scratch_entries[i];
    // The capture-time index is reused directly; if the slot was freed or
    // recycled (e.g. the entity was deleted in this transaction), the object_id
    // no longer matches and there is no after-state to record.
    u32 entity = e->entity;
    if (entity >= world.entity_count || world.masks[entity] == 0u ||
        !object_id_equal(world.object_ids[entity], e->id)) {
      e->after_offset = BLITZ_INVALID_INDEX;
      continue;
    }
    u32 max_record =
        BLITZ_SCENE_FILE_V8_RECORD_BYTES + history_entity_payload_bytes(entity);
    if (!history_scratch_reserve_bytes(max_record)) {
      e->after_offset = BLITZ_INVALID_INDEX;
      continue;
    }
    u32 offset = history_scratch_byte_count;
    u32 written = capture_entity_record(history_scratch_bytes, offset, entity);
    if (written == 0u) {
      e->after_offset = BLITZ_INVALID_INDEX;
      continue;
    }
    history_scratch_byte_count += written;
    e->after_offset = offset;
  }

  u32 keep_entries = 0u;
  u32 keep_bytes = 0u;
  for (u32 i = 0u; i < history_scratch_entry_count; i += 1u) {
    HistoryScratchEntry *e = &history_scratch_entries[i];
    if (!history_entry_kept(e)) {
      continue;
    }
    keep_entries += 1u;
    if (e->before_offset != BLITZ_INVALID_INDEX) {
      keep_bytes += read_u32(history_scratch_bytes, e->before_offset + 4u);
    }
    if (e->after_offset != BLITZ_INVALID_INDEX) {
      keep_bytes += read_u32(history_scratch_bytes, e->after_offset + 4u);
    }
  }
  // Drop a reorder snapshot that didn't actually change the order (e.g. bring to
  // front when already frontmost), so it neither bloats nor adds a no-op step.
  if (history_order_dirty) {
    u32 changed = history_order_before_count != world.draw_order_count;
    for (u32 i = 0u; !changed && i < world.draw_order_count; i += 1u) {
      changed = !object_id_equal(history_order_scratch[i],
                                 world.object_ids[world.draw_order[i]]);
    }
    if (!changed) {
      history_order_dirty = 0u;
    }
  }
  if (keep_entries == 0u && !history_order_dirty) {
    history_scratch_reset();
    return;
  }

  HistoryTransaction txn = {0};
  if (keep_entries > 0u) {
    txn.entries =
        (HistoryEntry *)blitz_alloc((usize)keep_entries * sizeof(HistoryEntry));
    txn.bytes = (unsigned char *)blitz_alloc(keep_bytes);
    if (!txn.entries || !txn.bytes) {
      history_free_transaction(&txn);
      history_scratch_reset();
      return;
    }
  }
  // A reorder may have happened with no per-entity change, so capture the
  // before/after draw orders before bailing on an empty entity set.
  if (history_order_dirty) {
    txn.order_before_count = history_order_before_count;
    txn.order_after_count = world.draw_order_count;
    txn.order_before = (ObjectId *)blitz_alloc(
        (usize)history_order_before_count * sizeof(ObjectId));
    txn.order_after = (ObjectId *)blitz_alloc((usize)world.draw_order_count *
                                              sizeof(ObjectId));
    if (!txn.order_before || !txn.order_after) {
      history_free_transaction(&txn);
      history_scratch_reset();
      return;
    }
    for (u32 i = 0u; i < history_order_before_count; i += 1u) {
      txn.order_before[i] = history_order_scratch[i];
    }
    for (u32 i = 0u; i < world.draw_order_count; i += 1u) {
      txn.order_after[i] = world.object_ids[world.draw_order[i]];
    }
  }
  txn.entry_count = keep_entries;
  txn.byte_count = keep_bytes;
  u32 write_pos = 0u;
  u32 out_index = 0u;
  for (u32 i = 0u; i < history_scratch_entry_count; i += 1u) {
    HistoryScratchEntry *e = &history_scratch_entries[i];
    if (!history_entry_kept(e)) {
      continue;
    }
    HistoryEntry *out = &txn.entries[out_index++];
    out->id = e->id;
    out->entity = e->entity;
    if (e->before_offset != BLITZ_INVALID_INDEX) {
      u32 size = read_u32(history_scratch_bytes, e->before_offset + 4u);
      copy_bytes(txn.bytes + write_pos,
                 history_scratch_bytes + e->before_offset, size);
      out->before_offset = write_pos;
      write_pos += size;
    } else {
      out->before_offset = BLITZ_INVALID_INDEX;
    }
    if (e->after_offset != BLITZ_INVALID_INDEX) {
      u32 size = read_u32(history_scratch_bytes, e->after_offset + 4u);
      copy_bytes(txn.bytes + write_pos,
                 history_scratch_bytes + e->after_offset, size);
      out->after_offset = write_pos;
      write_pos += size;
    } else {
      out->after_offset = BLITZ_INVALID_INDEX;
    }
  }

  // Stamp the locally-changed entities with one new Lamport tick and queue them
  // for broadcast. An entry with no after-state is a delete (tombstone). Pure
  // reorders carry no entity entry and aren't versioned in this phase.
  crdt_clock += 1u;
  for (u32 i = 0u; i < history_scratch_entry_count; i += 1u) {
    HistoryScratchEntry *e = &history_scratch_entries[i];
    if (!history_entry_kept(e)) {
      continue;
    }
    u32 deleted = e->after_offset == BLITZ_INVALID_INDEX;
    crdt_stamp_local(deleted ? BLITZ_INVALID_INDEX : e->entity, e->id, deleted);
  }
  if (history_order_dirty) {
    crdt_order_version =
        (CrdtVersion){crdt_clock, object_id_actor_hi, object_id_actor_lo};
    if (crdt_collab_enabled) {
      crdt_order_dirty = 1u;
    }
  }

  history_epoch_counter += 1u;
  txn.epoch = history_epoch_counter;
  history_clear_redo();
  if (history_undo_count == BLITZ_HISTORY_MAX_STEPS) {
    history_pop_oldest(history_undo_stack, &history_undo_count);
  }
  history_undo_stack[history_undo_count++] = txn;
  history_total_bytes += history_txn_bytes(&txn);
  while (history_total_bytes > BLITZ_HISTORY_MAX_BYTES &&
         history_undo_count > 1u) {
    history_pop_oldest(history_undo_stack, &history_undo_count);
  }
  history_scratch_reset();
}

static void history_cancel(void) {
  history_transaction_active = 0u;
  history_scratch_reset();
}

// Tear down an entity without touching draw_order; the caller compacts the
// draw order once for the whole batch (a per-entity removal would be O(n) each,
// O(n^2) over a bulk undo).
static void history_release_entity(u32 entity) {
  cleanup_entity_hierarchy(entity);
  release_entity_resources(entity);
  world.masks[entity] = 0u;
  world.selected[entity] = 0u;
  free_slots[free_count] = entity;
  free_count += 1u;
  live_count -= 1u;
}

static void history_compact_draw_order(void) {
  u32 kept = 0u;
  for (u32 i = 0u; i < world.draw_order_count; i += 1u) {
    u32 entity = world.draw_order[i];
    if (world.masks[entity] != 0u) {
      world.draw_order[kept] = entity;
      kept += 1u;
    }
  }
  world.draw_order_count = kept;
}

// True when the entry's index hint still points at the same live entity.
static u32 history_hint_valid(const HistoryEntry *e) {
  return e->entity < world.entity_count && world.masks[e->entity] != 0u &&
         object_id_equal(world.object_ids[e->entity], e->id);
}

static u32 history_apply_map_hash(ObjectId id) {
  u32 h = id.actor_hi * 2654435761u;
  h ^= id.actor_lo * 2246822519u;
  h ^= id.sequence_hi * 3266489917u;
  h ^= id.sequence_lo * 668265263u;
  h ^= h >> 15;
  return h;
}

// Build an id -> entry-index table over a transaction so parent relink resolves
// in-transaction parents in O(1). Returns 0 if the scratch table can't grow.
static u32 history_apply_map_build(HistoryTransaction *txn) {
  u32 needed = 16u;
  while (needed < txn->entry_count * 2u) {
    needed *= 2u;
  }
  if (needed > history_apply_map_cap) {
    u32 *grown = (u32 *)blitz_realloc(history_apply_map, 0, (usize)needed * 4u);
    if (!grown) {
      return 0u;
    }
    history_apply_map = grown;
    history_apply_map_cap = needed;
  }
  // The table size for both insert and lookup is history_apply_map_cap, which
  // only grows; clearing the whole capacity keeps that mask consistent.
  for (u32 i = 0u; i < history_apply_map_cap; i += 1u) {
    history_apply_map[i] = BLITZ_INVALID_INDEX;
  }
  u32 mask = history_apply_map_cap - 1u;
  for (u32 i = 0u; i < txn->entry_count; i += 1u) {
    u32 slot = history_apply_map_hash(txn->entries[i].id) & mask;
    while (history_apply_map[slot] != BLITZ_INVALID_INDEX) {
      slot = (slot + 1u) & mask;
    }
    history_apply_map[slot] = i;
  }
  return 1u;
}

static u32 history_apply_map_lookup(HistoryTransaction *txn, ObjectId id) {
  if (history_apply_map_cap == 0u) {
    return BLITZ_INVALID_INDEX;
  }
  u32 mask = history_apply_map_cap - 1u;
  u32 slot = history_apply_map_hash(id) & mask;
  while (history_apply_map[slot] != BLITZ_INVALID_INDEX) {
    HistoryEntry *e = &txn->entries[history_apply_map[slot]];
    if (object_id_equal(e->id, id)) {
      return e->entity;
    }
    slot = (slot + 1u) & mask;
  }
  return BLITZ_INVALID_INDEX;
}

// Rebuild draw_order from a stored snapshot. Stale or freed indices are dropped
// and any live entity missing from the snapshot is appended, so the result is
// always a valid permutation of the live set even if entities were created or
// deleted since the snapshot was taken.
// Populate history_order_map with id->entity for every live entity. Returns 0
// if the scratch table can't grow.
static u32 history_order_map_build(void) {
  u32 needed = 16u;
  while (needed < (live_count + 1u) * 2u) {
    needed *= 2u;
  }
  if (needed > history_order_map_cap) {
    u32 *grown = (u32 *)blitz_realloc(history_order_map, 0, (usize)needed * 4u);
    if (!grown) {
      return 0u;
    }
    history_order_map = grown;
    history_order_map_cap = needed;
  }
  for (u32 i = 0u; i < history_order_map_cap; i += 1u) {
    history_order_map[i] = BLITZ_INVALID_INDEX;
  }
  u32 mask = history_order_map_cap - 1u;
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (world.masks[entity] == 0u) {
      continue;
    }
    u32 slot = history_apply_map_hash(world.object_ids[entity]) & mask;
    while (history_order_map[slot] != BLITZ_INVALID_INDEX) {
      slot = (slot + 1u) & mask;
    }
    history_order_map[slot] = entity;
  }
  return 1u;
}

static u32 history_order_map_lookup(ObjectId id) {
  if (history_order_map_cap == 0u) {
    return BLITZ_INVALID_INDEX;
  }
  u32 mask = history_order_map_cap - 1u;
  u32 slot = history_apply_map_hash(id) & mask;
  while (history_order_map[slot] != BLITZ_INVALID_INDEX) {
    u32 entity = history_order_map[slot];
    if (object_id_equal(world.object_ids[entity], id)) {
      return entity;
    }
    slot = (slot + 1u) & mask;
  }
  return BLITZ_INVALID_INDEX;
}

// Rebuild draw_order from an object_id snapshot. Ids are resolved to current
// entities (which may have new indices after a delete/undo); anything no longer
// live is dropped and any live entity absent from the snapshot is appended, so
// the result is a valid permutation of the live set.
static void history_restore_draw_order(const ObjectId *order, u32 count) {
  if (!history_order_map_build()) {
    return;
  }
  for (u32 i = 0u; i < world.entity_count; i += 1u) {
    draw_order_seen[i] = 0u;
  }
  u32 out = 0u;
  for (u32 i = 0u; i < count; i += 1u) {
    u32 entity = history_order_map_lookup(order[i]);
    if (entity != BLITZ_INVALID_INDEX && !draw_order_seen[entity]) {
      draw_order_seen[entity] = 1u;
      world.draw_order[out] = entity;
      out += 1u;
    }
  }
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (world.masks[entity] != 0u && !draw_order_seen[entity]) {
      world.draw_order[out] = entity;
      out += 1u;
    }
  }
  world.draw_order_count = out;
}

static void history_apply_transaction(HistoryTransaction *txn, u32 redo) {
  history_replaying = 1u;
  u32 destroyed_any = 0u;
  // Pass 1: realize each entry's restored state. The transition is read from
  // which side is present, so creates never look the entity up (the freed slot
  // wouldn't be found anyway) and modify/delete reuse the O(1) index hint.
  for (u32 i = 0u; i < txn->entry_count; i += 1u) {
    HistoryEntry *e = &txn->entries[i];
    u32 restore_offset = redo ? e->after_offset : e->before_offset;
    u32 remove_offset = redo ? e->before_offset : e->after_offset;
    if (restore_offset != BLITZ_INVALID_INDEX && remove_offset == BLITZ_INVALID_INDEX) {
      u32 existing = history_hint_valid(e) ? e->entity : BLITZ_INVALID_INDEX;
      e->entity = apply_entity_record_into(txn->bytes, restore_offset, existing);
    } else if (restore_offset != BLITZ_INVALID_INDEX) {
      u32 entity = history_hint_valid(e) ? e->entity : entity_for_object_id(e->id);
      e->entity = apply_entity_record_into(txn->bytes, restore_offset, entity);
    } else if (remove_offset != BLITZ_INVALID_INDEX) {
      u32 entity = history_hint_valid(e) ? e->entity : entity_for_object_id(e->id);
      if (entity != BLITZ_INVALID_INDEX) {
        history_release_entity(entity);
        destroyed_any = 1u;
      }
      e->entity = BLITZ_INVALID_INDEX;
    }
  }
  if (destroyed_any) {
    history_compact_draw_order();
  }
  // Pass 2: relink parents now that every entity exists. apply_record_parent
  // detects an unchanged parent in O(1) (so a move never scans) and resolves
  // through the per-transaction map only on a real reparent.
  u32 have_map = history_apply_map_build(txn);
  for (u32 i = 0u; i < txn->entry_count; i += 1u) {
    HistoryEntry *e = &txn->entries[i];
    u32 restore_offset = redo ? e->after_offset : e->before_offset;
    if (restore_offset == BLITZ_INVALID_INDEX || e->entity == BLITZ_INVALID_INDEX) {
      continue;
    }
    apply_record_parent(txn, have_map, txn->bytes, restore_offset, e->entity);
  }
  if (redo ? txn->order_after != 0 : txn->order_before != 0) {
    history_restore_draw_order(redo ? txn->order_after : txn->order_before,
                               redo ? txn->order_after_count
                                    : txn->order_before_count);
  }
  history_replaying = 0u;
  // An undo/redo is a fresh edit for collaboration: bump versions on the touched
  // entities (an entry with no live entity is a delete) so the change broadcasts.
  crdt_clock += 1u;
  for (u32 i = 0u; i < txn->entry_count; i += 1u) {
    HistoryEntry *e = &txn->entries[i];
    crdt_stamp_local(e->entity, e->id, e->entity == BLITZ_INVALID_INDEX);
  }
  if (txn->order_before != 0 || txn->order_after != 0) {
    crdt_order_version =
        (CrdtVersion){crdt_clock, object_id_actor_hi, object_id_actor_lo};
    if (crdt_collab_enabled) {
      crdt_order_dirty = 1u;
    }
  }
  clear_selection();
  mark_render_list_dirty();
}

static u32 ecs_create_entity(void) {
  u32 entity;
  if (free_count > 0u) {
    free_count -= 1u;
    entity = free_slots[free_count];
  } else if (world.entity_count < BLITZ_MAX_ENTITIES) {
    entity = world.entity_count;
    // Grow before committing the slot so a failed reservation needs no rollback.
    // Reused free slots were live at a prior high-water mark, so they are
    // already backed (capacity never shrinks).
    if (!ecs_storage_reserve(entity + 1u)) {
      return BLITZ_INVALID_INDEX;
    }
    world.entity_count += 1u;
  } else {
    return BLITZ_INVALID_INDEX;
  }
  world.draw_order[world.draw_order_count] = entity;
  world.draw_order_count += 1u;
  world.selected[entity] = 0u;
  world.masks[entity] = 0u;
  world.object_ids[entity] = new_object_id();
  world.first_child[entity] = BLITZ_INVALID_INDEX;
  world.next_sibling[entity] = BLITZ_INVALID_INDEX;
  world.prev_sibling[entity] = BLITZ_INVALID_INDEX;
  world.relative_transforms[entity].parent = BLITZ_INVALID_INDEX;
  world.relative_transforms[entity].offset_x = 0.0f;
  world.relative_transforms[entity].offset_y = 0.0f;
  transform_dirty[entity] = 0u;
  // Grown ECS slots aren't zeroed, so initialise the version explicitly.
  crdt_versions[entity] = (CrdtVersion){0u, 0u, 0u};
  live_count += 1u;
  return entity;
}

// --- ECS component setters -------------------------------------------------
static void ecs_set_position(u32 entity, float x, float y) {
  if (entity == BLITZ_INVALID_INDEX) {
    return;
  }
  world.positions[entity].x = x;
  world.positions[entity].y = y;
  world.masks[entity] |= BLITZ_COMPONENT_POSITION;
  mark_transform_subtree_dirty(entity);
}

static void ecs_move_absolute(u32 entity, float x, float y) {
  if (entity == BLITZ_INVALID_INDEX) {
    return;
  }
  world.positions[entity].x = x;
  world.positions[entity].y = y;
  if (world.masks[entity] & BLITZ_COMPONENT_RELATIVE_TRANSFORM) {
    RelativeTransform *relative = &world.relative_transforms[entity];
    if (relative->parent != BLITZ_INVALID_INDEX &&
        world.masks[relative->parent] != 0u) {
      relative->offset_x = x - world.positions[relative->parent].x;
      relative->offset_y = y - world.positions[relative->parent].y;
    }
  }
  mark_transform_subtree_dirty(entity);
}

static void ecs_set_size(u32 entity, float width, float height) {
  if (entity == BLITZ_INVALID_INDEX) {
    return;
  }
  world.sizes[entity].x = width;
  world.sizes[entity].y = height;
  world.masks[entity] |= BLITZ_COMPONENT_SIZE;
}

static void ecs_set_resizable(u32 entity, u32 horizontal, u32 vertical) {
  if (entity != BLITZ_INVALID_INDEX) {
    if (horizontal) {
      world.masks[entity] |= BLITZ_COMPONENT_RESIZABLE_X;
    }
    if (vertical) {
      world.masks[entity] |= BLITZ_COMPONENT_RESIZABLE_Y;
    }
  }
}

static u32 entity_resize_axes(u32 entity) {
  if (entity == BLITZ_INVALID_INDEX) {
    return 0u;
  }
  u32 axes = 0u;
  if (world.masks[entity] & BLITZ_COMPONENT_RESIZABLE_X) {
    axes |= 1u;
  }
  if (world.masks[entity] & BLITZ_COMPONENT_RESIZABLE_Y) {
    axes |= 2u;
  }
  return axes;
}

static u32 resize_handle_allowed(u32 handle, u32 axes) {
  if (axes == 3u) {
    return handle < 8u;
  }
  if (axes == 1u) {
    return handle == 5u || handle == 7u;
  }
  if (axes == 2u) {
    return handle == 4u || handle == 6u;
  }
  return 0u;
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

static void ecs_set_oval_view(u32 entity, Color fill_color,
                                Color stroke_color, float stroke_width) {
  if (entity == BLITZ_INVALID_INDEX) {
    return;
  }
  world.oval_views[entity].fill_color = fill_color;
  world.oval_views[entity].stroke_color = stroke_color;
  world.oval_views[entity].stroke_width = stroke_width;
  world.masks[entity] |= BLITZ_COMPONENT_OVAL_VIEW;
}

static void ecs_set_text_view(u32 entity, const char *text, Color color,
                              float font_size, float origin_x,
                              float baseline_offset, float max_width,
                              float line_height, u32 max_lines, u32 align) {
  if (entity == BLITZ_INVALID_INDEX) {
    return;
  }
  world.text_views[entity].text = text;
  world.text_views[entity].color = color;
  world.text_views[entity].font_size = font_size;
  world.text_views[entity].origin_x = origin_x;
  world.text_views[entity].baseline_offset = baseline_offset;
  world.text_views[entity].max_width = max_width;
  world.text_views[entity].line_height = line_height;
  world.text_views[entity].max_lines = max_lines;
  world.text_views[entity].align = align;
  world.masks[entity] |= BLITZ_COMPONENT_TEXT_VIEW;
}

static void ecs_set_frame_view(u32 entity, const char *title, Color title_color,
                               float title_font_size) {
  if (entity == BLITZ_INVALID_INDEX) {
    return;
  }
  world.frame_views[entity].title = title;
  world.frame_views[entity].title_color = title_color;
  world.frame_views[entity].title_font_size = title_font_size;
  world.masks[entity] |= BLITZ_COMPONENT_FRAME_VIEW;
}

static void ecs_set_path_view(u32 entity, Vec2 *points, u32 point_count,
                              Color fill_color, float stroke_width) {
  if (entity == BLITZ_INVALID_INDEX) {
    return;
  }
  world.path_views[entity].points = points;
  world.path_views[entity].point_count = point_count;
  world.path_views[entity].fill_color = fill_color;
  world.path_views[entity].stroke_width = stroke_width;
  world.masks[entity] |= BLITZ_COMPONENT_PATH_VIEW;
}

// --- History delta: per-entity capture / restore ---------------------------
// Capture one entity into the V8 record layout at buf+offset; returns the
// record size (0 if the entity has no serializable view). Mirrors the scene
// serialize body so the bytes are interchangeable with apply_entity_record.
static u32 capture_entity_record(unsigned char *buf, u32 offset, u32 entity) {
  u32 mask = world.masks[entity];
  u32 kind;
  Color fill = {0.0f, 0.0f, 0.0f, 1.0f};
  Color stroke = {0.0f, 0.0f, 0.0f, 0.0f};
  float stroke_width = 0.0f, font_size = 0.0f, origin_x = 0.0f;
  float baseline_offset = 0.0f, max_width = 0.0f, line_height = 0.0f;
  u32 max_lines = 0u, align = 0u, text_length = 0u;
  const char *text = 0;
  if ((mask & BLITZ_COMPONENT_RECT_VIEW) && (mask & BLITZ_COMPONENT_FRAME_VIEW)) {
    RectView r = world.rect_views[entity];
    FrameView f = world.frame_views[entity];
    kind = BLITZ_SHAPE_FRAME;
    fill = r.fill_color;
    stroke = r.stroke_color;
    stroke_width = r.stroke_width;
    font_size = f.title_font_size;
    origin_x = f.title_color.r;
    baseline_offset = f.title_color.g;
    max_width = f.title_color.b;
    line_height = f.title_color.a;
    text = f.title;
    text_length = text ? string_length(text) : 0u;
  } else if (mask & BLITZ_COMPONENT_RECT_VIEW) {
    RectView r = world.rect_views[entity];
    kind = BLITZ_SHAPE_RECT;
    fill = r.fill_color;
    stroke = r.stroke_color;
    stroke_width = r.stroke_width;
  } else if (mask & BLITZ_COMPONENT_TRIANGLE_VIEW) {
    TriangleView t = world.triangle_views[entity];
    kind = BLITZ_SHAPE_TRIANGLE;
    fill = t.fill_color;
    stroke = t.stroke_color;
    stroke_width = t.stroke_width;
  } else if (mask & BLITZ_COMPONENT_OVAL_VIEW) {
    OvalView o = world.oval_views[entity];
    kind = BLITZ_SHAPE_OVAL;
    fill = o.fill_color;
    stroke = o.stroke_color;
    stroke_width = o.stroke_width;
  } else if (mask & BLITZ_COMPONENT_TEXT_VIEW) {
    TextView v = world.text_views[entity];
    kind = BLITZ_SHAPE_TEXT;
    fill = v.color;
    font_size = v.font_size;
    origin_x = v.origin_x;
    baseline_offset = v.baseline_offset;
    max_width = v.max_width;
    line_height = v.line_height;
    max_lines = v.max_lines;
    align = v.align;
    text = v.text;
    text_length = text ? string_length(text) : 0u;
  } else if (mask & BLITZ_COMPONENT_PATH_VIEW) {
    PathView v = world.path_views[entity];
    kind = BLITZ_SHAPE_PATH;
    fill = v.fill_color;
    stroke_width = v.stroke_width;
    text_length = v.point_count;
  } else {
    return 0u;
  }

  u32 payload = kind == BLITZ_SHAPE_PATH ? text_length * 8u : align4(text_length);
  u32 record_bytes = BLITZ_SCENE_FILE_V8_RECORD_BYTES + payload;
  Vec2 position = world.positions[entity];
  Vec2 size = world.sizes[entity];
  ObjectId oid = world.object_ids[entity];
  write_u32(buf, offset, kind);
  write_u32(buf, offset + 4u, record_bytes);
  write_u32(buf, offset + 8u, oid.sequence_lo);
  write_u32(buf, offset + 12u, text_length);
  write_f32(buf, offset + 16u, position.x);
  write_f32(buf, offset + 20u, position.y);
  write_f32(buf, offset + 24u, size.x);
  write_f32(buf, offset + 28u, size.y);
  write_f32(buf, offset + 32u, fill.r);
  write_f32(buf, offset + 36u, fill.g);
  write_f32(buf, offset + 40u, fill.b);
  write_f32(buf, offset + 44u, fill.a);
  write_f32(buf, offset + 48u, stroke.r);
  write_f32(buf, offset + 52u, stroke.g);
  write_f32(buf, offset + 56u, stroke.b);
  write_f32(buf, offset + 60u, stroke.a);
  write_f32(buf, offset + 64u, stroke_width);
  write_f32(buf, offset + 68u, font_size);
  write_f32(buf, offset + 72u, origin_x);
  write_f32(buf, offset + 76u, baseline_offset);
  write_u32(buf, offset + 80u, oid.actor_hi);
  write_u32(buf, offset + 84u, oid.actor_lo);
  write_u32(buf, offset + 88u, oid.sequence_hi);
  write_f32(buf, offset + 92u, max_width);
  write_f32(buf, offset + 96u, line_height);
  write_u32(buf, offset + 100u, max_lines);
  write_u32(buf, offset + 104u, align);
  write_u32(buf, offset + 108u, mask & BLITZ_COMPONENT_CONTAINER);
  ObjectId parent_id = object_id_zero();
  float parent_offset_x = 0.0f;
  float parent_offset_y = 0.0f;
  if ((mask & BLITZ_COMPONENT_RELATIVE_TRANSFORM) &&
      world.relative_transforms[entity].parent != BLITZ_INVALID_INDEX) {
    parent_id = world.object_ids[world.relative_transforms[entity].parent];
    parent_offset_x = world.relative_transforms[entity].offset_x;
    parent_offset_y = world.relative_transforms[entity].offset_y;
  }
  write_u32(buf, offset + 112u, parent_id.actor_hi);
  write_u32(buf, offset + 116u, parent_id.actor_lo);
  write_u32(buf, offset + 120u, parent_id.sequence_hi);
  write_u32(buf, offset + 124u, parent_id.sequence_lo);
  write_f32(buf, offset + 128u, parent_offset_x);
  write_f32(buf, offset + 132u, parent_offset_y);
  if (kind == BLITZ_SHAPE_PATH) {
    PathView v = world.path_views[entity];
    for (u32 i = 0u; i < v.point_count; i += 1u) {
      write_f32(buf, offset + BLITZ_SCENE_FILE_V8_RECORD_BYTES + i * 8u,
                v.points[i].x);
      write_f32(buf, offset + BLITZ_SCENE_FILE_V8_RECORD_BYTES + i * 8u + 4u,
                v.points[i].y);
    }
  } else if (text) {
    for (u32 i = 0u; i < text_length; i += 1u) {
      buf[offset + BLITZ_SCENE_FILE_V8_RECORD_BYTES + i] = (unsigned char)text[i];
    }
  }
  return record_bytes;
}

// Re-establish a record's relative-transform parent. `child` is the already
// resolved entity; `parent` is its resolved parent (INVALID when the record has
// no parent). Call after all records in a delta have been applied.
static void apply_record_parent(HistoryTransaction *txn, u32 have_map,
                                const unsigned char *buf, u32 offset, u32 child) {
  if (child == BLITZ_INVALID_INDEX) {
    return;
  }
  ObjectId parent_id = {read_u32(buf, offset + 112u),
                        read_u32(buf, offset + 116u),
                        read_u32(buf, offset + 120u),
                        read_u32(buf, offset + 124u)};
  u32 has_relative = world.masks[child] & BLITZ_COMPONENT_RELATIVE_TRANSFORM;
  u32 current = has_relative ? world.relative_transforms[child].parent
                             : BLITZ_INVALID_INDEX;
  if (object_id_is_zero(parent_id)) {
    if (has_relative) {
      detach_from_parent(child);
    }
    return;
  }
  float offset_x = read_f32(buf, offset + 128u);
  float offset_y = read_f32(buf, offset + 132u);
  // Parent unchanged (the common case for a move) is detected by comparing the
  // current parent's object_id in O(1) — crucially without resolving parent_id,
  // which would otherwise be a per-entity scan when the parent isn't itself in
  // the transaction (e.g. moving items but not their container). Only restore
  // the offset and re-resolve the subtree if it actually moved.
  if (current != BLITZ_INVALID_INDEX && world.masks[current] != 0u &&
      object_id_equal(world.object_ids[current], parent_id)) {
    RelativeTransform *relative = &world.relative_transforms[child];
    if (relative->offset_x != offset_x || relative->offset_y != offset_y) {
      relative->offset_x = offset_x;
      relative->offset_y = offset_y;
      mark_transform_dirty(child);
      mark_transform_subtree_dirty(child);
    }
    return;
  }
  // A real reparent: resolve the parent (in-transaction map, else a scan) and
  // re-link. attach_relative_transform's O(subtree) cycle check runs only here.
  u32 parent = have_map ? history_apply_map_lookup(txn, parent_id)
                        : BLITZ_INVALID_INDEX;
  if (parent == BLITZ_INVALID_INDEX) {
    parent = entity_for_object_id(parent_id);
  }
  if (parent != BLITZ_INVALID_INDEX) {
    attach_relative_transform(child, parent, offset_x, offset_y);
  }
}


// Create or update an entity from a record (id-stable). `entity` is the target
// slot, or INVALID to create a fresh one. Existing entities are updated in place
// (index preserved, so hierarchy references stay valid); the old path-point
// allocation is freed before replacing. Parent links are left to
// apply_record_parent.
static u32 apply_entity_record_into(const unsigned char *buf, u32 offset,
                                    u32 entity) {
  u32 kind = read_u32(buf, offset);
  ObjectId oid = {read_u32(buf, offset + 80u), read_u32(buf, offset + 84u),
                  read_u32(buf, offset + 88u), read_u32(buf, offset + 8u)};
  u32 text_length = read_u32(buf, offset + 12u);
  float x = read_f32(buf, offset + 16u);
  float y = read_f32(buf, offset + 20u);
  float width = read_f32(buf, offset + 24u);
  float height = read_f32(buf, offset + 28u);
  Color fill = {read_f32(buf, offset + 32u), read_f32(buf, offset + 36u),
                read_f32(buf, offset + 40u), read_f32(buf, offset + 44u)};
  Color stroke = {read_f32(buf, offset + 48u), read_f32(buf, offset + 52u),
                  read_f32(buf, offset + 56u), read_f32(buf, offset + 60u)};
  float stroke_width = read_f32(buf, offset + 64u);
  float font_size = read_f32(buf, offset + 68u);
  float origin_x = read_f32(buf, offset + 72u);
  float baseline_offset = read_f32(buf, offset + 76u);
  float max_width = read_f32(buf, offset + 92u);
  float line_height = read_f32(buf, offset + 96u);
  u32 max_lines = read_u32(buf, offset + 100u);
  u32 align = read_u32(buf, offset + 104u);
  u32 container = read_u32(buf, offset + 108u) & BLITZ_COMPONENT_CONTAINER;
  const unsigned char *payload = buf + offset + BLITZ_SCENE_FILE_V8_RECORD_BYTES;

  if (entity == BLITZ_INVALID_INDEX) {
    entity = ecs_create_entity();
    if (entity == BLITZ_INVALID_INDEX) {
      return BLITZ_INVALID_INDEX;
    }
    world.object_ids[entity] = oid;
    advance_sequence_past(oid);
  } else {
    if (world.masks[entity] & BLITZ_COMPONENT_PATH_VIEW) {
      blitz_free(world.path_views[entity].points);
      world.path_views[entity].points = 0;
    }
    world.masks[entity] &=
        ~(u32)(BLITZ_COMPONENT_RECT_VIEW | BLITZ_COMPONENT_TRIANGLE_VIEW |
               BLITZ_COMPONENT_OVAL_VIEW | BLITZ_COMPONENT_TEXT_VIEW |
               BLITZ_COMPONENT_FRAME_VIEW | BLITZ_COMPONENT_PATH_VIEW |
               BLITZ_COMPONENT_CONTAINER);
  }
  ecs_set_position(entity, x, y);
  ecs_set_size(entity, width, height);
  if (kind == BLITZ_SHAPE_TRIANGLE) {
    ecs_set_triangle_view(entity, fill, stroke, stroke_width);
    ecs_set_resizable(entity, 1u, 1u);
  } else if (kind == BLITZ_SHAPE_OVAL) {
    ecs_set_oval_view(entity, fill, stroke, stroke_width);
    ecs_set_resizable(entity, 1u, 1u);
  } else if (kind == BLITZ_SHAPE_PATH) {
    Vec2 *points = (Vec2 *)blitz_alloc((usize)text_length * sizeof(Vec2));
    if (!points) {
      return BLITZ_INVALID_INDEX;
    }
    for (u32 i = 0u; i < text_length; i += 1u) {
      points[i].x = read_f32(payload, i * 8u);
      points[i].y = read_f32(payload, i * 8u + 4u);
    }
    ecs_set_path_view(entity, points, text_length, fill, stroke_width);
  } else if (kind == BLITZ_SHAPE_FRAME) {
    char *title = "";
    if (text_length > 0u && text_pool_ensure(text_length + 1u)) {
      title = &text_pool[text_pool_used];
      for (u32 i = 0u; i < text_length; i += 1u) {
        title[i] = (char)payload[i];
      }
      title[text_length] = '\0';
      text_pool_used += text_length + 1u;
    }
    Color title_color = {origin_x, baseline_offset, max_width, line_height};
    ecs_set_rect_view(entity, fill, stroke, stroke_width);
    ecs_set_frame_view(entity, title, title_color,
                       font_size > 0.0f ? font_size : 18.0f);
    ecs_set_resizable(entity, 1u, 1u);
  } else if (kind == BLITZ_SHAPE_TEXT) {
    char *text = "";
    if (text_length > 0u && text_pool_ensure(text_length + 1u)) {
      text = &text_pool[text_pool_used];
      for (u32 i = 0u; i < text_length; i += 1u) {
        text[i] = (char)payload[i];
      }
      text[text_length] = '\0';
      text_pool_used += text_length + 1u;
    }
    ecs_set_text_view(entity, text, fill, font_size, origin_x, baseline_offset,
                      max_width, line_height, max_lines, align);
    ecs_set_resizable(entity, 1u, 0u);
  } else {
    ecs_set_rect_view(entity, fill, stroke, stroke_width);
    ecs_set_resizable(entity, 1u, 1u);
  }
  if (container) {
    set_container_component(entity, 1u);
  }
  world.masks[entity] |= BLITZ_COMPONENT_SELECTABLE;
  return entity;
}

// --- CRDT: op transport ----------------------------------------------------
// Wire layout of one op inside an op batch (all little-endian u32):
//   +0  id.actor_hi   +4  id.actor_lo   +8  id.sequence_hi  +12 id.sequence_lo
//   +16 version.lamport  +20 version.actor_hi  +24 version.actor_lo
//   +28 deleted (1=tombstone, 0=upsert)   +32 record_bytes (0 if deleted)
//   +36 the V8 entity record (record_bytes), present only for an upsert.
// A batch is a 24-byte header — u32 op_count, u32 order_present, the order
// CrdtVersion (3 u32), u32 order_count — then op_count ops back to back, then
// (if order_present) order_count contiguous ObjectIds giving the draw order.
// The 24-byte header, 36-byte op header and 4-aligned record keep all 4-aligned.
#define BLITZ_CRDT_OP_HEADER 36u
#define BLITZ_CRDT_BATCH_HEADER 24u

static int crdt_version_equal(CrdtVersion a, CrdtVersion b) {
  return a.lamport == b.lamport && a.actor_hi == b.actor_hi &&
         a.actor_lo == b.actor_lo;
}

static CrdtVersion crdt_current_version(ObjectId id, u32 *out_entity) {
  u32 entity = entity_for_object_id(id);
  if (out_entity) {
    *out_entity = entity;
  }
  if (entity != BLITZ_INVALID_INDEX) {
    return crdt_versions[entity];
  }
  CrdtVersion stone;
  if (crdt_tombstone_version(id, &stone)) {
    return stone;
  }
  return (CrdtVersion){0u, 0u, 0u};
}

static ObjectId crdt_op_id(const unsigned char *buf, u32 op) {
  ObjectId id = {read_u32(buf, op), read_u32(buf, op + 4u),
                 read_u32(buf, op + 8u), read_u32(buf, op + 12u)};
  return id;
}

static CrdtVersion crdt_op_version(const unsigned char *buf, u32 op) {
  CrdtVersion version = {read_u32(buf, op + 16u), read_u32(buf, op + 20u),
                         read_u32(buf, op + 24u)};
  return version;
}

// Realize one op into the live scene if its version wins LWW. Parent relinking
// is left to a second batch pass. Returns 1 when applied.
static u32 crdt_apply_one(const unsigned char *buf, u32 op, u32 *destroyed_any) {
  ObjectId id = crdt_op_id(buf, op);
  CrdtVersion version = crdt_op_version(buf, op);
  u32 deleted = read_u32(buf, op + 28u);
  u32 entity;
  CrdtVersion current = crdt_current_version(id, &entity);
  if (!crdt_version_newer(version, current)) {
    return 0u;
  }
  if (version.lamport > crdt_clock) {
    crdt_clock = version.lamport;
  }
  if (deleted) {
    if (entity != BLITZ_INVALID_INDEX) {
      history_release_entity(entity);
      *destroyed_any = 1u;
    }
    crdt_tombstone_set(id, version);
    return 1u;
  }
  u32 applied = apply_entity_record_into(buf, op + BLITZ_CRDT_OP_HEADER, entity);
  if (applied == BLITZ_INVALID_INDEX) {
    return 0u;
  }
  crdt_versions[applied] = version;
  if (crdt_tombstone_count > 0u) {
    crdt_tombstone_remove(id);
  }
  return 1u;
}

// Queue a child whose parent wasn't present when its op applied. A repeat for
// the same child overwrites (the latest link wins).
static void crdt_pending_parent_add(ObjectId child, ObjectId parent, float ox,
                                    float oy) {
  for (u32 i = 0u; i < crdt_pending_parent_count; i += 1u) {
    if (object_id_equal(crdt_pending_parents[i].child, child)) {
      crdt_pending_parents[i].parent = parent;
      crdt_pending_parents[i].offset_x = ox;
      crdt_pending_parents[i].offset_y = oy;
      return;
    }
  }
  if (crdt_pending_parent_count >= crdt_pending_parent_cap) {
    u32 next = crdt_pending_parent_cap ? crdt_pending_parent_cap * 2u : 32u;
    CrdtPendingParent *grown = (CrdtPendingParent *)blitz_realloc(
        crdt_pending_parents,
        (usize)crdt_pending_parent_count * sizeof(CrdtPendingParent),
        (usize)next * sizeof(CrdtPendingParent));
    if (!grown) {
      return;
    }
    crdt_pending_parents = grown;
    crdt_pending_parent_cap = next;
  }
  CrdtPendingParent *p = &crdt_pending_parents[crdt_pending_parent_count];
  p->child = child;
  p->parent = parent;
  p->offset_x = ox;
  p->offset_y = oy;
  crdt_pending_parent_count += 1u;
}

// Retry queued links: resolved ones (and any whose child vanished) are removed,
// so a child that arrived before its parent links once the parent shows up.
static void crdt_retry_pending_parents(void) {
  u32 kept = 0u;
  for (u32 i = 0u; i < crdt_pending_parent_count; i += 1u) {
    CrdtPendingParent p = crdt_pending_parents[i];
    u32 child = entity_for_object_id(p.child);
    if (child == BLITZ_INVALID_INDEX) {
      continue;
    }
    u32 parent = entity_for_object_id(p.parent);
    if (parent != BLITZ_INVALID_INDEX) {
      attach_relative_transform(child, parent, p.offset_x, p.offset_y);
      continue;
    }
    crdt_pending_parents[kept] = p;
    kept += 1u;
  }
  crdt_pending_parent_count = kept;
}

// Adopt a draw-order snapshot if its version wins LWW. The ids are contiguous
// ObjectIds in the wire buffer (same layout as the struct), resolved to the
// current entities; a stale/freed id is dropped and a missing live entity is
// appended, so the result is always a valid permutation of the live set.
static void crdt_apply_order(const unsigned char *buf, u32 offset,
                             CrdtVersion version, u32 count) {
  if (!crdt_version_newer(version, crdt_order_version)) {
    return;
  }
  history_restore_draw_order((const ObjectId *)(buf + offset), count);
  crdt_order_version = version;
  if (version.lamport > crdt_clock) {
    crdt_clock = version.lamport;
  }
}

// Apply a serialized op batch from `buf`. Two passes realize entities then
// relink parents — so a child whose parent is later in the same batch still
// links, and only the merge-winning op for an id relinks. A trailing order
// snapshot, if present, is adopted last (after every entity exists). Returns
// the count of ops applied.
static u32 crdt_apply_op_batch(const unsigned char *buf, u32 byte_count) {
  if (byte_count < BLITZ_CRDT_BATCH_HEADER) {
    return 0u;
  }
  u32 op_count = read_u32(buf, 0u);
  u32 order_present = read_u32(buf, 4u);
  CrdtVersion order_version = {read_u32(buf, 8u), read_u32(buf, 12u),
                               read_u32(buf, 16u)};
  u32 order_count = read_u32(buf, 20u);
  u32 destroyed_any = 0u;
  u32 applied = 0u;
  u32 op = BLITZ_CRDT_BATCH_HEADER;
  for (u32 i = 0u; i < op_count; i += 1u) {
    u32 record_bytes = read_u32(buf, op + 32u);
    applied += crdt_apply_one(buf, op, &destroyed_any);
    op += BLITZ_CRDT_OP_HEADER + record_bytes;
  }
  if (destroyed_any) {
    history_compact_draw_order();
  }
  op = BLITZ_CRDT_BATCH_HEADER;
  for (u32 i = 0u; i < op_count; i += 1u) {
    u32 deleted = read_u32(buf, op + 28u);
    u32 record_bytes = read_u32(buf, op + 32u);
    if (!deleted) {
      ObjectId id = crdt_op_id(buf, op);
      CrdtVersion version = crdt_op_version(buf, op);
      u32 entity = entity_for_object_id(id);
      if (entity != BLITZ_INVALID_INDEX &&
          crdt_version_equal(crdt_versions[entity], version)) {
        u32 rec = op + BLITZ_CRDT_OP_HEADER;
        apply_record_parent(0, 0u, buf, rec, entity);
        // The op names a parent, but apply_record_parent left the child
        // unlinked — the parent is in a later message. Queue it for retry.
        ObjectId parent_id = {read_u32(buf, rec + 112u), read_u32(buf, rec + 116u),
                              read_u32(buf, rec + 120u), read_u32(buf, rec + 124u)};
        if (!object_id_is_zero(parent_id)) {
          u32 has_rel = world.masks[entity] & BLITZ_COMPONENT_RELATIVE_TRANSFORM;
          u32 cur = has_rel ? world.relative_transforms[entity].parent
                            : BLITZ_INVALID_INDEX;
          if (cur == BLITZ_INVALID_INDEX) {
            crdt_pending_parent_add(id, parent_id, read_f32(buf, rec + 128u),
                                    read_f32(buf, rec + 132u));
          }
        }
      }
    }
    op += BLITZ_CRDT_OP_HEADER + record_bytes;
  }
  if (order_present) {
    crdt_apply_order(buf, op, order_version, order_count);
  }
  crdt_retry_pending_parents();
  mark_render_list_dirty();
  return applied;
}

static void crdt_write_op_header(u32 offset, ObjectId id, CrdtVersion version,
                                 u32 deleted, u32 record_bytes) {
  write_u32(scene_file_buffer, offset, id.actor_hi);
  write_u32(scene_file_buffer, offset + 4u, id.actor_lo);
  write_u32(scene_file_buffer, offset + 8u, id.sequence_hi);
  write_u32(scene_file_buffer, offset + 12u, id.sequence_lo);
  write_u32(scene_file_buffer, offset + 16u, version.lamport);
  write_u32(scene_file_buffer, offset + 20u, version.actor_hi);
  write_u32(scene_file_buffer, offset + 24u, version.actor_lo);
  write_u32(scene_file_buffer, offset + 28u, deleted);
  write_u32(scene_file_buffer, offset + 32u, record_bytes);
}

static void crdt_write_batch_header(u32 op_count, u32 order_present,
                                    u32 order_count) {
  write_u32(scene_file_buffer, 0u, op_count);
  write_u32(scene_file_buffer, 4u, order_present);
  write_u32(scene_file_buffer, 8u, crdt_order_version.lamport);
  write_u32(scene_file_buffer, 12u, crdt_order_version.actor_hi);
  write_u32(scene_file_buffer, 16u, crdt_order_version.actor_lo);
  write_u32(scene_file_buffer, 20u, order_count);
}

// Append the full draw order as contiguous ObjectIds at `offset`; returns the
// new offset, or 0 if the buffer can't grow.
static u32 crdt_write_order_block(u32 offset) {
  if (!scene_file_ensure(
          offset + world.draw_order_count * (u32)sizeof(ObjectId), offset)) {
    return 0u;
  }
  for (u32 i = 0u; i < world.draw_order_count; i += 1u) {
    ObjectId id = world.object_ids[world.draw_order[i]];
    write_u32(scene_file_buffer, offset, id.actor_hi);
    write_u32(scene_file_buffer, offset + 4u, id.actor_lo);
    write_u32(scene_file_buffer, offset + 8u, id.sequence_hi);
    write_u32(scene_file_buffer, offset + 12u, id.sequence_lo);
    offset += (u32)sizeof(ObjectId);
  }
  return offset;
}

// Emit the upsert op for `entity` at `offset`; returns the new offset (== input
// when the entity has no syncable record), or 0 if the buffer can't grow.
static u32 crdt_emit_upsert(u32 offset, u32 entity) {
  u32 max_record =
      BLITZ_SCENE_FILE_V8_RECORD_BYTES + history_entity_payload_bytes(entity);
  if (!scene_file_ensure(offset + BLITZ_CRDT_OP_HEADER + max_record, offset)) {
    return 0u;
  }
  u32 record_bytes =
      capture_entity_record(scene_file_buffer, offset + BLITZ_CRDT_OP_HEADER, entity);
  if (record_bytes == 0u) {
    return offset;
  }
  crdt_write_op_header(offset, world.object_ids[entity], crdt_versions[entity],
                       0u, record_bytes);
  return offset + BLITZ_CRDT_OP_HEADER + record_bytes;
}

// Serialize the queued local changes (plus the draw order if it changed) into
// scene_file_buffer as an op batch and clear the queue. Returns the byte
// length, or 0 when there is nothing to send.
static u32 crdt_capture_changes(void) {
  if (crdt_dirty_count == 0u && !crdt_order_dirty) {
    return 0u;
  }
  if (!scene_file_ensure(BLITZ_CRDT_BATCH_HEADER, 0u)) {
    return 0u;
  }
  u32 offset = BLITZ_CRDT_BATCH_HEADER;
  u32 emitted = 0u;
  for (u32 i = 0u; i < crdt_dirty_count; i += 1u) {
    ObjectId id = crdt_dirty_ids[i];
    u32 entity = entity_for_object_id(id);
    if (entity != BLITZ_INVALID_INDEX) {
      u32 next = crdt_emit_upsert(offset, entity);
      if (next == 0u) {
        break;
      }
      if (next != offset) {
        emitted += 1u;
        offset = next;
      }
    } else {
      CrdtVersion version;
      if (!crdt_tombstone_version(id, &version)) {
        continue;
      }
      if (!scene_file_ensure(offset + BLITZ_CRDT_OP_HEADER, offset)) {
        break;
      }
      crdt_write_op_header(offset, id, version, 1u, 0u);
      offset += BLITZ_CRDT_OP_HEADER;
      emitted += 1u;
    }
  }
  u32 order_present = 0u;
  u32 order_count = 0u;
  if (crdt_order_dirty) {
    u32 next = crdt_write_order_block(offset);
    if (next != 0u) {
      order_present = 1u;
      order_count = world.draw_order_count;
      offset = next;
      crdt_order_dirty = 0u;
    }
  }
  crdt_write_batch_header(emitted, order_present, order_count);
  crdt_dirty_count = 0u;
  return offset;
}

// Serialize the whole live scene (in draw order, so a fresh peer's creation
// order already matches) plus the order snapshot — a baseline for a joiner.
static u32 crdt_capture_baseline(void) {
  if (!scene_file_ensure(BLITZ_CRDT_BATCH_HEADER, 0u)) {
    return 0u;
  }
  u32 offset = BLITZ_CRDT_BATCH_HEADER;
  u32 emitted = 0u;
  u32 baseline_lamport = 0u;
  for (u32 i = 0u; i < world.draw_order_count; i += 1u) {
    u32 entity = world.draw_order[i];
    if (world.masks[entity] == 0u) {
      continue;
    }
    // Entities from a loaded scene file are unversioned (lamport 0); a peer's
    // baseline for the same id is also 0, so give them a real version once,
    // otherwise the equal-version merge would reject them.
    if (crdt_versions[entity].lamport == 0u) {
      if (baseline_lamport == 0u) {
        crdt_clock += 1u;
        baseline_lamport = crdt_clock;
      }
      crdt_versions[entity] = (CrdtVersion){baseline_lamport, object_id_actor_hi,
                                            object_id_actor_lo};
    }
    u32 next = crdt_emit_upsert(offset, entity);
    if (next == 0u) {
      break;
    }
    if (next != offset) {
      emitted += 1u;
      offset = next;
    }
  }
  // Carry tombstones so a joiner learns about deletes (including ones made while
  // disconnected). Skip any whose id is live again — that stone is stale.
  for (u32 i = 0u; i < crdt_tombstone_cap; i += 1u) {
    if (!crdt_tombstones[i].used) {
      continue;
    }
    ObjectId tid = crdt_tombstones[i].id;
    if (entity_for_object_id(tid) != BLITZ_INVALID_INDEX) {
      continue;
    }
    if (!scene_file_ensure(offset + BLITZ_CRDT_OP_HEADER, offset)) {
      break;
    }
    crdt_write_op_header(offset, tid, crdt_tombstones[i].version, 1u, 0u);
    offset += BLITZ_CRDT_OP_HEADER;
    emitted += 1u;
  }
  u32 order_present = 0u;
  u32 order_count = 0u;
  u32 next = crdt_write_order_block(offset);
  if (next != 0u) {
    order_present = 1u;
    order_count = world.draw_order_count;
    offset = next;
  }
  crdt_write_batch_header(emitted, order_present, order_count);
  return offset;
}

static Vec2 path_bounds_min(Vec2 *points, u32 point_count) {
  Vec2 result = points[0];
  for (u32 i = 1u; i < point_count; i += 1u) {
    result.x = result.x < points[i].x ? result.x : points[i].x;
    result.y = result.y < points[i].y ? result.y : points[i].y;
  }
  return result;
}

static Vec2 path_bounds_max(Vec2 *points, u32 point_count) {
  Vec2 result = points[0];
  for (u32 i = 1u; i < point_count; i += 1u) {
    result.x = result.x > points[i].x ? result.x : points[i].x;
    result.y = result.y > points[i].y ? result.y : points[i].y;
  }
  return result;
}

static float vec2_length(float x, float y) {
  return __builtin_sqrtf(x * x + y * y);
}

static Vec2 path_point_world(PathView view, Vec2 position, u32 index) {
  Vec2 point = {position.x + view.points[index].x,
                position.y + view.points[index].y};
  return point;
}

static Vec2 path_tangent_at(PathView view, Vec2 position, u32 index) {
  Vec2 prev = index > 0u ? path_point_world(view, position, index - 1u)
                         : path_point_world(view, position, index);
  Vec2 next = index + 1u < view.point_count
                  ? path_point_world(view, position, index + 1u)
                  : path_point_world(view, position, index);
  float x = next.x - prev.x;
  float y = next.y - prev.y;
  float length = vec2_length(x, y);
  if (length <= 0.001f) {
    return (Vec2){1.0f, 0.0f};
  }
  return (Vec2){x / length, y / length};
}

// --- Path geometry & tessellation ------------------------------------------
// Each stroke emits two LOD tiers of capsule segments: full detail, plus a
// coarse tier (every BLITZ_PATH_LOD_STRIDE-th point) for when it's small on
// screen. The per-stroke cull picks one tier to draw.
static u32 path_tier_segment_count(u32 point_count, u32 stride) {
  if (point_count < 2u) {
    return 0u;
  }
  u32 spans = point_count - 1u;
  return (spans + stride - 1u) / stride; // ceil: last span reaches the end
}

static u32 path_segment_count_for(PathView view) {
  if (!view.points || view.point_count < 2u || view.fill_color.a <= 0.001f) {
    return 0u;
  }
  return path_tier_segment_count(view.point_count, 1u) +
         path_tier_segment_count(view.point_count, BLITZ_PATH_LOD_STRIDE);
}

static void path_recompute_entity_bounds_preserve_world(u32 entity) {
  if (entity == BLITZ_INVALID_INDEX ||
      !(world.masks[entity] & BLITZ_COMPONENT_PATH_VIEW)) {
    return;
  }
  PathView view = world.path_views[entity];
  if (!view.points || view.point_count < 2u) {
    return;
  }
  Vec2 old_position = world.positions[entity];
  Vec2 min = path_bounds_min(view.points, view.point_count);
  Vec2 max = path_bounds_max(view.points, view.point_count);
  float pad = view.stroke_width * 0.5f;
  Vec2 next_position = {old_position.x + min.x - pad,
                        old_position.y + min.y - pad};
  float dx = old_position.x - next_position.x;
  float dy = old_position.y - next_position.y;
  for (u32 i = 0u; i < view.point_count; i += 1u) {
    view.points[i].x += dx;
    view.points[i].y += dy;
  }
  world.positions[entity] = next_position;
  world.sizes[entity].x = max.x - min.x + pad * 2.0f;
  world.sizes[entity].y = max.y - min.y + pad * 2.0f;
}

// --- Selection -------------------------------------------------------------
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

// Draw order is no longer continuously normalized into parent-then-children
// runs. Entities keep their own z-order; the single rule (a child must not
// render below the container it was dropped onto) is enforced only at drop time
// by lift_selection_above_container.
// --- Draw order ------------------------------------------------------------
static void normalize_draw_order_hierarchy(void) {}

// True when `container` is an ancestor of `entity` in the relative-transform
// hierarchy (i.e. `entity` lives inside `container`).
static u32 entity_in_container(u32 entity, u32 container) {
  u32 cursor = entity;
  for (u32 guard = 0u; guard < world.entity_count; guard += 1u) {
    if (!(world.masks[cursor] & BLITZ_COMPONENT_RELATIVE_TRANSFORM)) {
      return 0u;
    }
    cursor = world.relative_transforms[cursor].parent;
    if (cursor == BLITZ_INVALID_INDEX) {
      return 0u;
    }
    if (cursor == container) {
      return 1u;
    }
  }
  return 0u;
}

// Lift the dragged selection (and everything nested inside it) above the rest
// of `container` in z, in a single pass over the draw order. Called once after
// a drop, so attaching a large multi-selection to a container stays linear
// rather than quadratic. The selection moves together keeping its internal
// order — a dropped container keeps its own children above itself — and it is a
// no-op when the selection already sits entirely above the container's other
// contents.
static void lift_selection_above_container(u32 container) {
  history_record_order_before();
  // Flag the dropped set: every selected shape plus everything nested in one.
  u32 lifted = 0u;
  for (u32 i = 0u; i < world.draw_order_count; i += 1u) {
    u32 current = world.draw_order[i];
    u32 in_set =
        world.selected[current] || entity_has_selected_ancestor(current);
    draw_order_seen[current] = in_set;
    lifted += in_set;
  }
  if (lifted == 0u) {
    return;
  }
  // Highest-ordered container member that is not being lifted, plus the lowest
  // position the lifted set currently occupies.
  u32 top_index = BLITZ_INVALID_INDEX;
  u32 top_member = BLITZ_INVALID_INDEX;
  u32 lowest_lifted = BLITZ_INVALID_INDEX;
  for (u32 i = 0u; i < world.draw_order_count; i += 1u) {
    u32 current = world.draw_order[i];
    if (draw_order_seen[current]) {
      if (lowest_lifted == BLITZ_INVALID_INDEX) {
        lowest_lifted = i;
      }
    } else if (current == container ||
               entity_in_container(current, container)) {
      top_index = i;
      top_member = current;
    }
  }
  if (top_member == BLITZ_INVALID_INDEX ||
      (lowest_lifted != BLITZ_INVALID_INDEX && lowest_lifted > top_index)) {
    return;
  }
  // Rebuild: drop the lifted subtree out, then re-insert it (in its existing
  // relative order) immediately above the container's topmost other member.
  u32 output = 0u;
  for (u32 i = 0u; i < world.draw_order_count; i += 1u) {
    u32 current = world.draw_order[i];
    if (draw_order_seen[current]) {
      continue;
    }
    world.draw_order_scratch[output] = current;
    output += 1u;
    if (current == top_member) {
      for (u32 j = 0u; j < world.draw_order_count; j += 1u) {
        u32 member = world.draw_order[j];
        if (draw_order_seen[member]) {
          world.draw_order_scratch[output] = member;
          output += 1u;
        }
      }
    }
  }
  for (u32 i = 0u; i < world.draw_order_count; i += 1u) {
    world.draw_order[i] = world.draw_order_scratch[i];
  }
  mark_render_list_dirty();
}

static void request_draw_order_normalize(void) {
  if (draw_order_normalization_deferred) {
    draw_order_normalization_pending = 1u;
    return;
  }
  normalize_draw_order_hierarchy();
}

static void flush_draw_order_normalize(void) {
  if (draw_order_normalization_deferred ||
      !draw_order_normalization_pending) {
    return;
  }
  draw_order_normalization_pending = 0u;
  normalize_draw_order_hierarchy();
}

static void reorder_selection(u32 selected_first) {
  history_record_order_before();
  u32 output = 0u;
  for (u32 pass = 0u; pass < 2u; pass += 1u) {
    u32 want_selected = selected_first ? pass == 0u : pass == 1u;
    for (u32 i = 0u; i < world.draw_order_count; i += 1u) {
      u32 entity = world.draw_order[i];
      // Move the whole selected subtree together so a container keeps its
      // children (entity_is_dragged == selected or under a selected ancestor).
      if (entity_is_dragged(entity) == want_selected) {
        world.draw_order_scratch[output] = entity;
        output += 1u;
      }
    }
  }
  for (u32 i = 0u; i < world.draw_order_count; i += 1u) {
    world.draw_order[i] = world.draw_order_scratch[i];
  }
  request_draw_order_normalize();
  mark_render_list_dirty();
}

// --- Draw extraction: shapes & overlays ------------------------------------
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
  Vec2 position = world.positions[entity];
  Vec2 size = world.sizes[entity];
  float inset = 3.0f / uniforms.style[0];
  float x = position.x - inset;
  float y = position.y - inset;
  float width = size.x + inset * 2.0f;
  float height = size.y + inset * 2.0f;
  float line = 2.0f / uniforms.style[0];

  if (!dyn_rect_reserve()) {
    return;
  }

  RectDraw *draw = &dyn_rects[dyn_rect_count];
  draw->rect[0] = x;
  draw->rect[1] = y;
  draw->rect[2] = width;
  draw->rect[3] = height;
  draw->fill_color[0] = 0.0f;
  draw->fill_color[1] = 0.0f;
  draw->fill_color[2] = 0.0f;
  draw->fill_color[3] = 0.0f;
  draw->stroke_color[0] = 0.12f;
  draw->stroke_color[1] = 0.48f;
  draw->stroke_color[2] = 1.0f;
  draw->stroke_color[3] = 1.0f;
  draw->stroke_width_pad[0] = line;
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

static void push_container_hover_draw(u32 entity, u32 order) {
  if (entity == BLITZ_INVALID_INDEX || !dyn_rect_reserve()) {
    return;
  }

  Vec2 position = world.positions[entity];
  Vec2 size = world.sizes[entity];
  float inset = 5.0f / uniforms.style[0];
  RectDraw *draw = &dyn_rects[dyn_rect_count];
  draw->rect[0] = position.x - inset;
  draw->rect[1] = position.y - inset;
  draw->rect[2] = size.x + inset * 2.0f;
  draw->rect[3] = size.y + inset * 2.0f;
  draw->fill_color[0] = 0.11f;
  draw->fill_color[1] = 0.72f;
  draw->fill_color[2] = 0.61f;
  draw->fill_color[3] = 0.08f;
  draw->stroke_color[0] = 0.11f;
  draw->stroke_color[1] = 0.72f;
  draw->stroke_color[2] = 0.61f;
  draw->stroke_color[3] = 0.95f;
  draw->stroke_width_pad[0] = 2.0f / uniforms.style[0];
  draw->stroke_width_pad[1] = 0.0f;
  draw->stroke_width_pad[2] = 0.0f;
  draw->stroke_width_pad[3] = 0.0f;

  dyn_commands[dyn_command_count].shape_kind = BLITZ_SHAPE_RECT;
  dyn_commands[dyn_command_count].shape_index = dyn_rect_count;
  dyn_commands[dyn_command_count].entity = entity;
  dyn_commands[dyn_command_count]._pad0 = order;
  dyn_rect_count += 1u;
  dyn_command_count += 1u;
}

static void push_resize_handle_draw(float center_x, float center_y, u32 order) {
  if (!dyn_rect_reserve()) {
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
  if (!marquee_active || !dyn_rect_reserve()) {
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

static void push_oval_draw(u32 entity, u32 order) {
  if (shape_command_count >= BLITZ_MAX_RECT_DRAWS ||
      oval_draw_count >= BLITZ_MAX_RECT_DRAWS) {
    return;
  }

  Vec2 position = world.positions[entity];
  Vec2 size = world.sizes[entity];
  OvalView view = world.oval_views[entity];
  OvalDraw *draw = &oval_draws[oval_draw_count];

  draw->oval[0] = position.x + size.x * 0.5f;
  draw->oval[1] = position.y + size.y * 0.5f;
  draw->oval[2] = size.x * 0.5f;
  draw->oval[3] = size.y * 0.5f;

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

  shape_commands[shape_command_count].shape_kind = (u32)BLITZ_SHAPE_OVAL;
  shape_commands[shape_command_count].shape_index = oval_draw_count;
  shape_commands[shape_command_count].entity = entity;
  shape_commands[shape_command_count]._pad0 = order;
  oval_draw_count += 1u;
  shape_command_count += 1u;
}

// Emit capsule segments connecting every stride-th point (always reaching the
// last point) — one LOD tier of the stroke.
static void emit_path_tier(PathSegment *out, u32 *out_count, PathView view,
                           Vec2 position, u32 draw_index, u32 stride) {
  u32 prev = 0u;
  while (prev + 1u < view.point_count) {
    u32 next = prev + stride;
    if (next >= view.point_count) {
      next = view.point_count - 1u;
    }
    Vec2 a = path_point_world(view, position, prev);
    Vec2 b = path_point_world(view, position, next);
    PathSegment *seg = &out[*out_count];
    seg->ax = a.x;
    seg->ay = a.y;
    seg->bx = b.x;
    seg->by = b.y;
    seg->draw_index = draw_index;
    *out_count += 1u;
    prev = next;
  }
}

static void push_path_view_draws(PathView view, Vec2 position, u32 entity,
                                 u32 order) {
  if (!view.points || view.point_count < 2u) {
    return;
  }
  if (path_draw_count >= BLITZ_MAX_RECT_DRAWS) {
    return;
  }
  PathDraw *draw = &path_draws[path_draw_count];
  if (entity == BLITZ_INVALID_INDEX) {
    Vec2 min = path_bounds_min(view.points, view.point_count);
    Vec2 max = path_bounds_max(view.points, view.point_count);
    float pad = view.stroke_width * 0.5f;
    draw->bounds[0] = min.x - pad;
    draw->bounds[1] = min.y - pad;
    draw->bounds[2] = max.x - min.x + pad * 2.0f;
    draw->bounds[3] = max.y - min.y + pad * 2.0f;
  } else {
    draw->bounds[0] = position.x;
    draw->bounds[1] = position.y;
    draw->bounds[2] = world.sizes[entity].x;
    draw->bounds[3] = world.sizes[entity].y;
  }
  draw->fill_color[0] = view.fill_color.r;
  draw->fill_color[1] = view.fill_color.g;
  draw->fill_color[2] = view.fill_color.b;
  draw->fill_color[3] = view.fill_color.a;
  draw->render[0] = (float)(order & 0x7fffffffu);
  draw->render[1] = (order & BLITZ_DRAG_FLAG) ? 1.0f : 0.0f;
  draw->render[2] = view.stroke_width;
  draw->render[3] = (float)view.point_count;

  // draw_params: [tier0 offset, tier0 count, tier1 offset, tier1 count]. The
  // cull picks a tier per stroke by its on-screen size.
  u32 this_draw = path_draw_count;
  path_draw_count += 1u;
  if (view.fill_color.a <= 0.001f) {
    draw->draw_params[0] = 0.0f;
    draw->draw_params[1] = 0.0f;
    draw->draw_params[2] = 0.0f;
    draw->draw_params[3] = 0.0f;
    return;
  }
  u32 tier0_offset = path_segment_count;
  emit_path_tier(path_segments, &path_segment_count, view, position, this_draw, 1u);
  u32 tier1_offset = path_segment_count;
  emit_path_tier(path_segments, &path_segment_count, view, position, this_draw,
                 BLITZ_PATH_LOD_STRIDE);
  draw->draw_params[0] = (float)tier0_offset;
  draw->draw_params[1] = (float)(tier1_offset - tier0_offset);
  draw->draw_params[2] = (float)tier1_offset;
  draw->draw_params[3] = (float)(path_segment_count - tier1_offset);
}

static void push_path_draws(u32 entity, u32 order) {
  push_path_view_draws(world.path_views[entity], world.positions[entity],
                       entity, order);
}

// Tessellate just the in-progress pen stroke into its own buffer (full detail,
// drawn on top). Bumps a version the renderer polls — never touches the static
// stream, so editing the draft over a huge scene stays cheap.
static void rebuild_path_draft(void) {
  path_draft_segment_count = 0u;
  path_draft_version += 1u;
  PathView view = path_draft_view;
  if (!path_draft_active || !view.points || view.point_count < 2u ||
      view.fill_color.a <= 0.001f) {
    return;
  }
  path_draft_draw.fill_color[0] = view.fill_color.r;
  path_draft_draw.fill_color[1] = view.fill_color.g;
  path_draft_draw.fill_color[2] = view.fill_color.b;
  path_draft_draw.fill_color[3] = view.fill_color.a;
  path_draft_draw.render[0] = (float)world.draw_order_count; // draw on top
  path_draft_draw.render[1] = 0.0f;
  path_draft_draw.render[2] = view.stroke_width;
  path_draft_draw.render[3] = 0.0f;
  u32 need = view.point_count - 1u;
  path_draft_segments = draw_reserve(path_draft_segments,
                                     &path_draft_segments_cap, need,
                                     sizeof(PathSegment));
  if (!path_draft_segments) {
    path_draft_segments_cap = 0u;
    return;
  }
  emit_path_tier(path_draft_segments, &path_draft_segment_count, view,
                 (Vec2){0.0f, 0.0f}, 0u, 1u);
}

// --- Fonts & text layout ---------------------------------------------------
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

static const char *skip_wrap_spaces(const char *cursor) {
  while (*cursor == ' ' || *cursor == '\t') {
    cursor += 1;
  }
  return cursor;
}

static const char *font_text_line(const char *start, float font_size,
                                  float max_width, const char **next,
                                  float *line_width) {
  const char *cursor = start;
  const char *last_break = 0;
  const char *last_break_next = 0;
  float width = 0.0f;
  float width_before_break = 0.0f;
  while (*cursor != '\0') {
    const char *glyph_start = cursor;
    u32 codepoint = utf8_next(&cursor);
    if (codepoint == (u32)'\n') {
      *next = cursor;
      *line_width = width;
      return glyph_start;
    }
    const FontGlyphMetric *glyph = font_glyph_metric(codepoint);
    float advance = glyph->advance * font_size;
    if (max_width > 0.0f && width + advance > max_width &&
        glyph_start != start) {
      if (last_break) {
        *next = skip_wrap_spaces(last_break_next);
        *line_width = width_before_break;
        return last_break;
      }
      *next = glyph_start;
      *line_width = width;
      return glyph_start;
    }
    if (codepoint == (u32)' ' || codepoint == (u32)'\t') {
      last_break = glyph_start;
      last_break_next = cursor;
      width_before_break = width;
    }
    width += advance;
  }
  *next = cursor;
  *line_width = width;
  return cursor;
}

static void layout_text(const char *text, float font_size, float max_width,
                        float line_height, u32 max_lines) {
  text_layout_line_count = 0u;
  text_layout_width = 0.0f;
  text_layout_height = 0.0f;
  text_layout_overflow = 0u;
  if (line_height <= 0.0f) {
    line_height = BLITZ_FONT_LINE_HEIGHT;
  }
  if (max_lines == 0u || max_lines > BLITZ_MAX_TEXT_LAYOUT_LINES) {
    max_lines = BLITZ_MAX_TEXT_LAYOUT_LINES;
  }
  const char *cursor = text;
  u32 pending = 1u;
  while (pending) {
    if (text_layout_line_count >= max_lines) {
      text_layout_overflow = *cursor != '\0';
      break;
    }
    const char *next;
    float width;
    const char *end = font_text_line(cursor, font_size, max_width, &next, &width);
    TextLayoutLine *line = &text_layout_lines[text_layout_line_count];
    line->start = (u32)(cursor - text);
    line->length = (u32)(end - cursor);
    line->width = width;
    text_layout_line_count += 1u;
    if (width > text_layout_width) {
      text_layout_width = width;
    }
    if (next == cursor && *cursor != '\0') {
      utf8_next(&next);
    }
    const char *previous = cursor;
    cursor = next;
    pending = *cursor != '\0' ||
              (cursor != previous && cursor > text && cursor[-1] == '\n');
  }
  text_layout_overflow |= *cursor != '\0';
  text_layout_height =
      (float)text_layout_line_count * line_height * font_size;
}

EXPORT("blitz_measure_text_width")
float blitz_measure_text_width(u32 text_length, float font_size) {
  if (font_size <= 0.0f || text_length >= BLITZ_TEXT_INPUT_BYTES) {
    return -1.0f;
  }
  text_input[text_length] = '\0';
  return font_text_width(text_input, font_size);
}

EXPORT("blitz_layout_text")
u32 blitz_layout_text(u32 text_length, float font_size, float max_width,
                      float line_height, u32 max_lines) {
  if (font_size <= 0.0f || text_length >= BLITZ_TEXT_INPUT_BYTES) {
    return 0u;
  }
  text_input[text_length] = '\0';
  layout_text(text_input, font_size, max_width, line_height, max_lines);
  return text_layout_line_count;
}

EXPORT("blitz_text_layout_ptr")
u32 blitz_text_layout_ptr(void) {
  return (u32)&text_layout_lines[0];
}

EXPORT("blitz_text_layout_line_bytes")
u32 blitz_text_layout_line_bytes(void) {
  return sizeof(TextLayoutLine);
}

EXPORT("blitz_text_layout_width")
float blitz_text_layout_width(void) {
  return text_layout_width;
}

EXPORT("blitz_text_layout_height")
float blitz_text_layout_height(void) {
  return text_layout_height;
}

EXPORT("blitz_text_layout_overflow")
u32 blitz_text_layout_overflow(void) {
  return text_layout_overflow;
}

EXPORT("blitz_font_ascender")
float blitz_font_ascender(void) {
  return BLITZ_FONT_ASCENDER;
}

EXPORT("blitz_font_descender")
float blitz_font_descender(void) {
  return BLITZ_FONT_DESCENDER;
}

EXPORT("blitz_font_line_height")
float blitz_font_line_height(void) {
  return BLITZ_FONT_LINE_HEIGHT;
}

EXPORT("blitz_font_cap_height")
float blitz_font_cap_height(void) {
  return BLITZ_FONT_CAP_HEIGHT;
}

EXPORT("blitz_font_x_height")
float blitz_font_x_height(void) {
  return BLITZ_FONT_X_HEIGHT;
}

EXPORT("blitz_font_glyph_count")
u32 blitz_font_glyph_count(void) {
  return BLITZ_FONT_GLYPH_COUNT;
}

EXPORT("blitz_font_glyph_codepoint")
u32 blitz_font_glyph_codepoint(u32 index) {
  if (index >= BLITZ_FONT_GLYPH_COUNT) {
    return BLITZ_FONT_REPLACEMENT_CODEPOINT;
  }
  return blitz_font_glyphs[index].codepoint;
}

// --- Draw extraction: text -------------------------------------------------
static void push_text_draws(u32 entity, u32 order) {
  if (entity == hidden_text_entity) {
    return;
  }
  TextView view = world.text_views[entity];
  Vec2 position = world.positions[entity];
  layout_text(view.text, view.font_size, view.max_width, view.line_height,
              view.max_lines);
  float layout_width =
      view.max_width > 0.0f ? view.max_width : text_layout_width;
  for (u32 line_index = 0u; line_index < text_layout_line_count; line_index += 1u) {
    TextLayoutLine line = text_layout_lines[line_index];
    const char *text = view.text + line.start;
    const char *end = text + line.length;
    float alignment_offset = 0.0f;
    if (view.align == 1u) {
      alignment_offset = (layout_width - line.width) * 0.5f;
    } else if (view.align == 2u) {
      alignment_offset = layout_width - line.width;
    }
    float pen_x = position.x + view.origin_x + alignment_offset;
    float baseline_y =
        position.y + view.baseline_offset +
        (float)line_index * view.line_height * view.font_size;
    while (text < end) {
      u32 codepoint = utf8_next(&text);
      const FontGlyphMetric *glyph = font_glyph_metric(codepoint);
      if (codepoint != (u32)' ' && dyn_text_reserve()) {
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
}

static void push_text_run_draws(u32 entity, const char *text, Color color,
                                float font_size, float pen_x,
                                float baseline_y, u32 order) {
  const char *cursor = text;
  while (*cursor != '\0') {
    u32 codepoint = utf8_next(&cursor);
    const FontGlyphMetric *glyph = font_glyph_metric(codepoint);
    if (codepoint != (u32)' ' && dyn_text_reserve()) {
      TextDraw *draw = &text_draws[text_draw_count];
      draw->rect[0] = pen_x + glyph->plane_left * font_size;
      draw->rect[1] = baseline_y + glyph->plane_top * font_size;
      draw->rect[2] = glyph->plane_width * font_size;
      draw->rect[3] = glyph->plane_height * font_size;
      draw->uv_rect[0] = glyph->uv_left;
      draw->uv_rect[1] = glyph->uv_top;
      draw->uv_rect[2] = glyph->uv_right;
      draw->uv_rect[3] = glyph->uv_bottom;
      draw->color[0] = color.r;
      draw->color[1] = color.g;
      draw->color[2] = color.b;
      draw->color[3] = color.a;
      dyn_commands[dyn_command_count].shape_kind = BLITZ_SHAPE_TEXT;
      dyn_commands[dyn_command_count].shape_index = text_draw_count;
      dyn_commands[dyn_command_count].entity = entity;
      dyn_commands[dyn_command_count]._pad0 = order;
      text_draw_count += 1u;
      dyn_command_count += 1u;
    }
    pen_x += glyph->advance * font_size;
  }
}

static void push_frame_title_draws(u32 entity, u32 order) {
  FrameView view = world.frame_views[entity];
  if (!view.title || view.title[0] == '\0') {
    return;
  }
  Vec2 position = world.positions[entity];
  float baseline_y = position.y - 8.0f;
  push_text_run_draws(entity, view.title, view.title_color,
                      view.title_font_size, position.x, baseline_y, order);
}

static u32 count_text_glyphs(u32 entity) {
  if (entity == hidden_text_entity) {
    return 0u;
  }
  TextView view = world.text_views[entity];
  layout_text(view.text, view.font_size, view.max_width, view.line_height,
              view.max_lines);
  u32 count = 0u;
  for (u32 line_index = 0u; line_index < text_layout_line_count; line_index += 1u) {
    TextLayoutLine line = text_layout_lines[line_index];
    const char *cursor = view.text + line.start;
    const char *end = cursor + line.length;
    while (cursor < end) {
      u32 codepoint = utf8_next(&cursor);
      if (codepoint != (u32)' ') {
        count += 1u;
      }
    }
  }
  return count;
}

static u32 count_text_run_glyphs(const char *text) {
  if (!text || text[0] == '\0') {
    return 0u;
  }
  const char *cursor = text;
  u32 count = 0u;
  while (*cursor != '\0') {
    u32 codepoint = utf8_next(&cursor);
    if (codepoint != (u32)' ') {
      count += 1u;
    }
  }
  return count;
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

// Full unculled shape stream (rects/triangles/ovals), rebuilt only on
// structural change. The GPU compute pass culls it against the viewport.
// --- Scene extraction (static & dynamic streams) ---------------------------
static void extract_static_shapes(void) {
  if (!static_dirty) {
    return;
  }

  shape_command_count = 0u;
  rect_draw_count = 0u;
  triangle_draw_count = 0u;
  oval_draw_count = 0u;
  path_draw_count = 0u;
  path_segment_count = 0u;
  u32 draw_need = world.draw_order_count;
  u32 path_draw_need = 0u;
  u32 path_segment_need = 0u;
  for (u32 i = 0u; i < world.draw_order_count; i += 1u) {
    u32 entity = world.draw_order[i];
    if ((world.masks[entity] & BLITZ_COMPONENT_PATH_VIEW) &&
        world.path_views[entity].point_count > 1u) {
      path_draw_need += 1u;
      path_segment_need += path_segment_count_for(world.path_views[entity]);
    }
  }
  // The pen draft lives in its own buffer (rebuild_path_draft), not the static
  // stream, so it isn't reserved or extracted here.
  u32 command_need = draw_need;
  shape_commands = draw_reserve(shape_commands, &shape_commands_cap, command_need,
                                sizeof(ShapeCommand));
  rect_draws =
      draw_reserve(rect_draws, &rect_draws_cap, draw_need, sizeof(RectDraw));
  triangle_draws = draw_reserve(triangle_draws, &triangle_draws_cap, draw_need,
                                sizeof(TriangleDraw));
  oval_draws =
      draw_reserve(oval_draws, &oval_draws_cap, draw_need, sizeof(OvalDraw));
  path_draws =
      draw_reserve(path_draws, &path_draws_cap, path_draw_need, sizeof(PathDraw));
  path_segments = draw_reserve(path_segments, &path_segments_cap,
                               path_segment_need, sizeof(PathSegment));
  if ((command_need && !shape_commands) ||
      (draw_need && (!rect_draws || !triangle_draws || !oval_draws)) ||
      (path_draw_need && !path_draws) ||
      (path_segment_need && !path_segments)) {
    static_dirty = 0u;
    return;
  }
  u32 base_required = BLITZ_COMPONENT_POSITION | BLITZ_COMPONENT_SIZE;

  for (u32 order_index = 0u; order_index < world.draw_order_count;
       order_index += 1u) {
    u32 entity = world.draw_order[order_index];
    if ((world.masks[entity] & base_required) != base_required) {
      continue;
    }
    u32 order = order_index;
    if (drag_active && entity_is_dragged(entity)) {
      order |= BLITZ_DRAG_FLAG;
    }
    if (world.masks[entity] & BLITZ_COMPONENT_RECT_VIEW) {
      push_rect_draw(entity, order);
    } else if (world.masks[entity] & BLITZ_COMPONENT_OVAL_VIEW) {
      push_oval_draw(entity, order);
    } else if (world.masks[entity] & BLITZ_COMPONENT_TRIANGLE_VIEW) {
      push_triangle_draw(entity, order);
    } else if (world.masks[entity] & BLITZ_COMPONENT_PATH_VIEW) {
      push_path_draws(entity, order);
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
  visible_text_shape_count = 0u;
  dyn_overlay_command_start = 0u;

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
      if (world.masks[entity] & BLITZ_COMPONENT_FRAME_VIEW) {
        u32 order = order_index;
        if (drag_active && entity_is_dragged(entity)) {
          order |= BLITZ_DRAG_FLAG;
        }
        push_frame_title_draws(entity, order);
      }
      continue;
    }
    if (entity == hidden_text_entity) {
      continue;
    }
    float cull_min_x = view_min_x;
    float cull_min_y = view_min_y;
    float cull_max_x = view_max_x;
    float cull_max_y = view_max_y;
    u32 dragged = drag_active && entity_is_dragged(entity);
    if (dragged) {
      cull_min_x -= drag_offset.x;
      cull_min_y -= drag_offset.y;
      cull_max_x -= drag_offset.x;
      cull_max_y -= drag_offset.y;
    }
    if (text_visible_in_view(entity, scale, cull_min_x, cull_min_y, cull_max_x,
                             cull_max_y)) {
      visible_text_shape_count += 1u;
      u32 order = order_index;
      if (dragged) {
        order |= BLITZ_DRAG_FLAG;
      }
      push_text_draws(entity, order);
    }
  }

  dyn_overlay_command_start = dyn_command_count;

  u32 overlay_order = world.draw_order_count + 1u;
  if (drag_active && drag_hover_container != BLITZ_INVALID_INDEX) {
    push_container_hover_draw(drag_hover_container, overlay_order);
  }
  overlay_order += 1u;
  if (drag_active) {
    overlay_order |= BLITZ_DRAG_FLAG;
  }
  for (u32 i = 0u; i < world.draw_order_count; i += 1u) {
    u32 entity = world.draw_order[i];
    if (!world.selected[entity]) {
      continue;
    }
    if (entity == hidden_text_entity) {
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
    float screen_w = size.x * scale;
    float screen_h = size.y * scale;
    if (screen_w < 1.0f && screen_h < 1.0f) {
      continue;
    }
    push_selection_draw(entity, overlay_order);
    u32 resize_axes = entity_resize_axes(entity);
    if (selected_count == 1u && resize_axes != 0u &&
        screen_w >= 24.0f && screen_h >= 24.0f) {
      float left = position.x;
      float top = position.y;
      float right = position.x + size.x;
      float bottom = position.y + size.y;
      float centers[16] = {
          left,          top,
          right,         top,
          right,         bottom,
          left,          bottom,
          (left + right) * 0.5f, top,
          right,         (top + bottom) * 0.5f,
          (left + right) * 0.5f, bottom,
          left,          (top + bottom) * 0.5f,
      };
      for (u32 handle = 0u; handle < 8u; handle += 1u) {
        if (resize_handle_allowed(handle, resize_axes)) {
          push_resize_handle_draw(centers[handle * 2u],
                                  centers[handle * 2u + 1u],
                                  overlay_order + 1u);
        }
      }
    }
  }
  push_marquee_draw(world.draw_order_count + 3u);
  uniforms.style[3] = (float)world.draw_order_count;
  dyn_version += 1u;
  dynamic_dirty = 0u;
}

// --- Coordinates, hit-testing & resize -------------------------------------
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

static int point_in_oval(float world_x, float world_y, u32 entity) {
  Vec2 position = world.positions[entity];
  Vec2 size = world.sizes[entity];
  float radius_x = size.x * 0.5f;
  float radius_y = size.y * 0.5f;
  if (radius_x <= 0.0f || radius_y <= 0.0f) {
    return 0;
  }
  float center_x = position.x + size.x * 0.5f;
  float center_y = position.y + size.y * 0.5f;
  float dx = (world_x - center_x) / radius_x;
  float dy = (world_y - center_y) / radius_y;
  return dx * dx + dy * dy <= 1.0f;
}

static float distance_to_segment_sq(float px, float py, Vec2 a, Vec2 b) {
  float vx = b.x - a.x;
  float vy = b.y - a.y;
  float wx = px - a.x;
  float wy = py - a.y;
  float len_sq = vx * vx + vy * vy;
  float t = len_sq > 0.001f ? (wx * vx + wy * vy) / len_sq : 0.0f;
  t = clampf(t, 0.0f, 1.0f);
  float dx = px - (a.x + vx * t);
  float dy = py - (a.y + vy * t);
  return dx * dx + dy * dy;
}

static int point_in_path(float world_x, float world_y, u32 entity) {
  PathView view = world.path_views[entity];
  if (!view.points || view.point_count < 2u) {
    return 0;
  }
  float hit_radius = view.stroke_width * 0.5f + 5.0f / uniforms.style[0];
  float hit_radius_sq = hit_radius * hit_radius;
  Vec2 position = world.positions[entity];
  for (u32 i = 1u; i < view.point_count; i += 1u) {
    Vec2 a = {position.x + view.points[i - 1u].x,
              position.y + view.points[i - 1u].y};
    Vec2 b = {position.x + view.points[i].x, position.y + view.points[i].y};
    if (distance_to_segment_sq(world_x, world_y, a, b) <= hit_radius_sq) {
      return 1;
    }
  }
  return 0;
}

static void resize_text_entity_to_width(u32 entity, float width) {
  TextView *view = &world.text_views[entity];
  float padding = view->origin_x;
  float content_width = width - padding * 2.0f;
  if (content_width < 1.0f) {
    content_width = 1.0f;
  }
  layout_text(view->text, view->font_size, content_width, view->line_height,
              view->max_lines);
  view->max_width = content_width;
  world.sizes[entity].x = content_width + padding * 2.0f;
  world.sizes[entity].y = text_layout_height + padding * 2.0f;
}

static u32 selected_resizable_entity(void) {
  if (selected_count != 1u) {
    return BLITZ_INVALID_INDEX;
  }
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (world.selected[entity] && entity_resize_axes(entity) != 0u) {
      return entity;
    }
  }
  return BLITZ_INVALID_INDEX;
}

static u32 hit_test_resize_handle(float world_x, float world_y, u32 entity) {
  if (entity == BLITZ_INVALID_INDEX) {
    return BLITZ_INVALID_INDEX;
  }
  u32 axes = entity_resize_axes(entity);
  if (axes == 0u) {
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
    if (!resize_handle_allowed(handle, axes)) {
      continue;
    }
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
  u32 axes = entity_resize_axes(resize_entity);
  if (!resize_handle_allowed(resize_handle, axes)) {
    return;
  }

  float min_size = 12.0f / uniforms.style[0];
  float left = resize_start_position.x;
  float top = resize_start_position.y;
  float right = left + resize_start_size.x;
  float bottom = top + resize_start_size.y;
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

  if ((axes & 1u) &&
      (resize_handle == 0u || resize_handle == 3u || resize_handle == 7u)) {
    next_x = world_x < anchor_x - min_size ? world_x : anchor_x - min_size;
    next_width = anchor_x - next_x;
  } else if ((axes & 1u) &&
             (resize_handle == 1u || resize_handle == 2u ||
              resize_handle == 5u)) {
    next_x = anchor_x;
    next_width = world_x > anchor_x + min_size ? world_x - anchor_x : min_size;
  }
  if ((axes & 2u) &&
      (resize_handle == 0u || resize_handle == 1u || resize_handle == 4u)) {
    next_y = world_y < anchor_y - min_size ? world_y : anchor_y - min_size;
    next_height = anchor_y - next_y;
  } else if ((axes & 2u) &&
             (resize_handle == 2u || resize_handle == 3u ||
              resize_handle == 6u)) {
    next_y = anchor_y;
    next_height = world_y > anchor_y + min_size ? world_y - anchor_y : min_size;
  }

  ecs_move_absolute(resize_entity, next_x, next_y);
  if (world.masks[resize_entity] & BLITZ_COMPONENT_TEXT_VIEW) {
    resize_text_entity_to_width(resize_entity, next_width);
  } else {
    world.sizes[resize_entity].x = next_width;
    world.sizes[resize_entity].y = next_height;
  }
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
    if (world.masks[entity] & BLITZ_COMPONENT_OVAL_VIEW) {
      hit = (u32)point_in_oval(world_x, world_y, entity);
    } else if (world.masks[entity] & BLITZ_COMPONENT_TRIANGLE_VIEW) {
      hit = (u32)point_in_triangle(world_x, world_y, entity);
    } else if (world.masks[entity] & BLITZ_COMPONENT_PATH_VIEW) {
      hit = (u32)point_in_path(world_x, world_y, entity);
    } else {
      hit = (u32)point_in_rect(world_x, world_y, entity);
    }
    if (hit) {
      return entity;
    }
  }
  return BLITZ_INVALID_INDEX;
}

static u32 hit_test_container(float world_x, float world_y,
                              u32 excluded_root) {
  for (u32 i = world.draw_order_count; i > 0u; i -= 1u) {
    u32 entity = world.draw_order[i - 1u];
    if (!(world.masks[entity] & BLITZ_COMPONENT_CONTAINER) ||
        world.selected[entity] || entity == excluded_root ||
        (excluded_root != BLITZ_INVALID_INDEX &&
         transform_is_descendant(excluded_root, entity))) {
      continue;
    }
    u32 hit = 0u;
    if (world.masks[entity] & BLITZ_COMPONENT_OVAL_VIEW) {
      hit = (u32)point_in_oval(world_x, world_y, entity);
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

static u32 hit_test_drop_container(float world_x, float world_y) {
  for (u32 i = world.draw_order_count; i > 0u; i -= 1u) {
    u32 entity = world.draw_order[i - 1u];
    if (!(world.masks[entity] & BLITZ_COMPONENT_CONTAINER) ||
        world.selected[entity] || entity_has_selected_ancestor(entity)) {
      continue;
    }
    u32 hit = 0u;
    if (world.masks[entity] & BLITZ_COMPONENT_OVAL_VIEW) {
      hit = (u32)point_in_oval(world_x, world_y, entity);
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

static u32 drag_hover_container_target(void) {
  return hit_test_drop_container(drag_last_world.x, drag_last_world.y);
}

// True while the drag hovers a container that at least one dragged shape is not
// already inside — i.e. a drop here would re-parent it. Drives the visual
// uplift; hovering empty canvas or the shapes' current container returns 0.
static u32 drag_hover_targets_new_container(void) {
  if (drag_hover_container == BLITZ_INVALID_INDEX) {
    return 0u;
  }
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (!world.selected[entity] || entity_has_selected_ancestor(entity)) {
      continue;
    }
    u32 parent = (world.masks[entity] & BLITZ_COMPONENT_RELATIVE_TRANSFORM)
                     ? world.relative_transforms[entity].parent
                     : BLITZ_INVALID_INDEX;
    if (parent != drag_hover_container) {
      return 1u;
    }
  }
  return 0u;
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
  ecs_set_resizable(entity, 1u, 1u);
  if (history_transaction_active) {
    history_record_created(entity);
  }
  return entity;
}

static u32 create_base_frame(float x, float y, float width, float height,
                             Color fill, Color stroke, float stroke_width,
                             const char *title, Color title_color,
                             float title_font_size) {
  u32 entity =
      create_base_rect(x, y, width, height, fill, stroke, stroke_width);
  if (entity == BLITZ_INVALID_INDEX) {
    return entity;
  }
  ecs_set_frame_view(entity, title, title_color, title_font_size);
  set_container_component(entity, 1u);
  return entity;
}

static u32 create_base_oval(float x, float y, float width, float height,
                              Color fill, Color stroke, float stroke_width) {
  u32 entity = ecs_create_entity();
  if (entity == BLITZ_INVALID_INDEX) {
    return entity;
  }
  ecs_set_position(entity, x, y);
  ecs_set_size(entity, width, height);
  ecs_set_oval_view(entity, fill, stroke, stroke_width);
  world.masks[entity] |= BLITZ_COMPONENT_SELECTABLE;
  ecs_set_resizable(entity, 1u, 1u);
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
  ecs_set_resizable(entity, 1u, 1u);
  if (history_transaction_active) {
    history_record_created(entity);
  }
  return entity;
}

static u32 create_base_path(Vec2 *points, u32 point_count, Color fill,
                            float stroke_width) {
  if (!points || point_count < 2u || stroke_width <= 0.0f) {
    return BLITZ_INVALID_INDEX;
  }
  u32 entity = ecs_create_entity();
  if (entity == BLITZ_INVALID_INDEX) {
    return entity;
  }
  Vec2 min = path_bounds_min(points, point_count);
  Vec2 max = path_bounds_max(points, point_count);
  float pad = stroke_width * 0.5f;
  Vec2 position = {min.x - pad, min.y - pad};
  for (u32 i = 0u; i < point_count; i += 1u) {
    points[i].x -= position.x;
    points[i].y -= position.y;
  }
  ecs_set_position(entity, position.x, position.y);
  ecs_set_size(entity, max.x - min.x + pad * 2.0f,
               max.y - min.y + pad * 2.0f);
  ecs_set_path_view(entity, points, point_count, fill, stroke_width);
  world.masks[entity] |= BLITZ_COMPONENT_SELECTABLE;
  if (history_transaction_active) {
    history_record_created(entity);
  }
  return entity;
}

static u32 create_base_text(const char *text, float x, float top,
                            float font_size, Color color, float max_width,
                            float line_height, u32 max_lines, u32 align) {
  float padding = 4.0f;
  if (!(max_width > 0.0f)) {
    max_width = 0.0f;
  }
  if (!(line_height > 0.0f)) {
    line_height = BLITZ_FONT_LINE_HEIGHT;
  }
  if (align > 2u) {
    align = 0u;
  }
  layout_text(text, font_size, max_width, line_height, max_lines);
  float width = max_width > 0.0f ? max_width : text_layout_width;
  float height = text_layout_height;
  u32 entity = ecs_create_entity();
  if (entity == BLITZ_INVALID_INDEX) {
    return entity;
  }
  ecs_set_position(entity, x - padding, top - padding);
  ecs_set_size(entity, width + padding * 2.0f, height + padding * 2.0f);
  ecs_set_text_view(entity, text, color, font_size, padding,
                    padding + BLITZ_FONT_ASCENDER * font_size, max_width,
                    line_height, max_lines, align);
  world.masks[entity] |= BLITZ_COMPONENT_SELECTABLE;
  ecs_set_resizable(entity, 1u, 0u);
  if (history_transaction_active) {
    history_record_created(entity);
  }
  return entity;
}

// Template coordinates are translated before calling the same base-shape
// constructors used by user and MCP-created content.
static float slide_origin_x = 0.0f;
static float slide_origin_y = 0.0f;
static u32 slide_container_entity = BLITZ_INVALID_INDEX;

// --- Slide containers ------------------------------------------------------
static void attach_slide_child(u32 entity) {
  if (entity == BLITZ_INVALID_INDEX ||
      slide_container_entity == BLITZ_INVALID_INDEX ||
      entity == slide_container_entity) {
    return;
  }
  u32 target = container_target_for_entity(entity, 0u, 1u);
  if (target == BLITZ_INVALID_INDEX) {
    target = slide_container_entity;
  }
  attach_entity_to_container_target(entity, target);
}

static u32 create_slide_rect(float x, float y, float width, float height,
                             Color fill, Color stroke, float stroke_width) {
  u32 entity = create_base_rect(slide_origin_x + x, slide_origin_y + y, width,
                                height, fill, stroke, stroke_width);
  attach_slide_child(entity);
  set_container_component(entity, 1u);
  return entity;
}

static u32 create_slide_frame(float x, float y, float width, float height,
                              Color fill, Color stroke, float stroke_width) {
  u32 entity =
      create_base_frame(slide_origin_x + x, slide_origin_y + y, width, height,
                        fill, stroke, stroke_width, "",
                        (Color){0.08f, 0.10f, 0.13f, 1.0f}, 18.0f);
  return entity;
}

static u32 create_slide_text(const char *text, float x, float baseline_y,
                             float font_size, Color color) {
  float top = baseline_y - BLITZ_FONT_ASCENDER * font_size;
  u32 entity = create_base_text(text, slide_origin_x + x, slide_origin_y + top,
                                font_size, color, 0.0f,
                                BLITZ_FONT_LINE_HEIGHT, 0u, 0u);
  attach_slide_child(entity);
  return entity;
}

static u32 create_user_rect(float x, float y) {
  return create_base_rect(x - 90.0f, y - 55.0f, 180.0f, 110.0f,
                          (Color){0.86f, 0.92f, 1.0f, 1.0f},
                          (Color){0.20f, 0.43f, 0.85f, 1.0f}, 2.0f);
}

static u32 create_user_frame(float x, float y) {
  return create_base_frame(x - 140.0f, y - 90.0f, 280.0f, 180.0f,
                           (Color){1.0f, 1.0f, 1.0f, 1.0f},
                           (Color){0.20f, 0.24f, 0.30f, 1.0f}, 1.5f, "",
                           (Color){0.08f, 0.10f, 0.13f, 1.0f}, 18.0f);
}

static u32 create_user_circle(float x, float y) {
  return create_base_oval(x - 65.0f, y - 65.0f, 130.0f, 130.0f,
                            (Color){0.86f, 0.97f, 0.93f, 1.0f},
                            (Color){0.08f, 0.58f, 0.46f, 1.0f}, 2.0f);
}

static u32 create_user_oval(float x, float y) {
  return create_base_oval(x - 90.0f, y - 55.0f, 180.0f, 110.0f,
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
                          (Color){0.08f, 0.10f, 0.13f, 1.0f}, 0.0f,
                          BLITZ_FONT_LINE_HEIGHT, 0u, 0u);
}

static u32 clone_entity_for_duplicate(u32 source, float offset_x,
                                      float offset_y) {
  Vec2 position = world.positions[source];
  Vec2 size = world.sizes[source];
  u32 mask = world.masks[source];
  u32 clone = BLITZ_INVALID_INDEX;
  if (mask & BLITZ_COMPONENT_FRAME_VIEW) {
    RectView rect = world.rect_views[source];
    FrameView frame = world.frame_views[source];
    clone = create_base_frame(position.x + offset_x, position.y + offset_y,
                              size.x, size.y, rect.fill_color,
                              rect.stroke_color, rect.stroke_width,
                              frame.title, frame.title_color,
                              frame.title_font_size);
  } else if (mask & BLITZ_COMPONENT_RECT_VIEW) {
    RectView view = world.rect_views[source];
    clone = create_base_rect(position.x + offset_x, position.y + offset_y,
                             size.x, size.y, view.fill_color,
                             view.stroke_color, view.stroke_width);
  } else if (mask & BLITZ_COMPONENT_OVAL_VIEW) {
    OvalView view = world.oval_views[source];
    clone = create_base_oval(position.x + offset_x, position.y + offset_y,
                             size.x, size.y, view.fill_color,
                             view.stroke_color, view.stroke_width);
  } else if (mask & BLITZ_COMPONENT_TRIANGLE_VIEW) {
    TriangleView view = world.triangle_views[source];
    clone = create_base_triangle(position.x + offset_x, position.y + offset_y,
                                 size.x, size.y, view.fill_color,
                                 view.stroke_color, view.stroke_width);
  } else if (mask & BLITZ_COMPONENT_TEXT_VIEW) {
    TextView view = world.text_views[source];
    clone = create_base_text(view.text, position.x + view.origin_x + offset_x,
                             position.y + view.origin_x + offset_y,
                             view.font_size, view.color, view.max_width,
                             view.line_height, view.max_lines, view.align);
  } else if (mask & BLITZ_COMPONENT_PATH_VIEW) {
    PathView view = world.path_views[source];
    Vec2 *points =
        (Vec2 *)blitz_alloc((usize)view.point_count * sizeof(Vec2));
    if (points) {
      for (u32 i = 0u; i < view.point_count; i += 1u) {
        points[i].x = position.x + view.points[i].x + offset_x;
        points[i].y = position.y + view.points[i].y + offset_y;
      }
      clone = create_base_path(points, view.point_count, view.fill_color,
                               view.stroke_width);
      if (clone == BLITZ_INVALID_INDEX) {
        blitz_free(points);
      }
    }
  }
  if (clone != BLITZ_INVALID_INDEX &&
      (mask & BLITZ_COMPONENT_CONTAINER)) {
    set_container_component(clone, 1u);
  } else if (clone != BLITZ_INVALID_INDEX) {
    set_container_component(clone, 0u);
  }
  return clone;
}

static const char *copy_text_input(u32 text_length) {
  if (text_length >= BLITZ_TEXT_INPUT_BYTES) {
    return 0;
  }
  if (!text_pool_ensure(text_length + 1u)) {
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

// --- Demo scene ------------------------------------------------------------
static void create_demo_world(void) {
  Color transparent = {0.0f, 0.0f, 0.0f, 0.0f};

  slide_container_entity = BLITZ_INVALID_INDEX;
  draw_order_normalization_deferred += 1u;
  u32 slide = create_slide_frame(-560.0f, -315.0f, 1120.0f, 630.0f,
                                 (Color){0.965f, 0.972f, 0.984f, 1.0f},
                                 transparent, 0.0f);
  slide_container_entity = slide;
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

  create_slide_rect(-200.0f, -2.0f, 330.0f, 88.0f,
                    (Color){1.0f, 1.0f, 1.0f, 1.0f},
                    (Color){0.86f, 0.88f, 0.91f, 1.0f}, 1.0f);
  create_slide_rect(160.0f, -2.0f, 330.0f, 88.0f,
                    (Color){1.0f, 1.0f, 1.0f, 1.0f},
                    (Color){0.86f, 0.88f, 0.91f, 1.0f}, 1.0f);

  create_slide_rect(-200.0f, 124.0f, 690.0f, 176.0f,
                    (Color){0.925f, 0.94f, 0.96f, 1.0f}, transparent, 0.0f);
  create_slide_rect(-28.0f, 187.0f, 440.0f, 12.0f,
                    (Color){0.86f, 0.88f, 0.91f, 1.0f}, transparent, 0.0f);
  create_slide_rect(-28.0f, 187.0f, 366.0f, 12.0f,
                    (Color){0.91f, 0.31f, 0.27f, 1.0f}, transparent, 0.0f);
  create_slide_rect(-28.0f, 235.0f, 440.0f, 12.0f,
                    (Color){0.86f, 0.88f, 0.91f, 1.0f}, transparent, 0.0f);
  create_slide_rect(-28.0f, 235.0f, 292.0f, 12.0f,
                    (Color){0.11f, 0.72f, 0.61f, 1.0f}, transparent, 0.0f);
  create_slide_rect(-28.0f, 283.0f, 440.0f, 12.0f,
                    (Color){0.86f, 0.88f, 0.91f, 1.0f}, transparent, 0.0f);
  create_slide_rect(-28.0f, 283.0f, 208.0f, 12.0f,
                    (Color){0.27f, 0.43f, 0.89f, 1.0f}, transparent, 0.0f);

  create_slide_text("BLITZ", -500.0f, -226.0f, 50.0f,
                    (Color){1.0f, 1.0f, 1.0f, 1.0f});
  create_slide_text("GPU-NATIVE CANVAS", -500.0f, -170.0f, 15.0f,
                    (Color){0.55f, 0.90f, 0.82f, 1.0f});
  create_slide_text("One draw call.", -200.0f, -188.0f, 56.0f,
                    (Color){0.08f, 0.10f, 0.13f, 1.0f});
  create_slide_text("Every visual layer.", -200.0f, -128.0f, 56.0f,
                    (Color){0.08f, 0.10f, 0.13f, 1.0f});
  create_slide_text("Shapes and MSDF text share one ordered command stream.",
                    -198.0f, -72.0f, 19.0f,
                    (Color){0.32f, 0.36f, 0.42f, 1.0f});

  create_slide_text("RENDER MODEL", -500.0f, -50.0f, 13.0f,
                    (Color){0.55f, 0.90f, 0.82f, 1.0f});
  create_slide_text("Rects", -500.0f, -2.0f, 20.0f,
                    (Color){0.95f, 0.97f, 1.0f, 1.0f});
  create_slide_text("Text", -500.0f, 51.0f, 20.0f,
                    (Color){0.95f, 0.97f, 1.0f, 1.0f});
  create_slide_text("Z-order", -500.0f, 104.0f, 20.0f,
                    (Color){0.95f, 0.97f, 1.0f, 1.0f});
  create_slide_text("1 pipeline", -500.0f, 232.0f, 16.0f,
                    (Color){0.68f, 0.72f, 0.78f, 1.0f});
  create_slide_text("Ελληνικά · Русский · Việt", -500.0f, 274.0f, 11.0f,
                    (Color){0.55f, 0.90f, 0.82f, 1.0f});

  create_slide_text("01", -174.0f, 30.0f, 15.0f,
                    (Color){0.91f, 0.31f, 0.27f, 1.0f});
  create_slide_text("Unified", -126.0f, 30.0f, 21.0f,
                    (Color){0.08f, 0.10f, 0.13f, 1.0f});
  create_slide_text("Command order preserves every layer.", -174.0f, 62.0f,
                    14.0f, (Color){0.36f, 0.40f, 0.46f, 1.0f});

  create_slide_text("02", 186.0f, 30.0f, 15.0f,
                    (Color){0.08f, 0.55f, 0.48f, 1.0f});
  create_slide_text("Scalable", 234.0f, 30.0f, 21.0f,
                    (Color){0.08f, 0.10f, 0.13f, 1.0f});
  create_slide_text("Storage buffers keep CPU work flat.", 186.0f, 62.0f,
                    14.0f, (Color){0.36f, 0.40f, 0.46f, 1.0f});

  create_slide_text("FRAME COMPOSITION", -174.0f, 146.0f, 13.0f,
                    (Color){0.36f, 0.40f, 0.46f, 1.0f});
  create_slide_text("Geometry", -174.0f, 188.0f, 14.0f,
                    (Color){0.19f, 0.22f, 0.27f, 1.0f});
  create_slide_text("Typography", -174.0f, 236.0f, 14.0f,
                    (Color){0.19f, 0.22f, 0.27f, 1.0f});
  create_slide_text("Interaction", -174.0f, 284.0f, 14.0f,
                    (Color){0.19f, 0.22f, 0.27f, 1.0f});
  slide_container_entity = BLITZ_INVALID_INDEX;
  draw_order_normalization_deferred -= 1u;
  flush_draw_order_normalize();
}

// --- Public API: lifecycle -------------------------------------------------
EXPORT("blitz_init")
void blitz_init(void) {
  ecs_storage_init();
  world.entity_count = 0u;
  world.draw_order_count = 0u;
  free_count = 0u;
  live_count = 0u;
  shape_command_count = 0u;
  rect_draw_count = 0u;
  triangle_draw_count = 0u;
  oval_draw_count = 0u;
  path_draw_count = 0u;
  path_draft_active = 0u;
  path_draft_view.points = path_draft_points;
  path_draft_view.point_count = 0u;
  path_draft_view.fill_color = (Color){0.08f, 0.10f, 0.13f, 1.0f};
  path_draft_view.stroke_width = 4.0f;
  path_segment_count = 0u;
  text_draw_count = 0u;
  visible_text_shape_count = 0u;
  container_entity_count = 0u;
  dyn_command_count = 0u;
  dyn_overlay_command_start = 0u;
  dyn_rect_count = 0u;
  shape_command_version = 0u;
  dyn_version = 0u;
  static_dirty = 1u;
  dynamic_dirty = 1u;
  dragging_selection = 0u;
  drag_active = 0u;
  drag_hover_container = BLITZ_INVALID_INDEX;
  drag_top_level_count = 0u;
  drag_offset.x = 0.0f;
  drag_offset.y = 0.0f;
  path_draft_active = 0u;
  path_draft_view.point_count = 0u;
  resize_active = 0u;
  resize_entity = BLITZ_INVALID_INDEX;
  resize_handle = 0u;
  hidden_text_entity = BLITZ_INVALID_INDEX;
  transform_dirty_count = 0u;
  draw_order_normalization_deferred = 0u;
  draw_order_normalization_pending = 0u;
  slide_container_entity = BLITZ_INVALID_INDEX;
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
  uniforms.interaction[0] = 0.0f;
  uniforms.interaction[1] = 0.0f;
  uniforms.interaction[2] = 0.0f;
  uniforms.interaction[3] = 0.0f;

  world_update_for_frame();
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

// --- Public API: viewport & camera -----------------------------------------
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

// --- Public API: pointer & marquee -----------------------------------------
EXPORT("blitz_pointer_down")
u32 blitz_pointer_down(float screen_x, float screen_y, u32 additive) {
  world_sync_for_read();
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
    drag_top_level_count = 0u;
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
      drag_top_level_count = selected_top_level_count_capped(
          BLITZ_CONTAINER_RETARGET_SELECTION_LIMIT + 1u);
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
  drag_top_level_count = 0u;
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

// Force a marquee starting at the given point, clearing the current selection
// first, regardless of what is under it. Used by the touch long-press gesture
// so a selection box can start on top of an object, not only on empty space.
EXPORT("blitz_begin_marquee")
void blitz_begin_marquee(float screen_x, float screen_y) {
  world_sync_for_read();
  float world_x = 0.0f;
  float world_y = 0.0f;
  screen_to_world(screen_x, screen_y, &world_x, &world_y);
  resize_active = 0u;
  dragging_selection = 0u;
  drag_top_level_count = 0u;
  clear_selection();
  marquee_active = 1u;
  marquee_additive = 0u;
  marquee_candidate = BLITZ_INVALID_INDEX;
  marquee_start.x = world_x;
  marquee_start.y = world_y;
  marquee_end = marquee_start;
  snapshot_selection_base();
  mark_dynamic_dirty();
}

EXPORT("blitz_hit_test")
u32 blitz_hit_test(float screen_x, float screen_y) {
  world_sync_for_read();
  float world_x = 0.0f;
  float world_y = 0.0f;
  screen_to_world(screen_x, screen_y, &world_x, &world_y);
  return hit_test_entity(world_x, world_y);
}

EXPORT("blitz_resize_mode_at")
u32 blitz_resize_mode_at(float screen_x, float screen_y) {
  world_sync_for_read();
  float world_x = 0.0f;
  float world_y = 0.0f;
  screen_to_world(screen_x, screen_y, &world_x, &world_y);
  u32 handle =
      hit_test_resize_handle(world_x, world_y, selected_resizable_entity());
  return handle == BLITZ_INVALID_INDEX ? 0u : 3u + handle;
}

EXPORT("blitz_pointer_move")
void blitz_pointer_move(float screen_x, float screen_y) {
  world_sync_for_read();
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
  uniforms.interaction[0] = drag_offset.x;
  uniforms.interaction[1] = drag_offset.y;
  u32 next_hover_container = drag_hover_container_target();
  if (drag_hover_container != next_hover_container) {
    drag_hover_container = next_hover_container;
    mark_dynamic_dirty();
  }
  // Per-frame uplift flag for the shader: dragged shapes rise to the top only
  // while hovering a new container (no re-extraction needed during the drag).
  // interaction[3] (.w); [2] (.z) is owned by the grid-visibility toggle.
  uniforms.interaction[3] = drag_hover_targets_new_container() ? 1.0f : 0.0f;
}

EXPORT("blitz_pointer_up")
void blitz_pointer_up(void) {
  world_sync_for_read();
  if (resize_active) {
    resize_active = 0u;
    resize_entity = BLITZ_INVALID_INDEX;
    mark_dynamic_dirty();
    history_commit();
    return;
  }
  if (drag_active) {
    u32 drop_container = hit_test_drop_container(drag_last_world.x,
                                                drag_last_world.y);
    u32 any_reparented = 0u;
    for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
      if (world.selected[entity] && !entity_has_selected_ancestor(entity)) {
        float next_x = world.positions[entity].x + drag_offset.x;
        float next_y = world.positions[entity].y + drag_offset.y;
        ecs_move_absolute(entity, next_x, next_y);
        if (drop_container != BLITZ_INVALID_INDEX) {
          u32 previous_parent =
              (world.masks[entity] & BLITZ_COMPONENT_RELATIVE_TRANSFORM)
                  ? world.relative_transforms[entity].parent
                  : BLITZ_INVALID_INDEX;
          attach_relative_transform(entity, drop_container,
                                    next_x - world.positions[drop_container].x,
                                    next_y - world.positions[drop_container].y);
          if (previous_parent != drop_container) {
            any_reparented = 1u;
          }
        } else {
          detach_from_parent(entity);
          mark_transform_subtree_dirty(entity);
        }
      }
    }
    // Dropping onto a new container makes the whole dropped selection the
    // topmost contents of that container. Done once for the entire selection
    // (re-dropping within the same container leaves z-order untouched), so
    // attaching a large multi-selection stays linear rather than quadratic.
    if (drop_container != BLITZ_INVALID_INDEX && any_reparented) {
      lift_selection_above_container(drop_container);
    }
    drag_offset.x = 0.0f;
    drag_offset.y = 0.0f;
    drag_hover_container = BLITZ_INVALID_INDEX;
    uniforms.interaction[0] = 0.0f;
    uniforms.interaction[1] = 0.0f;
    uniforms.interaction[3] = 0.0f;
    drag_active = 0u;
    dragging_selection = 0u;
    drag_top_level_count = 0u;
    mark_render_list_dirty();
    history_commit();
    return;
  }
  dragging_selection = 0u;
  drag_hover_container = BLITZ_INVALID_INDEX;
  drag_top_level_count = 0u;
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

// --- Public API: quick-add shapes ------------------------------------------
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

EXPORT("blitz_add_frame")
void blitz_add_frame(void) {
  u32 history_owned = history_begin_owned();
  float offset = (float)(spawn_count % 6u) * 16.0f;
  u32 entity = create_user_frame(uniforms.viewport_camera[2] + offset,
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

EXPORT("blitz_add_oval")
void blitz_add_oval(void) {
  u32 history_owned = history_begin_owned();
  float offset = (float)(spawn_count % 6u) * 16.0f;
  u32 entity = create_user_oval(uniforms.viewport_camera[2] + offset,
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

// --- Public API: duplicate & clipboard -------------------------------------
EXPORT("blitz_duplicate_selected")
u32 blitz_duplicate_selected(float offset_x, float offset_y) {
  world_sync_for_read();
  if (selected_count == 0u) {
    return 0u;
  }
  u32 history_owned = history_begin_owned();
  u32 original_entity_count = world.entity_count;
  u32 original_draw_order_count = world.draw_order_count;
  for (u32 entity = 0u; entity < original_entity_count; entity += 1u) {
    duplicate_entity_map[entity] = BLITZ_INVALID_INDEX;
  }
  u32 duplicated = 0u;
  draw_order_normalization_deferred += 1u;
  for (u32 order = 0u; order < original_draw_order_count; order += 1u) {
    u32 source = world.draw_order[order];
    if (world.masks[source] == 0u ||
        (!world.selected[source] && !entity_has_selected_ancestor(source))) {
      continue;
    }
    u32 clone = clone_entity_for_duplicate(source, offset_x, offset_y);
    if (clone == BLITZ_INVALID_INDEX) {
      continue;
    }
    duplicate_entity_map[source] = clone;
    duplicated += 1u;
    if (world.masks[source] & BLITZ_COMPONENT_RELATIVE_TRANSFORM) {
      RelativeTransform relative = world.relative_transforms[source];
      u32 parent = relative.parent;
      if (parent != BLITZ_INVALID_INDEX && world.masks[parent] != 0u) {
        u32 clone_parent = duplicate_entity_map[parent];
        if (clone_parent != BLITZ_INVALID_INDEX) {
          attach_relative_transform(clone, clone_parent, relative.offset_x,
                                    relative.offset_y);
        } else {
          attach_relative_transform(clone, parent,
                                    relative.offset_x + offset_x,
                                    relative.offset_y + offset_y);
        }
      }
    }
  }
  draw_order_normalization_deferred -= 1u;
  if (draw_order_normalization_pending) {
    flush_draw_order_normalize();
  }
  if (duplicated == 0u) {
    if (history_owned) history_cancel();
    return 0u;
  }
  clear_selection();
  for (u32 source = 0u; source < original_entity_count; source += 1u) {
    u32 clone = duplicate_entity_map[source];
    if (clone != BLITZ_INVALID_INDEX && world.masks[clone] != 0u) {
      world.selected[clone] = 1u;
      selected_count += 1u;
    }
  }
  mark_render_list_dirty();
  if (history_owned) history_commit();
  return duplicated;
}

EXPORT("blitz_copy_selected_to_internal_clipboard")
u32 blitz_copy_selected_to_internal_clipboard(void) {
  world_sync_for_read();
  internal_clipboard_count = 0u;
  if (selected_count == 0u) {
    return 0u;
  }
  float min_x = 0.0f;
  float min_y = 0.0f;
  float max_x = 0.0f;
  float max_y = 0.0f;
  for (u32 order = 0u; order < world.draw_order_count; order += 1u) {
    u32 entity = world.draw_order[order];
    if (world.masks[entity] == 0u ||
        (!world.selected[entity] && !entity_has_selected_ancestor(entity))) {
      continue;
    }
    if (internal_clipboard_count >= BLITZ_MAX_ENTITIES) {
      break;
    }
    internal_clipboard_sources[internal_clipboard_count] = entity;
    internal_clipboard_count += 1u;
    Vec2 position = world.positions[entity];
    Vec2 size = world.sizes[entity];
    if (internal_clipboard_count == 1u) {
      min_x = position.x;
      min_y = position.y;
      max_x = position.x + size.x;
      max_y = position.y + size.y;
    } else {
      min_x = minf_local(min_x, position.x);
      min_y = minf_local(min_y, position.y);
      max_x = maxf_local(max_x, position.x + size.x);
      max_y = maxf_local(max_y, position.y + size.y);
    }
  }
  internal_clipboard_bounds[0] = min_x;
  internal_clipboard_bounds[1] = min_y;
  internal_clipboard_bounds[2] = max_x - min_x;
  internal_clipboard_bounds[3] = max_y - min_y;
  return internal_clipboard_count;
}

EXPORT("blitz_internal_clipboard_bounds_ptr")
u32 blitz_internal_clipboard_bounds_ptr(void) {
  return (u32)&internal_clipboard_bounds[0];
}

EXPORT("blitz_internal_clipboard_count")
u32 blitz_internal_clipboard_count(void) {
  return internal_clipboard_count;
}

EXPORT("blitz_paste_internal_clipboard")
u32 blitz_paste_internal_clipboard(float offset_x, float offset_y) {
  world_sync_for_read();
  if (internal_clipboard_count == 0u) {
    return 0u;
  }
  u32 history_owned = history_begin_owned();
  u32 original_entity_count = world.entity_count;
  for (u32 entity = 0u; entity < original_entity_count; entity += 1u) {
    duplicate_entity_map[entity] = BLITZ_INVALID_INDEX;
  }
  u32 pasted = 0u;
  draw_order_normalization_deferred += 1u;
  for (u32 index = 0u; index < internal_clipboard_count; index += 1u) {
    u32 source = internal_clipboard_sources[index];
    if (source >= original_entity_count || world.masks[source] == 0u) {
      continue;
    }
    u32 clone = clone_entity_for_duplicate(source, offset_x, offset_y);
    if (clone == BLITZ_INVALID_INDEX) {
      continue;
    }
    duplicate_entity_map[source] = clone;
    pasted += 1u;
    if (world.masks[source] & BLITZ_COMPONENT_RELATIVE_TRANSFORM) {
      RelativeTransform relative = world.relative_transforms[source];
      u32 parent = relative.parent;
      if (parent != BLITZ_INVALID_INDEX && parent < original_entity_count &&
          world.masks[parent] != 0u) {
        u32 clone_parent = duplicate_entity_map[parent];
        if (clone_parent != BLITZ_INVALID_INDEX) {
          attach_relative_transform(clone, clone_parent, relative.offset_x,
                                    relative.offset_y);
        } else {
          attach_relative_transform(clone, parent,
                                    relative.offset_x + offset_x,
                                    relative.offset_y + offset_y);
        }
      }
    }
  }
  draw_order_normalization_deferred -= 1u;
  if (draw_order_normalization_pending) {
    flush_draw_order_normalize();
  }
  if (pasted == 0u) {
    if (history_owned) history_cancel();
    return 0u;
  }
  clear_selection();
  for (u32 index = 0u; index < internal_clipboard_count; index += 1u) {
    u32 source = internal_clipboard_sources[index];
    if (source < original_entity_count) {
      u32 clone = duplicate_entity_map[source];
      if (clone != BLITZ_INVALID_INDEX && world.masks[clone] != 0u) {
        world.selected[clone] = 1u;
        selected_count += 1u;
      }
    }
  }
  mark_render_list_dirty();
  if (history_owned) history_commit();
  return pasted;
}

// --- Public API: scene & selection management ------------------------------
static void clear_scene_state(void) {
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (world.masks[entity] != 0u) {
      release_entity_resources(entity);
    }
  }
  world.entity_count = 0u;
  world.draw_order_count = 0u;
  free_count = 0u;
  live_count = 0u;
  selected_count = 0u;
  container_entity_count = 0u;
  dragging_selection = 0u;
  drag_active = 0u;
  drag_hover_container = BLITZ_INVALID_INDEX;
  drag_top_level_count = 0u;
  drag_offset.x = 0.0f;
  drag_offset.y = 0.0f;
  resize_active = 0u;
  resize_entity = BLITZ_INVALID_INDEX;
  hidden_text_entity = BLITZ_INVALID_INDEX;
  transform_dirty_count = 0u;
  draw_order_normalization_deferred = 0u;
  draw_order_normalization_pending = 0u;
  slide_container_entity = BLITZ_INVALID_INDEX;
  uniforms.interaction[0] = 0.0f;
  uniforms.interaction[1] = 0.0f;
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

EXPORT("blitz_select_object")
u32 blitz_select_object(u32 actor_hi, u32 actor_lo, u32 sequence_hi,
                        u32 sequence_lo, u32 additive) {
  ObjectId id = {actor_hi, actor_lo, sequence_hi, sequence_lo};
  u32 entity = entity_for_object_id(id);
  if (entity == BLITZ_INVALID_INDEX ||
      !(world.masks[entity] & BLITZ_COMPONENT_SELECTABLE)) {
    return 0u;
  }
  if (!additive) {
    clear_selection();
  }
  if (!world.selected[entity]) {
    world.selected[entity] = 1u;
    selected_count += 1u;
    mark_dynamic_dirty();
  }
  return 1u;
}

EXPORT("blitz_set_relative_transform")
u32 blitz_set_relative_transform(u32 child_actor_hi, u32 child_actor_lo,
                                 u32 child_sequence_hi,
                                 u32 child_sequence_lo, u32 parent_actor_hi,
                                 u32 parent_actor_lo,
                                 u32 parent_sequence_hi,
                                 u32 parent_sequence_lo, float offset_x,
                                 float offset_y) {
  world_sync_for_read();
  u32 child = entity_for_object_id((ObjectId){
      child_actor_hi, child_actor_lo, child_sequence_hi, child_sequence_lo});
  u32 parent = entity_for_object_id((ObjectId){
      parent_actor_hi, parent_actor_lo, parent_sequence_hi,
      parent_sequence_lo});
  if (child == BLITZ_INVALID_INDEX || parent == BLITZ_INVALID_INDEX) {
    return 0u;
  }
  history_record_before(child);
  u32 changed = attach_relative_transform(child, parent, offset_x, offset_y);
  if (changed) {
    history_commit();
  } else {
    history_cancel();
  }
  return changed;
}

EXPORT("blitz_clear_relative_transform")
u32 blitz_clear_relative_transform(u32 actor_hi, u32 actor_lo,
                                   u32 sequence_hi, u32 sequence_lo) {
  world_sync_for_read();
  u32 entity =
      entity_for_object_id((ObjectId){actor_hi, actor_lo, sequence_hi,
                                      sequence_lo});
  if (entity == BLITZ_INVALID_INDEX ||
      !(world.masks[entity] & BLITZ_COMPONENT_RELATIVE_TRANSFORM)) {
    return 0u;
  }
  history_record_before(entity);
  detach_from_parent(entity);
  mark_render_list_dirty();
  history_commit();
  return 1u;
}

EXPORT("blitz_set_container")
u32 blitz_set_container(u32 actor_hi, u32 actor_lo, u32 sequence_hi,
                        u32 sequence_lo, u32 enabled) {
  world_sync_for_read();
  u32 entity =
      entity_for_object_id((ObjectId){actor_hi, actor_lo, sequence_hi,
                                      sequence_lo});
  if (entity == BLITZ_INVALID_INDEX) {
    return 0u;
  }
  history_record_before(entity);
  u32 changed = set_entity_container(entity, enabled);
  if (changed) {
    history_commit();
  } else {
    history_cancel();
  }
  return changed;
}

EXPORT("blitz_set_selected_container")
u32 blitz_set_selected_container(u32 enabled) {
  world_sync_for_read();
  if (selected_count == 0u) {
    return 0u;
  }
  history_record_selected_before();
  u32 changed = 0u;
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (!world.selected[entity]) {
      continue;
    }
    changed |= set_entity_container(entity, enabled);
  }
  if (changed) {
    history_commit();
  } else {
    history_cancel();
  }
  return changed;
}

EXPORT("blitz_selected_container_state")
u32 blitz_selected_container_state(void) {
  if (selected_count == 0u) {
    return 0u;
  }
  u32 container_count = 0u;
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (world.selected[entity] &&
        (world.masks[entity] & BLITZ_COMPONENT_CONTAINER)) {
      container_count += 1u;
    }
  }
  if (container_count == 0u) {
    return 1u;
  }
  return container_count == selected_count ? 2u : 3u;
}

// --- Public API: create shapes ---------------------------------------------
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
  attach_new_entity_to_container_target(entity);
  select_only(entity);
  mark_render_list_dirty();
  if (history_owned) history_commit();
  return entity;
}

EXPORT("blitz_create_frame")
u32 blitz_create_frame(float x, float y, float width, float height,
                       float fill_r, float fill_g, float fill_b,
                       float fill_a, float stroke_r, float stroke_g,
                       float stroke_b, float stroke_a, float stroke_width,
                       float title_r, float title_g, float title_b,
                       float title_a, float title_font_size,
                       u32 title_length) {
  if (width <= 0.0f || height <= 0.0f || title_font_size <= 0.0f) {
    return BLITZ_INVALID_INDEX;
  }
  const char *title = title_length > 0u ? copy_text_input(title_length) : "";
  if (!title) {
    return BLITZ_INVALID_INDEX;
  }
  u32 history_owned = history_begin_owned();
  u32 entity = create_base_frame(
      x, y, width, height, (Color){fill_r, fill_g, fill_b, fill_a},
      (Color){stroke_r, stroke_g, stroke_b, stroke_a}, stroke_width, title,
      (Color){title_r, title_g, title_b, title_a}, title_font_size);
  if (entity == BLITZ_INVALID_INDEX) {
    if (history_owned) history_cancel();
    return entity;
  }
  attach_new_entity_to_container_target(entity);
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
  u32 entity = create_base_oval(
      center_x - radius, center_y - radius, radius * 2.0f, radius * 2.0f,
      (Color){fill_r, fill_g, fill_b, fill_a},
      (Color){stroke_r, stroke_g, stroke_b, stroke_a}, stroke_width);
  if (entity == BLITZ_INVALID_INDEX) {
    if (history_owned) history_cancel();
    return entity;
  }
  attach_new_entity_to_container_target(entity);
  select_only(entity);
  mark_render_list_dirty();
  if (history_owned) history_commit();
  return entity;
}

EXPORT("blitz_create_oval")
u32 blitz_create_oval(float x, float y, float width, float height,
                      float fill_r, float fill_g, float fill_b, float fill_a,
                      float stroke_r, float stroke_g, float stroke_b,
                      float stroke_a, float stroke_width) {
  if (width <= 0.0f || height <= 0.0f) {
    return BLITZ_INVALID_INDEX;
  }
  u32 history_owned = history_begin_owned();
  u32 entity = create_base_oval(
      x, y, width, height, (Color){fill_r, fill_g, fill_b, fill_a},
      (Color){stroke_r, stroke_g, stroke_b, stroke_a}, stroke_width);
  if (entity == BLITZ_INVALID_INDEX) {
    if (history_owned) history_cancel();
    return entity;
  }
  attach_new_entity_to_container_target(entity);
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
  attach_new_entity_to_container_target(entity);
  select_only(entity);
  mark_render_list_dirty();
  if (history_owned) history_commit();
  return entity;
}

EXPORT("blitz_create_path")
u32 blitz_create_path(u32 point_count, float fill_r, float fill_g,
                      float fill_b, float fill_a, float stroke_width) {
  if (point_count < 2u || point_count > BLITZ_PATH_INPUT_POINTS ||
      stroke_width <= 0.0f) {
    return BLITZ_INVALID_INDEX;
  }
  Vec2 *points = (Vec2 *)blitz_alloc((usize)point_count * sizeof(Vec2));
  if (!points) {
    return BLITZ_INVALID_INDEX;
  }
  u32 kept = 0u;
  float min_distance = 1.5f / maxf_local(uniforms.style[0], 0.001f);
  for (u32 i = 0u; i < point_count; i += 1u) {
    float world_x = 0.0f;
    float world_y = 0.0f;
    screen_to_world(path_input[i * 2u], path_input[i * 2u + 1u], &world_x,
                    &world_y);
    if (kept > 0u) {
      float dx = world_x - points[kept - 1u].x;
      float dy = world_y - points[kept - 1u].y;
      if (dx * dx + dy * dy < min_distance * min_distance &&
          i + 1u < point_count) {
        continue;
      }
    }
    points[kept].x = world_x;
    points[kept].y = world_y;
    kept += 1u;
  }
  if (kept < 2u) {
    blitz_free(points);
    return BLITZ_INVALID_INDEX;
  }
  u32 history_owned = history_begin_owned();
  u32 entity = create_base_path(
      points, kept, (Color){fill_r, fill_g, fill_b, fill_a}, stroke_width);
  if (entity == BLITZ_INVALID_INDEX) {
    blitz_free(points);
    if (history_owned) history_cancel();
    return entity;
  }
  attach_new_entity_to_container_target(entity);
  select_only(entity);
  mark_render_list_dirty();
  if (history_owned) history_commit();
  return entity;
}

// --- Public API: text & path input -----------------------------------------
EXPORT("blitz_text_input_ptr")
u32 blitz_text_input_ptr(void) {
  return (u32)&text_input[0];
}

EXPORT("blitz_text_input_capacity")
u32 blitz_text_input_capacity(void) {
  return BLITZ_TEXT_INPUT_BYTES;
}

EXPORT("blitz_path_input_ptr")
u32 blitz_path_input_ptr(void) {
  return (u32)&path_input[0];
}

EXPORT("blitz_path_input_capacity")
u32 blitz_path_input_capacity(void) {
  return BLITZ_PATH_INPUT_POINTS;
}

EXPORT("blitz_update_path_draft")
u32 blitz_update_path_draft(u32 point_count, float fill_r, float fill_g,
                            float fill_b, float fill_a, float stroke_width) {
  if (point_count < 2u || point_count > BLITZ_PATH_INPUT_POINTS ||
      stroke_width <= 0.0f) {
    path_draft_active = 0u;
    path_draft_view.point_count = 0u;
    rebuild_path_draft();
    return 0u;
  }
  for (u32 i = 0u; i < point_count; i += 1u) {
    float world_x = 0.0f;
    float world_y = 0.0f;
    screen_to_world(path_input[i * 2u], path_input[i * 2u + 1u], &world_x,
                    &world_y);
    path_draft_points[i].x = world_x;
    path_draft_points[i].y = world_y;
  }
  path_draft_view.points = path_draft_points;
  path_draft_view.point_count = point_count;
  path_draft_view.fill_color = (Color){fill_r, fill_g, fill_b, fill_a};
  path_draft_view.stroke_width = stroke_width;
  path_draft_active = 1u;
  // Only rebuild the draft's own buffer — the static stream is untouched.
  rebuild_path_draft();
  return 1u;
}

EXPORT("blitz_clear_path_draft")
void blitz_clear_path_draft(void) {
  if (!path_draft_active && path_draft_view.point_count == 0u) {
    return;
  }
  path_draft_active = 0u;
  path_draft_view.point_count = 0u;
  rebuild_path_draft();
}

EXPORT("blitz_create_text")
u32 blitz_create_text(float x, float y, float font_size, float color_r,
                      float color_g, float color_b, float color_a,
                      u32 text_length, float max_width, float line_height,
                      u32 max_lines, u32 align) {
  if (font_size <= 0.0f || text_length == 0u) {
    return BLITZ_INVALID_INDEX;
  }
  const char *text = copy_text_input(text_length);
  if (!text) {
    return BLITZ_INVALID_INDEX;
  }
  u32 history_owned = history_begin_owned();
  u32 entity = create_base_text(
      text, x, y, font_size, (Color){color_r, color_g, color_b, color_a},
      max_width, line_height, max_lines, align);
  if (entity == BLITZ_INVALID_INDEX) {
    if (history_owned) history_cancel();
    return entity;
  }
  attach_new_entity_to_container_target(entity);
  select_only(entity);
  mark_render_list_dirty();
  if (history_owned) history_commit();
  return entity;
}

// Returns 0 on success, 1 when the object is missing, 2 for a type mismatch,
// 3 for invalid values, and 4 when updated text cannot be allocated.
// --- Public API: object update ---------------------------------------------
EXPORT("blitz_update_object")
u32 blitz_update_object(
    u32 actor_hi, u32 actor_lo, u32 sequence_hi, u32 sequence_lo,
    u32 expected_kind, u32 flags, float x, float y, float width, float height,
    float fill_r, float fill_g, float fill_b, float fill_a, float stroke_r,
    float stroke_g, float stroke_b, float stroke_a, float stroke_width,
    float font_size, float text_r, float text_g, float text_b, float text_a,
    u32 text_length, float max_width, float line_height, u32 max_lines,
    u32 align) {
  world_sync_for_read();
  ObjectId id = {actor_hi, actor_lo, sequence_hi, sequence_lo};
  u32 entity = entity_for_object_id(id);
  if (entity == BLITZ_INVALID_INDEX) {
    return 1u;
  }
  u32 mask = world.masks[entity];
  u32 kind = mask & BLITZ_COMPONENT_FRAME_VIEW
                 ? BLITZ_SHAPE_FRAME
                 : (mask & BLITZ_COMPONENT_RECT_VIEW
                        ? BLITZ_SHAPE_RECT
                        : (mask & BLITZ_COMPONENT_TRIANGLE_VIEW
                        ? BLITZ_SHAPE_TRIANGLE
                        : (mask & BLITZ_COMPONENT_OVAL_VIEW
                               ? BLITZ_SHAPE_OVAL
                               : BLITZ_SHAPE_TEXT)));
  if (kind != expected_kind) {
    return 2u;
  }
  if (((flags & BLITZ_UPDATE_WIDTH) && width <= 0.0f) ||
      ((flags & BLITZ_UPDATE_HEIGHT) && height <= 0.0f)) {
    return 3u;
  }
  if ((flags & BLITZ_UPDATE_STROKE_WIDTH) && stroke_width < 0.0f) {
    return 3u;
  }
  if (((flags & BLITZ_UPDATE_FONT_SIZE) && font_size <= 0.0f) ||
      ((flags & BLITZ_UPDATE_MAX_WIDTH) && max_width < 0.0f) ||
      ((flags & BLITZ_UPDATE_LINE_HEIGHT) && line_height <= 0.0f) ||
      ((flags & BLITZ_UPDATE_ALIGN) && align > 2u)) {
    return 3u;
  }

  history_record_before(entity);
  if (kind == BLITZ_SHAPE_OVAL) {
    Vec2 size = world.sizes[entity];
    float center_x = world.positions[entity].x + size.x * 0.5f;
    float center_y = world.positions[entity].y + size.y * 0.5f;
    if (flags & BLITZ_UPDATE_X) center_x = x;
    if (flags & BLITZ_UPDATE_Y) center_y = y;
    if (flags & BLITZ_UPDATE_WIDTH) {
      size.x = width;
      size.y = width;
    }
    world.sizes[entity] = size;
    ecs_move_absolute(entity, center_x - size.x * 0.5f,
                      center_y - size.y * 0.5f);
  } else if (kind == BLITZ_SHAPE_TEXT) {
    TextView *view = &world.text_views[entity];
    float padding = view->origin_x;
    float next_font_size =
        flags & BLITZ_UPDATE_FONT_SIZE ? font_size : view->font_size;
    float next_max_width =
        flags & BLITZ_UPDATE_MAX_WIDTH ? max_width : view->max_width;
    float next_line_height =
        flags & BLITZ_UPDATE_LINE_HEIGHT ? line_height : view->line_height;
    u32 next_max_lines =
        flags & BLITZ_UPDATE_MAX_LINES ? max_lines : view->max_lines;
    u32 next_align = flags & BLITZ_UPDATE_ALIGN ? align : view->align;
    const char *next_text = view->text;
    if (flags & BLITZ_UPDATE_TEXT) {
      next_text = copy_text_input(text_length);
      if (!next_text) {
        return 4u;
      }
    }
    layout_text(next_text, next_font_size, next_max_width, next_line_height,
                next_max_lines);
    if (text_layout_overflow) {
      return 5u;
    }
    view->text = next_text;
    view->font_size = next_font_size;
    view->max_width = next_max_width;
    view->line_height = next_line_height;
    view->max_lines = next_max_lines;
    view->align = next_align;
    view->baseline_offset = padding + BLITZ_FONT_ASCENDER * next_font_size;
    if (flags & (BLITZ_UPDATE_X | BLITZ_UPDATE_Y)) {
      float next_x = flags & BLITZ_UPDATE_X ? x - padding
                                            : world.positions[entity].x;
      float next_y = flags & BLITZ_UPDATE_Y ? y - padding
                                            : world.positions[entity].y;
      ecs_move_absolute(entity, next_x, next_y);
    }
    world.sizes[entity].x =
        (next_max_width > 0.0f ? next_max_width : text_layout_width) +
        padding * 2.0f;
    world.sizes[entity].y = text_layout_height + padding * 2.0f;
    if (flags & BLITZ_UPDATE_TEXT_COLOR) {
      view->color = (Color){text_r, text_g, text_b, text_a};
    }
  } else {
    if (flags & (BLITZ_UPDATE_X | BLITZ_UPDATE_Y)) {
      float next_x = flags & BLITZ_UPDATE_X ? x : world.positions[entity].x;
      float next_y = flags & BLITZ_UPDATE_Y ? y : world.positions[entity].y;
      ecs_move_absolute(entity, next_x, next_y);
    }
    if (flags & BLITZ_UPDATE_WIDTH) world.sizes[entity].x = width;
    if (flags & BLITZ_UPDATE_HEIGHT) world.sizes[entity].y = height;
  }

  if (kind == BLITZ_SHAPE_RECT || kind == BLITZ_SHAPE_FRAME) {
    RectView *view = &world.rect_views[entity];
    if (flags & BLITZ_UPDATE_FILL)
      view->fill_color = (Color){fill_r, fill_g, fill_b, fill_a};
    if (flags & BLITZ_UPDATE_STROKE)
      view->stroke_color = (Color){stroke_r, stroke_g, stroke_b, stroke_a};
    if (flags & BLITZ_UPDATE_STROKE_WIDTH)
      view->stroke_width = stroke_width;
  } else if (kind == BLITZ_SHAPE_TRIANGLE) {
    TriangleView *view = &world.triangle_views[entity];
    if (flags & BLITZ_UPDATE_FILL)
      view->fill_color = (Color){fill_r, fill_g, fill_b, fill_a};
    if (flags & BLITZ_UPDATE_STROKE)
      view->stroke_color = (Color){stroke_r, stroke_g, stroke_b, stroke_a};
    if (flags & BLITZ_UPDATE_STROKE_WIDTH)
      view->stroke_width = stroke_width;
  } else if (kind == BLITZ_SHAPE_OVAL) {
    OvalView *view = &world.oval_views[entity];
    if (flags & BLITZ_UPDATE_FILL)
      view->fill_color = (Color){fill_r, fill_g, fill_b, fill_a};
    if (flags & BLITZ_UPDATE_STROKE)
      view->stroke_color = (Color){stroke_r, stroke_g, stroke_b, stroke_a};
    if (flags & BLITZ_UPDATE_STROKE_WIDTH)
      view->stroke_width = stroke_width;
  }
  mark_render_list_dirty();
  return 0u;
}

// --- Public API: scene queries ---------------------------------------------
EXPORT("blitz_query_scene")
u32 blitz_query_scene(float min_x, float min_y, float max_x, float max_y,
                      u32 limit) {
  world_sync_for_read();
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
    if (mask & BLITZ_COMPONENT_FRAME_VIEW) {
      RectView rect = world.rect_views[entity];
      FrameView frame = world.frame_views[entity];
      kind = BLITZ_SHAPE_FRAME;
      fill = rect.fill_color;
      stroke = rect.stroke_color;
      stroke_width = rect.stroke_width;
      font_size = frame.title_font_size;
      text = frame.title;
    } else if (mask & BLITZ_COMPONENT_RECT_VIEW) {
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
    } else if (mask & BLITZ_COMPONENT_OVAL_VIEW) {
      OvalView view = world.oval_views[entity];
      kind = BLITZ_SHAPE_OVAL;
      fill = view.fill_color;
      stroke = view.stroke_color;
      stroke_width = view.stroke_width;
    } else if (mask & BLITZ_COMPONENT_TEXT_VIEW) {
      TextView view = world.text_views[entity];
      kind = BLITZ_SHAPE_TEXT;
      fill = view.color;
      font_size = view.font_size;
      text = view.text;
    } else if (mask & BLITZ_COMPONENT_PATH_VIEW) {
      PathView view = world.path_views[entity];
      kind = BLITZ_SHAPE_PATH;
      fill = view.fill_color;
      stroke = (Color){0.0f, 0.0f, 0.0f, 0.0f}; // pens have no stroke
      stroke_width = view.stroke_width;
    } else {
      continue;
    }

    scene_query_total += 1u;
    if (scene_query_count >= limit) {
      continue;
    }
    scene_query_items = (SceneItem *)dyn_grow(scene_query_items,
                                              &scene_query_items_cap,
                                              scene_query_count,
                                              sizeof(SceneItem));
    if (!scene_query_items) {
      break;
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
    item->style[2] = kind == BLITZ_SHAPE_TEXT
                         ? world.text_views[entity].max_width
                         : (kind == BLITZ_SHAPE_FRAME
                                ? world.frame_views[entity].title_color.r
                                : 0.0f);
    item->style[3] = kind == BLITZ_SHAPE_TEXT
                         ? world.text_views[entity].line_height
                         : (kind == BLITZ_SHAPE_FRAME
                                ? world.frame_views[entity].title_color.g
                                : 0.0f);
    item->style[4] = kind == BLITZ_SHAPE_TEXT
                         ? (float)world.text_views[entity].max_lines
                         : (kind == BLITZ_SHAPE_FRAME
                                ? world.frame_views[entity].title_color.b
                                : 0.0f);
    item->style[5] = kind == BLITZ_SHAPE_TEXT
                         ? (float)world.text_views[entity].align
                         : (kind == BLITZ_SHAPE_FRAME
                                ? world.frame_views[entity].title_color.a
                                : 0.0f);
    item->parent_object_id = object_id_zero();
    if (mask & BLITZ_COMPONENT_RELATIVE_TRANSFORM) {
      u32 parent = world.relative_transforms[entity].parent;
      if (parent != BLITZ_INVALID_INDEX && world.masks[parent] != 0u) {
        item->parent_object_id = world.object_ids[parent];
      }
    }
    item->component_mask = mask;
    item->selected_subtree =
        world.selected[entity] || entity_has_selected_ancestor(entity);
    scene_query_count += 1u;
  }
  return scene_query_count;
}

EXPORT("blitz_scene_query_ptr")
u32 blitz_scene_query_ptr(void) {
  return (u32)scene_query_items;
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

// --- Public API: serialization ---------------------------------------------
EXPORT("blitz_scene_file_buffer_ptr")
u32 blitz_scene_file_buffer_ptr(void) {
  return (u32)scene_file_buffer;
}

EXPORT("blitz_scene_file_buffer_capacity")
u32 blitz_scene_file_buffer_capacity(void) {
  return BLITZ_SCENE_FILE_BUFFER_BYTES;
}

// Ensure the file buffer holds `bytes` and return its address (0 if `bytes`
// exceeds the supported maximum or allocation fails). Callers write here before
// blitz_scene_deserialize.
EXPORT("blitz_scene_file_buffer_reserve")
u32 blitz_scene_file_buffer_reserve(u32 bytes) {
  if (bytes > BLITZ_SCENE_FILE_BUFFER_BYTES) {
    return 0u;
  }
  if (!scene_file_ensure(bytes ? bytes : 1u, 0u)) {
    return 0u;
  }
  return (u32)scene_file_buffer;
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
  world_sync_for_read();
  u32 offset = BLITZ_SCENE_FILE_HEADER_BYTES;
  u32 object_count = 0u;
  if (!scene_file_ensure(BLITZ_SCENE_FILE_HEADER_BYTES, 0u)) {
    return 0;
  }

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
    float max_width = 0.0f;
    float line_height = BLITZ_FONT_LINE_HEIGHT;
    u32 max_lines = 0u;
    u32 align = 0u;
    const char *text = 0;
    u32 text_length = 0u;

    if (mask & BLITZ_COMPONENT_FRAME_VIEW) {
      RectView rect = world.rect_views[entity];
      FrameView frame = world.frame_views[entity];
      kind = BLITZ_SHAPE_FRAME;
      fill = rect.fill_color;
      stroke = rect.stroke_color;
      stroke_width = rect.stroke_width;
      font_size = frame.title_font_size;
      origin_x = frame.title_color.r;
      baseline_offset = frame.title_color.g;
      max_width = frame.title_color.b;
      line_height = frame.title_color.a;
      text = frame.title;
      text_length = string_length(text);
    } else if (mask & BLITZ_COMPONENT_RECT_VIEW) {
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
    } else if (mask & BLITZ_COMPONENT_OVAL_VIEW) {
      OvalView view = world.oval_views[entity];
      kind = BLITZ_SHAPE_OVAL;
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
      max_width = view.max_width;
      line_height = view.line_height;
      max_lines = view.max_lines;
      align = view.align;
      text = view.text;
      text_length = string_length(text);
    } else if (mask & BLITZ_COMPONENT_PATH_VIEW) {
      PathView view = world.path_views[entity];
      kind = BLITZ_SHAPE_PATH;
      fill = view.fill_color;
      stroke = (Color){0.0f, 0.0f, 0.0f, 0.0f}; // pens have no stroke
      stroke_width = view.stroke_width;
      text_length = view.point_count;
    } else {
      continue;
    }

    u32 payload_bytes =
        kind == BLITZ_SHAPE_PATH ? text_length * 2u * sizeof(float)
                                 : align4(text_length);
    u32 record_bytes = BLITZ_SCENE_FILE_V8_RECORD_BYTES + payload_bytes;
    if (offset + record_bytes > BLITZ_SCENE_FILE_BUFFER_BYTES) {
      return 0u;
    }

    Vec2 position = world.positions[entity];
    Vec2 size = world.sizes[entity];
    if (!scene_file_ensure(offset + record_bytes, offset)) {
      return 0;
    }
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
    write_f32(scene_file_buffer, offset + 92u, max_width);
    write_f32(scene_file_buffer, offset + 96u, line_height);
    write_u32(scene_file_buffer, offset + 100u, max_lines);
    write_u32(scene_file_buffer, offset + 104u, align);
    write_u32(scene_file_buffer, offset + 108u,
              mask & BLITZ_COMPONENT_CONTAINER);
    ObjectId parent_id = object_id_zero();
    float parent_offset_x = 0.0f;
    float parent_offset_y = 0.0f;
    if ((mask & BLITZ_COMPONENT_RELATIVE_TRANSFORM) &&
        world.relative_transforms[entity].parent != BLITZ_INVALID_INDEX) {
      u32 parent_entity = world.relative_transforms[entity].parent;
      parent_id = world.object_ids[parent_entity];
      parent_offset_x = world.relative_transforms[entity].offset_x;
      parent_offset_y = world.relative_transforms[entity].offset_y;
    }
    write_u32(scene_file_buffer, offset + 112u, parent_id.actor_hi);
    write_u32(scene_file_buffer, offset + 116u, parent_id.actor_lo);
    write_u32(scene_file_buffer, offset + 120u, parent_id.sequence_hi);
    write_u32(scene_file_buffer, offset + 124u, parent_id.sequence_lo);
    write_f32(scene_file_buffer, offset + 128u, parent_offset_x);
    write_f32(scene_file_buffer, offset + 132u, parent_offset_y);
    if (kind == BLITZ_SHAPE_PATH) {
      PathView view = world.path_views[entity];
      for (u32 i = 0u; i < view.point_count; i += 1u) {
        write_f32(scene_file_buffer,
                  offset + BLITZ_SCENE_FILE_V8_RECORD_BYTES + i * 8u,
                  view.points[i].x);
        write_f32(scene_file_buffer,
                  offset + BLITZ_SCENE_FILE_V8_RECORD_BYTES + i * 8u + 4u,
                  view.points[i].y);
      }
    } else {
      for (u32 i = 0u; i < align4(text_length); i += 1u) {
        scene_file_buffer[offset + BLITZ_SCENE_FILE_V8_RECORD_BYTES + i] =
            i < text_length ? (unsigned char)text[i] : 0u;
      }
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
  if (file_version != 1u && file_version != 2u && file_version != 3u &&
      file_version != 4u &&
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
  u32 fixed_record_bytes =
      file_version >= 8u
          ? BLITZ_SCENE_FILE_V8_RECORD_BYTES
          : file_version >= 6u
          ? BLITZ_SCENE_FILE_V6_RECORD_BYTES
          : file_version >= 4u
          ? BLITZ_SCENE_FILE_V4_RECORD_BYTES
          : (file_version >= 3u ? BLITZ_SCENE_FILE_RECORD_BYTES
                                : BLITZ_SCENE_FILE_LEGACY_RECORD_BYTES);
  for (u32 index = 0u; index < object_count; index += 1u) {
    if (offset + fixed_record_bytes > byte_count) {
      return 7u;
    }
    u32 kind = read_u32(scene_file_buffer, offset);
    u32 record_bytes = read_u32(scene_file_buffer, offset + 4u);
    u32 text_length = read_u32(scene_file_buffer, offset + 12u);
    u32 max_kind =
        file_version >= 7u
            ? BLITZ_SHAPE_PATH
            : (file_version >= 5u ? BLITZ_SHAPE_FRAME : BLITZ_SHAPE_TEXT);
    if (kind > max_kind ||
        record_bytes < fixed_record_bytes ||
        offset + record_bytes > byte_count) {
      return 8u;
    }
    u32 payload_bytes = record_bytes - fixed_record_bytes;
    if (kind == BLITZ_SHAPE_PATH) {
      if (text_length < 2u || payload_bytes != text_length * 8u) {
        return 8u;
      }
    } else if (text_length > payload_bytes) {
      return 8u;
    }
    float width = read_f32(scene_file_buffer, offset + 24u);
    float height = read_f32(scene_file_buffer, offset + 28u);
    if (!(width > 0.0f) || !(height > 0.0f)) {
      return 9u;
    }
    if (kind == BLITZ_SHAPE_TEXT || kind == BLITZ_SHAPE_FRAME) {
      if ((kind == BLITZ_SHAPE_TEXT && text_length == 0u) ||
          required_text_bytes + text_length + 1u > BLITZ_TEXT_POOL_BYTES) {
        return 10u;
      }
      required_text_bytes += text_length + 1u;
    } else if (kind != BLITZ_SHAPE_PATH && text_length != 0u) {
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
    float max_width =
        file_version >= 4u ? read_f32(scene_file_buffer, offset + 92u) : 0.0f;
    float line_height = file_version >= 4u
                            ? read_f32(scene_file_buffer, offset + 96u)
                            : BLITZ_FONT_LINE_HEIGHT;
    u32 max_lines =
        file_version >= 4u ? read_u32(scene_file_buffer, offset + 100u) : 0u;
    u32 align =
        file_version >= 4u ? read_u32(scene_file_buffer, offset + 104u) : 0u;
    u32 stored_component_mask =
        file_version >= 6u ? read_u32(scene_file_buffer, offset + 108u) : 0u;

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
      ecs_set_resizable(entity, 1u, 1u);
    } else if (kind == BLITZ_SHAPE_FRAME) {
      char *title = "";
      if (text_length > 0u) {
        if (!text_pool_ensure(text_length + 1u)) {
          clear_scene_state();
          return 13u;
        }
        title = &text_pool[text_pool_used];
        for (u32 i = 0u; i < text_length; i += 1u) {
          title[i] = (char)scene_file_buffer[offset + fixed_record_bytes + i];
        }
        title[text_length] = '\0';
        text_pool_used += text_length + 1u;
      }
      Color title_color = {origin_x, baseline_offset, max_width, line_height};
      float title_font_size = font_size > 0.0f ? font_size : 18.0f;
      ecs_set_rect_view(entity, fill, stroke, stroke_width);
      ecs_set_frame_view(entity, title, title_color, title_font_size);
      if (file_version < 6u) {
        set_container_component(entity, 1u);
      }
      ecs_set_resizable(entity, 1u, 1u);
    } else if (kind == BLITZ_SHAPE_TRIANGLE) {
      ecs_set_triangle_view(entity, fill, stroke, stroke_width);
      ecs_set_resizable(entity, 1u, 1u);
    } else if (kind == BLITZ_SHAPE_OVAL) {
      ecs_set_oval_view(entity, fill, stroke, stroke_width);
      ecs_set_resizable(entity, 1u, 1u);
    } else if (kind == BLITZ_SHAPE_PATH) {
      Vec2 *points = (Vec2 *)blitz_alloc((usize)text_length * sizeof(Vec2));
      if (!points) {
        clear_scene_state();
        return 13u;
      }
      for (u32 i = 0u; i < text_length; i += 1u) {
        points[i].x = read_f32(scene_file_buffer,
                               offset + fixed_record_bytes + i * 8u);
        points[i].y = read_f32(scene_file_buffer,
                               offset + fixed_record_bytes + i * 8u + 4u);
      }
      ecs_set_path_view(entity, points, text_length, fill, stroke_width);
    } else {
      if (!text_pool_ensure(text_length + 1u)) {
        clear_scene_state();
        return 13u;
      }
      char *text = &text_pool[text_pool_used];
      for (u32 i = 0u; i < text_length; i += 1u) {
        text[i] = (char)scene_file_buffer[
            offset + fixed_record_bytes + i];
      }
      text[text_length] = '\0';
      text_pool_used += text_length + 1u;
      ecs_set_text_view(entity, text, fill, font_size, origin_x,
                        baseline_offset, max_width, line_height, max_lines,
                        align);
      ecs_set_resizable(entity, 1u, 0u);
    }
    if (file_version >= 6u &&
        (stored_component_mask & BLITZ_COMPONENT_CONTAINER)) {
      set_container_component(entity, 1u);
    }
    world.masks[entity] |= BLITZ_COMPONENT_SELECTABLE;
    world.selected[entity] = 0u;
    offset += record_bytes;
  }

  // Second pass: every entity now exists, so parent object_ids resolve and the
  // relative-transform hierarchy can be re-established.
  if (file_version >= 8u) {
    offset = BLITZ_SCENE_FILE_HEADER_BYTES;
    for (u32 index = 0u; index < object_count; index += 1u) {
      u32 record_bytes = read_u32(scene_file_buffer, offset + 4u);
      ObjectId parent_id = {read_u32(scene_file_buffer, offset + 112u),
                            read_u32(scene_file_buffer, offset + 116u),
                            read_u32(scene_file_buffer, offset + 120u),
                            read_u32(scene_file_buffer, offset + 124u)};
      if (!object_id_is_zero(parent_id)) {
        ObjectId child_id = {read_u32(scene_file_buffer, offset + 80u),
                             read_u32(scene_file_buffer, offset + 84u),
                             read_u32(scene_file_buffer, offset + 88u),
                             read_u32(scene_file_buffer, offset + 8u)};
        u32 child = entity_for_object_id(child_id);
        u32 parent = entity_for_object_id(parent_id);
        attach_relative_transform(child, parent,
                                  read_f32(scene_file_buffer, offset + 128u),
                                  read_f32(scene_file_buffer, offset + 132u));
      }
      offset += record_bytes;
    }
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

// --- Public API: stress test & delete --------------------------------------
EXPORT("blitz_stress_test")
void blitz_stress_test(void) {
  history_reset_internal();
  const u32 columns = 200u;
  const u32 rows = 100u;
  const float pitch_x = 1240.0f;
  const float pitch_y = 750.0f;
  float base_x = -0.5f * (float)(columns - 1u) * pitch_x;
  float base_y = -0.5f * (float)(rows - 1u) * pitch_y;
  draw_order_normalization_deferred += 1u;
  for (u32 row = 0u; row < rows; row += 1u) {
    for (u32 col = 0u; col < columns; col += 1u) {
      slide_origin_x = base_x + (float)col * pitch_x;
      slide_origin_y = base_y + (float)row * pitch_y;
      create_demo_world();
    }
  }
  draw_order_normalization_deferred -= 1u;
  flush_draw_order_normalize();
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
  u32 history_owned = history_begin_owned();
  // Snapshot z-order so undo can put restored objects back where they were.
  history_record_order_before();
  u32 kept = 0u;
  for (u32 index = 0u; index < world.draw_order_count; index += 1u) {
    u32 entity = world.draw_order[index];
    if (world.selected[entity]) {
      history_record_deleted(entity);
      // cleanup detaches this entity's children (they survive). Record the ones
      // that aren't themselves being deleted so undo re-attaches them to the
      // restored container; a selected child is captured by its own delete.
      for (u32 child = world.first_child[entity]; child != BLITZ_INVALID_INDEX;
           child = world.next_sibling[child]) {
        if (!world.selected[child]) {
          history_record_before(child);
        }
      }
      cleanup_entity_hierarchy(entity);
      release_entity_resources(entity);
      world.masks[entity] = 0u;
      world.selected[entity] = 0u;
      free_slots[free_count] = entity;
      free_count += 1u;
      live_count -= 1u;
    } else {
      world.draw_order[kept] = entity;
      kept += 1u;
    }
  }
  world.draw_order_count = kept;
  selected_count = 0u;
  dragging_selection = 0u;
  drag_active = 0u;
  drag_top_level_count = 0u;
  resize_active = 0u;
  resize_entity = BLITZ_INVALID_INDEX;
  mark_render_list_dirty();
  if (history_owned) {
    history_commit();
  }
}

EXPORT("blitz_has_selection")
u32 blitz_has_selection(void) {
  return selected_count > 0u;
}

EXPORT("blitz_history_begin")
void blitz_history_begin(void) {
  history_begin();
}

EXPORT("blitz_history_commit")
void blitz_history_commit(void) {
  history_commit();
}

EXPORT("blitz_history_cancel")
void blitz_history_cancel(void) {
  history_cancel();
}

EXPORT("blitz_history_reset")
void blitz_history_reset(void) {
  history_reset_internal();
}

// CRDT: turn local change tracking (tombstones + broadcast queue) on or off.
EXPORT("blitz_crdt_set_enabled")
void blitz_crdt_set_enabled(u32 on) {
  crdt_collab_enabled = on ? 1u : 0u;
  if (on) {
    crdt_ever_enabled = 1u;
  }
}

// CRDT: capture local changes since the last call as an op batch in the scene
// file buffer (read via blitz_scene_file_buffer_ptr), returning its byte length.
EXPORT("blitz_crdt_capture_changes")
u32 blitz_crdt_capture_changes(void) {
  return crdt_capture_changes();
}

// CRDT: capture the whole live scene as an op batch (baseline for a joining
// peer) in the scene file buffer, returning its byte length.
EXPORT("blitz_crdt_capture_baseline")
u32 blitz_crdt_capture_baseline(void) {
  return crdt_capture_baseline();
}

// CRDT: apply an op batch the caller wrote into the scene file buffer. Returns
// the number of ops that won LWW and changed the scene.
EXPORT("blitz_crdt_apply_ops")
u32 blitz_crdt_apply_ops(u32 byte_count) {
  return crdt_apply_op_batch(scene_file_buffer, byte_count);
}

EXPORT("blitz_crdt_pending_count")
u32 blitz_crdt_pending_count(void) {
  return crdt_dirty_count;
}

// True when there are queued entity changes or a draw-order change to broadcast.
EXPORT("blitz_crdt_has_pending")
u32 blitz_crdt_has_pending(void) {
  return (crdt_dirty_count > 0u || crdt_order_dirty) ? 1u : 0u;
}

EXPORT("blitz_crdt_clock")
u32 blitz_crdt_clock(void) {
  return crdt_clock;
}

EXPORT("blitz_crdt_tombstone_count")
u32 blitz_crdt_tombstone_count(void) {
  return crdt_tombstone_count;
}

EXPORT("blitz_crdt_order_lamport")
u32 blitz_crdt_order_lamport(void) {
  return crdt_order_version.lamport;
}

// Unique id for the current undo position; 0 when nothing is on the stack.
// Stable when undo returns to a prior state, fresh when a new branch is pushed,
// so callers can use it for dirty tracking.
EXPORT("blitz_history_state_id")
u32 blitz_history_state_id(void) {
  return history_undo_count > 0u
             ? history_undo_stack[history_undo_count - 1u].epoch
             : 0u;
}

EXPORT("blitz_history_can_undo")
u32 blitz_history_can_undo(void) {
  return history_undo_count > 0u ? 1u : 0u;
}

EXPORT("blitz_history_can_redo")
u32 blitz_history_can_redo(void) {
  return history_redo_count > 0u ? 1u : 0u;
}

EXPORT("blitz_history_undo")
u32 blitz_history_undo(void) {
  if (history_undo_count == 0u) {
    return 0u;
  }
  HistoryTransaction txn = history_undo_stack[--history_undo_count];
  history_apply_transaction(&txn, 0u);
  history_redo_stack[history_redo_count++] = txn;
  return 1u;
}

EXPORT("blitz_history_redo")
u32 blitz_history_redo(void) {
  if (history_redo_count == 0u) {
    return 0u;
  }
  HistoryTransaction txn = history_redo_stack[--history_redo_count];
  history_apply_transaction(&txn, 1u);
  if (history_undo_count == BLITZ_HISTORY_MAX_STEPS) {
    history_pop_oldest(history_undo_stack, &history_undo_count);
  }
  history_undo_stack[history_undo_count++] = txn;
  return 1u;
}

// --- Public API: selection inspector ---------------------------------------
EXPORT("blitz_selected_debug_ptr")
u32 blitz_selected_debug_ptr(void) {
  world_sync_for_read();
  selected_debug_mask = 0u;
  if (selected_count != 1u) {
    return 0u;
  }
  u32 order = 0u;
  u32 entity = BLITZ_INVALID_INDEX;
  for (u32 i = 0u; i < world.draw_order_count; i += 1u) {
    if (world.selected[world.draw_order[i]]) {
      entity = world.draw_order[i];
      order = i;
      break;
    }
  }
  if (entity == BLITZ_INVALID_INDEX) {
    return 0u;
  }
  u32 mask = world.masks[entity];
  Vec2 position = world.positions[entity];
  Vec2 size = world.sizes[entity];
  Color fill = {0.0f, 0.0f, 0.0f, 0.0f};
  Color stroke = {0.0f, 0.0f, 0.0f, 0.0f};
  float stroke_width = 0.0f;
  float font_size = 0.0f;
  const char *text = 0;
  u32 kind = BLITZ_INVALID_INDEX;
  if (mask & BLITZ_COMPONENT_FRAME_VIEW) {
    RectView rect = world.rect_views[entity];
    FrameView frame = world.frame_views[entity];
    kind = BLITZ_SHAPE_FRAME;
    fill = rect.fill_color;
    stroke = rect.stroke_color;
    stroke_width = rect.stroke_width;
    font_size = frame.title_font_size;
    text = frame.title;
  } else if (mask & BLITZ_COMPONENT_RECT_VIEW) {
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
  } else if (mask & BLITZ_COMPONENT_OVAL_VIEW) {
    OvalView view = world.oval_views[entity];
    kind = BLITZ_SHAPE_OVAL;
    fill = view.fill_color;
    stroke = view.stroke_color;
    stroke_width = view.stroke_width;
  } else if (mask & BLITZ_COMPONENT_TEXT_VIEW) {
    TextView view = world.text_views[entity];
    kind = BLITZ_SHAPE_TEXT;
    fill = view.color;
    font_size = view.font_size;
    text = view.text;
  } else if (mask & BLITZ_COMPONENT_PATH_VIEW) {
    PathView view = world.path_views[entity];
    kind = BLITZ_SHAPE_PATH;
    fill = view.fill_color;
    stroke = (Color){0.0f, 0.0f, 0.0f, 0.0f}; // pens have no stroke
    stroke_width = view.stroke_width;
  }
  selected_debug_item.object_id = world.object_ids[entity];
  selected_debug_item.shape_kind = kind;
  selected_debug_item.order = order;
  selected_debug_item.selected = 1u;
  selected_debug_item.text_ptr = text ? (u32)text : 0u;
  selected_debug_item.text_length = text ? string_length(text) : 0u;
  selected_debug_item._pad0 = entity;
  selected_debug_item.bounds[0] = position.x;
  selected_debug_item.bounds[1] = position.y;
  selected_debug_item.bounds[2] = size.x;
  selected_debug_item.bounds[3] = size.y;
  selected_debug_item.fill_color[0] = fill.r;
  selected_debug_item.fill_color[1] = fill.g;
  selected_debug_item.fill_color[2] = fill.b;
  selected_debug_item.fill_color[3] = fill.a;
  selected_debug_item.stroke_color[0] = stroke.r;
  selected_debug_item.stroke_color[1] = stroke.g;
  selected_debug_item.stroke_color[2] = stroke.b;
  selected_debug_item.stroke_color[3] = stroke.a;
  selected_debug_item.style[0] = stroke_width;
  selected_debug_item.style[1] = font_size;
  selected_debug_item.style[2] =
      kind == BLITZ_SHAPE_PATH
          ? (float)(world.path_views[entity].point_count > 0u
                        ? world.path_views[entity].point_count - 1u
                        : 0u)
      : kind == BLITZ_SHAPE_TEXT
          ? world.text_views[entity].max_width
          : (kind == BLITZ_SHAPE_FRAME
                 ? world.frame_views[entity].title_color.r
                 : 0.0f);
  selected_debug_item.style[3] =
      kind == BLITZ_SHAPE_PATH
          ? (float)(path_segment_count_for(world.path_views[entity]) * 2u)
      : kind == BLITZ_SHAPE_TEXT
          ? world.text_views[entity].line_height
          : (kind == BLITZ_SHAPE_FRAME
                 ? world.frame_views[entity].title_color.g
                 : 0.0f);
  selected_debug_item.style[4] =
      kind == BLITZ_SHAPE_TEXT
          ? (float)world.text_views[entity].max_lines
          : (kind == BLITZ_SHAPE_FRAME
                 ? world.frame_views[entity].title_color.b
                 : 0.0f);
  selected_debug_item.style[5] =
      kind == BLITZ_SHAPE_TEXT
          ? (float)world.text_views[entity].align
          : (kind == BLITZ_SHAPE_FRAME
                 ? world.frame_views[entity].title_color.a
                 : 0.0f);
  if (kind == BLITZ_SHAPE_PATH) {
    selected_debug_item.style[1] = (float)world.path_views[entity].point_count;
  }
  selected_debug_item.parent_object_id = object_id_zero();
  if (mask & BLITZ_COMPONENT_RELATIVE_TRANSFORM) {
    u32 parent = world.relative_transforms[entity].parent;
    if (parent != BLITZ_INVALID_INDEX && world.masks[parent] != 0u) {
      selected_debug_item.parent_object_id = world.object_ids[parent];
    }
  }
  selected_debug_item.component_mask = mask;
  selected_debug_item.selected_subtree = 1u;
  selected_debug_mask = mask;
  return (u32)&selected_debug_item;
}

EXPORT("blitz_selected_debug_mask")
u32 blitz_selected_debug_mask(void) {
  return selected_debug_mask;
}

// Capability mask: bit 0 = geometric styles, bit 1 = text color,
// bit 2 = stroke-capable (rect/triangle/oval). Pens have a fill and width but no
// stroke, so a pen-only selection sets bit 0 without bit 2.
EXPORT("blitz_selected_style_kind")
u32 blitz_selected_style_kind(void) {
  u32 kind = 0u;
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (!world.selected[entity]) {
      continue;
    }
    if (world.masks[entity] &
        (BLITZ_COMPONENT_TEXT_VIEW | BLITZ_COMPONENT_FRAME_VIEW)) {
      kind |= 2u;
    }
    if (world.masks[entity] & (BLITZ_COMPONENT_RECT_VIEW |
                               BLITZ_COMPONENT_TRIANGLE_VIEW |
                               BLITZ_COMPONENT_OVAL_VIEW |
                               BLITZ_COMPONENT_PATH_VIEW)) {
      kind |= 1u;
    }
    if (world.masks[entity] & (BLITZ_COMPONENT_RECT_VIEW |
                               BLITZ_COMPONENT_TRIANGLE_VIEW |
                               BLITZ_COMPONENT_OVAL_VIEW)) {
      kind |= 4u;
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
  float text_max_width = 0.0f;
  float text_font_size = 0.0f;
  u32 found_geometry = 0u;
  u32 found_text = 0u;
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (!world.selected[entity]) {
      continue;
    }
    if (!found_geometry &&
        (world.masks[entity] & (BLITZ_COMPONENT_RECT_VIEW |
                                BLITZ_COMPONENT_TRIANGLE_VIEW |
                                BLITZ_COMPONENT_OVAL_VIEW |
                                BLITZ_COMPONENT_PATH_VIEW))) {
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
      } else if (world.masks[entity] & BLITZ_COMPONENT_OVAL_VIEW) {
        OvalView view = world.oval_views[entity];
        fill = view.fill_color;
        stroke = view.stroke_color;
        stroke_width = view.stroke_width;
      } else {
        PathView view = world.path_views[entity];
        fill = view.fill_color;
        stroke = (Color){0.0f, 0.0f, 0.0f, 0.0f}; // pens have no stroke
        stroke_width = view.stroke_width;
      }
    }
    if (!found_text && (world.masks[entity] & BLITZ_COMPONENT_TEXT_VIEW)) {
      found_text = 1u;
      text_color = world.text_views[entity].color;
      text_max_width = world.text_views[entity].max_width;
      text_font_size = world.text_views[entity].font_size;
    } else if (!found_text &&
               (world.masks[entity] & BLITZ_COMPONENT_FRAME_VIEW)) {
      found_text = 1u;
      text_color = world.frame_views[entity].title_color;
      text_max_width = 0.0f;
      text_font_size = world.frame_views[entity].title_font_size;
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
  selected_style[13] = text_max_width;
  selected_style[14] = text_font_size;
  return (u32)&selected_style[0];
}

EXPORT("blitz_selected_style_f32_count")
u32 blitz_selected_style_f32_count(void) {
  return 15u;
}

// --- Public API: style setters ---------------------------------------------
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
    } else if (world.masks[entity] & BLITZ_COMPONENT_OVAL_VIEW) {
      world.oval_views[entity].fill_color.r = r;
      world.oval_views[entity].fill_color.g = g;
      world.oval_views[entity].fill_color.b = b;
      changed = 1u;
    } else if (world.masks[entity] & BLITZ_COMPONENT_PATH_VIEW) {
      world.path_views[entity].fill_color.r = r;
      world.path_views[entity].fill_color.g = g;
      world.path_views[entity].fill_color.b = b;
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
    } else if (world.masks[entity] & BLITZ_COMPONENT_OVAL_VIEW) {
      world.oval_views[entity].fill_color.a = opacity;
      changed = 1u;
    } else if (world.masks[entity] & BLITZ_COMPONENT_PATH_VIEW) {
      world.path_views[entity].fill_color.a = opacity;
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
    } else if (world.masks[entity] & BLITZ_COMPONENT_OVAL_VIEW) {
      world.oval_views[entity].stroke_color.r = r;
      world.oval_views[entity].stroke_color.g = g;
      world.oval_views[entity].stroke_color.b = b;
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
    } else if (world.masks[entity] & BLITZ_COMPONENT_OVAL_VIEW) {
      world.oval_views[entity].stroke_color.a = opacity;
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
    } else if (world.masks[entity] & BLITZ_COMPONENT_OVAL_VIEW) {
      world.oval_views[entity].stroke_width = width;
      changed = 1u;
    } else if (world.masks[entity] & BLITZ_COMPONENT_PATH_VIEW) {
      world.path_views[entity].stroke_width = width;
      path_recompute_entity_bounds_preserve_world(entity);
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
    if (!world.selected[entity]) {
      continue;
    }
    if (world.masks[entity] & BLITZ_COMPONENT_TEXT_VIEW) {
      world.text_views[entity].color.r = r;
      world.text_views[entity].color.g = g;
      world.text_views[entity].color.b = b;
      changed = 1u;
    } else if (world.masks[entity] & BLITZ_COMPONENT_FRAME_VIEW) {
      world.frame_views[entity].title_color.r = r;
      world.frame_views[entity].title_color.g = g;
      world.frame_views[entity].title_color.b = b;
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

EXPORT("blitz_set_selected_text_opacity")
void blitz_set_selected_text_opacity(float opacity) {
  u32 history_owned = !history_transaction_active;
  history_record_selected_before();
  opacity = clampf(opacity, 0.0f, 1.0f);
  u32 changed = 0u;
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (!world.selected[entity]) {
      continue;
    }
    if (world.masks[entity] & BLITZ_COMPONENT_TEXT_VIEW) {
      world.text_views[entity].color.a = opacity;
      changed = 1u;
    } else if (world.masks[entity] & BLITZ_COMPONENT_FRAME_VIEW) {
      world.frame_views[entity].title_color.a = opacity;
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

EXPORT("blitz_set_selected_text_font_size")
void blitz_set_selected_text_font_size(float font_size) {
  u32 history_owned = !history_transaction_active;
  history_record_selected_before();
  font_size = clampf(font_size, 4.0f, 512.0f);
  u32 changed = 0u;
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (!world.selected[entity]) {
      continue;
    }
    if (world.masks[entity] & BLITZ_COMPONENT_FRAME_VIEW) {
      world.frame_views[entity].title_font_size = font_size;
      changed = 1u;
      continue;
    }
    if (!(world.masks[entity] & BLITZ_COMPONENT_TEXT_VIEW)) {
      continue;
    }
    TextView *view = &world.text_views[entity];
    float padding = view->origin_x;
    layout_text(view->text, font_size, view->max_width, view->line_height,
                view->max_lines);
    if (text_layout_overflow) {
      continue;
    }
    view->font_size = font_size;
    view->baseline_offset = padding + BLITZ_FONT_ASCENDER * font_size;
    world.sizes[entity].x =
        (view->max_width > 0.0f ? view->max_width : text_layout_width) +
        padding * 2.0f;
    world.sizes[entity].y = text_layout_height + padding * 2.0f;
    changed = 1u;
  }
  if (changed) {
    mark_render_list_dirty();
    if (history_owned) history_commit();
  } else {
    if (history_owned) history_cancel();
  }
}

EXPORT("blitz_set_hidden_text_entity")
void blitz_set_hidden_text_entity(u32 entity) {
  if (hidden_text_entity == entity) {
    return;
  }
  hidden_text_entity = entity;
  mark_static_dynamic_dirty();
}

EXPORT("blitz_reset_selected_text_width")
void blitz_reset_selected_text_width(void) {
  u32 history_owned = !history_transaction_active;
  history_record_selected_before();
  u32 changed = 0u;
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (!world.selected[entity] ||
        !(world.masks[entity] & BLITZ_COMPONENT_TEXT_VIEW)) {
      continue;
    }
    TextView *view = &world.text_views[entity];
    if (!(view->max_width > 0.0f)) {
      continue;
    }
    float padding = view->origin_x;
    layout_text(view->text, view->font_size, 0.0f, view->line_height,
                view->max_lines);
    view->max_width = 0.0f;
    world.sizes[entity].x = text_layout_width + padding * 2.0f;
    world.sizes[entity].y = text_layout_height + padding * 2.0f;
    changed = 1u;
  }
  if (changed) {
    mark_render_list_dirty();
    if (history_owned) history_commit();
  } else {
    if (history_owned) history_cancel();
  }
}

// --- Public API: frame title -----------------------------------------------
EXPORT("blitz_selected_frame_title_ptr")
u32 blitz_selected_frame_title_ptr(void) {
  selected_frame_title = "";
  if (selected_count != 1u) {
    return 0u;
  }
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (world.selected[entity] &&
        (world.masks[entity] & BLITZ_COMPONENT_FRAME_VIEW)) {
      selected_frame_title = world.frame_views[entity].title;
      return (u32)selected_frame_title;
    }
  }
  return 0u;
}

EXPORT("blitz_selected_frame_title_length")
u32 blitz_selected_frame_title_length(void) {
  return selected_frame_title ? string_length(selected_frame_title) : 0u;
}

EXPORT("blitz_set_selected_frame_title")
void blitz_set_selected_frame_title(u32 text_length) {
  u32 history_owned = !history_transaction_active;
  history_record_selected_before();
  const char *next_title = copy_text_input(text_length);
  if (!next_title) {
    if (history_owned) history_cancel();
    return;
  }
  u32 changed = 0u;
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (!world.selected[entity] ||
        !(world.masks[entity] & BLITZ_COMPONENT_FRAME_VIEW)) {
      continue;
    }
    world.frame_views[entity].title = next_title;
    changed = 1u;
  }
  if (changed) {
    mark_render_list_dirty();
    if (history_owned) history_commit();
  } else {
    if (history_owned) history_cancel();
  }
}

// --- Public API: ordering & selection ops ----------------------------------
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
  u32 history_owned = history_begin_owned();
  reorder_selection(0u);
  if (history_owned) {
    history_commit();
  }
}

EXPORT("blitz_send_to_back")
void blitz_send_to_back(void) {
  if (selected_count == 0u) {
    return;
  }
  u32 history_owned = history_begin_owned();
  reorder_selection(1u);
  if (history_owned) {
    history_commit();
  }
}

// --- Public API: render buffer accessors -----------------------------------
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
  world_update_for_frame();
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
  world_update_for_frame();
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
  world_update_for_frame();
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

EXPORT("blitz_oval_draw_ptr")
u32 blitz_oval_draw_ptr(void) {
  world_update_for_frame();
  return (u32)&oval_draws[0];
}

EXPORT("blitz_oval_draw_f32_count")
u32 blitz_oval_draw_f32_count(void) {
  return sizeof(OvalDraw) / sizeof(float);
}

EXPORT("blitz_oval_draw_count")
u32 blitz_oval_draw_count(void) {
  return oval_draw_count;
}

EXPORT("blitz_path_draw_ptr")
u32 blitz_path_draw_ptr(void) {
  world_update_for_frame();
  return (u32)&path_draws[0];
}

EXPORT("blitz_path_draw_f32_count")
u32 blitz_path_draw_f32_count(void) {
  return sizeof(PathDraw) / sizeof(float);
}

EXPORT("blitz_path_draw_count")
u32 blitz_path_draw_count(void) {
  return path_draw_count;
}

EXPORT("blitz_path_segment_ptr")
u32 blitz_path_segment_ptr(void) {
  world_update_for_frame();
  return (u32)&path_segments[0];
}

EXPORT("blitz_path_segment_f32_count")
u32 blitz_path_segment_f32_count(void) {
  return sizeof(PathSegment) / sizeof(float);
}

EXPORT("blitz_path_segment_count")
u32 blitz_path_segment_count(void) {
  return path_segment_count;
}

EXPORT("blitz_path_draft_segment_ptr")
u32 blitz_path_draft_segment_ptr(void) {
  return (u32)&path_draft_segments[0];
}

EXPORT("blitz_path_draft_segment_count")
u32 blitz_path_draft_segment_count(void) {
  return path_draft_segment_count;
}

EXPORT("blitz_path_draft_version")
u32 blitz_path_draft_version(void) {
  return path_draft_version;
}

EXPORT("blitz_path_draft_draw_ptr")
u32 blitz_path_draft_draw_ptr(void) {
  return (u32)&path_draft_draw;
}

EXPORT("blitz_path_shape_count")
u32 blitz_path_shape_count(void) {
  u32 count = 0u;
  for (u32 entity = 0u; entity < world.entity_count; entity += 1u) {
    if (world.masks[entity] & BLITZ_COMPONENT_PATH_VIEW) {
      count += 1u;
    }
  }
  return count;
}

EXPORT("blitz_text_draw_ptr")
u32 blitz_text_draw_ptr(void) {
  world_update_for_frame();
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

EXPORT("blitz_visible_text_shape_count")
u32 blitz_visible_text_shape_count(void) {
  world_update_for_frame();
  return visible_text_shape_count;
}

EXPORT("blitz_render_max_text_draws")
u32 blitz_render_max_text_draws(void) {
  return BLITZ_MAX_TEXT_DRAWS;
}

EXPORT("blitz_dyn_command_ptr")
u32 blitz_dyn_command_ptr(void) {
  world_update_for_frame();
  return (u32)&dyn_commands[0];
}

EXPORT("blitz_dyn_command_count")
u32 blitz_dyn_command_count(void) {
  return dyn_command_count;
}

EXPORT("blitz_dyn_overlay_command_start")
u32 blitz_dyn_overlay_command_start(void) {
  return dyn_overlay_command_start;
}

EXPORT("blitz_dyn_version")
u32 blitz_dyn_version(void) {
  return dyn_version;
}

EXPORT("blitz_dyn_rect_ptr")
u32 blitz_dyn_rect_ptr(void) {
  world_update_for_frame();
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

// --- Public API: stats & limits --------------------------------------------
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
                   (u32)sizeof(OvalView) + (u32)sizeof(TextView) +
                   (u32)sizeof(RelativeTransform) + 7u * (u32)sizeof(u32);
  u32 entity_bytes = world.entity_count * per_entity;
  u32 draw_bytes = shape_command_count * (u32)sizeof(ShapeCommand) +
                   rect_draw_count * (u32)sizeof(RectDraw) +
                   triangle_draw_count * (u32)sizeof(TriangleDraw) +
                   oval_draw_count * (u32)sizeof(OvalDraw) +
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
