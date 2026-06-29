import type {
  CanvasShape,
  CanvasObjectUpdate,
  EmptySpaceQuery,
  SceneQuery,
  TextMeasurementRequest,
} from "./bridge";

export type BlitzMcpExports = {
  memory: WebAssembly.Memory;
  blitz_create_rect(...args: number[]): number;
  blitz_create_circle(...args: number[]): number;
  blitz_create_triangle(...args: number[]): number;
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
  blitz_create_text(...args: number[]): number;
  blitz_update_object(...args: number[]): number;
  blitz_last_created_object_id_ptr(): number;
  blitz_delete_selected(): void;
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
  beginHistory(): void;
  commitHistory(): void;
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
  type: "rect" | "frame" | "triangle" | "circle" | "text";
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
  titleColor?: string;
  maxWidth?: number;
  lineHeight?: number;
  maxLines?: number;
  align?: "left" | "center" | "right";
  color?: string;
};

const INVALID_ENTITY = 0xffffffff;
const MAX_SCENE_QUERY_ITEMS = 65536;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const UPDATE_X = 1;
const UPDATE_Y = 2;
const UPDATE_WIDTH = 4;
const UPDATE_HEIGHT = 8;
const UPDATE_FILL = 16;
const UPDATE_STROKE = 32;
const UPDATE_STROKE_WIDTH = 64;
const UPDATE_TEXT = 128;
const UPDATE_FONT_SIZE = 256;
const UPDATE_TEXT_COLOR = 512;
const UPDATE_MAX_WIDTH = 1024;
const UPDATE_LINE_HEIGHT = 2048;
const UPDATE_MAX_LINES = 4096;
const UPDATE_ALIGN = 8192;

function formatObjectId(words: ArrayLike<number>): string {
  const hex = (value: number) => (value >>> 0).toString(16).padStart(8, "0");
  return `${hex(words[0])}${hex(words[1])}:${hex(words[2])}${hex(words[3])}`;
}

function parseObjectId(value: string): [number, number, number, number] {
  const compact = value.replace(":", "");
  return [0, 8, 16, 24].map((offset) =>
    Number.parseInt(compact.slice(offset, offset + 8), 16),
  ) as [number, number, number, number];
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
  const glyphCodepoints = Array.from(
    { length: wasm.blitz_font_glyph_count() },
    (_value, index) => wasm.blitz_font_glyph_codepoint(index),
  );
  const glyphCodepointSet = new Set(glyphCodepoints);
  const glyphRanges = glyphCodepoints.reduce<Array<{ start: number; end: number }>>(
    (ranges, codepoint) => {
      const previous = ranges.at(-1);
      if (previous && codepoint === previous.end + 1) {
        previous.end = codepoint;
      } else {
        ranges.push({ start: codepoint, end: codepoint });
      }
      return ranges;
    },
    [],
  );

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

  const writeTextInput = (text: string): number => {
    const encoded = textEncoder.encode(text);
    const capacity = wasm.blitz_text_input_capacity();
    if (encoded.byteLength >= capacity) {
      throw new Error(`Text exceeds the ${capacity - 1} byte UTF-8 limit.`);
    }
    new Uint8Array(wasm.memory.buffer, wasm.blitz_text_input_ptr(), encoded.byteLength).set(encoded);
    return encoded.byteLength;
  };

  const addShape = (shape: CanvasShape): string => {
    let entity: number;
    if (shape.type === "text") {
      const textLength = writeTextInput(shape.text);
      const unsupported = [
        ...new Set(
          Array.from(shape.text)
            .map((character) => character.codePointAt(0) ?? 0)
            .filter((codepoint) => !glyphCodepointSet.has(codepoint)),
        ),
      ];
      if (unsupported.length > 0) {
        throw new Error(
          `Text contains unsupported glyphs: ${unsupported
            .map((codepoint) => `U+${codepoint.toString(16).toUpperCase().padStart(4, "0")}`)
            .join(", ")}.`,
        );
      }
      const resolvedMaxWidth = shape.box
        ? shape.box.width - shape.box.padding * 2 - 8
        : shape.maxWidth;
      wasm.blitz_layout_text(
        textLength,
        shape.fontSize,
        resolvedMaxWidth ?? 0,
        shape.lineHeight ?? wasm.blitz_font_line_height(),
        shape.maxLines ?? 0,
      );
      if (wasm.blitz_text_layout_overflow() !== 0) {
        throw new Error("Text exceeds maxLines. Shorten it, increase maxWidth, or increase maxLines.");
      }
      const objectHeight = wasm.blitz_text_layout_height() + 8;
      let x = shape.x ?? 0;
      let y = shape.y ?? 0;
      if (shape.box) {
        const availableHeight = shape.box.height - shape.box.padding * 2;
        const capHeight = wasm.blitz_font_cap_height() * shape.fontSize;
        if (
          shape.box.verticalAlign !== "cap-middle" &&
          objectHeight > availableHeight + 0.001
        ) {
          throw new Error(
            `Text does not fit its box height (${objectHeight.toFixed(2)} > ${availableHeight.toFixed(2)}).`,
          );
        }
        const verticalOffset =
          shape.box.verticalAlign === "cap-middle"
            ? (availableHeight + capHeight) * 0.5 -
              wasm.blitz_font_ascender() * shape.fontSize -
              4
            : shape.box.verticalAlign === "middle"
              ? (availableHeight - objectHeight) * 0.5
              : shape.box.verticalAlign === "bottom"
                ? availableHeight - objectHeight
                : 0;
        x = shape.box.x + shape.box.padding + 4;
        y = shape.box.y + shape.box.padding + verticalOffset + 4;
      }
      const [red, green, blue, alpha] = parseColor(shape.color);
      entity = wasm.blitz_create_text(
        x,
        y,
        shape.fontSize,
        red,
        green,
        blue,
        alpha,
        textLength,
        resolvedMaxWidth ?? 0,
        shape.lineHeight ?? wasm.blitz_font_line_height(),
        shape.maxLines ?? 0,
        shape.align === "center" ? 1 : shape.align === "right" ? 2 : 0,
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

  const updateObject = (update: CanvasObjectUpdate): void => {
    let flags = 0;
    if (update.x !== undefined) flags |= UPDATE_X;
    if (update.y !== undefined) flags |= UPDATE_Y;
    let width = 0;
    let height = 0;
    let fill = [0, 0, 0, 0] as [number, number, number, number];
    let stroke = [0, 0, 0, 0] as [number, number, number, number];
    let strokeWidth = 0;
    let textLength = 0;
    let fontSize = 0;
    let textColor = [0, 0, 0, 0] as [number, number, number, number];
    let maxWidth = 0;
    let lineHeight = 0;
    let maxLines = 0;
    let align = 0;

    if (update.type === "circle") {
      if (update.radius !== undefined) {
        flags |= UPDATE_WIDTH;
        width = update.radius * 2;
      }
    } else if (update.type === "rect" || update.type === "triangle") {
      if (update.width !== undefined) {
        flags |= UPDATE_WIDTH;
        width = update.width;
      }
      if (update.height !== undefined) {
        flags |= UPDATE_HEIGHT;
        height = update.height;
      }
    }
    if (update.type !== "text") {
      if (update.backgroundColor !== undefined) {
        flags |= UPDATE_FILL;
        fill = parseColor(update.backgroundColor);
      }
      if (update.strokeColor !== undefined) {
        flags |= UPDATE_STROKE;
        stroke = parseColor(update.strokeColor);
      }
      if (update.strokeWidth !== undefined) {
        flags |= UPDATE_STROKE_WIDTH;
        strokeWidth = update.strokeWidth;
      }
    } else {
      if (update.text !== undefined) {
        const unsupported = [
          ...new Set(
            Array.from(update.text)
              .map((character) => character.codePointAt(0) ?? 0)
              .filter((codepoint) => !glyphCodepointSet.has(codepoint)),
          ),
        ];
        if (unsupported.length > 0) {
          throw new Error(
            `Text contains unsupported glyphs: ${unsupported
              .map((codepoint) => `U+${codepoint.toString(16).toUpperCase().padStart(4, "0")}`)
              .join(", ")}.`,
          );
        }
        flags |= UPDATE_TEXT;
        textLength = writeTextInput(update.text);
      }
      if (update.fontSize !== undefined) {
        flags |= UPDATE_FONT_SIZE;
        fontSize = update.fontSize;
      }
      if (update.color !== undefined) {
        flags |= UPDATE_TEXT_COLOR;
        textColor = parseColor(update.color);
      }
      if (update.maxWidth !== undefined) {
        flags |= UPDATE_MAX_WIDTH;
        maxWidth = update.maxWidth ?? 0;
      }
      if (update.lineHeight !== undefined) {
        flags |= UPDATE_LINE_HEIGHT;
        lineHeight = update.lineHeight;
      }
      if (update.maxLines !== undefined) {
        flags |= UPDATE_MAX_LINES;
        maxLines = update.maxLines;
      }
      if (update.align !== undefined) {
        flags |= UPDATE_ALIGN;
        align = update.align === "center" ? 1 : update.align === "right" ? 2 : 0;
      }
    }
    if (flags === 0) {
      throw new Error(`Object ${update.id} update does not contain any changes.`);
    }
    const kind = update.type === "rect" ? 0 : update.type === "triangle" ? 1 : update.type === "circle" ? 2 : 3;
    const result = wasm.blitz_update_object(
      ...parseObjectId(update.id),
      kind,
      flags,
      update.x ?? 0,
      update.y ?? 0,
      width,
      height,
      ...fill,
      ...stroke,
      strokeWidth,
      fontSize,
      ...textColor,
      textLength,
      maxWidth,
      lineHeight,
      maxLines,
      align,
    );
    const messages = [
      "",
      `Object ${update.id} was not found.`,
      `Object ${update.id} is not a ${update.type}.`,
      `Object ${update.id} contains invalid update values.`,
      `Blitz could not allocate updated text for ${update.id}.`,
      `Updated text for ${update.id} exceeds maxLines.`,
    ];
    if (result !== 0) {
      throw new Error(messages[result] ?? `Object ${update.id} update failed.`);
    }
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
    const kinds = ["rect", "triangle", "circle", "text", "frame"] as const;

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
      if (type === "text" || type === "frame") {
        const textPtr = view.getUint32(offset + 28, true);
        const textLength = view.getUint32(offset + 32, true);
        object.text = textDecoder.decode(
          new Uint8Array(wasm.memory.buffer, textPtr, textLength),
        );
        object.fontSize = view.getFloat32(offset + 92, true);
      }
      if (type === "frame") {
        object.titleColor = colorToHex(
          view.getFloat32(offset + 96, true),
          view.getFloat32(offset + 100, true),
          view.getFloat32(offset + 104, true),
          view.getFloat32(offset + 108, true),
        );
      }
      if (type === "text") {
        const maxWidth = view.getFloat32(offset + 96, true);
        object.maxWidth = maxWidth > 0 ? maxWidth : undefined;
        object.lineHeight = view.getFloat32(offset + 100, true);
        object.maxLines = view.getFloat32(offset + 104, true);
        object.align = ["left", "center", "right"][
          Math.round(view.getFloat32(offset + 108, true))
        ] as
          | "left"
          | "center"
          | "right";
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
      options.beginHistory();
      let ids: string[];
      try {
        ids = shapes.map((shape) => {
          return addShape(shape);
        });
      } finally {
        options.commitHistory();
      }
      options.updateSelectionState();
      return { added: ids.length, ids, ...getState() };
    },

    updateObjects(updates: CanvasObjectUpdate[]) {
      options.stopDragging();
      options.beginHistory();
      try {
        updates.forEach(updateObject);
      } finally {
        options.commitHistory();
      }
      options.updateSelectionState();
      return { updated: updates.length, ids: updates.map(({ id }) => id), ...getState() };
    },

    deleteSelected() {
      const deleted = wasm.blitz_selected_count();
      if (wasm.blitz_has_selection() !== 0) {
        options.stopDragging();
        options.beginHistory();
        try {
          wasm.blitz_delete_selected();
        } finally {
          options.commitHistory();
        }
        options.updateSelectionState();
      }
      return { deleted, ...getState() };
    },

    getState,

    getTextCapabilities() {
      return {
        glyphCount: glyphCodepoints.length,
        replacementCodepoint: 0xfffd,
        replacementCharacter: "\uFFFD",
        metrics: {
          ascenderRatio: wasm.blitz_font_ascender(),
          descenderRatio: wasm.blitz_font_descender(),
          defaultLineHeightRatio: wasm.blitz_font_line_height(),
          capHeightRatio: wasm.blitz_font_cap_height(),
          xHeightRatio: wasm.blitz_font_x_height(),
          objectPadding: 4,
        },
        unsupportedBehavior:
          "Unsupported Unicode code points render and measure as the replacement character.",
        ranges: glyphRanges.map(({ start, end }) => ({
          start,
          end,
          startHex: `U+${start.toString(16).toUpperCase().padStart(4, "0")}`,
          endHex: `U+${end.toString(16).toUpperCase().padStart(4, "0")}`,
        })),
      };
    },

    measureText(requests: TextMeasurementRequest[]) {
      const ascenderRatio = wasm.blitz_font_ascender();
      const descenderRatio = wasm.blitz_font_descender();
      const capHeightRatio = wasm.blitz_font_cap_height();
      const xHeightRatio = wasm.blitz_font_x_height();
      return {
        items: requests.map(
          ({ text, fontSize, maxWidth, lineHeight, maxLines, align, box }) => {
          const resolvedLineHeight = lineHeight ?? wasm.blitz_font_line_height();
          const resolvedMaxLines = maxLines ?? 0;
          const resolvedAlign = align ?? "left";
          const resolvedMaxWidth = box
            ? box.width - box.padding * 2 - 8
            : maxWidth;
          const unsupportedGlyphs = [
            ...new Map(
              Array.from(text)
                .map((character) => ({
                  character,
                  codepoint: character.codePointAt(0) ?? 0,
                }))
                .filter(({ codepoint }) => !glyphCodepointSet.has(codepoint))
                .map((glyph) => [glyph.codepoint, glyph]),
            ).values(),
          ].map(({ character, codepoint }) => ({
            character,
            codepoint,
            hex: `U+${codepoint.toString(16).toUpperCase().padStart(4, "0")}`,
          }));
          const textLength = writeTextInput(text);
          const lineCount = wasm.blitz_layout_text(
            textLength,
            fontSize,
            resolvedMaxWidth ?? 0,
            resolvedLineHeight,
            resolvedMaxLines,
          );
          const layoutPtr = wasm.blitz_text_layout_ptr();
          const lineBytes = wasm.blitz_text_layout_line_bytes();
          const layoutView = new DataView(wasm.memory.buffer);
          const encoded = textEncoder.encode(text);
          const lines = Array.from({ length: lineCount }, (_value, index) => {
            const offset = layoutPtr + index * lineBytes;
            const start = layoutView.getUint32(offset, true);
            const length = layoutView.getUint32(offset + 4, true);
            return {
              text: textDecoder.decode(encoded.subarray(start, start + length)),
              width: layoutView.getFloat32(offset + 8, true),
            };
          });
          const width = wasm.blitz_text_layout_width();
          const height = wasm.blitz_text_layout_height();
          const containerWidth = resolvedMaxWidth ?? width;
          const ascender = ascenderRatio * fontSize;
          const descender = descenderRatio * fontSize;
          const lineAdvance = resolvedLineHeight * fontSize;
          const padding = 4;
          const boundsWidth = containerWidth + padding * 2;
          const boundsHeight = height + padding * 2;
          let placement:
            | {
                x: number;
                y: number;
                objectX: number;
                objectY: number;
              }
            | undefined;
          let fitsBox = true;
          if (box) {
            const availableHeight = box.height - box.padding * 2;
            fitsBox =
              box.verticalAlign === "cap-middle"
                ? capHeightRatio * fontSize <= availableHeight + 0.001
                : boundsHeight <= availableHeight + 0.001;
            const verticalOffset =
              box.verticalAlign === "cap-middle"
                ? (availableHeight + capHeightRatio * fontSize) * 0.5 -
                  ascender -
                  padding
                : box.verticalAlign === "middle"
                  ? (availableHeight - boundsHeight) * 0.5
                  : box.verticalAlign === "bottom"
                    ? availableHeight - boundsHeight
                    : 0;
            placement = {
              x: box.x + box.padding + padding,
              y: box.y + box.padding + verticalOffset + padding,
              objectX: box.x + box.padding,
              objectY: box.y + box.padding + verticalOffset,
            };
          }
          return {
            text,
            fontSize,
            maxWidth: resolvedMaxWidth,
            lineHeight: resolvedLineHeight,
            maxLines: resolvedMaxLines,
            align: resolvedAlign,
            width,
            height,
            containerWidth,
            boundsWidth,
            boundsHeight,
            box,
            fitsBox,
            placement,
            ascender,
            descender,
            capHeight: capHeightRatio * fontSize,
            xHeight: xHeightRatio * fontSize,
            lineAdvance,
            baselineOffset: ascender,
            firstBaseline: ascender,
            lastBaseline: ascender + Math.max(0, lineCount - 1) * lineAdvance,
            objectInsets: {
              left: padding,
              top: padding,
              right: padding,
              bottom: padding,
            },
            firstBaselineFromObjectTop: padding + ascender,
            lastBaselineFromObjectTop:
              padding + ascender + Math.max(0, lineCount - 1) * lineAdvance,
            lineCount,
            lines,
            overflow: wasm.blitz_text_layout_overflow() !== 0,
            supported: unsupportedGlyphs.length === 0,
            unsupportedGlyphs,
          };
        }),
      };
    },

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
