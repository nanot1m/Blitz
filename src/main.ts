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
  blitz_uniform_ptr(): number;
  blitz_uniform_f32_count(): number;
  blitz_rect_draw_ptr(): number;
  blitz_rect_draw_f32_count(): number;
  blitz_rect_draw_count(): number;
  blitz_rect_draw_version(): number;
  blitz_entity_count(): number;
  blitz_render_chunk_rects(): number;
  blitz_time(seconds: number): void;
};

const canvasElement = document.querySelector<HTMLCanvasElement>("#blitz-canvas");
const fallbackElement = document.querySelector<HTMLDivElement>("#fallback");

if (!canvasElement || !fallbackElement) {
  throw new Error("Blitz canvas was not found.");
}

const canvas = canvasElement;
const fallback = fallbackElement;

const showFallback = (message: string) => {
  fallback.textContent = message;
  fallback.hidden = false;
};

async function loadWasm(): Promise<BlitzExports> {
  const response = await fetch("/blitz.wasm", { cache: "no-store" });
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
  const rectDrawF32Count = wasm.blitz_rect_draw_f32_count();
  const rectDrawStrideBytes = rectDrawF32Count * Float32Array.BYTES_PER_ELEMENT;
  const rectDrawChunkSize = wasm.blitz_render_chunk_rects();
  const rectDrawChunkByteLength = rectDrawChunkSize * rectDrawStrideBytes;

  const shader = device.createShaderModule({
    label: "Stroked Rect Shader",
    code: shaderSource,
  });

  const pipeline = device.createRenderPipeline({
    label: "Blitz Stroked Rect Pipeline",
    layout: "auto",
    vertex: {
      module: shader,
      entryPoint: "vertex_main",
    },
    fragment: {
      module: shader,
      entryPoint: "fragment_main",
      targets: [{ format }],
    },
    primitive: {
      topology: "triangle-list",
    },
  });

  const bindGroupLayout = pipeline.getBindGroupLayout(0);
  const rectChunks = Array.from({ length: 4 }, (_, index) => {
    const rectStorageBuffer = device.createBuffer({
      label: `Blitz Rect Draw Storage ${index}`,
      size: rectDrawChunkByteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const bindGroup = device.createBindGroup({
      label: `Blitz Bind Group ${index}`,
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: rectStorageBuffer } },
      ],
    });
    return { bindGroup, rectStorageBuffer };
  });

  let lastUploadedRectDrawVersion = -1;
  let currentRectDrawCount = 0;

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

  const eventToCanvasPixels = (event: PointerEvent | WheelEvent) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
      x: (event.clientX - rect.left) * dpr,
      y: (event.clientY - rect.top) * dpr,
    };
  };

  canvas.addEventListener("pointerdown", (event) => {
    const point = eventToCanvasPixels(event);
    draggingRect = wasm.blitz_pointer_down(point.x, point.y) === 1;
    draggingCamera = !draggingRect;
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

  canvas.addEventListener("pointerup", (event) => {
    draggingCamera = false;
    draggingRect = false;
    wasm.blitz_pointer_up();
    canvas.releasePointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointercancel", (event) => {
    draggingCamera = false;
    draggingRect = false;
    wasm.blitz_pointer_up();
    canvas.releasePointerCapture(event.pointerId);
  });

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const point = eventToCanvasPixels(event);
      const zoomDelta = Math.exp(-event.deltaY * 0.0015);
      wasm.blitz_zoom_at(point.x, point.y, zoomDelta);
    },
    { passive: false },
  );

  const render = (timeMs: number) => {
    resize();
    wasm.blitz_time(timeMs / 1000);

    const rectDrawPtr = wasm.blitz_rect_draw_ptr();
    const rectDrawCount = wasm.blitz_rect_draw_count();
    const rectDrawVersion = wasm.blitz_rect_draw_version();
    if (rectDrawVersion !== lastUploadedRectDrawVersion) {
      currentRectDrawCount = rectDrawCount;
      for (let chunkIndex = 0; chunkIndex < rectChunks.length; chunkIndex += 1) {
        const chunkStart = chunkIndex * rectDrawChunkSize;
        const chunkRectCount = Math.max(0, Math.min(rectDrawChunkSize, rectDrawCount - chunkStart));
        if (chunkRectCount === 0) {
          continue;
        }

        const wasmRectDraws = new Float32Array(
          wasm.memory.buffer,
          rectDrawPtr + chunkStart * rectDrawStrideBytes,
          chunkRectCount * rectDrawF32Count,
        );
        device.queue.writeBuffer(rectChunks[chunkIndex].rectStorageBuffer, 0, wasmRectDraws);
      }
      lastUploadedRectDrawVersion = rectDrawVersion;
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
    pass.setPipeline(pipeline);
    for (let chunkIndex = 0; chunkIndex < rectChunks.length; chunkIndex += 1) {
      const chunkStart = chunkIndex * rectDrawChunkSize;
      const chunkRectCount = Math.max(0, Math.min(rectDrawChunkSize, currentRectDrawCount - chunkStart));
      if (chunkRectCount === 0) {
        continue;
      }

      pass.setBindGroup(0, rectChunks[chunkIndex].bindGroup);
      pass.draw(6 * chunkRectCount);
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
