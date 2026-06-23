import {
  BringToFront,
  Circle,
  createIcons,
  LayoutGrid,
  SendToBack,
  Square,
  Trash2,
  Triangle,
  Type as TypeIcon,
} from "lucide";
import shaderSource from "./shaders/rect.wgsl?raw";
import "./style.css";

type BlitzExports = {
  memory: WebAssembly.Memory;
  blitz_init(): void;
  blitz_resize(width: number, height: number): void;
  blitz_set_camera(x: number, y: number, zoom: number): void;
  blitz_pan(dxPixels: number, dyPixels: number): void;
  blitz_zoom_at(screenX: number, screenY: number, zoomDelta: number): void;
  blitz_pointer_down(screenX: number, screenY: number, additive: number): number;
  blitz_pointer_move(screenX: number, screenY: number): void;
  blitz_pointer_up(): void;
  blitz_add_rect(): void;
  blitz_add_circle(): void;
  blitz_add_triangle(): void;
  blitz_add_text(): void;
  blitz_stress_test(): void;
  blitz_delete_selected(): void;
  blitz_has_selection(): number;
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
  blitz_entity_count(): number;
  blitz_render_chunk_rects(): number;
  blitz_render_max_shapes(): number;
  blitz_render_max_text_draws(): number;
};

const canvasElement = document.querySelector<HTMLCanvasElement>("#blitz-canvas");
const fallbackElement = document.querySelector<HTMLDivElement>("#fallback");
const addRectElement = document.querySelector<HTMLButtonElement>("#add-rect");
const addCircleElement = document.querySelector<HTMLButtonElement>("#add-circle");
const addTriangleElement = document.querySelector<HTMLButtonElement>("#add-triangle");
const addTextElement = document.querySelector<HTMLButtonElement>("#add-text");
const stressTestElement = document.querySelector<HTMLButtonElement>("#stress-test");
const sendToBackElement = document.querySelector<HTMLButtonElement>("#send-to-back");
const bringToFrontElement = document.querySelector<HTMLButtonElement>("#bring-to-front");
const deleteElement = document.querySelector<HTMLButtonElement>("#delete-selected");

if (
  !canvasElement ||
  !fallbackElement ||
  !addRectElement ||
  !addCircleElement ||
  !addTriangleElement ||
  !addTextElement ||
  !stressTestElement ||
  !sendToBackElement ||
  !bringToFrontElement ||
  !deleteElement
) {
  throw new Error("Blitz interface was not found.");
}

const canvas = canvasElement;
const fallback = fallbackElement;
const addRectButton = addRectElement;
const addCircleButton = addCircleElement;
const addTriangleButton = addTriangleElement;
const addTextButton = addTextElement;
const stressTestButton = stressTestElement;
const sendToBackButton = sendToBackElement;
const bringToFrontButton = bringToFrontElement;
const deleteButton = deleteElement;

createIcons({
  icons: {
    BringToFront,
    Circle,
    LayoutGrid,
    SendToBack,
    Square,
    Trash2,
    Triangle,
    Type: TypeIcon,
  },
});

const showFallback = (message: string) => {
  fallback.textContent = message;
  fallback.hidden = false;
};

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
  const bindGroup = device.createBindGroup({
    label: "Blitz Bind Group",
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: shapeCommandStorageBuffer } },
      { binding: 2, resource: { buffer: rectStorageBuffer } },
      { binding: 3, resource: { buffer: triangleStorageBuffer } },
      { binding: 4, resource: { buffer: circleStorageBuffer } },
      { binding: 5, resource: { buffer: textStorageBuffer } },
      { binding: 6, resource: fontAtlasTexture.createView() },
      { binding: 7, resource: fontSampler },
    ],
  });

  let lastUploadedShapeCommandVersion = -1;
  let currentShapeCommandCount = 0;

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      wasm.blitz_resize(width, height);
    }
  };

  let draggingCamera = false;
  let draggingEntity = false;
  let selectingArea = false;
  let lastX = 0;
  let lastY = 0;

  const updateSelectionState = () => {
    const disabled = wasm.blitz_has_selection() === 0;
    sendToBackButton.disabled = disabled;
    bringToFrontButton.disabled = disabled;
    deleteButton.disabled = disabled;
  };

  const eventToCanvasPixels = (event: PointerEvent | WheelEvent) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
      x: (event.clientX - rect.left) * dpr,
      y: (event.clientY - rect.top) * dpr,
    };
  };

  const stopDragging = () => {
    draggingCamera = false;
    draggingEntity = false;
    selectingArea = false;
    canvas.classList.remove("is-dragging-entity", "is-panning", "is-selecting");
    wasm.blitz_pointer_up();
  };

  canvas.addEventListener("pointerdown", (event) => {
    const isPrimaryButton = event.button === 0;
    const isMiddleButton = event.button === 1;
    const isRightButton = event.button === 2;
    if (!isPrimaryButton && !isMiddleButton && !isRightButton) {
      return;
    }

    event.preventDefault();
    if (isMiddleButton || isRightButton) {
      stopDragging();
      draggingCamera = true;
      canvas.classList.add("is-panning");
    } else {
      const point = eventToCanvasPixels(event);
      const additive = event.shiftKey || event.ctrlKey || event.metaKey ? 1 : 0;
      const pointerMode = wasm.blitz_pointer_down(point.x, point.y, additive);
      draggingEntity = pointerMode === 1;
      selectingArea = pointerMode === 2;
      canvas.classList.toggle("is-dragging-entity", draggingEntity);
      canvas.classList.toggle("is-selecting", selectingArea);
      updateSelectionState();
    }

    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!draggingCamera && !draggingEntity && !selectingArea) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    if (draggingEntity || selectingArea) {
      const point = eventToCanvasPixels(event);
      wasm.blitz_pointer_move(point.x, point.y);
    } else {
      wasm.blitz_pan((event.clientX - lastX) * dpr, (event.clientY - lastY) * dpr);
    }
    lastX = event.clientX;
    lastY = event.clientY;
  });

  canvas.addEventListener("pointerup", (event) => {
    stopDragging();
    updateSelectionState();
    canvas.releasePointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointercancel", (event) => {
    stopDragging();
    canvas.releasePointerCapture(event.pointerId);
  });

  canvas.addEventListener("auxclick", (event) => {
    if (event.button === 1 || event.button === 2) {
      event.preventDefault();
    }
  });

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  addRectButton.addEventListener("click", () => {
    stopDragging();
    wasm.blitz_add_rect();
    updateSelectionState();
  });

  addCircleButton.addEventListener("click", () => {
    stopDragging();
    wasm.blitz_add_circle();
    updateSelectionState();
  });

  addTriangleButton.addEventListener("click", () => {
    stopDragging();
    wasm.blitz_add_triangle();
    updateSelectionState();
  });

  addTextButton.addEventListener("click", () => {
    stopDragging();
    wasm.blitz_add_text();
    updateSelectionState();
  });

  stressTestButton.addEventListener("click", () => {
    stopDragging();
    wasm.blitz_stress_test();
    updateSelectionState();
  });

  const deleteSelection = () => {
    if (wasm.blitz_has_selection() === 0) {
      return;
    }
    stopDragging();
    wasm.blitz_delete_selected();
    updateSelectionState();
  };

  deleteButton.addEventListener("click", deleteSelection);

  sendToBackButton.addEventListener("click", () => {
    wasm.blitz_send_to_back();
  });

  bringToFrontButton.addEventListener("click", () => {
    wasm.blitz_bring_to_front();
  });

  window.addEventListener("keydown", (event) => {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement ||
      (event.target instanceof HTMLElement && event.target.isContentEditable)
    ) {
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      deleteSelection();
    }
  });

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const dpr = window.devicePixelRatio || 1;
      if (event.ctrlKey || event.metaKey) {
        const point = eventToCanvasPixels(event);
        const zoomDelta = Math.exp(-event.deltaY * 0.007);
        wasm.blitz_zoom_at(point.x, point.y, zoomDelta);
      } else {
        wasm.blitz_pan(-event.deltaX * dpr, -event.deltaY * dpr);
      }
    },
    { passive: false },
  );

  const render = () => {
    resize();

    const shapeCommandPtr = wasm.blitz_shape_command_ptr();
    const shapeCommandCount = wasm.blitz_shape_command_count();
    const shapeCommandVersion = wasm.blitz_shape_command_version();
    const rectDrawPtr = wasm.blitz_rect_draw_ptr();
    const rectDrawCount = wasm.blitz_rect_draw_count();
    const triangleDrawPtr = wasm.blitz_triangle_draw_ptr();
    const triangleDrawCount = wasm.blitz_triangle_draw_count();
    const circleDrawPtr = wasm.blitz_circle_draw_ptr();
    const circleDrawCount = wasm.blitz_circle_draw_count();
    const textDrawPtr = wasm.blitz_text_draw_ptr();
    const textDrawCount = wasm.blitz_text_draw_count();

    if (shapeCommandVersion !== lastUploadedShapeCommandVersion) {
      currentShapeCommandCount = shapeCommandCount;
      if (shapeCommandCount > 0) {
        const wasmShapeCommands = new Uint32Array(
          wasm.memory.buffer,
          shapeCommandPtr,
          shapeCommandCount * shapeCommandU32Count,
        );
        device.queue.writeBuffer(shapeCommandStorageBuffer, 0, wasmShapeCommands);
      }
      if (rectDrawCount > 0) {
        const wasmRectDraws = new Float32Array(wasm.memory.buffer, rectDrawPtr, rectDrawCount * rectDrawF32Count);
        device.queue.writeBuffer(rectStorageBuffer, 0, wasmRectDraws);
      }
      if (triangleDrawCount > 0) {
        const wasmTriangleDraws = new Float32Array(
          wasm.memory.buffer,
          triangleDrawPtr,
          triangleDrawCount * triangleDrawF32Count,
        );
        device.queue.writeBuffer(triangleStorageBuffer, 0, wasmTriangleDraws);
      }
      if (circleDrawCount > 0) {
        const wasmCircleDraws = new Float32Array(
          wasm.memory.buffer,
          circleDrawPtr,
          circleDrawCount * circleDrawF32Count,
        );
        device.queue.writeBuffer(circleStorageBuffer, 0, wasmCircleDraws);
      }
      if (textDrawCount > 0) {
        const wasmTextDraws = new Float32Array(
          wasm.memory.buffer,
          textDrawPtr,
          textDrawCount * textDrawF32Count,
        );
        device.queue.writeBuffer(textStorageBuffer, 0, wasmTextDraws);
      }
      lastUploadedShapeCommandVersion = shapeCommandVersion;
    }

    const uniforms = new Float32Array(wasm.memory.buffer, uniformPtr, wasm.blitz_uniform_f32_count());
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    const encoder = device.createCommandEncoder({ label: "Blitz Render Encoder" });
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
    });
    pass.setPipeline(shapePipeline);
    if (currentShapeCommandCount > 0) {
      pass.setBindGroup(0, bindGroup);
      pass.draw(6 * currentShapeCommandCount);
    }
    pass.end();

    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(render);
  };

  window.addEventListener("resize", resize);
  resize();
  updateSelectionState();
  requestAnimationFrame(render);
}

boot().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  showFallback(message);
});
