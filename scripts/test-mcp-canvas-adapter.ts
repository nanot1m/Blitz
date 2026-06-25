import { readFile } from "node:fs/promises";
import { createCanvasMcpAdapter, type BlitzMcpExports } from "../src/mcp/canvas-adapter";

const bytes = await readFile("public/blitz.wasm");
const { instance } = await WebAssembly.instantiate(bytes, {});
const wasm = instance.exports as unknown as BlitzMcpExports & {
  blitz_init(): void;
  blitz_resize(width: number, height: number): void;
};
wasm.blitz_init();
wasm.blitz_resize(1200, 675);

const adapter = createCanvasMcpAdapter(wasm, {
  beginHistory() {},
  commitHistory() {},
  stopDragging() {},
  updateSelectionState() {},
});

const added = adapter.addShapes([
  {
    type: "rect",
    x: 2000,
    y: 2100,
    width: 240,
    height: 120,
    backgroundColor: "#3366CC80",
    strokeColor: "#112233",
    strokeWidth: 4,
  },
  {
    type: "text",
    text: "Scene query text",
    fontSize: 42,
    color: "#FFFFFF",
    lineHeight: 1.4,
    maxLines: 3,
    align: "center",
    box: {
      x: 2000,
      y: 2200,
      width: 220,
      height: 230,
      padding: 16,
      verticalAlign: "middle",
    },
  },
]);

const measurements = adapter.measureText([
  {
    text: "Scene query text",
    fontSize: 42,
    lineHeight: 1.4,
    maxLines: 3,
    align: "center",
    box: {
      x: 2000,
      y: 2200,
      width: 220,
      height: 230,
      padding: 16,
      verticalAlign: "middle",
    },
  },
  { text: "", fontSize: 30 },
  { text: "Unsupported 😀", fontSize: 24 },
  {
    text: "1",
    fontSize: 20,
    align: "center",
    box: {
      x: 500,
      y: 600,
      width: 44,
      height: 44,
      padding: 0,
      verticalAlign: "cap-middle",
    },
  },
]);
if (
  measurements.items.length !== 4 ||
  measurements.items[0].width <= 0 ||
  measurements.items[0].height <= 42 ||
  measurements.items[0].ascender <= 0 ||
  measurements.items[0].descender >= 0 ||
  measurements.items[0].capHeight <= measurements.items[0].xHeight ||
  measurements.items[0].firstBaselineFromObjectTop <= 4 ||
  measurements.items[0].lastBaselineFromObjectTop <=
    measurements.items[0].firstBaselineFromObjectTop ||
  measurements.items[0].placement?.objectX !== 2016 ||
  measurements.items[0].placement?.objectY <= 2216 ||
  !measurements.items[0].fitsBox ||
  measurements.items[0].lineCount < 2 ||
  measurements.items[0].overflow ||
  measurements.items[0].supported !== true ||
  measurements.items[1].width !== 0 ||
  measurements.items[2].supported !== false ||
  measurements.items[2].unsupportedGlyphs[0]?.hex !== "U+1F600" ||
  !measurements.items[3].fitsBox ||
  Math.abs(
    (measurements.items[3].placement!.y + measurements.items[3].ascender -
      measurements.items[3].capHeight * 0.5) -
      622,
  ) > 0.001
) {
  throw new Error(`Unexpected text measurements: ${JSON.stringify(measurements)}`);
}
const textCapabilities = adapter.getTextCapabilities();
if (
  textCapabilities.glyphCount < 900 ||
  textCapabilities.replacementCodepoint !== 0xfffd ||
  textCapabilities.metrics.capHeightRatio <= textCapabilities.metrics.xHeightRatio ||
  textCapabilities.metrics.objectPadding !== 4 ||
  !textCapabilities.ranges.some((range) => range.start <= 65 && range.end >= 90)
) {
  throw new Error(`Unexpected text capabilities: ${JSON.stringify(textCapabilities)}`);
}
try {
  adapter.addShapes([
    {
      type: "text",
      x: 0,
      y: 0,
      text: "This text must wrap beyond one line",
      fontSize: 30,
      color: "#FFFFFF",
      maxWidth: 80,
      maxLines: 1,
    },
  ]);
  throw new Error("Expected overflowing constrained text to be rejected.");
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes("maxLines")) {
    throw error;
  }
}
if (added.added !== 2 || added.ids.length !== 2) {
  throw new Error(`Unexpected add result: ${JSON.stringify(added)}`);
}
if (
  added.ids[0] === added.ids[1] ||
  !added.ids.every((id) => /^[0-9a-f]{16}:[0-9a-f]{16}$/.test(id))
) {
  throw new Error(`Object IDs were not returned as unique 128-bit strings: ${added.ids.join(", ")}`);
}

const updated = adapter.updateObjects([
  {
    id: added.ids[0],
    type: "rect",
    x: 1980,
    width: 280,
    backgroundColor: "#8844CC",
  },
  {
    id: added.ids[1],
    type: "text",
    text: "Updated text wraps across lines",
    x: 2040,
    maxWidth: 150,
    lineHeight: 1.5,
    maxLines: 8,
    align: "right",
    color: "#CCFFEE",
  },
]);
if (updated.updated !== 2 || updated.ids.join(",") !== added.ids.join(",")) {
  throw new Error(`Unexpected update result: ${JSON.stringify(updated)}`);
}

const scene = adapter.getScene({
  bounds: { x: 1900, y: 2000, width: 500, height: 400 },
  limit: 10,
});
if (
  scene.returned !== 2 ||
  scene.total !== 2 ||
  scene.truncated ||
  scene.objects[0]?.backgroundColor !== "#8844CC" ||
  scene.objects[0]?.width !== 280 ||
  scene.objects[1]?.text !== "Updated text wraps across lines" ||
  scene.objects[1]?.maxWidth !== 150 ||
  scene.objects[1]?.align !== "right"
) {
  throw new Error(`Unexpected scene query: ${JSON.stringify(scene)}`);
}
const createdText = scene.objects[1];
if (
  !createdText ||
  Math.abs(createdText.width - 158) > 0.001 ||
  createdText.height <= 8
) {
  throw new Error(
    `Updated text bounds are invalid: ${JSON.stringify(createdText)}`,
  );
}

const empty = adapter.findEmptySpace({
  width: 120,
  height: 80,
  padding: 16,
  scope: "viewport",
  ignoreLargeBackgrounds: true,
});
if (!empty.found) {
  throw new Error(`Expected empty viewport space: ${JSON.stringify(empty)}`);
}

console.log("Canvas MCP adapter test passed.");
