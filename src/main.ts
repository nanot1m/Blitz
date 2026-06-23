import shaderSource from "./shaders/rect.wgsl?raw";
import "./style.css";

type BlitzExports = {
  memory: WebAssembly.Memory;
  blitz_init(): void;
  blitz_resize(width: number, height: number): void;
  blitz_set_camera(x: number, y: number, zoom: number): void;
  blitz_pan(dxPixels: number, dyPixels: number): void;
  blitz_zoom_at(screenX: number, screenY: number, zoomDelta: number): void;
  blitz_pointer_down(screenX: number, screenY: number): number;
  blitz_pointer_move(screenX: number, screenY: number): void;
  blitz_pointer_up(): void;
  blitz_set_interaction_mode(mode: number): void;
  blitz_interaction_move(screenX: number, screenY: number): void;
  blitz_interaction_click(screenX: number, screenY: number): void;
  blitz_interaction_leave(): void;
  blitz_adjust_interaction_radius(deltaSteps: number): void;
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
  blitz_entity_count(): number;
  blitz_render_chunk_rects(): number;
  blitz_render_max_shapes(): number;
  blitz_time(seconds: number): void;
};

const canvasElement = document.querySelector<HTMLCanvasElement>("#blitz-canvas");
const fallbackElement = document.querySelector<HTMLDivElement>("#fallback");

if (!canvasElement || !fallbackElement) {
  throw new Error("Blitz canvas was not found.");
}

const canvas = canvasElement;
const fallback = fallbackElement;
const InteractionMode = {
  Drag: 0,
  Pushback: 1,
  Triangle: 2,
  Circle: 3,
  Rect: 4,
} as const;

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
      targets: [{ format }],
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
  const bindGroup = device.createBindGroup({
    label: "Blitz Bind Group",
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: shapeCommandStorageBuffer } },
      { binding: 2, resource: { buffer: rectStorageBuffer } },
      { binding: 3, resource: { buffer: triangleStorageBuffer } },
      { binding: 4, resource: { buffer: circleStorageBuffer } },
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
  let draggingRect = false;
  let lastX = 0;
  let lastY = 0;
  let interactionMode: number = InteractionMode.Drag;

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
    draggingRect = false;
    wasm.blitz_pointer_up();
  };

  const setInteractionMode = (mode: number) => {
    interactionMode = mode;
    stopDragging();
    wasm.blitz_set_interaction_mode(mode);
    if (mode === InteractionMode.Drag) {
      wasm.blitz_interaction_leave();
    }
  };

  canvas.addEventListener("pointerdown", (event) => {
    const isPrimaryButton = event.button === 0;
    const isMiddleButton = event.button === 1;
    if (!isPrimaryButton && !isMiddleButton) {
      return;
    }

    event.preventDefault();
    if (isMiddleButton) {
      stopDragging();
      draggingCamera = true;
    } else if (interactionMode === InteractionMode.Pushback) {
      const point = eventToCanvasPixels(event);
      wasm.blitz_interaction_move(point.x, point.y);
    } else if (
      interactionMode === InteractionMode.Triangle ||
      interactionMode === InteractionMode.Circle ||
      interactionMode === InteractionMode.Rect
    ) {
      const point = eventToCanvasPixels(event);
      wasm.blitz_interaction_click(point.x, point.y);
    } else {
      const point = eventToCanvasPixels(event);
      draggingRect = wasm.blitz_pointer_down(point.x, point.y) === 1;
      draggingCamera = !draggingRect;
    }

    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!draggingCamera && !draggingRect) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    if (draggingRect) {
      const point = eventToCanvasPixels(event);
      wasm.blitz_pointer_move(point.x, point.y);
    } else {
      wasm.blitz_pan((event.clientX - lastX) * dpr, (event.clientY - lastY) * dpr);
    }
    lastX = event.clientX;
    lastY = event.clientY;
  });

  canvas.addEventListener("pointermove", (event) => {
    if (
      draggingCamera ||
      draggingRect ||
      (interactionMode !== InteractionMode.Pushback &&
        interactionMode !== InteractionMode.Triangle &&
        interactionMode !== InteractionMode.Circle &&
        interactionMode !== InteractionMode.Rect)
    ) {
      return;
    }

    const point = eventToCanvasPixels(event);
    wasm.blitz_interaction_move(point.x, point.y);
  });

  canvas.addEventListener("pointerup", (event) => {
    stopDragging();
    canvas.releasePointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointercancel", (event) => {
    stopDragging();
    canvas.releasePointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointerleave", () => {
    wasm.blitz_interaction_leave();
  });

  canvas.addEventListener("auxclick", (event) => {
    if (event.button === 1) {
      event.preventDefault();
    }
  });

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const dpr = window.devicePixelRatio || 1;
      if (event.ctrlKey || event.metaKey) {
        const point = eventToCanvasPixels(event);
        const zoomDelta = Math.exp(-event.deltaY * 0.0015);
        wasm.blitz_zoom_at(point.x, point.y, zoomDelta);
      } else {
        wasm.blitz_pan(-event.deltaX * dpr, -event.deltaY * dpr);
      }
    },
    { passive: false },
  );

  window.addEventListener("keydown", (event) => {
    if (event.repeat || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    if (event.key.toLowerCase() === "p") {
      setInteractionMode(
        interactionMode === InteractionMode.Pushback ? InteractionMode.Drag : InteractionMode.Pushback,
      );
    } else if (event.key.toLowerCase() === "r") {
      setInteractionMode(interactionMode === InteractionMode.Rect ? InteractionMode.Drag : InteractionMode.Rect);
    } else if (event.key.toLowerCase() === "t") {
      setInteractionMode(
        interactionMode === InteractionMode.Triangle ? InteractionMode.Drag : InteractionMode.Triangle,
      );
    } else if (event.key.toLowerCase() === "c") {
      setInteractionMode(
        interactionMode === InteractionMode.Circle ? InteractionMode.Drag : InteractionMode.Circle,
      );
    } else if (event.key === "[") {
      wasm.blitz_adjust_interaction_radius(1);
    } else if (event.key === "]") {
      wasm.blitz_adjust_interaction_radius(-1);
    } else if (event.key === "Escape") {
      setInteractionMode(InteractionMode.Drag);
    }
  });

  const render = (timeMs: number) => {
    resize();
    wasm.blitz_time(timeMs / 1000);

    const shapeCommandPtr = wasm.blitz_shape_command_ptr();
    const shapeCommandCount = wasm.blitz_shape_command_count();
    const shapeCommandVersion = wasm.blitz_shape_command_version();
    const rectDrawPtr = wasm.blitz_rect_draw_ptr();
    const rectDrawCount = wasm.blitz_rect_draw_count();
    const triangleDrawPtr = wasm.blitz_triangle_draw_ptr();
    const triangleDrawCount = wasm.blitz_triangle_draw_count();
    const circleDrawPtr = wasm.blitz_circle_draw_ptr();
    const circleDrawCount = wasm.blitz_circle_draw_count();

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
  requestAnimationFrame(render);
}

boot().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  showFallback(message);
});
