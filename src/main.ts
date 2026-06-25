import { createCanvasMcpAdapter } from "./mcp/canvas-adapter";
import { setupMcpBridge } from "./mcp/bridge";
import {
  setupCanvasInteractions,
  setupKeyboardShortcuts,
  setupStyleControls,
  setupUiActions,
} from "./input/user-events";
import shaderSource from "./shaders/rect.wgsl?raw";
import cullSource from "./shaders/cull.wgsl?raw";
import { setupSceneFileStorage } from "./storage/scene-file";
import { getOrCreateActorId } from "./storage/actor-id";
import { createSceneHistory } from "./history/scene-history";
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
  blitz_pointer_down(screenX: number, screenY: number, additive: number): number;
  blitz_pointer_move(screenX: number, screenY: number): void;
  blitz_pointer_up(): void;
  blitz_add_rect(): void;
  blitz_add_circle(): void;
  blitz_add_triangle(): void;
  blitz_add_text(): void;
  blitz_clear_scene(): void;
  blitz_load_demo_template(): void;
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
  blitz_text_input_ptr(): number;
  blitz_text_input_capacity(): number;
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
  blitz_scene_revision(): number;
  blitz_capture_start_viewpoint(): void;
  blitz_scene_serialize(): number;
  blitz_scene_deserialize(byteCount: number): number;
  blitz_stress_test(): void;
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
  blitz_circle_draw_ptr(): number;
  blitz_circle_draw_f32_count(): number;
  blitz_circle_draw_count(): number;
  blitz_text_draw_ptr(): number;
  blitz_text_draw_f32_count(): number;
  blitz_text_draw_count(): number;
  blitz_dyn_command_ptr(): number;
  blitz_dyn_command_count(): number;
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

const {
  canvas,
  shapeMenu,
  openSceneMenu,
  saveSceneMenu,
  saveSceneIndicator,
  newSceneFileButton,
  chooseSceneFileButton,
  saveSceneButton,
  saveSceneAsButton,
  saveCurrentViewpointInput,
  recentScenes,
  recentScenesDivider,
  emptyState,
  emptyAddItemButton,
  emptyOpenFileButton,
  emptyRecentSection,
  emptyRecentScenes,
  emptyDemoTemplateButton,
  styleIsland,
  debuggerIsland,
  debuggerEntityId,
  debuggerComponents,
  selectedGeometryControls,
  selectedFillInput,
  selectedFillOpacityInput,
  selectedStrokeInput,
  selectedStrokeOpacityInput,
  selectedStrokeWidthInput,
  selectedMixedDivider,
  selectedTextControls,
  selectedTextColorInput,
  selectedTextOpacityInput,
  addRectButton,
  addCircleButton,
  addTriangleButton,
  addTextButton,
  stressTestButton,
  sendToBackButton,
  bringToFrontButton,
  deleteButton,
  zoomIndicator,
  toggleStatsButton,
  toggleDebuggerButton,
  statsPanel,
  statsBody,
  openMcpSettingsButton,
  mcpSettingsDialog,
  mcpSettingsForm,
  closeMcpSettingsButton,
  mcpBridgeUrlInput,
  mcpBridgeTokenInput,
  disconnectMcpBridgeButton,
  mcpBridgeStatus,
  showFallback,
} = createBlitzUi();

async function loadWasm(): Promise<BlitzExports> {
  const response = await fetch(`${import.meta.env.BASE_URL}blitz.wasm`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Run `npm run build:wasm` before starting Blitz.");
  }

  const module = await WebAssembly.instantiateStreaming(response, {});
  return module.instance.exports as BlitzExports;
}

async function boot() {
  if (!navigator.gpu) {
    showFallback("WebGPU is not available in this browser.");
    return;
  }

  const wasm = await loadWasm();
  wasm.blitz_init();
  const actorId = getOrCreateActorId();
  wasm.blitz_set_actor_id(actorId.hi, actorId.lo);

  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter?.requestDevice();
  if (!device) {
    showFallback("No WebGPU adapter is available.");
    return;
  }

  const context = canvas.getContext("webgpu");
  if (!context) {
    showFallback("Could not create a WebGPU canvas context.");
    return;
  }

  const format = navigator.gpu.getPreferredCanvasFormat();
  const depthFormat: GPUTextureFormat = "depth32float";
  context.configure({
    device,
    format,
    alphaMode: "opaque",
  });

  const uniformPtr = wasm.blitz_uniform_ptr();
  const uniformByteLength = wasm.blitz_uniform_f32_count() * Float32Array.BYTES_PER_ELEMENT;
  const uniformBuffer = device.createBuffer({
    label: "Blitz Uniforms",
    size: uniformByteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const maxShapes = wasm.blitz_render_max_shapes();
  const shapeCommandU32Count = wasm.blitz_shape_command_u32_count();
  const shapeCommandBufferByteLength = maxShapes * shapeCommandU32Count * Uint32Array.BYTES_PER_ELEMENT;
  const rectDrawF32Count = wasm.blitz_rect_draw_f32_count();
  const rectDrawBufferByteLength = maxShapes * rectDrawF32Count * Float32Array.BYTES_PER_ELEMENT;
  const triangleDrawF32Count = wasm.blitz_triangle_draw_f32_count();
  const triangleDrawBufferByteLength = maxShapes * triangleDrawF32Count * Float32Array.BYTES_PER_ELEMENT;
  const circleDrawF32Count = wasm.blitz_circle_draw_f32_count();
  const circleDrawBufferByteLength = maxShapes * circleDrawF32Count * Float32Array.BYTES_PER_ELEMENT;
  const textDrawF32Count = wasm.blitz_text_draw_f32_count();
  const textDrawBufferByteLength =
    wasm.blitz_render_max_text_draws() * textDrawF32Count * Float32Array.BYTES_PER_ELEMENT;
  const maxDynCommands = wasm.blitz_render_max_dyn_commands();
  const dynCommandBufferByteLength = maxDynCommands * shapeCommandU32Count * Uint32Array.BYTES_PER_ELEMENT;
  const maxDynRects = wasm.blitz_render_max_dyn_rects();
  const dynRectBufferByteLength = maxDynRects * rectDrawF32Count * Float32Array.BYTES_PER_ELEMENT;
  // Total bytes of the fixed storage buffers, for the stats panel (excludes the
  // resize-dependent depth texture, reported separately).
  const gpuBufferBytes =
    uniformByteLength +
    shapeCommandBufferByteLength * 2 +
    rectDrawBufferByteLength +
    triangleDrawBufferByteLength +
    circleDrawBufferByteLength +
    textDrawBufferByteLength +
    dynCommandBufferByteLength +
    dynRectBufferByteLength +
    16;

  const atlasResponse = await fetch(`${import.meta.env.BASE_URL}font-atlas.png`);
  if (!atlasResponse.ok) {
    throw new Error("Font atlas could not be loaded.");
  }
  const atlasBitmap = await createImageBitmap(await atlasResponse.blob());
  const fontAtlasTexture = device.createTexture({
    label: "Blitz Font Atlas",
    size: [atlasBitmap.width, atlasBitmap.height],
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
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

  const cullShader = device.createShaderModule({
    label: "Blitz Cull Shader",
    code: cullSource,
  });
  const cullBindGroupLayout = device.createBindGroupLayout({
    label: "Blitz Cull Bind Group Layout",
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
    ],
  });
  const cullPipeline = device.createComputePipeline({
    label: "Blitz Cull Pipeline",
    layout: device.createPipelineLayout({ bindGroupLayouts: [cullBindGroupLayout] }),
    compute: { module: cullShader, entryPoint: "cull_main" },
  });

  const shapeCommandStorageBuffer = device.createBuffer({
    label: "Blitz Shape Command Storage",
    size: shapeCommandBufferByteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const rectStorageBuffer = device.createBuffer({
    label: "Blitz Rect Draw Storage",
    size: rectDrawBufferByteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const triangleStorageBuffer = device.createBuffer({
    label: "Blitz Triangle Draw Storage",
    size: triangleDrawBufferByteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const circleStorageBuffer = device.createBuffer({
    label: "Blitz Circle Draw Storage",
    size: circleDrawBufferByteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const textStorageBuffer = device.createBuffer({
    label: "Blitz Text Draw Storage",
    size: textDrawBufferByteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  // Compute-cull output: compacted visible static commands + indirect draw args.
  const visibleCommandStorageBuffer = device.createBuffer({
    label: "Blitz Visible Command Storage",
    size: shapeCommandBufferByteLength,
    usage: GPUBufferUsage.STORAGE,
  });
  const drawArgsBuffer = device.createBuffer({
    label: "Blitz Draw Args",
    size: 4 * Uint32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });
  // Reads back the post-cull visible instance count for the stats panel.
  const drawArgsReadback = device.createBuffer({
    label: "Blitz Draw Args Readback",
    size: 4 * Uint32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const dynCommandStorageBuffer = device.createBuffer({
    label: "Blitz Dynamic Command Storage",
    size: dynCommandBufferByteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const dynRectStorageBuffer = device.createBuffer({
    label: "Blitz Dynamic Rect Storage",
    size: dynRectBufferByteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const cullBindGroup = device.createBindGroup({
    label: "Blitz Cull Bind Group",
    layout: cullBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: shapeCommandStorageBuffer } },
      { binding: 2, resource: { buffer: rectStorageBuffer } },
      { binding: 3, resource: { buffer: triangleStorageBuffer } },
      { binding: 4, resource: { buffer: circleStorageBuffer } },
      { binding: 5, resource: { buffer: visibleCommandStorageBuffer } },
      { binding: 6, resource: { buffer: drawArgsBuffer } },
    ],
  });
  // Static pass draws the culled commands; text binding is unused (no text in
  // the static stream) but the layout requires it.
  const staticRenderBindGroup = device.createBindGroup({
    label: "Blitz Static Render Bind Group",
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: visibleCommandStorageBuffer } },
      { binding: 2, resource: { buffer: rectStorageBuffer } },
      { binding: 3, resource: { buffer: triangleStorageBuffer } },
      { binding: 4, resource: { buffer: circleStorageBuffer } },
      { binding: 5, resource: { buffer: textStorageBuffer } },
      { binding: 6, resource: fontAtlasTexture.createView() },
      { binding: 7, resource: fontSampler },
    ],
  });
  // Dynamic pass draws text + selection/marquee; triangle/circle bindings are
  // unused but the layout requires them.
  const dynamicRenderBindGroup = device.createBindGroup({
    label: "Blitz Dynamic Render Bind Group",
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: dynCommandStorageBuffer } },
      { binding: 2, resource: { buffer: dynRectStorageBuffer } },
      { binding: 3, resource: { buffer: triangleStorageBuffer } },
      { binding: 4, resource: { buffer: circleStorageBuffer } },
      { binding: 5, resource: { buffer: textStorageBuffer } },
      { binding: 6, resource: fontAtlasTexture.createView() },
      { binding: 7, resource: fontSampler },
    ],
  });

  let lastUploadedShapeCommandVersion = -1;
  let currentShapeCommandCount = 0;
  let lastUploadedDynVersion = -1;
  let currentDynCommandCount = 0;
  let lastZoomPercent = -1;
  const drawArgsReset = new Uint32Array([6, 0, 0, 0]);

  let statsVisible = false;
  let frameMs = 16;
  let lastFrameStamp = 0;
  let lastStatsAt = 0;
  let visibleShapeCount = 0;
  let readbackPending = false;

  const formatBytes = (bytes: number) => {
    if (bytes >= 1 << 30) return `${(bytes / (1 << 30)).toFixed(1)} GB`;
    if (bytes >= 1 << 20) return `${(bytes / (1 << 20)).toFixed(1)} MB`;
    if (bytes >= 1 << 10) return `${(bytes / (1 << 10)).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  const updateStats = () => {
    const lines = [
      `fps         ${(1000 / frameMs).toFixed(0)}  (${frameMs.toFixed(1)} ms)`,
      `zoom        ${lastZoomPercent}%`,
      `entities    ${wasm.blitz_entity_count().toLocaleString()}`,
      `shapes      ${wasm.blitz_shape_command_count().toLocaleString()}`,
      `  visible   ${visibleShapeCount.toLocaleString()}`,
      `  rect ${wasm.blitz_rect_draw_count().toLocaleString()} · tri ${wasm
        .blitz_triangle_draw_count()
        .toLocaleString()} · circ ${wasm.blitz_circle_draw_count().toLocaleString()}`,
      `text glyphs ${wasm.blitz_text_draw_count().toLocaleString()}`,
      `dyn cmds    ${wasm.blitz_dyn_command_count().toLocaleString()}`,
      `selected    ${wasm.blitz_selected_count().toLocaleString()}`,
      `wasm rsvd   ${formatBytes(wasm.memory.buffer.byteLength)}`,
      `wasm live~  ${formatBytes(wasm.blitz_wasm_live_bytes())}`,
      `gpu bufs    ${formatBytes(gpuBufferBytes)}`,
      `depth tex   ${formatBytes(canvas.width * canvas.height * 4)}`,
    ];
    statsBody.textContent = lines.join("\n");
  };

  let depthTexture: GPUTexture | null = null;
  let depthView: GPUTextureView | null = null;

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height || !depthTexture) {
      canvas.width = width;
      canvas.height = height;
      wasm.blitz_resize(width, height);
      depthTexture?.destroy();
      depthTexture = device.createTexture({
        label: "Blitz Depth Texture",
        size: [width, height],
        format: depthFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      depthView = depthTexture.createView();
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

  const updateStyleIsland = () => {
    const kind = wasm.blitz_selected_style_kind();
    styleIsland.hidden = kind === 0;
    if (kind === 0) {
      return;
    }
    const style = new Float32Array(
      wasm.memory.buffer,
      wasm.blitz_selected_style_ptr(),
      wasm.blitz_selected_style_f32_count(),
    );
    const geometric = (kind & 1) !== 0;
    const text = (kind & 2) !== 0;
    selectedGeometryControls.hidden = !geometric;
    selectedTextControls.hidden = !text;
    selectedMixedDivider.hidden = !(geometric && text);
    if (geometric) {
      selectedFillInput.value = colorHex(style[0], style[1], style[2]);
      selectedFillOpacityInput.value = String(style[3]);
      selectedStrokeInput.value = colorHex(style[4], style[5], style[6]);
      selectedStrokeOpacityInput.value = String(style[7]);
      selectedStrokeWidthInput.value = String(Number(style[8].toFixed(2)));
    }
    if (text) {
      selectedTextColorInput.value = colorHex(style[9], style[10], style[11]);
      selectedTextOpacityInput.value = String(style[12]);
    }
  };

  const formatDebugNumber = (value: number) =>
    Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));

  const debugComponent = (name: string, values: Record<string, string | number>) => {
    const section = document.createElement("dl");
    section.className = "debugger-component";
    const heading = document.createElement("h3");
    heading.textContent = name;
    section.append(heading);
    for (const [label, rawValue] of Object.entries(values)) {
      const term = document.createElement("dt");
      term.textContent = label;
      const value = document.createElement("dd");
      value.textContent = typeof rawValue === "number" ? formatDebugNumber(rawValue) : rawValue;
      section.append(term, value);
    }
    return section;
  };

  let debuggerEnabled = false;
  const updateDebuggerIsland = () => {
    const ptr = wasm.blitz_selected_debug_ptr();
    debuggerIsland.hidden = !debuggerEnabled || ptr === 0;
    debuggerComponents.replaceChildren();
    if (ptr === 0) {
      debuggerEntityId.textContent =
        wasm.blitz_selected_count() > 1 ? `${wasm.blitz_selected_count()} entities` : "";
      return;
    }
    const view = new DataView(wasm.memory.buffer);
    const words = Array.from({ length: 4 }, (_value, index) =>
      view.getUint32(ptr + index * 4, true).toString(16).padStart(8, "0"),
    );
    debuggerEntityId.textContent = `${words[0]}${words[1]}:${words[2]}${words[3]}`;
    const kind = view.getUint32(ptr + 16, true);
    const kindNames = ["Rectangle", "Triangle", "Circle", "Text"];
    const mask = wasm.blitz_selected_debug_mask();
    debuggerComponents.append(
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
    );
    if (kind === 3) {
      const textPtr = view.getUint32(ptr + 28, true);
      const textLength = view.getUint32(ptr + 32, true);
      const text = new TextDecoder().decode(
        new Uint8Array(wasm.memory.buffer, textPtr, textLength),
      );
      debuggerComponents.append(
        debugComponent("TextView", {
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
          align: ["left", "center", "right"][view.getFloat32(ptr + 108, true)] ?? "left",
        }),
      );
    } else {
      debuggerComponents.append(
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
    debuggerComponents.append(
      debugComponent("Capabilities", {
        selectable: (mask & 64) !== 0 ? "yes" : "no",
        resizable: (mask & 128) !== 0 ? "yes" : "no",
      }),
    );
  };

  toggleDebuggerButton.addEventListener("click", () => {
    debuggerEnabled = !debuggerEnabled;
    toggleDebuggerButton.setAttribute("aria-pressed", String(debuggerEnabled));
    updateDebuggerIsland();
  });

  const updateSelectionState = () => {
    const disabled = wasm.blitz_has_selection() === 0;
    sendToBackButton.disabled = disabled;
    bringToFrontButton.disabled = disabled;
    deleteButton.disabled = disabled;
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
    emptyState.hidden = !visible;
  };

  let stopDragging = () => {};
  const sceneHistory = createSceneHistory(wasm, {
    onApplied() {
      stopDragging();
      updateSelectionState();
      updateEmptyState();
    },
    onError: showFallback,
  });
  stopDragging = setupCanvasInteractions(canvas, wasm, {
    beginEdit: sceneHistory.begin,
    cancelEdit: sceneHistory.cancel,
    commitEdit: sceneHistory.commit,
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
      openMenu: openSceneMenu,
      saveMenu: saveSceneMenu,
      saveIndicator: saveSceneIndicator,
      newFileButton: newSceneFileButton,
      chooseFileButton: chooseSceneFileButton,
      saveButton: saveSceneButton,
      saveAsButton: saveSceneAsButton,
      saveCurrentViewpointInput,
      recentTargets: [
        {
          list: recentScenes,
          visibilityElements: [recentScenesDivider],
          menuItems: true,
        },
        {
          list: emptyRecentScenes,
          visibilityElements: [emptyRecentSection],
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
      onError: showFallback,
    },
  );

  setupMcpBridge(
    {
      dialog: mcpSettingsDialog,
      openButton: openMcpSettingsButton,
      closeButton: closeMcpSettingsButton,
      form: mcpSettingsForm,
      urlInput: mcpBridgeUrlInput,
      tokenInput: mcpBridgeTokenInput,
      disconnectButton: disconnectMcpBridgeButton,
      status: mcpBridgeStatus,
    },
    mcpAdapter,
  );

  const runSceneAction = (action: () => void) => {
    stopDragging();
    sceneHistory.transact(action);
    updateSelectionState();
  };

  setupUiActions(
    {
      addCircleButton,
      addRectButton,
      addTextButton,
      addTriangleButton,
      bringToFrontButton,
      deleteButton,
      emptyAddItemButton,
      emptyDemoTemplateButton,
      emptyOpenFileButton,
      sendToBackButton,
      shapeMenu,
      stressTestButton,
      toggleStatsButton,
    },
    {
      addCircle: () => runSceneAction(wasm.blitz_add_circle),
      addRect: () => runSceneAction(wasm.blitz_add_rect),
      addText: () => runSceneAction(wasm.blitz_add_text),
      addTriangle: () => runSceneAction(wasm.blitz_add_triangle),
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
      toggleStats() {
        statsVisible = !statsVisible;
        statsPanel.hidden = !statsVisible;
        toggleStatsButton.setAttribute("aria-pressed", statsVisible ? "true" : "false");
        if (statsVisible) {
          updateStats();
        }
      },
    },
  );

  setupStyleControls(
    {
      fillInput: selectedFillInput,
      fillOpacityInput: selectedFillOpacityInput,
      strokeInput: selectedStrokeInput,
      strokeOpacityInput: selectedStrokeOpacityInput,
      strokeWidthInput: selectedStrokeWidthInput,
      textColorInput: selectedTextColorInput,
      textOpacityInput: selectedTextOpacityInput,
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
      setTextColor(red, green, blue) {
        wasm.blitz_set_selected_text_color(red, green, blue);
        updateStyleIsland();
      },
      setTextOpacity(opacity) {
        wasm.blitz_set_selected_text_opacity(opacity);
        updateStyleIsland();
      },
    },
  );

  setupKeyboardShortcuts({
    deleteSelection,
    openFile: sceneFileStorage.openFile,
    redo() {
      if (sceneHistory.redo()) {
        updateSelectionState();
        updateEmptyState();
      }
    },
    saveFile: sceneFileStorage.saveFile,
    selectAll() {
      wasm.blitz_select_all();
      updateSelectionState();
    },
    stopDragging,
    undo() {
      if (sceneHistory.undo()) {
        updateSelectionState();
        updateEmptyState();
      }
    },
  });

  const render = () => {
    resize();
    sceneFileStorage.syncDirtyState();
    updateEmptyState();

    const now = performance.now();
    if (lastFrameStamp) {
      frameMs = frameMs * 0.9 + (now - lastFrameStamp) * 0.1;
    }
    lastFrameStamp = now;

    // Call the trigger pointer first: it runs extract_static_shapes() (guarded
    // by the dirty flag) so the version below reflects the latest build.
    const shapeCommandPtr = wasm.blitz_shape_command_ptr();
    const shapeCommandVersion = wasm.blitz_shape_command_version();
    if (shapeCommandVersion !== lastUploadedShapeCommandVersion) {
      const shapeCommandCount = wasm.blitz_shape_command_count();
      const rectDrawPtr = wasm.blitz_rect_draw_ptr();
      const rectDrawCount = wasm.blitz_rect_draw_count();
      const triangleDrawPtr = wasm.blitz_triangle_draw_ptr();
      const triangleDrawCount = wasm.blitz_triangle_draw_count();
      const circleDrawPtr = wasm.blitz_circle_draw_ptr();
      const circleDrawCount = wasm.blitz_circle_draw_count();
      currentShapeCommandCount = shapeCommandCount;
      if (shapeCommandCount > 0) {
        device.queue.writeBuffer(
          shapeCommandStorageBuffer,
          0,
          new Uint32Array(wasm.memory.buffer, shapeCommandPtr, shapeCommandCount * shapeCommandU32Count),
        );
      }
      if (rectDrawCount > 0) {
        device.queue.writeBuffer(
          rectStorageBuffer,
          0,
          new Float32Array(wasm.memory.buffer, rectDrawPtr, rectDrawCount * rectDrawF32Count),
        );
      }
      if (triangleDrawCount > 0) {
        device.queue.writeBuffer(
          triangleStorageBuffer,
          0,
          new Float32Array(wasm.memory.buffer, triangleDrawPtr, triangleDrawCount * triangleDrawF32Count),
        );
      }
      if (circleDrawCount > 0) {
        device.queue.writeBuffer(
          circleStorageBuffer,
          0,
          new Float32Array(wasm.memory.buffer, circleDrawPtr, circleDrawCount * circleDrawF32Count),
        );
      }
      lastUploadedShapeCommandVersion = shapeCommandVersion;
    }

    const dynCommandPtr = wasm.blitz_dyn_command_ptr();
    const dynVersion = wasm.blitz_dyn_version();
    if (dynVersion !== lastUploadedDynVersion) {
      const dynCommandCount = wasm.blitz_dyn_command_count();
      const dynRectPtr = wasm.blitz_dyn_rect_ptr();
      const dynRectCount = wasm.blitz_dyn_rect_count();
      const textDrawPtr = wasm.blitz_text_draw_ptr();
      const textDrawCount = wasm.blitz_text_draw_count();
      currentDynCommandCount = dynCommandCount;
      if (dynCommandCount > 0) {
        device.queue.writeBuffer(
          dynCommandStorageBuffer,
          0,
          new Uint32Array(wasm.memory.buffer, dynCommandPtr, dynCommandCount * shapeCommandU32Count),
        );
      }
      if (dynRectCount > 0) {
        device.queue.writeBuffer(
          dynRectStorageBuffer,
          0,
          new Float32Array(wasm.memory.buffer, dynRectPtr, dynRectCount * rectDrawF32Count),
        );
      }
      if (textDrawCount > 0) {
        device.queue.writeBuffer(
          textStorageBuffer,
          0,
          new Float32Array(wasm.memory.buffer, textDrawPtr, textDrawCount * textDrawF32Count),
        );
      }
      lastUploadedDynVersion = dynVersion;
    }

    const uniforms = new Float32Array(wasm.memory.buffer, uniformPtr, wasm.blitz_uniform_f32_count());
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    const zoomPercent = Math.round(uniforms[4] * 100);
    if (zoomPercent !== lastZoomPercent) {
      lastZoomPercent = zoomPercent;
      zoomIndicator.textContent = `${zoomPercent}%`;
    }

    device.queue.writeBuffer(drawArgsBuffer, 0, drawArgsReset);

    const encoder = device.createCommandEncoder({ label: "Blitz Render Encoder" });

    if (currentShapeCommandCount > 0) {
      const cullPass = encoder.beginComputePass({ label: "Blitz Cull Pass" });
      cullPass.setPipeline(cullPipeline);
      cullPass.setBindGroup(0, cullBindGroup);
      cullPass.dispatchWorkgroups(Math.ceil(currentShapeCommandCount / 64));
      cullPass.end();
    }

    const pass = encoder.beginRenderPass({
      label: "Blitz Render Pass",
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0.05, g: 0.05, b: 0.05, a: 1 },
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
    pass.setPipeline(shapePipeline);
    if (currentShapeCommandCount > 0) {
      pass.setBindGroup(0, staticRenderBindGroup);
      pass.drawIndirect(drawArgsBuffer, 0);
    }
    if (currentDynCommandCount > 0) {
      pass.setBindGroup(0, dynamicRenderBindGroup);
      pass.draw(6, currentDynCommandCount);
    }
    pass.end();

    // When stats are open, copy the post-cull instance count out for readback.
    const sampleVisible = statsVisible && !readbackPending && currentShapeCommandCount > 0;
    if (sampleVisible) {
      encoder.copyBufferToBuffer(drawArgsBuffer, 0, drawArgsReadback, 0, 16);
    }

    device.queue.submit([encoder.finish()]);

    if (sampleVisible) {
      readbackPending = true;
      drawArgsReadback
        .mapAsync(GPUMapMode.READ)
        .then(() => {
          visibleShapeCount = new Uint32Array(drawArgsReadback.getMappedRange())[1];
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
  showFallback(message);
});
