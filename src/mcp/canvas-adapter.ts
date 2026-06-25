import type { CanvasShape, EmptySpaceQuery, SceneQuery } from "./bridge";

export type BlitzMcpExports = {
  memory: WebAssembly.Memory;
  blitz_create_rect(...args: number[]): number;
  blitz_create_circle(...args: number[]): number;
  blitz_create_triangle(...args: number[]): number;
  blitz_text_input_ptr(): number;
  blitz_text_input_capacity(): number;
  blitz_create_text(...args: number[]): number;
  blitz_last_created_object_id_ptr(): number;
  blitz_delete_selected(): void;
  blitz_history_begin(): void;
  blitz_history_commit(): void;
  blitz_has_selection(): number;
  blitz_uniform_ptr(): number;
  blitz_uniform_f32_count(): number;
  blitz_entity_count(): number;
  blitz_selected_count(): number;
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
};

type CanvasAdapterOptions = {
  stopDragging(): void;
  updateSelectionState(): void;
};

type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type SceneObject = Bounds & {
  id: string;
  type: "rect" | "triangle" | "circle" | "text";
  order: number;
  selected: boolean;
  backgroundColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  centerX?: number;
  centerY?: number;
  radius?: number;
  text?: string;
  fontSize?: number;
  color?: string;
};

const INVALID_ENTITY = 0xffffffff;
const MAX_SCENE_QUERY_ITEMS = 65536;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function formatObjectId(words: ArrayLike<number>): string {
  const hex = (value: number) => (value >>> 0).toString(16).padStart(8, "0");
  return `${hex(words[0])}${hex(words[1])}:${hex(words[2])}${hex(words[3])}`;
}

function parseColor(value: string): [number, number, number, number] {
  const red = Number.parseInt(value.slice(1, 3), 16) / 255;
  const green = Number.parseInt(value.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(value.slice(5, 7), 16) / 255;
  const alpha = value.length === 9 ? Number.parseInt(value.slice(7, 9), 16) / 255 : 1;
  return [red, green, blue, alpha];
}

function colorToHex(red: number, green: number, blue: number, alpha: number): string {
  const byte = (value: number) =>
    Math.round(Math.min(1, Math.max(0, value)) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  const rgb = `#${byte(red)}${byte(green)}${byte(blue)}`;
  return alpha >= 0.999 ? rgb : `${rgb}${byte(alpha)}`;
}

function overlaps(left: Bounds, right: Bounds, padding: number): boolean {
  return (
    left.x < right.x + right.width + padding &&
    left.x + left.width > right.x - padding &&
    left.y < right.y + right.height + padding &&
    left.y + left.height > right.y - padding
  );
}

export function createCanvasMcpAdapter(wasm: BlitzMcpExports, options: CanvasAdapterOptions) {
  const getState = () => {
    const values = new Float32Array(
      wasm.memory.buffer,
      wasm.blitz_uniform_ptr(),
      wasm.blitz_uniform_f32_count(),
    );
    return {
      entities: wasm.blitz_entity_count(),
      selected: wasm.blitz_selected_count(),
      camera: {
        x: values[2],
        y: values[3],
        zoom: values[4],
      },
      viewport: {
        width: values[0],
        height: values[1],
      },
    };
  };

  const viewportBounds = (): Bounds => {
    const state = getState();
    const width = state.viewport.width / state.camera.zoom;
    const height = state.viewport.height / state.camera.zoom;
    return {
      x: state.camera.x - width * 0.5,
      y: state.camera.y - height * 0.5,
      width,
      height,
    };
  };

  const lastCreatedObjectId = (): string => {
    const ptr = wasm.blitz_last_created_object_id_ptr();
    const words = new Uint32Array(wasm.memory.buffer, ptr, 4);
    return formatObjectId(words);
  };

  const addShape = (shape: CanvasShape): string => {
    let entity: number;
    if (shape.type === "text") {
      const encoded = textEncoder.encode(shape.text);
      const capacity = wasm.blitz_text_input_capacity();
      if (encoded.byteLength >= capacity) {
        throw new Error(`Text exceeds the ${capacity - 1} byte UTF-8 limit.`);
      }
      new Uint8Array(wasm.memory.buffer, wasm.blitz_text_input_ptr(), encoded.byteLength).set(encoded);
      const [red, green, blue, alpha] = parseColor(shape.color);
      entity = wasm.blitz_create_text(
        shape.x,
        shape.y,
        shape.fontSize,
        red,
        green,
        blue,
        alpha,
        encoded.byteLength,
      );
    } else {
      const fill = parseColor(shape.backgroundColor);
      const stroke = parseColor(shape.strokeColor);
      if (shape.type === "circle") {
        entity = wasm.blitz_create_circle(
          shape.x,
          shape.y,
          shape.radius,
          ...fill,
          ...stroke,
          shape.strokeWidth,
        );
      } else {
        const create =
          shape.type === "rect" ? wasm.blitz_create_rect : wasm.blitz_create_triangle;
        entity = create(
          shape.x,
          shape.y,
          shape.width,
          shape.height,
          ...fill,
          ...stroke,
          shape.strokeWidth,
        );
      }
    }
    if ((entity >>> 0) === INVALID_ENTITY) {
      throw new Error("Blitz could not allocate the requested shape.");
    }
    return lastCreatedObjectId();
  };

  const queryScene = (bounds: Bounds, limit: number) => {
    wasm.blitz_query_scene(
      bounds.x,
      bounds.y,
      bounds.x + bounds.width,
      bounds.y + bounds.height,
      limit,
    );
    const count = wasm.blitz_scene_query_count();
    const total = wasm.blitz_scene_query_total();
    const itemBytes = wasm.blitz_scene_query_item_bytes();
    const base = wasm.blitz_scene_query_ptr();
    const view = new DataView(wasm.memory.buffer);
    const objects: SceneObject[] = [];
    const kinds = ["rect", "triangle", "circle", "text"] as const;

    for (let index = 0; index < count; index += 1) {
      const offset = base + index * itemBytes;
      const id = formatObjectId([
        view.getUint32(offset, true),
        view.getUint32(offset + 4, true),
        view.getUint32(offset + 8, true),
        view.getUint32(offset + 12, true),
      ]);
      const kind = view.getUint32(offset + 16, true);
      const type = kinds[kind];
      if (!type) {
        continue;
      }
      const object: SceneObject = {
        id,
        type,
        order: view.getUint32(offset + 20, true),
        selected: view.getUint32(offset + 24, true) !== 0,
        x: view.getFloat32(offset + 40, true),
        y: view.getFloat32(offset + 44, true),
        width: view.getFloat32(offset + 48, true),
        height: view.getFloat32(offset + 52, true),
      };
      const fill = colorToHex(
        view.getFloat32(offset + 56, true),
        view.getFloat32(offset + 60, true),
        view.getFloat32(offset + 64, true),
        view.getFloat32(offset + 68, true),
      );
      if (type === "text") {
        const textPtr = view.getUint32(offset + 28, true);
        const textLength = view.getUint32(offset + 32, true);
        object.text = textDecoder.decode(
          new Uint8Array(wasm.memory.buffer, textPtr, textLength),
        );
        object.fontSize = view.getFloat32(offset + 92, true);
        object.color = fill;
      } else {
        object.backgroundColor = fill;
        object.strokeColor = colorToHex(
          view.getFloat32(offset + 72, true),
          view.getFloat32(offset + 76, true),
          view.getFloat32(offset + 80, true),
          view.getFloat32(offset + 84, true),
        );
        object.strokeWidth = view.getFloat32(offset + 88, true);
        if (type === "circle") {
          object.centerX = object.x + object.width * 0.5;
          object.centerY = object.y + object.height * 0.5;
          object.radius = Math.min(object.width, object.height) * 0.5;
        }
      }
      objects.push(object);
    }

    return {
      bounds,
      objects,
      returned: objects.length,
      total,
      truncated: total > objects.length,
    };
  };

  return {
    addShapes(shapes: CanvasShape[]) {
      options.stopDragging();
      wasm.blitz_history_begin();
      let ids: string[];
      try {
        ids = shapes.map((shape) => {
          return addShape(shape);
        });
      } finally {
        wasm.blitz_history_commit();
      }
      options.updateSelectionState();
      return { added: ids.length, ids, ...getState() };
    },

    deleteSelected() {
      const deleted = wasm.blitz_selected_count();
      if (wasm.blitz_has_selection() !== 0) {
        options.stopDragging();
        wasm.blitz_delete_selected();
        options.updateSelectionState();
      }
      return { deleted, ...getState() };
    },

    getState,

    getScene(query: SceneQuery) {
      const bounds = query.bounds ?? viewportBounds();
      return queryScene(bounds, query.limit);
    },

    findEmptySpace(query: EmptySpaceQuery) {
      const bounds = viewportBounds();
      if (query.width > bounds.width || query.height > bounds.height) {
        return { found: false, reason: "Requested area is larger than the viewport.", bounds };
      }
      const scene = queryScene(bounds, MAX_SCENE_QUERY_ITEMS);
      if (scene.truncated) {
        return {
          found: false,
          reason: "Too many visible objects to prove that a space is empty.",
          occupiedObjects: scene.total,
          bounds,
        };
      }

      const viewportArea = bounds.width * bounds.height;
      const occupied = query.ignoreLargeBackgrounds
        ? scene.objects.filter(
            (object) => (object.width * object.height) / viewportArea < 0.8,
          )
        : scene.objects;
      const step = Math.max(8, Math.min(query.width, query.height) * 0.25, query.padding);
      const candidates: Array<Bounds & { distance: number }> = [];
      const maxX = bounds.x + bounds.width - query.width;
      const maxY = bounds.y + bounds.height - query.height;
      const centerX = bounds.x + bounds.width * 0.5;
      const centerY = bounds.y + bounds.height * 0.5;
      for (let y = bounds.y; y <= maxY + 0.001; y += step) {
        for (let x = bounds.x; x <= maxX + 0.001; x += step) {
          const candidate = { x: Math.min(x, maxX), y: Math.min(y, maxY), width: query.width, height: query.height };
          const dx = candidate.x + candidate.width * 0.5 - centerX;
          const dy = candidate.y + candidate.height * 0.5 - centerY;
          candidates.push({ ...candidate, distance: dx * dx + dy * dy });
        }
      }
      candidates.sort((left, right) => left.distance - right.distance);
      const candidate = candidates.find((area) =>
        occupied.every((object) => !overlaps(area, object, query.padding)),
      );
      if (!candidate) {
        return {
          found: false,
          reason: "No empty area of the requested size exists in the viewport.",
          occupiedObjects: occupied.length,
          ignoredLargeBackgrounds: scene.objects.length - occupied.length,
          bounds,
        };
      }
      return {
        found: true,
        x: candidate.x,
        y: candidate.y,
        width: candidate.width,
        height: candidate.height,
        padding: query.padding,
        occupiedObjects: occupied.length,
        ignoredLargeBackgrounds: scene.objects.length - occupied.length,
        bounds,
      };
    },
  };
}
