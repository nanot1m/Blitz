import { createCanvasMcpAdapter } from "./mcp/canvas-adapter";
import { setupMcpBridge } from "./mcp/bridge";
import {
  attachColorPopover,
  setupCanvasInteractions,
  setupKeyboardShortcuts,
  setupStyleControls,
  setupUiActions,
} from "./input/user-events";
import shaderSource from "./shaders/rect.wgsl?raw";
import cullSource from "./shaders/cull.wgsl?raw";
import backgroundSource from "./shaders/background.wgsl?raw";
import { setupSceneFileStorage } from "./storage/scene-file";
import { getOrCreateActorId } from "./storage/actor-id";
import { createWasmHistory } from "./history/wasm-history";
import {
  setupWsCollaboration,
  type CollaborationController,
} from "./collaboration/ws-collaboration";
import { createRemoteCursors } from "./collaboration/remote-cursors";
import { createBlitzUi } from "./ui";
import "./style.css";
type BlitzExports = {
  memory: WebAssembly.Memory;
  blitz_init(): void;
  blitz_set_actor_id(actorHi: number, actorLo: number): void;
  blitz_last_created_object_id_ptr(): number;
  blitz_resize(width: number, height: number): void;
  blitz_set_camera(x: number, y: number, zoom: number): void;
  blitz_pan(dxPixels: number, dyPixels: number): void;
  blitz_zoom_at(screenX: number, screenY: number, zoomDelta: number): void;
  blitz_hit_test(screenX: number, screenY: number): number;
  blitz_resize_mode_at(screenX: number, screenY: number): number;
  blitz_resize_cursor_angle_at(screenX: number, screenY: number): number;
  blitz_pointer_down(
    screenX: number,
    screenY: number,
    additive: number,
  ): number;
  blitz_begin_marquee(screenX: number, screenY: number): void;
  blitz_pointer_move(screenX: number, screenY: number): void;
  blitz_pointer_up(): void;
  blitz_add_rect(): void;
  blitz_add_frame(): void;
  blitz_add_circle(): void;
  blitz_add_oval(): void;
  blitz_add_triangle(): void;
  blitz_add_text(): void;
  blitz_duplicate_selected(offsetX: number, offsetY: number): number;
  blitz_copy_selected_to_internal_clipboard(): number;
  blitz_internal_clipboard_bounds_ptr(): number;
  blitz_internal_clipboard_count(): number;
  blitz_paste_internal_clipboard(offsetX: number, offsetY: number): number;
  blitz_clear_scene(): void;
  blitz_load_demo_template(): void;
  blitz_set_container(
    actorHi: number,
    actorLo: number,
    sequenceHi: number,
    sequenceLo: number,
    enabled: number,
  ): number;
  blitz_set_relative_transform(
    childActorHi: number,
    childActorLo: number,
    childSequenceHi: number,
    childSequenceLo: number,
    parentActorHi: number,
    parentActorLo: number,
    parentSequenceHi: number,
    parentSequenceLo: number,
    offsetX: number,
    offsetY: number,
  ): number;
  blitz_set_rotation(
    actorHi: number,
    actorLo: number,
    sequenceHi: number,
    sequenceLo: number,
    rotation: number,
  ): number;
  blitz_create_rect(
    x: number,
    y: number,
    width: number,
    height: number,
    fillR: number,
    fillG: number,
    fillB: number,
    fillA: number,
    strokeR: number,
    strokeG: number,
    strokeB: number,
    strokeA: number,
    strokeWidth: number,
  ): number;
  blitz_create_frame(
    x: number,
    y: number,
    width: number,
    height: number,
    fillR: number,
    fillG: number,
    fillB: number,
    fillA: number,
    strokeR: number,
    strokeG: number,
    strokeB: number,
    strokeA: number,
    strokeWidth: number,
    titleR: number,
    titleG: number,
    titleB: number,
    titleA: number,
    titleFontSize: number,
    titleLength: number,
  ): number;
  blitz_create_circle(
    centerX: number,
    centerY: number,
    radius: number,
    fillR: number,
    fillG: number,
    fillB: number,
    fillA: number,
    strokeR: number,
    strokeG: number,
    strokeB: number,
    strokeA: number,
    strokeWidth: number,
  ): number;
  blitz_create_oval(
    x: number,
    y: number,
    width: number,
    height: number,
    fillR: number,
    fillG: number,
    fillB: number,
    fillA: number,
    strokeR: number,
    strokeG: number,
    strokeB: number,
    strokeA: number,
    strokeWidth: number,
  ): number;
  blitz_create_triangle(
    x: number,
    y: number,
    width: number,
    height: number,
    fillR: number,
    fillG: number,
    fillB: number,
    fillA: number,
    strokeR: number,
    strokeG: number,
    strokeB: number,
    strokeA: number,
    strokeWidth: number,
  ): number;
  blitz_create_path(
    pointCount: number,
    fillR: number,
    fillG: number,
    fillB: number,
    fillA: number,
    strokeWidth: number,
  ): number;
  blitz_text_input_ptr(): number;
  blitz_text_input_capacity(): number;
  blitz_path_input_ptr(): number;
  blitz_path_input_capacity(): number;
  blitz_update_path_draft(
    pointCount: number,
    fillR: number,
    fillG: number,
    fillB: number,
    fillA: number,
    strokeWidth: number,
  ): number;
  blitz_clear_path_draft(): void;
  blitz_measure_text_width(textLength: number, fontSize: number): number;
  blitz_layout_text(
    textLength: number,
    fontSize: number,
    maxWidth: number,
    lineHeight: number,
    maxLines: number,
  ): number;
  blitz_text_layout_ptr(): number;
  blitz_text_layout_line_bytes(): number;
  blitz_text_layout_width(): number;
  blitz_text_layout_height(): number;
  blitz_text_layout_overflow(): number;
  blitz_font_ascender(): number;
  blitz_font_descender(): number;
  blitz_font_line_height(): number;
  blitz_font_cap_height(): number;
  blitz_font_x_height(): number;
  blitz_font_glyph_count(): number;
  blitz_font_glyph_codepoint(index: number): number;
  blitz_create_text(
    x: number,
    y: number,
    fontSize: number,
    colorR: number,
    colorG: number,
    colorB: number,
    colorA: number,
    textLength: number,
    maxWidth: number,
    lineHeight: number,
    maxLines: number,
    align: number,
  ): number;
  blitz_update_object(...args: number[]): number;
  blitz_query_scene(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    limit: number,
  ): number;
  blitz_scene_query_ptr(): number;
  blitz_scene_query_item_bytes(): number;
  blitz_scene_query_count(): number;
  blitz_scene_query_total(): number;
  blitz_scene_file_buffer_ptr(): number;
  blitz_scene_file_buffer_capacity(): number;
  blitz_scene_file_buffer_reserve(bytes: number): number;
  blitz_scene_revision(): number;
  blitz_capture_start_viewpoint(): void;
  blitz_scene_serialize(): number;
  blitz_scene_deserialize(byteCount: number): number;
  blitz_history_begin(): void;
  blitz_history_commit(): void;
  blitz_history_cancel(): void;
  blitz_history_reset(): void;
  blitz_history_undo(): number;
  blitz_history_redo(): number;
  blitz_history_can_undo(): number;
  blitz_history_can_redo(): number;
  blitz_history_state_id(): number;
  blitz_crdt_set_enabled(on: number): void;
  blitz_crdt_capture_changes(): number;
  blitz_crdt_capture_baseline(): number;
  blitz_crdt_apply_ops(byteCount: number): number;
  blitz_crdt_pending_count(): number;
  blitz_crdt_has_pending(): number;
  blitz_crdt_clock(): number;
  blitz_stress_test(): void;
  blitz_clear_selection(): void;
  blitz_select_object(
    actorHi: number,
    actorLo: number,
    sequenceHi: number,
    sequenceLo: number,
    additive: number,
  ): number;
  blitz_set_selected_container(enabled: number): number;
  blitz_selected_container_state(): number;
  blitz_delete_selected(): void;
  blitz_has_selection(): number;
  blitz_selected_debug_ptr(): number;
  blitz_selected_debug_mask(): number;
  blitz_selected_style_kind(): number;
  blitz_selected_style_ptr(): number;
  blitz_selected_style_f32_count(): number;
  blitz_set_selected_fill(red: number, green: number, blue: number): void;
  blitz_set_selected_fill_opacity(opacity: number): void;
  blitz_set_selected_stroke(red: number, green: number, blue: number): void;
  blitz_set_selected_stroke_opacity(opacity: number): void;
  blitz_set_selected_stroke_width(width: number): void;
  blitz_set_selected_text_color(red: number, green: number, blue: number): void;
  blitz_set_selected_text_opacity(opacity: number): void;
  blitz_set_selected_text_font_size(fontSize: number): void;
  blitz_selected_frame_title_ptr(): number;
  blitz_selected_frame_title_length(): number;
  blitz_set_selected_frame_title(textLength: number): void;
  blitz_set_hidden_text_entity(entity: number): void;
  blitz_reset_selected_text_width(): void;
  blitz_select_all(): void;
  blitz_bring_to_front(): void;
  blitz_send_to_back(): void;
  blitz_uniform_ptr(): number;
  blitz_uniform_f32_count(): number;
  blitz_shape_command_ptr(): number;
  blitz_shape_command_u32_count(): number;
  blitz_shape_command_count(): number;
  blitz_shape_command_version(): number;
  blitz_rect_draw_ptr(): number;
  blitz_rect_draw_f32_count(): number;
  blitz_rect_draw_count(): number;
  blitz_triangle_draw_ptr(): number;
  blitz_triangle_draw_f32_count(): number;
  blitz_triangle_draw_count(): number;
  blitz_oval_draw_ptr(): number;
  blitz_oval_draw_f32_count(): number;
  blitz_oval_draw_count(): number;
  blitz_path_draw_ptr(): number;
  blitz_path_draw_f32_count(): number;
  blitz_path_draw_count(): number;
  blitz_path_segment_ptr(): number;
  blitz_path_segment_f32_count(): number;
  blitz_path_segment_count(): number;
  blitz_path_draft_segment_ptr(): number;
  blitz_path_draft_segment_count(): number;
  blitz_path_draft_version(): number;
  blitz_path_draft_draw_ptr(): number;
  blitz_path_shape_count(): number;
  blitz_text_draw_ptr(): number;
  blitz_text_draw_f32_count(): number;
  blitz_text_draw_count(): number;
  blitz_visible_text_shape_count(): number;
  blitz_dyn_command_ptr(): number;
  blitz_dyn_command_count(): number;
  blitz_dyn_overlay_command_start(): number;
  blitz_dyn_version(): number;
  blitz_dyn_rect_ptr(): number;
  blitz_dyn_rect_count(): number;
  blitz_render_max_dyn_commands(): number;
  blitz_render_max_dyn_rects(): number;
  blitz_entity_count(): number;
  blitz_selected_count(): number;
  blitz_wasm_live_bytes(): number;
  blitz_render_chunk_rects(): number;
  blitz_render_max_shapes(): number;
  blitz_render_max_text_draws(): number;
};
const blitzShapeText = 3;
const blitzShapeRect = 0;
const blitzShapeTriangle = 1;
const blitzShapeOval = 2;
const blitzShapeFrame = 4;
const blitzUpdateGeometry = 1 | 2 | 4 | 8;
const blitzUpdateText = 128;
const blitzInvalidIndex = 0xffffffff;
const textPaddingWorld = 4;
const textEditorBorderPx = 1;
const textCaretViewportMargin = 36;
const ui = createBlitzUi();
async function loadWasm(): Promise<BlitzExports> {
  const response = await fetch(`${import.meta.env.BASE_URL}blitz.wasm`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Run `npm run build:wasm` before starting Blitz.");
  }
  const module = await WebAssembly.instantiateStreaming(response, {});
  return module.instance.exports as BlitzExports;
}

function readSceneFileBuffer(wasm: BlitzExports, byteCount: number): Uint8Array {
  return new Uint8Array(
    wasm.memory.buffer,
    wasm.blitz_scene_file_buffer_ptr(),
    byteCount,
  ).slice();
}

function applyCrdtOps(wasm: BlitzExports, bytes: Uint8Array): void {
  const ptr = wasm.blitz_scene_file_buffer_reserve(bytes.byteLength);
  if (ptr === 0) {
    throw new Error("The collaboration update is too large to apply.");
  }
  new Uint8Array(wasm.memory.buffer, ptr, bytes.byteLength).set(bytes);
  wasm.blitz_crdt_apply_ops(bytes.byteLength);
}
async function boot() {
  if (!navigator.gpu) {
    ui.showFallback("WebGPU is not available in this browser.");
    return;
  }
  const wasm = await loadWasm();
  wasm.blitz_init();
  const actorId = getOrCreateActorId();
  wasm.blitz_set_actor_id(actorId.hi, actorId.lo);
  const adapter = await navigator.gpu.requestAdapter();
  // Raise buffer limits to the adapter's max (the default cap is 128 MiB, which
  // a scene with many pen strokes can exceed).
  const device = await adapter?.requestDevice(
    adapter
      ? {
          requiredLimits: {
            maxBufferSize: adapter.limits.maxBufferSize,
            maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
          },
        }
      : undefined,
  );
  if (!device) {
    ui.showFallback("No WebGPU adapter is available.");
    return;
  }
  const context = ui.canvas.getContext("webgpu");
  if (!context) {
    ui.showFallback("Could not create a WebGPU canvas context.");
    return;
  }
  const format = navigator.gpu.getPreferredCanvasFormat();
  const depthFormat: GPUTextureFormat = "depth32float";
  const msaaSampleCount = 4;
  context.configure({
    device,
    format,
    alphaMode: "opaque",
  });
  const uniformPtr = wasm.blitz_uniform_ptr();
  const uniformByteLength =
    wasm.blitz_uniform_f32_count() * Float32Array.BYTES_PER_ELEMENT;
  const uniformBuffer = device.createBuffer({
    label: "Blitz Uniforms",
    size: uniformByteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const maxShapes = wasm.blitz_render_max_shapes();
  const maxPathSegments = maxShapes * 18;
  const maxTextDraws = wasm.blitz_render_max_text_draws();
  const maxDynCommands = wasm.blitz_render_max_dyn_commands();
  const maxDynRects = wasm.blitz_render_max_dyn_rects();
  const shapeCommandU32Count = wasm.blitz_shape_command_u32_count();
  const rectDrawF32Count = wasm.blitz_rect_draw_f32_count();
  const triangleDrawF32Count = wasm.blitz_triangle_draw_f32_count();
  const ovalDrawF32Count = wasm.blitz_oval_draw_f32_count();
  const pathDrawF32Count = wasm.blitz_path_draw_f32_count();
  const pathSegmentF32Count = wasm.blitz_path_segment_f32_count();
  const textDrawF32Count = wasm.blitz_text_draw_f32_count();
  const shapeCommandStride = shapeCommandU32Count * Uint32Array.BYTES_PER_ELEMENT;
  const rectDrawStride = rectDrawF32Count * Float32Array.BYTES_PER_ELEMENT;
  const triangleDrawStride = triangleDrawF32Count * Float32Array.BYTES_PER_ELEMENT;
  const ovalDrawStride = ovalDrawF32Count * Float32Array.BYTES_PER_ELEMENT;
  const pathDrawStride = pathDrawF32Count * Float32Array.BYTES_PER_ELEMENT;
  const pathSegmentStride = pathSegmentF32Count * Float32Array.BYTES_PER_ELEMENT;
  const textDrawStride = textDrawF32Count * Float32Array.BYTES_PER_ELEMENT;
  // Storage buffers start small and grow on demand toward the capacity ceilings
  // above, so GPU memory tracks scene size instead of reserving for the maximum.
  const initialStorageCapacity = 1024;
  const atlasResponse = await fetch(
    `${import.meta.env.BASE_URL}font-atlas.png`,
  );
  if (!atlasResponse.ok) {
    throw new Error("Font atlas could not be loaded.");
  }
  const atlasBitmap = await createImageBitmap(await atlasResponse.blob());
  const fontAtlasTexture = device.createTexture({
    label: "Blitz Font Atlas",
    size: [atlasBitmap.width, atlasBitmap.height],
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture(
    { source: atlasBitmap },
    { texture: fontAtlasTexture },
    [atlasBitmap.width, atlasBitmap.height],
  );
  atlasBitmap.close();
  const fontSampler = device.createSampler({
    label: "Blitz Font Sampler",
    magFilter: "linear",
    minFilter: "linear",
  });
  const shader = device.createShaderModule({
    label: "Blitz Shape Shader",
    code: shaderSource,
  });
  const pathCompositeShader = device.createShaderModule({
    label: "Blitz Path Composite Shader",
    code: `
struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vertex_main(@builtin(vertex_index) vertex_index: u32) -> VertexOut {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0),
  );
  let position = positions[vertex_index];
  var out: VertexOut;
  out.position = vec4f(position, 0.0, 1.0);
  out.uv = position * vec2f(0.5, -0.5) + vec2f(0.5);
  return out;
}

@group(0) @binding(0)
var path_texture: texture_2d<f32>;

@group(0) @binding(1)
var path_sampler: sampler;

@fragment
fn fragment_main(in: VertexOut) -> @location(0) vec4f {
  return textureSample(path_texture, path_sampler, in.uv);
}
`,
  });
  const backgroundShader = device.createShaderModule({
    label: "Blitz Background Shader",
    code: backgroundSource,
  });
  const backgroundBindGroupLayout = device.createBindGroupLayout({
    label: "Blitz Background Bind Group Layout",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: "uniform" },
      },
    ],
  });
  const backgroundPipeline = device.createRenderPipeline({
    label: "Blitz Background Pipeline",
    layout: device.createPipelineLayout({
      label: "Blitz Background Pipeline Layout",
      bindGroupLayouts: [backgroundBindGroupLayout],
    }),
    vertex: {
      module: backgroundShader,
      entryPoint: "background_vertex_main",
    },
    fragment: {
      module: backgroundShader,
      entryPoint: "background_fragment_main",
      targets: [{ format }],
    },
    primitive: {
      topology: "triangle-list",
    },
    depthStencil: {
      format: depthFormat,
      depthWriteEnabled: false,
      depthCompare: "always",
    },
  });
  const bindGroupLayout = device.createBindGroupLayout({
    label: "Blitz Shape Bind Group Layout",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: "uniform" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 4,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 5,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 6,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: "float" },
      },
      {
        binding: 7,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: "filtering" },
      },
      {
        binding: 8,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 9,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: "read-only-storage" },
      },
    ],
  });
  const pipelineLayout = device.createPipelineLayout({
    label: "Blitz Shape Pipeline Layout",
    bindGroupLayouts: [bindGroupLayout],
  });
  const shapePipeline = device.createRenderPipeline({
    label: "Blitz Shape Pipeline",
    layout: pipelineLayout,
    vertex: {
      module: shader,
      entryPoint: "shape_vertex_main",
    },
    fragment: {
      module: shader,
      entryPoint: "shape_fragment_main",
      targets: [
        {
          format,
          blend: {
            color: {
              srcFactor: "src-alpha",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
          },
        },
      ],
    },
    primitive: {
      topology: "triangle-list",
    },
    depthStencil: {
      format: depthFormat,
      depthWriteEnabled: true,
      depthCompare: "greater-equal",
    },
  });
  const shapeMsaaDepthPipeline = device.createRenderPipeline({
    label: "Blitz Shape MSAA Depth Pipeline",
    layout: pipelineLayout,
    vertex: {
      module: shader,
      entryPoint: "shape_vertex_main",
    },
    fragment: {
      module: shader,
      entryPoint: "shape_fragment_main",
      targets: [
        {
          format,
          writeMask: 0,
        },
      ],
    },
    primitive: {
      topology: "triangle-list",
    },
    depthStencil: {
      format: depthFormat,
      depthWriteEnabled: true,
      depthCompare: "greater-equal",
    },
    multisample: {
      count: msaaSampleCount,
    },
  });
  const pathPipeline = device.createRenderPipeline({
    label: "Blitz Path Pipeline",
    layout: pipelineLayout,
    vertex: {
      module: shader,
      entryPoint: "path_vertex_main",
    },
    fragment: {
      module: shader,
      entryPoint: "path_fragment_main",
      targets: [
        {
          format,
          blend: {
            color: {
              srcFactor: "src-alpha",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
          },
        },
      ],
    },
    primitive: {
      topology: "triangle-list",
    },
    depthStencil: {
      // Depth-write on with binary coverage: each pixel is owned by one capsule
      // (first writer wins), so the union is clean, translucency blends once, and
      // pens z-order correctly against shapes and text.
      format: depthFormat,
      depthWriteEnabled: true,
      depthCompare: "greater",
    },
    multisample: {
      count: msaaSampleCount,
    },
  });
  const pathCompositeBindGroupLayout = device.createBindGroupLayout({
    label: "Blitz Path Composite Bind Group Layout",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: "float" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: "filtering" },
      },
    ],
  });
  const pathCompositePipeline = device.createRenderPipeline({
    label: "Blitz Path Composite Pipeline",
    layout: device.createPipelineLayout({
      label: "Blitz Path Composite Pipeline Layout",
      bindGroupLayouts: [pathCompositeBindGroupLayout],
    }),
    vertex: {
      module: pathCompositeShader,
      entryPoint: "vertex_main",
    },
    fragment: {
      module: pathCompositeShader,
      entryPoint: "fragment_main",
      targets: [
        {
          format,
          blend: {
            color: {
              srcFactor: "src-alpha",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
          },
        },
      ],
    },
    primitive: {
      topology: "triangle-list",
    },
  });
  const cullShader = device.createShaderModule({
    label: "Blitz Cull Shader",
    code: cullSource,
  });
  const cullBindGroupLayout = device.createBindGroupLayout({
    label: "Blitz Cull Bind Group Layout",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "uniform" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 4,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 5,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" },
      },
      {
        binding: 6,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" },
      },
      {
        binding: 7,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
    ],
  });
  const cullPipeline = device.createComputePipeline({
    label: "Blitz Cull Pipeline",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [cullBindGroupLayout],
    }),
    compute: { module: cullShader, entryPoint: "cull_main" },
  });
  let shapeCommandCapacity = initialStorageCapacity;
  let visibleCommandCapacity = initialStorageCapacity;
  let rectCapacity = initialStorageCapacity;
  let triangleCapacity = initialStorageCapacity;
  let ovalCapacity = initialStorageCapacity;
  let pathCapacity = initialStorageCapacity;
  let pathSegmentCapacity = initialStorageCapacity;
  let textCapacity = initialStorageCapacity;
  let dynCommandCapacity = initialStorageCapacity;
  let dynRectCapacity = initialStorageCapacity;
  const storageDstUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
  let shapeCommandStorageBuffer = device.createBuffer({
    label: "Blitz Shape Command Storage",
    size: shapeCommandCapacity * shapeCommandStride,
    usage: storageDstUsage,
  });
  let rectStorageBuffer = device.createBuffer({
    label: "Blitz Rect Draw Storage",
    size: rectCapacity * rectDrawStride,
    usage: storageDstUsage,
  });
  let triangleStorageBuffer = device.createBuffer({
    label: "Blitz Triangle Draw Storage",
    size: triangleCapacity * triangleDrawStride,
    usage: storageDstUsage,
  });
  let ovalStorageBuffer = device.createBuffer({
    label: "Blitz Oval Draw Storage",
    size: ovalCapacity * ovalDrawStride,
    usage: storageDstUsage,
  });
  let pathStorageBuffer = device.createBuffer({
    label: "Blitz Path Draw Storage",
    size: pathCapacity * pathDrawStride,
    usage: storageDstUsage,
  });
  let pathSegmentStorageBuffer = device.createBuffer({
    label: "Blitz Path Segment Storage",
    size: pathSegmentCapacity * pathSegmentStride,
    usage: storageDstUsage,
  });
  // The in-progress pen draft: its own tiny segment buffer + one draw record,
  // uploaded independently so editing it never re-uploads the static stream.
  let draftSegmentCapacity = initialStorageCapacity;
  let draftSegmentBuffer = device.createBuffer({
    label: "Blitz Draft Segment Storage",
    size: draftSegmentCapacity * pathSegmentStride,
    usage: storageDstUsage,
  });
  const draftDrawBuffer = device.createBuffer({
    label: "Blitz Draft Draw Storage",
    size: pathDrawStride,
    usage: storageDstUsage,
  });
  let textStorageBuffer = device.createBuffer({
    label: "Blitz Text Draw Storage",
    size: textCapacity * textDrawStride,
    usage: storageDstUsage,
  });
  // Compute-cull output: compacted visible static commands + indirect draw args.
  let visibleCommandStorageBuffer = device.createBuffer({
    label: "Blitz Visible Command Storage",
    size: visibleCommandCapacity * shapeCommandStride,
    usage: GPUBufferUsage.STORAGE,
  });
  const drawArgsBuffer = device.createBuffer({
    label: "Blitz Draw Args",
    size: 4 * Uint32Array.BYTES_PER_ELEMENT,
    usage:
      GPUBufferUsage.STORAGE |
      GPUBufferUsage.INDIRECT |
      GPUBufferUsage.COPY_DST |
      GPUBufferUsage.COPY_SRC,
  });
  // Reads back the post-cull visible instance count for the stats panel.
  const drawArgsReadback = device.createBuffer({
    label: "Blitz Draw Args Readback",
    size: 4 * Uint32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  let dynCommandStorageBuffer = device.createBuffer({
    label: "Blitz Dynamic Command Storage",
    size: dynCommandCapacity * shapeCommandStride,
    usage: storageDstUsage,
  });
  let dynRectStorageBuffer = device.createBuffer({
    label: "Blitz Dynamic Rect Storage",
    size: dynRectCapacity * rectDrawStride,
    usage: storageDstUsage,
  });
  const backgroundBindGroup = device.createBindGroup({
    label: "Blitz Background Bind Group",
    layout: backgroundBindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });
  const fontAtlasView = fontAtlasTexture.createView();
  let cullBindGroup!: GPUBindGroup;
  let staticRenderBindGroup!: GPUBindGroup;
  let draftRenderBindGroup!: GPUBindGroup;
  let dynamicRenderBindGroup!: GPUBindGroup;
  // Bind groups capture the specific buffer objects they reference, so they are
  // rebuilt whenever a storage buffer grows. The dynamic pass's triangle/oval
  // and the static pass's text bindings are unused but required by the layout.
  const rebuildBindGroups = () => {
    cullBindGroup = device.createBindGroup({
      label: "Blitz Cull Bind Group",
      layout: cullBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: shapeCommandStorageBuffer } },
        { binding: 2, resource: { buffer: rectStorageBuffer } },
        { binding: 3, resource: { buffer: triangleStorageBuffer } },
        { binding: 4, resource: { buffer: ovalStorageBuffer } },
        { binding: 5, resource: { buffer: visibleCommandStorageBuffer } },
        { binding: 6, resource: { buffer: drawArgsBuffer } },
        { binding: 7, resource: { buffer: textStorageBuffer } },
      ],
    });
    staticRenderBindGroup = device.createBindGroup({
      label: "Blitz Static Render Bind Group",
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: visibleCommandStorageBuffer } },
        { binding: 2, resource: { buffer: rectStorageBuffer } },
        { binding: 3, resource: { buffer: triangleStorageBuffer } },
        { binding: 4, resource: { buffer: ovalStorageBuffer } },
        { binding: 5, resource: { buffer: textStorageBuffer } },
        { binding: 6, resource: fontAtlasView },
        { binding: 7, resource: fontSampler },
        { binding: 8, resource: { buffer: pathStorageBuffer } },
        { binding: 9, resource: { buffer: pathSegmentStorageBuffer } },
      ],
    });
    dynamicRenderBindGroup = device.createBindGroup({
      label: "Blitz Dynamic Render Bind Group",
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: dynCommandStorageBuffer } },
        { binding: 2, resource: { buffer: dynRectStorageBuffer } },
        { binding: 3, resource: { buffer: triangleStorageBuffer } },
        { binding: 4, resource: { buffer: ovalStorageBuffer } },
        { binding: 5, resource: { buffer: textStorageBuffer } },
        { binding: 6, resource: fontAtlasView },
        { binding: 7, resource: fontSampler },
        { binding: 8, resource: { buffer: pathStorageBuffer } },
        { binding: 9, resource: { buffer: pathSegmentStorageBuffer } },
      ],
    });
    // Same layout as the static render group, but binding 8/9 point at the
    // draft's own draw record + segment buffer.
    draftRenderBindGroup = device.createBindGroup({
      label: "Blitz Draft Render Bind Group",
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: visibleCommandStorageBuffer } },
        { binding: 2, resource: { buffer: rectStorageBuffer } },
        { binding: 3, resource: { buffer: triangleStorageBuffer } },
        { binding: 4, resource: { buffer: ovalStorageBuffer } },
        { binding: 5, resource: { buffer: textStorageBuffer } },
        { binding: 6, resource: fontAtlasView },
        { binding: 7, resource: fontSampler },
        { binding: 8, resource: { buffer: draftDrawBuffer } },
        { binding: 9, resource: { buffer: draftSegmentBuffer } },
      ],
    });
  };
  rebuildBindGroups();
  // Grow a storage buffer (destroy + recreate larger) when a draw count exceeds
  // its capacity. WebGPU defers the actual free until in-flight work referencing
  // the old buffer completes, so destroying immediately is safe.
  // Hard ceiling so a single buffer never exceeds what the device can bind,
  // even if the scene wants more — callers clamp draw/upload counts to capacity.
  const maxStorageElements = (stride: number) =>
    Math.floor(
      Math.min(
        device.limits.maxBufferSize,
        device.limits.maxStorageBufferBindingSize,
      ) / stride,
    );
  const ensureStorage = (
    buffer: GPUBuffer,
    capacity: number,
    needed: number,
    ceiling: number,
    stride: number,
    usage: number,
    label: string,
  ): { buffer: GPUBuffer; capacity: number; grew: boolean } => {
    if (needed <= capacity) return { buffer, capacity, grew: false };
    let next = capacity;
    while (next < needed) next *= 2;
    next = Math.min(next, ceiling, maxStorageElements(stride));
    buffer.destroy();
    return {
      buffer: device.createBuffer({ label, size: next * stride, usage }),
      capacity: next,
      grew: true,
    };
  };
  // Sum of the currently-allocated GPU buffer sizes, for the stats panel
  // (excludes the resize-dependent depth texture, reported separately).
  const gpuBufferBytes = () =>
    uniformByteLength +
    (shapeCommandCapacity + visibleCommandCapacity) * shapeCommandStride +
    rectCapacity * rectDrawStride +
    triangleCapacity * triangleDrawStride +
    ovalCapacity * ovalDrawStride +
    pathCapacity * pathDrawStride +
    pathSegmentCapacity * pathSegmentStride +
    textCapacity * textDrawStride +
    dynCommandCapacity * shapeCommandStride +
    dynRectCapacity * rectDrawStride +
    2 * 4 * Uint32Array.BYTES_PER_ELEMENT;
  let lastUploadedShapeCommandVersion = -1;
  let currentShapeCommandCount = 0;
  // Per-stroke world AABB + LOD tier segment ranges, rebuilt on upload. The draw
  // loop viewport-culls these and draws one tier per visible stroke.
  type PathDrawCull = {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    dragged: boolean;
    fullOffset: number;
    fullCount: number;
    coarseOffset: number;
    coarseCount: number;
  };
  let pathDrawList: PathDrawCull[] = [];
  let lastUploadedDraftVersion = -1;
  let currentDraftSegmentCount = 0;
  let lastUploadedDynVersion = -1;
  let currentDynCommandCount = 0;
  let currentDynOverlayCommandStart = 0;
  let lastZoomPercent = -1;
  const drawArgsReset = new Uint32Array([6, 0, 0, 0]);
  let statsVisible = false;
  let gridVisible = true;
  const BACKGROUND_THEME_STORAGE_KEY = "blitz:background-theme";
  type BackgroundTheme = "dark" | "paper";
  const readBackgroundTheme = (): BackgroundTheme => {
    try {
      return localStorage.getItem(BACKGROUND_THEME_STORAGE_KEY) === "dark"
        ? "dark"
        : "paper";
    } catch {
      return "paper";
    }
  };
  const persistBackgroundTheme = (theme: BackgroundTheme) => {
    try {
      localStorage.setItem(BACKGROUND_THEME_STORAGE_KEY, theme);
    } catch {
      // localStorage unavailable; the theme still applies for this session.
    }
  };
  const backgroundColors: Record<BackgroundTheme, readonly [number, number, number, number]> = {
    dark: [0.058, 0.075, 0.092, 1],
    paper: [0.965, 0.949, 0.91, 1],
  };
  let backgroundTheme = readBackgroundTheme();
  const syncBackgroundThemeUi = () => {
    document.body.dataset.backgroundTheme = backgroundTheme;
    ui.toggleBackgroundThemeButton.setAttribute(
      "aria-pressed",
      backgroundTheme === "paper" ? "true" : "false",
    );
  };
  syncBackgroundThemeUi();
  let frameMs = 16;
  let lastFrameStamp = 0;
  let lastStatsAt = 0;
  let visibleGeometryShapeCount = 0;
  let readbackPending = false;
  const formatBytes = (bytes: number) => {
    if (bytes >= 1 << 30) return `${(bytes / (1 << 30)).toFixed(1)} GB`;
    if (bytes >= 1 << 20) return `${(bytes / (1 << 20)).toFixed(1)} MB`;
    if (bytes >= 1 << 10) return `${(bytes / (1 << 10)).toFixed(1)} KB`;
    return `${bytes} B`;
  };
  const formatNumber = (value: number) => value.toLocaleString();
  const formatPercent = (value: number) => `${value}%`;
  const metricRow = (label: string, value: string) =>
    `<div class="stats-row"><span>${label}</span><strong>${value}</strong></div>`;
  const statsBreakdown = (items: Array<[string, string]>) =>
    `<div class="stats-breakdown">${items
      .map(
        ([label, value]) =>
          `<span><em>${label}</em><strong>${value}</strong></span>`,
      )
      .join("")}</div>`;
  const updateStats = () => {
    // Keep lazy WASM extraction current before reading render counters.
    wasm.blitz_shape_command_ptr();
    wasm.blitz_dyn_command_ptr();
    const shapeCount = wasm.blitz_entity_count();
    const rectShapeCount = wasm.blitz_rect_draw_count();
    const triangleShapeCount = wasm.blitz_triangle_draw_count();
    const ovalShapeCount = wasm.blitz_oval_draw_count();
    const pathShapeCount = wasm.blitz_path_shape_count();
    const pathSegmentCount = wasm.blitz_path_segment_count();
    const geometryShapeCount =
      rectShapeCount + triangleShapeCount + ovalShapeCount + pathShapeCount;
    const textShapeCount = Math.max(0, shapeCount - geometryShapeCount);
    const staticCommandCount = wasm.blitz_shape_command_count();
    const dynamicCommandCount = wasm.blitz_dyn_command_count();
    const visibleShapeCount =
      visibleGeometryShapeCount + wasm.blitz_visible_text_shape_count();
    ui.statsBody.innerHTML = `
      <div class="stats-heading">
        <span>Stats</span>
        <strong>${formatNumber(Math.round(1000 / frameMs))} fps · ${frameMs.toFixed(1)} ms</strong>
      </div>
      <div class="stats-section">
        ${metricRow("Zoom", formatPercent(lastZoomPercent))}
        ${metricRow("Selected", formatNumber(wasm.blitz_selected_count()))}
        ${metricRow("Shapes", formatNumber(shapeCount))}
        ${metricRow("Visible", formatNumber(visibleShapeCount))}
        ${statsBreakdown([
          ["Rect", formatNumber(rectShapeCount)],
          ["Tri", formatNumber(triangleShapeCount)],
          ["Oval", formatNumber(ovalShapeCount)],
          ["Path", formatNumber(pathShapeCount)],
          ["Text", formatNumber(textShapeCount)],
        ])}
      </div>
      <div class="stats-section">
        ${metricRow("Static cmds", formatNumber(staticCommandCount))}
        ${metricRow("Dynamic cmds", formatNumber(dynamicCommandCount))}
        ${metricRow("Path segments", formatNumber(pathSegmentCount))}
        ${metricRow("Text glyphs", formatNumber(wasm.blitz_text_draw_count()))}
      </div>
      <div class="stats-section">
        ${metricRow("WASM reserved", formatBytes(wasm.memory.buffer.byteLength))}
        ${metricRow("WASM live", formatBytes(wasm.blitz_wasm_live_bytes()))}
        ${metricRow("GPU buffers", formatBytes(gpuBufferBytes()))}
      </div>
    `;
  };
  let depthTexture: GPUTexture | null = null;
  let depthView: GPUTextureView | null = null;
  let pathMsaaTexture: GPUTexture | null = null;
  let pathMsaaView: GPUTextureView | null = null;
  let pathResolveTexture: GPUTexture | null = null;
  let pathResolveView: GPUTextureView | null = null;
  let pathMsaaDepthTexture: GPUTexture | null = null;
  let pathMsaaDepthView: GPUTextureView | null = null;
  let pathCompositeBindGroup!: GPUBindGroup;
  const pathCompositeSampler = device.createSampler({
    label: "Blitz Path Composite Sampler",
    magFilter: "linear",
    minFilter: "linear",
  });
  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(ui.canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(ui.canvas.clientHeight * dpr));
    if (
      ui.canvas.width !== width ||
      ui.canvas.height !== height ||
      !depthTexture
    ) {
      ui.canvas.width = width;
      ui.canvas.height = height;
      wasm.blitz_resize(width, height);
      depthTexture?.destroy();
      pathMsaaTexture?.destroy();
      pathResolveTexture?.destroy();
      pathMsaaDepthTexture?.destroy();
      depthTexture = device.createTexture({
        label: "Blitz Depth Texture",
        size: [width, height],
        format: depthFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      depthView = depthTexture.createView();
      pathMsaaTexture = device.createTexture({
        label: "Blitz Path MSAA Color Texture",
        size: [width, height],
        format,
        sampleCount: msaaSampleCount,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      pathMsaaView = pathMsaaTexture.createView();
      pathResolveTexture = device.createTexture({
        label: "Blitz Path Resolve Texture",
        size: [width, height],
        format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      pathResolveView = pathResolveTexture.createView();
      pathMsaaDepthTexture = device.createTexture({
        label: "Blitz Path MSAA Depth Texture",
        size: [width, height],
        format: depthFormat,
        sampleCount: msaaSampleCount,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      pathMsaaDepthView = pathMsaaDepthTexture.createView();
      pathCompositeBindGroup = device.createBindGroup({
        label: "Blitz Path Composite Bind Group",
        layout: pathCompositeBindGroupLayout,
        entries: [
          { binding: 0, resource: pathResolveView },
          { binding: 1, resource: pathCompositeSampler },
        ],
      });
    }
  };
  const colorHex = (red: number, green: number, blue: number) =>
    `#${[red, green, blue]
      .map((channel) =>
        Math.round(Math.min(1, Math.max(0, channel)) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;
  const setColorButtonValue = (button: HTMLButtonElement, value: string) => {
    button.value = value;
    button.style.setProperty("--style-color", value);
  };
  let propertiesPanelOpen = false;
  const updateSidePanelOpen = () => {
    document.documentElement.dataset.sidePanelOpen =
      propertiesPanelOpen || statsVisible ? "true" : "false";
  };
  const setPropertiesPanelOpen = (open: boolean) => {
    propertiesPanelOpen = open;
    updateSidePanelOpen();
    ui.togglePropertiesButton.setAttribute("aria-pressed", String(open));
  };
  ui.togglePropertiesButton.disabled = true;
  setPropertiesPanelOpen(false);
  ui.togglePropertiesButton.addEventListener("click", () => {
    if (ui.togglePropertiesButton.disabled) {
      return;
    }
    setPropertiesPanelOpen(!propertiesPanelOpen);
  });
  const updateStyleIsland = () => {
    const kind = wasm.blitz_selected_style_kind();
    ui.styleIsland.hidden = kind === 0;
    ui.togglePropertiesButton.disabled = kind === 0;
    if (kind === 0) {
      setPropertiesPanelOpen(false);
      return;
    }
    const style = new Float32Array(
      wasm.memory.buffer,
      wasm.blitz_selected_style_ptr(),
      wasm.blitz_selected_style_f32_count(),
    );
    const geometric = (kind & 1) !== 0;
    const text = (kind & 2) !== 0;
    const strokeCapable = (kind & 4) !== 0;
    const frameTitlePtr = wasm.blitz_selected_frame_title_ptr();
    const frameTitleLength =
      frameTitlePtr === 0 ? 0 : wasm.blitz_selected_frame_title_length();
    const frame = frameTitlePtr !== 0;
    const containerState = wasm.blitz_selected_container_state();
    ui.selectedContainerInput.checked = containerState === 2;
    ui.selectedContainerInput.indeterminate = containerState === 3;
    ui.selectedContainerInput.disabled = containerState === 0;
    ui.selectedGeometryControls.hidden = !geometric;
    ui.selectedStrokeRow.hidden = !strokeCapable;
    ui.selectedFrameControls.hidden = !frame;
    ui.selectedTextControls.hidden = !text;
    ui.selectedMixedDivider.hidden = !(geometric && text);
    if (geometric) {
      setColorButtonValue(
        ui.selectedFillInput,
        colorHex(style[0], style[1], style[2]),
      );
      ui.selectedFillOpacityInput.value = String(style[3]);
      setColorButtonValue(
        ui.selectedStrokeInput,
        colorHex(style[4], style[5], style[6]),
      );
      ui.selectedStrokeOpacityInput.value = String(style[7]);
      ui.selectedStrokeWidthInput.value = String(Number(style[8].toFixed(2)));
    }
    if (text) {
      setColorButtonValue(
        ui.selectedTextColorInput,
        colorHex(style[9], style[10], style[11]),
      );
      ui.selectedTextOpacityInput.value = String(style[12]);
      ui.selectedTextAutoWidthButton.disabled = !(style[13] > 0);
      ui.selectedTextFontSizeInput.value = String(Number(style[14].toFixed(1)));
    }
    if (frame) {
      ui.selectedFrameTitleInput.value = new TextDecoder().decode(
        new Uint8Array(wasm.memory.buffer, frameTitlePtr, frameTitleLength),
      );
    }
  };
  const formatDebugNumber = (value: number) =>
    Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
  const debugComponent = (
    name: string,
    values: Record<string, string | number>,
  ) => {
    const section = document.createElement("dl");
    section.className = "debugger-component";
    const heading = document.createElement("h3");
    heading.textContent = name;
    section.append(heading);
    for (const [label, rawValue] of Object.entries(values)) {
      const term = document.createElement("dt");
      term.textContent = label;
      const value = document.createElement("dd");
      value.textContent =
        typeof rawValue === "number" ? formatDebugNumber(rawValue) : rawValue;
      section.append(term, value);
    }
    return section;
  };
  let debuggerEnabled = false;
  const updateDebuggerIsland = () => {
    const ptr = wasm.blitz_selected_debug_ptr();
    ui.debuggerIsland.hidden = !debuggerEnabled || ptr === 0;
    ui.debuggerComponents.replaceChildren();
    if (ptr === 0) {
      ui.debuggerEntityId.textContent =
        wasm.blitz_selected_count() > 1
          ? `${wasm.blitz_selected_count()} entities`
          : "";
      return;
    }
    const view = new DataView(wasm.memory.buffer);
    const words = Array.from({ length: 4 }, (_value, index) =>
      view
        .getUint32(ptr + index * 4, true)
        .toString(16)
        .padStart(8, "0"),
    );
    ui.debuggerEntityId.textContent = `${words[0]}${words[1]}:${words[2]}${words[3]}`;
    const kind = view.getUint32(ptr + 16, true);
    const kindNames = ["Rectangle", "Triangle", "Oval", "Text", "Frame", "Pen"];
    const mask = wasm.blitz_selected_debug_mask();
    ui.debuggerComponents.append(
      debugComponent("Entity", {
        slot: view.getUint32(ptr + 36, true),
        order: view.getUint32(ptr + 20, true),
        mask: `0x${mask.toString(16).padStart(2, "0")}`,
        kind: kindNames[kind] ?? "Unknown",
      }),
      debugComponent("Position", {
        x: view.getFloat32(ptr + 40, true),
        y: view.getFloat32(ptr + 44, true),
      }),
      debugComponent("Size", {
        width: view.getFloat32(ptr + 48, true),
        height: view.getFloat32(ptr + 52, true),
      }),
      debugComponent("Transform", {
        rotation: view.getFloat32(ptr + 136, true),
        relativeRotation: view.getFloat32(ptr + 140, true),
        relativeOffsetX: view.getFloat32(ptr + 144, true),
        relativeOffsetY: view.getFloat32(ptr + 148, true),
      }),
    );
    if (kind === 3 || kind === 4) {
      const textPtr = view.getUint32(ptr + 28, true);
      const textLength = view.getUint32(ptr + 32, true);
      const text = new TextDecoder().decode(
        new Uint8Array(wasm.memory.buffer, textPtr, textLength),
      );
      ui.debuggerComponents.append(
        kind === 3
          ? debugComponent("TextView", {
              text,
              fontSize: view.getFloat32(ptr + 92, true),
              color: colorHex(
                view.getFloat32(ptr + 56, true),
                view.getFloat32(ptr + 60, true),
                view.getFloat32(ptr + 64, true),
              ),
              opacity: view.getFloat32(ptr + 68, true),
              maxWidth: view.getFloat32(ptr + 96, true),
              lineHeight: view.getFloat32(ptr + 100, true),
              maxLines: view.getFloat32(ptr + 104, true),
              align:
                ["left", "center", "right"][view.getFloat32(ptr + 108, true)] ??
                "left",
            })
          : debugComponent("FrameTitle", {
              text,
              fontSize: view.getFloat32(ptr + 92, true),
              color: colorHex(
                view.getFloat32(ptr + 96, true),
                view.getFloat32(ptr + 100, true),
                view.getFloat32(ptr + 104, true),
              ),
              opacity: view.getFloat32(ptr + 108, true),
            }),
      );
    }
    if (kind !== 3) {
      ui.debuggerComponents.append(
        debugComponent(`${kindNames[kind] ?? "Shape"}View`, {
          fill: colorHex(
            view.getFloat32(ptr + 56, true),
            view.getFloat32(ptr + 60, true),
            view.getFloat32(ptr + 64, true),
          ),
          fillOpacity: view.getFloat32(ptr + 68, true),
          stroke: colorHex(
            view.getFloat32(ptr + 72, true),
            view.getFloat32(ptr + 76, true),
            view.getFloat32(ptr + 80, true),
          ),
          strokeOpacity: view.getFloat32(ptr + 84, true),
          strokeWidth: view.getFloat32(ptr + 88, true),
        }),
      );
    }
    if (kind === 5) {
      const segments = view.getFloat32(ptr + 96, true);
      const triangles = view.getFloat32(ptr + 100, true);
      ui.debuggerComponents.append(
        debugComponent("PenGeometry", {
          points: view.getFloat32(ptr + 92, true),
          segments,
          triangles,
          segmentStride: `${pathSegmentStride} B`,
          segmentBytes: segments * pathSegmentStride,
        }),
      );
    }
    ui.debuggerComponents.append(
      debugComponent("Capabilities", {
        selectable: (mask & 64) !== 0 ? "yes" : "no",
        resizableX: (mask & 128) !== 0 ? "yes" : "no",
        resizableY: (mask & 256) !== 0 ? "yes" : "no",
        geometricStyle: (mask & (4 | 8 | 16 | 4096)) !== 0 ? "yes" : "no",
        textStyle: (mask & 32) !== 0 ? "yes" : "no",
        container: (mask & 1024) !== 0 ? "yes" : "no",
        relativeTransform: (mask & 512) !== 0 ? "yes" : "no",
      }),
    );
  };
  ui.toggleDebuggerButton.addEventListener("click", () => {
    debuggerEnabled = !debuggerEnabled;
    ui.toggleDebuggerButton.setAttribute(
      "aria-pressed",
      String(debuggerEnabled),
    );
    updateDebuggerIsland();
  });
  let updateHistoryControls = () => {};
  const updateSelectionState = () => {
    const disabled = wasm.blitz_has_selection() === 0;
    ui.sendToBackButton.disabled = disabled;
    ui.bringToFrontButton.disabled = disabled;
    ui.deleteButton.disabled = disabled;
    updateHistoryControls();
    updateStyleIsland();
    updateDebuggerIsland();
  };
  let emptyStateVisible = false;
  const updateEmptyState = () => {
    const visible = wasm.blitz_entity_count() === 0;
    if (visible === emptyStateVisible) {
      return;
    }
    emptyStateVisible = visible;
    ui.emptyState.hidden = !visible;
  };
  type ClipboardShape = {
    id: string;
    parentId?: string;
    type: "rect" | "frame" | "triangle" | "circle" | "text";
    order: number;
    container: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    relativeRotation: number;
    relativeOffsetX: number;
    relativeOffsetY: number;
    fill: [number, number, number, number];
    stroke: [number, number, number, number];
    strokeWidth: number;
    text: string;
    fontSize: number;
    titleColor?: [number, number, number, number];
    maxWidth: number;
    lineHeight: number;
    maxLines: number;
    align: number;
  };
  type ClipboardPayload = {
    source: "blitz";
    version: 1;
    shapes: ClipboardShape[];
  };
  type ObjectIdWords = [number, number, number, number];
  const clipboardSource = "blitz";
  const clipboardVersion = 1;
  const maxClipboardItems = 65536;
  const maxSystemClipboardItems = 10000;
  const worldQueryExtent = 1000000000;
  const clipboardTextEncoder = new TextEncoder();
  const clipboardTextDecoder = new TextDecoder();
  let localClipboardText = "";
  let localClipboardHasInternal = false;
  let lastCursorCanvasPoint: {
    x: number;
    y: number;
  } | null = null;
  const updateCursorCanvasPoint = (event: PointerEvent) => {
    const rect = ui.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    lastCursorCanvasPoint = {
      x: (event.clientX - rect.left) * dpr,
      y: (event.clientY - rect.top) * dpr,
    };
  };
  ui.canvas.addEventListener("pointerdown", updateCursorCanvasPoint);
  ui.canvas.addEventListener("pointermove", updateCursorCanvasPoint);
  const cursorWorldPoint = () => {
    const uniforms = new Float32Array(
      wasm.memory.buffer,
      uniformPtr,
      wasm.blitz_uniform_f32_count(),
    );
    const point = lastCursorCanvasPoint ?? {
      x: uniforms[0] * 0.5,
      y: uniforms[1] * 0.5,
    };
    const zoom = uniforms[4] || 1;
    return {
      x: (point.x - uniforms[0] * 0.5) / zoom + uniforms[2],
      y: (point.y - uniforms[1] * 0.5) / zoom + uniforms[3],
    };
  };
  // Broadcast the local pointer (world coords) to collaborators; sendCursor is
  // throttled and a no-op while disconnected. The listener above already
  // refreshed lastCursorCanvasPoint, so cursorWorldPoint() is current here.
  ui.canvas.addEventListener("pointermove", () => {
    const world = cursorWorldPoint();
    collaborationController?.sendCursor(world.x, world.y);
  });
  const querySelectedShapes = (): ClipboardShape[] => {
    wasm.blitz_query_scene(
      -worldQueryExtent,
      -worldQueryExtent,
      worldQueryExtent,
      worldQueryExtent,
      maxClipboardItems,
    );
    const count = wasm.blitz_scene_query_count();
    const itemBytes = wasm.blitz_scene_query_item_bytes();
    const base = wasm.blitz_scene_query_ptr();
    const view = new DataView(wasm.memory.buffer);
    const shapes: ClipboardShape[] = [];
    const kinds = ["rect", "triangle", "circle", "text", "frame"] as const;
    for (let index = 0; index < count; index += 1) {
      const offset = base + index * itemBytes;
      if (view.getUint32(offset + 132, true) === 0) {
        continue;
      }
      const type = kinds[view.getUint32(offset + 16, true)];
      if (!type) {
        continue;
      }
      const id = readObjectIdAt(view, offset);
      const parentId = readObjectIdAt(view, offset + 112);
      const componentMask = view.getUint32(offset + 128, true);
      const textPtr = view.getUint32(offset + 28, true);
      const textLength = view.getUint32(offset + 32, true);
      shapes.push({
        id: formatObjectId(id),
        parentId: objectIdIsEmpty(parentId)
          ? undefined
          : formatObjectId(parentId),
        type,
        order: view.getUint32(offset + 20, true),
        container: (componentMask & 1024) !== 0,
        x: view.getFloat32(offset + 40, true),
        y: view.getFloat32(offset + 44, true),
        width: view.getFloat32(offset + 48, true),
        height: view.getFloat32(offset + 52, true),
        rotation: view.getFloat32(offset + 136, true),
        relativeRotation: view.getFloat32(offset + 140, true),
        relativeOffsetX: view.getFloat32(offset + 144, true),
        relativeOffsetY: view.getFloat32(offset + 148, true),
        fill: [
          view.getFloat32(offset + 56, true),
          view.getFloat32(offset + 60, true),
          view.getFloat32(offset + 64, true),
          view.getFloat32(offset + 68, true),
        ],
        stroke: [
          view.getFloat32(offset + 72, true),
          view.getFloat32(offset + 76, true),
          view.getFloat32(offset + 80, true),
          view.getFloat32(offset + 84, true),
        ],
        strokeWidth: view.getFloat32(offset + 88, true),
        text:
          type === "text" || type === "frame"
            ? clipboardTextDecoder.decode(
                new Uint8Array(wasm.memory.buffer, textPtr, textLength),
              )
            : "",
        fontSize: view.getFloat32(offset + 92, true),
        titleColor: [
          view.getFloat32(offset + 96, true),
          view.getFloat32(offset + 100, true),
          view.getFloat32(offset + 104, true),
          view.getFloat32(offset + 108, true),
        ],
        maxWidth: view.getFloat32(offset + 96, true),
        lineHeight: view.getFloat32(offset + 100, true),
        maxLines: Math.round(view.getFloat32(offset + 104, true)),
        align: Math.round(view.getFloat32(offset + 108, true)),
      });
    }
    return shapes.sort((left, right) => left.order - right.order);
  };
  const clipboardBounds = (shapes: ClipboardShape[]) => {
    const left = Math.min(...shapes.map((shape) => shape.x));
    const top = Math.min(...shapes.map((shape) => shape.y));
    const right = Math.max(...shapes.map((shape) => shape.x + shape.width));
    const bottom = Math.max(...shapes.map((shape) => shape.y + shape.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
  };
  const parseClipboardPayload = (text: string): ClipboardPayload | null => {
    try {
      const value = JSON.parse(text) as Partial<ClipboardPayload>;
      if (
        value.source !== clipboardSource ||
        value.version !== clipboardVersion ||
        !Array.isArray(value.shapes)
      ) {
        return null;
      }
      const isColor = (
        color: unknown,
      ): color is [number, number, number, number] =>
        Array.isArray(color) &&
        color.length === 4 &&
        color.every(Number.isFinite);
      const shapes = value.shapes.filter((shape): shape is ClipboardShape => {
        return (
          !!shape &&
          ["rect", "frame", "triangle", "circle", "text"].includes(
            shape.type,
          ) &&
          typeof shape.id === "string" &&
          (shape.parentId === undefined ||
            typeof shape.parentId === "string") &&
          typeof shape.container === "boolean" &&
          Number.isFinite(shape.x) &&
          Number.isFinite(shape.y) &&
          Number.isFinite(shape.width) &&
          Number.isFinite(shape.height) &&
          isColor(shape.fill) &&
          isColor(shape.stroke) &&
          Number.isFinite(shape.strokeWidth) &&
          Number.isFinite(shape.fontSize) &&
          (shape.titleColor === undefined || isColor(shape.titleColor)) &&
          Number.isFinite(shape.maxWidth) &&
          Number.isFinite(shape.lineHeight) &&
          Number.isFinite(shape.maxLines) &&
          Number.isFinite(shape.align) &&
          typeof shape.text === "string" &&
          shape.width > 0 &&
          shape.height > 0
        );
      });
      return shapes.length > 0
        ? { source: clipboardSource, version: clipboardVersion, shapes }
        : null;
    } catch {
      return null;
    }
  };
  const readLastCreatedObjectId = (): ObjectIdWords => {
    const ptr = wasm.blitz_last_created_object_id_ptr();
    const view = new DataView(wasm.memory.buffer);
    return [
      view.getUint32(ptr, true),
      view.getUint32(ptr + 4, true),
      view.getUint32(ptr + 8, true),
      view.getUint32(ptr + 12, true),
    ];
  };
  const readObjectIdAt = (view: DataView, offset: number): ObjectIdWords => [
    view.getUint32(offset, true),
    view.getUint32(offset + 4, true),
    view.getUint32(offset + 8, true),
    view.getUint32(offset + 12, true),
  ];
  const objectIdIsEmpty = (id: ObjectIdWords) => id.every((word) => word === 0);
  const formatObjectId = (id: ObjectIdWords) =>
    `${id[0].toString(16).padStart(8, "0")}${id[1].toString(16).padStart(8, "0")}:${id[2].toString(16).padStart(8, "0")}${id[3].toString(16).padStart(8, "0")}`;
  const writeTextInput = (text: string): number => {
    const encoded = clipboardTextEncoder.encode(text);
    const capacity = wasm.blitz_text_input_capacity();
    if (encoded.byteLength >= capacity) {
      return -1;
    }
    new Uint8Array(
      wasm.memory.buffer,
      wasm.blitz_text_input_ptr(),
      encoded.byteLength,
    ).set(encoded);
    return encoded.byteLength;
  };
  type TextEditSession = {
    objectId: ObjectIdWords;
    entity: number;
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color: [number, number, number, number];
    fontSize: number;
    maxWidth: number;
    lineHeight: number;
    maxLines: number;
    align: number;
  };
  let textEditSession: TextEditSession | null = null;
  let closingTextEditor = false;
  const textCaretMirror = document.createElement("div");
  const textCaretMarker = document.createElement("span");
  textCaretMirror.setAttribute("aria-hidden", "true");
  textCaretMirror.style.position = "fixed";
  textCaretMirror.style.left = "-10000px";
  textCaretMirror.style.top = "0";
  textCaretMirror.style.visibility = "hidden";
  textCaretMirror.style.pointerEvents = "none";
  textCaretMirror.style.whiteSpace = "pre-wrap";
  textCaretMirror.style.overflowWrap = "break-word";
  textCaretMirror.style.wordBreak = "normal";
  textCaretMirror.style.boxSizing = "content-box";
  textCaretMirror.append(textCaretMarker);
  document.body.append(textCaretMirror);
  const selectedTextEditSession = (): TextEditSession | null => {
    const ptr = wasm.blitz_selected_debug_ptr();
    if (ptr === 0) {
      return null;
    }
    const view = new DataView(wasm.memory.buffer);
    if (view.getUint32(ptr + 16, true) !== blitzShapeText) {
      return null;
    }
    const textPtr = view.getUint32(ptr + 28, true);
    const textLength = view.getUint32(ptr + 32, true);
    return {
      objectId: [
        view.getUint32(ptr, true),
        view.getUint32(ptr + 4, true),
        view.getUint32(ptr + 8, true),
        view.getUint32(ptr + 12, true),
      ],
      entity: view.getUint32(ptr + 36, true),
      text: clipboardTextDecoder.decode(
        new Uint8Array(wasm.memory.buffer, textPtr, textLength),
      ),
      x: view.getFloat32(ptr + 40, true),
      y: view.getFloat32(ptr + 44, true),
      width: view.getFloat32(ptr + 48, true),
      height: view.getFloat32(ptr + 52, true),
      color: [
        view.getFloat32(ptr + 56, true),
        view.getFloat32(ptr + 60, true),
        view.getFloat32(ptr + 64, true),
        view.getFloat32(ptr + 68, true),
      ],
      fontSize: view.getFloat32(ptr + 92, true),
      maxWidth: view.getFloat32(ptr + 96, true),
      lineHeight: view.getFloat32(ptr + 100, true),
      maxLines: Math.round(view.getFloat32(ptr + 104, true)),
      align: Math.round(view.getFloat32(ptr + 108, true)),
    };
  };
  const textEditorScale = () => {
    const uniforms = new Float32Array(
      wasm.memory.buffer,
      uniformPtr,
      wasm.blitz_uniform_f32_count(),
    );
    const dpr = window.devicePixelRatio || 1;
    return {
      cameraX: uniforms[2],
      cameraY: uniforms[3],
      viewportWidth: uniforms[0],
      viewportHeight: uniforms[1],
      zoom: uniforms[4] || 1,
      dpr,
    };
  };
  const visualViewportRect = () => {
    const viewport = window.visualViewport;
    return {
      left: 0,
      top: 0,
      width: viewport?.width ?? window.innerWidth,
      height: viewport?.height ?? window.innerHeight,
    };
  };
  const positionTextEditor = () => {
    if (!textEditSession) {
      return;
    }
    const scale = textEditorScale();
    const rect = ui.canvas.getBoundingClientRect();
    const screenX =
      rect.left +
      ((textEditSession.x - scale.cameraX) * scale.zoom +
        scale.viewportWidth * 0.5) /
        scale.dpr;
    const screenY =
      rect.top +
      ((textEditSession.y - scale.cameraY) * scale.zoom +
        scale.viewportHeight * 0.5) /
        scale.dpr;
    const padding = Math.max(0, (textPaddingWorld * scale.zoom) / scale.dpr);
    let contentWidth = Math.max(
      1,
      ((textEditSession.width - textPaddingWorld * 2) * scale.zoom) / scale.dpr,
    );
    let contentHeight = Math.max(
      1,
      ((textEditSession.height - textPaddingWorld * 2) * scale.zoom) /
        scale.dpr,
    );
    ui.textEditor.style.left = `${screenX - textEditorBorderPx}px`;
    ui.textEditor.style.top = `${screenY - textEditorBorderPx}px`;
    ui.textEditor.style.width = `${contentWidth}px`;
    ui.textEditor.style.height = `${contentHeight}px`;
    ui.textEditor.style.padding = `${padding}px`;
    ui.textEditor.style.fontSize = `${Math.max(1, (textEditSession.fontSize * scale.zoom) / scale.dpr)}px`;
    ui.textEditor.style.lineHeight = String(textEditSession.lineHeight);
    ui.textEditor.style.textAlign =
      ["left", "center", "right"][textEditSession.align] ?? "left";
    ui.textEditor.style.color = `rgba(${Math.round(textEditSession.color[0] * 255)}, ${Math.round(textEditSession.color[1] * 255)}, ${Math.round(textEditSession.color[2] * 255)}, ${textEditSession.color[3]})`;
    const scrollContentWidth = Math.max(
      1,
      ui.textEditor.scrollWidth - padding * 2,
    );
    const scrollContentHeight = Math.max(
      1,
      ui.textEditor.scrollHeight - padding * 2,
    );
    if (textEditSession.maxWidth <= 0 && scrollContentWidth > contentWidth) {
      contentWidth = scrollContentWidth;
      ui.textEditor.style.width = `${contentWidth}px`;
    }
    if (scrollContentHeight > contentHeight) {
      contentHeight = scrollContentHeight;
      ui.textEditor.style.height = `${contentHeight}px`;
    }
  };
  const copyTextEditorMirrorStyle = () => {
    const style = getComputedStyle(ui.textEditor);
    const editorRect = ui.textEditor.getBoundingClientRect();
    textCaretMirror.style.left = `${editorRect.left}px`;
    textCaretMirror.style.top = `${editorRect.top}px`;
    textCaretMirror.style.width = ui.textEditor.style.width;
    textCaretMirror.style.minHeight = ui.textEditor.style.height;
    textCaretMirror.style.padding = ui.textEditor.style.padding;
    textCaretMirror.style.border = ui.textEditor.style.border;
    textCaretMirror.style.fontFamily = style.fontFamily;
    textCaretMirror.style.fontFeatureSettings = style.fontFeatureSettings;
    textCaretMirror.style.fontKerning = style.fontKerning;
    textCaretMirror.style.fontSize = style.fontSize;
    textCaretMirror.style.fontVariantLigatures = style.fontVariantLigatures;
    textCaretMirror.style.letterSpacing = style.letterSpacing;
    textCaretMirror.style.lineHeight = style.lineHeight;
    textCaretMirror.style.textAlign = style.textAlign;
    textCaretMirror.style.textTransform = style.textTransform;
    textCaretMirror.style.wordSpacing = style.wordSpacing;
  };
  const ensureTextCaretVisible = () => {
    if (!textEditSession || ui.textEditor.hidden) {
      return;
    }
    copyTextEditorMirrorStyle();
    const caretIndex = ui.textEditor.selectionEnd ?? ui.textEditor.value.length;
    const before = ui.textEditor.value.slice(0, caretIndex);
    textCaretMirror.textContent = before.length > 0 ? before : "\u200b";
    textCaretMarker.textContent = "\u200b";
    textCaretMirror.append(textCaretMarker);
    const markerRect = textCaretMarker.getBoundingClientRect();
    const editorRect = ui.textEditor.getBoundingClientRect();
    const lineHeight =
      Number.parseFloat(getComputedStyle(ui.textEditor).lineHeight) || 16;
    const caretRect = {
      left: Number.isFinite(markerRect.left)
        ? markerRect.left
        : editorRect.left,
      right: Number.isFinite(markerRect.left)
        ? markerRect.left
        : editorRect.left,
      top: Number.isFinite(markerRect.top) ? markerRect.top : editorRect.top,
      bottom:
        (Number.isFinite(markerRect.top) ? markerRect.top : editorRect.top) +
        lineHeight,
    };
    let panX = 0;
    let panY = 0;
    const viewport = visualViewportRect();
    const minX = viewport.left + textCaretViewportMargin;
    const minY = viewport.top + textCaretViewportMargin;
    const maxX = viewport.left + viewport.width - textCaretViewportMargin;
    const maxY = viewport.top + viewport.height - textCaretViewportMargin;
    if (caretRect.left < minX) {
      panX = minX - caretRect.left;
    } else if (caretRect.right > maxX) {
      panX = maxX - caretRect.right;
    }
    if (caretRect.top < minY) {
      panY = minY - caretRect.top;
    } else if (caretRect.bottom > maxY) {
      panY = maxY - caretRect.bottom;
    }
    if (panX !== 0 || panY !== 0) {
      const dpr = window.devicePixelRatio || 1;
      wasm.blitz_pan(panX * dpr, panY * dpr);
      positionTextEditor();
    }
  };
  const scheduleTextCaretVisibility = () => {
    requestAnimationFrame(ensureTextCaretVisible);
  };
  const resizeTextEditorToValue = () => {
    if (!textEditSession) {
      return;
    }
    const textLength = writeTextInput(ui.textEditor.value);
    if (textLength < 0) {
      return;
    }
    wasm.blitz_layout_text(
      textLength,
      textEditSession.fontSize,
      textEditSession.maxWidth,
      textEditSession.lineHeight,
      textEditSession.maxLines,
    );
    const padding = textPaddingWorld;
    const contentWidth =
      textEditSession.maxWidth > 0
        ? textEditSession.maxWidth
        : wasm.blitz_text_layout_width();
    textEditSession.width = Math.max(1, contentWidth) + padding * 2;
    textEditSession.height =
      Math.max(1, wasm.blitz_text_layout_height()) + padding * 2;
    positionTextEditor();
    scheduleTextCaretVisibility();
  };
  const closeTextEditor = () => {
    closingTextEditor = true;
    wasm.blitz_set_hidden_text_entity(blitzInvalidIndex);
    ui.textEditor.hidden = true;
    ui.textEditor.value = "";
    textEditSession = null;
    closingTextEditor = false;
  };
  const cancelTextEdit = () => {
    closeTextEditor();
    ui.canvas.focus();
  };
  const commitTextEdit = () => {
    const session = textEditSession;
    if (!session) {
      return;
    }
    const nextText = ui.textEditor.value;
    if (nextText === session.text) {
      closeTextEditor();
      ui.canvas.focus();
      return;
    }
    const textLength = writeTextInput(nextText);
    if (textLength < 0) {
      ui.showFallback(
        `Text is too long. Maximum UTF-8 size is ${wasm.blitz_text_input_capacity() - 1} bytes.`,
      );
      return;
    }
    let updateResult = 0;
    sceneHistory.transact(() => {
      updateResult = wasm.blitz_update_object(
        session.objectId[0],
        session.objectId[1],
        session.objectId[2],
        session.objectId[3],
        blitzShapeText,
        blitzUpdateText,
        session.x,
        session.y,
        session.width,
        session.height,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        session.fontSize,
        session.color[0],
        session.color[1],
        session.color[2],
        session.color[3],
        textLength,
        session.maxWidth,
        session.lineHeight,
        session.maxLines,
        session.align,
      );
    });
    if (updateResult !== 0) {
      ui.showFallback(
        `Text edit could not be applied (error ${updateResult}).`,
      );
      return;
    }
    closeTextEditor();
    ui.canvas.focus();
    updateSelectionState();
  };
  const beginTextEdit = () => {
    const session = selectedTextEditSession();
    if (!session) {
      return;
    }
    textEditSession = session;
    wasm.blitz_set_hidden_text_entity(session.entity);
    ui.textEditor.value = session.text;
    ui.textEditor.hidden = false;
    resizeTextEditorToValue();
    ui.textEditor.focus();
    ui.textEditor.select();
    scheduleTextCaretVisibility();
  };
  ui.textEditor.addEventListener("input", resizeTextEditorToValue);
  ui.textEditor.addEventListener("click", scheduleTextCaretVisibility);
  ui.textEditor.addEventListener("keyup", scheduleTextCaretVisibility);
  ui.textEditor.addEventListener("select", scheduleTextCaretVisibility);
  ui.textEditor.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelTextEdit();
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      commitTextEdit();
    }
  });
  ui.textEditor.addEventListener("blur", () => {
    if (!closingTextEditor && textEditSession) {
      commitTextEdit();
    }
  });
  window.visualViewport?.addEventListener("resize", () => {
    if (!textEditSession) {
      return;
    }
    positionTextEditor();
    scheduleTextCaretVisibility();
  });
  window.visualViewport?.addEventListener("scroll", () => {
    if (!textEditSession) {
      return;
    }
    positionTextEditor();
    scheduleTextCaretVisibility();
  });
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!textEditSession || event.target === ui.textEditor) {
        return;
      }
      commitTextEdit();
    },
    { capture: true },
  );
  const createClipboardShape = (
    shape: ClipboardShape,
    offsetX: number,
    offsetY: number,
  ): ObjectIdWords | null => {
    const x = shape.x + offsetX;
    const y = shape.y + offsetY;
    let entity = 0xffffffff;
    if (shape.type === "text") {
      const textLength = writeTextInput(shape.text);
      if (textLength < 0) {
        return null;
      }
      entity = wasm.blitz_create_text(
        x,
        y,
        shape.fontSize,
        shape.fill[0],
        shape.fill[1],
        shape.fill[2],
        shape.fill[3],
        textLength,
        shape.maxWidth,
        shape.lineHeight,
        shape.maxLines,
        shape.align,
      );
    } else if (shape.type === "frame") {
      const titleLength = shape.text ? writeTextInput(shape.text) : 0;
      const titleColor = shape.titleColor ?? [0.08, 0.1, 0.13, 1];
      entity = wasm.blitz_create_frame(
        x,
        y,
        shape.width,
        shape.height,
        shape.fill[0],
        shape.fill[1],
        shape.fill[2],
        shape.fill[3],
        shape.stroke[0],
        shape.stroke[1],
        shape.stroke[2],
        shape.stroke[3],
        shape.strokeWidth,
        titleColor[0],
        titleColor[1],
        titleColor[2],
        titleColor[3],
        shape.fontSize > 0 ? shape.fontSize : 18,
        titleLength,
      );
    } else if (shape.type === "circle") {
      entity = wasm.blitz_create_oval(
        x,
        y,
        shape.width,
        shape.height,
        shape.fill[0],
        shape.fill[1],
        shape.fill[2],
        shape.fill[3],
        shape.stroke[0],
        shape.stroke[1],
        shape.stroke[2],
        shape.stroke[3],
        shape.strokeWidth,
      );
    } else {
      const create =
        shape.type === "rect"
          ? wasm.blitz_create_rect
          : wasm.blitz_create_triangle;
      entity = create(
        x,
        y,
        shape.width,
        shape.height,
        shape.fill[0],
        shape.fill[1],
        shape.fill[2],
        shape.fill[3],
        shape.stroke[0],
        shape.stroke[1],
        shape.stroke[2],
        shape.stroke[3],
        shape.strokeWidth,
      );
    }
    if (entity === 0xffffffff) {
      return null;
    }
    const id = readLastCreatedObjectId();
    if (shape.rotation !== 0) {
      wasm.blitz_set_rotation(id[0], id[1], id[2], id[3], shape.rotation);
    }
    wasm.blitz_set_container(id[0], id[1], id[2], id[3], shape.container ? 1 : 0);
    return id;
  };
  const insertClipboardShapes = (
    shapes: ClipboardShape[],
    offsetX: number,
    offsetY: number,
  ) => {
    const createdIds: ObjectIdWords[] = [];
    const createdBySourceId = new Map<string, ObjectIdWords>();
    sceneHistory.transact(() => {
      for (const shape of shapes) {
        const id = createClipboardShape(shape, offsetX, offsetY);
        if (id) {
          createdIds.push(id);
          createdBySourceId.set(shape.id, id);
        }
      }
      for (const shape of shapes) {
        if (!shape.parentId) {
          continue;
        }
        const child = createdBySourceId.get(shape.id);
        const parent = createdBySourceId.get(shape.parentId);
        if (!child || !parent) {
          continue;
        }
        wasm.blitz_set_relative_transform(
          child[0],
          child[1],
          child[2],
          child[3],
          parent[0],
          parent[1],
          parent[2],
          parent[3],
          shape.relativeOffsetX,
          shape.relativeOffsetY,
        );
      }
      if (createdIds.length > 0) {
        wasm.blitz_clear_selection();
        createdIds.forEach((id, index) => {
          wasm.blitz_select_object(
            id[0],
            id[1],
            id[2],
            id[3],
            index === 0 ? 0 : 1,
          );
        });
      }
    });
    updateSelectionState();
    updateEmptyState();
  };
  const copySelection = async () => {
    const copied = wasm.blitz_copy_selected_to_internal_clipboard();
    if (copied === 0) {
      return;
    }
    localClipboardHasInternal = true;
    if (copied > maxSystemClipboardItems) {
      localClipboardText = "";
      return;
    }
    const shapes = querySelectedShapes();
    if (shapes.length === 0 || shapes.length > maxSystemClipboardItems) {
      localClipboardText = "";
      return;
    }
    localClipboardText = JSON.stringify({
      source: clipboardSource,
      version: clipboardVersion,
      shapes,
    });
    try {
      await navigator.clipboard?.writeText(localClipboardText);
    } catch {
      // Local fallback still enables copy/paste within this tab.
    }
  };
  const pasteClipboard = async () => {
    if (
      localClipboardHasInternal &&
      wasm.blitz_internal_clipboard_count() > 0
    ) {
      const bounds = new Float32Array(
        wasm.memory.buffer,
        wasm.blitz_internal_clipboard_bounds_ptr(),
        4,
      );
      const target = cursorWorldPoint();
      sceneHistory.transact(() => {
        wasm.blitz_paste_internal_clipboard(
          target.x - (bounds[0] + bounds[2] * 0.5),
          target.y - (bounds[1] + bounds[3] * 0.5),
        );
      });
      updateSelectionState();
      updateEmptyState();
      return;
    }
    let text = localClipboardText;
    try {
      text = (await navigator.clipboard?.readText()) || text;
    } catch {
      // Fall back to the last successful in-tab copy.
    }
    const payload = parseClipboardPayload(text);
    if (!payload) {
      return;
    }
    const bounds = clipboardBounds(payload.shapes);
    const target = cursorWorldPoint();
    insertClipboardShapes(
      payload.shapes,
      target.x - (bounds.x + bounds.width * 0.5),
      target.y - (bounds.y + bounds.height * 0.5),
    );
  };
  const duplicateSelection = () => {
    const shapes = querySelectedShapes();
    if (shapes.length === 0) {
      return;
    }
    const bounds = clipboardBounds(shapes);
    const uniforms = new Float32Array(
      wasm.memory.buffer,
      uniformPtr,
      wasm.blitz_uniform_f32_count(),
    );
    sceneHistory.transact(() => {
      wasm.blitz_duplicate_selected(bounds.width + 32 / (uniforms[4] || 1), 0);
    });
    updateSelectionState();
    updateEmptyState();
  };
  let stopDragging = () => {};
  let collaborationController: CollaborationController | undefined;
  let applyingRemoteCollaboration = false;
  const sceneHistory = createWasmHistory(wasm, {
    onApplied() {
      closeTextEditor();
      stopDragging();
      updateSelectionState();
      updateEmptyState();
    },
    onChanged() {
      updateHistoryControls();
      if (!applyingRemoteCollaboration) {
        collaborationController?.publishLocalChange();
      }
    },
    onError: ui.showFallback,
  });
  updateHistoryControls = () => {
    ui.undoButton.disabled = !sceneHistory.canUndo();
    ui.redoButton.disabled = !sceneHistory.canRedo();
  };
  updateHistoryControls();
  type CreationTool = "rect" | "frame" | "circle" | "triangle" | "text" | "pen";
  let activeTool: CreationTool | null = null;
  let penMode = false;
  const PEN_COLOR_STORAGE_KEY = "blitz:pen-color";
  const PEN_WIDTH_STORAGE_KEY = "blitz:pen-width";
  const SHAPE_FILL_STORAGE_KEY = "blitz:shape-fill";
  const SHAPE_FILL_ALPHA_STORAGE_KEY = "blitz:shape-fill-alpha";
  const SHAPE_STROKE_STORAGE_KEY = "blitz:shape-stroke";
  const SHAPE_STROKE_ALPHA_STORAGE_KEY = "blitz:shape-stroke-alpha";
  const SHAPE_STROKE_WIDTH_STORAGE_KEY = "blitz:shape-stroke-width";
  const TEXT_COLOR_STORAGE_KEY = "blitz:text-tool-color";
  const TEXT_FONT_SIZE_STORAGE_KEY = "blitz:text-tool-font-size";
  const DEFAULT_PEN_COLOR = "#141a21";
  const DEFAULT_PEN_WIDTH = 4;
  const DEFAULT_SHAPE_FILL = "#dbeafe";
  const DEFAULT_SHAPE_STROKE = "#94a3b8";
  const DEFAULT_TEXT_COLOR = "#141a21";
  const hexToRgb = (hex: string) => ({
    r: Number.parseInt(hex.slice(1, 3), 16) / 255,
    g: Number.parseInt(hex.slice(3, 5), 16) / 255,
    b: Number.parseInt(hex.slice(5, 7), 16) / 255,
  });
  const readStored = (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null; // localStorage unavailable (private mode).
    }
  };
  const persist = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // localStorage unavailable; the value still applies for this session.
    }
  };
  const storedColor = readStored(PEN_COLOR_STORAGE_KEY);
  let penColorHex =
    storedColor && /^#[0-9a-f]{6}$/i.test(storedColor)
      ? storedColor
      : DEFAULT_PEN_COLOR;
  const storedWidth = Number(readStored(PEN_WIDTH_STORAGE_KEY));
  const storedShapeFill = readStored(SHAPE_FILL_STORAGE_KEY);
  const storedShapeFillAlpha = readStored(SHAPE_FILL_ALPHA_STORAGE_KEY);
  const storedShapeStroke = readStored(SHAPE_STROKE_STORAGE_KEY);
  const storedShapeStrokeAlpha = readStored(SHAPE_STROKE_ALPHA_STORAGE_KEY);
  const storedShapeStrokeWidth = Number(readStored(SHAPE_STROKE_WIDTH_STORAGE_KEY));
  const storedTextColor = readStored(TEXT_COLOR_STORAGE_KEY);
  const storedTextFontSize = Number(readStored(TEXT_FONT_SIZE_STORAGE_KEY));
  const parseStoredAlpha = (value: string | null) => {
    if (value === null) {
      return 1;
    }
    const alpha = Number(value);
    return Number.isFinite(alpha) && alpha >= 0 && alpha <= 1 ? alpha : 1;
  };
  // Pens have a fill color and a line width, no stroke.
  const penFill = { ...hexToRgb(penColorHex), a: 1 };
  let penWidth =
    Number.isFinite(storedWidth) && storedWidth > 0 ? storedWidth : DEFAULT_PEN_WIDTH;
  let shapeFillHex =
    storedShapeFill && /^#[0-9a-f]{6}$/i.test(storedShapeFill)
      ? storedShapeFill
      : DEFAULT_SHAPE_FILL;
  const shapeFill = {
    ...hexToRgb(shapeFillHex),
    a: parseStoredAlpha(storedShapeFillAlpha),
  };
  let shapeStrokeHex =
    storedShapeStroke && /^#[0-9a-f]{6}$/i.test(storedShapeStroke)
      ? storedShapeStroke
      : DEFAULT_SHAPE_STROKE;
  const shapeStroke = {
    ...hexToRgb(shapeStrokeHex),
    a: parseStoredAlpha(storedShapeStrokeAlpha),
  };
  let shapeStrokeWidth =
    Number.isFinite(storedShapeStrokeWidth) && storedShapeStrokeWidth >= 0
      ? storedShapeStrokeWidth
      : 1;
  let textToolColorHex =
    storedTextColor && /^#[0-9a-f]{6}$/i.test(storedTextColor)
      ? storedTextColor
      : DEFAULT_TEXT_COLOR;
  const textToolColor = { ...hexToRgb(textToolColorHex), a: 1 };
  let textToolFontSize =
    Number.isFinite(storedTextFontSize) && storedTextFontSize > 0
      ? storedTextFontSize
      : 24;
  const applyPenColor = (hex: string) => {
    penColorHex = hex;
    const { r, g, b } = hexToRgb(hex);
    penFill.r = r;
    penFill.g = g;
    penFill.b = b;
    persist(PEN_COLOR_STORAGE_KEY, hex);
  };
  const applyPenWidth = (width: number) => {
    penWidth = width;
    persist(PEN_WIDTH_STORAGE_KEY, String(width));
  };
  const applyShapeFill = (hex: string) => {
    shapeFillHex = hex;
    const { r, g, b } = hexToRgb(hex);
    shapeFill.r = r;
    shapeFill.g = g;
    shapeFill.b = b;
    persist(SHAPE_FILL_STORAGE_KEY, hex);
  };
  const applyShapeFillAlpha = (alpha: number) => {
    shapeFill.a = alpha;
    persist(SHAPE_FILL_ALPHA_STORAGE_KEY, String(alpha));
  };
  const applyShapeStroke = (hex: string) => {
    shapeStrokeHex = hex;
    const { r, g, b } = hexToRgb(hex);
    shapeStroke.r = r;
    shapeStroke.g = g;
    shapeStroke.b = b;
    persist(SHAPE_STROKE_STORAGE_KEY, hex);
  };
  const applyShapeStrokeAlpha = (alpha: number) => {
    shapeStroke.a = alpha;
    persist(SHAPE_STROKE_ALPHA_STORAGE_KEY, String(alpha));
  };
  const applyShapeStrokeWidth = (width: number) => {
    shapeStrokeWidth = width;
    persist(SHAPE_STROKE_WIDTH_STORAGE_KEY, String(width));
  };
  const applyTextToolColor = (hex: string) => {
    textToolColorHex = hex;
    const { r, g, b } = hexToRgb(hex);
    textToolColor.r = r;
    textToolColor.g = g;
    textToolColor.b = b;
    persist(TEXT_COLOR_STORAGE_KEY, hex);
  };
  const applyTextToolFontSize = (fontSize: number) => {
    textToolFontSize = fontSize;
    persist(TEXT_FONT_SIZE_STORAGE_KEY, String(fontSize));
  };
  // Width number input appended below the color section in the pen dropdown.
  const buildPenWidthControl = (popover: HTMLDivElement) => {
    const row = document.createElement("label");
    row.className = "pen-width-control";
    const label = document.createElement("span");
    label.textContent = "Width";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.max = "64";
    input.step = "0.5";
    input.value = String(penWidth);
    input.setAttribute("aria-label", "Stroke width");
    input.addEventListener("input", () => {
      const width = Number(input.value);
      if (Number.isFinite(width) && width > 0) {
        applyPenWidth(width);
      }
    });
    row.append(label, input);
    popover.append(row);
  };
  const penPopover = attachColorPopover(ui.penToolButton, {
    manualToggle: true,
    getValue: () => penColorHex,
    onColor: applyPenColor,
    buildExtra: buildPenWidthControl,
  });
  const buildShapeStyleControls = (popover: HTMLDivElement) => {
    const strokeControls = document.createElement("div");
    strokeControls.className = "tool-stroke-controls";
    const sectionLabel = document.createElement("div");
    sectionLabel.className = "color-picker-section-label";
    sectionLabel.textContent = "Stroke";
    const colorRow = document.createElement("div");
    colorRow.className = "color-picker-value";
    const nativePicker = document.createElement("span");
    nativePicker.className = "color-picker-native-control";
    const nativeInput = document.createElement("input");
    nativeInput.type = "color";
    nativeInput.value = shapeStrokeHex;
    nativeInput.setAttribute("aria-label", "Stroke color");
    nativePicker.append(nativeInput);
    const hexInput = document.createElement("input");
    hexInput.type = "text";
    hexInput.inputMode = "text";
    hexInput.spellcheck = false;
    hexInput.value = shapeStrokeHex;
    hexInput.setAttribute("aria-label", "Stroke hex color");
    nativeInput.addEventListener("input", () => {
      applyShapeStroke(nativeInput.value);
      hexInput.value = nativeInput.value.toUpperCase();
    });
    hexInput.addEventListener("input", () => {
      const value = hexInput.value.trim();
      if (!/^#[0-9a-f]{6}$/i.test(value)) {
        return;
      }
      nativeInput.value = value;
      applyShapeStroke(value);
    });
    colorRow.append(nativePicker, hexInput);
    const alpha = document.createElement("input");
    alpha.type = "range";
    alpha.min = "0";
    alpha.max = "1";
    alpha.step = "0.01";
    alpha.value = String(shapeStroke.a);
    alpha.className = "color-picker-alpha";
    alpha.setAttribute("aria-label", "Stroke alpha");
    alpha.addEventListener("input", () => applyShapeStrokeAlpha(Number(alpha.value)));
    const row = document.createElement("label");
    row.className = "pen-width-control";
    const label = document.createElement("span");
    label.textContent = "Width";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "64";
    input.step = "0.5";
    input.value = String(shapeStrokeWidth);
    input.setAttribute("aria-label", "Stroke width");
    input.addEventListener("input", () => {
      const width = Number(input.value);
      if (Number.isFinite(width) && width >= 0) {
        applyShapeStrokeWidth(width);
      }
    });
    row.append(label, input);
    strokeControls.append(sectionLabel, colorRow, alpha, row);
    popover.append(strokeControls);
  };
  const buildTextToolControls = (popover: HTMLDivElement) => {
    const row = document.createElement("label");
    row.className = "pen-width-control";
    const label = document.createElement("span");
    label.textContent = "Size";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "4";
    input.max = "512";
    input.step = "1";
    input.value = String(textToolFontSize);
    input.setAttribute("aria-label", "Font size");
    input.addEventListener("input", () => {
      const fontSize = Number(input.value);
      if (Number.isFinite(fontSize) && fontSize > 0) {
        applyTextToolFontSize(fontSize);
      }
    });
    row.append(label, input);
    popover.append(row);
  };
  const shapeToolPopovers = new Map<CreationTool, ReturnType<typeof attachColorPopover>>([
    ["rect", attachColorPopover(ui.addRectButton, {
      label: "Fill",
      layout: "split",
      manualToggle: true,
      showAlpha: true,
      getAlpha: () => shapeFill.a,
      getValue: () => shapeFillHex,
      onColor: applyShapeFill,
      onAlpha: applyShapeFillAlpha,
      buildExtra: buildShapeStyleControls,
    })],
    ["frame", attachColorPopover(ui.addFrameButton, {
      label: "Fill",
      layout: "split",
      manualToggle: true,
      showAlpha: true,
      getAlpha: () => shapeFill.a,
      getValue: () => shapeFillHex,
      onColor: applyShapeFill,
      onAlpha: applyShapeFillAlpha,
      buildExtra: buildShapeStyleControls,
    })],
    ["circle", attachColorPopover(ui.addCircleButton, {
      label: "Fill",
      layout: "split",
      manualToggle: true,
      showAlpha: true,
      getAlpha: () => shapeFill.a,
      getValue: () => shapeFillHex,
      onColor: applyShapeFill,
      onAlpha: applyShapeFillAlpha,
      buildExtra: buildShapeStyleControls,
    })],
    ["triangle", attachColorPopover(ui.addTriangleButton, {
      label: "Fill",
      layout: "split",
      manualToggle: true,
      showAlpha: true,
      getAlpha: () => shapeFill.a,
      getValue: () => shapeFillHex,
      onColor: applyShapeFill,
      onAlpha: applyShapeFillAlpha,
      buildExtra: buildShapeStyleControls,
    })],
    ["text", attachColorPopover(ui.addTextButton, {
      manualToggle: true,
      getValue: () => textToolColorHex,
      onColor: applyTextToolColor,
      buildExtra: buildTextToolControls,
    })],
    ["pen", penPopover],
  ]);
  const toolButtons = new Map<CreationTool, HTMLButtonElement>([
    ["rect", ui.addRectButton],
    ["frame", ui.addFrameButton],
    ["circle", ui.addCircleButton],
    ["triangle", ui.addTriangleButton],
    ["text", ui.addTextButton],
    ["pen", ui.penToolButton],
  ]);
  const setActiveTool = (tool: CreationTool | null) => {
    activeTool = tool;
    penMode = tool === "pen";
    for (const [name, button] of toolButtons) {
      const selected = name === tool;
      button.setAttribute("aria-pressed", String(selected));
      const popover = shapeToolPopovers.get(name);
      if (selected) {
        popover?.open();
      } else {
        popover?.close();
      }
    }
  };
  const toggleTool = (tool: CreationTool) => {
    setActiveTool(activeTool === tool ? null : tool);
  };
  const setPenMode = (enabled: boolean) => {
    setActiveTool(enabled ? "pen" : null);
  };
  const smoothPenPoints = (points: Array<{ x: number; y: number }>, capacity: number) => {
    if (points.length < 3) {
      return points.slice(0, capacity);
    }
    const smoothed: Array<{ x: number; y: number }> = [points[0]];
    const catmull = (p0: number, p1: number, p2: number, p3: number, t: number) => {
      const t2 = t * t;
      const t3 = t2 * t;
      return 0.5 * (
        2 * p1 +
        (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3
      );
    };
    for (let i = 0; i < points.length - 1 && smoothed.length < capacity; i += 1) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const steps = Math.max(2, Math.min(10, Math.ceil(distance / 10)));
      for (let step = 1; step <= steps && smoothed.length < capacity; step += 1) {
        const t = step / steps;
        smoothed.push({
          x: catmull(p0.x, p1.x, p2.x, p3.x, t),
          y: catmull(p0.y, p1.y, p2.y, p3.y, t),
        });
      }
    }
    return smoothed;
  };
  // Ramer–Douglas–Peucker: drop points within ~0.5px of the chord. The smoothing
  // above oversamples straight runs with collinear points; this collapses them
  // (fewer segments → less memory/overdraw) while keeping curve detail.
  const PEN_SIMPLIFY_EPSILON = 0.5;
  const simplifyStroke = (points: Array<{ x: number; y: number }>) => {
    if (points.length < 3) {
      return points;
    }
    const keep = new Uint8Array(points.length);
    keep[0] = 1;
    keep[points.length - 1] = 1;
    const eps2 = PEN_SIMPLIFY_EPSILON * PEN_SIMPLIFY_EPSILON;
    const stack: Array<[number, number]> = [[0, points.length - 1]];
    while (stack.length > 0) {
      const [first, last] = stack.pop()!;
      const ax = points[first].x;
      const ay = points[first].y;
      const dx = points[last].x - ax;
      const dy = points[last].y - ay;
      const len2 = dx * dx + dy * dy;
      let maxD2 = 0;
      let index = -1;
      for (let i = first + 1; i < last; i += 1) {
        const px = points[i].x - ax;
        const py = points[i].y - ay;
        const cross = px * dy - py * dx;
        const d2 = len2 > 1e-12 ? (cross * cross) / len2 : px * px + py * py;
        if (d2 > maxD2) {
          maxD2 = d2;
          index = i;
        }
      }
      if (index !== -1 && maxD2 > eps2) {
        keep[index] = 1;
        stack.push([first, index], [index, last]);
      }
    }
    const out: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < points.length; i += 1) {
      if (keep[i]) out.push(points[i]);
    }
    return out;
  };
  const writePathPoints = (points: Array<{ x: number; y: number }>) => {
    const capacity = wasm.blitz_path_input_capacity();
    const simplified = simplifyStroke(smoothPenPoints(points, capacity));
    const count = Math.min(simplified.length, capacity);
    if (count < 2) {
      return 0;
    }
    new Float32Array(
      wasm.memory.buffer,
      wasm.blitz_path_input_ptr(),
      count * 2,
    ).set(simplified.slice(0, count).flatMap((point) => [point.x, point.y]));
    return count;
  };
  const updatePenDraft = (points: Array<{ x: number; y: number }>) => {
    if (emptyStateVisible) {
      emptyStateVisible = false;
      ui.emptyState.hidden = true;
    }
    const count = writePathPoints(points);
    if (count < 2) {
      wasm.blitz_clear_path_draft();
      return;
    }
    wasm.blitz_update_path_draft(
      count,
      penFill.r,
      penFill.g,
      penFill.b,
      penFill.a,
      penWidth,
    );
  };
  const clearPenDraft = () => {
    wasm.blitz_clear_path_draft();
    updateEmptyState();
  };
  const createPenStroke = (points: Array<{ x: number; y: number }>) => {
    const count = writePathPoints(points);
    if (count < 2) {
      wasm.blitz_clear_path_draft();
      return;
    }
    sceneHistory.transact(() => {
      wasm.blitz_clear_path_draft();
      wasm.blitz_create_path(
        count,
        penFill.r,
        penFill.g,
        penFill.b,
        penFill.a,
        penWidth,
      );
    });
    updateSelectionState();
    updateEmptyState();
  };
  type ShapeDraft = {
    tool: Exclude<CreationTool, "pen" | "text">;
    objectId: ObjectIdWords;
    startCanvas: { x: number; y: number };
    startWorld: { x: number; y: number };
  };
  let shapeDraft: ShapeDraft | null = null;
  const canvasToWorld = (point: { x: number; y: number }) => {
    const uniforms = new Float32Array(
      wasm.memory.buffer,
      uniformPtr,
      wasm.blitz_uniform_f32_count(),
    );
    const zoom = uniforms[4] || 1;
    return {
      x: (point.x - uniforms[0] * 0.5) / zoom + uniforms[2],
      y: (point.y - uniforms[1] * 0.5) / zoom + uniforms[3],
    };
  };
  const shapeBoundsFromDrag = (draft: ShapeDraft, point: { x: number; y: number }) => {
    const world = canvasToWorld(point);
    const dx = world.x - draft.startWorld.x;
    const dy = world.y - draft.startWorld.y;
    const clickLike =
      Math.hypot(point.x - draft.startCanvas.x, point.y - draft.startCanvas.y) < 3;
    if (clickLike) {
      if (draft.tool === "circle") {
        return {
          x: draft.startWorld.x - 48,
          y: draft.startWorld.y - 48,
          width: 96,
          height: 96,
        };
      }
      return {
        x: draft.startWorld.x,
        y: draft.startWorld.y,
        width: 160,
        height: draft.tool === "frame" ? 100 : 96,
      };
    }
    if (draft.tool === "circle") {
      const side = Math.max(1, Math.max(Math.abs(dx), Math.abs(dy)));
      return {
        x: dx < 0 ? draft.startWorld.x - side : draft.startWorld.x,
        y: dy < 0 ? draft.startWorld.y - side : draft.startWorld.y,
        width: side,
        height: side,
      };
    }
    return {
      x: Math.min(draft.startWorld.x, world.x),
      y: Math.min(draft.startWorld.y, world.y),
      width: Math.max(1, Math.abs(dx)),
      height: Math.max(1, Math.abs(dy)),
    };
  };
  const updateDraftObject = (draft: ShapeDraft, point: { x: number; y: number }) => {
    const bounds = shapeBoundsFromDrag(draft, point);
    const kind =
      draft.tool === "triangle"
        ? blitzShapeTriangle
        : draft.tool === "circle"
          ? blitzShapeOval
          : draft.tool === "frame"
            ? blitzShapeFrame
            : blitzShapeRect;
    const updateX = draft.tool === "circle" ? bounds.x + bounds.width * 0.5 : bounds.x;
    const updateY = draft.tool === "circle" ? bounds.y + bounds.height * 0.5 : bounds.y;
    wasm.blitz_update_object(
      draft.objectId[0],
      draft.objectId[1],
      draft.objectId[2],
      draft.objectId[3],
      kind,
      blitzUpdateGeometry,
      updateX,
      updateY,
      bounds.width,
      bounds.height,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    );
  };
  const createToolText = (point: { x: number; y: number }) => {
    const world = canvasToWorld(point);
    const textLength = writeTextInput("Text");
    if (textLength < 0) {
      return;
    }
    sceneHistory.transact(() => {
      wasm.blitz_create_text(
        world.x,
        world.y,
        textToolFontSize,
        textToolColor.r,
        textToolColor.g,
        textToolColor.b,
        textToolColor.a,
        textLength,
        0,
        1.2,
        0,
        0,
      );
    });
    setActiveTool(null);
    updateSelectionState();
    updateEmptyState();
    beginTextEdit();
  };
  const beginShapeDraft = (point: { x: number; y: number }) => {
    if (!activeTool || activeTool === "pen") {
      return false;
    }
    if (activeTool === "text") {
      createToolText(point);
      return false;
    }
    const world = canvasToWorld(point);
    sceneHistory.begin();
    let entity = blitzInvalidIndex;
    if (activeTool === "frame") {
      entity = wasm.blitz_create_frame(
        world.x,
        world.y,
        1,
        1,
        shapeFill.r,
        shapeFill.g,
        shapeFill.b,
        shapeFill.a,
        shapeStroke.r,
        shapeStroke.g,
        shapeStroke.b,
        shapeStroke.a,
        shapeStrokeWidth,
        textToolColor.r,
        textToolColor.g,
        textToolColor.b,
        textToolColor.a,
        18,
        0,
      );
    } else if (activeTool === "circle") {
      entity = wasm.blitz_create_oval(
        world.x - 0.5,
        world.y - 0.5,
        1,
        1,
        shapeFill.r,
        shapeFill.g,
        shapeFill.b,
        shapeFill.a,
        shapeStroke.r,
        shapeStroke.g,
        shapeStroke.b,
        shapeStroke.a,
        shapeStrokeWidth,
      );
    } else {
      const create =
        activeTool === "rect" ? wasm.blitz_create_rect : wasm.blitz_create_triangle;
      entity = create(
        world.x,
        world.y,
        1,
        1,
        shapeFill.r,
        shapeFill.g,
        shapeFill.b,
        shapeFill.a,
        shapeStroke.r,
        shapeStroke.g,
        shapeStroke.b,
        shapeStroke.a,
        shapeStrokeWidth,
      );
    }
    if (entity === blitzInvalidIndex) {
      sceneHistory.cancel();
      return false;
    }
    shapeDraft = {
      tool: activeTool,
      objectId: readLastCreatedObjectId(),
      startCanvas: point,
      startWorld: world,
    };
    updateSelectionState();
    return true;
  };
  const updateShapeDraft = (point: { x: number; y: number }) => {
    if (!shapeDraft) {
      return;
    }
    updateDraftObject(shapeDraft, point);
    updateSelectionState();
  };
  const commitShapeDraft = (point: { x: number; y: number }) => {
    if (!shapeDraft) {
      return;
    }
    updateDraftObject(shapeDraft, point);
    shapeDraft = null;
    sceneHistory.commit();
    setActiveTool(null);
    updateSelectionState();
    updateEmptyState();
  };
  const cancelShapeDraft = () => {
    if (!shapeDraft) {
      return;
    }
    shapeDraft = null;
    sceneHistory.cancel();
    updateSelectionState();
    updateEmptyState();
  };
  const cancelActiveTool = () => {
    cancelShapeDraft();
    wasm.blitz_clear_path_draft();
    setActiveTool(null);
    updateEmptyState();
  };
  ui.penToolButton.addEventListener("click", () => {
    setPenMode(!penMode);
  });
  stopDragging = setupCanvasInteractions(ui.canvas, wasm, {
    beginEdit: sceneHistory.begin,
    beginTextEdit,
    cancelEdit: sceneHistory.cancel,
    commitEdit: sceneHistory.commit,
    createPenStroke,
    beginShapeDraft,
    updateShapeDraft,
    commitShapeDraft,
    cancelShapeDraft,
    updatePenDraft,
    clearPenDraft,
    isCreationToolActive: () => activeTool !== null,
    isPenMode: () => penMode,
    onSelectionChanged: updateSelectionState,
  }).stopDragging;
  const deleteSelection = () => {
    if (wasm.blitz_has_selection() === 0) {
      return;
    }
    stopDragging();
    sceneHistory.transact(wasm.blitz_delete_selected);
    updateSelectionState();
  };
  const mcpAdapter = createCanvasMcpAdapter(wasm, {
    beginHistory: sceneHistory.begin,
    commitHistory: sceneHistory.commit,
    stopDragging,
    updateSelectionState,
  });
  const sceneFileStorage = setupSceneFileStorage(
    wasm,
    {
      openMenu: ui.openSceneMenu,
      saveMenu: ui.saveSceneMenu,
      saveIndicator: ui.saveSceneIndicator,
      newFileButton: ui.newSceneFileButton,
      chooseFileButton: ui.chooseSceneFileButton,
      saveButton: ui.saveSceneButton,
      saveAsButton: ui.saveSceneAsButton,
      saveCurrentViewpointInput: ui.saveCurrentViewpointInput,
      recentTargets: [
        {
          list: ui.recentScenes,
          visibilityElements: [ui.recentScenesDivider],
          menuItems: true,
        },
        {
          list: ui.emptyRecentScenes,
          visibilityElements: [ui.emptyRecentSection],
        },
      ],
    },
    {
      historyStateId: sceneHistory.stateId,
      onLoaded() {
        sceneHistory.reset();
        stopDragging();
        updateSelectionState();
        updateEmptyState();
      },
      onError: ui.showFallback,
    },
  );
  const droppedBlitzFile = (event: DragEvent) => {
    const files = Array.from(event.dataTransfer?.files ?? []);
    return files.find(
      (file) =>
        file.name.toLowerCase().endsWith(".blitz") ||
        file.type === "application/octet-stream",
    );
  };
  window.addEventListener("dragover", (event) => {
    if (!droppedBlitzFile(event)) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  });
  window.addEventListener("drop", (event) => {
    const file = droppedBlitzFile(event);
    if (!file) {
      return;
    }
    event.preventDefault();
    stopDragging();
    sceneFileStorage.loadFile(file);
  });
  setupMcpBridge(
    {
      dialog: ui.mcpSettingsDialog,
      openButton: ui.openMcpSettingsButton,
      closeButton: ui.closeMcpSettingsButton,
      form: ui.mcpSettingsForm,
      urlInput: ui.mcpBridgeUrlInput,
      tokenInput: ui.mcpBridgeTokenInput,
      disconnectButton: ui.disconnectMcpBridgeButton,
      status: ui.mcpBridgeStatus,
    },
    mcpAdapter,
  );
  const remoteCursorLayer = document.createElement("div");
  remoteCursorLayer.style.cssText =
    "position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:50;";
  document.body.appendChild(remoteCursorLayer);
  const remoteCursors = createRemoteCursors(remoteCursorLayer);
  collaborationController = setupWsCollaboration(
    {
      dialog: ui.collaborationSettingsDialog,
      openButton: ui.openCollaborationSettingsButton,
      closeButton: ui.closeCollaborationSettingsButton,
      form: ui.collaborationSettingsForm,
      urlInput: ui.collaborationUrlInput,
      shareLinkInput: ui.collaborationShareLinkInput,
      disconnectButton: ui.disconnectCollaborationButton,
      status: ui.collaborationStatus,
      peerId: ui.collaborationPeerId,
      debugLog: ui.collaborationDebugLog,
    },
    {
      actorId,
      captureChanges() {
        return readSceneFileBuffer(wasm, wasm.blitz_crdt_capture_changes());
      },
      captureBaseline() {
        return readSceneFileBuffer(wasm, wasm.blitz_crdt_capture_baseline());
      },
      applyOps(bytes) {
        applyingRemoteCollaboration = true;
        try {
          applyCrdtOps(wasm, bytes);
          updateSelectionState();
          updateEmptyState();
        } finally {
          applyingRemoteCollaboration = false;
        }
      },
      hasPendingChanges: () => wasm.blitz_crdt_has_pending() === 1,
      localRevision: () => wasm.blitz_scene_revision(),
      onRemoteApplied() {
        updateHistoryControls();
      },
      onRemoteCursor(peerId, worldX, worldY) {
        remoteCursors.update(peerId, worldX, worldY);
      },
      onActiveChange(active) {
        wasm.blitz_crdt_set_enabled(active ? 1 : 0);
      },
      onError: ui.showFallback,
    },
  );
  const runSceneAction = (action: () => void) => {
    stopDragging();
    sceneHistory.transact(action);
    updateSelectionState();
  };
  setupUiActions(
    {
      addCircleButton: ui.addCircleButton,
      addFrameButton: ui.addFrameButton,
      addRectButton: ui.addRectButton,
      addTextButton: ui.addTextButton,
      addTriangleButton: ui.addTriangleButton,
      bringToFrontButton: ui.bringToFrontButton,
      deleteButton: ui.deleteButton,
      emptyDemoTemplateButton: ui.emptyDemoTemplateButton,
      emptyOpenFileButton: ui.emptyOpenFileButton,
      sendToBackButton: ui.sendToBackButton,
      shapeMenu: ui.shapeMenu,
      stressTestButton: ui.stressTestButton,
      toggleBackgroundThemeButton: ui.toggleBackgroundThemeButton,
      toggleGridButton: ui.toggleGridButton,
      toggleStatsButton: ui.toggleStatsButton,
    },
    {
      addCircle: () => {
        toggleTool("circle");
      },
      addFrame: () => {
        toggleTool("frame");
      },
      addRect: () => {
        toggleTool("rect");
      },
      addText: () => {
        toggleTool("text");
      },
      addTriangle: () => {
        toggleTool("triangle");
      },
      bringToFront: () => {
        sceneHistory.transact(wasm.blitz_bring_to_front);
      },
      deleteSelection,
      loadDemoTemplate() {
        runSceneAction(wasm.blitz_load_demo_template);
        updateEmptyState();
      },
      openFile: sceneFileStorage.openFile,
      sendToBack: () => {
        sceneHistory.transact(wasm.blitz_send_to_back);
      },
      stressTest: () => runSceneAction(wasm.blitz_stress_test),
      toggleGrid() {
        gridVisible = !gridVisible;
        ui.toggleGridButton.setAttribute(
          "aria-pressed",
          gridVisible ? "true" : "false",
        );
      },
      toggleBackgroundTheme() {
        backgroundTheme = backgroundTheme === "paper" ? "dark" : "paper";
        persistBackgroundTheme(backgroundTheme);
        syncBackgroundThemeUi();
      },
      toggleStats() {
        statsVisible = !statsVisible;
        ui.statsPanel.hidden = !statsVisible;
        updateSidePanelOpen();
        ui.toggleStatsButton.setAttribute(
          "aria-pressed",
          statsVisible ? "true" : "false",
        );
        if (statsVisible) {
          updateStats();
        }
      },
    },
  );
  setupStyleControls(
    {
      containerInput: ui.selectedContainerInput,
      frameTitleInput: ui.selectedFrameTitleInput,
      fillInput: ui.selectedFillInput,
      fillOpacityInput: ui.selectedFillOpacityInput,
      strokeInput: ui.selectedStrokeInput,
      strokeOpacityInput: ui.selectedStrokeOpacityInput,
      strokeWidthInput: ui.selectedStrokeWidthInput,
      textAutoWidthButton: ui.selectedTextAutoWidthButton,
      textColorInput: ui.selectedTextColorInput,
      textFontSizeInput: ui.selectedTextFontSizeInput,
      textOpacityInput: ui.selectedTextOpacityInput,
    },
    {
      beginTransaction: () => {
        sceneHistory.begin();
      },
      commitTransaction: sceneHistory.commit,
      setFill(red, green, blue) {
        wasm.blitz_set_selected_fill(red, green, blue);
        updateStyleIsland();
      },
      setFillOpacity(opacity) {
        wasm.blitz_set_selected_fill_opacity(opacity);
        updateStyleIsland();
      },
      setStroke(red, green, blue) {
        wasm.blitz_set_selected_stroke(red, green, blue);
        updateStyleIsland();
      },
      setStrokeOpacity(opacity) {
        wasm.blitz_set_selected_stroke_opacity(opacity);
        updateStyleIsland();
      },
      setStrokeWidth(width) {
        wasm.blitz_set_selected_stroke_width(width);
        updateStyleIsland();
      },
      setContainer(enabled) {
        sceneHistory.transact(() => {
          wasm.blitz_set_selected_container(enabled ? 1 : 0);
        });
        updateStyleIsland();
      },
      setFrameTitle(title) {
        const textLength = writeTextInput(title);
        if (textLength < 0) {
          ui.showFallback(
            `Frame title is too long. Maximum UTF-8 size is ${wasm.blitz_text_input_capacity() - 1} bytes.`,
          );
          updateStyleIsland();
          return;
        }
        sceneHistory.transact(() => {
          wasm.blitz_set_selected_frame_title(textLength);
        });
        updateStyleIsland();
      },
      setTextColor(red, green, blue) {
        wasm.blitz_set_selected_text_color(red, green, blue);
        updateStyleIsland();
      },
      setTextOpacity(opacity) {
        wasm.blitz_set_selected_text_opacity(opacity);
        updateStyleIsland();
      },
      setTextFontSize(fontSize) {
        wasm.blitz_set_selected_text_font_size(fontSize);
        if (textEditSession) {
          textEditSession = selectedTextEditSession();
          resizeTextEditorToValue();
        }
        updateStyleIsland();
      },
      resetTextWidth() {
        sceneHistory.transact(wasm.blitz_reset_selected_text_width);
        updateStyleIsland();
      },
    },
  );
  const undoHistory = () => {
    if (sceneHistory.undo()) {
      updateSelectionState();
      updateEmptyState();
    }
  };
  const redoHistory = () => {
    if (sceneHistory.redo()) {
      updateSelectionState();
      updateEmptyState();
    }
  };
  ui.undoButton.addEventListener("click", undoHistory);
  ui.redoButton.addEventListener("click", redoHistory);
  setupKeyboardShortcuts({
    activateTool(tool) {
      toggleTool(tool);
    },
    beginTextEdit,
    cancelActiveTool,
    copySelection,
    deleteSelection,
    duplicateSelection,
    openFile: sceneFileStorage.openFile,
    pasteClipboard,
    redo: redoHistory,
    saveFile: sceneFileStorage.saveFile,
    selectAll() {
      wasm.blitz_select_all();
      updateSelectionState();
    },
    stopDragging,
    undo: undoHistory,
  });
  const render = () => {
    resize();
    sceneFileStorage.syncDirtyState();
    if (!applyingRemoteCollaboration && !sceneHistory.isActive()) {
      collaborationController?.publishLocalChange();
    }
    updateEmptyState();
    const now = performance.now();
    if (lastFrameStamp) {
      frameMs = frameMs * 0.9 + (now - lastFrameStamp) * 0.1;
    }
    lastFrameStamp = now;
    // Call the trigger pointer first: it runs extract_static_shapes() (guarded
    // by the dirty flag) so the version below reflects the latest build.
    let bindGroupsDirty = false;
    const shapeCommandPtr = wasm.blitz_shape_command_ptr();
    const shapeCommandVersion = wasm.blitz_shape_command_version();
    if (shapeCommandVersion !== lastUploadedShapeCommandVersion) {
      const shapeCommandCount = wasm.blitz_shape_command_count();
      const rectDrawPtr = wasm.blitz_rect_draw_ptr();
      const rectDrawCount = wasm.blitz_rect_draw_count();
      const triangleDrawPtr = wasm.blitz_triangle_draw_ptr();
      const triangleDrawCount = wasm.blitz_triangle_draw_count();
      const ovalDrawPtr = wasm.blitz_oval_draw_ptr();
      const ovalDrawCount = wasm.blitz_oval_draw_count();
      const pathDrawPtr = wasm.blitz_path_draw_ptr();
      const pathDrawCount = wasm.blitz_path_draw_count();
      const pathSegmentPtr = wasm.blitz_path_segment_ptr();
      const pathSegmentCount = wasm.blitz_path_segment_count();
      currentShapeCommandCount = shapeCommandCount;
      const eShape = ensureStorage(shapeCommandStorageBuffer, shapeCommandCapacity, shapeCommandCount, maxShapes, shapeCommandStride, storageDstUsage, "Blitz Shape Command Storage");
      shapeCommandStorageBuffer = eShape.buffer;
      shapeCommandCapacity = eShape.capacity;
      bindGroupsDirty ||= eShape.grew;
      const eVisible = ensureStorage(visibleCommandStorageBuffer, visibleCommandCapacity, shapeCommandCount, maxShapes, shapeCommandStride, GPUBufferUsage.STORAGE, "Blitz Visible Command Storage");
      visibleCommandStorageBuffer = eVisible.buffer;
      visibleCommandCapacity = eVisible.capacity;
      bindGroupsDirty ||= eVisible.grew;
      const eRect = ensureStorage(rectStorageBuffer, rectCapacity, rectDrawCount, maxShapes, rectDrawStride, storageDstUsage, "Blitz Rect Draw Storage");
      rectStorageBuffer = eRect.buffer;
      rectCapacity = eRect.capacity;
      bindGroupsDirty ||= eRect.grew;
      const eTriangle = ensureStorage(triangleStorageBuffer, triangleCapacity, triangleDrawCount, maxShapes, triangleDrawStride, storageDstUsage, "Blitz Triangle Draw Storage");
      triangleStorageBuffer = eTriangle.buffer;
      triangleCapacity = eTriangle.capacity;
      bindGroupsDirty ||= eTriangle.grew;
      const eOval = ensureStorage(ovalStorageBuffer, ovalCapacity, ovalDrawCount, maxShapes, ovalDrawStride, storageDstUsage, "Blitz Oval Draw Storage");
      ovalStorageBuffer = eOval.buffer;
      ovalCapacity = eOval.capacity;
      bindGroupsDirty ||= eOval.grew;
      const ePath = ensureStorage(pathStorageBuffer, pathCapacity, pathDrawCount, maxShapes, pathDrawStride, storageDstUsage, "Blitz Path Draw Storage");
      pathStorageBuffer = ePath.buffer;
      pathCapacity = ePath.capacity;
      bindGroupsDirty ||= ePath.grew;
      const ePathSegment = ensureStorage(pathSegmentStorageBuffer, pathSegmentCapacity, pathSegmentCount, maxPathSegments, pathSegmentStride, storageDstUsage, "Blitz Path Segment Storage");
      pathSegmentStorageBuffer = ePathSegment.buffer;
      pathSegmentCapacity = ePathSegment.capacity;
      bindGroupsDirty ||= ePathSegment.grew;
      if (shapeCommandCount > 0) {
        device.queue.writeBuffer(
          shapeCommandStorageBuffer,
          0,
          new Uint32Array(
            wasm.memory.buffer,
            shapeCommandPtr,
            shapeCommandCount * shapeCommandU32Count,
          ),
        );
      }
      if (rectDrawCount > 0) {
        device.queue.writeBuffer(
          rectStorageBuffer,
          0,
          new Float32Array(
            wasm.memory.buffer,
            rectDrawPtr,
            rectDrawCount * rectDrawF32Count,
          ),
        );
      }
      if (triangleDrawCount > 0) {
        device.queue.writeBuffer(
          triangleStorageBuffer,
          0,
          new Float32Array(
            wasm.memory.buffer,
            triangleDrawPtr,
            triangleDrawCount * triangleDrawF32Count,
          ),
        );
      }
      if (ovalDrawCount > 0) {
        device.queue.writeBuffer(
          ovalStorageBuffer,
          0,
          new Float32Array(
            wasm.memory.buffer,
            ovalDrawPtr,
            ovalDrawCount * ovalDrawF32Count,
          ),
        );
      }
      if (pathDrawCount > 0) {
        device.queue.writeBuffer(
          pathStorageBuffer,
          0,
          new Float32Array(
            wasm.memory.buffer,
            pathDrawPtr,
            pathDrawCount * pathDrawF32Count,
          ),
        );
      }
      // Clamp to what the (limit-capped) buffer can hold; excess strokes are
      // dropped rather than crashing on an over-limit write.
      const uploadableSegments = Math.min(pathSegmentCount, pathSegmentCapacity);
      if (uploadableSegments > 0) {
        device.queue.writeBuffer(
          pathSegmentStorageBuffer,
          0,
          new Float32Array(
            wasm.memory.buffer,
            pathSegmentPtr,
            uploadableSegments * pathSegmentF32Count,
          ),
        );
      }
      pathDrawList = [];
      if (pathDrawCount > 0) {
        const records = new Float32Array(
          wasm.memory.buffer,
          pathDrawPtr,
          pathDrawCount * pathDrawF32Count,
        );
        const clampTier = (offset: number, count: number) => {
          if (count <= 0 || offset >= uploadableSegments) return [0, 0];
          return [offset, Math.min(count, uploadableSegments - offset)];
        };
        for (let p = 0; p < pathDrawCount; p += 1) {
          const o = p * pathDrawF32Count;
          const [fullOffset, fullCount] = clampTier(records[o + 12], records[o + 13]);
          if (fullCount <= 0) continue;
          const [coarseOffset, coarseCount] = clampTier(records[o + 14], records[o + 15]);
          const rotation = records[o + 11];
          const minX = records[o];
          const minY = records[o + 1];
          const maxX = records[o] + records[o + 2];
          const maxY = records[o + 1] + records[o + 3];
          const centerX = (minX + maxX) * 0.5;
          const centerY = (minY + maxY) * 0.5;
          const radius = Math.hypot(maxX - minX, maxY - minY) * 0.5;
          pathDrawList.push({
            minX: rotation === 0 ? minX : centerX - radius,
            minY: rotation === 0 ? minY : centerY - radius,
            maxX: rotation === 0 ? maxX : centerX + radius,
            maxY: rotation === 0 ? maxY : centerY + radius,
            dragged: records[o + 9] > 0.5,
            fullOffset,
            fullCount,
            coarseOffset: coarseCount > 0 ? coarseOffset : fullOffset,
            coarseCount: coarseCount > 0 ? coarseCount : fullCount,
          });
        }
      }
      lastUploadedShapeCommandVersion = shapeCommandVersion;
    }
    const dynCommandPtr = wasm.blitz_dyn_command_ptr();
    const dynVersion = wasm.blitz_dyn_version();
    if (dynVersion !== lastUploadedDynVersion) {
      const dynCommandCount = wasm.blitz_dyn_command_count();
      const dynOverlayCommandStart = wasm.blitz_dyn_overlay_command_start();
      const dynRectPtr = wasm.blitz_dyn_rect_ptr();
      const dynRectCount = wasm.blitz_dyn_rect_count();
      const textDrawPtr = wasm.blitz_text_draw_ptr();
      const textDrawCount = wasm.blitz_text_draw_count();
      currentDynCommandCount = dynCommandCount;
      currentDynOverlayCommandStart = dynOverlayCommandStart;
      const eDynCommand = ensureStorage(dynCommandStorageBuffer, dynCommandCapacity, dynCommandCount, maxDynCommands, shapeCommandStride, storageDstUsage, "Blitz Dynamic Command Storage");
      dynCommandStorageBuffer = eDynCommand.buffer;
      dynCommandCapacity = eDynCommand.capacity;
      bindGroupsDirty ||= eDynCommand.grew;
      const eDynRect = ensureStorage(dynRectStorageBuffer, dynRectCapacity, dynRectCount, maxDynRects, rectDrawStride, storageDstUsage, "Blitz Dynamic Rect Storage");
      dynRectStorageBuffer = eDynRect.buffer;
      dynRectCapacity = eDynRect.capacity;
      bindGroupsDirty ||= eDynRect.grew;
      const eText = ensureStorage(textStorageBuffer, textCapacity, textDrawCount, maxTextDraws, textDrawStride, storageDstUsage, "Blitz Text Draw Storage");
      textStorageBuffer = eText.buffer;
      textCapacity = eText.capacity;
      bindGroupsDirty ||= eText.grew;
      if (dynCommandCount > 0) {
        device.queue.writeBuffer(
          dynCommandStorageBuffer,
          0,
          new Uint32Array(
            wasm.memory.buffer,
            dynCommandPtr,
            dynCommandCount * shapeCommandU32Count,
          ),
        );
      }
      if (dynRectCount > 0) {
        device.queue.writeBuffer(
          dynRectStorageBuffer,
          0,
          new Float32Array(
            wasm.memory.buffer,
            dynRectPtr,
            dynRectCount * rectDrawF32Count,
          ),
        );
      }
      if (textDrawCount > 0) {
        device.queue.writeBuffer(
          textStorageBuffer,
          0,
          new Float32Array(
            wasm.memory.buffer,
            textDrawPtr,
            textDrawCount * textDrawF32Count,
          ),
        );
      }
      lastUploadedDynVersion = dynVersion;
    }
    // The pen draft updates every frame while drawing; uploading only its tiny
    // buffers keeps that independent of the (possibly huge) static stream.
    const draftVersion = wasm.blitz_path_draft_version();
    if (draftVersion !== lastUploadedDraftVersion) {
      lastUploadedDraftVersion = draftVersion;
      const draftSegmentCount = wasm.blitz_path_draft_segment_count();
      currentDraftSegmentCount = draftSegmentCount;
      if (draftSegmentCount > 0) {
        const eDraft = ensureStorage(draftSegmentBuffer, draftSegmentCapacity, draftSegmentCount, maxPathSegments, pathSegmentStride, storageDstUsage, "Blitz Draft Segment Storage");
        draftSegmentBuffer = eDraft.buffer;
        draftSegmentCapacity = eDraft.capacity;
        bindGroupsDirty ||= eDraft.grew;
        device.queue.writeBuffer(
          draftDrawBuffer,
          0,
          new Float32Array(wasm.memory.buffer, wasm.blitz_path_draft_draw_ptr(), pathDrawF32Count),
        );
        device.queue.writeBuffer(
          draftSegmentBuffer,
          0,
          new Float32Array(
            wasm.memory.buffer,
            wasm.blitz_path_draft_segment_ptr(),
            draftSegmentCount * pathSegmentF32Count,
          ),
        );
      }
    }
    const uniforms = new Float32Array(
      wasm.memory.buffer,
      uniformPtr,
      wasm.blitz_uniform_f32_count(),
    );
    uniforms.set(backgroundColors[backgroundTheme], 8);
    uniforms[18] = gridVisible ? 1 : 0;
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);
    remoteCursors.render({
      viewportWidth: uniforms[0],
      viewportHeight: uniforms[1],
      cameraX: uniforms[2],
      cameraY: uniforms[3],
      zoom: uniforms[4] || 1,
      canvas: ui.canvas,
    });
    positionTextEditor();
    const zoomPercent = Math.round(uniforms[4] * 100);
    if (zoomPercent !== lastZoomPercent) {
      lastZoomPercent = zoomPercent;
      ui.zoomIndicator.textContent = `${zoomPercent}%`;
    }
    if (bindGroupsDirty) {
      rebuildBindGroups();
    }
    // The cull shader compacts visible static commands with atomicAdd, so the
    // indirect instance count must start at zero. Initializing it with the full
    // command count would draw stale commands left in the visible buffer.
    drawArgsReset[1] = 0;
    device.queue.writeBuffer(drawArgsBuffer, 0, drawArgsReset);
    const encoder = device.createCommandEncoder({
      label: "Blitz Render Encoder",
    });
    if (currentShapeCommandCount > 0) {
      const cullPass = encoder.beginComputePass({ label: "Blitz Cull Pass" });
      cullPass.setPipeline(cullPipeline);
      cullPass.setBindGroup(0, cullBindGroup);
      cullPass.dispatchWorkgroups(Math.ceil(currentShapeCommandCount / 64));
      cullPass.end();
    }
    const frameView = context.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
      label: "Blitz Render Pass",
      colorAttachments: [
        {
          view: frameView,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: depthView!,
        depthClearValue: 0.0,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });
    pass.setPipeline(backgroundPipeline);
    pass.setBindGroup(0, backgroundBindGroup);
    pass.draw(3);
    pass.setPipeline(shapePipeline);
    if (currentShapeCommandCount > 0) {
      pass.setBindGroup(0, staticRenderBindGroup);
      pass.drawIndirect(drawArgsBuffer, 0);
    }
    if (currentDynOverlayCommandStart > 0) {
      pass.setPipeline(shapePipeline);
      pass.setBindGroup(0, dynamicRenderBindGroup);
      pass.draw(6, currentDynOverlayCommandStart);
    }
    pass.end();

    const drawPaths = pathDrawList.length > 0 || currentDraftSegmentCount > 0;
    if (drawPaths) {
      const pathPass = encoder.beginRenderPass({
        label: "Blitz Path MSAA Pass",
        colorAttachments: [
          {
            view: pathMsaaView!,
            resolveTarget: pathResolveView!,
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: "clear",
            storeOp: "discard",
          },
        ],
        depthStencilAttachment: {
          view: pathMsaaDepthView!,
          depthClearValue: 0.0,
          depthLoadOp: "clear",
          depthStoreOp: "discard",
        },
      });
      if (currentShapeCommandCount > 0) {
        pathPass.setPipeline(shapeMsaaDepthPipeline);
        pathPass.setBindGroup(0, staticRenderBindGroup);
        pathPass.drawIndirect(drawArgsBuffer, 0);
      }
      if (currentDynOverlayCommandStart > 0) {
        pathPass.setPipeline(shapeMsaaDepthPipeline);
        pathPass.setBindGroup(0, dynamicRenderBindGroup);
        pathPass.draw(6, currentDynOverlayCommandStart);
      }
      // Per-stroke viewport cull + LOD: skip off-screen/sub-pixel strokes, draw a
      // coarse tier for small ones, and one instanced capsule draw per visible
      // stroke (firstInstance = the chosen tier's segment offset).
      pathPass.setPipeline(pathPipeline);
      pathPass.setBindGroup(0, staticRenderBindGroup);
      const scale = uniforms[4];
      const halfW = (uniforms[0] * 0.5) / scale;
      const halfH = (uniforms[1] * 0.5) / scale;
      const viewMinX = uniforms[2] - halfW;
      const viewMaxX = uniforms[2] + halfW;
      const viewMinY = uniforms[3] - halfH;
      const viewMaxY = uniforms[3] + halfH;
      const LOD_COARSE_BELOW_PX = 24;
      for (let p = 0; p < pathDrawList.length; p += 1) {
        const d = pathDrawList[p];
        let offset = d.fullOffset;
        let count = d.fullCount;
        if (!d.dragged) {
          if (
            d.maxX < viewMinX ||
            d.minX > viewMaxX ||
            d.maxY < viewMinY ||
            d.minY > viewMaxY
          ) {
            continue;
          }
          const screenW = (d.maxX - d.minX) * scale;
          const screenH = (d.maxY - d.minY) * scale;
          if (screenW < 1 && screenH < 1) {
            continue; // sub-pixel
          }
          if (Math.hypot(screenW, screenH) < LOD_COARSE_BELOW_PX) {
            offset = d.coarseOffset;
            count = d.coarseCount;
          }
        }
        pathPass.draw(6, count, 0, offset);
      }
      if (currentDraftSegmentCount > 0) {
        // The in-progress pen stroke: always full detail, drawn on top.
        pathPass.setPipeline(pathPipeline);
        pathPass.setBindGroup(0, draftRenderBindGroup);
        pathPass.draw(6, currentDraftSegmentCount, 0, 0);
      }
      pathPass.end();

      const compositePass = encoder.beginRenderPass({
        label: "Blitz Path Composite Pass",
        colorAttachments: [
          {
            view: frameView,
            loadOp: "load",
            storeOp: "store",
          },
        ],
      });
      compositePass.setPipeline(pathCompositePipeline);
      compositePass.setBindGroup(0, pathCompositeBindGroup);
      compositePass.draw(3);
      compositePass.end();
    }

    const overlayPass = encoder.beginRenderPass({
      label: "Blitz Overlay Pass",
      colorAttachments: [
        {
          view: frameView,
          loadOp: "load",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: depthView!,
        depthLoadOp: "load",
        depthStoreOp: "store",
      },
    });
    if (currentDynCommandCount > 0) {
      const overlayCount = currentDynCommandCount - currentDynOverlayCommandStart;
      overlayPass.setPipeline(shapePipeline);
      overlayPass.setBindGroup(0, dynamicRenderBindGroup);
      if (overlayCount > 0) {
        overlayPass.draw(6, overlayCount, 0, currentDynOverlayCommandStart);
      }
    }
    overlayPass.end();
    // When stats are open, copy the post-cull instance count out for readback.
    const sampleVisible =
      statsVisible && !readbackPending && currentShapeCommandCount > 0;
    if (sampleVisible) {
      encoder.copyBufferToBuffer(drawArgsBuffer, 0, drawArgsReadback, 0, 16);
    }
    device.queue.submit([encoder.finish()]);
    if (sampleVisible) {
      readbackPending = true;
      drawArgsReadback
        .mapAsync(GPUMapMode.READ)
        .then(() => {
          visibleGeometryShapeCount = new Uint32Array(
            drawArgsReadback.getMappedRange(),
          )[1];
          drawArgsReadback.unmap();
          readbackPending = false;
        })
        .catch(() => {
          readbackPending = false;
        });
    }
    if (statsVisible && now - lastStatsAt > 200) {
      lastStatsAt = now;
      updateStats();
    }
    requestAnimationFrame(render);
  };
  window.addEventListener("resize", resize);
  resize();
  sceneHistory.reset();
  sceneFileStorage.markClean();
  updateSelectionState();
  updateEmptyState();
  requestAnimationFrame(render);
}
boot().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  ui.showFallback(message);
});
